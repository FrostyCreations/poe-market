import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// Files the site is allowed to read and write. They live in data/user/ in the repo.
export const USER_FILES = ['watchlist', 'portfolio', 'builds', 'notes'];

export const adminConfigured = () => Boolean((process.env.ADMIN_PASSWORD || '').trim());

export function isAdmin(req) {
  // Trim both sides: a pasted password often carries a stray space or newline.
  const expected = (process.env.ADMIN_PASSWORD || '').trim();
  let given = String(req.headers['x-admin-key'] || '');
  try { given = decodeURIComponent(given); } catch {}
  given = given.trim();
  if (!expected || !given) return false;
  const a = crypto.createHash('sha256').update(expected).digest();
  const b = crypto.createHash('sha256').update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

const repo = () => process.env.GITHUB_REPO; // e.g. FrostyCreations/poe-market
const branch = () => process.env.GITHUB_BRANCH || 'main';
const token = () => process.env.GITHUB_TOKEN;

export function githubConfigured() {
  return Boolean(repo() && token());
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'poe-market-dashboard',
  };
}

const filePath = (name) => `data/user/${name}.json`;

// Reads a user data file. Uses GitHub when configured (always the latest
// committed version), otherwise the copy bundled with the deployment.
export async function readUserFile(name) {
  if (githubConfigured()) {
    const url = `https://api.github.com/repos/${repo()}/contents/${filePath(name)}?ref=${branch()}`;
    const r = await fetch(url, { headers: ghHeaders(), cache: 'no-store' });
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new Error(`GitHub read failed: ${r.status} ${await r.text()}`);
    const j = await r.json();
    const text = Buffer.from(j.content, 'base64').toString('utf8');
    return { data: JSON.parse(text), sha: j.sha };
  }
  try {
    const text = await fs.readFile(path.join(process.cwd(), filePath(name)), 'utf8');
    return { data: JSON.parse(text), sha: null };
  } catch {
    return { data: null, sha: null };
  }
}

export async function writeUserFile(name, data, message) {
  const content = JSON.stringify(data, null, 2) + '\n';
  if (!githubConfigured()) {
    // Local development: write straight to disk.
    await fs.mkdir(path.join(process.cwd(), 'data/user'), { recursive: true });
    await fs.writeFile(path.join(process.cwd(), filePath(name)), content);
    return { ok: true, local: true };
  }
  const { sha } = await readUserFile(name);
  const url = `https://api.github.com/repos/${repo()}/contents/${filePath(name)}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message || `Update ${name}`,
      content: Buffer.from(content).toString('base64'),
      branch: branch(),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) throw new Error(`GitHub write failed: ${r.status} ${await r.text()}`);
  return { ok: true };
}
