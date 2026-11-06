import { label } from './config.js';
import { $, $$, esc, fmt, xfmt, cls, sparkline, lineChart, state, iconFor, openModal } from './app.js';

const files = {};
async function loadFile(slug) {
  files[slug] ||= fetch(`/data/playbook/${slug}.json`).then((r) => r.json()).then(clean);
  return files[slug];
}

// Drops days with no trades and one-day spikes (bad data points from thin markets).
function clean(file) {
  for (const it of file.items) {
    const v = it.v;
    for (let i = 0; i < v.length; i++) if (it.vol?.[i] === 0) v[i] = null;
    const orig = [...v];
    for (let i = 0; i < v.length; i++) {
      if (orig[i] == null) continue;
      const near = [];
      for (let j = Math.max(0, i - 3); j <= Math.min(v.length - 1, i + 3); j++) if (j !== i && orig[j] != null) near.push(orig[j]);
      if (near.length < 2) continue;
      const med = near.sort((a, b) => a - b)[Math.floor(near.length / 2)];
      if (orig[i] / med > 10 || med / orig[i] > 10) v[i] = null;
    }
  }
  return file;
}

const opts = { slug: null, compare: '', buy: 2, sell: 7, type: 'All', minVol: 200, q: '', onlyWinners: false, sort: 'x', dir: -1 };

