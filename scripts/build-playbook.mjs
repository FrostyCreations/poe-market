#!/usr/bin/env node
// Builds a "launch playbook" file for one league: the value of every exchange
// item in divines for every day of the league, taken from poe.ninja history.
//
// Usage:
//   node scripts/build-playbook.mjs --game poe1 --league "Allflame"
//   node scripts/build-playbook.mjs --game poe2 --league "Forbidden Rites"
//
// Output: data/playbook/<game>-<league-url>.json and an updated data/playbook/index.json

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../assets/config.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const game = args.game || 'poe1';
const league = args.league;
if (!league) {
  console.error('Missing --league');
  process.exit(1);
}
const BASE = 'https://poe.ninja';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'poe-market-dashboard playbook builder' } });
      if (r.status === 404) return null;
      if (r.ok) return await r.json();
    } catch {}
    await sleep(800 * (i + 1));
  }
  return null;
}

const q = (o) => new URLSearchParams(o).toString();
const overview = (type) => get(`${BASE}/${game}/api/economy/exchange/current/overview?${q({ league, type })}`);
const details = (type, id) => get(`${BASE}/${game}/api/economy/exchange/current/details?${q({ league, type, id })}`);

const sig = (x) => (x == null || !isFinite(x) ? null : Number(x.toPrecision(4)));
const dayKey = (ts) => ts.slice(0, 10);

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
        await sleep(120);
      }
    }),
  );
  return out;
}

async function main() {
  const cfg = GAMES[game];
  // 1. Conversion rates: how many of each core unit buys one divine, per day.
  const divDetails = await details('Currency', 'divine-orb');
  if (!divDetails) throw new Error('Could not load divine history. Is the league name right?');
  const unitPerDiv = {}; // unit -> { day: rate }
  for (const p of divDetails.pairs) {
    unitPerDiv[p.id] = {};
    for (const h of p.history) unitPerDiv[p.id][dayKey(h.timestamp)] = h.rate;
  }
  const allDays = Object.keys(Object.values(unitPerDiv)[0] || {}).sort();
  const start = allDays[0];
  const dayIndex = (d) => Math.round((Date.parse(d) - Date.parse(start)) / 86400000);
  const nDays = dayIndex(allDays[allDays.length - 1]) + 1;
  console.log(`${league}: ${nDays} days of history from ${start}`);

  const divCurves = {};
  for (const [unit, m] of Object.entries(unitPerDiv)) {
    const arr = Array(nDays).fill(null);
    for (const [d, v] of Object.entries(m)) arr[dayIndex(d)] = sig(v);
    divCurves[unit] = arr;
  }

  // 2. Every item in every exchange category.
  const items = [];
  for (const type of cfg.exchangeTypes) {
    const ov = await overview(type);
    if (!ov?.lines?.length) continue;
    const meta = Object.fromEntries((ov.items || []).map((x) => [x.id, x]));
    for (const l of ov.lines) {
      const m = meta[l.id];
      if (!m?.detailsId) continue;
      items.push({ type, id: l.id, detailsId: m.detailsId, name: m.name, icon: m.image, now: l.primaryValue });
    }
    console.log(`  ${type}: ${ov.lines.length} items`);
  }

  // 3. History for each item, converted to divines.
  let done = 0;
  const rows = await pool(items, 4, async (it) => {
    const d = await details(it.type, it.detailsId);
    if (++done % 50 === 0) console.log(`  history ${done}/${items.length}`);
    if (!d?.pairs) return null;
    const best = {}; // day -> [volume, divValue]
    for (const p of d.pairs) {
      for (const h of p.history) {
        const day = dayKey(h.timestamp);
        let div;
        if (p.id === 'divine') div = h.rate;
        else if (unitPerDiv[p.id]?.[day]) div = h.rate / unitPerDiv[p.id][day];
        else continue;
        const vol = h.volumePrimaryValue || 0;
        if (vol <= 0) continue; // no trades that day, the rate is not real
        if (!best[day] || vol > best[day][0]) best[day] = [vol, div];
      }
    }
    const v = Array(nDays).fill(null);
    const vol = Array(nDays).fill(null);
    for (const [day, [volume, div]] of Object.entries(best)) {
      const i = dayIndex(day);
      if (i >= 0 && i < nDays) {
        v[i] = sig(div);
        vol[i] = Math.round(volume);
      }
    }
    if (v.filter((x) => x != null).length < 5) return null;
    return { type: it.type, id: it.id, name: it.name, icon: it.icon, v, vol };
  });

  const out = {
    game,
    league,
    start,
    generated: new Date().toISOString(),
    primary: divDetails.core?.primary || (game === 'poe1' ? 'chaos' : 'divine'),
    unitPerDiv: divCurves,
    items: rows.filter(Boolean),
  };
  const slug = `${game}-${league.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
  const dir = path.join(root, 'data/playbook');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${slug}.json`), JSON.stringify(out));

  const idxPath = path.join(dir, 'index.json');
  let idx = [];
  try {
    idx = JSON.parse(await fs.readFile(idxPath, 'utf8'));
  } catch {}
  idx = idx.filter((x) => x.slug !== slug);
  idx.push({ slug, game, league, start, days: nDays, items: out.items.length, generated: out.generated });
  idx.sort((a, b) => b.start.localeCompare(a.start));
  await fs.writeFile(idxPath, JSON.stringify(idx, null, 2) + '\n');
  console.log(`Wrote ${slug}.json with ${out.items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
