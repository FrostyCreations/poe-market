import { isAdmin, githubConfigured } from './_lib.js';

// POST /api/auth with header x-admin-key -> tells the browser if the password is right.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ admin: isAdmin(req), storage: githubConfigured() ? 'github' : 'local' });
}
