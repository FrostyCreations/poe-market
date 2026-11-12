#!/usr/bin/env node
// wealthy: a small CLI that reads public farming strategies from wealthyexile.com.
//
//   wealthy list [--league current|Allflame|Mirage|...] [--tag boss] [--difficulty easy]
//                [--sort profit|peak|favorites|updated] [--limit 20] [--json]
//   wealthy show <id> [--league <name>] [--json]
//   wealthy leagues
//   wealthy export [--league <name>] [--details 10] [--out strats.json]
//
// It only reads public pages that robots.txt allows (/strategies), caches them for 30 minutes,
// and waits between requests. Strategy write-ups belong to their authors: this is for reading
// them yourself, not for republishing them.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'https://wealthyexile.com';
const UA = 'wealthy-cli/1.0 (personal use; github.com/FrostyCreations/poe-market)';
const CACHE_DIR = path.join(os.homedir(), '.cache', 'wealthy-cli');
const CACHE_MS = 30 * 60 * 1000;
const GAP_MS = 1500;
const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const gold = (s) => c('33', s); const dim = (s) => c('2', s); const bold = (s) => c('1', s);
const green = (s) => c('32', s); const red = (s) => c('31', s); const cyan = (s) => c('36', s);

// ---------- fetching ----------
let lastFetch = 0;
async function get(url, { fresh = false } = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, Buffer.from(url).toString('base64url').slice(0, 180) + '.html');
  if (!fresh && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < CACHE_MS) return fs.readFileSync(file, 'utf8');
  const wait = lastFetch + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetch = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  const html = await res.text();
  fs.writeFileSync(file, html);
  return html;
}

// Next.js streams its page data as self.__next_f.push([1,"..."]) chunks; join and unescape them.
function flight(html) {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) out += JSON.parse(`"${m[1]}"`);
  return out;
}

// Pull every balanced JSON object that starts with `start` out of the flight text.
function objects(text, start) {
  const found = [];
  let i = text.indexOf(start);
  while (i !== -1) {
    let depth = 0; let inStr = false; let esc = false; let j = i;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) break; }
    }
    try { found.push(JSON.parse(text.slice(i, j + 1))); } catch { /* skip malformed */ }
    i = text.indexOf(start, j + 1);
  }
  return found;
}

const val = (v) => (typeof v === 'string' && (v === '$undefined' || v.startsWith('$')) ? (v.startsWith('$D') ? v.slice(2) : undefined) : v);

// ---------- data ----------
async function listStrategies(league, fresh) {
  const url = !league || league === 'current' ? `${BASE}/strategies/public` : `${BASE}/strategies/archived/${encodeURIComponent(league)}`;
  const text = flight(await get(url, { fresh }));
  const seen = new Map();
  for (const o of objects(text, '{"author":')) {
    if (o.id == null || !o.name || seen.has(o.id)) continue;
    const series = (o.last7Days || []).filter((n) => typeof n === 'number');
    seen.set(o.id, {
      id: o.id, name: o.name, author: o.author, area: o.area, difficulty: o.difficulty, tags: o.tags || [],
      profit: o.profit, peak: series.length ? Math.max(...series) : o.profit, last7Days: series,
      favorites: o.favorites, updated: val(o.updatedAt), league: o.pricingLeague, chaosPerDivine: val(o.chaosPerDivine),
      url: `${BASE}/strategies/${o.id}/s${o.pricingLeague ? `?league=${encodeURIComponent(o.pricingLeague)}` : ''}`,
    });
  }
  return [...seen.values()];
}

async function leagues() {
  const html = await get(`${BASE}/strategies/public`);
  return ['current', ...new Set([...(html + flight(html)).matchAll(/\/strategies\/archived\/([A-Za-z0-9%]+)/g)].map((m) => decodeURIComponent(m[1])))];
}

function docText(node, out = []) {
  if (!node) return out;
  if (node.type === 'text') { out.push(node.text); return out; }
  const kids = node.content || [];
  if (node.type === 'heading') { out.push('\n## '); kids.forEach((k) => docText(k, out)); out.push('\n'); return out; }
  if (node.type === 'listItem') { out.push('\n  - '); kids.forEach((k) => docText(k, out)); return out; }
  if (node.type === 'hardBreak') { out.push('\n'); return out; }
  kids.forEach((k) => docText(k, out));
  if (node.type === 'paragraph') out.push('\n');
  return out;
}

