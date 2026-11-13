import { $, $$, esc, fmt, toast } from './app.js';
import { parse, evaluate, build, tierLists, ruleToBlock, usedSounds, zip } from './filter-engine.js';

// ---------- sound library: NeverSink's custom sound pack plus files you upload (kept in this browser) ----------
const BUILTIN_SOUNDS = [
  ['1maybevaluable.mp3', 'Maybe valuable'], ['2currency.mp3', 'Currency'], ['3uniques.mp3', 'Uniques'], ['4maps.mp3', 'Maps'],
  ['5highmaps.mp3', 'High tier maps'], ['6veryvaluable.mp3', 'Very valuable'], ['7chancing.mp3', 'Chancing bases'], ['12leveling.mp3', 'Leveling'],
].map(([file, label]) => ({ file, label: `NeverSink: ${label}`, builtin: true }));
// Community sounds, streamed from cdrg's poe1filtertts project on GitHub (credited, not rehosted here).
const CDR = 'https://raw.githubusercontent.com/cdrg/poe1filtertts/main/';
const MEMES = [
  ['chris wilson progress.mp3', 'Chris Wilson: progress is how you are measured'], ['chris wilson thing.mp3', 'Chris Wilson: thing'],
  ['jonathan a quest objective.mp3', 'Jonathan: a quest objective'], ['jonathan progress.mp3', 'Jonathan: progress'], ['jonathan quests.mp3', 'Jonathan: quests'],
  ['neversink wellwellwell.mp3', 'NeverSink: well well well'], ['tyty.mp3', 'Tytykiller'], ['CuteDog_Sustain.mp3', 'CuteDog: sustain'],
].map(([f, label]) => ({ file: `meme-${f.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`, label: `Meme: ${label}`, url: `${CDR}voicelines/${encodeURIComponent(f)}` }));
const VOICES = [['AWSPolly-Brian', 'Brian (British)'], ['AWSPolly-Matthew', 'Matthew (American)'], ['AWSPolly-Nicole', 'Nicole (Australian)'], ['TTSM-Axel', 'Axel'], ['TTSM-Oracle', 'Oracle'], ['TTSM-Titanus', 'Titanus (deep)']];
const SPOKEN = ['armourers scrap', 'blacksmiths whetstone', 'blessed orb', 'cartographers chisel', 'chaos orb', 'chromatic orb', 'divine orb', 'enkindling orb', 'exalted orb', 'foulborn exalted orb', 'fracturing orb', 'gemcutters prism', 'glassblowers bauble', 'hinekoras lock', 'instilling orb', 'jewellers orb', 'lesser eldritch ember', 'lesser eldritch ichor', 'message in a bottle', 'mirror of kalandra', 'mirror shard', 'orb of alchemy', 'orb of alteration', 'orb of annulment', 'orb of augmentation', 'orb of binding', 'orb of chance', 'orb of dominance', 'orb of fusing', 'orb of horizons', 'orb of regret', 'orb of scouring', 'orb of transmutation', 'orb of unmaking', 'portal scroll', 'regal orb', 'rogues marker', 'sacred orb', 'scroll of wisdom', 'stacked deck', 'vaal orb', 'veiled exalted orb'];
const SPOKEN_ESS = ['anger', 'anguish', 'contempt', 'doubt', 'fear', 'greed', 'hatred', 'loathing', 'misery', 'rage', 'scorn', 'sorrow', 'spite', 'suffering', 'torment', 'woe', 'wrath', 'zeal', 'envy', 'dread', 'insanity', 'horror', 'delirium', 'hysteria'];
const SPOKEN_TOP = ['mirror of kalandra', 'mirror shard', 'divine orb', 'hinekoras lock', 'exalted orb', 'fracturing orb', 'orb of dominance', 'sacred orb', 'veiled exalted orb', 'foulborn exalted orb', 'orb of annulment', 'chaos orb'];
const norm = (x) => x.toLowerCase().replace(/'/g, '');
// Spoken file for an item, or null. Essences use the "essence of x" clip for every tier of that Essence.
function spokenFile(item) {
  const sp = cfg.spoken; if (!sp?.on) return null;
  const n = norm(item);
  if (SPOKEN.includes(n) && (sp.all || (sp.items || SPOKEN_TOP).includes(n))) return `spoken/${sp.voice}/${n.replace(/[^a-z0-9]+/g, '-')}.mp3`;
  const e = /essence of (\w+)$/.exec(n);
  if (e && sp.essences && SPOKEN_ESS.includes(e[1])) return `spoken/${sp.voice}/essence-of-${e[1]}.mp3`;
  return null;
}
function spokenUrl(file) {
  const m = /^spoken\/([^/]+)\/(.+)\.mp3$/.exec(file); if (!m) return null;
  const name = m[2].replace(/-/g, ' ');
  return `${CDR}${m[1]}/sounds/currency/${name.startsWith('essence of') ? 'essence/' : ''}${encodeURIComponent(name)}.mp3`;
}
const SLOTS = [[1, 'Maybe valuable (good rares, mid currency)'], [2, 'Currency'], [3, 'Uniques'], [4, 'Maps'], [5, 'High tier maps'], [6, 'Very valuable (Divines, top drops)']];
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('exile-ledger-sounds', 1); r.onupgradeneeded = () => r.result.createObjectStore('s', { keyPath: 'file' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('s', mode); const out = fn(t.objectStore('s')); t.oncomplete = () => res(out.result); t.onerror = () => rej(t.error); }); };
const userSounds = async () => { try { return await tx('readonly', (st) => st.getAll()); } catch { return []; } };
async function soundBytes(file) {
  const remote = MEMES.find((x) => x.file === file)?.url || spokenUrl(file);
  if (remote) { try { const r = await fetch(remote); if (r.ok) return new Uint8Array(await r.arrayBuffer()); } catch { /* offline */ } return null; }
  const b = BUILTIN_SOUNDS.find((x) => x.file === file);
  if (b) return new Uint8Array(await (await fetch(`data/filters/sounds/${file}`)).arrayBuffer());
  const u = (await userSounds()).find((x) => x.file === file);
  return u ? new Uint8Array(u.data) : null;
}
let player = null;
async function play(file) {
  const bytes = await soundBytes(file); if (!bytes) return;
  player?.pause(); player = new Audio(URL.createObjectURL(new Blob([bytes]))); player.volume = 0.8; player.play().catch(() => {});
}

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
const finalText = () => build(base, { tiers: cfg.tiers, moves: cfg.moves, rules: allRules(), soundMap: cfg.soundMap || {}, soundVol: cfg.soundVol || 300, spoken: cfg.spoken?.on ? spokenFile : null });
let library = [...BUILTIN_SOUNDS, ...MEMES];
const soundOpts = (sel, none) => `<option value="">${esc(none)}</option>${library.map((x) => `<option value="${esc(x.file)}" ${x.file === sel ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}`;

// ---------- label drawing ----------
const col = (a, fb) => (a ? `rgba(${a[0]},${a[1]},${a[2]},${(a[3] ?? 255) / 255})` : fb);
function labelHtml(name, style, hidden) {
  const size = Math.max(11, Math.min(22, ((+style.SetFontSize?.[0] || 32) - 18) * 0.42 + 11));
  const beam = style.PlayEffect?.[0];
  const icon = style.MinimapIcon;
  return `<span class="fl-label ${hidden ? 'hidden' : ''}" style="font-size:${size}px;color:${col(style.SetTextColor, '#c8c8c8')};background:${col(style.SetBackgroundColor, 'rgba(0,0,0,.8)')};border-color:${col(style.SetBorderColor, 'transparent')}">${esc(name)}</span>
    ${beam ? `<span class="fl-beam" title="Beam: ${esc(beam)}" style="--b:${esc(beam.toLowerCase())}"></span>` : ''}
    ${icon ? `<span class="fl-icon" title="Minimap icon: ${esc(icon.join(' '))}">${({ Star: '★', Circle: '●', Diamond: '◆', Hexagon: '⬢', Square: '■', Triangle: '▲', Cross: '✚', Moon: '☾', Raindrop: '💧', Kite: '◈', Pentagon: '⬟', UpsideDownHouse: '⌂' })[icon[2]] || '●'}</span>` : ''}
    ${style.CustomAlertSound ? `<span class="fl-snd custom" title="Custom sound ${esc(style.CustomAlertSound[0])}">♪ ${esc(style.CustomAlertSound[0].replace(/^.*\//, '').replace(/\.\w+$/, ''))}</span>` : style.PlayAlertSound ? `<span class="fl-snd" title="Sound ${esc(style.PlayAlertSound[0])}">♪${esc(style.PlayAlertSound[0])}</span>` : ''}`;
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
              <label>Custom sound<select id="rCSnd">${soundOpts('', 'None')}</select></label>
              <label>Beam<select id="rBeam"><option value="">None</option>${['Red', 'Green', 'Blue', 'Brown', 'White', 'Yellow', 'Cyan', 'Grey', 'Orange', 'Pink', 'Purple'].map((c) => `<option>${c}</option>`).join('')}</select></label>
              <label>Minimap icon<select id="rIcon"><option value="">None</option>${['Circle', 'Diamond', 'Hexagon', 'Square', 'Star', 'Triangle', 'Cross', 'Moon', 'Raindrop', 'Kite', 'Pentagon', 'UpsideDownHouse'].map((c) => `<option>${c}</option>`).join('')}</select></label>
            </div>
            <button id="rAdd">Add rule</button>
          </details>
        </div>
        <div class="panel">
          <h3>6. Custom sounds</h3>
          <p class="muted small">Swap the game's alert sounds for your own files, the same way NeverSink's CustomSounds style does. When a sound is used, the download becomes a zip with the filter and an <code>ExileLedgerSounds</code> folder.</p>
          <div class="row" style="flex-wrap:wrap;gap:8px;margin:6px 0">
            <button class="ghost small" id="sPack">Use NeverSink's sound pack</button>
            <button class="ghost small" id="sClear">Back to game sounds</button>
            <label class="ghost small fl-upload">Upload sounds (mp3, wav, ogg)<input type="file" id="sUp" accept=".mp3,.wav,.ogg,audio/*" multiple hidden></label>
            <label class="muted small">Volume <b id="sVolV">${cfg.soundVol || 300}</b> <input type="range" id="sVol" min="50" max="300" step="10" value="${cfg.soundVol || 300}"></label>
          </div>
          <table class="fl-slots"><thead><tr><th>Game sound</th><th>Used for</th><th>Plays</th><th></th></tr></thead><tbody id="sSlots"></tbody></table>
          <h4 class="at-h">Your sound library</h4>
          <div id="sLib"></div>
          <h4 class="at-h">Say the currency name out loud</h4>
          <label class="fl-preset"><input type="checkbox" id="spOn" ${cfg.spoken?.on ? 'checked' : ''}><span><b>Spoken drops</b><br><span class="muted small">"Divine Orb!" instead of a ding. Keeps NeverSink's colours and beams.</span></span></label>
          <div class="row" style="gap:8px;flex-wrap:wrap;margin:6px 0">
            <label class="muted small">Voice <select id="spVoice">${VOICES.map(([k, l]) => `<option value="${k}" ${(cfg.spoken?.voice || 'AWSPolly-Brian') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <button class="ghost small" data-play="spoken/${esc(cfg.spoken?.voice || 'AWSPolly-Brian')}/divine-orb.mp3" id="spTry">▶ Hear it</button>
            <label class="muted small"><input type="checkbox" id="spAll" ${cfg.spoken?.all ? 'checked' : ''}> Every currency with a voice line (${SPOKEN.length})</label>
            <label class="muted small"><input type="checkbox" id="spEss" ${cfg.spoken?.essences ? 'checked' : ''}> Essences too</label>
          </div>
          <div class="fl-chips" id="spItems"></div>
          <h4 class="at-h">More packs to grab yourself</h4>
          <ul class="plain-list small">
            <li><a href="https://github.com/cdrg/poe1filtertts" target="_blank" rel="noopener">cdr's text-to-speech packs ↗</a>: the source of the meme lines and spoken currency above, with spoken names for over a thousand items.</li>
            <li><a href="https://www.pathofexile.com/forum/view-thread/2248103" target="_blank" rel="noopener">MemeLoot ↗</a>: a filter with a meme sound on almost every item, around 1,400 clips.</li>
            <li><a href="https://oriath.net/audio-index.html" target="_blank" rel="noopener">oriath.net audio index ↗</a>: in-game voice lines, including Shaper and Maven lines that name currency.</li>
          </ul>
          <p class="muted small">Download any of these, then use <b>Upload sounds</b> above to add them to your library. You can also give a single tier (in Tiers) or one of your own rules its own sound. Uploaded sounds stay in this browser only; the meme lines and spoken names come from cdr's GitHub when you play or download them.</p>
        </div>
      </div>
      <div class="fl-right">
        <div class="panel fl-prev">
          <div class="row spread"><h3>Preview</h3><label class="muted small">Area level <b id="flAreaV">${cfg.area}</b> <input id="flArea" type="range" min="1" max="85" value="${cfg.area}"></label></div>
          <div id="flPrev"></div>
          <p class="muted small">How sample drops look with your filter. Faded labels are hidden (Alt shows them in game).</p>
        </div>
        <div class="panel">
          <h3>Download</h3>
          <div class="row"><button id="flDl">Download .filter</button><button class="ghost" id="flCopy">Copy filter text</button><button class="ghost" id="flReset">Reset all</button></div>
          <ol class="craft-steps small">
            <li>Save it in <code>Documents/My Games/Path of Exile</code>. If you use custom sounds you get a zip: unzip it there so the <code>ExileLedgerSounds</code> folder sits next to the filter.</li>
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
          <label>Custom sound <select data-t="${esc(t.key)}" data-f="customSound">${soundOpts(ed.customSound, 'Default')}</select></label>
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
      else if (f === 'customSound') ed.customSound = e.target.value || undefined;
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
    const r = { name: v('#rName') || 'My rule', action: v('#rAct'), classes: list('#rCls'), bases: list('#rBase'), exact: false, rarity: v('#rRar') ? [v('#rRar')] : [], minIlvl: +v('#rIlvl') || 0, maxArea: +v('#rArea') || 0, links: +v('#rLinks') || 0, text: v('#rText'), border: v('#rBorder'), bg: v('#rBg'), size: +v('#rSize'), sound: v('#rSnd'), customSound: v('#rCSnd'), volume: cfg.soundVol || 300, beam: v('#rBeam'), icon: v('#rIcon') };
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

  $('#flDl', body).onclick = async () => {
    const text = finalText(); const used = usedSounds(text);
    let blob; let name = 'ExileLedger.filter';
    if (used.length) {
      const files = [{ name: 'ExileLedger.filter', data: new TextEncoder().encode(text) }];
      for (const f of used) { const b = await soundBytes(f); if (b) files.push({ name: `ExileLedgerSounds/${f}`, data: b }); else toast(`Missing sound ${f}, re-upload it`); }
      blob = zip(files); name = 'ExileLedger-filter-and-sounds.zip';
    } else blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // ---------- custom sounds ----------
  async function loadLibrary() { library = [...BUILTIN_SOUNDS, ...MEMES, ...(await userSounds()).map((u) => ({ file: u.file, label: `Yours: ${u.label}` }))]; }
  function drawSounds() {
    const map = cfg.soundMap || {};
    $('#sSlots', body).innerHTML = SLOTS.map(([n, what]) => `<tr><td>Sound ${n}</td><td class="muted small">${esc(what)}</td><td><select data-slot="${n}">${soundOpts(map[n], `Game sound ${n}`)}</select></td><td>${map[n] ? `<button class="ghost small" data-play="${esc(map[n])}">▶</button>` : ''}</td></tr>`).join('');
    $('#sLib', body).innerHTML = library.map((x) => `<span class="fl-item">${esc(x.label)} <button class="ghost small" data-play="${esc(x.file)}">▶</button>${x.builtin || x.url ? '' : `<button class="ghost small" data-delsound="${esc(x.file)}">✕</button>`}</span>`).join(' ');
  }
  const soundsChanged = () => { save(); drawSounds(); drawTiers(); drawPrev(); };
  $('#sSlots', body).onchange = (e) => { const n = e.target.dataset.slot; if (!n) return; cfg.soundMap ||= {}; if (e.target.value) cfg.soundMap[n] = e.target.value; else delete cfg.soundMap[n]; soundsChanged(); };
  $('#sPack', body).onclick = () => { cfg.soundMap = Object.fromEntries(SLOTS.map(([n]) => [n, BUILTIN_SOUNDS[n - 1].file])); soundsChanged(); toast("NeverSink's sound pack on"); };
  $('#sClear', body).onclick = () => { cfg.soundMap = {}; soundsChanged(); };
  $('#sVol', body).oninput = (e) => { cfg.soundVol = +e.target.value; $('#sVolV', body).textContent = cfg.soundVol; save(); };
  $('#sUp', body).onchange = async (e) => {
    for (const f of e.target.files) {
      const file = f.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
      if (!/\.(mp3|wav|ogg)$/.test(file)) { toast(`${f.name}: use mp3, wav or ogg`); continue; }
      const data = await f.arrayBuffer();
      try { await tx('readwrite', (st) => st.put({ file, label: f.name.replace(/\.[^.]+$/, ''), data })); } catch { toast('Could not save the sound in this browser'); }
    }
    e.target.value = ''; await loadLibrary(); soundsChanged(); toast('Sounds added');
  };
  body.onclick = (e) => {
    const p = e.target.closest('[data-play]'); if (p) { play(p.dataset.play); return; }
    const d = e.target.closest('[data-delsound]');
    if (d) { tx('readwrite', (st) => st.delete(d.dataset.delsound)).then(async () => { await loadLibrary(); soundsChanged(); }); }
  };
  const sp = () => (cfg.spoken ||= { on: false, voice: 'AWSPolly-Brian', items: [...SPOKEN_TOP], all: false, essences: false });
  function drawSpoken() {
    const s2 = sp();
    $('#spItems', body).innerHTML = s2.all ? '' : SPOKEN.map((n) => `<button class="ghost small ${(s2.items || []).includes(n) ? 'on' : ''}" data-sp="${esc(n)}">${esc(n.replace(/\b\w/g, (c) => c.toUpperCase()))}</button>`).join('');
    $('#spTry', body).dataset.play = `spoken/${s2.voice}/divine-orb.mp3`;
  }
  const spChanged = () => { save(); drawSpoken(); drawPrev(); };
  $('#spOn', body).onchange = (e) => { sp().on = e.target.checked; spChanged(); };
  $('#spAll', body).onchange = (e) => { sp().all = e.target.checked; spChanged(); };
  $('#spEss', body).onchange = (e) => { sp().essences = e.target.checked; spChanged(); };
  $('#spVoice', body).onchange = (e) => { sp().voice = e.target.value; spChanged(); play(`spoken/${sp().voice}/divine-orb.mp3`); };
  $('#spItems', body).addEventListener('click', (e) => { const n = e.target.dataset.sp; if (!n) return; const s2 = sp(); s2.items = s2.items.includes(n) ? s2.items.filter((x) => x !== n) : [...s2.items, n]; spChanged(); });
  await loadLibrary();
  drawSounds(); drawSpoken();
  $('#flCopy', body).onclick = async () => { try { await navigator.clipboard.writeText(finalText()); toast('Filter copied'); } catch { toast('Copy failed, use Download'); } };
  $('#flReset', body).onclick = () => { cfg = { strict: cfg.strict, presets: [], tiers: {}, moves: {}, rules: [], area: cfg.area }; save(); buildView(body); };

  drawTiers(); drawRules(); drawPrev();
}
