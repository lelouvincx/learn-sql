import { initDb, runQuery, parseQuery, resultOf, sameRows } from './db.js';
import { createScene } from './scene.js';
import { mountErd } from './erd.js';
import { LESSONS, NEXT_TRACK } from './lessons/index.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sqlEl = $('#sql');
const hlEl = $('#hl');
const gutterEl = $('#gutter');
const consoleEl = $('#console');

// ?lesson=N opens lesson N; solved challenges are kept per lesson in localStorage.
const lessonParam = Number(new URLSearchParams(location.search).get('lesson'));
const SOLVED_KEY = 'learn-sql:solved';
const loadSolved = () => {
  try {
    return JSON.parse(localStorage.getItem(SOLVED_KEY)) ?? {};
  } catch {
    return {};
  }
};
const saved = loadSolved();
const state = {
  lesson: LESSONS.find((l) => l.n === lessonParam) ?? LESSONS[0],
  tab: 'overview',
  mode: 'explore',
  step: 0,
  solved: saved,
  verdict: null,
};
const solvedHere = () => new Set(state.solved[state.lesson.n] ?? []);
const isDone = (l) => l.challenges.length > 0 && (state.solved[l.n] ?? []).length >= l.challenges.length;
function markSolved(step) {
  const set = solvedHere().add(step);
  state.solved[state.lesson.n] = [...set].sort();
  localStorage.setItem(SOLVED_KEY, JSON.stringify(state.solved));
}

// ---------- editor ----------
const KEYWORDS = new Set(['select', 'from', 'where', 'and', 'or', 'not', 'order', 'by', 'limit', 'asc', 'desc', 'like', 'in', 'is', 'null', 'between', 'as', 'distinct', 'count', 'join', 'left', 'inner', 'outer', 'cross', 'on', 'group', 'having', 'union', 'all', 'intersect', 'except', 'offset', 'with', 'sum', 'avg', 'min', 'max', 'coalesce', 'case', 'when', 'then', 'else', 'end']);

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

// The query written as a set, in the lesson's own notation.
function renderFormula(code) {
  $('#formula').innerHTML = state.lesson.formula(code, parseQuery(code));
}

let scene;
function syncEditor() {
  const code = sqlEl.value;
  hlEl.innerHTML = highlight(code);
  const lines = code.split('\n').length;
  gutterEl.innerHTML = Array.from({ length: Math.max(lines, 3) }, (_, i) => i + 1).join('<br>');
  renderFormula(code);
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

let runToken = 0;
async function run() {
  const result = runQuery(sqlEl.value, state.lesson.analyze);
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
    const c = state.lesson.challenges[state.step];
    const ok = !result.error && sameRows(result, resultOf(c.answer), !!c.ordered);
    state.verdict = ok ? 'ok' : 'no';
    if (ok) markSolved(state.step);
    renderProgress();
    renderTab();
  }
}

function resetRun() {
  setCode(state.mode === 'challenge' ? state.lesson.challengeStarter : state.lesson.starter);
  runToken++;
  scene?.reset();
  consoleEl.dataset.state = 'idle';
  $('#console-status').textContent = 'Not run yet';
  $('#console-body').innerHTML = '<p class="console-empty">Press ▶ to light up the grid.</p>';
}

$('#btn-run').addEventListener('click', run);

// The query card minimizes to its title row; the choice is kept.
const setCard = $('.set-card');
const setMinBtn = $('#set-min');
const MIN_ICON = '<svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>';
const RESTORE_CARD_ICON = '<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg>';
function setCardMin(min) {
  setCard.classList.toggle('is-min', min);
  setMinBtn.setAttribute('aria-expanded', String(!min));
  setMinBtn.title = min ? 'Show the query card' : 'Minimize';
  setMinBtn.setAttribute('aria-label', min ? 'Show the query card' : 'Minimize the query card');
  setMinBtn.innerHTML = min ? RESTORE_CARD_ICON : MIN_ICON;
  localStorage.setItem('learn-sql:set-card-min', min ? '1' : '');
}
setCardMin(localStorage.getItem('learn-sql:set-card-min') === '1');
setMinBtn.addEventListener('click', () => setCardMin(!setCard.classList.contains('is-min')));
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

