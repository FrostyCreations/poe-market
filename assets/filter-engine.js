// Small PoE1 item filter engine: parse a filter, apply customisations, write it back,
// and evaluate sample items for the preview. Built around NeverSink's filter, which tags
// its blocks with "$type->x $tier->y" comments (the same tags FilterBlade edits).

const STYLE_KEYS = ['SetFontSize', 'SetTextColor', 'SetBorderColor', 'SetBackgroundColor', 'PlayAlertSound', 'PlayAlertSoundPositional', 'CustomAlertSound', 'CustomAlertSoundOptional', 'PlayEffect', 'MinimapIcon', 'DisableDropSound', 'EnableDropSound', 'DisableDropSoundIfAlertSound', 'EnableDropSoundIfAlertSound'];
const isStyle = (k) => STYLE_KEYS.includes(k);

// Split a line into its keyword and tokens; quoted strings stay together.
function tokens(line) {
  const out = []; const re = /"([^"]*)"|(\S+)/g; let m;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? { q: true, v: m[1] } : { q: false, v: m[2] });
  return out;
}

export function parse(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks = []; let cur = null; let header = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    const head = /^(Show|Hide|Minimal)\b/.exec(raw);
    if (head) {
      const tag = /\$type->(\S+)/.exec(raw); const tier = /\$tier->(\S+)/.exec(raw);
      cur = { action: head[1], head: raw, type: tag?.[1] || '', tier: tier?.[1] || '', lines: [], conds: [], acts: {}, cont: false };
      blocks.push(cur);
      continue;
    }
    if (!cur) { header.push(raw); continue; }
    if (!line) { cur.lines.push(raw); continue; }
    cur.lines.push(raw);
    const t = tokens(line); const key = t[0].v; const rest = t.slice(1);
    if (key === 'Continue') { cur.cont = true; continue; }
    if (isStyle(key)) { cur.acts[key] = rest.map((x) => x.v); continue; }
    let op = '=';
    if (rest[0] && !rest[0].q && /^(==|!=|<=|>=|<|>|=|!)$/.test(rest[0].v)) op = rest.shift().v;
    // "Sockets >= 5RGB" style values come through as single bare tokens, keep them as-is.
    cur.conds.push({ key, op, vals: rest.map((x) => x.v), quoted: rest.some((x) => x.q) });
  }
  return { header: header.join('\n'), blocks };
}

// ---------- evaluation ----------
const RARITY = { Normal: 0, Magic: 1, Rare: 2, Unique: 3 };
const BOOL_DEFAULT_FALSE = new Set(['Corrupted', 'Identified', 'Mirrored', 'FracturedItem', 'SynthesisedItem', 'Replica', 'Foulborn', 'AnyEnchantment', 'BlightedMap', 'UberBlightedMap', 'ZanaMemory', 'HasCruciblePassiveTree', 'ElderItem', 'ShaperItem', 'Fated', 'Vestigial', 'TransfiguredGem', 'Imbued', 'HasSearingExarchImplicit', 'HasEaterOfWorldsImplicit', 'ElderMap', 'ShapedMap', 'Scourged', 'IsVaalGem', 'HasImplicitMod']);
const cmp = (a, op, b) => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : op === '!' || op === '!=' ? a !== b : a === b);

function condMatch(c, it) {
  const { key, op, vals } = c;
  if (key === 'Class' || key === 'BaseType') {
    const v = key === 'Class' ? it.cls : it.base;
    const hit = op === '==' ? vals.includes(v) : vals.some((x) => v.includes(x));
    return op === '!' || op === '!=' ? !hit : hit;
  }
  if (key === 'Rarity') {
    const r = RARITY[it.rarity || 'Normal'];
    if (['<', '<=', '>', '>='].includes(op)) return cmp(r, op, RARITY[vals[0]]);
    const hit = vals.some((x) => RARITY[x] === r);
    return op === '!' || op === '!=' ? !hit : hit;
  }
  if (BOOL_DEFAULT_FALSE.has(key)) return (it[key] ?? false) === (vals[0] === 'True');
  if (key === 'HasExplicitMod' || key === 'HasEnchantment' || key === 'EnchantmentPassiveNode') {
    const mods = it.mods || [];
    let need = 1; let list = vals;
    if (/^\d+$/.test(op) || ['>=', '>', '='].includes(op) && /^\d+$/.test(vals[0])) { need = +vals[0]; list = vals.slice(1); }
    return list.filter((m) => mods.some((x) => x.includes(m))).length >= need;
  }
  if (key === 'HasInfluence') return vals.includes('None') ? !it.influence : vals.includes(it.influence);
  if (key === 'SocketGroup') {
    const g = it.socketGroup || '';
    return vals.some((v) => { const m = /^(\d*)([RGBWAD]*)$/.exec(v); if (!m) return false; if (m[1] && (it.LinkedSockets || 0) < +m[1]) return false; return [...m[2]].every((ch) => g.split(ch).length - 1 >= m[2].split(ch).length - 1); });
  }
  if (key === 'Sockets') {
    return vals.some((v) => { const m = /^(\d*)([RGBWAD]*)$/.exec(v); return m && m[1] ? cmp(it.Sockets || 0, op, +m[1]) : false; });
  }
  const num = it[key] ?? (key === 'ItemLevel' ? it.AreaLevel : key === 'StackSize' ? 1 : null);
  if (num == null) return false;
  return vals.some((v) => !isNaN(+v) && cmp(num, op, +v));
}

