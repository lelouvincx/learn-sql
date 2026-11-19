// Lesson 3, Line them up: ORDER BY, LIMIT, OFFSET, drawn as a pipeline of stages.
//
// Every query is read as stages, left to right on the grid, each its own board:
//   1 · pets       the table as stored, a set in no order
//   2 · filtered   only with WHERE: the rows that pass, still a set
//   · sorted       the same rows in one queue, numbered 1, 2, 3…; the only step
//                  where rows arrive one after another, because only now do they
//                  have an order. Tied neighbours get an = between their numbers.
//   · first_n      only with LIMIT: cut lines on the sorted queue mark the kept
//     / next_n     positions (OFFSET skips, LIMIT keeps), the rows past them fade,
//                  and the kept rows fly on in order, numbered again from 1.
// The query card writes the same stages as a WITH query. ORDER BY and LIMIT stay
// in the last SELECT, because a WITH stage is a set and keeps no order; analyze
// runs that rewrite and checks it returns the learner's rows, in order.
//
// The sorted and cut regions have scatter: false, so Shuffle never touches a
// queue; the queue spots come from the current row shape (a bar/card switch
// replays the run, so they are recomputed).
import { SET_PALS, table } from '../data.js';
import { clean, countTag, cteCard, esc, placeStages, plural, sameRows, setChip, sqlComment as com, sqlHtml, union } from './common.js';

const PETS = table('pets');
const COLS = PETS.cols.map((c) => c.name);
const X = { x0: 0, x1: 184 }; // every region's extent along x: the queue runs along it
const SLOT = { where: 3, cut: 2 }; // the sort keys use set colours 0 and 1
const STEP = 150; // the gap between one row leaving and the next
const FLY = 900;

const RE = /^select\s+([\s\S]+?)\s+from\s+pets(?:\s+where\s+([\s\S]+?))?\s+order\s+by\s+([\s\S]+?)(?:\s+limit\s+(\d+)(?:\s+offset\s+(\d+))?)?$/i;

// `SELECT … FROM pets [WHERE …] ORDER BY a [ASC|DESC][, b [ASC|DESC]] [LIMIT n [OFFSET m]]`, or null.
function parse(sql) {
  const m = clean(sql).match(RE);
  if (!m) return null;
  const items = m[3].split(',').map((s) => s.trim());
  if (items.length > 2) return null;
  const keys = [];
  for (const it of items) {
    const k = it.match(/^(?:pets\.)?(id|name|species|age|owner_id)(?:\s+(asc|desc))?$/i);
    if (!k) return null;
    keys.push({ col: k[1].toLowerCase(), desc: /desc/i.test(k[2] ?? ''), text: it });
  }
  const q = { select: m[1].trim(), where: m[2]?.trim() ?? null, keys, order: m[3], limit: m[4] == null ? null : +m[4], offset: m[5] == null ? 0 : +m[5] };
  // the stage names: WHERE adds `filtered` before the sort, LIMIT adds the kept positions after it
  q.plan = { filtered: q.where ? 'filtered' : null, cut: q.limit == null ? null : q.offset ? `next_${q.limit}` : `first_${q.limit}` };
  return q;
}

