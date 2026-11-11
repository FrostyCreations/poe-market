import { $, $$, esc, fmt, pct, cls, state, items, exchange, price, sparkline, toDiv, loadCategory, secondaryUnit } from './app.js';
import { showHistory } from './market.js';

const tabs = {
  profit: 'Profit crafts',
  gems: 'Gem Vaal & levelling',
  beasts: 'Beasts',
  clusters: 'Cluster jewels',
  bases: 'Bases',
};
let tab = 'profit';
let tierSel = 0;
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
    if (tab === 'profit') await profit(body, token, view);
    else if (tab === 'gems') await gems(body, token);
    else if (tab === 'beasts') await simple(body, token, 'Beast', 'Beasts are captured with Einhar and used in Bestiary crafts. Last league, Fenumal Plagued Arachnid went from 8c on day 3 to 220c by day 14.');
    else if (tab === 'clusters') await simple(body, token, 'ClusterJewel', 'Cluster jewels for the popular builds sell at a big premium in week 1. Variant shows the passive count; level is the item level.');
    else await simple(body, token, 'BaseType', 'Influenced and high item level bases. Bases that meta crafters want climb in week 1; most others are worth the most on day 1 to 3.');
  } catch (e) {
    body.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
  }
}

const RISK = { Low: 'pos', Medium: '', High: 'neg', 'Very high': 'neg' };
const NINJA_PATH = { Currency: 'currency', Artifact: 'artifacts', Essence: 'essences', Fossil: 'fossils', Resonator: 'resonators' };
// Currency words in the step text, mapped to poe.ninja exchange ids. Longest first.
const ALIASES = [
  ["Glassblower's Baubles?", 'Currency|bauble'],
  ['Orbs? of Transmutation', 'Currency|transmute'],
  ['Orbs? of Augmentation', 'Currency|aug'],
  ['Orbs? of Alteration', 'Currency|alt'],
  ['Orbs? of Annulment', 'Currency|annul'],
  ['Eldritch Orbs? of Annulment', 'Currency|eldritch-orb-of-annulment'],
  ['Vaal Orbs?', 'Currency|vaal'],
  ['Transmute', 'Currency|transmute'],
  ['alterations?', 'Currency|alt'],
  ['augments?', 'Currency|aug'],
  ['Regal', 'Currency|regal'],
  ['exalts?', 'Currency|exalted'],
  ['annul', 'Currency|annul'],
  ['Chaos reforge', 'Currency|chaos'],
  ['Chaos Orbs?', 'Currency|chaos'],
];
const ALIAS_RE = new RegExp(`\\b(${ALIASES.map(([a]) => a).join('|')})\\b`, 'gi');
const aliasKey = (word) => ALIASES.find(([a]) => new RegExp(`^${a}$`, 'i').test(word))?.[1];

