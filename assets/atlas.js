import { $, $$, esc, toast } from './app.js';

// Atlas passive trees: our own SVG viewer over the 3.30 tree data (taken from poedb), with three drafted trees.
let treeData = null;
let plans = null;
let current = 0;
let view = null; // viewBox [x, y, w, h]

const KIND_R = [26, 44, 62];

async function load() {
  if (!treeData) {
    const [t, p] = await Promise.all([
      fetch('data/atlas/tree-3.30.json').then((r) => r.json()),
      fetch('data/atlas/trees.json').then((r) => r.json()),
    ]);
    treeData = t; plans = p;
  }
}

function svgMarkup(t) {
  const N = t.nodes;
  const edge = (e) => {
    const [a, b, r, sweep] = e; const A = N[a]; const B = N[b];
    if (!A || !B) return '';
    const d = r ? `M${A[0]} ${A[1]}A${r} ${r} 0 0 ${sweep} ${B[0]} ${B[1]}` : `M${A[0]} ${A[1]}L${B[0]} ${B[1]}`;
    return `<path d="${d}" data-a="${a}" data-b="${b}"/>`;
  };
  const node = ([id, n]) => `<circle cx="${n[0]}" cy="${n[1]}" r="${KIND_R[n[2]]}" class="k${n[2]}" data-id="${id}"/>`;
  const labels = Object.entries(t.labels).map(([m, [x, y, n]]) => `<text x="${x}" y="${y}" class="${n < 20 ? 'minor' : ''}">${esc(m)}</text>`).join('');
  return `
    <g class="at-edges">${t.edges.map(edge).join('')}</g>
    <g class="at-labels">${labels}</g>
    <g class="at-nodes">${Object.entries(N).map(node).join('')}</g>`;
}

function setView(svg, v) {
  view = v;
  svg.setAttribute('viewBox', v.map((n) => Math.round(n)).join(' '));
  svg.classList.toggle('zoomed', v[2] < 9000);
}

function fit(svg, ids) {
  const N = treeData.nodes;
  const pts = (ids || Object.keys(N)).map((i) => N[i]).filter(Boolean);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const pad = 500; const w = x1 - x0 + pad * 2; const h = y1 - y0 + pad * 2;
  const box = svg.getBoundingClientRect(); const aspect = box.width / Math.max(box.height, 1) || 1.4;
  const W = Math.max(w, h * aspect); const H = W / aspect;
  setView(svg, [(x0 + x1) / 2 - W / 2, (y0 + y1) / 2 - H / 2, W, H]);
}

function paint(svg, plan) {
  const on = new Set([...plan.hashes.map(String), String(treeData.start)]);
  svg.style.setProperty('--alloc', plan.color);
  $$('.at-nodes circle', svg).forEach((c) => c.classList.toggle('on', on.has(c.dataset.id)));
  $$('.at-edges path', svg).forEach((p) => p.classList.toggle('on', on.has(p.dataset.a) && on.has(p.dataset.b)));
}

