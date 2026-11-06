import { USER_FILES, isAdmin, readUserFile, writeUserFile, githubConfigured } from './_lib.js';

// GET  /api/data?file=watchlist          -> anyone can read
// PUT  /api/data?file=watchlist  (JSON)  -> admin only, commits to GitHub
export default async function handler(req, res) {
  const file = String(req.query.file || '');
  if (!USER_FILES.includes(file)) {
    res.status(400).json({ error: `Unknown file. Use one of: ${USER_FILES.join(', ')}` });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const { data } = await readUserFile(file);
      res.status(200).json({ data: data ?? [], storage: githubConfigured() ? 'github' : 'local' });
      return;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      if (!isAdmin(req)) {
        res.status(401).json({ error: 'Admin password required' });
        return;
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || !('data' in body)) {
        res.status(400).json({ error: 'Body must be { data: ... }' });
        return;
      }
      const size = JSON.stringify(body.data).length;
      if (size > 900_000) {
        res.status(413).json({ error: 'Data too large' });
        return;
      }
      const result = await writeUserFile(file, body.data, body.message);
      res.status(200).json(result);
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