async function showStrategy(id, league, fresh) {
  const url = `${BASE}/strategies/${id}/s${league ? `?league=${encodeURIComponent(league)}` : ''}`;
  const text = flight(await get(url, { fresh }));
  const s = objects(text, '{"id":' + id + ',"name"')[0];
  if (!s) throw new Error(`Strategy ${id} not found (it may be private or removed)`);
  const items = (s.items || []).map((it) => {
    const p = it.price || {};
    const unit = p.chaosValue ?? p.chaos ?? p.value ?? p.price ?? null;
    return { name: p.name || p.itemName || p.item?.name || `price #${it.priceID}`, quantity: it.quantity, chaos: unit, total: unit != null ? unit * it.quantity : null };
  });
  const values = (s.values || []).map((v) => ({ at: val(v.createdAt), chaos: v.value }));
  return {
    id: s.id, name: s.name, author: s.author, area: s.area, difficulty: s.difficulty, durationHours: s.duration,
    tags: (s.tags || []).map((t) => t.name), favorites: s.favorites, created: val(s.createdAt), updated: val(s.updatedAt),
    links: { strategy: url, source: s.sourceLink || null, atlasTree: s.atlasTreeLink || null, filter: s.filterLink || null, pob: s.pobLink || null },
    items, profitHistory: values, description: docText(s.description).join('').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

// ---------- output ----------
const chaosTxt = (n) => (n == null ? '?' : `${Math.round(n).toLocaleString()}c`);
const SPARK = '▁▂▃▄▅▆▇█';
const spark = (a) => { if (!a.length) return ''; const lo = Math.min(...a); const hi = Math.max(...a); return a.map((n) => SPARK[hi === lo ? 3 : Math.round(((n - lo) / (hi - lo)) * 7)]).join(''); };
const pad = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n); };

function printList(rows, opts) {
  if (!rows.length) { console.log(dim(`No strategies found${opts.league ? ` for ${opts.league}` : ''}. Covens of Umbra strategies appear once the league is live; try --league Allflame.`)); return; }
  console.log(bold(`${pad('ID', 6)} ${pad('Strategy', 40)} ${pad('Profit/h', 10)} ${pad('Peak 7d', 10)} ${pad('Trend', 10)} ${pad('Diff', 7)} ${pad('Favs', 6)} Tags`));
  for (const r of rows) {
    const p = r.profit ?? 0;
    console.log(`${pad(r.id, 6)} ${pad(r.name, 40)} ${(p >= 0 ? green : red)(pad(chaosTxt(p), 10))} ${gold(pad(chaosTxt(r.peak), 10))} ${cyan(pad(spark([...r.last7Days].reverse()), 10))} ${pad(r.difficulty, 7)} ${pad(r.favorites, 6)} ${dim(r.tags.join(', '))}`);
  }
  console.log(dim(`\n${rows.length} strategies. "wealthy show <id>" for details. Profit is chaos per hour at current prices; Peak is the best value in the last 7 days.`));
}

