// The isometric grid, drawn with the Colorfigures engine (public/core.js,
// loaded as a classic script before this module, so its helpers such as P,
// pd, box, fill, ink, shape, tone, hullInk, castShadow, tag, txM, Dv and
// setCam are globals here).
//
// This file is the stage every lesson shares: the board, the camera (3D or
// 2D, orbit, pan, zoom), rows drawn as bars or index cards, coloured plates
// under rows, region washes, tweens, shuffle, tooltips and the legend. A
// lesson (src/lessons/lesson-N.js) brings the regions, the rows and the
// animation that explains its idea; see LESSON_SCENE below for the contract.
//
// World units: 1 grid cell = 20. x runs toward the viewer's right (at the
// starting view), y toward the viewer's left, z up (the engine's convention).
// A bar runs along y and its text reads toward -y; rows usually lie in a
// region as parallel lanes along x.
//
// ---------- LESSON_SCENE: what lesson.scene provides ----------
//   board: { x0, x1, y0, y1 }          the board's extent; the camera frames it
//   setup(api)                          add regions and rows (api.region, api.row)
//   play(result, api, live)             async; animate a query result. result is
//                                       { sql, columns, rows, error?, analysis }, where analysis
//                                       is what lesson.analyze returned. After every await, stop
//                                       when live() is false (a newer run or a reset took over).
//   draw?(api) -> { under?, parts?, over? }
//                                       extra geometry every frame: `under` is flat SVG on the
//                                       board, `parts` are [{ svg, box: [[x0,y0,z0],[x1,y1,z1]] }]
//                                       depth-sorted with the rows, `over` sits above the
//                                       hand-drawn filter (crisp labels).
//   tip?(row, api) -> html              the tooltip for a row (default: its fields)
//   reset?(api)                         clear the lesson's own state before a run or a reset
//   stages                              optional: set api.stages to draw a query as a pipeline of
//                                       stages read left to right (toward -y): each stage is its own
//                                       board with a numbered title, apart from the next. See
//                                       api.stages below; api.board() should cover them all.
//   arrange?(api)                       place rows by hand (in regions with scatter: false); runs
//                                       after setup and after every bar/card switch, since the
//                                       footprint changes. Set each row's home there.
//
// Rows are reset before every run: temp rows (copies) are removed, and every
// other row goes back to its home spot with no plates, lift, dim or fade.

import { SET_PALS } from './data.js';
import { component } from './tokens.js';

const CELL = 20;
const PLATE_H = 3.2;
const PAD = 1.3; // how far a plate reaches past the row's footprint
const MIN_GAP = 2 * PAD + 0.6;
const Z0 = 4; // top of the board
const BAR = { d: 8, h: 4.5 };
const CARD = { w: 30, h: 1.4, pitch: 4.6 };
const HEAD = { x0: 3, d: 8 }; // the column header strip, at the far end of a region
const HEADER = { l: component['scene-header'].bg, m: component['scene-header-side'].bg, d: component['scene-header-shade'].bg };
const YAW_START = 30;
const MUTED = component['scene-cell-label'].fg;
const REGION = component['scene-region'].bg;
const GRID_LINE = component['scene-grid-line'].bg;
const RULE_LINE = component['scene-rule-line'].bg;
const CARD_MARGIN = component['scene-card-margin'].bg;

const lerp = (a, b, t) => a + (b - a) * t;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const show = (v) => (v == null ? 'NULL' : String(v));

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const areaPts = (a, z) => [[a.x0, a.y0, z], [a.x1, a.y0, z], [a.x1, a.y1, z], [a.x0, a.y1, z]];
const rect = (x0, y0, x1, y1, z) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];

// Text lying flat on a horizontal plane, reading toward -y (to the right at
// the starting view); lines stack toward +x. Seen from above it is never
// mirrored, so it shows from every side. With a room (board units along y), the text shrinks
// below size until it fits in that length.
const flatText = (x, y, z, str, size, col, weight, anchor = 'middle', room = Infinity) =>
  `<text transform="${txM(P(x, y, z), Dv(0, -1, 0), Dv(1, 0, 0))}" font-size="${f(fitSize(str, size, room))}" fill="${col}" text-anchor="${anchor}" font-family="ui-monospace,Menlo,monospace" font-weight="${weight}" letter-spacing=".04em">${str}</text>`;

// One letter's advance as a share of the font size, measured once in the figure's monospace font, plus the .04em spacing.
let EM = 0;
function em() {
  if (!EM) {
    const c = document.createElement('canvas').getContext('2d');
    c.font = '800 100px ui-monospace,Menlo,monospace';
    EM = c.measureText('MMMMMMMMMM').width / 1000 + 0.04;
  }
  return EM;
}
// The length of a label on the board; str is escaped HTML, so an entity is one letter.
const textLen = (str, size) => String(str).replace(/&\w+;/g, '_').length * size * em();
const fitSize = (str, size, room) => Math.max(0.5, Math.min(size, (size * room) / textLen(str, size)));