// The columns a condition reads, e.g. "species = 'cat'" reads species.
const colsOf = (text) => new Set((text.replace(/'[^']*'/g, '').match(/\b(id|name|species|age|owner_id)\b/gi) ?? []).map((c) => c.toLowerCase()));
// The SELECT list as plain pets columns, or null for * and anything else.
function pickOf(select) {
  if (select === '*') return null;
  const cols = select.split(',').map((c) => c.trim().toLowerCase().replace(/^pets\./, ''));
  return cols.every((c) => COLS.includes(c)) ? cols : null;
}
const keyText = (k) => `${k.col} ${k.desc ? 'DESC' : 'ASC'}`;
const cutText = (q) => `LIMIT ${q.limit}${q.offset ? ` OFFSET ${q.offset}` : ''}`;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- the query as stages ----------
function cteHtml(q) {
  const lines = [[com('1 · pets: as stored')]];
  let n = 2;
  if (q.where) {
    lines.push([sqlHtml('WITH filtered AS ('), com(`${n++} · filtered`)]);
    lines.push([`  ${sqlHtml('SELECT * FROM pets')}`]);
    lines.push([`  ${sqlHtml('WHERE')} ${setChip(SLOT.where, esc(q.where))}`]);
    lines.push([')']);
  }
  lines.push([sqlHtml(`SELECT ${q.select}`)]);
  lines.push([sqlHtml(`FROM ${q.where ? 'filtered' : 'pets'}`)]);
  lines.push([`${sqlHtml('ORDER BY')} ${q.keys.map((k, i) => setChip(i, sqlHtml(k.text))).join(', ')}`, com(`${n++} · sorted`)]);
  if (q.plan.cut) lines.push([setChip(SLOT.cut, sqlHtml(cutText(q))), com(`${n} · ${q.plan.cut}`)]);
  const last = lines.length - 1;
  lines[last][0] += ';';
  const out = lines.map(([code, note], i) => (note && i ? `${code}  ${note}` : code));
  if (q.where) out.push(com('a WITH stage is a set: the sort goes in the last SELECT'));
  return cteCard(out);
}

// Where n rows lie in line in a queue region: bars in one lane along x; cards in lanes of as many as fit.
function queueSpots(api, sample, n, a) {
  const [hd, hw] = api.half(sample);
  const yc = (a.y0 + a.y1) / 2;
  if (api.shape === 'bar') {
    const start = a.x0 + 15; // past the column header strip
    const pitch = Math.min(16, (a.x1 - 3 - start) / Math.max(n, 1));
    return { pitch, hw, spots: Array.from({ length: n }, (_, i) => ({ x: start + pitch * (i + 0.5), y: yc, lane: 0 })) };
  }
  const pitch = 2 * hd + 4.4;
  const per = Math.max(1, Math.floor((a.x1 - a.x0 - 6 + 4.4) / pitch));
  const lanes = Math.max(1, Math.ceil(n / per));
  const laneW = (a.y1 - a.y0) / lanes;
  return {
    pitch,
    hw,
    spots: Array.from({ length: n }, (_, i) => {
      const lane = Math.floor(i / per);
      return { x: a.x0 + 3 + hd + (i % per) * pitch, y: a.y1 - laneW * (lane + 0.5), lane };
    }),
  };
}
// The width along y a queue of n rows needs in the current shape, with room for the position numbers.
function queueW(api, sample, n) {
  const [hd, hw] = api.half(sample);
  if (api.shape === 'bar') return 2 * hw + 24;
  const per = Math.max(1, Math.floor((X.x1 - X.x0 - 6 + 4.4) / (2 * hd + 4.4)));
  return Math.max(1, Math.ceil(Math.max(n, 1) / per)) * (2 * hw + 18) + 4;
}

// ---------- the run's state, cleared before every run ----------
// A queue: { spots, pitch, hw, labels: [{ text, a }], ties, tieA, cuts: [{ b, a }] }.
const fresh = () => ({ an: null, queues: [], petsOn: false, tag: {}, info: new Map() });
let S = fresh();

// The boundary before queue index b: in the gap after row b-1, or before row b when it starts a lane.
function cutAt(Q, b) {
  const s = Q.spots;
  if (!s.length) return null;
  if (b < s.length && (b === 0 || s[b - 1].lane !== s[b].lane)) return { x: s[b].x - Q.pitch / 2, y: s[b].y };
  return { x: s[b - 1].x + Q.pitch / 2, y: s[b - 1].y };
}

// Where the stages lie, left to right (toward -y): the starter's (pets, sorted, first_3) before a run.
function place(api, an) {
  const reg = new Map(api.regions.map((r) => [r.id, r]));
  const sample = api.rows.find((t) => t.region === 'pets');
  const xLen = X.x1 - X.x0;
  const plan = an?.plan ?? { filtered: null, cut: 'first_3' };
  const spec = [{ name: 'pets', note: 'as stored', regions: [['pets', api.band(sample.widths, PETS.data.length, xLen)]] }];
  if (plan.filtered) spec.push({ name: 'filtered', note: 'WHERE: the rows that pass', regions: [['filtered', api.band(sample.widths, Math.max(1, an.filtered.length), xLen)]] });
  spec.push({ name: 'sorted', note: 'ORDER BY: the same rows, in line', regions: [['sorted', queueW(api, sample, an ? an.order.length : PETS.data.length)]] });
  if (plan.cut) spec.push({ name: plan.cut, note: `${an ? cutText(an) : 'LIMIT 3'}: the positions kept`, regions: [['cut', queueW(api, sample, an ? an.to - an.from : 3)]] });
  reg.get('cut').title = (plan.cut ?? 'result').toUpperCase();
  return placeStages(api, X, spec);
}

export default {
  n: 3,
  title: 'Line them up',
  topic: 'ORDER BY · LIMIT',
  starter: `SELECT *
FROM pets
ORDER BY age DESC
LIMIT 3;`,
  challengeStarter: `SELECT *
FROM pets
ORDER BY `,

  overview: () => `
    <h3>Line them up</h3>
    <p>Until now every result was a <b>set</b>: rows lying loosely, with no first row and no last. <code>ORDER BY</code> is the one step that gives the rows an <b>order</b>. Read the grid left to right, one board per stage: <b>pets</b> as stored, then <b>sorted</b>, the same rows in line, numbered 1, 2, 3… This is the only step where rows arrive one after another.</p>
    <p>Rows with the same sort value are a <b>tie</b>: they stand next to each other with an = between their numbers, and either may come first. A second key settles ties. <code>LIMIT</code> and <code>OFFSET</code> count positions, so they only make sense once the rows are in line. They make one more stage: the positions you keep, numbered again from 1. A <code>WHERE</code> adds a stage before the sort.</p>
    <ul class="facts">
      <li><span class="ic">ASC</span><span>Smallest first, A before Z. It is the default</span></li>
      <li><span class="ic">DESC</span><span>Largest first: the same line, reversed</span></li>
      <li><span class="ic">LIMIT n</span><span>Keep positions 1 to n; the rows past the cut fade away</span></li>
      <li><span class="ic">OFFSET m</span><span>Skip the first m positions, then start counting</span></li>
      <li><span class="ic">WITH</span><span>The query card writes each stage as a step of a <code>WITH</code> query. The sort goes in the last <code>SELECT</code>: a stage is a set, so it keeps no order</span></li>
    </ul>`,
  notation: () => `
    <h3>Sets and sequences</h3>
    <p>{ Miso, Luna } and { Luna, Miso } are the same set. ⟨ Miso, Luna ⟩ and ⟨ Luna, Miso ⟩ are different <b>sequences</b>: a sequence has a first, a second and a last.</p>
    <table class="mapping"><thead><tr><th>Stage</th><th>SQL</th><th>Notation</th></tr></thead><tbody>
      <tr><td>pets</td><td>FROM pets</td><td>{ p ∈ pets }, in no order</td></tr>
      <tr><td>sorted</td><td>ORDER BY age</td><td>⟨ r₁, r₂, …, r₁₂ ⟩, age(r₁) ≤ age(r₂) ≤ …</td></tr>
      <tr><td>sorted</td><td>ORDER BY age DESC</td><td>age(r₁) ≥ age(r₂) ≥ …</td></tr>
      <tr><td>first_3</td><td>LIMIT 3</td><td>⟨ r₁, r₂, r₃ ⟩</td></tr>
      <tr><td>next_3</td><td>LIMIT 3 OFFSET 2</td><td>⟨ r₃, r₄, r₅ ⟩</td></tr>
    </tbody></table>
    <p>Without <code>ORDER BY</code>, “the first 3 rows” means nothing: a set has no first row.</p>`,

  // The query as stages: a WITH query, with ORDER BY and LIMIT in the last SELECT.
  formula(sql, parsed) {
    const q = parse(sql);
    if (!q) {
      if (parsed && !/^order\s+by\b/i.test(parsed.tail)) {
        return `{ p ∈ <b>${esc(parsed.table)}</b>${parsed.where ? ` | ${esc(parsed.where)}` : ''} }<span class="card">no ORDER BY: a set, with no first row and no last</span>`;
      }
      return '<span class="card">Write <code>SELECT … FROM pets ORDER BY …</code> to see the query as stages.</span>';
    }
    return cteHtml(q);
  },

  // Runs the stages on the live database: the rows that pass WHERE, the sort order, and the rewrite itself,
  // which must return exactly the learner's rows in the same order. Any mismatch keeps the grid calm.
  analyze(db, sql, result) {
    const q = parse(sql);
    if (!q || /\(|\b(distinct|count|sum|avg|min|max|total|group_concat)\b/i.test(q.select)) return null;
    if (q.where && /\b(select|group\s+by|having|join|union|intersect|except)\b/i.test(q.where)) return null;
    const exec = (text) => db.exec(text)[0]?.values ?? [];
    const cte = q.where ? `WITH filtered AS (SELECT * FROM pets WHERE ${q.where}) ` : '';
    const src = q.where ? 'filtered' : 'pets';
    const filtered = q.where ? exec(`${cte}SELECT id FROM filtered`).map((v) => v[0]) : null;
    const full = exec(`${cte}SELECT id FROM ${src} ORDER BY ${q.order}`).map((v) => v[0]);
    // the last stage: the rewrite as shown on the query card, with each row's id in front
    const last = exec(`${cte}SELECT id AS __id, ${q.select} FROM ${src} ORDER BY ${q.order}${q.limit != null ? ` ${cutText(q)}` : ''}`);
    if (!sameRows(last.map((v) => v.slice(1)), result.rows, true)) return null;
    const from = Math.min(q.offset, full.length);
    const to = q.limit == null ? full.length : Math.min(full.length, from + q.limit);
    const keptIds = last.map((v) => v[0]);
    if (keptIds.length !== to - from) return null;
    // ties may come out in either order: the sorted queue shows the kept rows exactly where the last stage has them
    const kept = new Set(keptIds);
    const rest = full.filter((id) => !kept.has(id));
    const order = [...rest.slice(0, from), ...keptIds, ...rest.slice(from)];
    const byId = new Map(PETS.data.map((r) => [r[0], r]));
    const ci = q.keys.map((k) => COLS.indexOf(k.col));
    const ties = order.map((id, i) => i + 1 < order.length && ci.every((c) => byId.get(id)[c] === byId.get(order[i + 1])[c]));
    return { ...q, filtered, order, ties, from, to, pick: pickOf(q.select) };
  },

  challenges: [
    {
      title: 'Youngest first',
      prompt: 'The vet sees the youngest pets first. List every pet from youngest to oldest; pets of the same age go in name order.',
      hint: 'Two keys: <code>ORDER BY age, name</code>. The first key lines the rows up; the second settles the ties. <code>ASC</code> is the default.',
      answer: 'SELECT * FROM pets ORDER BY age, name',
      ordered: true,
      wrong: 'Not the same sequence. Check the rows and their order, including the pets that share an age.',
    },
    {
      title: 'Two oldest dogs',
      prompt: 'Get the two oldest dogs, oldest first.',
      hint: 'Keep the dogs with <code>WHERE</code>, line them up with <code>ORDER BY age DESC</code>, then cut after row 2 with <code>LIMIT 2</code>.',
      answer: "SELECT * FROM pets WHERE species = 'dog' ORDER BY age DESC LIMIT 2",
      ordered: true,
      wrong: 'Not the same sequence. Is the oldest dog first, and does the line stop after two?',
    },
    {
      title: 'Next three',
      prompt: 'Pets get their check-up in alphabetical order of name, three at a time. The first three are done. Get the next three.',
      hint: 'Line the pets up by <code>name</code>, skip the first 3 with <code>OFFSET 3</code>, and keep 3 with <code>LIMIT 3</code>. Write <code>LIMIT</code> before <code>OFFSET</code>.',
      answer: 'SELECT * FROM pets ORDER BY name LIMIT 3 OFFSET 3',
      ordered: true,
      wrong: 'Not the same sequence. Line the pets up by name, then count past the first three.',
    },
  ],

  scene: {
    board: { x0: -36, x1: 208, y0: -520, y1: 16 },

    setup(api) {
      const widths = api.measure(COLS, PETS.data);
      const header = { cols: COLS, widths };
      const flat = { ...X, y0: 0, y1: 0 };
      api.region({ id: 'pets', area: flat, title: 'PETS', header, tag: () => [`PETS: ${plural(PETS.data.length, 'ROW')}`, S.petsOn] });
      api.region({ id: 'filtered', area: flat, title: 'FILTERED', header, hidden: true, tag: () => S.tag.filtered ?? ['FILTERED', false] });
      api.region({ id: 'sorted', area: flat, title: 'SORTED', header, scatter: false, tag: () => S.tag.sorted ?? ['SORTED', false] });
      const cut = api.region({ id: 'cut', area: flat, title: 'FIRST_3', header, scatter: false, tag: () => S.tag.cut ?? [cut.title, false] });
      PETS.data.forEach((values) => api.row({ key: `p${values[0]}`, cols: COLS, values, widths, region: 'pets' }));
      place(api, null);
    },

    // Back to the starter's stages, with empty queues.
    reset(api) {
      S = fresh();
      if (api.rows.some((t) => t.region === 'pets')) place(api, null);
    },

    // The position numbers, the = between tied neighbours and the LIMIT / OFFSET cut lines, on every queue.
    draw(api) {
      if (!S.queues.length) return {};
      const z = api.Z0 + 0.1;
      const parts = [];
      const size = 5;
      const label = (x, y, text, a) => ({
        svg: `<g opacity="${f(a)}">${api.flatText(x + size * 0.36, y, z + 0.1, text, size, INK, 800)}</g>`,
        box: [[x - 2.5, y - 3, api.Z0], [x + 2.5, y + 3, z + 0.2]],
      });
      for (const Q of S.queues) {
        const ly = (s) => s.y + Q.hw + 4.6;
        Q.labels.forEach((L, i) => {
          if (L.a > 0.02) parts.push(label(Q.spots[i].x, ly(Q.spots[i]), L.text, L.a));
        });
        if (Q.tieA > 0.02) {
          Q.ties.forEach((tie, i) => {
            const [s, t] = [Q.spots[i], Q.spots[i + 1]];
            const a = Q.tieA * Math.min(Q.labels[i].a, Q.labels[i + 1]?.a ?? 0);
            if (tie && t && s.lane === t.lane && a > 0.02) parts.push(label((s.x + t.x) / 2, ly(s), '=', a));
          });
        }
        for (const c of Q.cuts) {
          const at = cutAt(Q, c.b);
          if (!at || c.a < 0.01) continue;
          const y0 = at.y + Q.hw + 8;
          const y1 = api.lerp(y0, at.y - Q.hw - 3, c.a);
          const d = pd([[at.x, y0, z + 0.1], [at.x, y1, z + 0.1]], false);
          parts.push({
            svg:
              `<path d="${d}" fill="none" stroke="${SET_PALS[SLOT.cut].l}" stroke-width="3.4" stroke-linecap="round"/>` +
              `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="${f(3.2 * INK_K)} ${f(2.4 * INK_K)}"/>`,
            box: [[at.x - 0.6, Math.min(y0, y1), api.Z0], [at.x + 0.6, Math.max(y0, y1), z + 0.3]],
          });
        }
      }
      return { parts };
    },

    tip(t) {
      const [id, name, species, age, owner] = t.values;
      const own = S.info.get(t.key);
      const line = own ? `<br>#${own.pos} in ${own.stage}${own.tie ? ' · tied with a neighbour' : ''}${own.fate ? `<br>${own.fate}` : ''}` : '';
      return `<b>${esc(name)}</b>${esc(species)} · age ${age} · id ${id} · owner ${owner ?? 'NULL'}${line}`;
    },

    async play(result, api, live) {
      const an = result.analysis;
      if (!an) return;
      S.an = an;
      const st = place(api, an);
      const reg = new Map(api.regions.map((r) => [r.id, r]));
      const pets = api.rows.filter((t) => t.region === 'pets');
      const sample = pets[0];
      const n = an.order.length;
      const kept = an.to - an.from;
      const sortedAt = an.where ? 2 : 1; // the sorted stage's index in st
      const cutName = an.plan.cut;

      // The legend: one line per step, then the result.
      const L = [];
      if (an.where) L.push({ slot: SLOT.where, code: `WHERE ${an.where}`, note: 'pets → filtered: the rows that pass', id: 'where' });
      an.keys.forEach((k, i) => L.push({ slot: i, code: i ? `then ${keyText(k)}` : `ORDER BY ${keyText(k)}`, note: i ? 'settles the ties' : 'lights the sort key on every row', id: `key${i}` }));
      L.push({ slot: 0, code: '⟨ r₁, r₂, … ⟩', note: 'sorted: line up, one after another', id: 'line' });
      if (an.offset) L.push({ slot: SLOT.cut, code: `OFFSET ${an.offset}`, note: `skip positions 1 to ${an.offset}`, id: 'offset' });
      if (an.limit != null) L.push({ slot: SLOT.cut, code: `LIMIT ${an.limit}`, note: `cut after position ${an.from + an.limit}`, id: 'limit' });
      L.forEach((r) => (r.state = 'is-pending'));
      const fin = { final: true, sym: '=', text: 'a sequence: every row has a place', state: 'is-pending', count: '' };
      const show = () => api.legend([...L, fin]);
      const step = (id) => L.find((r) => r.id === id);
      const fly = (list, total, stagger, onFrame) =>
        api.tween(total, (x) => {
          const ms = x * total;
          let landed = 0;
          list.forEach(({ t, from, to }, i) => {
            const p = clamp01((ms - i * stagger) / FLY);
            const e = api.ease(p);
            t.hidden = p <= 0;
            t.x = api.lerp(from.x, to.x, e);
            t.y = api.lerp(from.y, to.y, e);
            t.z = api.lerp(from.z, api.Z0, e) + Math.sin(Math.PI * e) * 30;
            if (p >= 1) landed++;
            onFrame?.(i, p);
          });
          return landed;
        });
      const at = (t) => ({ x: t.x, y: t.y, z: api.bodyZ(t) });
      show();

      // 1 · pets
      await api.focus(st[0].area);
      if (!live()) return;
      S.petsOn = true;
      let src = pets; // the rows of the stage before the sort
      let srcRegion = 'pets';

      // 2 · filtered: WHERE lights every row at once, the matching ones get a plate and are copied on, together.
      if (an.where) {
        const row = step('where');
        row.state = 'is-active';
        show();
        await api.flash('pets', SLOT.where, colsOf(an.where));
        if (!live()) return;
        const byId = new Map(pets.map((t) => [t.values[0], t]));
        const pass = an.filtered.map((id) => byId.get(id));
        const passIds = new Set(an.filtered);
        row.count = pass.length;
        show();
        await Promise.all([api.popPlates(pass, SLOT.where), api.unflash('pets')]);
        if (!live()) return;
        const out = pets.filter((t) => !passIds.has(t.values[0]));
        await api.tween(520, (x) => out.forEach((t) => (t.dim = api.ease(x))));
        if (!live()) return;
        await api.focus(union(st[0].area, st[1].area));
        if (!live()) return;
        const spots = pass.length ? api.slots('filtered', sample, pass.length) : [];
        const copies = pass.map((t, i) => ({ t: api.copy(t, { region: 'filtered', key: `f${t.values[0]}` }), from: at(t), to: { x: spots[i][0], y: spots[i][1] } }));
        await fly(copies, FLY, 0);
        if (!live()) return;
        S.tag.filtered = [countTag('filtered', pass.length), false];
        row.state = 'is-done';
        show();
        src = copies.map((c) => c.t);
        srcRegion = 'filtered';
        await api.wait(300);
        if (!live()) return;
      }

      // · sorted: the sort key lights on every row of the stage before at once; a second key keeps the first lit.
      await api.focus(union(st[sortedAt - 1].area, st[sortedAt].area));
      if (!live()) return;
      const lit0 = { pal: SET_PALS[0], a: 1, cols: new Set([an.keys[0].col]) };
      const srcLit0 = { ...lit0 };
      for (const [k, key] of an.keys.entries()) {
        const row = step(`key${k}`);
        row.state = 'is-active';
        show();
        if (k) src.forEach((t) => (t.lit = srcLit0));
        await api.flash(srcRegion, k, new Set([key.col]));
        if (!live()) return;
        row.state = 'is-done';
        show();
      }

      // Line up: the only time rows move one after another. Each copy flies to its place in the queue.
      const line = step('line');
      line.state = 'is-active';
      show();
      const srcById = new Map(src.map((t) => [t.values[0], t]));
      const Q = { ...queueSpots(api, sample, n, reg.get('sorted').area), labels: an.order.map((_, i) => ({ text: String(i + 1), a: 0 })), ties: an.ties, tieA: 0, cuts: [] };
      S.queues.push(Q);
      const queued = an.order.map((id, i) => {
        const s = srcById.get(id);
        const t = api.copy(s, { region: 'sorted', key: `s${i}~${id}`, hidden: true, lit: lit0 });
        S.info.set(t.key, { pos: i + 1, stage: 'sorted', tie: an.ties[i] || an.ties[i - 1] });
        return { t, from: at(s), to: Q.spots[i] };
      });
      if (an.keys[1]) api.flash('sorted', 1, new Set([an.keys[1].col]));
      const total = FLY + STEP * Math.max(0, n - 1);
      await api.tween(total, (x) => {
        const ms = x * total;
        let landed = 0;
        queued.forEach(({ t, from, to }, i) => {
          const p = clamp01((ms - i * STEP) / FLY);
          const e = api.ease(p);
          t.hidden = p <= 0;
          t.x = api.lerp(from.x, to.x, e);
          t.y = api.lerp(from.y, to.y, e);
          t.z = api.lerp(from.z, api.Z0, e) + Math.sin(Math.PI * e) * 34;
          Q.labels[i].a = clamp01((p - 0.8) / 0.2);
          if (p >= 1) landed++;
        });
        line.count = landed;
        S.tag.sorted = [`SORTED: ${landed} IN LINE`, false];
      });
      if (!live()) return;
      line.state = 'is-done';
      line.count = n;
      show();
      S.tag.sorted = [countTag('sorted', n), !cutName];
      await Promise.all([
        api.unflash(srcRegion),
        an.keys[1] ? api.unflash('sorted') : null,
        api.tween(420, (x) => {
          srcLit0.a = 1 - api.ease(x);
          if (an.ties.some(Boolean)) Q.tieA = api.ease(x);
        }),
      ]);
      if (!live()) return;
      await api.wait(250);
      if (!live()) return;

      let last = queued; // the rows of the last stage
      // · first_n / next_n: a cut line at a position on the sorted queue, the rows on the far side fade, all at once.
      if (cutName) {
        await api.focus(union(st[sortedAt].area, st[sortedAt + 1].area));
        if (!live()) return;
        const cut = async (id, b, text, list, fate) => {
          const r = step(id);
          r.state = 'is-active';
          show();
          const c = { b, a: 0 };
          Q.cuts.push(c);
          await api.tween(420, (x) => (c.a = api.ease(x)));
          if (!live()) return false;
          const p = cutAt(Q, b);
          if (p) api.tags.push({ at: [p.x, p.y - Q.hw - 3, api.Z0], text, on: true, dx: 22, dy: -20 });
          list.forEach(({ t }) => (S.info.get(t.key).fate = fate));
          await api.tween(520, (x) => {
            const e = api.ease(x);
            list.forEach(({ t }) => {
              t.dim = e;
              Q.labels[queued.findIndex((q2) => q2.t === t)].a = 1 - 0.65 * e;
            });
          });
          if (!live()) return false;
          r.count = list.length ? `−${list.length}` : 0;
          r.state = 'is-done';
          show();
          await api.wait(200);
          return live();
        };
        if (an.offset && !(await cut('offset', an.from, `OFFSET ${an.offset}`, queued.slice(0, an.from), `skipped by OFFSET ${an.offset}`))) return;
        if (!(await cut('limit', an.to, `LIMIT ${an.limit}`, queued.slice(an.to), `past the LIMIT ${an.limit} cut`))) return;

        // The kept positions fly on, in order, and are numbered again from 1.
        const keep = queued.slice(an.from, an.to);
        const Q2 = { ...queueSpots(api, sample, kept, reg.get('cut').area), labels: keep.map((_, i) => ({ text: String(i + 1), a: 0 })), ties: an.ties.slice(an.from, an.to), tieA: Q.tieA, cuts: [] };
        S.queues.push(Q2);
        last = keep.map(({ t }, i) => {
          const c = api.copy(t, { region: 'cut', key: `c${i}~${t.values[0]}`, hidden: true, lit: lit0, dim: 0 });
          S.info.set(c.key, { pos: i + 1, stage: cutName, tie: Q2.ties[i] || Q2.ties[i - 1] });
          return { t: c, from: at(t), to: Q2.spots[i] };
        });
        const total2 = FLY + STEP * Math.max(0, kept - 1);
        await fly(last, total2, STEP, (i, p) => (Q2.labels[i].a = clamp01((p - 0.8) / 0.2)));
        if (!live()) return;
        S.tag.cut = [countTag(cutName, kept), true];
        api.invalidate();
      }

      // SELECT keeps only the columns it names: the other cells of the last stage fade.
      if (an.pick && last.length) {
        const drop = COLS.filter((c) => !an.pick.includes(c));
        await api.tween(320, (x) => last.forEach(({ t }) => drop.forEach((c) => (t.fade[c] = api.ease(x)))));
        if (!live()) return;
      }

      fin.state = 'is-done';
      fin.count = kept;
      const lastName = cutName ?? 'sorted';
      fin.text = kept ? `${lastName}, the result: ${kept} row${kept === 1 ? '' : 's'}, in this order` : 'the empty sequence ⟨ ⟩';
      show();
      api.invalidate();
      await api.wait(500);
      if (!live()) return;
      await api.overview();
    },
  },
};