const at = (arr, day) => {
  for (const d of [day, day - 1, day + 1]) {
    const v = arr?.[d - 1];
    if (v != null) return v;
  }
  return null;
};
const avgVol = (it, from, to) => {
  const xs = (it.vol || []).slice(from - 1, to).filter((x) => x != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

export async function render(view, { token }) {
  view.innerHTML = '<div class="loading">Loading playbook data…</div>';
  const index = await fetch('/data/playbook/index.json').then((r) => r.json()).catch(() => []);
  const mine = index.filter((x) => x.game === state.game);
  if (!token()) return;
  if (!mine.length) {
    view.innerHTML = `<div class="panel"><h2>Launch Playbook</h2><p class="muted">No playbook data for this game yet. Run the "Update launch playbook" GitHub Action for a league.</p></div>`;
    return;
  }
  if (!mine.some((x) => x.slug === opts.slug)) {
    opts.slug = mine[0].slug;
    opts.compare = mine[1]?.slug || '';
  }

  view.innerHTML = `
    <div class="panel">
      <div class="row spread">
        <div><h2>Launch Playbook</h2><div class="muted small">What each item did after league launch, measured in divines. Pick when you would buy and sell.</div></div>
      </div>
      <div class="row" style="margin-top:12px">
        <label class="muted small">League</label>
        <select id="slug">${mine.map((x) => `<option value="${x.slug}">${esc(x.league)} (${x.start}, ${x.days} days)</option>`).join('')}</select>
        <label class="muted small">Compare with</label>
        <select id="compare"><option value="">None</option>${mine.map((x) => `<option value="${x.slug}">${esc(x.league)}</option>`).join('')}</select>
        <label class="muted small">Buy day <b id="buyL">${opts.buy}</b></label>
        <input id="buy" type="range" min="1" max="14" value="${opts.buy}">
        <label class="muted small">Sell day <b id="sellL">${opts.sell}</b></label>
        <input id="sell" type="range" min="2" max="90" value="${opts.sell}">
      </div>
      <div class="row" style="margin-top:10px">
        <select id="type"></select>
        <label class="muted small">Min daily volume (week 1)</label>
        <input id="minVol" type="number" value="${opts.minVol}" style="width:90px">
        <input id="q" placeholder="Search…" value="${esc(opts.q)}">
        <label class="muted small"><input id="win" type="checkbox" ${opts.onlyWinners ? 'checked' : ''}> Only items that beat holding divines</label>
      </div>
    </div>
    <div id="summary"></div>
    <div class="panel"><div id="pbTable"><div class="loading">Crunching…</div></div></div>`;

  $('#slug', view).value = opts.slug;
  $('#compare', view).value = opts.compare;
  const redraw = () => draw(view, token);
  $('#slug', view).onchange = (e) => { opts.slug = e.target.value; redraw(); };
  $('#compare', view).onchange = (e) => { opts.compare = e.target.value; redraw(); };
  $('#buy', view).oninput = (e) => {
    opts.buy = +e.target.value;
    if (opts.sell <= opts.buy) { opts.sell = opts.buy + 1; $('#sell', view).value = opts.sell; }
    $('#buyL', view).textContent = opts.buy;
    $('#sellL', view).textContent = opts.sell;
    redraw();
  };
  $('#sell', view).oninput = (e) => {
    opts.sell = Math.max(+e.target.value, opts.buy + 1);
    $('#sellL', view).textContent = opts.sell;
    redraw();
  };
  $('#type', view).onchange = (e) => { opts.type = e.target.value; redraw(); };
  $('#minVol', view).onchange = (e) => { opts.minVol = +e.target.value || 0; redraw(); };
  $('#q', view).oninput = (e) => { opts.q = e.target.value; redraw(); };
  $('#win', view).onchange = (e) => { opts.onlyWinners = e.target.checked; redraw(); };
  redraw();
}

async function draw(view, token) {
  const main = await loadFile(opts.slug);
  const cmp = opts.compare && opts.compare !== opts.slug ? await loadFile(opts.compare) : null;
  if (!token()) return;
  const types = [...new Set(main.items.map((i) => i.type))];
  const typeSel = $('#type', view);
  if (typeSel.options.length !== types.length + 1) {
    typeSel.innerHTML = `<option value="All">All categories</option>${types.map((t) => `<option value="${t}">${esc(label(t))}</option>`).join('')}`;
  }
  if (!types.includes(opts.type)) opts.type = 'All';
  typeSel.value = opts.type;

  const cmpById = cmp ? Object.fromEntries(cmp.items.map((i) => [`${i.type}|${i.id}`, i])) : {};
  const { buy, sell } = opts;
  const q = opts.q.toLowerCase();
  let rows = [];
  for (const it of main.items) {
    if (opts.type !== 'All' && it.type !== opts.type) continue;
    if (q && !it.name.toLowerCase().includes(q)) continue;
    const b = at(it.v, buy);
    const s = at(it.v, sell);
    if (!b || !s) continue;
    const vol = avgVol(it, 1, 7);
    if (vol < opts.minVol) continue;
    const x = s / b;
    if (opts.onlyWinners && x <= 1) continue;
    let best = { day: null, x: 0 };
    for (let d = buy + 1; d <= Math.min(buy + 45, it.v.length); d++) {
      const v = it.v[d - 1];
      if (v != null && v / b > best.x) best = { day: d, x: v / b };
    }
    const c = cmpById[`${it.type}|${it.id}`];
    const cx = c && at(c.v, buy) && at(c.v, sell) ? at(c.v, sell) / at(c.v, buy) : null;
    rows.push({ it, b, s, x, best, vol, cx, c });
  }
  const sorters = { x: (r) => r.x, cx: (r) => r.cx ?? -1, best: (r) => r.best.x, name: (r) => r.it.name, buy: (r) => r.b, vol: (r) => r.vol };
  rows.sort((a, b) => {
    const k = sorters[opts.sort];
    const va = k(a), vb = k(b);
    return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * opts.dir;
  });

  // Summary
  const xs = rows.map((r) => r.x);
  const winners = xs.filter((x) => x > 1).length;
  const unit = main.game === 'poe1' ? 'chaos' : 'exalted';
  const divB = at(main.unitPerDiv[unit], buy);
  const divS = at(main.unitPerDiv[unit], sell);
  const both = rows.filter((r) => r.cx != null);
  const consistent = both.filter((r) => r.x > 1 && r.cx > 1).length;
  $('#summary', view).innerHTML = `
    <div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:14px">
      <div class="stat"><b>${rows.length}</b><span>items match your filters</span></div>
      <div class="stat"><b>${xfmt(median(xs))}</b><span>typical item, day ${buy} → ${sell}</span></div>
      <div class="stat"><b>${xs.length ? Math.round((winners / xs.length) * 100) : 0}%</b><span>beat holding divines</span></div>
      <div class="stat"><b>${fmt(divB)} → ${fmt(divS)}</b><span>${unit} per divine (${divB && divS ? xfmt(divS / divB) : '–'})</span></div>
      ${cmp ? `<div class="stat"><b>${consistent}</b><span>won in both leagues (of ${both.length} in both)</span></div>` : ''}
    </div>`;

  const shown = rows.slice(0, 300);
  const box = $('#pbTable', view);
  box.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr>
        <th data-s="name">Item</th><th>Category</th>
        <th class="num" data-s="buy">Day ${buy} price</th>
        <th class="num" data-s="x">Day ${sell}</th>
        ${cmp ? `<th class="num" data-s="cx">${esc(cmp.league)}</th>` : ''}
        <th class="num" data-s="best">Best sell (≤45d)</th>
        <th>First 45 days</th>
        <th class="num" data-s="vol">Vol/day</th>
        <th class="admin-only"></th>
      </tr></thead>
      <tbody>${shown
        .map(
          (r, i) => `<tr class="clickable" data-i="${i}">
          <td><div class="name"><img class="icon" loading="lazy" src="${esc(iconFor(r.it.type, r.it.icon))}"><span>${esc(r.it.name)}</span></div></td>
          <td class="muted small">${esc(label(r.it.type))}</td>
          <td class="num">${fmt(r.b)} div</td>
          <td class="num ${cls(r.x, 1)}"><b>${xfmt(r.x)}</b></td>
          ${cmp ? `<td class="num ${cls(r.cx, 1)}">${xfmt(r.cx)}</td>` : ''}
          <td class="num">${r.best.day ? `${xfmt(r.best.x)} <span class="muted small">d${r.best.day}</span>` : '–'}</td>
          <td>${sparkline(r.it.v.slice(0, 45), 120, 24)}</td>
          <td class="num muted">${fmt(r.vol, 0)}</td>
          <td class="admin-only"><button class="small ghost" data-watch="${i}">+ Watch</button></td>
        </tr>`,
        )
        .join('')}</tbody></table></div>
    <div class="muted small" style="margin-top:6px">Multiples are in divines: 2x means the item doubled against divines. ${rows.length > 300 ? `Showing top 300 of ${rows.length}.` : ''}</div>`;
  $$('th[data-s]', box).forEach((th) => {
    th.onclick = () => {
      const s = th.dataset.s;
      opts.dir = opts.sort === s ? -opts.dir : s === 'name' ? 1 : -1;
      opts.sort = s;
      draw(view, token);
    };
  });
  $('tbody', box).onclick = async (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const r = shown[+tr.dataset.i];
    const w = e.target.closest('[data-watch]');
    if (w) {
      e.stopPropagation();
      const p = await import('./portfolio.js');
      p.addToWatchlist(
        { kind: 'exchange', type: r.it.type, id: r.it.id, name: r.it.name, icon: iconFor(r.it.type, r.it.icon) },
        { buyWindow: `Day ${buy}`, sellWindow: r.best.day ? `Around day ${r.best.day}` : `Day ${sell}`, history: `${main.league}: ${xfmt(r.x)} by day ${sell}${r.cx != null ? `, ${cmp.league}: ${xfmt(r.cx)}` : ''}` },
      );
      return;
    }
    showCurve(r, main, cmp);
  };
}

function showCurve(r, main, cmp) {
  const norm = (arr, b) => arr.map((v, i) => [i + 1, v != null && b ? v / b : null]).slice(0, 60);
  const series = [{ name: main.league, color: 'var(--gold)', data: norm(r.it.v, at(r.it.v, opts.buy)) }];
  if (r.c) series.push({ name: cmp.league, color: 'var(--blue)', data: norm(r.c.v, at(r.c.v, opts.buy)) });
  const divUnit = main.game === 'poe1' ? 'chaos' : 'exalted';
  openModal(`
    <div class="row"><img class="icon" src="${esc(iconFor(r.it.type, r.it.icon))}"><h2>${esc(r.it.name)}</h2><span class="tag">${esc(label(r.it.type))}</span></div>
    <p class="muted small">Value relative to day ${opts.buy} (1.0 = your buy price), in divines, first 60 days.</p>
    ${lineChart(series, { yLabel: 'x of buy price', markers: [{ x: opts.buy, label: 'buy' }, { x: opts.sell, label: 'sell', color: 'var(--pos)' }] })}
    <div class="grid3" style="margin-top:10px">
      <div class="stat"><b>${fmt(r.b)}</b><span>day ${opts.buy} price (div), about ${fmt(r.b * (at(main.unitPerDiv[divUnit], opts.buy) || 0))} ${divUnit}</span></div>
      <div class="stat"><b>${xfmt(r.x)}</b><span>by day ${opts.sell}</span></div>
      <div class="stat"><b>${xfmt(r.best.x)}</b><span>best, on day ${r.best.day ?? '–'}</span></div>
    </div>`);
}
