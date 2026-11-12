import { GAMES } from './config.js';

// ---------- small helpers ----------
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const uid = () => Math.random().toString(36).slice(2, 10);

export function fmt(v, digits) {
  if (v == null || !isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'm';
  if (a >= 1e4) return (v / 1e3).toFixed(1) + 'k';
  if (digits != null) return v.toFixed(digits);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(3);
  return v.toPrecision(2);
}
export const pct = (v) => (v == null || !isFinite(v) ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(0)}%`);
export const xfmt = (v) => (v == null || !isFinite(v) ? '–' : `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}x`);
export const cls = (v, mid = 0) => (v == null ? '' : v > mid ? 'pos' : v < mid ? 'neg' : '');

export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), ms);
}

export function openModal(html, onMount) {
  $('#modalCard').innerHTML = html;
  $('#modal').classList.remove('hidden');
  onMount?.($('#modalCard'));
}
export function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modalCard').innerHTML = '';
}
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

export function sparkline(data, w = 90, h = 24) {
  const pts = (data || []).map((v, i) => [i, v]).filter(([, v]) => v != null && isFinite(v));
  if (pts.length < 2) return '';
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x) => ((x - x0) / (x1 - x0 || 1)) * (w - 2) + 1;
  const sy = (y) => h - 1 - ((y - y0) / (y1 - y0 || 1)) * (h - 2);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('');
  const up = ys[ys.length - 1] >= ys[0];
  return `<svg class="spark" width="${w}" height="${h}"><path d="${d}" fill="none" stroke="${up ? 'var(--pos)' : 'var(--neg)'}" stroke-width="1.5"/></svg>`;
}

// Line chart: series = [{ name, color, data: [[x, y], ...] }]
export function lineChart(series, { yLabel = '', xLabel = 'Day', log = false, height = 220, markers = [] } = {}) {
  const W = 680, H = height, L = 52, R = 12, T = 10, B = 26;
  const all = series.flatMap((s) => s.data).filter(([, y]) => y != null && isFinite(y) && (!log || y > 0));
  if (!all.length) return '<div class="empty-state">No history</div>';
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => (log ? Math.log10(p[1]) : p[1]));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const sx = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const sy = (y) => T + (1 - ((log ? Math.log10(y) : y) - y0) / (y1 - y0)) * (H - T - B);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const yv = y0 + ((y1 - y0) * i) / 4;
    const y = T + (1 - i / 4) * (H - T - B);
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#2a2419"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${fmt(log ? 10 ** yv : yv)}</text>`;
  }
  for (let i = 0; i <= 5; i++) {
    const xv = Math.round(x0 + ((x1 - x0) * i) / 5);
    g += `<text x="${sx(xv)}" y="${H - 6}" text-anchor="middle">${xLabel} ${xv}</text>`;
  }
  for (const m of markers) {
    g += `<line x1="${sx(m.x)}" x2="${sx(m.x)}" y1="${T}" y2="${H - B}" stroke="${m.color || 'var(--gold)'}" stroke-dasharray="4 3"/><text x="${sx(m.x) + 4}" y="${T + 10}" fill="${m.color || 'var(--gold)'}">${esc(m.label)}</text>`;
  }
  const paths = series
    .map((s) => {
      const pts = s.data.filter(([, y]) => y != null && isFinite(y) && (!log || y > 0));
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('');
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    })
    .join('');
  const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `${legend}<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">${g}${paths}<text x="${L + 6}" y="${T + 12}">${esc(yLabel)}</text></svg>`;
}

// ---------- API ----------
const cache = new Map();
export async function ninja(path, params = {}, { ttl = 5 * 60_000 } = {}) {
  const qs = new URLSearchParams({ path, ...params }).toString();
  const key = qs;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.p;
  const p = fetch(`/api/ninja?${qs}`).then(async (r) => {
    if (!r.ok) throw new Error(`poe.ninja ${r.status}`);
    return r.json();
  });
  cache.set(key, { t: Date.now(), p });
  p.catch(() => cache.delete(key));
  return p;
}

