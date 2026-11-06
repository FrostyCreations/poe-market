import { $, $$, esc, fmt, pct, cls, state, items, exchange, price, sparkline, toDiv } from './app.js';

const tabs = {
  gems: 'Gem Vaal & levelling',
  beasts: 'Beasts',
  clusters: 'Cluster jewels',
  bases: 'Bases',
};
let tab = 'gems';
const gemOpt = { q: '', minList: 5, p21: 12.5, pDown: 12.5, sort: 'vaalOwn', dir: -1 };

export async function render(view, { token }) {
  if (state.game !== 'poe1') {
    view.innerHTML = `<div class="panel"><h2>Crafting</h2><p class="muted">poe.ninja only publishes gem, beast, cluster and base prices for Path of Exile 1. Switch to PoE 1 to use these calculators. For PoE 2, use the Market tab (Uncut Gems, Runes, Essences).</p></div>`;
    return;
  }
  view.innerHTML = `
    <div class="panel">
      <h2>Crafting</h2>
      <div class="muted small">Live ${esc(state.league)} prices. Use these to decide what to craft and sell in week 1.</div>
      <div class="pills" id="ctabs">${Object.entries(tabs).map(([k, v]) => `<button class="pill ${k === tab ? 'active' : ''}" data-t="${k}">${v}</button>`).join('')}</div>
      <div id="cbody"><div class="loading">Loading…</div></div>
    </div>`;
  $('#ctabs', view).onclick = (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (!t) return;
    tab = t;
    $$('#ctabs .pill', view).forEach((p) => p.classList.toggle('active', p.dataset.t === t));
    draw(view, token);
  };
  draw(view, token);
}

async function draw(view, token) {
  const body = $('#cbody', view);
  body.innerHTML = '<div class="loading">Loading…</div>';
  try {
    if (tab === 'gems') await gems(body, token);
    else if (tab === 'beasts') await simple(body, token, 'Beast', 'Beasts are captured with Einhar and used in Bestiary crafts. Last league, Fenumal Plagued Arachnid went from 8c on day 3 to 220c by day 14.');
    else if (tab === 'clusters') await simple(body, token, 'ClusterJewel', 'Cluster jewels for the popular builds sell at a big premium in week 1. Variant shows the passive count; level is the item level.');
    else await simple(body, token, 'BaseType', 'Influenced and high item level bases. Bases that meta crafters want climb in week 1; most others are worth the most on day 1 to 3.');
  } catch (e) {
    body.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
  }
}