// The width of each bar cell along y, wide enough for the column name and every value.
function measure(cols, rows) {
  return cols.map((c, i) => {
    const len = Math.max(String(c).length * 0.85, ...rows.map((r) => show(r[i]).length));
    return Math.max(9, Math.round(3 + 2.3 * len));
  });
}

export function createScene({ svg, tipEl, legendEl, shape: initialShape, view: initialView }) {
  const art = svg.querySelector('#art');
  const defs = svg.querySelector('#fdefs');
  // labels sit above the hand-drawn filter, so the wobble never smears their letters
  const lbl = svg.querySelector('#lbl');
  OX = OY = 0;
  RCZ = 8;
  setLight(105);
  // 3D looks down at the board from the front corner; 2D looks straight down, with the text reading left to right
  let flat = initialView === '2d';
  const home = () => (flat ? [0, 90] : [YAW_START, PITCH0]);
  PITCH_MAX = flat ? 90 : 78;
  setCam(...home());

  let lesson = null;
  let boardBox = { x0: -14, x1: 198, y0: -118, y1: 94 };
  let rowShape = initialShape === 'card' ? 'card' : 'bar';
  let seed = 7;
  let regions = [];
  let rows = [];
  let flashes = new Map(); // region id -> { pal, a, cols }
  let tags = [];
  let lastResult = null;
  let byKey = new Map();
  let stages = [];

  // ---------- rows ----------
  // The footprint of a row, half-depth (x) and half-width (y).
  const half = (t) => (rowShape === 'bar' ? [BAR.d / 2, t.widths.reduce((a, w) => a + w, 0) / 2] : [(CARD.pitch * t.cols.length + 2.6) / 2, CARD.w / 2]);
  const plateTop = (t) => t.z + t.hop + t.stack.reduce((z, s) => z + PLATE_H * t.plates[s], 0);
  const bodyZ = (t) => plateTop(t) + t.lift;

  // One row (with any plates under it), its cast shadow and its box for sorting.
  function drawRow(t) {
    let s = '';
    const { x, y } = t;
    let zb = t.z + t.hop;
    const [hd, hw] = half(t);
    const shadowPts = [];
    for (const slot of t.stack) {
      const sc = t.plates[slot];
      if (sc < 0.01) continue;
      const pd_ = (hd + PAD) * sc;
      const pw = (hw + PAD) * (0.6 + 0.4 * sc);
      const h = PLATE_H * sc;
      s += box(x - pd_, y - pw, zb, x + pd_, y + pw, zb + h, SET_PALS[slot % SET_PALS.length], tone, 0.8);
      shadowPts.push(...rect(x - pd_, y - pw, x + pd_, y + pw, zb));
      zb += h;
    }
    zb += t.lift;
    const top = zb + (rowShape === 'bar' ? BAR.h : CARD.h);
    const corners = [...rect(x - hd, y - hw, x + hd, y + hw, zb), ...rect(x - hd, y - hw, x + hd, y + hw, top)];
    s += box(x - hd, y - hw, zb, x + hd, y + hw, top, t.body ?? CERAMIC, tone, 1);
    const fl = flashes.get(t.region);
    const lit = (key) => (t.lit?.cols.has(key) ? t.lit : fl && fl.a > 0.01 && fl.cols.has(key) ? fl : null);
    const litFill = (pts, l) => fill(pd(pts), l.pal.l, `opacity="${f(0.9 * l.a)}"`);
    s += rowShape === 'bar' ? barFace(t, zb, top, lit, litFill) : cardFace(t, top, lit, litFill);
    s += hullInk(corners, 2.2);
    const op = t.dim ? ` opacity="${f(1 - 0.68 * t.dim)}"` : '';
    return {
      svg: `<g data-key="${esc(t.key)}"${op}>${s}</g>`,
      shadow: `<g${t.dim ? ` opacity="${f(1 - 0.7 * t.dim)}"` : ''}>${castShadow([...corners, ...shadowPts], Z0)}</g>`,
      box: [[x - hd - PAD, y - hw - PAD, t.z], [x + hd + PAD, y + hw + PAD, top]],
    };
  }

  // A cell's text; a faded cell (t.fade[col] = 0…1) loses its ink, and NULL is printed small and muted.
  function cellText(t, i, xx, yy, z, size, col, wt, anchor, room) {
    const v = t.values[i];
    const a = 1 - (t.fade[t.cols[i]] ?? 0);
    if (a < 0.02) return '';
    const txt = v == null ? flatText(xx, yy, z, 'NULL', size * 0.8, MUTED, 700, anchor, room) : flatText(xx, yy, z, esc(v), size, col, wt, anchor, room);
    return a < 0.99 ? `<g opacity="${f(a)}">${txt}</g>` : txt;
  }

  // A bar's top: one cell per column, divided by ink lines that run down the visible side.
  function barFace(t, zb, top, lit, litFill) {
    let s = '';
    const { x, y } = t;
    const D = BAR.d / 2;
    const side = vis([1, 0, 0]) ? x + D : x - D;
    let y1 = y + t.widths.reduce((a, w) => a + w, 0) / 2;
    t.cols.forEach((key, i) => {
      const y0 = y1 - t.widths[i];
      const l = lit(key);
      if (l) s += litFill(rect(x - D, y0, x + D, y1, top), l);
      const fa = t.fade[key] ?? 0;
      if (fa > 0.01) s += fill(pd(rect(x - D, y0, x + D, y1, top)), REGION, `opacity="${f(0.75 * fa)}"`);
      if (i) s += ink(pd([[x - D, y1, top], [x + D, y1, top], [side, y1, zb]], false), 0.7);
      const v = show(t.values[i]);
      const [size, col, wt] = key === 'id' ? [3.2, MUTED, 700] : i === 1 || key === 'name' ? [v.length > 6 ? 3.9 : 4.3, INK, 800] : [3.7, INK, 700];
      s += cellText(t, i, x + size * 0.36, (y0 + y1) / 2, top, size, col, wt, 'middle', t.widths[i] - 1.6);
      y1 = y0;
    });
    return s;
  }

  // An index card's top: one ruled line per column, the column name and its value.
  function cardFace(t, top, lit, litFill) {
    let s = '';
    const { x, y } = t;
    const D = (CARD.pitch * t.cols.length + 2.6) / 2;
    const W = CARD.w / 2;
    const p = CARD.pitch;
    t.cols.forEach((key, i) => {
      const xc = x - (p * (t.cols.length - 1)) / 2 + p * i;
      const l = lit(key);
      if (l) s += litFill(rect(xc - p / 2, y - W, xc + p / 2, y + W, top), l);
      if (i < t.cols.length - 1) s += `<path d="${pd([[xc + p / 2, y - W + 1, top], [xc + p / 2, y + W - 1, top]], false)}" fill="none" stroke="${RULE_LINE}" stroke-width=".5"/>`;
      // the name and the value share the line: the name takes at most half, the value the rest past a gap
      const line = 2 * W - 3.2;
      const keySize = fitSize(esc(key), 2.6, line / 2);
      s += flatText(xc + 0.95, y + W - 1.6, top, esc(key), keySize, MUTED, 700, 'start');
      s += cellText(t, i, xc + 1.25, y - W + 1.6, top, i === 1 ? 3.6 : 3.3, INK, i === 1 ? 800 : 700, 'end', line - textLen(esc(key), keySize) - 1.4);
    });
    s += `<path d="${pd([[x - D + 0.2, y - W + 0.2, top], [x - D + 0.2, y + W - 0.2, top]], false)}" fill="none" stroke="${CARD_MARGIN}" stroke-width=".7"/>`;
    return s;
  }

  // The column header at the far end of a region (bars only): it names the cells every bar has.
  function header(r) {
    const a = r.area;
    const cols = r.header.cols;
    const widths = r.header.widths;
    const len = widths.reduce((p, w) => p + w, 0);
    const x0 = a.x0 + HEAD.x0;
    const x1 = x0 + HEAD.d;
    const yc = (a.y0 + a.y1) / 2;
    const zt = Z0 + 1.6;
    const fl = flashes.get(r.id);
    let s = box(x0, yc - len / 2, Z0, x1, yc + len / 2, zt, HEADER, tone, 0.9);
    let y1 = yc + len / 2;
    cols.forEach((c, i) => {
      const y0 = y1 - widths[i];
      if (fl && fl.a > 0.01 && fl.cols.has(c)) s += fill(pd(rect(x0, y0, x1, y1, zt)), fl.pal.l, `opacity="${f(0.9 * fl.a)}"`);
      if (i) s += ink(pd([[x0, y1, zt], [x1, y1, zt]], false), 0.7);
      s += flatText((x0 + x1) / 2 + 1, (y0 + y1) / 2, zt, esc(String(c).toUpperCase()), 3.2, INK, 800, 'middle', widths[i] - 1.6);
      y1 = y0;
    });
    return { svg: s, box: [[x0, yc - len / 2, Z0], [x1, yc + len / 2, zt]] };
  }

  // Where n rows of one footprint lie in a region: parallel lanes, random gaps
  // and a random sideways offset for each, then handed out in random order.
  // The placement carries no order.
  function layout(r, sample, n, rand) {
    const a = r.area;
    const [hd, hw] = half(sample);
    const d = 2 * hd;
    const start = a.x0 + 3 + (rowShape === 'bar' && r.header ? HEAD.x0 + HEAD.d + 1 : 0);
    const cap = Math.max(1, Math.floor((a.x1 - 3 - start - MIN_GAP) / (d + MIN_GAP)));
    const room = a.y1 - a.y0;
    const lanesFit = Math.max(1, Math.floor(room / (2 * hw + 4)));
    const lanes = Math.min(lanesFit, Math.max(1, Math.ceil(n / cap)));
    const laneW = room / lanes;
    const jit = Math.max(0, Math.min(rowShape === 'bar' ? 8.5 : 3.4, laneW / 2 - hw - 1.5));
    const out = [];
    for (let li = 0; li < lanes; li++) {
      const ly = a.y1 - laneW * (li + 0.5);
      const k = Math.floor(n / lanes) + (li < n % lanes ? 1 : 0);
      if (!k) continue;
      const spareAll = a.x1 - 3 - start - k * d - (k + 1) * MIN_GAP;
      const spare = Math.max(0, Math.min(spareAll, (k + 1) * 6)); // a few rows stay near the top, not strewn
      const w = Array.from({ length: k + 1 }, () => 0.2 + rand());
      const sum = w.reduce((p, q) => p + q, 0);
      let x = start;
      for (let i = 0; i < k; i++) {
        x += MIN_GAP + (spare * w[i]) / sum;
        out.push([x + d / 2, ly + (rand() * 2 - 1) * jit]);
        x += d;
      }
    }
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  const regionOf = (id) => regions.find((r) => r.id === id);
  const regionSeed = (id) => seed + 99 * regions.findIndex((r) => r.id === id);

  // Scatter a region's rows (no animation) and make those spots home.
  function scatter(id, extra = 0) {
    const r = regionOf(id);
    const list = rows.filter((t) => t.region === id);
    if (!r || !list.length || r.scatter === false) return;
    layout(r, list[0], list.length, rng(regionSeed(id) + extra)).forEach(([x, y], i) => Object.assign(list[i], { x, y, home: [x, y] }));
  }

  function region(a, title, tint, label = true) {
    const pts = areaPts(a, Z0 + 0.1);
    let s = fill(pd(pts), REGION);
    if (tint && tint.a > 0.01) s += fill(pd(pts), tint.pal.l, `opacity="${f((tint.cols?.size ? 0.3 : 0.62) * tint.a)}"`);
    s += ink(pd(pts), 1.7);
    // the name lies in the strip past the region's near edge, no longer than the region is wide
    if (label && title) s += flatText(a.x1 + 9.5, a.y1, Z0 + 0.1, esc(title), 6.5, INK, 800, 'start', a.y1 - a.y0);
    return s;
  }

  // Stages: each one is its own board, with bare floor between them, so a stage reads as a set of
  // its own. Its number and name sit along its top edge.
  const stageBoard = (a) => ({ x0: a.x0 - 20, x1: a.x1 + 14, y0: a.y0 - 10, y1: a.y1 + 10 });
  function boardWithGrid(B) {
    let s = board(B.x0, B.y0, B.x1, B.y1, Z0, 8, BOARD);
    let grid = '';
    for (let x = B.x0 + CELL; x < B.x1; x += CELL) grid += pd([[x, B.y0, Z0], [x, B.y1, Z0]], false);
    for (let y = B.y0 + CELL; y < B.y1; y += CELL) grid += pd([[B.x0, y, Z0], [B.x1, y, Z0]], false);
    return s + `<path d="${grid}" fill="none" stroke="${GRID_LINE}" stroke-width=".6" opacity=".7"/>`;
  }
  function stageTitles() {
    let s = '';
    const z = Z0 + 0.1;
    stages.forEach((st, i) => {
      const a = st.area;
      const op = st.dim ? ` opacity="${f(1 - 0.6 * st.dim)}"` : '';
      // both start past the board's rounded corner and end before the far one
      const room = a.y1 - a.y0 + 6;
      const title = `${i + 1} · ${String(st.name).toUpperCase()}`;
      s += `<g${op}>${flatText(a.x0 - 13.5, a.y1 + 4, z, esc(title), 7, INK, 800, 'start', room)}`;
      // a note too long for one line breaks at the space nearest its middle, into the strip before the region
      const note = esc(st.note ?? '');
      const cut = fitSize(note, 3.6, room) < 3 ? [...note.matchAll(/ /g)].map((m) => m.index).sort((p, q) => Math.abs(p - note.length / 2) - Math.abs(q - note.length / 2))[0] : undefined;
      const lines = cut === undefined ? [note] : [note.slice(0, cut), note.slice(cut + 1)];
      const noteSize = Math.min(...lines.map((l) => fitSize(l, 3.6, room)));
      if (note) lines.forEach((l, j) => (s += flatText(a.x0 - 7.8 + j * 4, a.y1 + 4, z, l, noteSize, MUTED, 700, 'start', room)));
      s += '</g>';
    });
    return s;
  }

  // A region's label pins to the middle of its far edge on screen, out on its stage board's rim,
  // so the pill floats over the region, clear of the rows and of the stage's title.
  function regionTag(a, text, on) {
    const st = stages.find((s) => s.area.y0 <= a.y0 && a.y1 <= s.area.y1);
    const B = st ? stageBoard(st.area) : a;
    const ym = (a.y0 + a.y1) / 2;
    const at = [[B.x0, ym, Z0], [B.x1, ym, Z0]].reduce((m, p) => (P(...p)[1] < P(...m)[1] ? p : m));
    return { at, dx: 0, dy: -22, text, on };
  }

  // Draw the tags in order; one that would sit on an earlier pill rises above it. The pill's size is core.js tag()'s.
  function placeTags(list) {
    const k = INK_K;
    const u = window.LBL_U ? LBL_U() : 0;
    const fs = u ? 10 * u : 8.6 * k;
    const h = u ? 17 * u : fs * 1.8;
    const placed = [];
    let s = '';
    for (const t of list) {
      const text = esc(t.text);
      const w = u ? h * 1.3 : text.length * fs * 0.62 + fs * 1.5;
      const [X, Y] = P(...t.at);
      // a pill past the figure's side slides back in when its pin is in view; its pin stays put
      const vb = svg.viewBox.baseVal;
      const inView = X > vb.x && X < vb.x + vb.width;
      const cx = inView ? Math.min(Math.max(X + (t.dx ?? 0) * k, vb.x + w / 2 + 4 * k), vb.x + vb.width - w / 2 - 4 * k) : X + (t.dx ?? 0) * k;
      const dx = (cx - X) / k;
      let dy = t.dy ?? -26;
      const hit = (cy) => placed.find((p) => Math.abs(p.cx - cx) < (p.w + w) / 2 + 3 * k && Math.abs(p.cy - cy) < h + 3 * k);
      for (let n = 0, p; n < 8 && (p = hit(Y + dy * k)); n++) dy = (p.cy - Y) / k - (h / k + 4);
      placed.push({ cx, cy: Y + dy * k, w });
      s += tag(t.at, dx, dy, text, !!t.on);
    }
    return s;
  }

  function render() {
    _clipN = 0;
    let s = stages.length ? stages.map((st) => boardWithGrid(stageBoard(st.area))).join('') : boardWithGrid(boardBox);
    for (const r of regions) if (!r.hidden) s += region(r.area, r.title, flashes.get(r.id), r.label !== false);
    const extra = lesson?.scene.draw?.(api) ?? {};
    s += extra.under ?? '';
    const parts = rows.filter((t) => !t.hidden).map(drawRow);
    const heads = rowShape === 'bar' ? regions.filter((r) => r.header && !r.hidden).map(header) : [];
    s += parts.map((p) => p.shadow).join('');
    s += byDepth([...heads, ...parts, ...(extra.parts ?? [])]);
    art.innerHTML = inkScale(s);
    const pins = [];
    for (const r of regions) {
      const tg = !r.hidden && r.tag?.();
      if (tg) pins.push(regionTag(r.area, tg[0], !!tg[1]));
    }
    // stage titles go on the label layer: in 3D a row standing near the board's back edge would hide them
    let l = stageTitles() + placeTags([...pins, ...tags]);
    l += extra.over ?? '';
    lbl.innerHTML = inkScale(l);
  }

  // ---------- frame driver and tweens ----------
  const tweens = new Set();
  let queued = false;
  function invalidate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  }
  function frame() {
    queued = false;
    const now = performance.now();
    for (const tw of tweens) {
      const t = Math.min(1, (now - tw.start) / tw.ms);
      tw.fn(t);
      if (t >= 1) {
        tweens.delete(tw);
        tw.resolve();
      }
    }
    render();
    if (tweens.size) invalidate();
  }
  // A camera tween (cam) survives a reset, so a new run or a shape switch never stops the view half-turned.
  const tween = (ms, fn, cam = false) =>
    new Promise((resolve) => {
      tweens.add({ start: performance.now(), ms, fn, resolve, cam });
      invalidate();
    });
  const wait = (ms) => tween(ms, () => {});
  let runId = 0;

  // ---------- view: framing, orbit, pan, zoom ----------
  let base = { x: 0, y: 0, w: 585, h: 440 };
  let vb = { ...base };
  const applyVB = () => svg.setAttribute('viewBox', `${f(vb.x)} ${f(vb.y)} ${f(vb.w)} ${f(vb.h)}`);
  // Frame the home view of the current mode; keepView leaves the visible window for resetView to tween.
  function fit(keepView = false) {
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 600;
    const keep = [YAW, PITCH];
    setCam(...home());
    const pts = [];
    const B = boardBox;
    for (const x of [B.x0, B.x1]) for (const y of [B.y0, B.y1]) for (const z of [0, 26]) pts.push(P(x, y, z));
    setCam(...keep);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    // the grid fills the stage's width and its top ~70%; the set card sits below
    const u = Math.max(bw / (w * 0.98), bh / (h * 0.7));
    base = { x: Math.min(...xs) - (w * u - bw) / 2, y: Math.min(...ys) - h * 0.1 * u, w: w * u, h: h * u };
    if (!keepView) {
      vb = { ...base };
      applyVB();
    }
    INK_K = base.w / INK_REF_VB;
    defs.innerHTML = filterFor(INK_K);
    // a gentler wobble than the engine's default: the row tops carry small text
    defs.querySelector('#wob').setAttribute('scale', (0.9 * INK_K).toFixed(2));
    bakeNoise(svg);
    render();
  }
  new ResizeObserver(() => fit()).observe(svg);

  // The view that frames a rectangle of the board under the current camera, with fit()'s margins.
  function frameOf(a) {
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 600;
    const pts = [];
    // frame the stage boards, with room above them for the count tags (about 34 ink units)
    const B = stages.length ? stageBoard(a) : a;
    for (const x of [B.x0, B.x1]) for (const y of [B.y0, B.y1]) for (const z of [0, 26]) pts.push(P(x, y, z));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    const top = stages.length ? 34 * INK_K : 0;
    const u = Math.max(bw / (w * 0.98), (bh + top) / (h * 0.7), (base.w / w) / 2.6); // never closer than 2.6× the whole-board view
    return { x: Math.min(...xs) - (w * u - bw) / 2, y: Math.min(...ys) - top - h * 0.1 * u, w: w * u, h: h * u };
  }
  function moveTo(to, ms = 650) {
    const v0 = { ...vb };
    return tween(ms, (t) => {
      const e = ease(t);
      vb = { x: lerp(v0.x, to.x, e), y: lerp(v0.y, to.y, e), w: lerp(v0.w, to.w, e), h: lerp(v0.h, to.h, e) };
      applyVB();
    }, true);
  }

  function resetView() {
    const [y0, p0] = [YAW, PITCH];
    const [y1, p1] = home();
    const dy = ((y1 - y0 + 540) % 360) - 180;
    const v0 = { ...vb };
    return tween(600, (t) => {
      const e = ease(t);
      setCam(y0 + dy * e, lerp(p0, p1, e));
      vb = { x: lerp(v0.x, base.x, e), y: lerp(v0.y, base.y, e), w: lerp(v0.w, base.w, e), h: lerp(v0.h, base.h, e) };
      applyVB();
    }, true).then(() => {
      PITCH_MAX = flat ? 90 : 78;
    });
  }

  // 3D or 2D: the same scene, seen from the front corner or from straight above.
  function setView(next) {
    if ((next === '2d') === flat) return;
    flat = next === '2d';
    PITCH_MAX = 90; // let the camera pass through the steep pitches on its way; resetView settles it
    fit(true);
    return resetView();
  }

  let drag = null;
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: YAW, pitch: PITCH, pan: flat || e.button === 2 || e.shiftKey, vb: { ...vb } };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('drag');
    tipEl.classList.remove('is-on');
  });
  const endDrag = () => {
    drag = null;
    svg.classList.remove('drag');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('dblclick', resetView);
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      const w = Math.min(base.w * 1.6, Math.max(base.w / 4, vb.w * Math.exp(e.deltaY * 0.0015)));
      const h = (w * vb.h) / vb.w;
      vb = { x: vb.x + fx * (vb.w - w), y: vb.y + fy * (vb.h - h), w, h };
      applyVB();
    },
    { passive: false },
  );

  // Drag to turn (as in Colorfigures), right-drag to pan (in 2D every drag pans); otherwise hover tooltips.
  svg.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.pan) {
        const k = vb.w / svg.clientWidth;
        vb = { ...vb, x: drag.vb.x - dx * k, y: drag.vb.y - dy * k };
        applyVB();
      } else {
        const k = 300 / svg.clientWidth;
        setCam(drag.yaw + dx * 0.55 * k, drag.pitch + dy * 0.35 * k);
        invalidate();
      }
      return;
    }
    const el = e.target.closest?.('[data-key]');
    const t = el && byKey.get(el.dataset.key);
    tipEl.classList.toggle('is-on', !!t);
    if (!t) return;
    const r = svg.getBoundingClientRect();
    tipEl.innerHTML = lesson?.scene.tip?.(t, api) ?? defaultTip(t);
    tipEl.style.left = `${e.clientX - r.left}px`;
    tipEl.style.top = `${e.clientY - r.top}px`;
  });
  svg.addEventListener('pointerleave', () => tipEl.classList.remove('is-on'));
  const defaultTip = (t) => `<b>${esc(show(t.values[1] ?? t.values[0]))}</b>${t.cols.map((c, i) => `${esc(c)} ${esc(show(t.values[i]))}`).join(' · ')}`;

  // ---------- legend: one line per step, then the result ----------
  // rows: [{ slot?: 0…3, code?: string, note?: string, count?: any, state?: 'is-pending'|'is-active'|'is-done',
  //          final?: true, text?: string, sym?: string }]; null hides it.
  function legend(list) {
    if (!list) {
      legendEl.innerHTML = '';
      return;
    }
    legendEl.innerHTML = list
      .map((r) =>
        r.final
          ? `<div class="legend-row is-final ${r.state ?? ''}"><i>${esc(r.sym ?? '=')}</i><span>${r.text ?? ''}</span><b>${esc(r.count ?? '')}</b></div>`
          : `<div class="legend-row set-${((r.slot ?? 0) % SET_PALS.length) + 1} ${r.state ?? ''}"><i></i><code>${esc(r.code ?? '')}</code>${
              r.note ? `<small>${r.note}</small>` : ''
            }<b>${esc(r.count ?? '')}</b></div>`,
      )
      .join('');
  }

  // ---------- the API a lesson scene works with ----------
  const api = {
    Z0,
    CELL,
    PLATE_H,
    SET_PALS,
    get shape() {
      return rowShape;
    },
    get flat() {
      return flat;
    },
    get rows() {
      return rows;
    },
    get regions() {
      return regions;
    },
    tween,
    wait,
    ease,
    lerp,
    rng,
    esc,
    show,
    rect,
    areaPts,
    flatText,
    measure,
    invalidate,
    legend,
    // A region: { id, area: { x0, x1, y0, y1 }, title?, header?: { cols, widths } (bars only),
    //   tag?: () => [text, on] | null, scatter?: false (rows keep the spots the lesson gives them),
    //   label?: false (no big title), hidden?: true }. Returns the region object; change it freely.
    region(spec) {
      const r = { scatter: true, ...spec };
      regions.push(r);
      return r;
    },
    // A row: { key (unique), cols, values, widths (from api.measure), region, x?, y?, z?, temp? }.
    // Animate it by changing x, y, z (base height, Z0 on the board), hop, lift, dim (0…1),
    // fade[col] (0…1 fades a cell), lit ({ pal, a, cols: Set } lights cells), hidden, body (a material).
    row(spec) {
      const t = { x: 0, y: 0, z: Z0, hop: 0, lift: 0, dim: 0, stack: [], plates: {}, fade: {}, lit: null, temp: false, ...spec };
      t.home ??= [t.x, t.y];
      rows.push(t);
      byKey.set(t.key, t);
      invalidate();
      return t;
    },
    remove(t) {
      rows = rows.filter((r) => r !== t);
      byKey.delete(t.key);
      invalidate();
    },
    // A copy of a row, a temp row that the next run removes.
    copy(t, extra = {}) {
      return api.row({ cols: t.cols, values: t.values, widths: t.widths, region: t.region, x: t.x, y: t.y, z: bodyZ(t), ...extra, key: extra.key ?? `${t.key}~${Math.random().toString(36).slice(2, 7)}`, temp: true });
    },
    // Half the footprint of a row in the current shape: [half along x, half along y].
    half,
    bodyZ,
    // Spots for n rows like `sample` in a region, scattered at random (the placement carries no order).
    slots: (id, sample, n, extra = 0) => layout(regionOf(id), sample, n, rng(regionSeed(id) + 7 + extra)),
    scatter,
    // Light a region and the cells of `cols` in it with set colour `slot`; fades in, then holds.
    flash(id, slot, cols = new Set()) {
      const fl = { pal: SET_PALS[slot % SET_PALS.length], a: 0, cols };
      flashes.set(id, fl);
      return tween(380, (t) => (fl.a = ease(t))).then(() => wait(420));
    },
    unflash(id) {
      const fl = flashes.get(id);
      return tween(420, (t) => {
        if (fl) fl.a = 1 - ease(t);
      }).then(() => {
        if (flashes.get(id) === fl) flashes.delete(id);
      });
    },
    // Every row in `list` gets a plate of colour `slot` under it, at the same moment.
    popPlates(list, slot) {
      list.forEach((t) => {
        if (!t.stack.includes(slot)) t.stack.push(slot);
        t.plates[slot] = 0;
      });
      return tween(320, (x) => list.forEach((t) => (t.plates[slot] = ease(x))));
    },
    async dropPlates(slot, list = rows) {
      const hit = list.filter((t) => t.stack.includes(slot));
      await tween(240, (x) => hit.forEach((t) => (t.plates[slot] = 1 - ease(x))));
      hit.forEach((t) => {
        t.stack = t.stack.filter((s) => s !== slot);
        delete t.plates[slot];
      });
    },
    // The board's extent; the rotation centre stays put, so nothing jumps. The view keeps its window
    // until api.overview() or api.focus() moves it.
    board(box) {
      boardBox = { ...box };
      fit(true);
    },
    // Pan and zoom to frame a rectangle of the board { x0, x1, y0, y1 } (a stage's area), or back to the whole board.
    focus: (a, ms) => moveTo(frameOf(a), ms),
    overview: (ms) => moveTo(base, ms),
    // The width along y a region needs so that n rows of these cell widths fit in either shape,
    // with rows laid along x over xLen (a bar region's column header takes 12 of it).
    band(widths, n, xLen, header = true) {
      const need = (d, w, start) => {
        const cap = Math.max(1, Math.floor((xLen - 6 - start - MIN_GAP) / (d + MIN_GAP)));
        return Math.ceil(n / cap) * (w + 4) + 6;
      };
      const len = widths.reduce((a, w) => a + w, 0);
      return Math.max(need(BAR.d, len + 17, header ? HEAD.x0 + HEAD.d + 1 : 0), need(CARD.pitch * widths.length + 2.6, CARD.w + 7, 0));
    },
    // The pipeline: [{ name, note?, area: { x0, x1, y0, y1 }, dim? }], each drawn as its own board,
    // left to right. Assign a new list, or change one in place and call invalidate().
    get stages() {
      return stages;
    },
    set stages(list) {
      stages = list;
      invalidate();
    },
    // Floating labels for this run: [{ at: [x, y, z], text, on?, dx?, dy? }]; cleared before every run.
    get tags() {
      return tags;
    },
  };

  // ---------- runs ----------
  function resetVisual() {
    // settle the dropped tweens, so a cancelled play() returns instead of hanging
    for (const tw of tweens) {
      if (tw.cam) continue;
      tw.resolve();
      tweens.delete(tw);
    }
    rows.filter((t) => t.temp).forEach((t) => byKey.delete(t.key));
    rows = rows.filter((t) => !t.temp);
    flashes = new Map();
    tags = [];
    for (const t of rows) Object.assign(t, { x: t.home[0], y: t.home[1], z: t.z0 ?? Z0, hop: 0, lift: 0, dim: 0, stack: [], plates: {}, fade: {}, lit: null, hidden: t.hidden0 ?? false });
    lesson?.scene.reset?.(api);
    legend(null);
    invalidate();
  }

  async function play(result) {
    const id = ++runId;
    resetVisual();
    lastResult = result;
    await lesson?.scene.play(result, api, () => id === runId);
  }

  function reset() {
    runId++;
    lastResult = null;
    resetVisual();
  }

  // Shuffle: same set, new places. Every row of a scattered region moves at once; nothing about the table changes.
  function shuffle() {
    seed += 1;
    const moves = [];
    for (const r of regions) {
      if (r.scatter === false) continue;
      const list = rows.filter((t) => t.region === r.id && !t.hidden);
      if (!list.length) continue;
      layout(r, list[0], list.length, rng(regionSeed(r.id))).forEach((to, i) => {
        const t = list[i];
        moves.push({ t, from: [t.x, t.y], to });
        if (!t.temp) t.home = to;
      });
    }
    return tween(700, (x) => {
      const e = ease(x);
      const hop = Math.sin(Math.PI * e) * 10;
      moves.forEach(({ t, from, to }) => Object.assign(t, { x: lerp(from[0], to[0], e), y: lerp(from[1], to[1], e), hop }));
    });
  }

  // Bars or cards: the same rows, drawn another way. A query already run plays again.
  function setShape(next) {
    if (next === rowShape) return;
    rowShape = next;
    const replay = lastResult;
    reset();
    regions.forEach((r) => scatter(r.id));
    lesson?.scene.arrange?.(api);
    resetVisual();
    if (replay) play(replay);
  }

  // Swap in a lesson: its regions and rows replace the last lesson's.
  function load(next) {
    runId++;
    for (const tw of tweens) {
      if (tw.cam) continue;
      tw.resolve();
      tweens.delete(tw);
    }
    lesson = next;
    lastResult = null;
    regions = [];
    rows = [];
    byKey = new Map();
    flashes = new Map();
    tags = [];
    stages = [];
    seed = 7;
    boardBox = { ...next.scene.board };
    RC = [(boardBox.x0 + boardBox.x1) / 2, (boardBox.y0 + boardBox.y1) / 2];
    next.scene.setup(api);
    regions.forEach((r) => scatter(r.id));
    next.scene.arrange?.(api);
    for (const t of rows) {
      t.z0 = t.z;
      t.hidden0 = !!t.hidden;
    }
    legend(null);
    lesson.scene.reset?.(api);
    fit();
  }

  return { load, play, reset, shuffle, resetView, setShape, setView };
}
