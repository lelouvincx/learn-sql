// The schema as a small node graph in the page's drawn style: one card per
// table, and an edge from each foreign key to the key it points at (a crow's
// foot on the "many" side, a tick on the "one" side). Drag a table to move it,
// drag the paper to pan, scroll to zoom, double-click the paper or press Fit
// to bring every table into view. Hover a column for its type, examples and
// NULLs. Moved tables are remembered in localStorage.
import { SCHEMA } from './data.js';

const KEY_ICON = '<svg viewBox="0 0 16 16" aria-label="primary key"><circle cx="5" cy="8" r="3.2" /><path d="M8.2 8H15M12.5 8v2.6M14.6 8v2" /></svg>';
const SAVE = 'learn-sql:erd';
const GAP = 56; // between tables in the starting layout
const PAD = 14; // around the tables when fitting
const DOT = 16; // spacing of the paper's dots at zoom 1
const ZOOM = [0.45, 1.8];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
const tableOf = (name) => SCHEMA.find((t) => t.name === name);
const pkOf = (t) => t.cols.find((c) => c.pk)?.name ?? t.cols[0].name;

const node = (t) => `<div class="erd-table" data-table="${t.name}" tabindex="0" role="group" aria-label="Table ${t.name}, ${t.data.length} rows. Arrow keys move it.">
  <div class="erd-head"><b>${t.name}</b><span>${t.data.length} rows</span></div>
  <ul>${t.cols
    .map((c) => `<li class="${c.pk ? 'is-pk' : ''}" data-col="${t.name}.${c.name}"><i>${c.pk ? KEY_ICON : ''}</i><b>${c.name}</b><span>${c.ref ? `→ ${c.ref}` : c.type.toLowerCase()}</span></li>`)
    .join('')}</ul>
</div>`;

// What the old Table tab said about a column, now on hover.
function columnTip(t, c) {
  const i = t.cols.indexOf(c);
  const values = t.data.map((r) => r[i]);
  const nulls = values.filter((v) => v == null).length;
  const examples = [...new Set(values.filter((v) => v != null))].slice(0, 3).map(esc).join(', ');
  const role = c.pk ? ' · primary key: one per row, never repeated' : c.ref ? ` · points at ${c.ref}.${pkOf(tableOf(c.ref))}` : '';
  return `<b>${t.name}.${c.name}</b>${c.type.toLowerCase()}${role}<br>e.g. ${examples}${nulls ? ` · NULL in ${nulls} row${nulls === 1 ? '' : 's'}` : ''}`;
}