function printStrategy(s) {
  console.log(`\n${bold(gold(s.name))}  ${dim(`#${s.id}`)}`);
  console.log(`${dim('by')} ${s.author}  ·  ${s.area}  ·  ${s.difficulty}  ·  ${s.durationHours}h test  ·  ★ ${s.favorites ?? 0}`);
  if (s.tags.length) console.log(dim(`Tags: ${s.tags.join(', ')}`));
  const L = s.links;
  console.log(`\n${bold('Links')}`);
  for (const [k, v] of Object.entries({ Strategy: L.strategy, Source: L.source, 'Atlas tree': L.atlasTree, 'Loot filter': L.filter, PoB: L.pob })) if (v) console.log(`  ${pad(k, 12)} ${cyan(v)}`);
  if (s.profitHistory.length) {
    const recent = s.profitHistory.slice(-48).map((v) => v.chaos);
    console.log(`\n${bold('Profit per hour')}  ${cyan(spark(recent))}  now ${gold(chaosTxt(recent[recent.length - 1]))}, best ${chaosTxt(Math.max(...recent))}`);
  }
  const priced = s.items.filter((i) => i.chaos != null);
  const unpriced = s.items.length - priced.length;
  if (s.items.length) {
    console.log(`\n${bold('Items')}`);
    for (const i of [...priced].sort((a, b) => Math.abs(b.total ?? 0) - Math.abs(a.total ?? 0)).slice(0, 25)) {
      console.log(`  ${(i.quantity < 0 ? red : green)(pad(i.quantity, 7))} ${pad(i.name, 34)} ${i.chaos != null ? `${pad(chaosTxt(i.chaos), 9)} ${chaosTxt(i.total)}` : ''}`);
    }
    if (unpriced) console.log(dim(`  ${unpriced} item${unpriced > 1 ? 's' : ''} without a name or price. Wealthy Exile only fills these in while the strategy's league is live.`));
    if (priced.length && !unpriced) {
      const cost = priced.filter((i) => i.quantity < 0).reduce((t, i) => t + i.total, 0);
      const rev = priced.filter((i) => i.quantity > 0).reduce((t, i) => t + i.total, 0);
      console.log(`  ${dim('Cost')} ${red(chaosTxt(-cost))}  ${dim('Revenue')} ${green(chaosTxt(rev))}  ${dim('Net')} ${gold(chaosTxt((rev + cost) / (s.durationHours || 1)))}/h`);
    }
  }
  if (s.description) console.log(`\n${bold('How it works')} ${dim(`(written by ${s.author})`)}\n${s.description}`);
  console.log();
}

// ---------- cli ----------
function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) o[k] = true; else { o[k] = n; i++; } } else o._.push(a);
  }
  return o;
}

const HELP = `wealthy: read public farming strategies from wealthyexile.com

  wealthy list [--league current|Allflame|Mirage|...] [--tag <text>] [--difficulty easy|medium|hard]
               [--sort profit|peak|favorites|updated] [--limit 20] [--json]
  wealthy show <id> [--league <name>] [--json]
  wealthy leagues
  wealthy export [--league <name>] [--details 10] [--out strats.json]

Add --fresh to skip the 30 minute cache.`;

async function main() {
  const o = parse(process.argv.slice(2));
  const cmd = o._[0] || 'help';
  const fresh = !!o.fresh;
  if (cmd === 'help' || o.help) { console.log(HELP); return; }
  if (cmd === 'leagues') { console.log((await leagues()).join('\n')); return; }
  if (cmd === 'list' || cmd === 'export') {
    let rows = await listStrategies(o.league, fresh);
    if (o.tag) rows = rows.filter((r) => r.tags.some((t) => t.toLowerCase().includes(String(o.tag).toLowerCase())) || r.name.toLowerCase().includes(String(o.tag).toLowerCase()));
    if (o.difficulty) rows = rows.filter((r) => (r.difficulty || '').toLowerCase() === String(o.difficulty).toLowerCase());
    const key = o.sort || (o.league && o.league !== 'current' ? 'peak' : 'profit');
    const by = { profit: (r) => r.profit ?? -Infinity, peak: (r) => r.peak ?? -Infinity, favorites: (r) => r.favorites ?? 0, updated: (r) => Date.parse(r.updated || 0) }[key] || ((r) => r.profit);
    rows.sort((a, b) => by(b) - by(a));
    rows = rows.slice(0, +(o.limit || (cmd === 'export' ? 1000 : 20)));
    if (cmd === 'export') {
      const n = +(o.details || 0);
      for (const r of rows.slice(0, n)) { process.stderr.write(`details ${r.id} ${r.name}\n`); r.details = await showStrategy(r.id, r.league, fresh); }
      const out = JSON.stringify({ source: BASE, league: o.league || 'current', fetched: new Date().toISOString(), strategies: rows }, null, 1);
      if (o.out) { fs.writeFileSync(o.out, out); console.log(`Saved ${rows.length} strategies to ${o.out}`); } else console.log(out);
      return;
    }
    if (o.json) console.log(JSON.stringify(rows, null, 1)); else printList(rows, o);
    return;
  }
  if (cmd === 'show') {
    const id = o._[1];
    if (!id || !/^\d+$/.test(id)) throw new Error('Usage: wealthy show <id>');
    const s = await showStrategy(id, o.league, fresh);
    if (o.json) console.log(JSON.stringify(s, null, 1)); else printStrategy(s);
    return;
  }
  console.log(HELP);
}

main().catch((e) => { console.error(red(`Error: ${e.message}`)); process.exit(1); });
