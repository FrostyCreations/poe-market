import { $, $$, esc, fmt, xfmt, cls, uid, state, loadData, saveData, loadCategory, openModal, closeModal, price, secondaryUnit, toDiv, toast, exchange } from './app.js';
import { label } from './config.js';

// ---------- generic form modal ----------
export function formModal(title, fields, values, onSave) {
  const input = (f) => {
    const v = values[f.k] ?? f.default ?? '';
    if (f.type === 'select') return `<select name="${f.k}">${f.options.map((o) => `<option ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (f.type === 'textarea') return `<textarea name="${f.k}">${esc(v)}</textarea>`;
    return `<input name="${f.k}" type="${f.type || 'text'}" ${f.type === 'number' ? 'step="any"' : ''} value="${esc(v)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>`;
  };
  openModal(
    `<h2>${esc(title)}</h2>
     <form class="form" id="f">${fields.map((f) => `<label>${esc(f.label)}</label>${input(f)}`).join('')}</form>
     <div class="row" style="justify-content:flex-end"><button class="ghost" id="cancel">Cancel</button><button id="save">Save</button></div>`,
    (m) => {
      $('#cancel', m).onclick = closeModal;
      $('#save', m).onclick = async () => {
        const out = { ...values };
        for (const f of fields) {
          const el = m.querySelector(`[name="${f.k}"]`);
          out[f.k] = f.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
        }
        $('#save', m).disabled = true;
        try {
          await onSave(out);
          closeModal();
        } catch {
          $('#save', m).disabled = false;
        }
      };
    },
  );
}

