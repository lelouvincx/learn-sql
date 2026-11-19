// Lesson 5, Stacks: GROUP BY, COUNT and SUM, drawn as a pipeline of stages.
//
// Every query is read as stages, the way a chain of CTEs reads: each stage is
// a set of rows, made from the stage before it. The board lays them out left
// to right and the camera pans along:
//   1 · pets       the table as stored
//   2 · filtered   only with WHERE: the rows that pass
//   · stacks       one pile per group, each on a plate of its group's colour,
//                  with a tag that carries its aggregates (COUNT, SUM, …)
//   · summary      one row per stack: the group key and the aggregates
//   · kept         only with HAVING: the summary rows that pass
// SQL has no CTE of its own for the stacks: GROUP BY makes them and sums them
// up in one step. The query card still numbers them, as a comment line.
import { SET_PALS, table } from '../data.js';
import { clean, countTag, cteCard, esc, placeStages, plural, sameRows, setChip, sqlComment as com, sqlHtml, union } from './common.js';

const PETS = table('pets');
const COLS = PETS.cols.map((c) => c.name);
const X = { x0: 0, x1: 172 }; // every region's extent along x: rows lie in lanes along it
const X_LEN = X.x1 - X.x0;
const AGG = /^(count|sum|avg|min|max)\s*\(\s*(distinct\s+)?(\*|[a-z_]+)\s*\)$/i;
const AGG_G = /\b(count|sum|avg|min|max)\s*\(\s*(distinct\s+)?(\*|[a-z_]\w*)\s*\)/gi;
const ROW_H = { bar: 4.5, card: 1.4 };
const PITCH = { bar: 5.4, card: 2.5 }; // the rise from one row of a stack to the next
const STEP = { x: 1.2, y: 1.6 }; // each row of a stack sits a little along +x and -y from the one under it
const PLATE_PAD = 2.4;

// Splits at top-level commas, so COUNT(DISTINCT a, b) or 'a,b' stay whole.
function splitList(s) {
  const out = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") inStr = !inStr;
    if (inStr) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out;
}

const colName = (s) => COLS.find((c) => c === s.trim().toLowerCase()) ?? null;
// An aggregate call in one spelling, e.g. "sum(age)" or "count(distinct species)".
const normAgg = (fn, distinct, col) => `${fn.toLowerCase()}(${distinct ? 'distinct ' : ''}${col.toLowerCase()})`;
// The name a summary column gets when the learner gave none: COUNT(*) -> count_rows, SUM(age) -> sum_age.
const aggAlias = (fn, distinct, col) => `${fn.toLowerCase()}_${distinct ? 'distinct_' : ''}${col === '*' ? 'rows' : col.toLowerCase()}`;

// SELECT … FROM pets [WHERE …] [GROUP BY a[, b]] [HAVING …] [ORDER BY …], or null.
function parse(sql) {
  const m = clean(sql).match(/^select\s+(.+?)\s+from\s+pets(?:\s+where\s+(.+?))?(?:\s+group\s+by\s+(.+?))?(?:\s+having\s+(.+?))?(?:\s+(order\s+by\s+.+?))?$/i);
  if (!m) return null;
  const [, list, where = null, group = null, having = null, tail = null] = m;
  const groupCols = group ? splitList(group).map(colName) : [];
  if (groupCols.some((c) => !c) || groupCols.length > 2) return null;
  const items = splitList(list).map((raw) => {
    const am = raw.match(/^(.+?)\s+(?:as\s+)?([a-z_]\w*)$/i);
    const expr = (am ? am[1] : raw).trim();
    const alias = am ? am[2] : null;
    const agg = expr.match(AGG);
    if (agg) {
      const col = agg[3] === '*' ? '*' : colName(agg[3]);
      if (!col || (col === '*' && agg[1].toLowerCase() !== 'count')) return null;
      return { expr, alias, agg: true, norm: normAgg(agg[1], agg[2], col), auto: aggAlias(agg[1], agg[2], col) };
    }
    const c = colName(expr);
    return c && groupCols.includes(c) ? { expr, alias, agg: false, col: c } : null;
  });
  if (items.some((i) => !i)) return null;
  if (!groupCols.length && (!items.some((i) => i.agg) || items.some((i) => !i.agg))) return null;
  return { list, where, groupCols, having, tail, items };
}

// Rewrites text outside string literals.
const outsideStrings = (text, fn) =>
  text
    .split(/('(?:[^']|'')*')/)
    .map((part, i) => (i % 2 ? part : fn(part)))
    .join('');