export function evaluate(blocks, it) {
  let style = {}; let action = 'Show'; let hit = null;
  for (const b of blocks) {
    if (!b.conds.every((c) => condMatch(c, it))) continue;
    style = { ...style, ...b.acts }; action = b.action; hit = b;
    if (!b.cont) break;
  }
  return { action, style, block: hit };
}

// ---------- customisation ----------
// cfg = { tiers: { 'type|tier': { hide, sound:false, beam:false, size, text, border, bg } }, moves: { 'Item name': 'type|tier' }, rules: [...] }
export const SOUND_DIR = 'ExileLedgerSounds/';
const rgb = (hex, a = 255) => { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} ${a}`; };

export function ruleToBlock(r) {
  const L = [`${r.action === 'Hide' ? 'Hide' : 'Show'} # Exile Ledger: ${r.name || 'custom rule'}`];
  const q = (arr) => arr.map((x) => `"${x}"`).join(' ');
  if (r.classes?.length) L.push(`\tClass == ${q(r.classes)}`);
  if (r.bases?.length) L.push(`\tBaseType ${r.exact === false ? '' : '== '}${q(r.bases)}`);
  if (r.rarity?.length) L.push(`\tRarity ${r.rarity.join(' ')}`);
  if (r.minIlvl) L.push(`\tItemLevel >= ${r.minIlvl}`);
  if (r.maxArea) L.push(`\tAreaLevel < ${r.maxArea}`);
  if (r.minArea) L.push(`\tAreaLevel >= ${r.minArea}`);
  if (r.links) L.push(`\tLinkedSockets >= ${r.links}`);
  if (r.socketGroup) L.push(`\tSocketGroup "${r.socketGroup}"`);
  if (r.mods?.length) L.push(`\tHasExplicitMod ${q(r.mods)}`);
  if (r.extra) L.push(...r.extra.map((x) => `\t${x}`));
  if (r.action !== 'Hide') {
    if (r.size) L.push(`\tSetFontSize ${r.size}`);
    if (r.text) L.push(`\tSetTextColor ${rgb(r.text)}`);
    if (r.border) L.push(`\tSetBorderColor ${rgb(r.border)}`);
    if (r.bg) L.push(`\tSetBackgroundColor ${rgb(r.bg, 235)}`);
    if (r.customSound) L.push(`\tCustomAlertSound "${SOUND_DIR}${r.customSound}" ${r.volume || 300}`);
    else if (r.sound) L.push(`\tPlayAlertSound ${r.sound} 300`);
    if (r.beam) L.push(`\tPlayEffect ${r.beam}`);
    if (r.icon) L.push(`\tMinimapIcon 1 ${r.beam || 'White'} ${r.icon}`);
  }
  return L.join('\n');
}

function setLine(lines, key, value) {
  const i = lines.findIndex((l) => new RegExp(`^\\s*${key}\\b`).test(l));
  if (value == null) { if (i >= 0) lines.splice(i, 1); return; }
  const line = `\t${key} ${value}`;
  if (i >= 0) lines[i] = line; else {
    let j = lines.length; while (j > 0 && !lines[j - 1].trim()) j--;
    lines.splice(j, 0, line);
  }
}

