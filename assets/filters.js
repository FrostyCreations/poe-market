import { $, $$, esc, fmt, toast } from './app.js';
import { parse, evaluate, build, tierLists, ruleToBlock } from './filter-engine.js';

// Filters tab: the official filter ladder (creator filters), plus a FilterBlade-style builder on top of NeverSink's filter.
const STRICT = [
  ['0-SOFT', 'Soft', 'Shows almost everything. Good for the first acts.'],
  ['1-REGULAR', 'Regular', 'NeverSink default. Campaign and early maps.'],
  ['2-SEMI-STRICT', 'Semi-strict', 'Hides most normal and magic gear. Early to mid maps.'],
  ['3-STRICT', 'Strict', 'Hides low currency stacks and weak rares. Red maps.'],
  ['4-VERY-STRICT', 'Very strict', 'Juiced mapping, only things worth picking up.'],
  ['5-UBER-STRICT', 'Uber strict', 'Heavy juice, most rares hidden.'],
  ['6-UBER-PLUS-STRICT', 'Uber plus', 'Only the valuable stuff. Late league farming.'],
];
const RAW = 'https://raw.githubusercontent.com/NeverSinkDev/NeverSink-Filter/master/';
const FAMILY = { currency: 'Currency', divination: 'Divination cards', uniques: 'Uniques', fragments: 'Fragments', gems: 'Gems', maps: 'Maps', gold: 'Gold' };
const famName = (t) => { const [a, ...r] = t.split('->'); return [FAMILY[a] || a[0].toUpperCase() + a.slice(1), ...r].join(' › '); };
const tierName = (t) => t.replace(/^t(\d+)/, 'T$1 ').replace(/_/g, ' ').trim();

const PRESETS = [
  {
    id: 'bow-leveling', name: "Fubgun's bow Deadeye leveling", note: 'Highlights bows, quivers and linked green sockets until maps (area level 68), so you never walk past a weapon upgrade or a 3 or 4-link for your bow skills.',
    rules: [
      { name: 'Leveling: rare bows', classes: ['Bows'], rarity: ['Rare'], maxArea: 68, size: 45, text: '#ffffff', border: '#55ff55', bg: '#1d4d1d', sound: 2, beam: 'Green', icon: 'Triangle' },
      { name: 'Leveling: 4-link anything', links: 4, maxArea: 68, size: 42, text: '#ffffff', border: '#55ff55', bg: '#174017', sound: 2, beam: 'Green', icon: 'Square' },
      { name: 'Leveling: green 3-links', socketGroup: 'GGG', maxArea: 68, size: 40, text: '#aaffaa', border: '#55ff55' },
      { name: 'Leveling: magic bows', classes: ['Bows'], rarity: ['Magic'], maxArea: 45, size: 38, text: '#8888ff', border: '#55ff55' },
      { name: 'Leveling: quivers', classes: ['Quivers'], rarity: ['Magic', 'Rare'], maxArea: 68, size: 38, border: '#55ff55' },
      { name: 'Leveling: boots (check movement speed)', classes: ['Boots'], rarity: ['Magic', 'Rare'], maxArea: 50, size: 36, border: '#d0b060' },
    ],
  },
  {
    id: 'essence', name: 'Essence farming', note: 'Makes every Essence and Remnant of Corruption loud, to match your Essence atlas tree.',
    rules: [{ name: 'Essences', classes: ['Stackable Currency'], bases: ['Essence of', 'Remnant of Corruption'], exact: false, size: 45, text: '#000000', border: '#000000', bg: '#c870e0', sound: 3, beam: 'Purple', icon: 'Diamond' }],
  },
  {
    id: 'hide-scrolls', name: 'Hide scrolls and transmutes in red maps', note: 'From area level 75, hides single Portal, Wisdom, Transmutation and Augmentation drops. Stacks still show.',
    rules: [{ name: 'Hide small currency in red maps', action: 'Hide', classes: ['Stackable Currency'], bases: ['Scroll of Wisdom', 'Portal Scroll', 'Orb of Transmutation', 'Orb of Augmentation'], minArea: 75, extra: ['StackSize < 3'] }],
  },
  {
    id: 'loud-top', name: 'Extra loud Divine and Mirror', note: 'Big pink beam and star icon for Divine Orbs, Mirrors and Mirror Shards.',
    rules: [{ name: 'Top currency', classes: ['Stackable Currency'], bases: ['Divine Orb', 'Mirror of Kalandra', 'Mirror Shard', 'Hinekora\'s Lock'], size: 45, text: '#ff0000', border: '#ff0000', bg: '#ffffff', sound: 6, beam: 'Pink', icon: 'Star' }],
  },
];