// ---------- the query as stages ----------
// The summary stage's select list, and the last line that reads it. Without HAVING or ORDER BY the summary
// is the learner's select list as written. Otherwise every aggregate gets a name, so the last line can
// refer to it: HAVING COUNT(*) >= 3 becomes WHERE count_rows >= 3 on the summary rows.
function planOf(p) {
  const named = !!(p.having || p.tail);
  if (!named) {
    const sel = p.items.map((it) => (it.alias ? `${it.expr} AS ${it.alias}` : it.expr));
    return { sum: { select: sel.join(', '), names: p.items.map((it) => it.alias ?? it.expr), agg: p.items.map((it) => it.agg) }, last: { select: '*', where: null, tail: null } };
  }
  const cols = []; // { sql, name, agg, norm? }
  const has = (name) => cols.some((c) => c.name.toLowerCase() === name.toLowerCase());
  const learner = [];
  // a later stage can only filter on the key if the summary keeps it
  if (p.having) for (const g of p.groupCols) if (!p.items.some((it) => !it.agg && (it.alias ?? it.col) === g)) cols.push({ sql: g, name: g, agg: false });
  for (const it of p.items) {
    const name = it.agg ? it.alias ?? it.auto : it.alias ?? it.col;
    if (!has(name)) cols.push({ sql: it.agg || it.alias ? `${it.expr} AS ${name}` : it.expr, name, agg: it.agg, norm: it.norm });
    learner.push(name);
  }
  // HAVING and ORDER BY may use an aggregate the learner doesn't select: the summary computes it too
  const rw = (text) =>
    text &&
    outsideStrings(text, (part) =>
      part.replace(AGG_G, (m, fn, distinct, col) => {
        const norm = normAgg(fn, distinct, col);
        let c = cols.find((x) => x.norm === norm);
        if (!c) {
          const name = aggAlias(fn, distinct, col);
          c = { sql: `${m} AS ${name}`, name, agg: true, norm };
          cols.push(c);
        }
        return c.name;
      }),
    );
  const where = rw(p.having);
  const tail = rw(p.tail);
  const star = learner.length === cols.length && learner.every((n, i) => n === cols[i].name);
  return {
    sum: { select: cols.map((c) => c.sql).join(', '), names: cols.map((c) => c.name), agg: cols.map((c) => c.agg) },
    last: { select: star ? '*' : learner.join(', '), where, tail },
  };
}

// The stage numbers: 1 · pets, [2 · filtered], then stacks, summary and [kept].
const stageNames = (p) => ['pets', ...(p.where ? ['filtered'] : []), 'stacks', 'summary', ...(p.having ? ['kept'] : [])];
const SLOT = (p) => ({ where: 0, group: p.where ? 1 : 0, having: (p.where ? 1 : 0) + 1 });

