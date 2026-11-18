// The isometric grid, drawn with the Colorfigures engine (public/core.js,
// loaded as a classic script before this module, so its helpers such as P,
// box, tone, hullInk, castShadow, tag and setCam are globals here).
//
// Every row of pets lies in the "pets" region, in no order, in one of two
// shapes: a bar split into id | name | species | age cells (under a column
// header), or an index card with the four fields printed as labelled lines.
// Rows lie parallel so the fields line up by eye, but at random offsets and
// gaps, so nothing says which row is first. A query never walks the rows one
// by one: each WHERE condition lights the field it reads on every row at
// once, and every matching row gets a plate in that condition's colour under
// it, all at the same moment. A row in A ∩ B lies on both plates. The kept
// rows are copied, together, into the "result" region: a new set.
//
// World units: 1 grid cell = 20. x runs toward the viewer's right, y toward
// the viewer's left, z up (the engine's convention).
import { PETS, SET_PALS, FIELDS } from './data.js';
import { component } from './tokens.js';

const CELL = 20;
const PLATE_H = 3.2;
const PAD = 1.3; // how far a plate reaches past the row's footprint
const MIN_GAP = 2 * PAD + 0.6;
const Z0 = 4; // top of the board
// A bar runs along y (its text reads toward -y): id | name | species | age.
const COLS = [
  { key: 'id', w: 9 },
  { key: 'name', w: 22 },
  { key: 'species', w: 19 },
  { key: 'age', w: 10 },
];
const BAR = { d: 8, h: 4.5, len: COLS.reduce((a, c) => a + c.w, 0) };
const CARD = { d: 21, w: 30, h: 1.4, pitch: 4.6 };
const HEAD = { x0: 3, d: 8 }; // the column header strip, at the far end of a region
const BOARD_BOX = { x0: -14, x1: 198, y0: -118, y1: 94 };
const PETS_AREA = { x0: 0, x1: 172, y0: 0, y1: 80 };
const RES_AREA = { x0: 0, x1: 172, y0: -104, y1: -24 };
const HEADER = { l: component['scene-header'].bg, m: component['scene-header-side'].bg, d: component['scene-header-shade'].bg };
const YAW_START = 30;
const MUTED = component['scene-cell-label'].fg;
const REGION = component['scene-region'].bg;
const GRID_LINE = component['scene-grid-line'].bg;
const RULE_LINE = component['scene-rule-line'].bg;
const CARD_MARGIN = component['scene-card-margin'].bg;