export function mountErd(root, tipEl) {
  root.innerHTML = `<div class="erd-world"><svg class="erd-edges" aria-hidden="true"></svg>${SCHEMA.map(node).join('')}</div>`;
  const world = root.querySelector('.erd-world');
  const edgesEl = root.querySelector('.erd-edges');
  const nodes = new Map([...root.querySelectorAll('.erd-table')].map((el) => [el.dataset.table, el]));
  const card = tipEl.offsetParent ?? root.parentElement;

  // ---------- positions: the starting layout, then whatever the learner moved ----------
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SAVE)) ?? {};
  } catch {}
  const pos = new Map();
  let x0 = 0;
  for (const t of SCHEMA) {
    pos.set(t.name, Array.isArray(saved[t.name]) ? saved[t.name] : [x0, 0]);
    x0 += nodes.get(t.name).offsetWidth + GAP;
  }
  const save = () => localStorage.setItem(SAVE, JSON.stringify(Object.fromEntries(pos)));

  // ---------- view: pan and zoom of the whole world ----------
  const view = { x: 0, y: 0, k: 1 };
  let auto = true; // until the learner pans or zooms, a resize refits
  function apply() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    root.style.backgroundPosition = `${view.x}px ${view.y}px`;
    root.style.backgroundSize = `${DOT * view.k}px ${DOT * view.k}px`;
  }
  function place(name) {
    const [x, y] = pos.get(name);
    nodes.get(name).style.transform = `translate(${x}px, ${y}px)`;
  }

  // ---------- edges: foreign key → the key it points at ----------
  const edges = SCHEMA.flatMap((t) => t.cols.filter((c) => c.ref && tableOf(c.ref)).map((c) => ({ from: `${t.name}.${c.name}`, to: `${c.ref}.${pkOf(tableOf(c.ref))}` })));
  // the middle of a column's row, on its left (side -1) or right (side 1) edge, in world units
  function anchor(key, side) {
    const name = key.split('.')[0];
    const el = nodes.get(name);
    const li = el.querySelector(`[data-col="${key}"]`);
    const [x, y] = pos.get(name);
    return [x + (side > 0 ? el.offsetWidth : 0), y + li.offsetTop + li.offsetHeight / 2];
  }
  function drawEdges() {
    edgesEl.innerHTML = edges
      .map((e) => {
        const a = nodes.get(e.from.split('.')[0]);
        const b = nodes.get(e.to.split('.')[0]);
        const ax = pos.get(a.dataset.table)[0];
        const bx = pos.get(b.dataset.table)[0];
        // leave toward the other table; when they overlap in x, leave and arrive on the right
        const [sa, sb] = bx >= ax + a.offsetWidth + 28 ? [1, -1] : ax >= bx + b.offsetWidth + 28 ? [-1, 1] : [1, 1];
        const [x1, y1] = anchor(e.from, sa);
        const [x2, y2] = anchor(e.to, sb);
        const bend = Math.max(36, Math.abs(x2 - x1) / 2);
        const out = (sa > 0 ? Math.max(x1, x2) : Math.min(x1, x2)) + sa * 40; // a loop out past both tables
        const [c1, c2] = sa === sb ? [out, out] : [x1 + sa * bend, x2 + sb * bend];
        // crow's foot (many) at the foreign key, a tick (one) at the key it points at
        const fx = x1 + 11 * sa;
        const foot = `M${fx} ${y1}L${x1} ${y1 - 5}M${fx} ${y1}L${x1} ${y1}M${fx} ${y1}L${x1} ${y1 + 5}`;
        const tick = `M${x2 + 8 * sb} ${y2 - 5}V${y2 + 5}`;
        return `<g class="erd-edge" data-from="${e.from}" data-to="${e.to}"><path d="M${fx} ${y1}C${c1} ${y1} ${c2} ${y2} ${x2} ${y2}" /><path d="${foot}${tick}" /></g>`;
      })
      .join('');
  }

  function fit() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [name, el] of nodes) {
      const [x, y] = pos.get(name);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + el.offsetWidth);
      y1 = Math.max(y1, y + el.offsetHeight);
    }
    const k = clamp(Math.min(1.4, (W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0)), ZOOM);
    Object.assign(view, { k, x: (W - (x1 - x0) * k) / 2 - x0 * k, y: (H - (y1 - y0) * k) / 2 - y0 * k });
    auto = true;
    apply();
  }

  // ---------- highlight: a column, its edge and the column at the other end ----------
  function highlight(key) {
    const on = new Set(key ? [key] : []);
    edgesEl.querySelectorAll('.erd-edge').forEach((g) => {
      const hit = !!key && (g.dataset.from === key || g.dataset.to === key);
      g.classList.toggle('is-on', hit);
      if (hit) on.add(g.dataset.from).add(g.dataset.to);
    });
    root.querySelectorAll('[data-col]').forEach((li) => li.classList.toggle('is-linked', on.size > 1 && on.has(li.dataset.col)));
  }

  // ---------- pointer: drag a table, drag the paper, scroll to zoom ----------
  let drag = null;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('.erd-table');
    drag = { x: e.clientX, y: e.clientY, el, from: el ? [...pos.get(el.dataset.table)] : [view.x, view.y] };
    root.setPointerCapture(e.pointerId);
    root.classList.toggle('is-panning', !el);
    el?.classList.add('is-dragging');
    tipEl.classList.remove('is-on');
  });
  root.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.el) {
        pos.set(drag.el.dataset.table, [drag.from[0] + dx / view.k, drag.from[1] + dy / view.k]);
        place(drag.el.dataset.table);
        drawEdges();
        highlight(null);
      } else {
        Object.assign(view, { x: drag.from[0] + dx, y: drag.from[1] + dy });
        auto = false;
        apply();
      }
      return;
    }
    const li = e.target.closest('[data-col]');
    const el = e.target.closest('.erd-table');
    const edge = e.target.closest('.erd-edge');
    highlight(li?.dataset.col ?? edge?.dataset.from ?? null);
    const t = el && tableOf(el.dataset.table);
    const html = li ? columnTip(t, t.cols.find((c) => `${t.name}.${c.name}` === li.dataset.col)) : t ? `<b>${t.name}</b>${t.data.length} rows · drag to move` : null;
    tipEl.classList.toggle('is-on', !!html);
    if (!html) return;
    const r = card.getBoundingClientRect();
    tipEl.innerHTML = html;
    tipEl.style.left = `${e.clientX - r.left}px`;
    tipEl.style.top = `${e.clientY - r.top}px`;
  });
  const end = () => {
    if (drag?.el) {
      drag.el.classList.remove('is-dragging');
      save();
    }
    drag = null;
    root.classList.remove('is-panning');
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('pointerleave', () => {
    if (drag) return;
    tipEl.classList.remove('is-on');
    highlight(null);
  });
  root.addEventListener('dblclick', (e) => !e.target.closest('.erd-table') && fit());
  root.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = root.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const k = clamp(view.k * Math.exp(-e.deltaY * 0.0015), ZOOM);
      Object.assign(view, { x: px - ((px - view.x) * k) / view.k, y: py - ((py - view.y) * k) / view.k, k });
      auto = false;
      apply();
    },
    { passive: false },
  );

  // keyboard: a focused table moves with the arrow keys
  root.addEventListener('keydown', (e) => {
    const el = e.target.closest('.erd-table');
    const d = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
    if (!el || !d) return;
    e.preventDefault();
    const [x, y] = pos.get(el.dataset.table);
    pos.set(el.dataset.table, [x + d[0], y + d[1]]);
    place(el.dataset.table);
    drawEdges();
    save();
  });

  // Fit forgets the learner's layout only when asked to: double-click Fit to tidy the tables back into a row.
  function relayout() {
    let x = 0;
    for (const t of SCHEMA) {
      pos.set(t.name, [x, 0]);
      place(t.name);
      x += nodes.get(t.name).offsetWidth + GAP;
    }
    localStorage.removeItem(SAVE);
    drawEdges();
    fit();
  }

  for (const name of nodes.keys()) place(name);
  drawEdges();
  fit();
  new ResizeObserver(() => {
    drawEdges();
    if (auto) fit();
  }).observe(root);
  return { fit, relayout };
}
