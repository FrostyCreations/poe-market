import { $, esc, fmt, state, loadCategory, price, secondaryUnit } from './app.js';

let timer = null;

function countdown(el, target) {
  const tick = () => {
    if (!document.body.contains(el)) return clearInterval(timer);
    const ms = Date.parse(target) - Date.now();
    if (ms <= 0) {
      el.innerHTML = '<div class="live-badge">League is live</div>';
      return clearInterval(timer);
    }
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
    el.innerHTML = [['days', d], ['hours', h], ['min', m], ['sec', s]]
      .map(([l, v]) => `<div class="cd-cell"><b>${String(v).padStart(2, '0')}</b><span>${l}</span></div>`).join('');
  };
  clearInterval(timer);
  tick();
  timer = setInterval(tick, 1000);
}

const DIR = {
  up: ['▲', 'Rising', 'pos'],
  down: ['▼', 'Falling', 'neg'],
  new: ['✦', 'New', 'gold'],
  gone: ['✕', 'Removed', 'muted'],
};
const VERDICT = { Pick: 'gold', Alternative: 'good', 'Second character': '', 'Safest starter': '', 'Avoid as main': 'bad' };
const CHANGE = { Unchanged: '', 'Mostly unchanged': '', Nerfed: 'bad', Buffed: 'good' };

export async function render(view, { token }) {
  const b = await fetch('/data/brief.json').then((r) => r.json());
  if (!token()) return;
  const local = new Date(b.launch).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  view.innerHTML = `
    <section class="hero">
      <div class="hero-glow"></div>
      <div class="hero-text">
        <span class="eyebrow">Path of Exile ${esc(b.version)} · patch notes ${esc(b.patchDate)}</span>
        <h2 class="hero-title">${esc(b.league)}</h2>
        <p class="hero-sub">${esc(b.headline)}</p>
        <p class="muted small">Launches ${esc(local)} (your time)</p>
      </div>
      <div class="countdown" id="cd"></div>
    </section>

    <h3 class="section-title">What changed</h3>
    <div class="brief-grid">
      ${b.changes.map((c) => `<article class="brief-card tone-${c.tone}"><h4>${esc(c.title)}</h4><p>${esc(c.body)}</p></article>`).join('')}
    </div>

    <div class="grid2" style="margin-top:18px">
      <section class="panel">
        <div class="row spread"><h3>Market impact</h3><span class="muted small">${state.liveChallenge ? `Live prices from ${esc(state.league)}` : `${esc(state.league)} prices until ${esc(b.league)} goes live`}</span></div>
        <div id="impact" style="margin-top:10px"><div class="loading">Loading prices…</div></div>
      </section>
      <section class="panel">
        <h3>Build verdicts</h3>
        <div class="verdicts">
          ${b.builds.map((x) => `<div class="verdict">
            <div class="row spread"><b>${esc(x.name)}</b><span class="row" style="gap:6px"><span class="tag ${CHANGE[x.change] || ''}">${esc(x.change)}</span><span class="tag ${VERDICT[x.verdict] || ''}">${esc(x.verdict)}</span></span></div>
            <div class="muted small">${esc(x.note)}</div></div>`).join('')}
        </div>
        <p class="small" style="margin-top:12px"><a href="#builds">Open the full build shortlist →</a></p>
      </section>
    </div>

    <section class="panel sources">
      <h3>Sources</h3>
      <ul>${b.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul>
    </section>`;

  countdown($('#cd', view), b.launch);

  // Live prices for the market-impact rows that exist in the current league.
  const types = [...new Set(b.market.filter((m) => m.type).map((m) => m.type))];
  const live = {};
  if (state.game === 'poe1') {
    await Promise.all(types.map(async (t) => {
      try {
        const d = await loadCategory('poe1', state.league, t);
        for (const r of d.rows) live[`${t}|${r.id}`] = r;
      } catch {}
    }));
  }
  if (!token()) return;
  const sec = secondaryUnit();
  $('#impact', view).innerHTML = `<div class="impact-list">${b.market.map((m) => {
    const [arrow, word, cls] = DIR[m.dir] || DIR.new;
    const r = live[`${m.type}|${m.id}`];
    const icon = r?.icon || m.icon;
    return `<div class="impact">
      <div class="impact-icon ${cls}">${icon ? `<img src="${esc(icon)}" alt="">` : `<span>${arrow}</span>`}</div>
      <div class="impact-body">
        <div class="row spread"><b>${esc(m.name)}</b><span class="tag ${cls === 'muted' ? '' : cls === 'gold' ? 'gold' : cls === 'pos' ? 'good' : 'bad'}">${arrow} ${word}</span></div>
        <div class="muted small">${esc(m.why)}</div>
      </div>
      <div class="impact-price">${r ? `${price(r.div, 'divine')}<br><span class="muted small">${price(sec === 'chaos' ? r.chaos : r.exalted, sec)}</span>` : '<span class="muted small">–</span>'}</div>
    </div>`;
  }).join('')}</div>`;
}
