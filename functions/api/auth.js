import { json, isAdmin, githubConfigured, adminConfigured } from '../../cf/lib.js';

// POST /api/auth with header x-admin-key -> tells the browser if the password is right.
export async function onRequest({ request, env }) {
  return json({ admin: await isAdmin(request, env), passwordSet: adminConfigured(env), storage: githubConfigured(env) ? 'github' : 'local' });
}