function sidePanel(plan) {
  const N = treeData.nodes;
  const by = {};
  for (const h of plan.hashes) {
    const n = N[h]; if (!n) continue;
    const m = n[5] || 'Paths';
    (by[m] ||= { pts: 0, notables: [] }).pts++;
    if (n[2] > 0) by[m].notables.push([h, n]);
  }
  const groups = Object.entries(by).sort((a, b) => b[1].pts - a[1].pts);
  const major = groups.filter(([, g]) => g.notables.length);
  const minor = groups.filter(([, g]) => !g.notables.length).reduce((s, [, g]) => s + g.pts, 0);
  const max = Math.max(...groups.map(([, g]) => g.pts));
  return `
    <div class="at-actions">
      <a class="btn-link" href="${esc(plan.poedb)}" target="_blank" rel="noopener">Open in poedb ↗</a>
      <button class="ghost small" id="atCopy">Copy link</button>
      <span class="tag gold">${plan.hashes.length} / ${treeData.points} points</span>
    </div>
    <h4 class="at-h">Why it should work</h4>
    <ul class="plain-list at-list">${plan.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
    <h4 class="at-h">Where the points go</h4>
    <div class="at-mechs">${major.map(([m, g]) => `
      <details class="at-mech">
        <summary><span class="at-mname">${esc(m)}</span><span class="at-bar"><i style="width:${(g.pts / max) * 100}%"></i></span><b>${g.pts}</b></summary>
        <ul>${g.notables.map(([h, n]) => `<li data-focus="${h}"><b>${esc(n[3])}</b>${n[2] === 2 ? ' <span class="tag gold">Keystone</span>' : ''}<span>${esc(n[4].join(' ') || (n[6] ? 'Choose one: ' + n[6].join(' | ') : ''))}</span></li>`).join('')}</ul>
      </details>`).join('')}
      ${minor ? `<div class="muted small" style="margin-top:4px">${minor} more points on pathing through other wheels.</div>` : ''}
    </div>
    ${plan.choices.length ? `<h4 class="at-h">Choice notables</h4>
    <table class="at-choices"><tbody>${plan.choices.map((c) => `<tr><td>${esc(c.node)}</td><td><b>${esc(c.pick)}</b><div class="muted small">${esc(c.why)}</div></td></tr>`).join('')}</tbody></table>` : ''}
    <h4 class="at-h">How to run it</h4>
    <ol class="craft-steps">${plan.run.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
    <p class="muted small"><b>Threads:</b> ${esc(plan.threads)}</p>
    <p class="muted small"><b>Risk:</b> ${esc(plan.risk)}</p>`;
}

