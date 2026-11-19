import { initDb, runQuery, parseQuery, splitCondition, idsFor } from './db.js';
import { createScene } from './scene.js';
import { STARTER, CHALLENGE_STARTER, CHALLENGES, LESSONS, NEXT_TRACK, FIELDS, PETS, SET_PALS, SCHEMA } from './data.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sqlEl = $('#sql');
const hlEl = $('#hl');
const gutterEl = $('#gutter');
const consoleEl = $('#console');

const state = { tab: 'overview', mode: 'explore', step: 0, solved: new Set(), verdict: null };

// ---------- editor ----------
const KEYWORDS = new Set(['select', 'from', 'where', 'and', 'or', 'not', 'order', 'by', 'limit', 'asc', 'desc', 'like', 'in', 'is', 'null', 'between', 'as', 'distinct', 'count']);

function highlight(code) {
  const re = /(--.*$)|('(?:[^']|'')*'?)|(\b\d+(?:\.\d+)?\b)|(\b[a-z_]+\b)|(<=|>=|<>|!=|[=<>*])/gim;
  let out = '';
  let last = 0;
  for (const m of code.matchAll(re)) {
    out += esc(code.slice(last, m.index));
    const [tok, com, str, num, word, op] = m;
    if (com) out += `<span class="tok-com">${esc(tok)}</span>`;
    else if (str) out += `<span class="tok-str">${esc(tok)}</span>`;
    else if (num) out += `<span class="tok-num">${tok}</span>`;
    else if (word && KEYWORDS.has(word.toLowerCase())) out += `<b class="tok-kw">${esc(tok)}</b>`;
    else if (op) out += `<span class="tok-op">${esc(tok)}</span>`;
    else out += esc(tok);
    last = m.index + tok.length;
  }
  return out + esc(code.slice(last)) + '\n';
}

// The query written as a set: { p ∈ pets | A ∧ B }, plus the same thing in
// terms of the coloured sets A, B, C… lit on the table.
function renderFormula(parsed) {
  const el = $('#formula');
  if (!parsed) {
    el.innerHTML = '<span class="card">Write a <code>SELECT … FROM … WHERE …</code> query to see it as a set.</span>';
    return;
  }
  const table = esc(parsed.table);
  if (!parsed.where) {
    el.innerHTML = `{ p ∈ <b>${table}</b> }<span class="card">no condition: the result is the whole set</span>`;
    return;
  }
  const { parts, ops } = splitCondition(parsed.where);
  const sym = { AND: ' ∧ ', OR: ' ∨ ' };
  const setSym = { AND: ' ∩ ', OR: ' ∪ ' };
  const name = (i) => String.fromCharCode(65 + i);
  const cond = parts
    .map((p, i) => {
      const not = p.match(/^not\s+([\s\S]+)$/i);
      const text = not ? `¬(${esc(not[1])})` : esc(p);
      return `${i ? sym[ops[i - 1]] : ''}<span class="set-chip set-${(i % SET_PALS.length) + 1}">${text}</span>`;
    })
    .join('');
  // AND binds tighter than OR, so when both appear, bracket each run of ∩.
  const mixed = ops.includes('AND') && ops.includes('OR');
  const sets = parts
    .map((p, i) => {
      const not = /^not\s/i.test(p);
      const n = `<b class="set-chip set-${(i % SET_PALS.length) + 1}">${name(i)}${not ? '′' : ''}</b>`;
      const open = mixed && ops[i] === 'AND' && ops[i - 1] !== 'AND' ? '(' : '';
      const close = mixed && ops[i - 1] === 'AND' && ops[i] !== 'AND' ? ')' : '';
      return `${i ? setSym[ops[i - 1]] : ''}${open}${n}${close}`;
    })
    .join('');
  el.innerHTML = `{ p ∈ <b>${table}</b> | ${cond} }<span class="card">= ${sets}${
    parts.length > 1 ? '' : ' (one subset of pets)'
  }</span>`;
}

let scene;
function syncEditor() {
  const code = sqlEl.value;
  hlEl.innerHTML = highlight(code);
  const lines = code.split('\n').length;
  gutterEl.innerHTML = Array.from({ length: Math.max(lines, 3) }, (_, i) => i + 1).join('<br>');
  renderFormula(parseQuery(code));
}

function setCode(code) {
  sqlEl.value = code;
  syncEditor();
}

sqlEl.addEventListener('input', syncEditor);
sqlEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  }
});