// 3D or 2D: the same grid, seen from the corner or straight down. ?view=2d opens flat.
const viewBtns = [...document.querySelectorAll('[data-view]')];
function setView(next) {
  viewBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === next)));
  scene?.setView(next);
  const url = new URL(location.href);
  url.searchParams.set('view', next);
  history.replaceState(null, '', url);
}
viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
const startView = new URLSearchParams(location.search).get('view') === '2d' ? '2d' : '3d';
viewBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === startView)));

// ---------- info tabs ----------
const TABS = {
  overview: () => state.lesson.overview(),
  sets: () => state.lesson.notation(),
  challenge: () => {
    const list = state.lesson.challenges;
    const c = list[state.step];
    const solved = solvedHere();
    const steps = list
      .map(
        (ch, i) =>
          `<li class="${i === state.step && state.mode === 'challenge' ? 'is-current' : ''} ${solved.has(i) ? 'is-done' : ''}"><button data-step="${i}">${i + 1}. ${ch.title}</button></li>`,
      )
      .join('');
    if (state.mode !== 'challenge') {
      return `<h3>Challenges</h3><ol class="steps">${steps}</ol>
        <p>${list.length} questions on this lesson. Your query passes when it returns exactly the right rows${list.some((ch) => ch.ordered) ? ' (in order, where the question asks for one)' : ', in any order'}.</p>
        <button class="btn" id="start-challenge">Start challenges</button>`;
    }
    const next = state.step < list.length - 1;
    const nextLesson = LESSONS[LESSONS.indexOf(state.lesson) + 1];
    return `<h3>${c.title}</h3><ol class="steps">${steps}</ol>
      <p>${c.prompt}</p>
      ${state.verdict === 'no' ? `<p><small>Hint: ${c.hint}</small></p>` : ''}
      ${
        state.verdict === 'ok'
          ? `<div class="verdict ok">Correct: that’s exactly the right ${c.ordered ? 'sequence' : 'set'}.${
              next ? ' <button class="btn" id="next-step">Next</button>' : nextLesson ? ` Lesson complete. <button class="btn" id="next-lesson">Lesson ${nextLesson.n}</button>` : ' Course complete.'
            }</div>`
          : ''
      }
      ${state.verdict === 'no' ? `<div class="verdict no">${c.wrong ?? 'Not the same set. Compare your result with the rows the question asks for.'}</div>` : ''}
      <p class="actions"><button class="btn ghost" id="back-explore">Back to the example</button></p>`;
  },
};

function renderTab() {
  const allDone = isDone(state.lesson);
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.tab === state.tab);
    if (b.dataset.tab === 'challenge') b.innerHTML = `Challenges${allDone ? ' ✓' : '<span class="dot"></span>'}`;
  });
  // the schema canvas keeps its state between visits, so it is shown and hidden, never re-rendered
  const schema = state.tab === 'schema';
  $('#info-body').hidden = schema;
  $('#schema-panel').hidden = !schema;
  if (schema && !erd) {
    erd = mountErd($('#erd'), $('#erd-tip'));
    $('#erd-fit').addEventListener('click', erd.fit);
    $('#erd-fit').addEventListener('dblclick', erd.relayout);
  }
  if (schema) return;
  $('#info-body').innerHTML = TABS[state.tab]();
  $('#start-challenge')?.addEventListener('click', () => setMode('challenge', 0));
  $('#back-explore')?.addEventListener('click', () => setMode('explore'));
  $('#next-step')?.addEventListener('click', () => setMode('challenge', state.step + 1));
  $('#next-lesson')?.addEventListener('click', () => setLesson(LESSONS[LESSONS.indexOf(state.lesson) + 1].n));
  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => setMode('challenge', Number(b.dataset.step))));
}

function setMode(mode, step = state.step) {
  state.mode = mode;
  state.step = step;
  state.verdict = null;
  $('#code-title').textContent = mode === 'challenge' ? `Challenge ${step + 1} of ${state.lesson.challenges.length}` : 'Try it yourself';
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
  const done = LESSONS.filter(isDone).length;
  $('#progress-count').textContent = `${done}/${LESSONS.length}`;
  $('#progress-fill').style.width = `${(done / LESSONS.length) * 100}%`;
  const progress = $('#progress');
  progress.title = `Basics: ${done} of ${LESSONS.length} lessons done`;
  progress.setAttribute('aria-valuenow', String(done));
  progress.setAttribute('aria-valuemax', String(LESSONS.length));
  $('#lesson-list').innerHTML = LESSONS.map(
    (l) => `<li class="${l === state.lesson ? 'is-active' : ''}${isDone(l) ? ' is-done' : ''}">
      <button data-lesson="${l.n}" ${l === state.lesson ? 'aria-current="true"' : ''}><b>${l.n}. ${l.title}</b><small>${l.topic}</small></button></li>`,
  ).join('') + `<li class="is-soon is-next"><button disabled title="Next track: coming soon"><b>${NEXT_TRACK.title}</b><small>Coming soon</small></button></li>`;
  document.querySelectorAll('[data-lesson]').forEach((b) => b.addEventListener('click', () => setLesson(Number(b.dataset.lesson))));
  $('#lessons-now').textContent = `${state.lesson.n} of ${LESSONS.length} · ${state.lesson.title}`;
}