export async function render(el) {
  el.innerHTML = '<div class="loading">Loading the atlas tree…</div>';
  await load();
  const reads = plans.reads || [];
  el.innerHTML = `
    <section class="craft-hero">
      <div>
        <h2>3.30 Atlas trees</h2>
        <p class="muted">Three drafted 150-point trees for Covens of Umbra, picked from the 3.30 atlas tree data. Drafts until the league is live, so tweak them once you see what drops.</p>
      </div>
    </section>
    ${reads.length ? `<div class="brief-grid at-reads">${reads.map((r) => `<article class="brief-card tone-${r.tone}"><h4>${esc(r.title)}</h4><p>${esc(r.body)}</p></article>`).join('')}</div>` : ''}
    <div class="at-pick" role="tablist">${plans.trees.map((p, i) => `
      <button class="at-card ${i === current ? 'active' : ''}" data-i="${i}" style="--c:${p.color}" role="tab">
        <span class="at-stage">${esc(p.stage)}</span>
        <b>${esc(p.name)}</b>
        <small>${esc(p.tagline)}</small>
      </button>`).join('')}</div>
    <div class="at-layout">
      <div class="at-viewer panel">
        <svg id="atSvg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${svgMarkup(treeData)}</svg>
        <div class="at-ctrl">
          <button class="ghost small" data-z="0.7" title="Zoom in">+</button>
          <button class="ghost small" data-z="1.4" title="Zoom out">−</button>
          <button class="ghost small" id="atFit">Fit tree</button>
          <button class="ghost small" id="atAll">Whole atlas</button>
        </div>
        <div class="at-tip" id="atTip" hidden></div>
        <div class="at-hint muted small">Scroll to zoom, drag to move, hover a node for details.</div>
      </div>
      <aside class="at-side panel" id="atSide"></aside>
    </div>
    <p class="muted small" style="margin-top:12px">Tree data: <a href="${esc(treeData.source)}" target="_blank" rel="noopener">poedb 3.30 atlas tree</a>. Point counts are checked against poedb's planner.</p>`;

  const svg = $('#atSvg', el); const tip = $('#atTip', el); const side = $('#atSide', el);
  const pick = (i, refit = true) => {
    current = i;
    const plan = plans.trees[i];
    $$('.at-card', el).forEach((b) => b.classList.toggle('active', +b.dataset.i === i));
    paint(svg, plan);
    side.innerHTML = `<h3 style="color:${plan.color}">${esc(plan.name)}</h3><p class="muted small" style="margin:4px 0 10px">${esc(plan.stage)} · ${esc(plan.tagline)}</p>` + sidePanel(plan);
    if (refit) fit(svg, plan.hashes.map(String).concat(String(treeData.start)));
  };
  requestAnimationFrame(() => pick(current));

  $('.at-pick', el).onclick = (e) => { const b = e.target.closest('.at-card'); if (b) pick(+b.dataset.i); };
  side.addEventListener('click', async (e) => {
    if (e.target.id === 'atCopy') {
      try { await navigator.clipboard.writeText(plans.trees[current].poedb); toast('poedb link copied'); } catch { toast('Copy failed, use Open in poedb'); }
    }
    const f = e.target.closest('[data-focus]');
    if (f) {
      const n = treeData.nodes[f.dataset.focus];
      setView(svg, [n[0] - 1500, n[1] - 1000, 3000, 2000]);
      const c = $(`circle[data-id="${f.dataset.focus}"]`, svg);
      c?.classList.add('ping'); setTimeout(() => c?.classList.remove('ping'), 1600);
    }
  });

  // zoom and pan
  const zoomAt = (k, cx, cy) => {
    const [x, y, w, h] = view; const nw = Math.min(Math.max(w * k, 1200), 30000); const s = nw / w;
    setView(svg, [cx - (cx - x) * s, cy - (cy - y) * s, nw, h * s]);
  };
  const toSvg = (ev) => { const r = svg.getBoundingClientRect(); const s = Math.max(view[2] / r.width, view[3] / r.height);
    const ox = (r.width * s - view[2]) / 2; const oy = (r.height * s - view[3]) / 2;
    return [view[0] - ox + (ev.clientX - r.left) * s, view[1] - oy + (ev.clientY - r.top) * s, s]; };
  svg.addEventListener('wheel', (ev) => { ev.preventDefault(); const [x, y] = toSvg(ev); zoomAt(ev.deltaY > 0 ? 1.15 : 0.87, x, y); }, { passive: false });
  $$('[data-z]', el).forEach((b) => (b.onclick = () => zoomAt(+b.dataset.z, view[0] + view[2] / 2, view[1] + view[3] / 2)));
  $('#atFit', el).onclick = () => fit(svg, plans.trees[current].hashes.map(String));
  $('#atAll', el).onclick = () => fit(svg);
  let drag = null;
  svg.addEventListener('pointerdown', (ev) => { drag = { x: ev.clientX, y: ev.clientY, v: [...view], s: toSvg(ev)[2] }; svg.setPointerCapture(ev.pointerId); svg.classList.add('dragging'); });
  svg.addEventListener('pointermove', (ev) => {
    if (drag) { setView(svg, [drag.v[0] - (ev.clientX - drag.x) * drag.s, drag.v[1] - (ev.clientY - drag.y) * drag.s, drag.v[2], drag.v[3]]); tip.hidden = true; return; }
    const c = ev.target.closest('circle'); if (!c) { tip.hidden = true; return; }
    const n = treeData.nodes[c.dataset.id]; if (!n || (!n[3] && !n[4].length)) { tip.hidden = true; return; }
    const plan = plans.trees[current]; const choice = plan.choices.find((x) => x.node === n[3]);
    tip.innerHTML = `<b>${esc(n[3] || 'Passive')}</b>${n[5] ? `<span class="muted small"> · ${esc(n[5])}</span>` : ''}
      ${n[4].map((s) => `<div>${esc(s)}</div>`).join('')}
      ${n[6] ? `<div class="muted small" style="margin-top:4px">Choose one:</div><ul>${n[6].map((o) => `<li class="${choice && o.toLowerCase().includes(choice.pick.toLowerCase().split(' ')[0]) ? 'pick' : ''}">${esc(o)}</li>`).join('')}</ul>` : ''}
      ${c.classList.contains('on') ? '<div class="at-tip-on">In this tree</div>' : ''}`;
    const r = svg.parentElement.getBoundingClientRect();
    tip.style.left = `${Math.min(ev.clientX - r.left + 14, r.width - 300)}px`; tip.style.top = `${ev.clientY - r.top + 14}px`; tip.hidden = false;
  });
  const end = () => { drag = null; svg.classList.remove('dragging'); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}