function leagueSlug() {
  return state.leagues.poe1.find((l) => l.name === state.league)?.url || state.league.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function ninjaUrl(r) {
  const cat = NINJA_PATH[r.type];
  return cat && r.detailsId ? `https://poe.ninja/poe1/economy/${leagueSlug()}/${cat}/${r.detailsId}` : 'https://poe.ninja/poe1/economy';
}

const qkey = (id) => (id.includes('|') ? id : `Currency|${id}`);

async function profit(body, token) {
  const c = await fetch('/data/crafts.json').then((r) => r.json());
  if (!token()) return;
  const keys = new Set([...c.crafts.flatMap((x) => x.materials.map((m) => m.join('|'))), ...ALIASES.map((a) => a[1]),
    ...c.crafts.flatMap((x) => Object.keys(x.estimate?.qty || {}).map(qkey))]);
  const types = [...new Set([...keys].map((k) => k.split('|')[0]))];
  const live = {};
  await Promise.all(types.map(async (t) => {
    try {
      const d = await loadCategory('poe1', state.league, t);
      for (const r of d.rows) live[`${t}|${r.id}`] = r;
    } catch {}
  }));
  if (!token()) return;
  const sec = secondaryUnit();
  const divChaos = live['Currency|divine']?.chaos;
  const both = (chaos) => `${price(chaos, 'chaos')}${divChaos ? ` <span class="muted">· ${price(chaos / divChaos, 'divine')}</span>` : ''}`;

  // An inline currency link: icon + name, opens the price history (poe.ninja on middle click).
  const chip = (key, label, withPrice) => {
    const r = live[key];
    if (!r) return esc(label);
    const p = sec === 'chaos' ? r.chaos : r.exalted;
    return `<a class="cur-link" href="${esc(ninjaUrl(r))}" target="_blank" rel="noopener" data-cur="${esc(key)}" title="${esc(r.name)}: ${esc(fmt(p))} ${sec}. Click for price history.">${r.icon ? `<img src="${esc(r.icon)}" alt="">` : ''}<span>${esc(label)}</span>${withPrice ? `<b>${price(p, sec)}</b>` : ''}</a>`;
  };
  const linkify = (text) => {
    let out = '', last = 0;
    for (const m of text.matchAll(ALIAS_RE)) {
      out += esc(text.slice(last, m.index));
      const key = aliasKey(m[0]);
      out += key ? chip(key, m[0], false) : esc(m[0]);
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  };
  const estimate = (x) => {
    const q = x.estimate?.qty || {};
    let total = 0, missing = false;
    const parts = Object.entries(q).map(([id, n]) => {
      const r = live[qkey(id)];
      if (!r?.chaos) { missing = true; return ''; }
      total += n * r.chaos;
      return `<li>${chip(qkey(id), `${n} × ${r.name}`, false)}<span>${price(n * r.chaos, 'chaos')}</span></li>`;
    }).join('');
    return { total, missing, parts };
  };

  const card = (x) => {
    const e = estimate(x);
    return `
    <article class="craft-card tier-${x.tier} ${x.pick ? 'pick' : ''}" data-tier="${x.tier}">
      <div class="row spread"><h4>${esc(x.name)}</h4><span class="row" style="gap:6px">${x.pick ? '<span class="tag gold">Top pick</span>' : ''}<span class="tag">${esc(x.phase)}</span></span></div>
      <div class="craft-meta">
        <div><span>Base</span>${esc(x.base)}</div>
        <div><span>Target</span>${esc(x.targets)}</div>
        <div><span>Sells to</span>${esc(x.buyers)}</div>
      </div>
      <ol class="craft-steps">${x.steps.map((s) => `<li>${linkify(s)}</li>`).join('')}</ol>
      ${x.note ? `<p class="muted small craft-note">${linkify(x.note)}</p>` : ''}
      <div class="craft-est">
        <div class="row spread"><span class="est-label">Estimated cost <span class="muted">${esc(x.estimate?.per || '')}</span></span><b class="est-total">${e.total ? both(e.total) : '–'}</b></div>
        <details><summary>How it's worked out</summary><ul class="est-parts">${e.parts}</ul><p class="muted small">${esc(c.estimateNote)}${e.missing ? ' Some prices are missing in this league.' : ''}</p></details>
      </div>
      <div class="craft-stats">
        <div><span>Bankroll</span><b>${esc(x.cost)}</b></div>
        <div><span>Typical sale</span><b>${esc(x.sale)}</b></div>
        <div><span>Risk</span><b class="${RISK[x.risk] || ''}">${esc(x.risk)}</b></div>
      </div>
      ${x.materials.length ? `<div class="mats">${x.materials.map((m) => chip(m.join('|'), live[m.join('|')]?.name || m[1], true)).join('')}</div>` : ''}
    </article>`;
  };
  body.innerHTML = `
    <section class="craft-hero">
      <div>
        <span class="eyebrow">${esc(c.subtitle)}</span>
        <p class="hero-sub" style="margin-top:6px">${esc(c.summary)}</p>
        <p class="small"><a href="${esc(c.guideUrl)}" target="_blank" rel="noopener">Open the full write-up →</a> <span class="muted">· material prices are live from ${esc(state.league)}</span></p>
      </div>
    </section>
    <h3 class="section-title">What 3.30 changes for crafters</h3>
    <div class="brief-grid">${c.changes.map((x) => `<article class="brief-card tone-${x.tone}"><h4>${esc(x.title)}</h4><p>${esc(x.body)}</p></article>`).join('')}</div>
    <div class="row spread" style="margin-top:18px"><h3 class="section-title" style="margin:0">Crafting tiers</h3><div class="pills" id="tiersel"><button class="pill ${tierSel ? '' : 'active'}" data-n="0">All tiers</button>${c.tiers.map((t) => `<button class="pill ${tierSel === t.n ? 'active' : ''}" data-n="${t.n}">T${t.n} ${esc(t.name)}</button>`).join('')}</div></div>
    <div class="tier-ladder">${c.tiers.map((t) => `<button class="rung rung-${t.n}" data-n="${t.n}"><span class="rung-n">T${t.n}</span><b>${esc(t.name)}</b><span class="rung-b">${esc(t.bankroll)}</span><span class="muted small">${esc(t.when)}</span></button>`).join('')}</div>
    <div id="tiers">${c.tiers.map((t) => `<section class="tier-block" data-n="${t.n}">
      <div class="tier-head"><span class="rung-n">T${t.n}</span><div><h3>${esc(t.name)} <span class="muted small">· ${esc(t.bankroll)} · ${esc(t.when)}</span></h3><div class="muted small">${esc(t.blurb)}</div></div></div>
      <div class="craft-grid">${c.crafts.filter((x) => x.tier === t.n).map(card).join('')}</div></section>`).join('')}</div>
    <div class="grid2" style="margin-top:18px">
      <section class="panel"><h3>Avoid or wait on</h3><ul class="plain-list">${c.avoid.map(([a, b]) => `<li><b>${esc(a)}.</b> <span class="muted">${esc(b)}</span></li>`).join('')}</ul></section>
      <section class="panel"><h3>How to sell</h3><ul class="plain-list">${c.selling.map(([a, b]) => `<li><b>${esc(a)}.</b> <span class="muted">${esc(b)}</span></li>`).join('')}</ul></section>
    </div>
    <section class="panel sources"><h3>Sources</h3><ul>${c.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul></section>`;
  const filter = () => {
    $$('#tiers .tier-block', body).forEach((el) => { el.style.display = !tierSel || +el.dataset.n === tierSel ? '' : 'none'; });
    $$('#tiersel .pill', body).forEach((b) => b.classList.toggle('active', +b.dataset.n === tierSel));
    $$('.tier-ladder .rung', body).forEach((b) => b.classList.toggle('active', +b.dataset.n === tierSel));
  };
  const pickTier = (e) => {
    const n = e.target.closest('[data-n]')?.dataset.n;
    if (n == null) return;
    tierSel = +n === tierSel && e.currentTarget.classList.contains('tier-ladder') ? 0 : +n;
    filter();
  };
  $('#tiersel', body).onclick = pickTier;
  $('.tier-ladder', body).onclick = pickTier;
  filter();
  body.addEventListener('click', (e) => {
    const a = e.target.closest('.cur-link');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    const r = live[a.dataset.cur];
    if (!r) return;
    e.preventDefault();
    const sec = secondaryUnit();
    showHistory({ ...r, ninjaUrl: a.href, priceHtml: `${price(sec === 'chaos' ? r.chaos : r.exalted, sec)} · ${price(r.div, 'divine')}` });
  });
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