// ---------- run ----------
function renderResult(result) {
  const body = $('#console-body');
  if (result.error) {
    consoleEl.dataset.state = 'error';
    $('#console-status').textContent = 'Error';
    body.innerHTML = `<p class="console-error">${esc(result.error)}</p>`;
    return;
  }
  consoleEl.dataset.state = 'done';
  $('#console-status').textContent = `${result.rows.length} row${result.rows.length === 1 ? '' : 's'}`;
  if (!result.rows.length) {
    body.innerHTML = '<p class="console-empty">The empty set ∅: no row lies on every plate.</p>';
    return;
  }
  body.innerHTML = `<table class="result"><thead><tr>${result.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${result.rows
    .map((r, i) => `<tr style="animation-delay:${i * 30}ms">${r.map((v) => `<td>${esc(v ?? 'NULL')}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

let runToken = 0;
async function run() {
  const result = runQuery(sqlEl.value);
  // A new run cancels the previous animation; only the latest run reports.
  const token = ++runToken;
  consoleEl.dataset.state = 'running';
  $('#console-status').textContent = 'Lighting the grid…';
  $('#console-body').innerHTML = '<p class="console-empty">Every row is checked at the same moment…</p>';
  if (!result.error && scene) {
    await scene.play(result);
    if (token !== runToken) return;
  }
  renderResult(result);
  if (state.mode === 'challenge') {
    const ok = !!result.passIds && sameSet(result.passIds, idsFor(CHALLENGES[state.step].expected));
    state.verdict = ok ? 'ok' : 'no';
    if (ok) state.solved.add(state.step);
    renderProgress();
    renderTab();
  }
}

function resetRun() {
  setCode(state.mode === 'challenge' ? CHALLENGE_STARTER : STARTER);
  runToken++;
  scene?.reset();
  consoleEl.dataset.state = 'idle';
  $('#console-status').textContent = 'Not run yet';
  $('#console-body').innerHTML = '<p class="console-empty">Press ▶ to light up the grid.</p>';
}

$('#btn-run').addEventListener('click', run);
$('#btn-reset').addEventListener('click', resetRun);
$('#btn-shuffle').addEventListener('click', () => scene?.shuffle());
$('#btn-view').addEventListener('click', () => scene?.resetView());

// Row shape: a bar with one cell per field, or an index card. ?shape=card opens on cards.
const shapeBtns = [...document.querySelectorAll('[data-shape]')];
function setShape(next) {
  shapeBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.shape === next)));
  scene?.setShape(next);
  const url = new URL(location.href);
  url.searchParams.set('shape', next);
  history.replaceState(null, '', url);
}
shapeBtns.forEach((b) => b.addEventListener('click', () => setShape(b.dataset.shape)));
const startShape = new URLSearchParams(location.search).get('shape') === 'card' ? 'card' : 'bar';
shapeBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.shape === startShape)));

// ---------- info tabs ----------
const TABS = {
  overview: () => `
    <h3>Sets &amp; subsets</h3>
    <p>A table is a <b>set</b> of rows: 12 rows lying loosely in the <b>pets</b> region of the grid. Where a row lies means nothing: there is no first row and no last row. Press <b>Shuffle</b>: the rows move, but it’s the same table.</p>
    <p>A query doesn’t walk the rows one by one. Each condition in <code>WHERE</code> lights the field it reads on <b>every</b> row at once, and every matching row gets a coloured plate under it. The result is a new set, the <b>subset</b> that passes.</p>
    <ul class="facts">
      <li><span class="ic">AND</span><span>Keep rows lying on <b>both</b> plates: the intersection ∩</span></li>
      <li><span class="ic">OR</span><span>Keep rows lying on <b>either</b> plate: the union ∪</span></li>
      <li><span class="ic">NOT</span><span>Keep every row the condition <b>misses</b>: the complement</span></li>
    </ul>`,
  sets: () => `
    <h3>SQL as set notation</h3>
    <p>Every <code>WHERE</code> query is a set written in a different alphabet:</p>
    <table class="mapping"><thead><tr><th>SQL</th><th>Means</th><th>Set notation</th></tr></thead><tbody>
      <tr><td>FROM pets</td><td>Start from the whole set</td><td>pets</td></tr>
      <tr><td>WHERE a</td><td>The subset where a holds</td><td>{ p ∈ pets | a }</td></tr>
      <tr><td>a AND b</td><td>In both</td><td>A ∩ B</td></tr>
      <tr><td>a OR b</td><td>In at least one</td><td>A ∪ B</td></tr>
      <tr><td>NOT a</td><td>Everything else</td><td>A′ = pets − A</td></tr>
    </tbody></table>
    <p><code>AND</code> is applied before <code>OR</code>, just as × comes before +. Use parentheses when you mean otherwise.</p>`,
  fields: () => `
    <h3>The pets set</h3>
    <p>${PETS.length} rows. Every row has the same four fields, whether you draw it as a bar or a card.</p>
    <table class="schema"><thead><tr><th>Field</th><th>Type</th><th>Example</th></tr></thead><tbody>
    ${FIELDS.map((f, i) => `<tr><td>${f}</td><td>${typeof PETS[0][i] === 'number' ? 'number' : 'text'}</td><td>${esc(PETS[0][i])}</td></tr>`).join('')}
    </tbody></table>`,
  challenge: () => {
    const c = CHALLENGES[state.step];
    const steps = CHALLENGES.map(
      (ch, i) =>
        `<li class="${i === state.step && state.mode === 'challenge' ? 'is-current' : ''} ${state.solved.has(i) ? 'is-done' : ''}"><button data-step="${i}">${i + 1}. ${ch.title}</button></li>`,
    ).join('');
    if (state.mode !== 'challenge') {
      return `<h3>Challenges</h3><ol class="steps">${steps}</ol>
        <p>Three questions, one per set operation. Your query passes when it returns exactly the right set of pets, in any order.</p>
        <button class="btn" id="start-challenge">Start challenges</button>`;
    }
    return `<h3>${c.title}</h3><ol class="steps">${steps}</ol>
      <p>${c.prompt}</p>
      ${state.verdict === 'no' ? `<p><small>Hint: ${c.hint}</small></p>` : ''}
      ${state.verdict === 'ok' ? `<div class="verdict ok">Correct: that’s exactly the right set.${state.step < CHALLENGES.length - 1 ? ' <button class="btn" id="next-step">Next</button>' : ' Lesson complete.'}</div>` : ''}
      ${state.verdict === 'no' ? '<div class="verdict no">Not the same set. Compare which rows got the right plates with the ones the question asks for.</div>' : ''}
      <p class="actions"><button class="btn ghost" id="back-explore">Back to the example</button></p>`;
  },
};

function renderTab() {
  const allDone = state.solved.size === CHALLENGES.length;
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.tab === state.tab);
    if (b.dataset.tab === 'challenge') b.innerHTML = `Challenges${allDone ? ' ✓' : '<span class="dot"></span>'}`;
  });
  $('#info-body').innerHTML = TABS[state.tab]();
  $('#start-challenge')?.addEventListener('click', () => setMode('challenge', 0));
  $('#back-explore')?.addEventListener('click', () => setMode('explore'));
  $('#next-step')?.addEventListener('click', () => setMode('challenge', state.step + 1));
  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => setMode('challenge', Number(b.dataset.step))));
}

function setMode(mode, step = state.step) {
  state.mode = mode;
  state.step = step;
  state.verdict = null;
  $('#code-title').textContent = mode === 'challenge' ? `Challenge ${step + 1} of ${CHALLENGES.length}` : 'Try it yourself';
  resetRun();
  renderTab();
  if (mode === 'challenge') {
    sqlEl.focus();
    sqlEl.setSelectionRange(sqlEl.value.length, sqlEl.value.length);
  }
}

document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    renderTab();
  }),
);

// ---------- progress + lessons ----------
function renderProgress() {
  const done = state.solved.size === CHALLENGES.length ? 1 : 0;
  $('#progress-count').textContent = `${done}/${LESSONS.length}`;
  $('#progress-fill').style.width = `${(done / LESSONS.length) * 100}%`;
  $('#lesson-list').innerHTML = LESSONS.map(
    (l) => `<li class="${l.ready ? 'is-active' : 'is-soon'}${l.ready && done ? ' is-done' : ''}">
      <button ${l.ready ? '' : 'disabled'}><b>${l.n}. ${l.title}</b><small>${l.topic}</small></button></li>`,
  ).join('') + `<li class="is-soon is-next"><button disabled title="Next track: coming soon"><b>${NEXT_TRACK.title}</b><small>Coming soon</small></button></li>`;
  const now = LESSONS.find((l) => l.ready);
  $('#lessons-now').textContent = `${now.n} of ${LESSONS.length} · ${now.title}`;
}

// ---------- lessons drawer: tucked away while you learn; hover or click the tab to open ----------
const lessonsEl = $('#lessons');
const lessonsTab = $('#lessons-tab');
let lessonsTimer = 0;
function openLessons(open) {
  clearTimeout(lessonsTimer);
  lessonsEl.classList.toggle('is-open', open);
  lessonsTab.setAttribute('aria-expanded', String(open));
}
lessonsEl.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && openLessons(true));
lessonsEl.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !lessonsEl.contains(document.activeElement)) lessonsTimer = setTimeout(() => openLessons(false), 250);
});
lessonsTab.addEventListener('click', () => openLessons(!lessonsEl.classList.contains('is-open')));
lessonsEl.addEventListener('focusout', (e) => !lessonsEl.contains(e.relatedTarget) && openLessons(false));
addEventListener('keydown', (e) => e.key === 'Escape' && lessonsEl.classList.contains('is-open') && (openLessons(false), lessonsTab.focus()));

// ---------- side panel width: drag the gap between the grid and the panel ----------
const artboard = $('.artboard');
const handle = $('#right-resize');
// the default width is the panel token from DESIGN.md
const RIGHT_DEFAULT = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--spacing-panel'), 10);
const clampRight = (w) => Math.round(Math.min(Math.max(w, 400), Math.max(400, innerWidth - 560)));
function setRight(w, save = true) {
  const v = clampRight(w);
  artboard.style.setProperty('--right', `${v}px`);
  handle.setAttribute('aria-valuenow', String(v));
  if (save) localStorage.setItem('learn-sql:right', String(v));
}
setRight(Number(localStorage.getItem('learn-sql:right')) || RIGHT_DEFAULT, false);
handle.addEventListener('pointerdown', (e) => {
  handle.setPointerCapture(e.pointerId);
  artboard.classList.add('is-resizing');
});
handle.addEventListener('pointermove', (e) => {
  // the handle sits 12px left of the panel, which ends 24px from the right edge
  if (handle.hasPointerCapture(e.pointerId)) setRight(innerWidth - e.clientX + 12);
});
const endResize = () => artboard.classList.remove('is-resizing');
handle.addEventListener('pointerup', endResize);
handle.addEventListener('pointercancel', endResize);
handle.addEventListener('dblclick', () => setRight(RIGHT_DEFAULT));
handle.addEventListener('keydown', (e) => {
  const cur = parseInt(getComputedStyle(artboard).getPropertyValue('--right'), 10);
  if (e.key === 'ArrowLeft') setRight(cur + 24);
  else if (e.key === 'ArrowRight') setRight(cur - 24);
  else return;
  e.preventDefault();
});
addEventListener('resize', () => setRight(parseInt(getComputedStyle(artboard).getPropertyValue('--right'), 10), false));

// ---------- maximize the lesson panel or the editor ----------
const EXPAND_ICON = '<svg viewBox="0 0 24 24"><path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" /></svg>';
const RESTORE_ICON = '<svg viewBox="0 0 24 24"><path d="M8 3v5H3M21 8h-5V3M16 21v-5h5M3 16h5v5" /></svg>';
function setMax(id) {
  document.querySelectorAll('[data-max-id]').forEach((card) => card.classList.toggle('is-max', card.dataset.maxId === id));
  document.querySelector('.artboard').classList.toggle('has-max', !!id);
  document.querySelectorAll('[data-max]').forEach((b) => {
    const on = b.dataset.max === id;
    const what = b.dataset.max === 'code' ? 'editor' : 'lesson panel';
    b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', `${on ? 'Restore' : 'Maximize'} ${what}`);
    b.title = on ? `Restore ${what} (Esc)` : `Maximize ${what}`;
    b.innerHTML = on ? RESTORE_ICON : EXPAND_ICON;
  });
}
document.querySelectorAll('[data-max]').forEach((b) =>
  b.addEventListener('click', () => setMax(b.getAttribute('aria-pressed') === 'true' ? null : b.dataset.max)),
);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.querySelector('.is-max')) setMax(null);
});

// ---------- schema: one ERD box per table, always in view above the editor ----------
const KEY_ICON = '<svg viewBox="0 0 16 16" aria-label="primary key"><circle cx="5" cy="8" r="3.2" /><path d="M8.2 8H15M12.5 8v2.6M14.6 8v2" /></svg>';
$('#erd').innerHTML = SCHEMA.map(
  (t) => `<div class="erd-table">
    <div class="erd-head"><b>${t.name}</b><span>${t.rows} rows</span></div>
    <ul>${t.cols.map((c) => `<li class="${c.pk ? 'is-pk' : ''}"><i>${c.pk ? KEY_ICON : ''}</i><b>${c.name}</b><span>${c.type.toLowerCase()}</span></li>`).join('')}</ul>
  </div>`,
).join('') + '<p class="erd-note">Each row on the grid is one row of <b>pets</b>, with these four fields. Write your <code>WHERE</code> against these names.</p>';

// ---------- boot ----------
await initDb();
try {
  scene = createScene({ svg: $('#fig'), tipEl: $('#tip'), legendEl: $('#legend'), shape: startShape });
} catch {
  const note = $('#stage-note');
  note.hidden = false;
  note.innerHTML = '<b>Figure unavailable</b>The drawing engine failed to load. The query editor and result set still work.';
}
setCode(STARTER);
renderTab();
renderProgress();