// poe.ninja returns icon paths like /gen/image/...; the files are served from the game's CDN.
export const ninjaImg = (p) => (!p ? '' : p.startsWith('http') ? p.replace('https://poe.ninja/gen/', 'https://web.poecdn.com/gen/') : `https://web.poecdn.com${p}`);
// poe.ninja has no art for divination cards in the exchange data, so use the in-game card icon.
const DIV_CARD_ICON = 'https://web.poecdn.com/image/Art/2DItems/Divination/InventoryIcon.png';
export const iconFor = (type, p) => ninjaImg(p) || (/divination|cards/i.test(type) ? DIV_CARD_ICON : '');

// Normalised exchange overview: prices in every unit we know about.
export async function exchange(game, league, type) {
  const j = await ninja(`${game}/api/economy/exchange/current/overview`, { league, type });
  const meta = Object.fromEntries((j.items || []).map((x) => [x.id, x]));
  const primary = j.core?.primary || 'chaos';
  const rates = j.core?.rates || {}; // units per 1 primary
  const toDiv = primary === 'divine' ? 1 : rates.divine || null;
  const rows = (j.lines || []).map((l) => {
    const m = meta[l.id] || {};
    const value = l.primaryValue;
    const div = toDiv ? value * toDiv : null;
    return {
      kind: 'exchange', type, id: l.id, detailsId: m.detailsId, name: m.name || l.id,
      icon: iconFor(type, m.image), value, div,
      chaos: primary === 'chaos' ? value : rates.chaos ? value * rates.chaos : null,
      exalted: primary === 'exalted' ? value : rates.exalted ? value * rates.exalted : null,
      change: l.sparkline?.totalChange ?? null, spark: l.sparkline?.data || [],
      volume: l.volumePrimaryValue ?? null,
    };
  });
  return { rows, primary, rates, core: j.core };
}

// Normalised item (stash) overview, PoE1 only.
export async function items(league, type) {
  const j = await ninja('poe1/api/economy/stash/current/item/overview', { league, type });
  const rows = (j.lines || []).map((l) => ({
    kind: 'item', type, id: l.id, detailsId: l.detailsId, name: l.name, icon: l.icon,
    variant: l.variant || '', baseType: l.baseType || '', level: l.levelRequired,
    gemLevel: l.gemLevel, gemQuality: l.gemQuality, corrupted: !!l.corrupted, links: l.links,
    value: l.chaosValue, chaos: l.chaosValue, div: l.divineValue, exalted: null,
    change: l.sparkLine?.totalChange ?? null, spark: l.sparkLine?.data || [], volume: l.listingCount ?? null,
  }));
  return { rows, primary: 'chaos' };
}

export function loadCategory(game, league, type) {
  return GAMES[game].itemTypes.includes(type) ? items(league, type) : exchange(game, league, type);
}