export function build(text, cfg) {
  const { header, blocks } = parse(text);
  const out = [];
  const moves = cfg.moves || {};
  const moved = new Set(Object.keys(moves));
  const firstOf = {};
  for (const b of blocks) { const k = `${b.type}|${b.tier}`; if (b.type && !firstOf[k] && b.lines.some((l) => /^\s*BaseType ==/.test(l))) firstOf[k] = b; }
  for (const b of blocks) {
    const k = `${b.type}|${b.tier}`; const t = cfg.tiers?.[k];
    let lines = [...b.lines];
    // Item moves: take moved items out of every tiered BaseType list of the same family, then add them to their target tier.
    if (moved.size && b.type) {
      lines = lines.map((l) => {
        if (!/^\s*BaseType ==/.test(l)) return l;
        const items = tokens(l.replace(/#.*$/, '').trim()).slice(2).map((x) => x.v);
        let keep = items.filter((x) => !(moved.has(x) && moves[x].split('|')[0] === b.type));
        if (firstOf[k] === b) keep = [...new Set([...keep, ...Object.keys(moves).filter((x) => moves[x] === k)])].sort();
        return keep.length ? `\tBaseType == ${keep.map((x) => `"${x}"`).join(' ')}` : null;
      });
      if (lines.includes(null)) { lines = null; }
    }
    let head = b.head;
    if (t && lines) {
      if (t.hide != null) head = head.replace(/^(Show|Hide)/, t.hide ? 'Hide' : 'Show');
      if (t.sound === false) { setLine(lines, 'PlayAlertSound', null); setLine(lines, 'PlayAlertSoundPositional', null); setLine(lines, 'CustomAlertSound', null); }
      if (t.beam === false) setLine(lines, 'PlayEffect', null);
      if (t.size) setLine(lines, 'SetFontSize', t.size);
      if (t.text) setLine(lines, 'SetTextColor', rgb(t.text));
      if (t.border) setLine(lines, 'SetBorderColor', rgb(t.border));
      if (t.bg) setLine(lines, 'SetBackgroundColor', rgb(t.bg));
      if (t.customSound) { setLine(lines, 'PlayAlertSound', null); setLine(lines, 'PlayAlertSoundPositional', null); setLine(lines, 'CustomAlertSound', `"${SOUND_DIR}${t.customSound}" ${cfg.soundVol || 300}`); }
    }
    // Spoken item names: give each spoken item its own copy of the block (same look) that says its name.
    if (lines && cfg.spoken && b.action === 'Show' && b.type.startsWith('currency')) {
      const bl = lines.find((l) => /^\s*BaseType ==/.test(l));
      if (bl) {
        const items = tokens(bl.replace(/#.*$/, '').trim()).slice(2).map((x) => x.v);
        for (const it of items) {
          const f = cfg.spoken(it); if (!f) continue;
          const copy = lines.map((l) => (l === bl ? `\tBaseType == "${it}"` : l)).filter((l) => !/^\s*(PlayAlertSound|PlayAlertSoundPositional|CustomAlertSound)\b/.test(l));
          let j = copy.length; while (j > 0 && !copy[j - 1].trim()) j--;
          copy.splice(j, 0, `\tCustomAlertSound "${SOUND_DIR}${f}" ${cfg.soundVol || 300}`);
          out.push([head.replace(/!(\S+)/, '!$1_spoken'), ...copy].join('\n'));
        }
      }
    }
    // Swap the game's numbered alert sounds for custom files, the way NeverSink's CustomSounds style does.
    if (lines && cfg.soundMap) {
      lines = lines.map((l) => {
        const m = /^(\s*)PlayAlertSound(?:Positional)?\s+(\d+)(?:\s+(\d+))?/.exec(l);
        const f = m && cfg.soundMap[m[2]];
        return f ? `${m[1]}CustomAlertSound "${SOUND_DIR}${f}" ${cfg.soundVol || m[3] || 300}` : l;
      });
    }
    if (lines) out.push([head, ...lines].join('\n'));
    else out.push(`# (Exile Ledger) emptied block removed: ${b.head.replace(/^(Show|Hide)\s*/, '')}\n`);
  }
  const rules = (cfg.rules || []).filter((r) => r.on !== false).map(ruleToBlock);
  const stamp = `#===============================================================================================================\n# Customised with Exile Ledger's filter builder on ${new Date().toISOString().slice(0, 10)}\n# Base: NeverSink's filter (MIT licence), https://github.com/NeverSinkDev/NeverSink-Filter\n#===============================================================================================================\n`;
  return `${stamp}${header}\n${rules.length ? `# Exile Ledger custom rules (these win over everything below)\n${rules.join('\n\n')}\n\n` : ''}${out.join('\n')}`;
}

// The tier lists FilterBlade-style editing works on: tagged blocks that hold a BaseType == item list.
export function tierLists(text) {
  const { blocks } = parse(text);
  const types = {};
  for (const b of blocks) {
    if (!b.type) continue;
    const bt = b.conds.find((c) => c.key === 'BaseType' && c.op === '==');
    if (!bt) continue;
    const k = `${b.type}|${b.tier}`;
    const t = (types[b.type] ||= {});
    if (!t[k]) t[k] = { key: k, type: b.type, tier: b.tier, action: b.action, acts: b.acts, items: [] };
    t[k].items.push(...bt.vals);
  }
  return types;
}

// Every custom sound file the finished filter refers to.
export const usedSounds = (text) => [...new Set([...text.matchAll(/CustomAlertSound "ExileLedgerSounds\/([^"]+)"/g)].map((m) => m[1]))];

// Minimal zip writer (stored, no compression) so the filter and its sounds download together.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files) {
  const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name); const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data); const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
