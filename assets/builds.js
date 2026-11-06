import { $, $$, esc, fmt, uid, state, ninja, loadData, saveData, toast } from './app.js';
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
  const metaLeagues = (idx.leagueBuilds || []).filter((l) => l.statistics?.length);
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
  const eg = $('#editGoal', view);
  if (eg) eg.onclick = () => formModal('Your goal', [{ k: 'goal', label: 'Goal', type: 'textarea' }], file, async (v) => {
    await save({ ...file, weights, goal: v.goal }, 'Update build goal');
    render(view, { token });
  });
  if (!state.admin && !builds.length) toast('Log in as admin to add builds');
}