const lerp = (a, b, t) => a + (b - a) * t;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Where n rows lie in an area: parallel lanes, random gaps between rows and a
// random sideways offset for each, then handed out in random order. The
// placement carries no order.
function layout(shape, a, n, rand) {
  const yc = (a.y0 + a.y1) / 2;
  const S =
    shape === 'bar'
      ? { lanes: [yc], d: BAR.d, jit: 8.5, start: a.x0 + HEAD.x0 + HEAD.d + 4 }
      : { lanes: [yc + 20, yc - 20], d: CARD.d, jit: 3.4, start: a.x0 + 3 };
  const out = [];
  S.lanes.forEach((ly, li) => {
    const k = Math.floor(n / S.lanes.length) + (li < n % S.lanes.length ? 1 : 0);
    if (!k) return;
    const room = a.x1 - 3 - S.start - k * S.d - (k + 1) * MIN_GAP;
    const spare = Math.max(0, Math.min(room, (k + 1) * 6)); // a few rows stay near the top, not strewn
    const w = Array.from({ length: k + 1 }, () => 0.2 + rand());
    const sum = w.reduce((p, q) => p + q, 0);
    let x = S.start;
    for (let i = 0; i < k; i++) {
      x += MIN_GAP + (spare * w[i]) / sum;
      out.push([x + S.d / 2, ly + (rand() * 2 - 1) * S.jit]);
      x += S.d;
    }
  });
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const areaPts = (a, z) => [[a.x0, a.y0, z], [a.x1, a.y0, z], [a.x1, a.y1, z], [a.x0, a.y1, z]];
const rect = (x0, y0, x1, y1, z) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
// The columns a condition reads, e.g. "species = 'cat'" reads species.
const colsOf = (text) => new Set((text.replace(/'[^']*'/g, '').match(/\b(id|name|species|age)\b/gi) ?? []).map((c) => c.toLowerCase()));

// Text lying flat on a horizontal plane, reading toward -y (to the right at
// the starting view); lines stack toward +x. Seen from above it is never
// mirrored, so it shows from every side.
const flatText = (x, y, z, str, size, col, weight, anchor = 'middle') =>
  `<text transform="${txM(P(x, y, z), Dv(0, -1, 0), Dv(1, 0, 0))}" font-size="${size}" fill="${col}" text-anchor="${anchor}" font-family="ui-monospace,Menlo,monospace" font-weight="${weight}" letter-spacing=".04em">${str}</text>`;

function combineLabel(ops, n) {
  if (n === 0) return 'No WHERE, so the result is the whole set';
  if (n === 1) return 'The result is this subset';
  if (ops.every((o) => o === 'AND')) return '∩ on every plate (AND)';
  if (ops.every((o) => o === 'OR')) return '∪ on at least one plate (OR)';
  return 'AND first (∩), then OR (∪)';
}

export function createScene({ svg, tipEl, legendEl, shape: initialShape }) {
  const art = svg.querySelector('#art');
  const defs = svg.querySelector('#fdefs');
  // labels sit above the hand-drawn filter, so the wobble never smears their letters
  const lbl = svg.querySelector('#lbl');
  RC = [(BOARD_BOX.x0 + BOARD_BOX.x1) / 2, (BOARD_BOX.y0 + BOARD_BOX.y1) / 2];
  RCZ = 8;
  OX = OY = 0;
  setLight(105);
  setCam(YAW_START, PITCH0);

  let rowShape = initialShape === 'card' ? 'card' : 'bar';
  let seed = 7;
  const tokens = PETS.map((row) => ({ row, id: row[0], x: 0, y: 0, hop: 0, lift: 0, dim: 0, stack: [], plates: {} }));
  const place = () => layout(rowShape, PETS_AREA, tokens.length, rng(seed)).forEach(([x, y], i) => Object.assign(tokens[i], { x, y }));
  place();
  const byId = new Map(tokens.map((t) => [t.id, t]));
  let clones = [];
  let flash = null; // { pal, a, cols }: a condition washing over the pets region, lighting the fields it reads
  let lastResult = null;
  let resultCount = null;
  let lastAtoms = [];
  let legend = null;

  const plateTop = (t) => Z0 + t.hop + t.stack.reduce((z, s) => z + PLATE_H * t.plates[s], 0);
  const bodyZ = (t) => plateTop(t) + t.lift;

  // The footprint of one row, half-depth (x) and half-width (y).
  const half = () => (rowShape === 'bar' ? [BAR.d / 2, BAR.len / 2] : [CARD.d / 2, CARD.w / 2]);

  // One row (with any plates under it), its cast shadow and its box for sorting.
  function drawRow({ id, row, x, y, z, plates = [], dim = 0, hl = null }) {
    let s = '';
    let zb = z;
    const [hd, hw] = half();
    const shadowPts = [];
    for (const [slot, sc] of plates) {
      if (sc < 0.01) continue;
      const pd_ = (hd + PAD) * sc;
      const pw = (hw + PAD) * (0.6 + 0.4 * sc);
      const h = PLATE_H * sc;
      s += box(x - pd_, y - pw, zb, x + pd_, y + pw, zb + h, SET_PALS[slot], tone, 0.8);
      shadowPts.push(...rect(x - pd_, y - pw, x + pd_, y + pw, zb));
      zb += h;
    }
    zb += plates.lift ?? 0;
    const top = zb + (rowShape === 'bar' ? BAR.h : CARD.h);
    const corners = [...rect(x - hd, y - hw, x + hd, y + hw, zb), ...rect(x - hd, y - hw, x + hd, y + hw, top)];
    s += box(x - hd, y - hw, zb, x + hd, y + hw, top, CERAMIC, tone, 1);
    const lit = (key) => hl && hl.a > 0.01 && hl.cols.has(key);
    const litFill = (pts) => fill(pd(pts), hl.pal.l, `opacity="${f(0.9 * hl.a)}"`);
    if (rowShape === 'bar') s += barFace(row, x, y, zb, top, lit, litFill);
    else s += cardFace(row, x, y, top, lit, litFill);
    s += hullInk(corners, 2.2);
    const op = dim ? ` opacity="${f(1 - 0.68 * dim)}"` : '';
    return {
      svg: `<g data-id="${id}"${op}>${s}</g>`,
      shadow: `<g${dim ? ` opacity="${f(1 - 0.7 * dim)}"` : ''}>${castShadow([...corners, ...shadowPts], Z0)}</g>`,
      box: [[x - hd - PAD, y - hw - PAD, z], [x + hd + PAD, y + hw + PAD, top]],
    };
  }

  // A bar's top: one cell per field, divided by ink lines that run down the visible side.
  function barFace(row, x, y, zb, top, lit, litFill) {
    let s = '';
    const D = BAR.d / 2;
    const side = vis([1, 0, 0]) ? x + D : x - D;
    let y1 = y + BAR.len / 2;
    COLS.forEach((c, i) => {
      const y0 = y1 - c.w;
      if (lit(c.key)) s += litFill(rect(x - D, y0, x + D, y1, top));
      if (i) s += ink(pd([[x - D, y1, top], [x + D, y1, top], [side, y1, zb]], false), 0.7);
      const v = row[i];
      const [size, col, wt] = c.key === 'id' ? [3.2, MUTED, 700] : c.key === 'name' ? [String(v).length > 6 ? 3.9 : 4.3, INK, 800] : [3.7, INK, 700];
      s += flatText(x + size * 0.36, (y0 + y1) / 2, top, esc(v), size, col, wt);
      y1 = y0;
    });
    return s;
  }

  // An index card's top: four ruled lines, each a field name and its value.
  function cardFace(row, x, y, top, lit, litFill) {
    let s = '';
    const D = CARD.d / 2;
    const W = CARD.w / 2;
    const p = CARD.pitch;
    FIELDS.forEach((key, i) => {
      const xc = x - (p * (FIELDS.length - 1)) / 2 + p * i;
      if (lit(key)) s += litFill(rect(xc - p / 2, y - W, xc + p / 2, y + W, top));
      if (i < FIELDS.length - 1) s += `<path d="${pd([[xc + p / 2, y - W + 1, top], [xc + p / 2, y + W - 1, top]], false)}" fill="none" stroke="${RULE_LINE}" stroke-width=".5"/>`;
      s += flatText(xc + 0.95, y + W - 1.6, top, key, 2.6, MUTED, 700, 'start');
      s += flatText(xc + 1.25, y - W + 1.6, top, esc(row[i]), key === 'name' ? 3.6 : 3.3, INK, key === 'name' ? 800 : 700, 'end');
    });
    s += `<path d="${pd([[x - D + 0.2, y - W + 0.2, top], [x - D + 0.2, y + W - 0.2, top]], false)}" fill="none" stroke="${CARD_MARGIN}" stroke-width=".7"/>`;
    return s;
  }

  // The column header at the far end of a region (bars only): it names the cells every bar has.
  function header(a, hl) {
    const x0 = a.x0 + HEAD.x0;
    const x1 = x0 + HEAD.d;
    const yc = (a.y0 + a.y1) / 2;
    const zt = Z0 + 1.6;
    let s = box(x0, yc - BAR.len / 2, Z0, x1, yc + BAR.len / 2, zt, HEADER, tone, 0.9);
    let y1 = yc + BAR.len / 2;
    COLS.forEach((c, i) => {
      const y0 = y1 - c.w;
      if (hl && hl.a > 0.01 && hl.cols.has(c.key)) s += fill(pd(rect(x0, y0, x1, y1, zt)), hl.pal.l, `opacity="${f(0.9 * hl.a)}"`);
      if (i) s += ink(pd([[x0, y1, zt], [x1, y1, zt]], false), 0.7);
      s += flatText((x0 + x1) / 2 + 1, (y0 + y1) / 2, zt, c.key.toUpperCase(), 3.2, INK, 800);
      y1 = y0;
    });
    return { svg: s, box: [[x0, yc - BAR.len / 2, Z0], [x1, yc + BAR.len / 2, zt]] };
  }

  function region(a, title, tint) {
    const pts = areaPts(a, Z0 + 0.1);
    let s = fill(pd(pts), REGION);
    if (tint && tint.a > 0.01) s += fill(pd(pts), tint.pal.l, `opacity="${f((tint.cols?.size ? 0.3 : 0.62) * tint.a)}"`);
    s += ink(pd(pts), 1.7);
    s += flatText(a.x1 + 12.5, a.y1, Z0 + 0.1, title, 9, INK, 800, 'start');
    return s;
  }

  // A label on the region's farthest corner on screen, so it sits clear of the rows.
  function regionTag(a, text, on) {
    const pts = areaPts(a, Z0);
    const far = pts.reduce((m, p) => (P(...p)[1] < P(...m)[1] ? p : m));
    return tag(far, 0, -30, text, on);
  }

  function render() {
    _clipN = 0;
    let s = board(BOARD_BOX.x0, BOARD_BOX.y0, BOARD_BOX.x1, BOARD_BOX.y1, Z0, 8, BOARD);
    let grid = '';
    for (let x = BOARD_BOX.x0 + CELL; x < BOARD_BOX.x1; x += CELL) grid += pd([[x, BOARD_BOX.y0, Z0], [x, BOARD_BOX.y1, Z0]], false);
    for (let y = BOARD_BOX.y0 + CELL; y < BOARD_BOX.y1; y += CELL) grid += pd([[BOARD_BOX.x0, y, Z0], [BOARD_BOX.x1, y, Z0]], false);
    s += `<path d="${grid}" fill="none" stroke="${GRID_LINE}" stroke-width=".6" opacity=".7"/>`;
    s += region(PETS_AREA, 'PETS', flash);
    s += region(RES_AREA, 'RESULT', null);
    s += shape([[78, -3, Z0 + 0.1], [86, -19, Z0 + 0.1], [94, -3, Z0 + 0.1], [86, -7, Z0 + 0.1]], BOARD.d, 1);

    const parts = [
      ...tokens.map((t) =>
        drawRow({ id: t.id, row: t.row, x: t.x, y: t.y, z: Z0 + t.hop, plates: Object.assign(t.stack.map((sl) => [sl, t.plates[sl]]), { lift: t.lift }), dim: t.dim, hl: flash }),
      ),
      ...clones.map((c) => drawRow({ id: c.t.id, row: c.t.row, x: c.x, y: c.y, z: c.z })),
    ];
    const heads = rowShape === 'bar' ? [header(PETS_AREA, flash), header(RES_AREA, null)] : [];
    s += parts.map((p) => p.shadow).join('');
    s += byDepth([...heads, ...parts]);
    art.innerHTML = inkScale(s);
    lbl.innerHTML = inkScale(
      regionTag(PETS_AREA, `PETS: ${tokens.length} ROWS`, !!flash) +
        regionTag(RES_AREA, resultCount == null ? 'RESULT' : resultCount ? `RESULT: ${resultCount} ROW${resultCount === 1 ? '' : 'S'}` : 'RESULT: EMPTY SET', !!resultCount),
    );
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
  const tween = (ms, fn) =>
    new Promise((resolve) => {
      tweens.add({ start: performance.now(), ms, fn, resolve });
      invalidate();
    });
  const wait = (ms) => tween(ms, () => {});
  let runId = 0;

  // ---------- view: framing, orbit, pan, zoom ----------
  let base = { x: 0, y: 0, w: 585, h: 440 };
  let vb = { ...base };
  const applyVB = () => svg.setAttribute('viewBox', `${f(vb.x)} ${f(vb.y)} ${f(vb.w)} ${f(vb.h)}`);
  function fit() {
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 600;
    const keep = [YAW, PITCH];
    setCam(YAW_START, PITCH0);
    const pts = [];
    for (const x of [BOARD_BOX.x0, BOARD_BOX.x1]) for (const y of [BOARD_BOX.y0, BOARD_BOX.y1]) for (const z of [0, 26]) pts.push(P(x, y, z));
    setCam(...keep);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    // the grid fills the stage's width and its top ~60%; the set card sits below
    const u = Math.max(bw / (w * 0.98), bh / (h * 0.7));
    base = { x: Math.min(...xs) - (w * u - bw) / 2, y: Math.min(...ys) - h * 0.1 * u, w: w * u, h: h * u };
    vb = { ...base };
    applyVB();
    INK_K = base.w / INK_REF_VB;
    defs.innerHTML = filterFor(INK_K);
    // a gentler wobble than the engine's default: the row tops carry small text
    defs.querySelector('#wob').setAttribute('scale', (0.9 * INK_K).toFixed(2));
    bakeNoise(svg);
    render();
  }
  new ResizeObserver(fit).observe(svg);

  function resetView() {
    const [y0, p0] = [YAW, PITCH];
    const dy = ((YAW_START - y0 + 540) % 360) - 180;
    const v0 = { ...vb };
    return tween(600, (t) => {
      const e = ease(t);
      setCam(y0 + dy * e, lerp(p0, PITCH0, e));
      vb = { x: lerp(v0.x, base.x, e), y: lerp(v0.y, base.y, e), w: lerp(v0.w, base.w, e), h: lerp(v0.h, base.h, e) };
      applyVB();
    });
  }

  let drag = null;
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: YAW, pitch: PITCH, pan: e.button === 2 || e.shiftKey, vb: { ...vb } };
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

  // Drag to turn (as in Colorfigures), right-drag to pan; otherwise hover tooltips.
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
    const el = e.target.closest?.('[data-id]');
    const t = el && byId.get(Number(el.dataset.id));
    tipEl.classList.toggle('is-on', !!t);
    if (!t) return;
    const r = svg.getBoundingClientRect();
    tipEl.innerHTML = `<b>${esc(t.row[1])}</b>${t.row[2]} · age ${t.row[3]} · id ${t.id}${lastAtoms
      .map((a) => `<br>${a.ids.has(t.id) ? '✓' : '✗'} ${esc(a.text)}`)
      .join('')}`;
    tipEl.style.left = `${e.clientX - r.left}px`;
    tipEl.style.top = `${e.clientY - r.top}px`;
  });
  svg.addEventListener('pointerleave', () => tipEl.classList.remove('is-on'));

  // ---------- legend: one row per condition, then how they combine ----------
  function renderLegend() {
    if (!legend) {
      legendEl.innerHTML = '';
      return;
    }
    const rows = legend.atoms.map((a, k) => {
      const label = a.phase === 'inner' ? a.inner : a.text;
      const note = a.phase === 'inner' ? 'then flip to everything else…' : a.inner ? 'complement: everything outside' : '';
      return `<div class="legend-row set-${(k % SET_PALS.length) + 1} ${a.state}">
        <i></i><code>${esc(label)}</code>${note ? `<small>${note}</small>` : ''}<b>${a.count ?? ''}</b></div>`;
    });
    rows.push(`<div class="legend-row is-final ${legend.final.state}"><i>=</i><span>${combineLabel(legend.ops, legend.atoms.length)}</span><b>${legend.final.count ?? ''}</b></div>`);
    legendEl.innerHTML = rows.join('');
  }

  // ---------- the query, played out ----------
  function resetVisual() {
    // settle the dropped tweens, so a cancelled play() returns instead of hanging
    for (const tw of tweens) tw.resolve();
    tweens.clear();
    clones = [];
    flash = null;
    resultCount = null;
    for (const t of tokens) Object.assign(t, { hop: 0, lift: 0, dim: 0, stack: [], plates: {} });
    invalidate();
  }

  // The condition washes over the whole region at once, lighting the field it reads on every row…
  const flashRegion = (k, text) => {
    const fl = (flash = { pal: SET_PALS[k % SET_PALS.length], a: 0, cols: colsOf(text) });
    return tween(380, (t) => (fl.a = ease(t))).then(() => wait(420));
  };
  // Each fade clears only its own flash, so a cancelled run can't blank the next one's.
  const fadeRegion = () => {
    const fl = flash;
    return tween(420, (t) => {
      if (fl) fl.a = 1 - ease(t);
    }).then(() => {
      if (flash === fl) flash = null;
    });
  };

  // …and every matching row gets plate k under it, at the same moment.
  function popPlates(k, ids) {
    const slot = k % SET_PALS.length;
    const hit = tokens.filter((t) => ids.has(t.id));
    hit.forEach((t) => {
      t.stack.push(slot);
      t.plates[slot] = 0;
    });
    return tween(320, (x) => hit.forEach((t) => (t.plates[slot] = ease(x))));
  }

  async function hidePlates(k) {
    const slot = k % SET_PALS.length;
    const hit = tokens.filter((t) => t.stack.includes(slot));
    await tween(240, (x) => hit.forEach((t) => (t.plates[slot] = 1 - ease(x))));
    hit.forEach((t) => {
      t.stack = t.stack.filter((s) => s !== slot);
      delete t.plates[slot];
    });
  }

  async function play(result) {
    const id = ++runId;
    resetVisual();
    lastResult = result;
    lastAtoms = result.atoms ?? [];
    if (!result.passIds) {
      legend = null;
      renderLegend();
      return;
    }
    legend = {
      ops: result.ops,
      atoms: lastAtoms.map((a) => ({ text: a.text, inner: a.inner, state: 'is-pending', phase: a.inner ? 'inner' : 'final' })),
      final: { state: 'is-pending' },
    };
    renderLegend();

    for (const [k, atom] of lastAtoms.entries()) {
      const row = legend.atoms[k];
      row.state = 'is-active';
      renderLegend();
      await flashRegion(k, atom.text);
      if (id !== runId) return;
      if (atom.inner) {
        row.count = atom.innerIds.size;
        renderLegend();
        await Promise.all([popPlates(k, atom.innerIds), fadeRegion()]);
        await wait(450);
        if (id !== runId) return;
        row.phase = 'final';
        await hidePlates(k);
        if (id !== runId) return;
        row.count = atom.ids.size;
        renderLegend();
        await popPlates(k, atom.ids);
      } else {
        row.count = atom.ids.size;
        renderLegend();
        await Promise.all([popPlates(k, atom.ids), fadeRegion()]);
      }
      if (id !== runId) return;
      row.state = 'is-done';
      renderLegend();
      await wait(320);
      if (id !== runId) return;
    }

    // Combine: the kept rows rise together, the rest fade together
    const kept = tokens.filter((t) => result.passIds.has(t.id));
    const dropped = tokens.filter((t) => !result.passIds.has(t.id));
    legend.final = { state: 'is-done', count: kept.length };
    renderLegend();
    await tween(520, (x) => {
      kept.forEach((t) => (t.lift = 6 * ease(x)));
      dropped.forEach((t) => (t.dim = ease(x)));
    });
    if (id !== runId) return;
    await wait(200);

    // Copy the subset into the result region, every row at the same time
    const targets = layout(rowShape, RES_AREA, kept.length, rng(seed + 99));
    clones = kept.map((t, i) => ({ t, from: [t.x, t.y, bodyZ(t)], to: targets[i], x: t.x, y: t.y, z: bodyZ(t) }));
    await tween(900, (x) => {
      const e = ease(x);
      clones.forEach((c) => {
        c.x = lerp(c.from[0], c.to[0], e);
        c.y = lerp(c.from[1], c.to[1], e);
        c.z = lerp(c.from[2], Z0, e) + Math.sin(Math.PI * e) * 40;
      });
    });
    if (id !== runId) return;
    resultCount = kept.length;
    invalidate();
  }

  // Shuffle: same set, new places. Nothing about the table changes.
  function shuffle() {
    seed += 1;
    const to = layout(rowShape, PETS_AREA, tokens.length, rng(seed));
    const from = tokens.map((t) => [t.x, t.y]);
    const rTo = layout(rowShape, RES_AREA, clones.length, rng(seed + 99));
    const rFrom = clones.map((c) => [c.x, c.y]);
    return tween(700, (x) => {
      const e = ease(x);
      const hop = Math.sin(Math.PI * e) * 10;
      tokens.forEach((t, i) => Object.assign(t, { x: lerp(from[i][0], to[i][0], e), y: lerp(from[i][1], to[i][1], e), hop }));
      clones.forEach((c, i) => Object.assign(c, { x: lerp(rFrom[i][0], rTo[i][0], e), y: lerp(rFrom[i][1], rTo[i][1], e), z: Z0 + hop }));
    });
  }

  function reset() {
    runId++;
    resetVisual();
    lastResult = null;
    lastAtoms = [];
    legend = null;
    renderLegend();
  }

  // Bars or cards: the same rows, drawn another way. A query already run plays again.
  function setShape(next) {
    if (next === rowShape) return;
    rowShape = next;
    place();
    if (lastResult) play(lastResult);
    else reset();
  }

  return { play, reset, shuffle, resetView, setShape };
}
