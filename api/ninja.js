// Proxy for the poe.ninja API. poe.ninja does not send CORS headers, so the
// browser cannot call it directly. This function forwards whitelisted GET
// requests and lets Vercel's CDN cache the answers for a while.

const ALLOWED = [
  /^poe[12]\/api\/data\/(index-state|build-index-state)$/,
  /^poe[12]\/api\/economy\/exchange\/current\/(overview|details)$/,
  /^poe1\/api\/economy\/stash\/current\/item\/(overview|history)$/,
];

export default async function handler(req, res) {
  const path = String(req.query.path || '').replace(/^\/+/, '');
  if (!ALLOWED.some((re) => re.test(path))) {
    res.status(400).json({ error: 'Path not allowed', path });
    return;
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'path') params.set(k, Array.isArray(v) ? v[0] : v);
  }
  const url = `https://poe.ninja/${path}?${params.toString()}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'poe-market-dashboard (personal tool)', Accept: 'application/json' },
    });
    const body = await r.text();
    const isHistory = /details|history/.test(path);
    // Prices refresh roughly hourly on poe.ninja; history only changes daily.
    const maxAge = isHistory ? 3600 : 600;
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 6}`);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'poe.ninja request failed', detail: String(e) });
  }
}
