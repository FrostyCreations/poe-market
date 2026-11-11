import { USER_FILES, json, isAdmin, readUserFile, writeUserFile, githubConfigured } from '../../cf/lib.js';

// GET  /api/data?file=watchlist          -> anyone can read
// PUT  /api/data?file=watchlist  (JSON)  -> admin only, commits to GitHub
export async function onRequest({ request, env }) {
  const file = new URL(request.url).searchParams.get('file') || '';
  if (!USER_FILES.includes(file)) return json({ error: `Unknown file. Use one of: ${USER_FILES.join(', ')}` }, 400);
  try {
    if (request.method === 'GET') {
      const { data } = await readUserFile(file, env, request);
      return json({ data: data ?? [], storage: githubConfigured(env) ? 'github' : 'local' });
    }
    if (request.method === 'PUT' || request.method === 'POST') {
      if (!(await isAdmin(request, env))) return json({ error: 'Admin password required' }, 401);
      const body = await request.json().catch(() => null);
      if (!body || !('data' in body)) return json({ error: 'Body must be { data: ... }' }, 400);
      if (JSON.stringify(body.data).length > 900_000) return json({ error: 'Data too large' }, 413);
      return json(await writeUserFile(file, body.data, body.message, env, request));
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