function cteHtml(p, plan) {
  const no = Object.fromEntries(stageNames(p).map((n, i) => [n, i + 1]));
  const slot = SLOT(p);
  const g = p.groupCols;
  const lines = [com('1 · pets: as stored')];
  let open = 'WITH ';
  if (p.where) {
    lines.push(`${sqlHtml('WITH filtered AS (')}  ${com(`${no.filtered} · filtered`)}`);
    lines.push(`  ${sqlHtml('SELECT * FROM pets')}`);
    lines.push(`  ${sqlHtml('WHERE')} ${setChip(slot.where, esc(p.where))}`);
    lines.push('),');
    open = '';
  }
  const how = g.length ? 'GROUP BY makes the stacks and sums them up in one step' : 'no GROUP BY, so every row is on one stack, summed up in one step';
  lines.push(com(`${no.stacks} · stacks: no CTE of its own. ${how}`));
  lines.push(`${sqlHtml(`${open}summary AS (`)}  ${com(`${no.summary} · summary`)}`);
  lines.push(`  ${sqlHtml(`SELECT ${plan.sum.select}`)}`);
  lines.push(`  ${sqlHtml(`FROM ${p.where ? 'filtered' : 'pets'}`)}`);
  if (g.length) lines.push(`  ${sqlHtml('GROUP BY')} ${setChip(slot.group, esc(g.join(', ')))}`);
  lines.push(')');
  const L = plan.last;
  lines.push(`${sqlHtml(`SELECT ${L.select} FROM summary`)}${p.having ? `  ${com(`${no.kept} · kept`)}` : ''}`);
  if (L.where) lines.push(`${sqlHtml('WHERE')} ${setChip(slot.having, esc(L.where))}`);
  if (L.tail) lines.push(sqlHtml(L.tail));
  lines[lines.length - 1] += ';';
  return cteCard(lines);
}

const fmt = (v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(2)) : v);
const keyText = (vals) => vals.map((v) => (v == null ? 'NULL' : String(v))).join(' · ');
const cmp = (a, b) => (a === b ? 0 : a == null ? -1 : b == null ? 1 : a < b ? -1 : 1);
const petById = new Map(PETS.data.map((v) => [v[0], v]));
// The columns of pets a condition reads, to light them.
const colsIn = (text) => new Set(COLS.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(text.replace(/'[^']*'/g, ''))));

// A stack's tag: its key and its aggregates' values (the legend names them), or every name for a lone stack.
function tagText(key, values, names, lone) {
  const aggs = values.map((v, i) => `${lone ? `${names[i]} = ` : ''}${fmt(v) ?? 'NULL'}`).join(' · ');
  return [keyText(key), aggs].filter(Boolean).join(': ');
}
// The room a stack's tag takes on the board, past the stack's -y end (core.js tag(): ≈ 5.33 per letter + 12.9).
const tagRoom = (texts) => Math.max(0, ...texts.map((t) => t.length * 5.33 + 12.9 + 10));

// ---------- the run's state, cleared before every run ----------
let S = null;
const fresh = () => ({ an: null, on: false, filtered: null, stacks: [], nStacks: null, summary: null, kept: null });
S = fresh();
let A = null; // the engine api, kept for sizes

// The stacks stage: n stacks of up to `depth` rows, an even grid in lanes along x.
function stackGrid(api, n, depth) {
  const [hd, hw] = api.half(A.sample);
  const px = 2 * hd + 2 * PLATE_PAD + STEP.x * (depth - 1) + 6;
  const per = Math.max(1, Math.floor((X_LEN - 6) / px));
  const lanes = Math.ceil(Math.max(1, n) / per);
  const lw = 2 * hw + 2 * PLATE_PAD + STEP.y * (depth - 1) + 8;
  return { hd, hw, per, lanes, lw, depth, width: lanes * lw + 4 };
}
function stackSpots(a, G, n) {
  return Array.from({ length: n }, (_, i) => {
    const li = Math.floor(i / G.per);
    const k = Math.min(G.per, n - li * G.per);
    const j = i % G.per;
    return { x: a.x0 + 3 + ((X_LEN - 6) / k) * (j + 0.5) - (STEP.x * (G.depth - 1)) / 2, y: a.y1 - 2 - li * G.lw - PLATE_PAD - G.hw - 2 };
  });
}

// Stages left to right (toward -y), one region each. w: the width of each region, null for an unused stage.
function place(api, w) {
  return placeStages(api, X, [
    { name: 'pets', note: 'as stored', regions: [['pets', w.pets]] },
    ...(w.filtered != null ? [{ name: 'filtered', note: 'WHERE: the rows that pass', regions: [['filtered', w.filtered]] }] : []),
    { name: 'stacks', note: 'GROUP BY: one stack per group', regions: [['stacks', w.stacks]] },
    { name: 'summary', note: 'one row per stack', regions: [['summary', w.summary]] },
    ...(w.kept != null ? [{ name: 'kept', note: 'HAVING: the rows that pass', regions: [['kept', w.kept]] }] : []),
  ]);
}

// The starter's stages, before any run: 4 species stacks, the largest of 5 rows, tags such as "rabbit: 2", and 4 summary rows.
function placeStarter(api) {
  const counts = new Map();
  PETS.data.forEach((v) => counts.set(v[2], (counts.get(v[2]) ?? 0) + 1));
  const rows = [...counts].map(([k, n]) => [k, n]);
  return place(api, {
    pets: A.petsW,
    stacks: stackGrid(api, rows.length, Math.max(...counts.values())).width + tagRoom(rows.map(([k, n]) => tagText([k], [n], [], false))),
    summary: api.band(api.measure(['species', 'COUNT(*)'], rows), rows.length, X_LEN),
  });
}

export default {
  n: 5,
  title: 'Stacks',
  topic: 'GROUP BY · COUNT · SUM',
  starter: `SELECT species, COUNT(*)
FROM pets
GROUP BY species;`,
  challengeStarter: `SELECT 
FROM pets
GROUP BY `,

  overview: () => `
    <h3>Stacks</h3>
    <p>Read the query as <b>stages</b>, left to right on the grid. <b>1</b>, the 12 pets. Then <b>stacks</b>: <code>GROUP BY species</code> puts every row with the same species on the same stack, all at the same moment. Each row lands on exactly one stack, and together the stacks hold every row: a <b>partition</b> of the set.</p>
    <p>Each stack gets its <b>aggregates</b> on a tag: <code>COUNT(*)</code> counts its rows, <code>SUM(age)</code> adds up their ages. Then <b>summary</b>: each stack becomes <b>one row</b>, the group key and those numbers. Twelve pets in, four rows out. A <code>WHERE</code> adds a stage before the stacks, a <code>HAVING</code> one after the summary.</p>
    <ul class="facts">
      <li><span class="ic">COUNT(*)</span><span>How many rows lie on the stack</span></li>
      <li><span class="ic">SUM(age)</span><span>Add up a column over the stack, e.g. the total age per species</span></li>
      <li><span class="ic">HAVING</span><span>Keep only the summary rows that pass, like <code>WHERE</code> for whole stacks</span></li>
      <li><span class="ic">WITH</span><span>Each stage is a CTE. The query card writes your query that way, with the stage numbers</span></li>
    </ul>`,
  notation: () => `
    <h3>SQL as set notation</h3>
    <p><code>GROUP BY</code> splits a set into disjoint blocks whose union is the whole set. Mathematicians call it a <b>partition</b>. Each line is one stage:</p>
    <table class="mapping"><thead><tr><th>Stage</th><th>SQL</th><th>Set notation</th></tr></thead><tbody>
      <tr><td>filtered</td><td>WHERE w</td><td>σ<sub>w</sub>(pets)</td></tr>
      <tr><td>stacks</td><td>GROUP BY species</td><td>pets = B<sub>cat</sub> ∪ B<sub>dog</sub> ∪ …, B<sub>cat</sub> ∩ B<sub>dog</sub> = ∅</td></tr>
      <tr><td>stacks</td><td>COUNT(*)</td><td>|B<sub>cat</sub>|, the size of a block</td></tr>
      <tr><td>stacks</td><td>SUM(age)</td><td>Σ<sub>p ∈ B<sub>cat</sub></sub> p.age</td></tr>
      <tr><td>summary</td><td>one row per block</td><td>{ (k, |B<sub>k</sub>|) | each block B<sub>k</sub> }</td></tr>
      <tr><td>kept</td><td>HAVING COUNT(*) &gt; 2</td><td>σ<sub>count &gt; 2</sub>(summary)</td></tr>
    </tbody></table>
    <p>σ (sigma) means “the rows where …”. <code>WHERE</code> picks rows before the stacks form; <code>HAVING</code> picks summary rows after. With no <code>GROUP BY</code>, the whole set is one block.</p>`,

  formula(sql) {
    const p = parse(sql);
    if (!p) return '<span class="card">Write a <code>SELECT … FROM pets GROUP BY …</code> query to see it as stages.</span>';
    return cteHtml(p, planOf(p));
  },

  // Runs every stage of the plan on the live database, each summary row with the ids of its stack, and
  // checks that the last stage returns exactly the learner's rows. Any mismatch keeps the grid calm.
  analyze(db, sql, result) {
    const p = parse(sql);
    if (!p) return null;
    const plan = planOf(p);
    const exec = (text) => db.exec(text)[0] ?? { columns: [], values: [] };
    const withF = p.where ? `filtered AS (SELECT * FROM pets WHERE ${p.where}), ` : '';
    const sumSql = `summary AS (SELECT ${plan.sum.select}, group_concat(id) AS __ids FROM ${p.where ? 'filtered' : 'pets'}${p.groupCols.length ? ` GROUP BY ${p.groupCols.join(', ')}` : ''})`;
    const head = `WITH ${withF}${sumSql}`;
    const L = plan.last;
    const ids = (v) => (v == null ? [] : String(v).split(',').map(Number));
    const sum = exec(`${head} SELECT * FROM summary`);
    const last = exec(`${head} SELECT ${L.select === '*' ? '*' : `${L.select}, __ids`} FROM summary${L.where ? ` WHERE ${L.where}` : ''}${L.tail ? ` ${L.tail}` : ''}`);
    // as multisets even with ORDER BY: groups that tie on the sort key may come out in either order
    if (!sameRows(last.values.map((v) => v.slice(0, -1)), result.rows)) return null;
    const keyOf = (list) => (list.length ? p.groupCols.map((c) => petById.get(list[0])[COLS.indexOf(c)]) : p.groupCols.map(() => null));
    const stacks = sum.values
      .map((v) => {
        const m = ids(v.at(-1));
        return { ids: m, key: keyOf(m), values: v.slice(0, -1), tag: String(v.at(-1)) };
      })
      .sort((a, b) => a.key.reduce((r, k, i) => r || cmp(k, b.key[i]), 0));
    const keptTags = new Set(last.values.map((v) => String(v.at(-1))));
    stacks.forEach((s) => (s.pass = keptTags.has(s.tag)));
    const filtered = p.where ? exec(`SELECT * FROM pets WHERE ${p.where}`).values.map((v) => v[0]) : null;
    return {
      p,
      plan,
      filtered,
      stacks,
      sumCols: sum.columns.slice(0, -1),
      kept: p.having ? { cols: last.columns.slice(0, -1), rows: last.values.map((v) => ({ tag: String(v.at(-1)), values: v.slice(0, -1) })) } : null,
    };
  },

  challenges: [
    {
      title: 'Pets per owner',
      prompt: 'Count how many pets each owner has. Return owner_id and the count, one row per owner_id.',
      hint: 'Make one stack per <code>owner_id</code>, then <code>COUNT(*)</code> each stack. The three strays have no owner: their <code>NULL</code>s land on one stack of their own.',
      answer: 'SELECT owner_id, COUNT(*) FROM pets GROUP BY owner_id',
    },
    {
      title: 'Total age',
      prompt: 'The vet bills by the year of age. Get the total age of the pets of each species. Return species and the total.',
      hint: 'Stack the pets by species as in the starter, but tag each stack with <code>SUM(age)</code> instead of <code>COUNT(*)</code>: it adds up the ages on the stack.',
      answer: 'SELECT species, SUM(age) FROM pets GROUP BY species',
    },
    {
      title: 'Big groups',
      prompt: 'Which species have at least 3 pets? Return species and the count, only for those species.',
      hint: '<code>WHERE</code> picks rows before the stacks form, so it can’t see the count. Put the condition on the stacks with <code>HAVING COUNT(*) &gt;= 3</code> after <code>GROUP BY</code>.',
      answer: 'SELECT species, COUNT(*) FROM pets GROUP BY species HAVING COUNT(*) >= 3',
    },
  ],

  scene: {
    board: { x0: -36, x1: 196, y0: -380, y1: 16 },

    setup(api) {
      A = api;
      A.pw = api.measure(COLS, PETS.data);
      A.sample = { cols: COLS, widths: A.pw };
      A.petsW = api.band(A.pw, PETS.data.length, X_LEN);
      const zero = { ...X, y0: 0, y1: 0 };
      api.region({ id: 'pets', area: zero, title: 'PETS', header: { cols: COLS, widths: A.pw }, tag: () => [`PETS: ${plural(PETS.data.length, 'ROW')}`, S.on] });
      api.region({ id: 'filtered', area: zero, title: 'FILTERED', hidden: true, scatter: false, header: { cols: COLS, widths: A.pw }, tag: () => [countTag('filtered', S.filtered), S.filtered != null] });
      api.region({ id: 'stacks', area: zero, title: 'STACKS', scatter: false, tag: () => [S.nStacks == null ? 'STACKS' : `STACKS: ${plural(S.nStacks, 'STACK')}`, S.nStacks != null] });
      api.region({ id: 'summary', area: zero, title: 'SUMMARY', scatter: false, tag: () => [countTag('summary', S.summary), S.summary != null && !S.an?.kept] });
      api.region({ id: 'kept', area: zero, title: 'KEPT', hidden: true, scatter: false, tag: () => [countTag('kept', S.kept), S.kept != null] });
      PETS.data.forEach((values) => api.row({ key: `p${values[0]}`, cols: COLS, values, widths: A.pw, region: 'pets' }));
      placeStarter(api);
    },

    // Back to the starter's stages, with empty stacks and summary.
    reset(api) {
      S = fresh();
      if (!A?.petsW) return;
      for (const r of api.regions) if (r.id === 'summary' || r.id === 'kept') r.header = null;
      placeStarter(api);
    },

    // The stack plates: one coloured slab under each pile, drawn over the rows' shadows and under every row.
    // A plate has no box but a depth point far below the board: with a box, the engine's pairwise sort can
    // put a plate, wider than its pile, over its own rows once other rows are on the board.
    draw(api) {
      const list = S.stacks
        .filter((s) => s.plate > 0.01)
        .map((s) => {
          const [hd, hw] = s.half;
          const d = Math.max(0, s.rows.length - 1);
          const x0 = s.x - (hd + PLATE_PAD) * s.plate;
          const x1 = s.x + (hd + PLATE_PAD) * s.plate + STEP.x * d;
          const y0 = s.y - (hw + PLATE_PAD) * (0.6 + 0.4 * s.plate) - STEP.y * d;
          const y1 = s.y + (hw + PLATE_PAD) * (0.6 + 0.4 * s.plate);
          const z1 = api.Z0 + api.PLATE_H * s.plate;
          const op = s.dim ? ` opacity="${(1 - 0.68 * s.dim).toFixed(2)}"` : '';
          return { svg: `<g${op}>${box(x0, y0, api.Z0, x1, y1, z1, SET_PALS[s.slot % SET_PALS.length], tone, 0.9)}</g>`, at: [s.x, s.y, api.Z0 - 1000] };
        });
      return { parts: list };
    },

    tip(t) {
      const s = S.stacks.find((st) => st.rows.includes(t) || st.summary === t);
      const vals = t.cols.map((c, i) => `${esc(c)} ${esc(t.values[i] ?? 'NULL')}`).join(' · ');
      return `<b>${esc(t.values[1] ?? t.values[0])}</b>${vals}${s ? `<br>stack ${esc(keyText(s.key) || 'all rows')}: ${plural(s.rows.length, 'row').toLowerCase()}` : ''}`;
    },

    async play(result, api, live) {
      const an = result.analysis;
      if (!an) return;
      S.an = an;
      const p = an.p;
      const g = p.groupCols;
      const slot = SLOT(p);
      const reg = new Map(api.regions.map((r) => [r.id, r]));
      const sumRows = an.stacks.map((s) => s.values.map(fmt));
      const wSum = api.measure(an.sumCols, sumRows);
      const keptRows = an.kept?.rows.map((r) => r.values.map(fmt));
      const wKept = an.kept && api.measure(an.kept.cols, keptRows);
      const G = stackGrid(api, an.stacks.length, Math.max(1, ...an.stacks.map((s) => s.ids.length)));
      const aggIdx = an.plan.sum.agg.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
      const lone = an.stacks.length === 1;
      const tags = an.stacks.map((s) => tagText(s.key, aggIdx.map((i) => s.values[i]), aggIdx.map((i) => an.sumCols[i]), lone));
      const band = (w, n) => api.band(w, Math.max(1, n), X_LEN);
      const st = place(api, {
        pets: A.petsW,
        filtered: an.filtered ? band(A.pw, an.filtered.length) : null,
        stacks: G.width + tagRoom(tags),
        summary: band(wSum, an.stacks.length),
        kept: an.kept ? band(wKept, an.kept.rows.length) : null,
      });
      const at = Object.fromEntries(stageNames(p).map((n, i) => [n, st[i]]));
      const no = Object.fromEntries(stageNames(p).map((n, i) => [n, i + 1]));

      // the legend: one line per step, with the stages it goes between
      const aggNames = an.sumCols.filter((_, i) => an.plan.sum.agg[i]);
      const legend = [
        ...(p.where ? [{ key: 'where', slot: slot.where, code: `WHERE ${p.where}`, note: `stage 1 → 2: the rows that pass` }] : []),
        { key: 'group', slot: slot.group, code: g.length ? `GROUP BY ${g.join(', ')}` : 'no GROUP BY', note: `stage ${no.stacks - 1} → ${no.stacks}: ${g.length ? 'one stack per value' : 'one stack of every row'}` },
        ...(aggNames.length ? [{ key: 'agg', slot: slot.group, code: aggNames.join(', '), note: 'its values, in this order, on each stack’s tag' }] : []),
        ...(p.having ? [{ key: 'having', slot: slot.having, code: `HAVING ${p.having}`, note: `stage ${no.summary} → ${no.kept}: the summary rows that pass` }] : []),
      ].map((r) => ({ ...r, count: '', state: 'is-pending' }));
      const fin = { final: true, text: '', count: '', state: 'is-pending' };
      const show = () => api.legend([...legend, fin]);
      const step = (key, count) => {
        legend.forEach((r) => r.state === 'is-active' && (r.state = 'is-done'));
        const r = legend.find((x) => x.key === key);
        if (r) Object.assign(r, { state: 'is-active', count });
        show();
      };
      const settle = () => {
        legend.forEach((r) => r.state === 'is-active' && (r.state = 'is-done'));
        show();
      };
      show();

      // A flight of temp rows: each from where it is to its target, arcing up, all at the same moment.
      const fly = (legs, ms = 900, arc = 30) =>
        api.tween(ms, (x) => {
          const e = api.ease(x);
          legs.forEach(({ c, from, to, plate }) => {
            Object.assign(c, { x: api.lerp(from[0], to[0], e), y: api.lerp(from[1], to[1], e), z: api.lerp(from[2], to[2] ?? api.Z0, e) + Math.sin(Math.PI * e) * arc });
            if (plate != null) c.plates[plate] = e;
          });
        });

      // stage 1: pets as stored
      await api.focus(at.pets.area);
      if (!live()) return;
      S.on = true;
      api.invalidate();
      const pets = api.rows.filter((t) => t.region === 'pets' && !t.temp);
      let source = pets; // the rows the stacks are made from: pets, or the filtered copies
      let srcId = 'pets';

      // stage 2 (WHERE): the rows that pass are copied onto their own board
      if (p.where) {
        await api.wait(250);
        await api.focus(union(at.pets.area, at.filtered.area));
        if (!live()) return;
        step('where', an.filtered.length);
        await api.flash('pets', slot.where, colsIn(p.where));
        if (!live()) return;
        const pass = new Set(an.filtered);
        const kept = pets.filter((t) => pass.has(t.values[0]));
        await Promise.all([api.tween(520, (x) => pets.forEach((t) => (pass.has(t.values[0]) ? (t.lift = 5 * api.ease(x)) : (t.dim = api.ease(x))))), api.unflash('pets')]);
        if (!live()) return;
        const spots = kept.length ? api.slots('filtered', A.sample, kept.length) : [];
        const legs = kept.map((t, i) => {
          const z = api.bodyZ(t);
          return { c: api.copy(t, { region: 'filtered', key: `f${t.values[0]}` }), from: [t.x, t.y, z], to: spots[i] };
        });
        await fly(legs);
        if (!live()) return;
        S.filtered = kept.length;
        settle();
        source = legs.map((l) => l.c);
        srcId = 'filtered';
        await api.wait(300);
        if (!live()) return;
      }

      // stacks: every row gets its group's colour at once, then a copy of it flies onto its group's stack
      await api.focus(union((at.filtered ?? at.pets).area, at.stacks.area));
      if (!live()) return;
      step('group', an.stacks.length);
      const byId = new Map(source.map((t) => [t.values[0], t]));
      const spots = stackSpots(reg.get('stacks').area, G, an.stacks.length);
      S.stacks = an.stacks.map((s, k) => ({
        ...s,
        slot: k % SET_PALS.length,
        x: spots[k].x,
        y: spots[k].y,
        half: [G.hd, G.hw],
        members: s.ids.map((id) => byId.get(id)).filter(Boolean),
        rows: [],
        plate: 0,
        dim: 0,
        summary: null,
      }));
      if (g.length) await api.flash(srcId, slot.group, new Set(g));
      if (!live()) return;
      await Promise.all([...S.stacks.map((s) => api.popPlates(s.members, s.slot)), g.length ? api.unflash(srcId) : api.wait(1)]);
      if (!live()) return;
      await api.tween(320, (x) => S.stacks.forEach((s) => (s.plate = api.ease(x))));
      if (!live()) return;
      const pitch = PITCH[api.shape];
      const legs = S.stacks.flatMap((s) =>
        s.members.map((t, i) => {
          const z = api.bodyZ(t);
          const c = api.copy(t, { region: 'stacks', key: `s${t.values[0]}` });
          s.rows.push(c);
          return { c, from: [t.x, t.y, z], to: [s.x + STEP.x * i, s.y - STEP.y * i, api.Z0 + api.PLATE_H + pitch * i] };
        }),
      );
      await fly(legs);
      if (!live()) return;
      S.nStacks = S.stacks.length;
      api.invalidate();
      await api.wait(300);
      if (!live()) return;

      // the aggregates: a tag on every stack at once, pinned to the stack's -y end, the pill just past it
      const topOf = (s) => api.Z0 + api.PLATE_H + pitch * Math.max(0, s.rows.length - 1) + ROW_H[api.shape];
      const tagZ = Math.max(...S.stacks.map(topOf));
      const tagOf = (s, k) => {
        const d = Math.max(0, s.rows.length - 1);
        const text = tags[k];
        // every tag at the height of the tallest stack: their spacing on screen is the stacks' spacing
        return { at: [s.x + STEP.x * d, s.y - s.half[1] - STEP.y * d, tagZ], text, on: true, dx: (text.length * 5.33 + 12.9) / 2 + 8, dy: -6, s };
      };
      if (aggNames.length) step('agg', S.stacks.length);
      api.tags.push(...S.stacks.map(tagOf));
      api.invalidate();
      await api.wait(700);
      if (!live()) return;
      settle();

      // summary: every stack sends one row, its key and aggregates, onto the next board, at the same moment
      await api.focus(union(at.stacks.area, at.summary.area));
      if (!live()) return;
      reg.get('summary').header = { cols: an.sumCols, widths: wSum };
      const sample = { cols: an.sumCols, widths: wSum };
      const sumSpots = S.stacks.length ? api.slots('summary', sample, S.stacks.length) : [];
      const sumLegs = S.stacks.map((s, k) => {
        const c = api.row({ key: `g${k}`, cols: an.sumCols, values: sumRows[k], widths: wSum, region: 'summary', x: s.x, y: s.y, z: topOf(s), temp: true });
        c.stack = [s.slot];
        c.plates = { [s.slot]: 0 };
        s.summary = c;
        return { c, from: [c.x, c.y, c.z], to: sumSpots[k], plate: s.slot };
      });
      await fly(sumLegs, 900, 40);
      if (!live()) return;
      S.summary = S.stacks.length;
      fin.text = an.kept ? `stage ${no.summary}, summary: one row per stack` : 'The result: one row per stack';
      fin.count = S.stacks.length;
      fin.state = an.kept ? 'is-pending' : 'is-done';
      show();
      api.invalidate();

      // kept (HAVING): the summary rows that pass are copied on; the stacks behind the others dim
      if (an.kept) {
        await api.wait(300);
        await api.focus(union(at.summary.area, at.kept.area));
        if (!live()) return;
        step('having', an.kept.rows.length);
        const lit = new Set(an.sumCols.filter((c) => new RegExp(`(^|[^\\w])${c.replace(/[()*]/g, '\\$&')}($|[^\\w])`, 'i').test(an.plan.last.where)));
        await api.flash('summary', slot.having, lit);
        if (!live()) return;
        const fail = S.stacks.filter((s) => !s.pass);
        api.tags.forEach((tg) => (tg.on = tg.s.pass));
        await Promise.all([
          api.tween(520, (x) => {
            const e = api.ease(x);
            S.stacks.forEach((s) => (s.pass ? (s.summary.lift = 5 * e) : (s.summary.dim = e)));
            fail.forEach((s) => {
              s.dim = e;
              s.rows.forEach((t) => (t.dim = e));
            });
          }),
          api.unflash('summary'),
        ]);
        if (!live()) return;
        const byTag = new Map(S.stacks.map((s) => [s.tag, s]));
        const kSample = { cols: an.kept.cols, widths: wKept };
        const kSpots = an.kept.rows.length ? api.slots('kept', kSample, an.kept.rows.length) : [];
        const kLegs = an.kept.rows.map((r, i) => {
          const s = byTag.get(r.tag);
          const z = api.bodyZ(s.summary);
          const c = api.row({ key: `k${i}`, cols: an.kept.cols, values: keptRows[i], widths: wKept, region: 'kept', x: s.summary.x, y: s.summary.y, z, temp: true });
          c.stack = [s.slot];
          c.plates = { [s.slot]: 1 };
          return { c, from: [c.x, c.y, z], to: kSpots[i] };
        });
        await fly(kLegs);
        if (!live()) return;
        reg.get('kept').header = { cols: an.kept.cols, widths: wKept };
        S.kept = an.kept.rows.length;
        fin.text = `Stage ${no.kept}, the result: the summary rows that pass`;
        fin.count = an.kept.rows.length;
        fin.state = 'is-done';
        settle();
        api.invalidate();
      }
      await api.wait(500);
      if (!live()) return;
      await api.overview();
    },
  },
};
