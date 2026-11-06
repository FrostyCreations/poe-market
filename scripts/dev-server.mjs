// Local development server: serves the static site and runs the /api functions
// the same way Vercel does. Usage: node scripts/dev-server.mjs  (then open http://localhost:3000)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
    try {
      const mod = await import(path.join(root, 'api', `${name}.js`));
      req.query = Object.fromEntries(url.searchParams);
      let body = '';
      for await (const c of req) body += c;
      try { req.body = body ? JSON.parse(body) : undefined; } catch { req.body = body; }
      res.status = (n) => { res.statusCode = n; return res; };
      res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      res.send = (b) => res.end(b);
      await mod.default(req, res);
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e.stack || e));
    }
    return;
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  if (url.pathname === '/' ) file = path.join(root, 'index.html');
  try {
    const data = await fs.readFile(file);
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(port, () => console.log(`Exile Ledger running at http://localhost:${port}`));
