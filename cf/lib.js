// Shared helpers for the Cloudflare Pages Functions (same behaviour as api/_lib.js on Vercel).

// Files the site is allowed to read and write. They live in data/user/ in the repo.
export const USER_FILES = ['watchlist', 'portfolio', 'builds', 'notes'];

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

export const adminConfigured = (env) => Boolean((env.ADMIN_PASSWORD || '').trim());

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export async function isAdmin(request, env) {
  // Trim both sides: a pasted password often carries a stray space or newline.
  const expected = (env.ADMIN_PASSWORD || '').trim();
  let given = request.headers.get('x-admin-key') || '';
  try { given = decodeURIComponent(given); } catch {}
  given = given.trim();
  if (!expected || !given) return false;
  const [a, b] = await Promise.all([sha256(expected), sha256(given)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const githubConfigured = (env) => Boolean(env.GITHUB_REPO && env.GITHUB_TOKEN);

const ghHeaders = (env) => ({
  Authorization: `Bearer ${env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'poe-market-dashboard',
});

const filePath = (name) => `data/user/${name}.json`;

// base64 <-> UTF-8 text (atob/btoa only handle Latin-1).
const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const toB64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// Reads a user data file: from GitHub when configured (always the latest
// commit), otherwise the copy bundled with the deployment.
export async function readUserFile(name, env, request) {
  if (githubConfigured(env)) {
    const branch = env.GITHUB_BRANCH || 'main';
    const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath(name)}?ref=${branch}`;
    const r = await fetch(url, { headers: ghHeaders(env) });
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new Error(`GitHub read failed: ${r.status} ${await r.text()}`);
    const j = await r.json();
    return { data: JSON.parse(fromB64(j.content)), sha: j.sha };
  }
  try {
    const r = await env.ASSETS.fetch(new URL(`/${filePath(name)}`, request.url));
    return { data: r.ok ? await r.json() : null, sha: null };
  } catch {
    return { data: null, sha: null };
  }
}

export async function writeUserFile(name, data, message, env, request) {
  if (!githubConfigured(env)) throw new Error('Saving needs GITHUB_REPO and GITHUB_TOKEN to be set');
  const content = JSON.stringify(data, null, 2) + '\n';
  const { sha } = await readUserFile(name, env, request);
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath(name)}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message || `Update ${name}`,
      content: toB64(content),
      branch: env.GITHUB_BRANCH || 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) throw new Error(`GitHub write failed: ${r.status} ${await r.text()}`);
  return { ok: true };
}
