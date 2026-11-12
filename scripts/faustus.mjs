// Faustus watcher: reads GGG's public Currency Exchange feed (hourly digests of every
// trade made through Faustus), keeps a rolling price history for one league, and sends
// buy/sell alerts when an item's price moves sharply against its last-24-hour median.
//
// Usage: node scripts/faustus.mjs [path/to/faustus.json]
// Env:   FAUSTUS_LEAGUE  league name, or "auto" (default) to follow the current challenge league
//        NTFY_TOPIC      ntfy.sh topic to push alerts to (optional)
//        DISCORD_WEBHOOK Discord webhook URL to post alerts to (optional)
//        DROP_PCT / RISE_PCT  alert thresholds in percent (default 15)
//        MIN_VOLUME      minimum chaos-equivalent traded in the hour to alert (default 150)
//        SITE_URL        link included in alerts

import fs from 'node:fs';
import path from 'node:path';

const FILE = process.argv[2] || 'data/user/faustus.json';
const NAMES = JSON.parse(fs.readFileSync(new URL('./faustus-names.json', import.meta.url)));
const FEED = 'https://web.poecdn.com/api/currency-exchange';
const UA = 'exile-ledger/1.0 (github.com/FrostyCreations/poe-market)';
const CHAOS = 'Metadata/Items/Currency/CurrencyRerollRare';
const DIVINE = 'Metadata/Items/Currency/CurrencyModValues';
const KEEP_HOURS = 48;          // history kept per item
const BASE_HOURS = 24;          // window for the "normal" price
const MAX_ITEMS = 260;          // most-traded items kept in the file
const env = process.env;
const DROP = +(env.DROP_PCT || 15) / 100;
const RISE = +(env.RISE_PCT || 15) / 100;
const MIN_VOL = +(env.MIN_VOLUME || 150);
const WATCH_FACTOR = 0.67;      // watchlist items alert at two thirds of the normal threshold
const COOLDOWN_H = 6;           // don't repeat the same alert within this many hours
const PUSH_MAX = +(env.PUSH_MAX || 10); // strongest alerts per push (watchlist items get a 1.5x boost)
const SITE = env.SITE_URL || 'https://poe-market.pages.dev/#faustus';