// Open lesson n in place: its grid, its example query and its challenges.
function setLesson(n) {
  const next = LESSONS.find((l) => l.n === n);
  if (!next || next === state.lesson) return openLessons(false);
  state.lesson = next;
  state.tab = 'overview';
  const url = new URL(location.href);
  url.searchParams.set('lesson', String(n));
  history.replaceState(null, '', url);
  document.title = `${next.title} · Learn SQL`;
  scene?.load(next);
  setMode('explore', 0);
  renderProgress();
  openLessons(false);
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

// ---------- drag handles between stacked boxes: lesson panel | editor, and editor | result set ----------
// Dragging sets the first box's height as --split-h on `host` (with .has-split); arrows step 24px,
// a double-click goes back to the default sizing. The height is saved under `key`.
function splitter({ handle, host, first, key, clamp }) {
  function set(h, save = true) {
    if (h == null) {
      host.classList.remove('has-split');
      host.style.removeProperty('--split-h');
      localStorage.removeItem(key);
      return;
    }
    const v = Math.round(clamp(h));
    host.style.setProperty('--split-h', `${v}px`);
    host.classList.add('has-split');
    handle.setAttribute('aria-valuenow', String(v));
    if (save) localStorage.setItem(key, String(v));
  }
  if (Number(localStorage.getItem(key))) set(Number(localStorage.getItem(key)), false);
  let from = 0;
  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture(e.pointerId);
    from = first.offsetHeight - e.clientY;
    artboard.classList.add('is-splitting');
  });
  handle.addEventListener('pointermove', (e) => handle.hasPointerCapture(e.pointerId) && set(from + e.clientY));
  const end = () => artboard.classList.remove('is-splitting');
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', () => set(null));
  handle.addEventListener('keydown', (e) => {
    const d = { ArrowUp: -24, ArrowDown: 24 }[e.key];
    if (!d) return;
    e.preventDefault();
    set(first.offsetHeight + d);
  });
  addEventListener('resize', () => host.classList.contains('has-split') && set(first.offsetHeight, false));
}
const minH = (el) => parseInt(getComputedStyle(el).minHeight, 10) || 0;
// the lesson panel: at least 150px; the editor card keeps its own min-height plus the gap
const rightEl = $('.right');
const infoEl = $('.info-card');
splitter({
  handle: $('#split-resize'),
  host: rightEl,
  first: infoEl,
  key: 'learn-sql:info-h',
  clamp: (h) => Math.min(Math.max(h, 150), Math.max(150, rightEl.clientHeight - minH($('.code-card')) - 12)),
});
// the editor: at least its min-height; the result set keeps its min-height, so the two share the rest
const editorEl = $('.editor');
splitter({
  handle: $('#console-resize'),
  host: $('.code-card'),
  first: editorEl,
  key: 'learn-sql:editor-h',
  clamp: (h) => {
    const lo = minH(editorEl);
    return Math.min(Math.max(h, lo), Math.max(lo, editorEl.offsetHeight + consoleEl.offsetHeight - minH(consoleEl)));
  },
});

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

// ---------- schema: a node canvas of every table, its keys and the edges between them ----------
// mounted the first time the Schema tab opens, when its tables have a size to lay out
let erd = null;

// ---------- boot ----------
await initDb();
try {
  scene = createScene({ svg: $('#fig'), tipEl: $('#tip'), legendEl: $('#legend'), shape: startShape, view: startView });
  scene.load(state.lesson);
} catch {
  const note = $('#stage-note');
  note.hidden = false;
  note.innerHTML = '<b>Figure unavailable</b>The drawing engine failed to load. The query editor and result set still work.';
}
document.title = `${state.lesson.title} · Learn SQL`;
setCode(state.lesson.starter);
renderTab();
renderProgress();
