import { $, $$, esc, fmt, uid, state, ninja, loadData, saveData, toast, loadCategory } from './app.js';
import { formModal } from './portfolio.js';

const CRITERIA = [
  ['start', 'League start (cheap, smooth campaign)'],
  ['mapping', 'Mapping speed (farm the mechanic)'],
  ['bossing', 'Bossing (pinnacles, ubers)'],
  ['farmFit', 'Fits your farming strategies'],
  ['scaling', 'Scales with investment (mirror-tier)'],
];
const DEFAULT_WEIGHTS = { start: 30, mapping: 25, bossing: 15, farmFit: 15, scaling: 15 };

const fitScore = (b, w) => {
  const tot = CRITERIA.reduce((a, [k]) => a + (w[k] || 0), 0) || 1;
  return CRITERIA.reduce((a, [k]) => a + ((b[k] || 0) / 5) * (w[k] || 0), 0) / tot * 100;
};

export async function render(view, { token }) {
  const [file, idx] = await Promise.all([
    loadData('builds', { weights: DEFAULT_WEIGHTS, goal: '', builds: [] }),
    ninja(`${state.game}/api/data/build-index-state`, {}, { ttl: 30 * 60_000 }).catch(() => ({ leagueBuilds: [] })),
  ]);
  if (!token()) return;
  const weights = { ...DEFAULT_WEIGHTS, ...(file.weights || {}) };
  const builds = (file.builds || []).filter((b) => (b.game || 'poe1') === state.game);
  // Public leagues only (private leagues show up as "Name (PL12345)").
  const metaLeagues = (idx.leagueBuilds || []).filter((l) => l.statistics?.length && !/\(PL\d+\)/.test(l.leagueName));
  const metaSel = localStorage.getItem(`meta-${state.game}`);
  const metaLeague = metaLeagues.find((l) => l.leagueUrl === metaSel) || metaLeagues[0];
  const popularity = Object.fromEntries((metaLeague?.statistics || []).map((s) => [`${s.class}|${s.skill || ''}`.toLowerCase(), s.percentage]));

  view.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <div class="row spread"><h2>Your goal</h2><button class="admin-only small ghost" id="editGoal">Edit</button></div>
        <p style="white-space:pre-wrap;margin:8px 0 0">${esc(file.goal || 'Not set yet.')}</p>
        <h3 style="margin-top:14px">What matters (weights)</h3>
        <div id="weights" style="margin-top:8px">${CRITERIA.map(([k, l]) => `
          <div class="row" style="margin:4px 0"><span style="width:250px" class="small">${l}</span>
            <input type="range" min="0" max="50" value="${weights[k]}" data-w="${k}" ${state.admin ? '' : 'disabled'} style="flex:1"><b style="width:30px;text-align:right">${weights[k]}</b></div>`).join('')}
        </div>
        <div class="row admin-only" style="margin-top:6px"><button class="small" id="saveW">Save weights</button></div>
      </div>
      <div class="panel">
        <div class="row spread"><h2>Live build meta</h2>
          <select id="metaL">${metaLeagues.map((l) => `<option value="${l.leagueUrl}" ${l === metaLeague ? 'selected' : ''}>${esc(l.leagueName)} (${fmt(l.total, 0)} chars)</option>`).join('')}</select></div>
        <p class="muted small">Most played class and skill combos on poe.ninja. On launch day this shows what everyone is starting with, which also tells you which gems and gear will be in demand.</p>
        ${metaLeague ? `<table><tbody>${metaLeague.statistics.map((s) => `<tr>
            <td><a href="https://poe.ninja/${state.game}/builds/${metaLeague.leagueUrl}?class=${encodeURIComponent(s.class)}${s.skill ? `&skills=${encodeURIComponent(s.skill)}` : ''}" target="_blank" rel="noopener">${esc(s.skill || '')} ${esc(s.class)}</a></td>
            <td style="width:40%"><div class="bar"><div style="width:${Math.min(100, s.percentage * 8)}%"></div></div></td>
            <td class="num">${s.percentage.toFixed(1)}%</td>
            <td class="${s.trend > 0 ? 'pos' : s.trend < 0 ? 'neg' : 'muted'}">${s.trend > 0 ? '▲' : s.trend < 0 ? '▼' : '•'}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty-state">No build data yet.</div>'}
      </div>
    </div>

    <div class="panel">
      <div class="row spread"><div><h2>Goals</h2><div class="muted small">Big targets for the league. Tick steps off as you go; prices are live from poe.ninja.</div></div>
        <button class="admin-only" id="addG">+ Add goal</button></div>
      <div class="cards gl-cards" id="goals" style="margin-top:12px"></div>
    </div>

    <div class="panel">
      <div class="row spread"><div><h2>Build shortlist</h2><div class="muted small">Ranked by fit with your weights. Scores are 1 to 5; edit them as patch notes and launch-day results come in.</div></div>
        <div class="row"><select id="bStatus"><option value="">All</option><option>Chosen</option><option>Candidate</option><option>Dropped</option></select><button class="admin-only" id="addB">+ Add build</button></div></div>
      <div class="cards" id="cards" style="margin-top:12px"></div>
    </div>`;

  const drawCards = () => {
    const st = $('#bStatus', view).value;
    const list = builds.filter((b) => !st || b.status === st).map((b) => ({ b, fit: fitScore(b, weights) })).sort((x, y) => (y.b.status === 'Chosen') - (x.b.status === 'Chosen') || y.fit - x.fit);
    $('#cards', view).innerHTML = list.length
      ? list.map(({ b, fit }) => {
          const pop = popularity[`${b.class}|${b.skill}`.toLowerCase()];
          return `<div class="card ${b.status === 'Chosen' ? 'chosen' : b.status === 'Dropped' ? 'dropped' : ''}" data-uid="${b.uid}">
            <div class="row spread"><div><h3>${esc(b.name)}</h3><div class="muted small">${esc(b.skill)} · ${esc(b.class)}${b.source ? ` · ${esc(b.source)}` : ''}</div></div><div class="fit" title="Fit score">${fit.toFixed(0)}</div></div>
            <div class="row">${b.status ? `<span class="tag ${b.status === 'Chosen' ? 'gold' : ''}">${esc(b.status)}</span>` : ''}${pop ? `<span class="tag good">${pop.toFixed(1)}% of ${esc(metaLeague.leagueName)}</span>` : ''}${(b.tags || '').split(',').filter(Boolean).map((t) => `<span class="tag">${esc(t.trim())}</span>`).join('')}</div>
            <div class="scores">${CRITERIA.map(([k, l]) => `<span class="muted">${l.split(' (')[0]}</span><div class="bar"><div style="width:${((b[k] || 0) / 5) * 100}%"></div></div><b>${b[k] || 0}</b>`).join('')}</div>
            ${b.notes ? `<div class="small">${esc(b.notes)}</div>` : ''}
            ${b.patch ? `<div class="small"><span class="tag gold">3.30</span> ${esc(b.patch)}</div>` : ''}
            <div class="row">${b.guide ? `<a class="small" href="${esc(b.guide)}" target="_blank" rel="noopener">Guide ↗</a>` : ''}
              <a class="small" href="https://poe.ninja/${state.game}/builds/${metaLeague?.leagueUrl || ''}?class=${encodeURIComponent(b.class)}&skills=${encodeURIComponent(b.skill)}" target="_blank" rel="noopener">poe.ninja ↗</a>
              <span style="flex:1"></span><button class="admin-only small ghost" data-a="edit">Edit</button><button class="admin-only small danger" data-a="del">✕</button></div>
          </div>`;
        }).join('')
      : '<div class="empty-state">No builds yet.</div>';
  };
  drawCards();
  $('#bStatus', view).onchange = drawCards;
  $('#metaL', view).onchange = (e) => {
    localStorage.setItem(`meta-${state.game}`, e.target.value);
    render(view, { token });
  };

  $$('#weights input', view).forEach((inp) => (inp.oninput = () => {
    weights[inp.dataset.w] = +inp.value;
    inp.nextElementSibling.textContent = inp.value;
    drawCards();
  }));
  const save = (data, msg) => saveData('builds', data, msg);
  const saveW = $('#saveW', view);
  if (saveW) saveW.onclick = () => save({ ...file, weights }, 'Update build weights');

  const fields = [
    { k: 'name', label: 'Build name' }, { k: 'skill', label: 'Main skill' }, { k: 'class', label: 'Ascendancy' },
    { k: 'status', label: 'Status', type: 'select', options: ['Candidate', 'Chosen', 'Dropped'] },
    ...CRITERIA.map(([k, l]) => ({ k, label: l.split(' (')[0] + ' (1-5)', type: 'number' })),
    { k: 'source', label: 'Creator' }, { k: 'guide', label: 'Guide link' }, { k: 'tags', label: 'Tags (comma separated)' },
    { k: 'notes', label: 'Notes', type: 'textarea' }, { k: 'patch', label: '3.30 changes', type: 'textarea' },
  ];
  const all = file.builds || [];
  const addB = $('#addB', view);
  if (addB) addB.onclick = () => formModal('Add build', fields, { status: 'Candidate', start: 3, mapping: 3, bossing: 3, farmFit: 3, scaling: 3 }, async (v) => {
    await save({ ...file, weights, builds: [...all, { ...v, uid: uid(), game: state.game }] }, `Add build ${v.name}`);
    render(view, { token });
  });
  $('#cards', view).onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    const id = e.target.closest('[data-uid]')?.dataset.uid;
    if (!a || !id) return;
    const b = all.find((x) => x.uid === id);
    if (a === 'del') {
      if (!confirm(`Remove ${b.name}?`)) return;
      await save({ ...file, weights, builds: all.filter((x) => x.uid !== id) }, `Remove build ${b.name}`);
      render(view, { token });
    } else {
      formModal(`Edit: ${b.name}`, fields, b, async (v) => {
        await save({ ...file, weights, builds: all.map((x) => (x.uid === id ? v : x)) }, `Edit build ${b.name}`);
        render(view, { token });
      });
    }
  };
  // ---------- goals ----------
  const targets = file.targets || [];
  const saveTargets = (list, msg) => save({ ...file, weights, targets: list }, msg).then(() => (file.targets = list));
  const priceCache = {};
  const loadType = (type) => (priceCache[type] ??= loadCategory(state.game, state.league, type).then((r) => r.rows).catch(() => []));
  // cheapest normal copy: skips corrupted and 5/6-linked listings when a plain one exists
  const lookup = async (type, name) => {
    if (!state.league) return null;
    for (const t of [type, ...['UniqueAccessory', 'UniqueArmour', 'UniqueWeapon', 'UniqueFlask', 'UniqueJewel'].filter((x) => x !== type)]) {
      if (!t) continue;
      const rows = (await loadType(t)).filter((r) => r.name === name && r.div != null);
      if (!rows.length) continue;
      const plain = rows.filter((r) => !r.corrupted && !(r.links >= 5));
      return (plain.length ? plain : rows).sort((a, b) => a.div - b.div)[0];
    }
    return null;
  };
  const shortPrice = (r) => (!r ? '' : r.div >= 1 ? `${fmt(r.div)} div` : r.chaos != null ? `${fmt(r.chaos, 0)}c` : `${fmt(r.div, 2)} div`);
  const divTxt = (r) => (r?.div != null ? `${fmt(r.div)} div` : 'no price yet');
  const drawGoals = () => {
    $('#goals', view).innerHTML = targets.length
      ? targets.map((g) => {
          const steps = g.steps || [];
          const done = steps.filter((s) => s.done).length;
          const pctDone = steps.length ? (done / steps.length) * 100 : 0;
          return `<div class="card gl ${done && done === steps.length ? 'chosen' : ''}" data-gid="${g.uid}">
            <div class="row spread"><div><h3>${esc(g.title)}</h3>${g.item ? `<div class="muted small">${esc(g.item)}${g.budget ? ` · budget ${fmt(+g.budget)} div` : ''}</div>` : ''}</div>
              <div class="fit" title="Steps done">${done}/${steps.length}</div></div>
            <div class="bar"><div style="width:${pctDone}%"></div></div>
            ${g.item ? `<div class="gl-prices small" data-gp="${g.uid}"><span class="muted">Checking live prices...</span></div>` : ''}
            ${g.why ? `<div class="small">${esc(g.why)}</div>` : ''}
            <ul class="gl-steps">${steps.map((s, i) => `${s.phase ? `<li class="gl-phase">${esc(s.phase)}</li>` : ''}<li><label class="${s.done ? 'done' : ''}"><input type="checkbox" data-step="${i}" ${s.done ? 'checked' : ''} ${state.admin ? '' : 'disabled'}><span>${s.prio ? `<b class="gl-prio p${esc(s.prio)}">P${esc(s.prio)}</b> ` : ''}${esc(s.t)}</span>${s.item ? `<em class="gl-sp" data-sp="${g.uid}:${i}">...</em>` : ''}</label></li>`).join('')}</ul>
            <div class="row">${(g.links || []).map((l) => `<a class="small" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)} ↗</a>`).join('')}
              <span style="flex:1"></span><button class="admin-only small ghost" data-ga="edit">Edit</button><button class="admin-only small danger" data-ga="del">✕</button></div>
          </div>`;
        }).join('')
      : '<div class="empty-state">No goals yet.</div>';
    for (const g of targets) {
      (g.steps || []).forEach((st, i) => {
        if (!st.item) return;
        lookup(st.type, st.item).then((r) => {
          const el = $(`[data-sp="${g.uid}:${i}"]`, view);
          if (el) { el.textContent = r ? shortPrice(r) : 'no price'; el.title = r ? `${st.item}, cheapest normal listing on ${state.league}` : 'Not on poe.ninja yet'; }
        });
      });
    }
    for (const g of targets.filter((x) => x.item)) {
      Promise.all([lookup(g.type || 'UniqueJewel', g.item), ...(g.parts || []).map((n) => lookup(g.type || 'UniqueJewel', n))]).then(([main, ...parts]) => {
        const el = $(`[data-gp="${g.uid}"]`, view);
        if (!el) return;
        const partSum = parts.every((p) => p?.div != null) ? parts.reduce((a, p) => a + p.div, 0) : null;
        const left = main?.div != null && g.budget ? +g.budget - main.div : null;
        el.innerHTML = `<div class="row spread"><span>Buy: <b>${divTxt(main)}</b>${main?.volume ? ` <span class="muted">(${fmt(main.volume, 0)} listed)</span>` : ''}</span>
            ${left != null ? `<span class="tag ${left >= 0 ? 'good' : 'bad'}">${left >= 0 ? 'under budget' : `${fmt(-left)} div over budget`}</span>` : ''}</div>
          ${parts.length ? `<div class="row spread"><span>Craft parts: <b>${partSum != null ? `${fmt(partSum)} div` : 'not all priced yet'}</b></span>
            ${partSum != null && main?.div != null ? `<span class="tag ${partSum < main.div ? 'good' : ''}">${partSum < main.div ? 'crafting is cheaper' : 'buying is cheaper'}</span>` : ''}</div>
          <div class="muted">${(g.parts || []).map((n, i) => `${esc(n)} ${divTxt(parts[i])}`).join(' · ')}</div>` : ''}
          <div class="muted">Prices from ${esc(state.league || '')}. Any copy works for buying: a Divine Orb rerolls the seed, so check the result on your own character.</div>`;
      });
    }
  };
  drawGoals();
  const gFields = [
    { k: 'title', label: 'Goal' }, { k: 'item', label: 'Item to price (exact name, optional)' },
    { k: 'budget', label: 'Budget (div)', type: 'number' }, { k: 'why', label: 'Why', type: 'textarea' },
    { k: 'stepsText', label: 'Steps (one per line)', type: 'textarea' },
  ];
  const toGoal = (v, old = {}) => {
    const prev = Object.fromEntries((old.steps || []).map((s) => [s.t, s]));
    const { stepsText, ...rest } = v;
    return { ...old, ...rest, steps: (stepsText || '').split('\n').map((t) => t.trim()).filter(Boolean).map((t) => ({ ...(prev[t] || {}), t, done: !!prev[t]?.done })) };
  };
  const addG = $('#addG', view);
  if (addG) addG.onclick = () => formModal('Add goal', gFields, {}, async (v) => {
    await saveTargets([...targets, toGoal(v, { uid: uid() })], `Add goal ${v.title}`);
    render(view, { token });
  });
  $('#goals', view).onchange = async (e) => {
    const i = e.target.dataset.step;
    const id = e.target.closest('[data-gid]')?.dataset.gid;
    if (i == null || !id) return;
    const list = targets.map((g) => (g.uid === id ? { ...g, steps: g.steps.map((s, j) => (j === +i ? { ...s, done: e.target.checked } : s)) } : g));
    targets.splice(0, targets.length, ...list);
    drawGoals();
    await saveTargets(list, `Goal progress: ${list.find((g) => g.uid === id).title}`);
  };
  $('#goals', view).onclick = async (e) => {
    const a = e.target.closest('[data-ga]')?.dataset.ga;
    const id = e.target.closest('[data-gid]')?.dataset.gid;
    if (!a || !id) return;
    const g = targets.find((x) => x.uid === id);
    if (a === 'del') {
      if (!confirm(`Remove goal "${g.title}"?`)) return;
      await saveTargets(targets.filter((x) => x.uid !== id), `Remove goal ${g.title}`);
      render(view, { token });
    } else {
      formModal(`Edit: ${g.title}`, gFields, { ...g, stepsText: (g.steps || []).map((s) => s.t).join('\n') }, async (v) => {
        await saveTargets(targets.map((x) => (x.uid === id ? toGoal(v, g) : x)), `Edit goal ${g.title}`);
        render(view, { token });
      });
    }
  };

  const eg = $('#editGoal', view);
  if (eg) eg.onclick = () => formModal('Your goal', [{ k: 'goal', label: 'Goal', type: 'textarea' }], file, async (v) => {
    await save({ ...file, weights, goal: v.goal }, 'Update build goal');
    render(view, { token });
  });
  if (!state.admin && !builds.length) toast('Log in as admin to add builds');
}