const short = (id) => id.replace(/^Metadata\/Items\//, '');
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (n) => (n >= 100 ? Math.round(n) : n >= 1 ? Math.round(n * 100) / 100 : Math.round(n * 10000) / 10000);

async function hour(id) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${FEED}/${id}`, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    if (r.status === 404) return null; // that hour isn't published yet
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 15000)); continue; }
    throw new Error(`Feed ${id}: ${r.status}`);
  }
  throw new Error(`Feed ${id}: rate limited`);
}

// Price of `item` in `base` from one market row: geometric mean of the hour's low and high ratio.
function ratePrice(m, item, base) {
  const p = (r) => (r && r[item] && r[base] ? r[base] / r[item] : null);
  const lo = p(m.lowest_ratio); const hi = p(m.highest_ratio);
  if (lo && hi) return Math.sqrt(lo * hi);
  return lo || hi;
}

const isChallenge = (l) => !/standard|hardcore|ssf|ruthless|\(pl\d+\)/i.test(l);

function pickLeague(markets, wanted) {
  if (wanted && wanted !== 'auto') return wanted;
  const vol = {};
  for (const m of markets) {
    if (!isChallenge(m.league)) continue;
    vol[m.league] = (vol[m.league] || 0) + Object.values(m.volume_traded || {}).reduce((a, b) => a + b, 0);
  }
  const best = Object.entries(vol).sort((a, b) => b[1] - a[1])[0];
  // Before a league launches the only "challenge" trading is tiny private or event leagues.
  return best && best[1] > 2000 ? best[0] : 'Standard';
}

// One hour of markets -> { chaosPerDiv, prices: {item: [chaosPrice, chaosVolume]} } for a league.
function digest(markets, league, prevCpd) {
  const rows = markets.filter((m) => m.league === league);
  let cpd = null;
  const cd = rows.find((m) => m.market_pair.includes(CHAOS) && m.market_pair.includes(DIVINE));
  if (cd) cpd = ratePrice(cd, DIVINE, CHAOS);
  cpd = cpd || prevCpd;
  if (!cpd) return null;
  const acc = {};
  const add = (item, price, vol) => {
    if (!price || !isFinite(price) || vol <= 0) return;
    const a = (acc[item] ||= { lw: 0, w: 0, v: 0 });
    a.lw += Math.log(price) * vol; a.w += vol; a.v += vol;
  };
  for (const m of rows) {
    const [x, y] = m.market_pair;
    for (const [item, base] of [[x, y], [y, x]]) {
      if (base !== CHAOS && base !== DIVINE) continue;
      if (item === CHAOS) continue;
      const p = ratePrice(m, item, base);
      if (!p) continue;
      const mult = base === DIVINE ? cpd : 1;
      const vol = (m.volume_traded?.[base] || 0) * mult;
      add(item, p * mult, vol);
    }
  }
  const prices = {};
  for (const [item, a] of Object.entries(acc)) prices[short(item)] = [Math.exp(a.lw / a.w), a.v];
  prices[short(DIVINE)] = [cpd, prices[short(DIVINE)]?.[1] || 0];
  return { cpd, prices };
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}

function watchNames() {
  try {
    const w = JSON.parse(fs.readFileSync('data/user/watchlist.json', 'utf8'));
    return new Set(w.filter((x) => (x.game || 'poe1') === 'poe1').map((x) => x.name.toLowerCase()));
  } catch { return new Set(); }
}

async function notify(alerts, league) {
  if (!alerts.length) return;
  const fmt = (a) => `${a.dir === 'down' ? '🔻' : '🔺'} ${a.name}: ${r3(a.price)}c (${a.change > 0 ? '+' : ''}${Math.round(a.change * 100)}% vs 24h) ${a.dir === 'down' ? 'buy?' : 'sell?'}`;
  const top = alerts.slice(0, PUSH_MAX);
  const lines = top.map(fmt);
  if (alerts.length > top.length) lines.push(`+${alerts.length - top.length} smaller moves on the site`);
  const title = `Faustus: ${alerts.filter((a) => a.dir === 'down').length} drops, ${alerts.filter((a) => a.dir === 'up').length} rises in ${league}`;
  if (env.NTFY_TOPIC) {
    const r = await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
      method: 'POST', body: lines.join('\n'),
      headers: { Title: title, Tags: 'moneybag', Click: SITE, Priority: alerts.some((a) => Math.abs(a.change) >= 0.3) ? 'high' : 'default' },
    });
    console.log('ntfy', r.status);
  }
  if (env.DISCORD_WEBHOOK) {
    const r = await fetch(env.DISCORD_WEBHOOK, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `**${title}**\n${lines.join('\n')}\n<${SITE}>` }),
    });
    console.log('discord', r.status);
  }
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  let state = loadState();
  const wanted = env.FAUSTUS_LEAGUE || 'auto';
  // Start 30 hours back on a fresh file so there is a 24h baseline straight away.
  let next = state?.next || (Math.floor(now / 3600) - 30) * 3600;
  const fresh = !state;
  const hours = [];
  for (let guard = 0; guard < 72; guard++) {
    const j = await hour(next);
    if (!j) break; // caught up
    if (!j.markets?.length && j.next_change_id === next) break;
    hours.push({ ts: next, markets: j.markets || [] });
    if (!j.next_change_id || j.next_change_id === next) break;
    next = j.next_change_id;
    if (next > now) break;
  }
  if (!hours.length) { console.log('No new hours yet'); return; }

  const league = pickLeague(hours[hours.length - 1].markets, wanted);
  if (!state || state.league !== league) {
    state = { league, items: {}, alerts: [], sent: {}, cpd: null };
  }
  const items = state.items;
  let cpd = state.cpd;
  for (const h of hours) {
    const d = digest(h.markets, league, cpd);
    if (!d) continue;
    cpd = d.cpd;
    for (const [id, [price, vol]] of Object.entries(d.prices)) {
      const meta = NAMES[id];
      if (!meta) continue;
      const it = (items[id] ||= { n: meta[0], i: meta[1], c: meta[2], h: [] });
      it.h.push([h.ts, r3(price), Math.round(vol)]);
    }
  }
  const cutoff = hours[hours.length - 1].ts - KEEP_HOURS * 3600;
  for (const [id, it] of Object.entries(items)) {
    it.h = it.h.filter((p) => p[0] > cutoff);
    if (!it.h.length) delete items[id];
  }
  // Keep the most-traded items so the file stays small.
  const ranked = Object.entries(items).sort((a, b) => b[1].h.reduce((s, p) => s + p[2], 0) - a[1].h.reduce((s, p) => s + p[2], 0));
  state.items = Object.fromEntries(ranked.slice(0, MAX_ITEMS));

  // Alerts for the newest hour only.
  const latest = hours[hours.length - 1].ts;
  const watch = watchNames();
  const newAlerts = [];
  for (const [id, it] of Object.entries(state.items)) {
    const last = it.h[it.h.length - 1];
    if (!last || last[0] !== latest) continue;
    const prev = it.h.filter((p) => p[0] < latest && p[0] >= latest - BASE_HOURS * 3600);
    if (prev.length < 6) continue;
    const base = median(prev.map((p) => p[1]));
    const change = last[1] / base - 1;
    // Sharp moves only: the last hour must also break away from the 3 hours before it,
    // so the slow price slide every new league has doesn't fire alerts all day.
    const recent = median(prev.slice(-3).map((p) => p[1]));
    const jump = last[1] / recent - 1;
    const watched = watch.has(it.n.toLowerCase());
    const f = watched ? WATCH_FACTOR : 1;
    if (last[2] < MIN_VOL * (watched ? 0.5 : 1)) continue;
    let dir = null;
    if (change <= -DROP * f && jump <= -0.05) dir = 'down';
    else if (change >= RISE * f && jump >= 0.05) dir = 'up';
    if (!dir) continue;
    const key = `${id}|${dir}`;
    const prior = state.sent[key];
    if (prior && latest - prior.ts < COOLDOWN_H * 3600 && Math.abs(change) < Math.abs(prior.change) + 0.1) continue;
    state.sent[key] = { ts: latest, change };
    const score = Math.min(Math.abs(change), 3) * Math.log10(10 + last[2]) * (watched ? 1.5 : 1);
    newAlerts.push({ ts: latest, id, name: it.n, icon: it.i, dir, change: Math.round(change * 1000) / 1000, jump: Math.round(jump * 1000) / 1000, price: last[1], base: r3(base), vol: last[2], watched, score: Math.round(score * 100) / 100 });
  }
  newAlerts.sort((a, b) => b.score - a.score);
  state.alerts = [...newAlerts, ...(state.alerts || [])].filter((a) => a.ts > latest - 48 * 3600).slice(0, 200);
  for (const [k, v] of Object.entries(state.sent)) if (latest - v.ts > 48 * 3600) delete state.sent[k];

  state.cpd = cpd;
  state.next = next;
  state.latest = latest;
  state.updated = new Date().toISOString();
  state.thresholds = { drop: DROP, rise: RISE, minVolume: MIN_VOL };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state));
  console.log(`${league}: ${hours.length} new hour(s), ${Object.keys(state.items).length} items, ${newAlerts.length} alert(s), divine ${r3(cpd)}c, ${(fs.statSync(FILE).size / 1024).toFixed(0)} KB`);

  if (!fresh) await notify(newAlerts, league);
  else console.log('First run: history backfilled, alerts start next hour');
}

main().catch((e) => { console.error(e); process.exit(1); });
