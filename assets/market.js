import { GAMES, label } from './config.js';
import { $, $$, esc, fmt, pct, cls, sparkline, lineChart, state, loadCategory, ninja, price, secondaryUnit, openModal } from './app.js';

let current = { type: 'Currency', q: '', sort: 'value', dir: -1, shown: 50, unit: localStorage.getItem('mk-unit') || 'both' };
const empties = {};
const sideIcons = {};

const groupsFor = (g) => g.groups || [['Categories', [...g.exchangeTypes, ...g.itemTypes]]];

export async function render(view, { token }) {
  const g = GAMES[state.game];
  const types = [...g.exchangeTypes, ...g.itemTypes];
  if (!types.includes(current.type)) current.type = 'Currency';
  const key = `${state.game}|${state.league}`;
  empties[key] ||= {};
  sideIcons[key] ||= {};

  view.innerHTML = `
    <div class="mk">
      <aside class="mk-side panel" id="mkSide">
        <input id="mkJump" placeholder="Find a category…" class="mk-jump">
        ${groupsFor(g).map(([title, list]) => `
          <div class="mk-group"><div class="mk-gtitle">${esc(title)}</div>
          ${list.filter((t) => types.includes(t)).map((t) => `<a class="mk-cat ${t === current.type ? 'active' : ''} ${empties[key][t] ? 'empty' : ''}" data-type="${t}" href="#market">
            <span class="mk-ic">${sideIcons[key][t] ? `<img loading="lazy" src="${esc(sideIcons[key][t])}">` : ''}</span><span>${esc(label(t))}</span></a>`).join('')}
          </div>`).join('')}
        <div class="mk-group"><div class="mk-gtitle">Other</div>
          <input id="custom" class="mk-jump" placeholder="poe.ninja type, then Enter" title="Type a poe.ninja category name if a new league adds one, then press Enter"></div>
      </aside>
      <section class="mk-main">
        <div class="mk-crumb muted small">Economy › <span id="mkCrumb">${esc(label(current.type))}</span> · ${esc(g.label)} · ${esc(state.league)}</div>
        <div class="row spread mk-head">
          <h2 class="row" style="gap:10px;margin:0"><span class="mk-ic big" id="mkIcon">${sideIcons[key][current.type] ? `<img src="${esc(sideIcons[key][current.type])}">` : ''}</span><span id="mkTitle">${esc(label(current.type))}</span></h2>
          <div class="muted small">Live from poe.ninja, refreshed about every 10 minutes</div>
        </div>
        <div class="row mk-tools">
          <input id="q" placeholder="Filter by name" value="${esc(current.q)}">
          <label class="muted small">Value display
            <select id="mkUnit">${[['both', 'Divine and ' + (secondaryUnit() === 'chaos' ? 'Chaos' : 'Exalted')], ['divine', 'Divine only'], ['sec', (secondaryUnit() === 'chaos' ? 'Chaos' : 'Exalted') + ' only']].map(([k, l]) => `<option value="${k}" ${current.unit === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </label>
        </div>
        <div id="table"><div class="loading">Loading prices…</div></div>
      </section>
    </div>`;

  const pick = (t) => {
    current.type = t; current.shown = 50;
    $$('.mk-cat', view).forEach((p) => p.classList.toggle('active', p.dataset.type === t));
    $('#mkTitle', view).textContent = label(t); $('#mkCrumb', view).textContent = label(t);
    $('#mkIcon', view).innerHTML = sideIcons[key][t] ? `<img src="${esc(sideIcons[key][t])}">` : '';
    loadTable(view, token);
  };
  $('#mkSide', view).onclick = (e) => {
    const a = e.target.closest('[data-type]');
    if (!a) return;
    e.preventDefault(); pick(a.dataset.type);
  };
  $('#mkJump', view).oninput = (e) => {
    const q = e.target.value.toLowerCase();
    $$('.mk-cat', view).forEach((a) => (a.style.display = !q || a.textContent.toLowerCase().includes(q) ? '' : 'none'));
  };
  $('#q', view).oninput = (e) => { current.q = e.target.value; current.shown = 50; drawTable(view); };
  $('#mkUnit', view).onchange = (e) => { current.unit = e.target.value; localStorage.setItem('mk-unit', current.unit); drawTable(view); };
  $('#custom', view).onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) { current.type = e.target.value.trim(); current.shown = 50; loadTable(view, token); }
  };
  loadTable(view, token);

  // Fill sidebar icons and hide categories with no data in this league (runs in the background).
  for (const t of types) {
    if (empties[key][t] !== undefined) continue;
    loadCategory(state.game, state.league, t)
      .then((d) => {
        empties[key][t] = !d.rows.length;
        const top = [...d.rows].sort((x, y) => (y.div ?? 0) - (x.div ?? 0))[0];
        if (top?.icon) sideIcons[key][t] = top.icon;
        const a = $(`.mk-cat[data-type="${t}"]`, view);
        if (a) {
          a.classList.toggle('empty', !d.rows.length);
          if (top?.icon) a.querySelector('.mk-ic').innerHTML = `<img loading="lazy" src="${esc(top.icon)}">`;
        }
        if (t === current.type && top?.icon) $('#mkIcon', view).innerHTML = `<img src="${esc(top.icon)}">`;
      })
      .catch(() => { empties[key][t] = true; $(`.mk-cat[data-type="${t}"]`, view)?.classList.add('empty'); });
  }
}

let data = null;
async function loadTable(view, token) {
  const box = $('#table', view);
  box.innerHTML = '<div class="loading">Loading prices…</div>';
  try {
    const d = await loadCategory(state.game, state.league, current.type);
    if (!token()) return;
    data = d;
    drawTable(view);
  } catch (e) {
    box.innerHTML = `<div class="empty-state">Could not load ${esc(label(current.type))}: ${esc(e.message)}</div>`;
  }
}

function drawTable(view) {
  const box = $('#table', view);
  if (!data) return;
  const sec = secondaryUnit();
  const q = current.q.toLowerCase();
  let rows = data.rows.filter((r) => !q || `${r.name} ${r.variant || ''} ${r.baseType || ''}`.toLowerCase().includes(q));
  const keyOf = { value: (r) => r.div ?? 0, change: (r) => r.change ?? -1e9, volume: (r) => r.volume ?? 0, name: (r) => r.name };
  const k = keyOf[current.sort];
  rows.sort((a, b) => (typeof k(a) === 'string' ? k(a).localeCompare(k(b)) : k(a) - k(b)) * current.dir);
  const isItem = rows[0]?.kind === 'item';
  if (!rows.length) {
    box.innerHTML = `<div class="empty-state">No ${esc(label(current.type))} data for this league${q ? ' matching your search' : ''}.</div>`;
    return;
  }
  const shown = rows.slice(0, current.shown);
  const arrow = (s) => (current.sort === s ? (current.dir < 0 ? ' ▾' : ' ▴') : '');
  const val = (r) => {
    const d = `<span class="mk-v">${price(r.div, 'divine')}</span>`;
    const c = `<span class="mk-v">${price(sec === 'chaos' ? r.chaos : r.exalted, sec)}</span>`;
    return current.unit === 'divine' ? d : current.unit === 'sec' ? c : (r.div != null && r.div >= 1 ? d + `<small class="muted">${c}</small>` : c + `<small class="muted">${d}</small>`);
  };
  box.innerHTML = `
    <div class="table-wrap mk-table"><table>
      <thead><tr>
        <th data-sort="name">Name${arrow('name')}</th>
        <th class="num" data-sort="value">Value${arrow('value')}</th>
        <th data-sort="change">Last 7 days${arrow('change')}</th>
        <th class="num" data-sort="volume">${isItem ? 'Listings' : 'Volume / hour'}${arrow('volume')}</th>
        <th class="admin-only"></th>
      </tr></thead>
      <tbody>${shown
        .map(
          (r, i) => `<tr class="clickable" data-i="${i}">
          <td><div class="name">${r.icon ? `<img class="icon" loading="lazy" src="${esc(r.icon)}">` : '<span class="icon"></span>'}<div>${esc(r.name)}<small>${esc([r.variant, r.baseType !== r.name ? r.baseType : '', r.links ? r.links + 'L' : ''].filter(Boolean).join(' · '))}</small></div></div></td>
          <td class="num mk-val">${val(r)}</td>
          <td><div class="mk-spark">${sparkline(r.spark)}<span class="${cls(r.change)}">${pct(r.change)}</span></div></td>
          <td class="num muted">${fmt(r.volume, 0)}</td>
          <td class="admin-only" style="white-space:nowrap"><button class="small ghost" data-act="watch" data-i="${i}" title="Add to watchlist">+ Watch</button> <button class="small ghost" data-act="hold" data-i="${i}" title="Log a buy">+ Buy</button></td>
        </tr>`,
        )
        .join('')}</tbody>
    </table></div>
    ${rows.length > shown.length ? `<button class="mk-more" id="mkMore">Show more (${rows.length - shown.length} left)</button>` : ''}
    <div class="muted small" style="margin-top:6px">${rows.length} items. Click a row for its price history.</div>`;

  const more = $('#mkMore', box);
  if (more) more.onclick = () => { current.shown += 100; drawTable(view); };
  $$('th[data-sort]', box).forEach((th) => {
    th.onclick = () => {
      const s = th.dataset.sort;
      current.dir = current.sort === s ? -current.dir : s === 'name' ? 1 : -1;
      current.sort = s;
      drawTable(view);
    };
  });
  $('tbody', box).onclick = async (e) => {
    const act = e.target.closest('[data-act]');
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const row = shown[+tr.dataset.i];
    if (act) {
      e.stopPropagation();
      const p = await import('./portfolio.js');
      if (act.dataset.act === 'watch') p.addToWatchlist(row);
      else p.addHolding(row);
      return;
    }
    showHistory(row);
  };
}

// History of one item, converted to divines per day.
export async function historyInDiv(game, league, row) {
  const divD = await ninja(`${game}/api/economy/exchange/current/details`, { league, type: 'Currency', id: 'divine-orb' }, { ttl: 3600_000 });
  const perDiv = {};
  for (const p of divD.pairs || []) {
    perDiv[p.id] = {};
    for (const h of p.history) perDiv[p.id][h.timestamp.slice(0, 10)] = h.rate;
  }
  const days = Object.keys(Object.values(perDiv)[0] || {}).sort();
  const start = days[0];
  const dayNo = (d) => Math.round((Date.parse(d) - Date.parse(start)) / 86400000) + 1;
  const out = [];
  if (row.kind === 'exchange') {
    const d = await ninja(`${game}/api/economy/exchange/current/details`, { league, type: row.type, id: row.detailsId }, { ttl: 3600_000 });
    const best = {};
    for (const p of d.pairs || []) {
      for (const h of p.history) {
        const day = h.timestamp.slice(0, 10);
        const v = p.id === 'divine' ? h.rate : perDiv[p.id]?.[day] ? h.rate / perDiv[p.id][day] : null;
        if (v == null) continue;
        if (!best[day] || (h.volumePrimaryValue || 0) > best[day][0]) best[day] = [h.volumePrimaryValue || 0, v];
      }
    }
    for (const [day, [, v]] of Object.entries(best)) out.push([dayNo(day), v, day]);
  } else {
    const h = await ninja('poe1/api/economy/stash/current/item/history', { league, type: row.type, id: row.id }, { ttl: 3600_000 });
    const today = new Date();
    for (const e of h || []) {
      const d = new Date(today.getTime() - e.daysAgo * 86400000).toISOString().slice(0, 10);
      const c = perDiv.chaos?.[d];
      if (c) out.push([dayNo(d), e.value / c, d]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export async function showHistory(row) {
  openModal(`<div class="row spread"><div class="row"><img class="icon" src="${esc(row.icon)}"><h2>${esc(row.name)}</h2></div>${row.ninjaUrl ? `<a class="small" href="${esc(row.ninjaUrl)}" target="_blank" rel="noopener">View on poe.ninja ↗</a>` : ''}</div>${row.priceHtml ? `<div class="muted small" style="margin-top:4px">Now ${row.priceHtml}</div>` : ''}<div id="hist" class="loading">Loading history…</div>`);
  try {
    const pts = await historyInDiv(state.game, state.league, row);
    const box = document.getElementById('hist');
    if (!box) return;
    box.className = '';
    if (!pts.length) {
      box.innerHTML = '<div class="empty-state">No history available.</div>';
      return;
    }
    const peak = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
    const first = pts[0];
    const last = pts[pts.length - 1];
    box.innerHTML = `
      <div class="grid3" style="margin:10px 0">
        <div class="stat"><b>${fmt(first[1])}</b><span>Day ${first[0]} (divines)</span></div>
        <div class="stat"><b>${fmt(peak[1])}</b><span>Peak, day ${peak[0]} (${(peak[1] / first[1]).toFixed(1)}x)</span></div>
        <div class="stat"><b>${fmt(last[1])}</b><span>Now, day ${last[0]} (${(last[1] / first[1]).toFixed(1)}x)</span></div>
      </div>
      ${lineChart([{ name: 'Value in divines', color: 'var(--gold)', data: pts.map(([x, y]) => [x, y]) }], { yLabel: 'divines', log: peak[1] / Math.max(1e-9, Math.min(...pts.map((p) => p[1]))) > 30 })}
      <p class="muted small">Measured in divines, so a rising line means it beat simply holding divines.</p>`;
  } catch (e) {
    const box = document.getElementById('hist');
    if (box) box.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
  }
}
