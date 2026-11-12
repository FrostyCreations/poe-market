import { $, $$, esc, fmt, sparkline, price, state } from './app.js';

// Faustus tab: hourly Currency Exchange prices from GGG's public feed, collected by the
// "Faustus price alerts" GitHub Action into the faustus branch.
const SRC = 'https://raw.githubusercontent.com/FrostyCreations/poe-market/faustus/data/user/faustus.json';
const ICON = (p) => (p ? `https://web.poecdn.com/image/Art/2DItems/${p}.png?scale=1` : '');
let sortKey = 'move'; let query = ''; let range = 'latest';

const pctTxt = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const ago = (ts) => { const m = Math.round((Date.now() / 1000 - ts) / 60); return m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

function stats(it, latest) {
  const h = it.h; const last = h[h.length - 1];
  const prev = h.filter((p) => p[0] < last[0] && p[0] >= last[0] - 24 * 3600).map((p) => p[1]).sort((a, b) => a - b);
  const med = prev.length ? prev[prev.length >> 1] : null;
  const p1 = h.length > 1 ? h[h.length - 2][1] : null;
  return { now: last[1], vol: last[2], d24: med ? last[1] / med - 1 : null, d1: p1 ? last[1] / p1 - 1 : null, fresh: last[0] === latest, spark: h.map((p) => p[1]) };
}

function alertRow(a, it) {
  return `<div class="fx-alert ${a.dir}">
    <img src="${esc(ICON(a.icon))}" alt="">
    <div class="fx-name"><b>${esc(a.name)}</b>${a.watched ? ' <span class="tag gold">Watchlist</span>' : ''}<span class="muted small">${ago(a.ts + 3600)} · ${fmt(a.vol)}c traded</span></div>
    ${it ? sparkline(it.h.map((p) => p[1]), 80, 26) : ''}
    <div class="fx-num">${price(a.price, 'chaos')}<span class="${a.dir === 'down' ? 'neg' : 'pos'}">${pctTxt(a.change)} vs 24h</span></div>
  </div>`;
}

export async function render(view, { token }) {
  view.innerHTML = '<div class="loading">Loading Faustus data…</div>';
  let d;
  try { d = await fetch(`${SRC}?t=${Math.floor(Date.now() / 300000)}`).then((r) => (r.ok ? r.json() : null)); } catch { d = null; }
  if (!token()) return;
  if (!d) {
    view.innerHTML = `<div class="panel"><h2>Faustus</h2><p class="muted">No exchange data yet. The hourly job hasn't run, or it can't reach GGG's feed right now.</p></div>`;
    return;
  }
  const latest = d.latest;
  const items = d.items || {};
  const alerts = (d.alerts || []).filter((a) => (range === 'latest' ? a.ts === latest : true));
  const drops = alerts.filter((a) => a.dir === 'down');
  const rises = alerts.filter((a) => a.dir === 'up');
  const t = d.thresholds || {};

  view.innerHTML = `
    <section class="craft-hero">
      <div>
        <h2>Faustus exchange watch</h2>
        <p class="muted">Every trade made through Faustus in <b>${esc(d.league)}</b>, from GGG's Currency Exchange feed. It updates hourly and runs about an hour behind, because GGG only publishes finished hours.</p>
      </div>
      <div class="fx-kpis">
        <div><span>Divine</span><b>${price(d.cpd, 'chaos')}</b></div>
        <div><span>Latest hour</span><b>${new Date(latest * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></div>
        <div><span>Items tracked</span><b>${Object.keys(items).length}</b></div>
      </div>
    </section>
    <div class="row spread" style="margin:16px 0 8px;gap:10px;flex-wrap:wrap">
      <h3 class="section-title" style="margin:0">Buy and sell signals</h3>
      <div class="pills" id="fxRange">${[['latest', 'Latest hour'], ['48h', 'Last 48 hours']].map(([k, l]) => `<button class="pill ${range === k ? 'active' : ''}" data-r="${k}">${l}</button>`).join('')}</div>
    </div>
    <p class="muted small" style="margin:0 0 10px">A signal fires when an item's hourly price is ${Math.round((t.drop || 0.15) * 100)}%+ away from its 24-hour median and has also jumped in the last hour, with at least ${fmt(t.minVolume || 150)}c traded. Watchlist items alert at a lower threshold. Check the price in game before you trade.</p>
    <div class="fx-cols">
      <div class="panel"><h4 class="fx-h neg">Price drops · buy?</h4>${drops.length ? drops.slice(0, 25).map((a) => alertRow(a, items[a.id])).join('') : '<p class="muted small">No sharp drops this hour.</p>'}</div>
      <div class="panel"><h4 class="fx-h pos">Price rises · sell?</h4>${rises.length ? rises.slice(0, 25).map((a) => alertRow(a, items[a.id])).join('') : '<p class="muted small">No sharp rises this hour.</p>'}</div>
    </div>
    <div class="row spread" style="margin:20px 0 8px;gap:10px;flex-wrap:wrap">
      <h3 class="section-title" style="margin:0">All items</h3>
      <input id="fxQ" class="craft-search" type="search" placeholder="Search items" value="${esc(query)}">
      <div class="pills" id="fxSort">${[['move', 'Biggest moves'], ['vol', 'Most traded'], ['price', 'Price']].map(([k, l]) => `<button class="pill ${sortKey === k ? 'active' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="panel" style="padding:0;overflow:auto"><table class="fx-table"><thead><tr><th>Item</th><th>Price</th><th>1h</th><th>vs 24h</th><th>Traded (hour)</th><th>48h</th></tr></thead><tbody id="fxBody"></tbody></table></div>
    <div class="panel fx-setup">
      <h4 class="fx-h">Phone alerts</h4>
      <p class="small muted">The same signals are pushed to your phone every hour through the free <a href="https://ntfy.sh" target="_blank" rel="noopener">ntfy</a> app (Android and iPhone). Subscribe to your private topic in the app and alerts arrive about 15 minutes after each hour closes. A Discord channel works too.</p>
    </div>`;

  const rows = Object.entries(items).map(([id, it]) => ({ id, it, s: stats(it, latest) })).filter((r) => r.s.fresh || sortKey !== 'move');
  const body = $('#fxBody', view);
  const draw = () => {
    const q = query.toLowerCase();
    const list = rows.filter((r) => !q || r.it.n.toLowerCase().includes(q))
      .sort((a, b) => (sortKey === 'vol' ? b.s.vol - a.s.vol : sortKey === 'price' ? b.s.now - a.s.now : Math.abs(b.s.d24 || 0) * Math.log10(10 + b.s.vol) - Math.abs(a.s.d24 || 0) * Math.log10(10 + a.s.vol)))
      .slice(0, 150);
    body.innerHTML = list.map(({ it, s }) => `<tr>
      <td><span class="fx-item"><img src="${esc(ICON(it.i))}" alt="" loading="lazy">${esc(it.n)}</span></td>
      <td>${price(s.now, 'chaos')}</td>
      <td class="${s.d1 > 0 ? 'pos' : s.d1 < 0 ? 'neg' : ''}">${s.d1 == null ? '–' : pctTxt(s.d1)}</td>
      <td class="${s.d24 > 0 ? 'pos' : s.d24 < 0 ? 'neg' : ''}">${s.d24 == null ? '–' : pctTxt(s.d24)}</td>
      <td>${fmt(s.vol)}c</td>
      <td>${sparkline(s.spark, 90, 22)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No items match.</td></tr>';
  };
  draw();
  $('#fxQ', view).oninput = (e) => { query = e.target.value; draw(); };
  $('#fxSort', view).onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { sortKey = b.dataset.s; render(view, { token }); } };
  $('#fxRange', view).onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) { range = b.dataset.r; render(view, { token }); } };
}