const SAMPLES = [
  { name: 'Mirror of Kalandra', cls: 'Stackable Currency', base: 'Mirror of Kalandra' },
  { name: 'Divine Orb', cls: 'Stackable Currency', base: 'Divine Orb' },
  { name: 'Chaos Orb', cls: 'Stackable Currency', base: 'Chaos Orb' },
  { name: 'Orb of Fusing', cls: 'Stackable Currency', base: 'Orb of Fusing' },
  { name: 'Orb of Alchemy', cls: 'Stackable Currency', base: 'Orb of Alchemy' },
  { name: 'Chromatic Orb', cls: 'Stackable Currency', base: 'Chromatic Orb' },
  { name: 'Orb of Transmutation', cls: 'Stackable Currency', base: 'Orb of Transmutation' },
  { name: 'Portal Scroll', cls: 'Stackable Currency', base: 'Portal Scroll' },
  { name: 'Scroll of Wisdom', cls: 'Stackable Currency', base: 'Scroll of Wisdom' },
  { name: 'Deafening Essence of Contempt', cls: 'Stackable Currency', base: 'Deafening Essence of Contempt' },
  { name: 'Screaming Essence of Greed', cls: 'Stackable Currency', base: 'Screaming Essence of Greed' },
  { name: 'Gold (850)', cls: 'Gold', base: 'Gold', StackSize: 850 },
  { name: 'The Apothecary', cls: 'Divination Cards', base: 'The Apothecary' },
  { name: 'Rain of Chaos', cls: 'Divination Cards', base: 'Rain of Chaos' },
  { name: 'Headhunter', cls: 'Belts', base: 'Leather Belt', rarity: 'Unique', Width: 2, Height: 1 },
  { name: 'Goldrim', cls: 'Helmets', base: 'Leather Cap', rarity: 'Unique', Width: 2, Height: 2, DropLevel: 1 },
  { name: 'Rare Spine Bow (ilvl 84)', cls: 'Bows', base: 'Spine Bow', rarity: 'Rare', ItemLevel: 84, DropLevel: 64, Width: 2, Height: 4, Sockets: 4, LinkedSockets: 3, socketGroup: 'GGR' },
  { name: 'Rare Thicket Bow', cls: 'Bows', base: 'Thicket Bow', rarity: 'Rare', DropLevel: 56, Width: 2, Height: 4, Sockets: 3, LinkedSockets: 2, socketGroup: 'GG' },
  { name: 'Magic Recurve Bow', cls: 'Bows', base: 'Recurve Bow', rarity: 'Magic', DropLevel: 18, Width: 2, Height: 4, Sockets: 3, LinkedSockets: 3, socketGroup: 'GGG' },
  { name: 'Magic Serrated Arrow Quiver', cls: 'Quivers', base: 'Serrated Arrow Quiver', rarity: 'Magic', DropLevel: 4, Width: 2, Height: 3 },
  { name: 'Magic Leather Boots', cls: 'Boots', base: 'Leatherscale Boots', rarity: 'Magic', DropLevel: 6, Width: 2, Height: 2 },
  { name: '6-link Astral Plate', cls: 'Body Armours', base: 'Astral Plate', rarity: 'Normal', DropLevel: 62, Width: 2, Height: 3, Sockets: 6, LinkedSockets: 6, socketGroup: 'RRRGGB' },
  { name: 'Rare Stygian Vise (ilvl 86)', cls: 'Belts', base: 'Stygian Vise', rarity: 'Rare', ItemLevel: 86, DropLevel: 75, Width: 2, Height: 1 },
  { name: 'Rare Vaal Regalia', cls: 'Body Armours', base: 'Vaal Regalia', rarity: 'Rare', ItemLevel: 75, DropLevel: 68, Width: 2, Height: 3 },
  { name: 'Normal Iron Ring', cls: 'Rings', base: 'Iron Ring', rarity: 'Normal', DropLevel: 2, Width: 1, Height: 1 },
  { name: 'Tornado Shot (20%)', cls: 'Skill Gems', base: 'Tornado Shot', Quality: 20, GemLevel: 1 },
  { name: 'Sacrifice at Midnight', cls: 'Map Fragments', base: 'Sacrifice at Midnight' },
];