// ---------- public helpers used from other tabs ----------
export async function addToWatchlist(row, extra = {}) {
  const list = await loadData('watchlist', []);
  formModal(
    `Watch: ${row.name}`,
    [
      { k: 'priority', label: 'Priority', type: 'select', options: ['High', 'Medium', 'Low'] },
      { k: 'buyWindow', label: 'Buy when', placeholder: 'e.g. Day 1-2' },
      { k: 'sellWindow', label: 'Sell when', placeholder: 'e.g. Day 8-12' },
      { k: 'targetX', label: 'Target (x of buy)', type: 'number' },
      { k: 'history', label: 'Past leagues', placeholder: 'e.g. Allflame 7.2x by day 7' },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    { priority: 'Medium', ...extra },
    async (v) => {
      const entry = { uid: uid(), game: state.game, kind: row.kind, type: row.type, id: row.id, name: row.name, icon: row.icon, ...v };
      await saveData('watchlist', [...list, entry], `Watch ${row.name}`);
      if (location.hash.startsWith('#portfolio')) (await import('./app.js')).render();
    },
  );
}

export async function addHolding(row, preset = {}) {
  const list = await loadData('portfolio', []);
  const sec = secondaryUnit();
  const units = state.game === 'poe1' ? ['chaos', 'divine'] : ['exalted', 'divine', 'chaos'];
  const nowPrice = sec === 'chaos' ? row.chaos : row.exalted;
  formModal(
    `Log a buy: ${row.name}`,
    [
      { k: 'qty', label: 'Quantity', type: 'number', default: 1 },
      { k: 'buyPrice', label: 'Price each', type: 'number' },
      { k: 'buyUnit', label: 'Paid in', type: 'select', options: units },
      { k: 'date', label: 'Date', type: 'date' },
      { k: 'targetX', label: 'Sell target (x)', type: 'number' },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    { qty: 1, buyPrice: nowPrice ? Number(nowPrice.toPrecision(3)) : null, buyUnit: sec, date: new Date().toISOString().slice(0, 10), ...preset },
    async (v) => {
      const costDiv = toDiv(v.buyPrice, v.buyUnit);
      const entry = { uid: uid(), game: state.game, league: state.league, kind: row.kind, type: row.type, id: row.id, name: row.name, icon: row.icon, variant: row.variant || '', ...v, costDiv };
      await saveData('portfolio', [...list, entry], `Buy ${v.qty}x ${row.name}`);
      if (location.hash.startsWith('#portfolio')) (await import('./app.js')).render();
    },
  );
}

// ---------- live prices ----------
async function priceMap(entries, league) {
  const map = {};
  const keys = [...new Set(entries.map((e) => `${e.game}|${e.league || league}|${e.type}`))];
  await Promise.all(
    keys.map(async (k) => {
      const [game, lg, type] = k.split('|');
      if (game !== state.game) return;
      try {
        const d = await loadCategory(game, lg, type);
        for (const r of d.rows) {
          map[`${k}|${r.id}`] = r;
          map[`${k}|name|${r.name}|${r.variant || ''}`] ||= r;
        }
      } catch {}
    }),
  );
  return (e) => map[`${e.game}|${e.league || league}|${e.type}|${e.id}`] || map[`${e.game}|${e.league || league}|${e.type}|name|${e.name}|${e.variant || ''}`];
}

// ---------- view ----------
export async function render(view, { token }) {
  const [watch, holds, notes] = await Promise.all([loadData('watchlist', []), loadData('portfolio', []), loadData('notes', { text: '' })]);
  if (!token()) return;
  const gw = watch.filter((w) => (w.game || 'poe1') === state.game);
  const gh = holds.filter((h) => (h.game || 'poe1') === state.game);
  const [lookupW, lookupH] = await Promise.all([priceMap(gw, state.league), priceMap(gh, state.league)]);
  let mirror = null;
  try {
    mirror = (await exchange(state.game, state.league, 'Currency')).rows.find((r) => /mirror of kalandra/i.test(r.name));
  } catch {}
  if (!token()) return;
  const sec = secondaryUnit();

  // Holdings maths
  let cost = 0, value = 0, realised = 0;
  const hrows = gh.map((h) => {
    const live = lookupH(h);
    const unitCost = h.costDiv ?? toDiv(h.buyPrice, h.buyUnit);
    const nowUnit = h.soldDiv ?? live?.div ?? null;
    const c = (unitCost || 0) * (h.qty || 0);
    const v = nowUnit != null ? nowUnit * (h.qty || 0) : null;
    if (h.soldDiv != null) realised += (v || 0) - c;
    else { cost += c; value += v || 0; }
    return { h, live, unitCost, nowUnit, c, v, x: unitCost && nowUnit ? nowUnit / unitCost : null };
  });
  const open = hrows.filter((r) => r.h.soldDiv == null);
  const sold = hrows.filter((r) => r.h.soldDiv != null);
  const mirrorDiv = mirror?.div;

  view.innerHTML = `
    <div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:14px">
      <div class="stat"><b>${fmt(value)} div</b><span>value of open positions (${fmt(cost)} div cost)</span></div>
      <div class="stat"><b class="${cls(value - cost)}">${fmt(value - cost)} div</b><span>unrealised profit ${cost ? `(${xfmt(value / cost)})` : ''}</span></div>
      <div class="stat"><b class="${cls(realised)}">${fmt(realised)} div</b><span>realised profit from sales</span></div>
      <div class="stat"><b>${mirrorDiv ? `${(((value + realised) / mirrorDiv) * 100).toFixed(1)}%` : '–'}</b><span>of a Mirror (${mirrorDiv ? fmt(mirrorDiv) + ' div' : 'no price'})</span>
        <div class="bar" style="margin-top:6px"><div style="width:${mirrorDiv ? Math.min(100, ((value + realised) / mirrorDiv) * 100) : 0}%"></div></div></div>
    </div>

    <div class="panel">
      <div class="row spread"><div><h2>Watchlist</h2><div class="muted small">Your shopping list with live ${esc(state.league)} prices. Add items from Market or Playbook.</div></div>
        <div class="row"><select id="wPri"><option value="">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select></div></div>
      <div id="wTable" style="margin-top:10px"></div>
    </div>

    <div class="panel">
      <div class="row spread"><div><h2>Holdings</h2><div class="muted small">Logged buys, valued live in divines.</div></div></div>
      <div id="hTable" style="margin-top:10px"></div>
      ${sold.length ? `<h3 style="margin-top:16px">Sold</h3><div id="sTable" style="margin-top:8px"></div>` : ''}
    </div>

    <div class="panel">
      <div class="row spread"><h2>Plan notes</h2><button class="admin-only small" id="saveNotes">Save notes</button></div>
      <textarea id="notes" ${state.admin ? '' : 'readonly'} style="margin-top:10px;min-height:180px">${esc(notes.text || '')}</textarea>
    </div>`;

  // Watchlist table
  const drawWatch = () => {
    const pri = $('#wPri', view).value;
    const rows = gw.filter((w) => !pri || w.priority === pri);
    const order = { High: 0, Medium: 1, Low: 2 };
    rows.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
    $('#wTable', view).innerHTML = rows.length
      ? `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Priority</th><th class="num">Now</th><th class="num">7d</th><th>Buy</th><th>Sell</th><th>Past leagues</th><th>Notes</th><th class="admin-only"></th></tr></thead><tbody>
        ${rows.map((w) => {
          const live = lookupW(w);
          return `<tr data-uid="${w.uid}">
            <td><div class="name">${w.icon ? `<img class="icon" src="${esc(w.icon)}">` : ''}<div>${esc(w.name)}<small>${esc(label(w.type))}</small></div></div></td>
            <td><span class="tag ${w.priority === 'High' ? 'gold' : ''}">${esc(w.priority || '')}</span></td>
            <td class="num">${live ? `${price(live.div, 'divine')}<br><span class="muted small">${price(sec === 'chaos' ? live.chaos : live.exalted, sec)}</span>` : '<span class="muted small">not in this league yet</span>'}</td>
            <td class="num ${cls(live?.change)}">${live?.change != null ? `${live.change > 0 ? '+' : ''}${live.change.toFixed(0)}%` : '–'}</td>
            <td class="small">${esc(w.buyWindow || '')}</td><td class="small">${esc(w.sellWindow || '')}${w.targetX ? `<br><span class="muted">target ${xfmt(w.targetX)}</span>` : ''}</td>
            <td class="small muted">${esc(w.history || '')}</td><td class="small" style="max-width:260px">${esc(w.notes || '')}</td>
            <td class="admin-only" style="white-space:nowrap"><button class="small ghost" data-a="buy">Bought</button> <button class="small ghost" data-a="edit">Edit</button> <button class="small danger" data-a="del">✕</button></td></tr>`;
        }).join('')}</tbody></table></div>`
      : '<div class="empty-state">Nothing on the watchlist for this game yet.</div>';
  };
  $('#wPri', view).onchange = drawWatch;
  drawWatch();
  $('#wTable', view).onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    const id = e.target.closest('tr[data-uid]')?.dataset.uid;
    if (!a || !id) return;
    const w = watch.find((x) => x.uid === id);
    if (a === 'del') {
      if (!confirm(`Remove ${w.name} from the watchlist?`)) return;
      await saveData('watchlist', watch.filter((x) => x.uid !== id), `Unwatch ${w.name}`);
      render(view, { token });
    } else if (a === 'edit') {
      formModal(`Edit: ${w.name}`, [
        { k: 'priority', label: 'Priority', type: 'select', options: ['High', 'Medium', 'Low'] },
        { k: 'buyWindow', label: 'Buy when' }, { k: 'sellWindow', label: 'Sell when' },
        { k: 'targetX', label: 'Target (x of buy)', type: 'number' }, { k: 'history', label: 'Past leagues' },
        { k: 'notes', label: 'Notes', type: 'textarea' },
      ], w, async (v) => {
        await saveData('watchlist', watch.map((x) => (x.uid === id ? v : x)), `Edit ${w.name}`);
        render(view, { token });
      });
    } else if (a === 'buy') {
      const live = lookupW(w) || { ...w };
      addHolding({ ...live, kind: w.kind, type: w.type, id: w.id, name: w.name, icon: w.icon }, { targetX: w.targetX });
    }
  };

  // Holdings table
  const holdTable = (rows, isSold) =>
    rows.length
      ? `<div class="table-wrap"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Paid each</th><th class="num">Cost</th><th class="num">${isSold ? 'Sold for' : 'Value now'}</th><th class="num">Profit</th><th class="num">x</th><th>Target</th><th>League</th><th class="admin-only"></th></tr></thead><tbody>
        ${rows.map((r) => `<tr data-uid="${r.h.uid}">
          <td><div class="name">${r.h.icon ? `<img class="icon" src="${esc(r.h.icon)}">` : ''}<div>${esc(r.h.name)}<small>${esc([label(r.h.type), r.h.variant].filter(Boolean).join(' · '))}${r.h.notes ? ` · ${esc(r.h.notes)}` : ''}</small></div></div></td>
          <td class="num">${fmt(r.h.qty, 0)}</td>
          <td class="num">${price(r.h.buyPrice, r.h.buyUnit)}</td>
          <td class="num">${fmt(r.c)} div</td>
          <td class="num">${r.v != null ? `${fmt(r.v)} div` : '<span class="muted small">no price</span>'}</td>
          <td class="num ${cls(r.v != null ? r.v - r.c : null)}">${r.v != null ? fmt(r.v - r.c) : '–'}</td>
          <td class="num ${cls(r.x, 1)}"><b>${xfmt(r.x)}</b></td>
          <td class="small">${r.h.targetX ? `${xfmt(r.h.targetX)} ${r.x >= r.h.targetX ? '<span class="tag good">hit</span>' : ''}` : ''}</td>
          <td class="small muted">${esc(r.h.league || '')}<br>${esc(r.h.date || '')}</td>
          <td class="admin-only" style="white-space:nowrap">${isSold ? '' : '<button class="small ghost" data-a="sell">Sold</button> '}<button class="small ghost" data-a="edit">Edit</button> <button class="small danger" data-a="del">✕</button></td>
        </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state">No open positions. Use "+ Buy" in Market or "Bought" on the watchlist.</div>';
  $('#hTable', view).innerHTML = holdTable(open, false);
  if (sold.length) $('#sTable', view).innerHTML = holdTable(sold, true);

  const onHold = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    const id = e.target.closest('tr[data-uid]')?.dataset.uid;
    if (!a || !id) return;
    const h = holds.find((x) => x.uid === id);
    const units = state.game === 'poe1' ? ['chaos', 'divine'] : ['exalted', 'divine', 'chaos'];
    if (a === 'del') {
      if (!confirm(`Delete ${h.name}?`)) return;
      await saveData('portfolio', holds.filter((x) => x.uid !== id), `Remove ${h.name}`);
    } else if (a === 'sell') {
      const live = lookupH(h);
      return formModal(`Sold: ${h.name}`, [
        { k: 'soldPrice', label: 'Price each', type: 'number' },
        { k: 'soldUnit', label: 'Received in', type: 'select', options: units },
        { k: 'soldDate', label: 'Date', type: 'date' },
      ], { soldPrice: live ? (sec === 'chaos' ? live.chaos : live.exalted) : null, soldUnit: sec, soldDate: new Date().toISOString().slice(0, 10) }, async (v) => {
        const soldDiv = toDiv(v.soldPrice, v.soldUnit);
        await saveData('portfolio', holds.map((x) => (x.uid === id ? { ...x, ...v, soldDiv } : x)), `Sold ${h.name}`);
        render(view, { token });
      });
    } else if (a === 'edit') {
      return formModal(`Edit: ${h.name}`, [
        { k: 'qty', label: 'Quantity', type: 'number' }, { k: 'buyPrice', label: 'Price each', type: 'number' },
        { k: 'buyUnit', label: 'Paid in', type: 'select', options: units }, { k: 'costDiv', label: 'Cost each in divines', type: 'number' },
        { k: 'targetX', label: 'Sell target (x)', type: 'number' }, { k: 'notes', label: 'Notes', type: 'textarea' },
      ], h, async (v) => {
        await saveData('portfolio', holds.map((x) => (x.uid === id ? v : x)), `Edit ${h.name}`);
        render(view, { token });
      });
    }
    render(view, { token });
  };
  $('#hTable', view).onclick = onHold;
  if (sold.length) $('#sTable', view).onclick = onHold;

  const saveBtn = $('#saveNotes', view);
  if (saveBtn) saveBtn.onclick = async () => {
    await saveData('notes', { text: $('#notes', view).value }, 'Update plan notes');
  };
  if (!state.admin && !gw.length && !gh.length) toast('Log in as admin to add items');
}
