// Proxy for the poe.ninja API (poe.ninja sends no CORS headers). Forwards
// whitelisted GET requests and caches the answers at Cloudflare's edge.

const ALLOWED = [
  /^poe[12]\/api\/data\/(index-state|build-index-state)$/,
  /^poe[12]\/api\/economy\/exchange\/current\/(overview|details)$/,
  /^poe1\/api\/economy\/stash\/current\/item\/(overview|history)$/,
];

export async function onRequestGet({ request, waitUntil }) {
  const u = new URL(request.url);
  const path = (u.searchParams.get('path') || '').replace(/^\/+/, '');
  if (!ALLOWED.some((re) => re.test(path))) {
    return new Response(JSON.stringify({ error: 'Path not allowed', path }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const cache = caches.default;
  const cacheKey = new Request(u.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const params = new URLSearchParams(u.searchParams);
  params.delete('path');
  try {
    const r = await fetch(`https://poe.ninja/${path}?${params}`, {
      headers: { 'User-Agent': 'poe-market-dashboard (personal tool)', Accept: 'application/json' },
    });
    const body = await r.text();
    // Prices refresh roughly hourly on poe.ninja; history only changes daily.
    const maxAge = /details|history/.test(path) ? 3600 : 600;
    const res = new Response(body, {
      status: r.status,
      headers: {
        'Content-Type': r.headers.get('content-type') || 'application/json',
        // Browsers keep it for 5 minutes, the edge cache for maxAge.
        'Cache-Control': `public, max-age=300, s-maxage=${maxAge}`,
      },
    });
    if (r.ok) waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'poe.ninja request failed', detail: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}
