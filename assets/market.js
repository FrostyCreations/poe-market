import { GAMES, label } from './config.js';
import { $, $$, esc, fmt, pct, cls, sparkline, lineChart, state, loadCategory, ninja, price, secondaryUnit, openModal } from './app.js';

let current = { type: 'Currency', q: '', sort: 'value', dir: -1 };
const empties = {};

export async function render(view, { token }) {
  const g = GAMES[state.game];
  const types = [...g.exchangeTypes, ...g.itemTypes];
  if (!types.includes(current.type)) current.type = 'Currency';
  const key = `${state.game}|${state.league}`;
  empties[key] ||= {};

  view.innerHTML = `
    <div class="panel">
      <div class="row spread">
        <div><h2>Market</h2><div class="muted small">${esc(g.label)} · ${esc(state.league)} · live from poe.ninja, refreshed about every 10 minutes</div></div>
        <div class="row">
          <input id="q" placeholder="Search items…" value="${esc(current.q)}" style="width:220px">
          <input id="custom" placeholder="Other category (poe.ninja type)" style="width:220px" title="Type a poe.ninja category name if a new league adds one, then press Enter">
        </div>
      </div>
      <div class="pills" id="pills">
        ${types.map((t) => `<button class="pill ${t === current.type ? 'active' : ''} ${empties[key][t] ? 'empty' : ''}" data-type="${t}">${esc(label(t))}</button>`).join('')}
      </div>
      <div id="table"><div class="loading">Loading prices…</div></div>
    </div>`;

  $('#pills', view).onclick = (e) => {
    const t = e.target.closest('[data-type]')?.dataset.type;
    if (!t) return;
    current.type = t;
    $$('.pill', view).forEach((p) => p.classList.toggle('active', p.dataset.type === t));
    loadTable(view, token);
  };
  $('#q', view).oninput = (e) => {
    current.q = e.target.value;
    drawTable(view);
  };
  $('#custom', view).onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      current.type = e.target.value.trim();
      loadTable(view, token);
    }
  };
  loadTable(view, token);

  // Grey out categories that have no data in this league (runs in the background).
  for (const t of types) {
    if (empties[key][t] !== undefined) continue;
    loadCategory(state.game, state.league, t)
      .then((d) => {
        empties[key][t] = !d.rows.length;
        $(`.pill[data-type="${t}"]`, view)?.classList.toggle('empty', !d.rows.length);
      })
      .catch(() => {});
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
    box.innerHTML = `<div class="empty-state">Could not load ${esc(current.type)}: ${esc(e.message)}</div>`;
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
  const shown = rows.slice(0, 400);
  box.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr>
        <th data-sort="name">Item</th>
        <th class="num" data-sort="value">Divine</th>
        <th class="num" data-sort="value">${sec === 'chaos' ? 'Chaos' : 'Exalted'}</th>
        <th class="num" data-sort="change">7 days</th>
        <th></th>
        <th class="num" data-sort="volume">${isItem ? 'Listings' : 'Volume'}</th>
        <th class="admin-only"></th>
      </tr></thead>
      <tbody>${shown
        .map(
          (r, i) => `<tr class="clickable" data-i="${i}">
          <td><div class="name">${r.icon ? `<img class="icon" loading="lazy" src="${esc(r.icon)}">` : ''}<div>${esc(r.name)}<small>${esc([r.variant, r.baseType !== r.name ? r.baseType : '', r.links ? r.links + 'L' : ''].filter(Boolean).join(' · '))}</small></div></div></td>
          <td class="num">${price(r.div, 'divine')}</td>
          <td class="num">${price(sec === 'chaos' ? r.chaos : r.exalted, sec)}</td>
          <td class="num ${cls(r.change)}">${pct(r.change)}</td>
          <td>${sparkline(r.spark)}</td>
          <td class="num muted">${fmt(r.volume, 0)}</td>
          <td class="admin-only" style="white-space:nowrap"><button class="small ghost" data-act="watch" data-i="${i}" title="Add to watchlist">+ Watch</button> <button class="small ghost" data-act="hold" data-i="${i}" title="Log a buy">+ Buy</button></td>
        </tr>`,
        )
        .join('')}</tbody>
    </table></div>
    <div class="muted small" style="margin-top:6px">${rows.length} items${rows.length > 400 ? ' (showing top 400, use search)' : ''}. Click a row for its price history.</div>`;

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

async function showHistory(row) {
  openModal(`<div class="row"><img class="icon" src="${esc(row.icon)}"><h2>${esc(row.name)}</h2></div><div id="hist" class="loading">Loading history…</div>`);
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