let base = null; let baseSrc = ''; let baseFor = '';
let ladder = null;
let cfg = loadCfg();
function loadCfg() {
  try { return { strict: '2-SEMI-STRICT', presets: [], tiers: {}, moves: {}, rules: [], area: 70, ...JSON.parse(localStorage.getItem('filter-builder') || '{}') }; } catch { return { strict: '2-SEMI-STRICT', presets: [], tiers: {}, moves: {}, rules: [], area: 70 }; }
}
const save = () => { try { localStorage.setItem('filter-builder', JSON.stringify(cfg)); } catch { /* storage blocked */ } };

async function loadBase(strict) {
  if (baseFor === strict && base) return;
  const name = `NeverSink's filter - ${strict}.filter`;
  try {
    const r = await fetch(RAW + encodeURIComponent(name), { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    base = await r.text(); baseSrc = 'live from NeverSink\'s GitHub';
  } catch {
    base = await (await fetch(`data/filters/neversink/${strict}.filter`)).text(); baseSrc = 'bundled copy from 13 Nov 2026';
  }
  baseFor = strict;
}

const allRules = () => [...PRESETS.filter((p) => cfg.presets.includes(p.id)).flatMap((p) => p.rules), ...cfg.rules];
const finalText = () => build(base, { tiers: cfg.tiers, moves: cfg.moves, rules: allRules() });

// ---------- label drawing ----------
const col = (a, fb) => (a ? `rgba(${a[0]},${a[1]},${a[2]},${(a[3] ?? 255) / 255})` : fb);
function labelHtml(name, style, hidden) {
  const size = Math.max(11, Math.min(22, ((+style.SetFontSize?.[0] || 32) - 18) * 0.42 + 11));
  const beam = style.PlayEffect?.[0];
  const icon = style.MinimapIcon;
  return `<span class="fl-label ${hidden ? 'hidden' : ''}" style="font-size:${size}px;color:${col(style.SetTextColor, '#c8c8c8')};background:${col(style.SetBackgroundColor, 'rgba(0,0,0,.8)')};border-color:${col(style.SetBorderColor, 'transparent')}">${esc(name)}</span>
    ${beam ? `<span class="fl-beam" title="Beam: ${esc(beam)}" style="--b:${esc(beam.toLowerCase())}"></span>` : ''}
    ${icon ? `<span class="fl-icon" title="Minimap icon: ${esc(icon.join(' '))}">${({ Star: '★', Circle: '●', Diamond: '◆', Hexagon: '⬢', Square: '■', Triangle: '▲', Cross: '✚', Moon: '☾', Raindrop: '💧', Kite: '◈', Pentagon: '⬟', UpsideDownHouse: '⌂' })[icon[2]] || '●'}</span>` : ''}
    ${style.PlayAlertSound ? `<span class="fl-snd" title="Sound ${esc(style.PlayAlertSound[0])}">♪${esc(style.PlayAlertSound[0])}</span>` : ''}`;
}
const actsToStyle = (acts) => acts;

// ---------- views ----------
export async function render(el) {
  el.innerHTML = '<div class="loading">Loading filters…</div>';
  ladder ||= await (await fetch('data/filters/ladder.json')).json();
  el.innerHTML = `
    <section class="craft-hero"><div>
      <h2>Item filters</h2>
      <p class="muted">The most followed filters on the official ladder, the ones to use for your bow Deadeye start, and a filter builder modelled on FilterBlade that starts from NeverSink's filter.</p>
    </div></section>
    <div class="fl-tabs" role="tablist">
      <button class="pill active" data-ft="pick">For your league start</button>
      <button class="pill" data-ft="ladder">Popular filters</button>
      <button class="pill" data-ft="build">Build your own</button>
    </div>
    <div id="flBody"></div>`;
  const body = $('#flBody', el);
  const show = (t) => { $$('[data-ft]', el).forEach((b) => b.classList.toggle('active', b.dataset.ft === t)); ({ pick: pickView, ladder: ladderView, build: buildView })[t](body); };
  $$('[data-ft]', el).forEach((b) => (b.onclick = () => show(b.dataset.ft)));
  show('pick');
}

function findF(name, author) { return ladder.filters.find((f) => f.name === name && (!author || f.author === author)); }

function pickView(body) {
  const steps = [
    ['Acts 1 to 10', findF('Bow Campaign lvling', 'fubgun'), 'Fubgun\'s campaign filter for bow leveling. His notes say to use "bow campaign" for bow leveling, which matches the Deadeye guide you are following.'],
    ['First white and yellow maps', findF('Entering maps Bows', 'fubgun'), 'Switch when you reach maps. Still shows bow bases and links, but hides more junk.'],
    ['Red maps and farming', findF('Endgame Semi-strict', 'fubgun'), 'His main endgame filter and the 8th most followed PoE1 filter. Move to NeverSink very strict or uber strict if it gets too noisy.'],
  ];
  body.innerHTML = `
    <div class="fl-steps">${steps.map(([when, f, why], i) => `
      <article class="panel fl-step">
        <span class="at-stage" style="--c:var(--gold)">Step ${i + 1} · ${esc(when)}</span>
        <h3>${esc(f?.name || '')}</h3>
        <div class="muted small">by ${esc(f?.author || '')} · ${fmt(f?.followers || 0, 0)} followers · rank ${f?.rank || '–'}</div>
        <p>${esc(why)}</p>
        ${f ? `<a class="btn-link" href="${esc(f.url)}" target="_blank" rel="noopener">Open and follow on pathofexile.com ↗</a>` : ''}
      </article>`).join('')}
    </div>
    <div class="panel" style="margin-top:14px">
      <h3>How to use a ladder filter</h3>
      <ol class="craft-steps">
        <li>Open the filter link and press <b>Follow</b> (you need to be logged in on pathofexile.com).</li>
        <li>In game: Escape, Options, Game, then pick it in the <b>Item Filter</b> list. Followed filters update on their own.</li>
        <li>Swap filters as you go: there is no penalty, and Alt still shows hidden items.</li>
      </ol>
      <p class="muted small">Want Fubgun's filter with your own tweaks (Essence highlights, louder Divines)? Use <b>Build your own</b>: it starts from NeverSink's filter, which Fubgun's and most streamer filters are based on.</p>
    </div>`;
}

function ladderView(body) {
  const authors = [...new Set(ladder.filters.map((f) => f.author))];
  let q = ''; let au = 'all'; let kind = 'all';
  const KIND = { all: 'All', level: 'Leveling', end: 'Endgame', ns: 'NeverSink' };
  const test = (f) => (kind === 'all' || (kind === 'ns' ? f.author === 'NeverSink' : kind === 'level' ? /lvl|level|campaign|act|early|start/i.test(f.name) : !/lvl|level|campaign|act/i.test(f.name) && f.author !== 'NeverSink'));
  body.innerHTML = `
    <div class="row mk-tools" style="margin-top:12px">
      <input id="flQ" placeholder="Search filters">
      <select id="flAu"><option value="all">All authors</option>${authors.map((a) => `<option>${esc(a)}</option>`).join('')}</select>
      <div class="at-chips">${Object.entries(KIND).map(([k, l]) => `<button class="ghost small ${k === 'all' ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Filter</th><th>Author</th><th class="num">Followers</th><th class="num">Copies</th><th></th></tr></thead><tbody id="flRows"></tbody></table></div>
    <p class="muted small">Top 100 PoE1 filters by followers on the <a href="${esc(ladder.source)}" target="_blank" rel="noopener">official ladder</a>, snapshot from ${esc(ladder.updated)} (all on game version 3.30.0).</p>`;
  const draw = () => {
    $('#flRows', body).innerHTML = ladder.filters.filter((f) => (au === 'all' || f.author === au) && test(f) && (!q || `${f.name} ${f.author}`.toLowerCase().includes(q)))
      .map((f) => `<tr><td class="muted">${f.rank}</td><td>${esc(f.name)}</td><td>${esc(f.author)}</td><td class="num">${fmt(f.followers, 0)}</td><td class="num muted">${fmt(f.copies, 0)}</td><td><a href="${esc(f.url)}" target="_blank" rel="noopener">Follow ↗</a></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No filters match.</td></tr>';
  };
  $('#flQ', body).oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  $('#flAu', body).onchange = (e) => { au = e.target.value; draw(); };
  $$('[data-k]', body).forEach((b) => (b.onclick = () => { kind = b.dataset.k; $$('[data-k]', body).forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  draw();
}

async function buildView(body) {
  body.innerHTML = '<div class="loading">Loading NeverSink\'s filter…</div>';
  await loadBase(cfg.strict);
  const tiers = tierLists(base);
  const fams = Object.keys(tiers).sort((a, b) => (a === 'currency' ? -1 : b === 'currency' ? 1 : a.localeCompare(b)));
  let fam = fams.includes(cfg.fam) ? cfg.fam : 'currency';
  body.innerHTML = `
    <div class="fl-build">
      <div class="fl-left">
        <div class="panel">
          <h3>1. Strictness</h3>
          <div class="fl-strict">${STRICT.map(([k, n, d], i) => `<button class="${k === cfg.strict ? 'on' : ''}" data-s="${k}" title="${esc(d)}"><b>${i}</b> ${esc(n)}</button>`).join('')}</div>
          <p class="muted small">${esc(STRICT.find((s) => s[0] === cfg.strict)[2])} Base: NeverSink's filter, ${esc(baseSrc)}. Same base as <a href="https://www.filterblade.xyz/?game=Poe1" target="_blank" rel="noopener">FilterBlade ↗</a>.</p>
        </div>
        <div class="panel">
          <h3>2. Quick presets</h3>
          ${PRESETS.map((p) => `<label class="fl-preset"><input type="checkbox" data-p="${p.id}" ${cfg.presets.includes(p.id) ? 'checked' : ''}><span><b>${esc(p.name)}</b><br><span class="muted small">${esc(p.note)}</span></span></label>`).join('')}
        </div>
        <div class="panel">
          <div class="row spread"><h3>3. Tiers</h3><select id="flFam">${fams.map((f) => `<option value="${esc(f)}" ${f === fam ? 'selected' : ''}>${esc(famName(f))}</option>`).join('')}</select></div>
          <input id="flFind" placeholder="Find an item to move it to another tier (e.g. Orb of Alchemy)" style="width:100%;margin:8px 0">
          <div id="flFound"></div>
          <div id="flTiers"></div>
        </div>
        <div class="panel">
          <h3>4. Your own rules</h3>
          <p class="muted small">These go at the very top of the filter, so they win over everything else.</p>
          <div id="flRules"></div>
          <details class="fl-add"><summary>Add a rule</summary>
            <div class="fl-form">
              <label>Name<input id="rName" placeholder="e.g. Chance bases"></label>
              <label>Action<select id="rAct"><option>Show</option><option>Hide</option></select></label>
              <label>Item class<input id="rCls" placeholder="Bows, Quivers (comma separated, exact)"></label>
              <label>Base type<input id="rBase" placeholder="Spine Bow, Thicket Bow (part of the name is fine)"></label>
              <label>Rarity<select id="rRar"><option value="">Any</option><option>Normal</option><option>Magic</option><option>Rare</option><option>Unique</option></select></label>
              <label>Min item level<input id="rIlvl" type="number" min="0" max="100"></label>
              <label>Only below area level<input id="rArea" type="number" min="0" max="90" placeholder="68 = until maps"></label>
              <label>Min linked sockets<input id="rLinks" type="number" min="0" max="6"></label>
              <label>Text<input id="rText" type="color" value="#ffffff"></label>
              <label>Border<input id="rBorder" type="color" value="#ffcc00"></label>
              <label>Background<input id="rBg" type="color" value="#202020"></label>
              <label>Size<input id="rSize" type="range" min="18" max="45" value="40"></label>
              <label>Sound<select id="rSnd"><option value="">None</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => `<option>${n}</option>`).join('')}</select></label>
              <label>Beam<select id="rBeam"><option value="">None</option>${['Red', 'Green', 'Blue', 'Brown', 'White', 'Yellow', 'Cyan', 'Grey', 'Orange', 'Pink', 'Purple'].map((c) => `<option>${c}</option>`).join('')}</select></label>
              <label>Minimap icon<select id="rIcon"><option value="">None</option>${['Circle', 'Diamond', 'Hexagon', 'Square', 'Star', 'Triangle', 'Cross', 'Moon', 'Raindrop', 'Kite', 'Pentagon', 'UpsideDownHouse'].map((c) => `<option>${c}</option>`).join('')}</select></label>
            </div>
            <button id="rAdd">Add rule</button>
          </details>
        </div>
      </div>
      <div class="fl-right">
        <div class="panel fl-prev">
          <div class="row spread"><h3>Preview</h3><label class="muted small">Area level <b id="flAreaV">${cfg.area}</b> <input id="flArea" type="range" min="1" max="85" value="${cfg.area}"></label></div>
          <div id="flPrev"></div>
          <p class="muted small">How sample drops look with your filter. Faded labels are hidden (Alt shows them in game).</p>
        </div>
        <div class="panel">
          <h3>5. Download</h3>
          <div class="row"><button id="flDl">Download .filter</button><button class="ghost" id="flCopy">Copy filter text</button><button class="ghost" id="flReset">Reset all</button></div>
          <ol class="craft-steps small">
            <li>Save it in <code>Documents/My Games/Path of Exile</code>.</li>
            <li>In game: Escape, Options, Game, Item Filter, pick <b>ExileLedger</b>, then Reload.</li>
            <li>Your settings are saved in this browser, so come back and download again after NeverSink updates.</li>
          </ol>
        </div>
      </div>
    </div>`;

  const refresh = () => { save(); drawPrev(); drawRules(); };
  $$('[data-s]', body).forEach((b) => (b.onclick = async () => { cfg.strict = b.dataset.s; save(); buildView(body); }));
  $$('[data-p]', body).forEach((c) => (c.onchange = () => { cfg.presets = c.checked ? [...new Set([...cfg.presets, c.dataset.p])] : cfg.presets.filter((x) => x !== c.dataset.p); refresh(); }));
  $('#flFam', body).onchange = (e) => { fam = e.target.value; cfg.fam = fam; save(); drawTiers(); };
  $('#flArea', body).oninput = (e) => { cfg.area = +e.target.value; $('#flAreaV', body).textContent = cfg.area; save(); drawPrev(); };

  const tierOf = (item) => {
    if (cfg.moves[item]) return cfg.moves[item];
    for (const f of Object.values(tiers)) for (const t of Object.values(f)) if (t.items.includes(item)) return t.key;
    return null;
  };
  const moveSel = (item) => {
    const cur = tierOf(item); const f = cur?.split('|')[0];
    return `<select data-move="${esc(item)}">${Object.values(tiers[f] || {}).map((t) => `<option value="${esc(t.key)}" ${t.key === cur ? 'selected' : ''}>${esc(tierName(t.tier))}</option>`).join('')}</select>`;
  };
  function drawTiers() {
    const list = Object.values(tiers[fam] || {});
    $('#flTiers', body).innerHTML = list.map((t) => {
      const ed = cfg.tiers[t.key] || {};
      const hidden = ed.hide ?? t.action === 'Hide';
      const items = [...t.items.filter((x) => !cfg.moves[x] || cfg.moves[x] === t.key), ...Object.keys(cfg.moves).filter((x) => cfg.moves[x] === t.key && !t.items.includes(x))];
      const st = { ...t.acts };
      if (ed.size) st.SetFontSize = [ed.size];
      const hx = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };
      if (ed.text) st.SetTextColor = hx(ed.text); if (ed.border) st.SetBorderColor = hx(ed.border); if (ed.bg) st.SetBackgroundColor = hx(ed.bg);
      if (ed.sound === false) delete st.PlayAlertSound; if (ed.beam === false) delete st.PlayEffect;
      const toHex = (a, fb) => (a ? `#${a.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('')}` : fb);
      return `<details class="fl-tier">
        <summary><span class="fl-tname">${esc(tierName(t.tier))}</span>${labelHtml(items[0] || t.tier, st, hidden)}<span class="muted small">${items.length} items</span></summary>
        <div class="fl-tctl">
          <label><input type="checkbox" data-t="${esc(t.key)}" data-f="show" ${hidden ? '' : 'checked'}> Show</label>
          <label><input type="checkbox" data-t="${esc(t.key)}" data-f="sound" ${st.PlayAlertSound ? 'checked' : ''} ${t.acts.PlayAlertSound ? '' : 'disabled'}> Sound</label>
          <label><input type="checkbox" data-t="${esc(t.key)}" data-f="beam" ${st.PlayEffect ? 'checked' : ''} ${t.acts.PlayEffect ? '' : 'disabled'}> Beam</label>
          <label>Text <input type="color" data-t="${esc(t.key)}" data-f="text" value="${toHex(st.SetTextColor, '#c8c8c8')}"></label>
          <label>Border <input type="color" data-t="${esc(t.key)}" data-f="border" value="${toHex(st.SetBorderColor, '#000000')}"></label>
          <label>Background <input type="color" data-t="${esc(t.key)}" data-f="bg" value="${toHex(st.SetBackgroundColor, '#000000')}"></label>
          <label>Size <input type="range" min="18" max="45" data-t="${esc(t.key)}" data-f="size" value="${st.SetFontSize?.[0] || 32}"></label>
          ${cfg.tiers[t.key] ? `<button class="ghost small" data-undo="${esc(t.key)}">Undo changes</button>` : ''}
        </div>
        <div class="fl-items">${items.slice(0, 400).map((x) => `<span class="fl-item">${esc(x)} ${moveSel(x)}</span>`).join('')}</div>
      </details>`;
    }).join('') || '<p class="muted">No item tiers in this group.</p>';
  }
  $('#flTiers', body).addEventListener('change', (e) => {
    const t = e.target.dataset.t; const f = e.target.dataset.f;
    if (t && f) {
      const ed = (cfg.tiers[t] ||= {});
      if (f === 'show') ed.hide = !e.target.checked;
      else if (f === 'sound' || f === 'beam') ed[f] = e.target.checked ? undefined : false;
      else if (f === 'size') ed.size = +e.target.value;
      else ed[f] = e.target.value;
      refresh(); drawTiers();
    }
  });
  body.onchange = (e) => {
    const m = e.target.dataset.move;
    if (m) { cfg.moves[m] = e.target.value; toast(`${m} moved to ${tierName(e.target.value.split('|')[1])}`); refresh(); drawTiers(); drawFound(); }
  };
  $('#flTiers', body).addEventListener('click', (e) => {
    const u = e.target.dataset.undo; if (u) { delete cfg.tiers[u]; refresh(); drawTiers(); }
  });
  let findQ = '';
  function drawFound() {
    if (findQ.length < 3) { $('#flFound', body).innerHTML = ''; return; }
    const hits = [];
    for (const f of Object.values(tiers)) for (const t of Object.values(f)) for (const x of t.items) if (x.toLowerCase().includes(findQ) && !hits.includes(x)) hits.push(x);
    $('#flFound', body).innerHTML = hits.slice(0, 12).map((x) => `<div class="fl-item">${esc(x)} <span class="muted small">${esc(famName(tierOf(x).split('|')[0]))}</span> ${moveSel(x)} ${cfg.moves[x] ? `<button class="ghost small" data-unmove="${esc(x)}">Reset</button>` : ''}</div>`).join('') || '<p class="muted small">Not in any tier list.</p>';
  }
  $('#flFind', body).oninput = (e) => { findQ = e.target.value.toLowerCase(); drawFound(); };
  $('#flFound', body).onclick = (e) => { const x = e.target.dataset.unmove; if (x) { delete cfg.moves[x]; refresh(); drawTiers(); drawFound(); } };

  function drawRules() {
    const rows = [...PRESETS.filter((p) => cfg.presets.includes(p.id)).flatMap((p) => p.rules.map((r) => ({ r, preset: p.name }))), ...cfg.rules.map((r, i) => ({ r, i }))];
    $('#flRules', body).innerHTML = rows.length ? rows.map(({ r, i, preset }) => `<div class="fl-rule"><div>${labelHtml(r.name, parse(ruleToBlock(r)).blocks[0].acts, r.action === 'Hide')}<div class="muted small">${esc(preset ? `From preset: ${preset}` : 'Your rule')} · ${esc(ruleToBlock(r).split('\n').slice(1).filter((l) => !/Set|Play|Minimap/.test(l)).map((l) => l.trim()).join(', '))}</div></div>${i != null ? `<button class="ghost small" data-del="${i}">Remove</button>` : ''}</div>`).join('') : '<p class="muted small">No custom rules yet. Tick a preset or add one below.</p>';
  }
  $('#flRules', body).onclick = (e) => { const d = e.target.dataset.del; if (d != null) { cfg.rules.splice(+d, 1); refresh(); } };
  $('#rAdd', body).onclick = () => {
    const v = (id) => $(id, body).value.trim(); const list = (id) => v(id).split(',').map((x) => x.trim()).filter(Boolean);
    const r = { name: v('#rName') || 'My rule', action: v('#rAct'), classes: list('#rCls'), bases: list('#rBase'), exact: false, rarity: v('#rRar') ? [v('#rRar')] : [], minIlvl: +v('#rIlvl') || 0, maxArea: +v('#rArea') || 0, links: +v('#rLinks') || 0, text: v('#rText'), border: v('#rBorder'), bg: v('#rBg'), size: +v('#rSize'), sound: v('#rSnd'), beam: v('#rBeam'), icon: v('#rIcon') };
    if (!r.classes.length && !r.bases.length && !r.links) { toast('Give the rule an item class, a base type or linked sockets'); return; }
    cfg.rules.push(r); refresh(); toast('Rule added');
  };

  function drawPrev() {
    const blocks = parse(finalText()).blocks;
    $('#flPrev', body).innerHTML = SAMPLES.map((s) => {
      const it = { AreaLevel: cfg.area, ItemLevel: s.ItemLevel ?? cfg.area, DropLevel: s.DropLevel ?? 1, Width: 1, Height: 1, ...s };
      const r = evaluate(blocks, it);
      return `<div class="fl-prow">${labelHtml(s.name, actsToStyle(r.style), r.action === 'Hide')}</div>`;
    }).join('');
  }

  $('#flDl', body).onclick = () => {
    const blob = new Blob([finalText()], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ExileLedger.filter'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#flCopy', body).onclick = async () => { try { await navigator.clipboard.writeText(finalText()); toast('Filter copied'); } catch { toast('Copy failed, use Download'); } };
  $('#flReset', body).onclick = () => { cfg = { strict: cfg.strict, presets: [], tiers: {}, moves: {}, rules: [], area: cfg.area }; save(); buildView(body); };

  drawTiers(); drawRules(); drawPrev();
}