async function gems(body, token) {
  const [{ rows }, cur] = await Promise.all([items(state.league, 'SkillGem'), exchange('poe1', state.league, 'Currency')]);
  if (!token()) return;
  const gcp = cur.rows.find((r) => r.name === "Gemcutter's Prism")?.chaos ?? 1;
  const vaal = cur.rows.find((r) => r.name === 'Vaal Orb')?.chaos ?? 1;
  const by = {};
  for (const r of rows) {
    (by[r.name] ||= []).push(r);
  }
  // Most-listed variant; ignores thin listings, which are often mispriced.
  const pick = (list, lvl, q, cor) => list.filter((r) => r.gemLevel === lvl && (r.gemQuality || 0) === q && r.corrupted === cor && (r.volume || 0) >= Math.max(3, gemOpt.minList)).sort((a, b) => (b.volume || 0) - (a.volume || 0))[0];
  const out = [];
  for (const [name, list] of Object.entries(by)) {
    const p20 = pick(list, 20, 20, false);
    if (!p20) continue;
    const p20c = pick(list, 20, 20, true);
    const p21 = pick(list, 21, 20, true);
    const p1 = pick(list, 1, 0, false) || pick(list, 1, 20, false);
    if (!p21 || p21.chaos > p20.chaos * 60) continue; // a 21/20 at 60x+ a 20/20 is a bad listing
    const P20 = p20.chaos, P21 = p21.chaos;
    // A corrupted 20/20 should not be worth more than ~3x a clean one; if it is, the listing is an outlier.
    const P20c = p20c && p20c.chaos <= P20 * 3 ? p20c.chaos : P20 * 0.6;
    const a = gemOpt.p21 / 100, d = gemOpt.pDown / 100;
    // Outcomes of a Vaal Orb on a 20/20 gem (rough): a = level 21, d = level 19 (worth ~30% of a 20/20), rest = still 20, corrupted.
    const ev = a * P21 + d * P20 * 0.3 + (1 - a - d) * P20c;
    out.push({
      name, icon: p20.icon, P1: p1?.chaos ?? null, P20, P20c, P21, ev,
      vaalOwn: ev - P20, // Vaal your own levelled gem instead of selling it
      buyVaal: ev - P20 - vaal, // buy a 20/20 and Vaal it
      level: p1 ? P20 - p1.chaos - 20 * gcp : null, // level a 1/0 to 20/20 (20 GCPs)
      list: Math.min(p20.volume || 0, p21.volume || 0),
      spark: p21.spark,
    });
  }
  const draw = () => {
    const q = gemOpt.q.toLowerCase();
    let rs = out.filter((r) => r.list >= gemOpt.minList && (!q || r.name.toLowerCase().includes(q)));
    rs.sort((x, y) => ((x[gemOpt.sort] ?? -1e9) - (y[gemOpt.sort] ?? -1e9)) * gemOpt.dir);
    const tbl = body.querySelector('#gemTable');
    tbl.innerHTML = `<div class="table-wrap"><table><thead><tr>
      <th>Gem</th><th class="num" data-s="P1">1/0</th><th class="num" data-s="P20">20/20</th><th class="num" data-s="P20c">20/20 corrupt</th><th class="num" data-s="P21">21/20 corrupt</th>
      <th class="num" data-s="level" title="Sell a 20/20 you levelled from a 1/0, minus 20 GCPs">Level & sell</th>
      <th class="num" data-s="vaalOwn" title="Expected gain from Vaal-ing your own 20/20 instead of selling it">Vaal own vs sell</th>
      <th class="num" data-s="buyVaal" title="Expected profit from buying a 20/20 and Vaal-ing it">Buy & Vaal</th>
      <th class="num" data-s="list">Listings</th></tr></thead><tbody>
      ${rs.slice(0, 250).map((r) => `<tr>
        <td><div class="name"><img class="icon" loading="lazy" src="${esc(r.icon)}">${esc(r.name)}</div></td>
        <td class="num">${fmt(r.P1)}</td><td class="num">${fmt(r.P20)}</td><td class="num muted">${fmt(r.P20c)}</td><td class="num">${fmt(r.P21)}</td>
        <td class="num ${cls(r.level)}">${fmt(r.level)}</td>
        <td class="num ${cls(r.vaalOwn)}"><b>${fmt(r.vaalOwn)}</b></td>
        <td class="num ${cls(r.buyVaal)}">${fmt(r.buyVaal)}</td>
        <td class="num muted">${fmt(r.list, 0)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="muted small" style="margin-top:6px">All values in chaos. GCP ${fmt(gcp)}c, Vaal Orb ${fmt(vaal)}c. "Vaal own vs sell" above 0 means corrupting your own levelled gem beats selling it at 20/20.</div>`;
    $$('th[data-s]', tbl).forEach((th) => (th.onclick = () => {
      gemOpt.dir = gemOpt.sort === th.dataset.s ? -gemOpt.dir : -1;
      gemOpt.sort = th.dataset.s;
      draw();
    }));
  };
  body.innerHTML = `
    <p class="muted small">The week-1 gem play: level meta gems for free in spare sockets and weapon swap, sell the 20/20s, and Vaal the ones where a 21/20 is worth far more. Buying 20/20s just to Vaal them was roughly break-even last league.</p>
    <div class="row" style="margin-bottom:10px">
      <input id="gq" placeholder="Search gems…" value="${esc(gemOpt.q)}">
      <label class="muted small">Min listings <input id="gmin" type="number" value="${gemOpt.minList}" style="width:70px"></label>
      <label class="muted small">Chance of 21 % <input id="gp21" type="number" step="0.5" value="${gemOpt.p21}" style="width:70px"></label>
      <label class="muted small">Chance of 19 % <input id="gpd" type="number" step="0.5" value="${gemOpt.pDown}" style="width:70px"></label>
    </div>
    <div id="gemTable"></div>`;
  $('#gq', body).oninput = (e) => { gemOpt.q = e.target.value; draw(); };
  $('#gmin', body).onchange = (e) => { gemOpt.minList = +e.target.value || 0; gems(body, token); };
  $('#gp21', body).onchange = (e) => { gemOpt.p21 = +e.target.value; gems(body, token); };
  $('#gpd', body).onchange = (e) => { gemOpt.pDown = +e.target.value; gems(body, token); };
  draw();
}

const simpleOpt = {};
async function simple(body, token, type, blurb) {
  const { rows } = await items(state.league, type);
  if (!token()) return;
  const o = (simpleOpt[type] ||= { q: '', sort: 'chaos', dir: -1, min: type === 'BaseType' ? 5 : 1 });
  body.innerHTML = `<p class="muted small">${esc(blurb)}</p>
    <div class="row" style="margin-bottom:10px"><input id="sq" placeholder="Search…" value="${esc(o.q)}">
    <label class="muted small">Min listings <input id="smin" type="number" value="${o.min}" style="width:70px"></label></div><div id="st"></div>`;
  const draw = () => {
    const q = o.q.toLowerCase();
    let rs = rows.filter((r) => (r.volume || 0) >= o.min && (!q || `${r.name} ${r.variant} ${r.baseType}`.toLowerCase().includes(q)));
    rs.sort((a, b) => ((a[o.sort] ?? -1e9) - (b[o.sort] ?? -1e9)) * o.dir);
    $('#st', body).innerHTML = `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Variant</th><th class="num">Level</th>
      <th class="num" data-s="chaos">Chaos</th><th class="num" data-s="div">Divine</th><th class="num" data-s="change">7 days</th><th></th><th class="num" data-s="volume">Listings</th><th class="admin-only"></th></tr></thead><tbody>
      ${rs.slice(0, 300).map((r, i) => `<tr data-i="${i}"><td><div class="name"><img class="icon" loading="lazy" src="${esc(r.icon)}">${esc(r.name)}</div></td>
        <td class="small muted">${esc(r.variant)}</td><td class="num muted">${fmt(r.level, 0)}</td>
        <td class="num">${price(r.chaos, 'chaos')}</td><td class="num">${price(r.div, 'divine')}</td>
        <td class="num ${cls(r.change)}">${pct(r.change)}</td><td>${sparkline(r.spark)}</td><td class="num muted">${fmt(r.volume, 0)}</td>
        <td class="admin-only"><button class="small ghost" data-w="${i}">+ Watch</button></td></tr>`).join('')}</tbody></table></div>`;
    $$('th[data-s]', body).forEach((th) => (th.onclick = () => {
      o.dir = o.sort === th.dataset.s ? -o.dir : -1;
      o.sort = th.dataset.s;
      draw();
    }));
    $('#st tbody', body).onclick = async (e) => {
      const w = e.target.closest('[data-w]');
      if (!w) return;
      const p = await import('./portfolio.js');
      p.addToWatchlist(rs[+w.dataset.w]);
    };
  };
  $('#sq', body).oninput = (e) => { o.q = e.target.value; draw(); };
  $('#smin', body).onchange = (e) => { o.min = +e.target.value || 0; draw(); };
  draw();
}