// ---------- user data (GitHub-backed) ----------
const dataCache = {};
export async function loadData(file, fallback = []) {
  if (dataCache[file]) return dataCache[file];
  try {
    const r = await fetch(`/api/data?file=${file}`);
    const j = await r.json();
    state.storage = j.storage;
    dataCache[file] = j.data && (Array.isArray(j.data) ? j.data.length : Object.keys(j.data).length) ? j.data : fallback;
  } catch {
    dataCache[file] = fallback;
  }
  return dataCache[file];
}
export async function saveData(file, data, message) {
  dataCache[file] = data;
  const r = await fetch(`/api/data?file=${file}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': encodeURIComponent(state.adminKey || '') },
    body: JSON.stringify({ data, message }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    toast(`Save failed: ${j.error || r.status}`, 5000);
    throw new Error(j.error);
  }
  toast(j.local ? 'Saved (local file)' : 'Saved to GitHub');
  return j;
}

// ---------- app state ----------
export const state = {
  game: localStorage.getItem('game') || 'poe1',
  league: null,
  leagues: { poe1: [], poe2: [] },
  admin: false,
  adminKey: localStorage.getItem('adminKey') || '',
  storage: null,
  divRate: null, // units per divine for the current league, e.g. { chaos: 420 }
  coreIcons: {},
};

export function unitIcon(unit) {
  const src = state.coreIcons[unit];
  return src ? `<img class="icon sm" src="${src}" alt="${unit}" title="${unit}">` : unit[0];
}
// Shows a price with the right currency icon. value is in "unit".
export function price(value, unit) {
  return `<span class="price">${fmt(value)} ${unitIcon(unit)}</span>`;
}
export const secondaryUnit = () => (state.game === 'poe1' ? 'chaos' : 'exalted');

async function loadLeagues(game) {
  if (state.leagues[game].length) return state.leagues[game];
  const j = await ninja(`${game}/api/data/index-state`, {}, { ttl: 30 * 60_000 });
  const cur = (j.economyLeagues || []).map((l) => ({ ...l, old: false }));
  const old = (j.oldEconomyLeagues || []).map((l) => ({ ...l, old: true }));
  state.leagues[game] = [...cur, ...old];
  return state.leagues[game];
}

async function refreshRates() {
  const el = $('#rates');
  el.innerHTML = '';
  try {
    const { core, rows } = await exchange(state.game, state.league, 'Currency');
    for (const it of core.items || []) state.coreIcons[it.id] = ninjaImg(it.image);
    const div = rows.find((r) => r.id === 'divine');
    state.divRate = {};
    if (state.game === 'poe1') {
      state.divRate.chaos = div?.chaos;
      el.innerHTML = `<span>${unitIcon('divine')} = ${fmt(div?.chaos)} ${unitIcon('chaos')}</span>`;
    } else {
      state.divRate.exalted = core.rates?.exalted;
      state.divRate.chaos = core.rates?.chaos;
      el.innerHTML = `<span>${unitIcon('divine')} = ${fmt(core.rates?.exalted)} ${unitIcon('exalted')}</span><span>${fmt(core.rates?.chaos)} ${unitIcon('chaos')}</span>`;
    }
    const mirror = rows.find((r) => /mirror of kalandra/i.test(r.name));
    if (mirror) el.innerHTML += `<span title="Mirror of Kalandra">${mirror.icon ? `<img class="icon sm" src="${mirror.icon}">` : 'Mirror'} = ${fmt(mirror.div)} ${unitIcon('divine')}</span>`;
  } catch {
    el.textContent = 'rates unavailable';
  }
}

// Converts a price in any unit to divines using the live rate.
export function toDiv(value, unit) {
  if (value == null) return null;
  if (unit === 'divine') return value;
  const r = state.divRate?.[unit];
  return r ? value / r : null;
}

async function fillLeagueSelect() {
  const sel = $('#league');
  const leagues = await loadLeagues(state.game);
  const saved = localStorage.getItem(`league-${state.game}`);
  const challenge = leagues.find((l) => !l.old && !/hardcore|\bhc\b|standard|ruthless|ssf/i.test(l.name));
  const def = challenge || leagues[0];
  const savedEntry = leagues.find((l) => l.name === saved);
  // A remembered league that has since ended gives way to the new challenge league.
  state.league = savedEntry && !(savedEntry.old && challenge) ? saved : def?.name;
  state.liveChallenge = Boolean(challenge);
  sel.innerHTML = [
    `<optgroup label="Current">${leagues.filter((l) => !l.old).map((l) => `<option>${esc(l.name)}</option>`).join('')}</optgroup>`,
    `<optgroup label="Past leagues">${leagues.filter((l) => l.old).map((l) => `<option>${esc(l.name)}</option>`).join('')}</optgroup>`,
  ].join('');
  sel.value = state.league;
}

// ---------- admin ----------
async function checkAdmin(key) {
  try {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'x-admin-key': encodeURIComponent(key) } });
    const j = await r.json();
    state.storage = j.storage;
    state.passwordSet = j.passwordSet;
    return j.admin;
  } catch {
    return false;
  }
}
function setAdmin(on) {
  state.admin = on;
  document.body.classList.toggle('is-admin', on);
  $('#adminBtn').textContent = on ? 'Admin ✓' : 'Admin';
}
$('#adminBtn').addEventListener('click', () => {
  if (state.admin) {
    openModal(`<h2>Admin</h2><p class="muted">You can edit the watchlist, portfolio and builds. Data is saved to ${state.storage === 'github' ? 'GitHub' : 'a local file (GitHub not configured yet)'}.</p><div class="row"><button id="logout" class="danger">Log out</button><button id="close">Close</button></div>`, (m) => {
      $('#logout', m).onclick = () => { localStorage.removeItem('adminKey'); state.adminKey = ''; setAdmin(false); closeModal(); render(); };
      $('#close', m).onclick = closeModal;
    });
    return;
  }
  openModal(`<h2>Admin login</h2><p class="muted">Friends can view everything. Editing needs the admin password set in Vercel (ADMIN_PASSWORD).</p>
    <div class="row"><input id="pw" type="text" class="masked" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore placeholder="Password" style="flex:1"><button id="go">Log in</button></div>
    <div class="row spread small"><label class="muted"><input type="checkbox" id="showpw"> Show password</label><span class="muted" id="pwcount">0 characters typed</span></div>
    <div class="small" id="pwmsg" style="margin-top:6px"></div>`, (m) => {
    $('#pw', m).oninput = (e) => ($('#pwcount', m).textContent = `${e.target.value.length} characters typed`);
    $('#showpw', m).onchange = (e) => $('#pw', m).classList.toggle('masked', !e.target.checked);
    const go = async () => {
      const key = $('#pw', m).value;
      if (await checkAdmin(key)) {
        state.adminKey = key;
        localStorage.setItem('adminKey', key);
        setAdmin(true);
        closeModal();
        toast('Admin mode on');
        render();
      } else {
        const msg = state.passwordSet === false ? 'The server has no ADMIN_PASSWORD set yet.' : `Wrong password (you typed ${key.length} characters). The value saved in Vercel is different.`;
        $('#pwmsg', m).innerHTML = `<span class="neg">${esc(msg)}</span>`;
      }
    };
    $('#go', m).onclick = go;
    $('#pw', m).onkeydown = (e) => { if (e.key === 'Enter') go(); };
    $('#pw', m).focus();
  });
});

// ---------- routing ----------
const views = {
  brief: () => import('./brief.js'),
  market: () => import('./market.js'),
  playbook: () => import('./playbook.js'),
  portfolio: () => import('./portfolio.js'),
  crafting: () => import('./crafting.js'),
  builds: () => import('./builds.js'),
  atlas: () => import('./atlas.js'),
  faustus: () => import('./faustus.js'),
};
let renderToken = 0;
export async function render() {
  const tab = (location.hash || '#brief').slice(1).split('/')[0];
  const name = views[tab] ? tab : 'brief';
  $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
  const view = $('#view');
  const token = ++renderToken;
  view.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const mod = await views[name]();
    if (token !== renderToken) return;
    await mod.render(view, { token: () => token === renderToken });
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="panel"><h3>Something went wrong</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}

window.addEventListener('hashchange', render);
$('#game').addEventListener('change', async (e) => {
  state.game = e.target.value;
  localStorage.setItem('game', state.game);
  await fillLeagueSelect();
  await refreshRates();
  render();
});
$('#league').addEventListener('change', async (e) => {
  state.league = e.target.value;
  localStorage.setItem(`league-${state.game}`, state.league);
  await refreshRates();
  render();
});

(async function init() {
  $('#game').value = state.game;
  await fillLeagueSelect();
  await refreshRates();
  if (state.adminKey && (await checkAdmin(state.adminKey))) setAdmin(true);
  render();
})();
