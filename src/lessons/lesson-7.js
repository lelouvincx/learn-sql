// Lesson 7, Sets in, set out: subqueries and CTEs, drawn as a pipeline of stages.
//
// A query takes sets in and gives a set out, so its result can feed another
// query. Every earlier lesson showed its query as stages written as a WITH
// query; here the learner names the stages. The board lays them out left to
// right and the camera pans along:
//   1 · raw tables   owners and pets, as they are stored
//   2 · the inner set the CTE, by its name (`hanoi`), or `subquery` for an
//                    IN (SELECT …) without a CTE: its rows fly in from stage 1
//   3 · result       for `col IN (…)`: the stage 1 rows whose col is in the
//                    inner set; for `FROM name`: the inner set's rows that pass
// The query card shows the same pipeline as a WITH query, which is checked to
// return the learner's rows.
import { parseQuery } from '../db.js';
import { SET_PALS, table } from '../data.js';
import { clean, countTag, cteCard, esc, placeStages, plural, sameRows, setChip, sqlComment as com, sqlHtml, union } from './common.js';

const PETS = table('pets');
const OWNERS = table('owners');
const SOURCES = { pets: PETS, owners: OWNERS };
const colsOfTable = (name) => SOURCES[name].cols.map((c) => c.name);
const X = { x0: 0, x1: 172 }; // every region's extent along x: rows lie in lanes along it
const SUBQUERY = 'subquery'; // the stage 2 name when the query has no CTE
const ALL_COLS = /\b(id|name|species|age|owner_id|city)\b/gi;

// The columns a condition reads, e.g. "city = 'Hanoi'" reads city.
const colsOf = (text) => new Set(((text ?? '').replace(/'[^']*'/g, '').match(ALL_COLS) ?? []).map((c) => c.toLowerCase()));
const hasSelect = (s) => /\bselect\b/i.test(s.replace(/'[^']*'/g, ''));
const aggregate = (cols) => /^\s*distinct\b/i.test(cols) || /\b(count|sum|avg|min|max|total|group_concat)\s*\(/i.test(cols);
const expand = (cols, all) => (cols.trim() === '*' ? all.join(', ') : cols);
const whereSql = (w) => (w ? ` WHERE ${w}` : '');

// The index of the ')' that closes the '(' at i, skipping quoted text; -1 if none.
function closeParen(s, i) {
  let depth = 0;
  let inStr = false;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === "'") inStr = !inStr;
    if (inStr) continue;
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return j;
  }
  return -1;
}

// A plain `SELECT cols FROM table [WHERE …]`: no nested query, no aggregate, no LIMIT.
function simple(sql, allowOrder = false) {
  const p = parseQuery(sql);
  if (!p || hasSelect(p.columns) || aggregate(p.columns) || (p.where && hasSelect(p.where))) return null;
  if (p.tail && !(allowOrder && /^order\s+by\b/i.test(p.tail) && !/\blimit\b/i.test(p.tail))) return null;
  return p;
}

// The lesson's pattern, or null:
//   in      SELECT … FROM t WHERE col IN (SELECT c FROM source [WHERE …])
//   cte-in  WITH name AS (SELECT … FROM source …) SELECT … FROM t WHERE col IN (SELECT c FROM name [WHERE …])
//   from    WITH name AS (SELECT … FROM source …) SELECT … FROM name [WHERE …]
function parse(sql) {
  let s = clean(sql);
  let cte = null;
  const w = s.match(/^with\s+([A-Za-z_]\w*)\s+as\s*\(/i);
  if (w) {
    if (/^recursive$/i.test(w[1])) return null;
    const open = w[0].length - 1;
    const close = closeParen(s, open);
    if (close < 0) return null;
    const text = s.slice(open + 1, close).trim();
    const body = simple(text);
    if (!body || !SOURCES[body.table.toLowerCase()]) return null;
    cte = { name: w[1], body, text };
    s = s.slice(close + 1).trim();
    if (!/^select\b/i.test(s)) return null;
  }
  const outer = parseQuery(s);
  if (!outer || hasSelect(outer.columns) || aggregate(outer.columns)) return null;
  if (outer.tail && !(/^order\s+by\b/i.test(outer.tail) && !/\blimit\b/i.test(outer.tail))) return null;
  const t = outer.table.toLowerCase();
  if (cte && t === cte.name.toLowerCase()) {
    if (outer.where && hasSelect(outer.where)) return null;
    return { mode: 'from', cte, outer };
  }
  if (!SOURCES[t] || !outer.where) return null;
  const m = outer.where.match(/^((?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*))\s+in\s*\(/i);
  if (!m) return null;
  const open = m[0].length - 1;
  if (closeParen(outer.where, open) !== outer.where.length - 1) return null;
  const subText = outer.where.slice(open + 1, -1).trim();
  const sub = simple(subText);
  if (!sub || !/^[A-Za-z_]\w*$/.test(sub.columns.trim())) return null;
  const st = sub.table.toLowerCase();
  if (cte) return st === cte.name.toLowerCase() ? { mode: 'cte-in', cte, outer, colRef: m[1], col: m[2], sub, subText } : null;
  return SOURCES[st] ? { mode: 'in', outer, colRef: m[1], col: m[2], sub, subText } : null;
}

// ---------- the query as stages ----------
// Stage 2 is the CTE (its name), or the subquery made into a CTE named `subquery`. Its body is the
// CTE's body, or the subquery with its WHERE; the IN test then reads the column from the named set.
function planOf(q) {
  if (q.mode === 'in') {
    const col = q.sub.columns.trim();
    return { name: SUBQUERY, body: q.sub, src: q.sub.table.toLowerCase(), test: `${q.colRef} IN (SELECT ${col} FROM ${SUBQUERY})` };
  }
  const plan = { name: q.cte.name, body: q.cte.body, src: q.cte.body.table.toLowerCase() };
  if (q.mode === 'cte-in') plan.test = `${q.colRef} IN (${q.subText})`;
  return plan;
}
const bodySql = (b) => `SELECT ${b.columns.trim()} FROM ${b.table}${whereSql(b.where)}`;

function cteHtml(q, plan) {
  const b = plan.body;
  const lines = [com('1 · raw tables: owners, pets')];
  lines.push(`${sqlHtml(`WITH ${plan.name} AS (`)}  ${com(`2 · ${plan.name}`)}`);
  lines.push(`  ${sqlHtml(`SELECT ${b.columns.trim()}`)}`);
  lines.push(`  ${sqlHtml(`FROM ${b.table}`)}`);
  if (b.where) lines.push(`  ${sqlHtml('WHERE')} ${setChip(0, esc(b.where))}`);
  lines.push(')');
  lines.push(`${sqlHtml(`SELECT ${q.outer.columns.trim()}`)}  ${com('3 · result')}`);
  lines.push(sqlHtml(`FROM ${q.mode === 'from' ? plan.name : q.outer.table}`));
  const cond = q.mode === 'from' ? q.outer.where : plan.test;
  if (cond) lines.push(`${sqlHtml('WHERE')} ${setChip(1, esc(cond))}`);
  if (q.outer.tail) lines.push(sqlHtml(q.outer.tail));
  lines[lines.length - 1] += ';';
  return cteCard(lines);
}

// ---------- the run's state, cleared before every run ----------
const fresh = () => ({ reading: null, innerCount: null, resultCount: null, innerName: 'hanoi' });
let S = fresh();
let A = null; // the engine api, kept for sizes measured at setup
const shortName = (n) => (n.length > 14 ? `${n.slice(0, 13)}…` : n);

// Where the stages lie: left to right (toward -y), the raw tables side by side in stage 1.
function place(api, wInner, wResult, an = null) {
  const name = an?.name ?? 'hanoi';
  // short notes: a stage's board can be as narrow as one short column
  const note2 = 'run first';
  const note3 = !an || an.test ? `${an?.test.col ?? 'owner_id'} ∈ ${name}` : `FROM ${name}`;
  return placeStages(api, X, [
    { name: 'raw tables', note: 'as stored', regions: [['owners', A.ownersW], ['pets', A.petsW]] },
    { name, note: note2, regions: [['inner', wInner]] },
    { name: 'result', note: note3, regions: [['result', wResult]] },
  ]);
}

export default {
  n: 7,
  title: 'Sets in, set out',
  topic: 'subqueries · CTE',
  starter: `WITH hanoi AS (
  SELECT id FROM owners WHERE city = 'Hanoi'
)
SELECT *
FROM pets
WHERE owner_id IN (SELECT id FROM hanoi);`,
  challengeStarter: `SELECT *
FROM pets
WHERE owner_id IN (
  SELECT id FROM owners WHERE 
);`,

  overview: () => `
    <h3>Sets in, set out</h3>
    <p>You have seen every query as stages, written as a <code>WITH</code> query on the query card. Now name your own. Every query gives a set out, and a set of rows can feed another query, like any table.</p>
    <p><code>WITH hanoi AS (…)</code> gives a stage a <b>name</b>, here <code>hanoi</code>. On the grid it is stage <b>2</b>: the inner query plays first, and its rows fly from the raw tables into a board of their own. Stage <b>3</b> uses that set: with <code>IN (SELECT id FROM hanoi)</code>, every pet whose <code>owner_id</code> is in the set is copied into the result.</p>
    <ul class="facts">
      <li><span class="ic">WITH</span><span>A CTE: give a set a <b>name</b>, then use it like a table</span></li>
      <li><span class="ic">IN (…)</span><span>Keep rows whose value is a <b>member</b> of the inner set ∈. Without a CTE, the inner query is a <b>subquery</b></span></li>
      <li><span class="ic">FROM name</span><span>The CTE is the set the next stage starts from</span></li>
    </ul>`,
  notation: () => `
    <h3>SQL as set notation</h3>
    <p>The inner query is a set S. The next stage keeps the rows that point into S. Each line is one stage:</p>
    <table class="mapping"><thead><tr><th>Stage</th><th>SQL</th><th>Set notation</th></tr></thead><tbody>
      <tr><td>1 · raw tables</td><td>owners, pets</td><td>owners, pets</td></tr>
      <tr><td>2 · hanoi</td><td>WITH hanoi AS (SELECT id FROM owners WHERE city = 'Hanoi')</td><td>hanoi = { o.id | o ∈ owners ∧ o.city = 'Hanoi' }</td></tr>
      <tr><td>3 · result</td><td>SELECT * FROM pets WHERE owner_id IN (SELECT id FROM hanoi)</td><td>{ p ∈ pets | p.owner_id ∈ hanoi }</td></tr>
      <tr><td>3 · result</td><td>SELECT * FROM hanoi WHERE …</td><td>{ h ∈ hanoi | … }</td></tr>
    </tbody></table>
    <p>A subquery, <code>IN (SELECT id FROM owners WHERE …)</code>, is the same stage 2 without a name. A NULL is never a member of any set, so a pet with no owner is never in the result of <code>owner_id IN (…)</code>.</p>`,

  formula(sql) {
    const q = parse(sql);
    if (!q) return '<span class="card">Write a query with <code>IN (SELECT …)</code> or <code>WITH name AS (…)</code> to see it as stages.</span>';
    return cteHtml(q, planOf(q));
  },

  // Runs every stage as a real WITH query, with each row's source id as __k, and checks that the last
  // stage returns exactly the learner's rows. Any mismatch keeps the grid calm.
  analyze(db, sql, result) {
    const q = parse(sql);
    if (!q) return null;
    const plan = planOf(q);
    const ex = (s) => db.exec(s).at(-1) ?? { columns: [], values: [] };
    const spec = plan.body;
    const kSql = `SELECT id AS __k, ${expand(spec.columns, colsOfTable(plan.src))} FROM ${spec.table}${whereSql(spec.where)}`;
    const ir = ex(kSql);
    const inner = { src: plan.src, read: colsOf(spec.where), keys: new Set(ir.values.map((r) => r[0])), cols: ir.columns.slice(1), rows: ir.values, code: bodySql(spec) };
    const an = { mode: q.mode, name: plan.name, inner };
    const ordered = /^order\s+by\b/i.test(q.outer.tail);
    const withK = `WITH ${plan.name} AS (${kSql}) `;

    if (q.mode === 'from') {
      const or = ex(`${withK}SELECT __k, ${expand(q.outer.columns, inner.cols)} FROM ${plan.name}${whereSql(q.outer.where)}${q.outer.tail ? ` ${q.outer.tail}` : ''}`);
      if (!sameRows(or.values.map((r) => r.slice(1)), result.rows, ordered)) return null;
      an.outer = { region: 'inner', where: q.outer.where, read: colsOf(q.outer.where), keys: new Set(or.values.map((r) => r[0])), cols: or.columns.slice(1), rows: or.values, code: q.outer.where ? `WHERE ${q.outer.where}` : `SELECT ${q.outer.columns} FROM ${plan.name}` };
      return an;
    }

    // The IN test: the inner set's rows the subquery reads (its own WHERE on the CTE may drop some), and S.
    const subCol = q.sub.columns.trim();
    const subWhere = q.mode === 'cte-in' ? q.sub.where : null;
    const hits = ex(`${withK}SELECT __k, ${subCol} FROM ${plan.name}${whereSql(subWhere)}`).values;
    const members = hits.filter((r) => r[1] != null);
    const set = [...new Set(members.map((r) => r[1]))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    an.test = { col: q.col.toLowerCase(), subCol: inner.cols.find((c) => c.toLowerCase() === subCol.toLowerCase()) ?? subCol, litKeys: new Set(members.map((r) => r[0])), S: set };
    const t = q.outer.table.toLowerCase();
    const or = ex(`${withK}SELECT id AS __k, ${expand(q.outer.columns, colsOfTable(t))} FROM ${t} WHERE ${plan.test}${q.outer.tail ? ` ${q.outer.tail}` : ''}`);
    if (!sameRows(or.values.map((r) => r.slice(1)), result.rows, ordered)) return null;
    an.outer = { region: t, where: plan.test, read: new Set([an.test.col]), keys: new Set(or.values.map((r) => r[0])), cols: or.columns.slice(1), rows: or.values, code: plan.test };
    return an;
  },

  challenges: [
    {
      title: 'Saigon pets',
      prompt: 'The Saigon clinic wants a list of its patients. Get every pet whose owner lives in Saigon.',
      hint: 'First build the set of Saigon owner ids: <code>SELECT id FROM owners WHERE city = \'Saigon\'</code>. Then keep the pets whose <code>owner_id</code> is <code>IN</code> that set.',
      answer: "SELECT * FROM pets WHERE owner_id IN (SELECT id FROM owners WHERE city = 'Saigon')",
    },
    {
      title: 'Dog owners',
      prompt: 'The dog park sends a flyer to everyone who has a dog. Get every owner (all columns) who owns at least one dog.',
      hint: 'This time the inner set comes from pets and the outer query reads owners: <code>SELECT owner_id FROM pets WHERE species = \'dog\'</code> is the set of dog owners’ ids. Keep the owners whose <code>id</code> is in it.',
      answer: "SELECT * FROM owners WHERE id IN (SELECT owner_id FROM pets WHERE species = 'dog')",
      wrong: 'Not the same set. Each owner should appear once, with the owners columns only. If Bao shows up twice, you joined the tables; <code>IN</code> keeps each owner once.',
    },
    {
      title: 'Young cats',
      prompt: 'Write a CTE named <code>cats</code> that holds every cat, then get the <code>name</code> of each cat in it younger than 3.',
      hint: 'Start with <code>WITH cats AS (SELECT * FROM pets WHERE species = \'cat\')</code>. The outer query then reads <code>FROM cats</code>, like any table, and keeps <code>age &lt; 3</code>.',
      answer: "WITH cats AS (SELECT * FROM pets WHERE species = 'cat') SELECT name FROM cats WHERE age < 3",
    },
  ],

  scene: {
    board: { x0: -36, x1: 196, y0: -400, y1: 16 },

    setup(api) {
      A = api;
      const xLen = X.x1 - X.x0;
      for (const name of ['owners', 'pets']) {
        const t = SOURCES[name];
        const cols = colsOfTable(name);
        const widths = api.measure(cols, t.data);
        A[`${name}W`] = api.band(widths, t.data.length, xLen);
        api.region({ id: name, area: { ...X, y0: 0, y1: 0 }, title: name.toUpperCase(), header: { cols, widths }, tag: () => [`${name.toUpperCase()}: ${plural(t.data.length, 'ROW')}`, S.reading === name] });
        t.data.forEach((values) => api.row({ key: `${name[0]}${values[0]}`, cols, values, widths, region: name }));
      }
      // the starter's sizes: two owner ids in stage 2, a few pets in stage 3
      A.innerW0 = api.band(api.measure(['id'], [[10]]), 2, xLen);
      A.resultW0 = api.band(api.measure(colsOfTable('pets'), PETS.data), 4, xLen);
      api.region({ id: 'inner', area: { ...X, y0: 0, y1: 0 }, title: 'HANOI', tag: () => [countTag(shortName(S.innerName), S.innerCount), !!S.innerCount] });
      api.region({ id: 'result', area: { ...X, y0: 0, y1: 0 }, title: 'RESULT', tag: () => [countTag('result', S.resultCount), !!S.resultCount] });
      place(api, A.innerW0, A.resultW0);
    },

    // Back to the starter's stages, with empty sets.
    reset(api) {
      S = fresh();
      if (!A?.petsW) return;
      const reg = new Map(api.regions.map((r) => [r.id, r]));
      Object.assign(reg.get('inner'), { title: 'HANOI', header: null });
      Object.assign(reg.get('result'), { header: null });
      place(api, A.innerW0, A.resultW0);
    },

    async play(result, api, live) {
      const an = result.analysis;
      if (!an) return;
      const { inner, outer, test } = an;
      const E = api.ease;
      const xLen = X.x1 - X.x0;
      const reg = new Map(api.regions.map((r) => [r.id, r]));
      const innerRegion = reg.get('inner');
      const innerW = api.measure(inner.cols, inner.rows.map((r) => r.slice(1)));
      const outW = api.measure(outer.cols, outer.rows.map((r) => r.slice(1)));
      S.innerName = an.name;
      innerRegion.title = shortName(an.name.toUpperCase());
      const st = place(api, api.band(innerW, Math.max(1, inner.rows.length), xLen), api.band(outW, Math.max(1, outer.rows.length), xLen), an);

      const steps = [
        { slot: 0, code: inner.code, note: 'stage 1 → 2', count: '', state: 'is-pending' },
        { slot: 1, code: outer.code, note: test ? 'stage 1 → 3' : 'stage 2 → 3', count: '', state: 'is-pending' },
      ];
      const fin = { final: true, text: 'Stage 3, the result', count: '', state: 'is-pending' };
      const show = () => api.legend([...steps, fin]);
      show();

      // Rise the kept rows, dim the rest, then fade the cells the projection drops.
      const rise = (kept, rest) =>
        api.tween(520, (x) => {
          kept.forEach((t) => (t.lift = 6 * E(x)));
          rest.forEach((t) => (t.dim = E(x)));
        });
      const fadeOut = (kept, outCols) => {
        const own = kept[0]?.cols.map((c) => c.toLowerCase()) ?? [];
        const out = outCols.map((c) => c.toLowerCase());
        if (!out.every((c) => own.includes(c))) return null;
        const cols = (kept[0]?.cols ?? []).filter((c) => !out.includes(c.toLowerCase()));
        if (!cols.length) return null;
        return api.tween(380, (x) => kept.forEach((t) => cols.forEach((c) => (t.fade[c] = E(x)))));
      };
      // Every copy flies into its stage at the same moment, in an arc.
      const fly = (copies) =>
        api.tween(900, (x) => {
          const e = E(x);
          copies.forEach(({ c, from, to }) => {
            c.x = api.lerp(from[0], to[0], e);
            c.y = api.lerp(from[1], to[1], e);
            c.z = api.lerp(from[2], api.Z0, e) + Math.sin(Math.PI * e) * 30;
          });
        });
      // Copies of `kept` into region `id`, projected to `cols`; rowsByKey gives each copy its values.
      const copyInto = (id, kept, keyOf, cols, widths, rowsByKey) => {
        reg.get(id).header = null;
        const targets = kept.length ? api.slots(id, { cols, widths }, kept.length) : [];
        return kept.map((t, i) => ({
          c: api.copy(t, { region: id, cols, values: rowsByKey.get(keyOf(t)).slice(1), widths, k: keyOf(t) }),
          from: [t.x, t.y, api.bodyZ(t)],
          to: targets[i],
        }));
      };

      // stage 1: the inner query's WHERE lights its source table; the rows that pass get plates and rise
      await api.focus(st[0].area);
      if (!live()) return;
      const srcRows = api.rows.filter((t) => t.region === inner.src && !t.temp);
      const kept1 = srcRows.filter((t) => inner.keys.has(t.values[0]));
      const rest1 = srcRows.filter((t) => !inner.keys.has(t.values[0]));
      steps[0].state = 'is-active';
      show();
      S.reading = inner.src;
      await api.flash(inner.src, 0, inner.read);
      if (!live()) return;
      steps[0].count = kept1.length;
      show();
      await Promise.all([api.popPlates(kept1, 0), api.unflash(inner.src)]);
      if (!live()) return;
      await rise(kept1, rest1);
      if (!live()) return;
      const f1 = fadeOut(kept1, inner.cols);
      if (f1) await f1;
      if (!live()) return;

      // stage 2: the inner set's rows fly onto their own board, which then glows like a new table
      await api.focus(union(st[0].area, st[1].area));
      if (!live()) return;
      const innerByKey = new Map(inner.rows.map((r) => [r[0], r]));
      await fly(copyInto('inner', kept1, (t) => t.values[0], inner.cols, innerW, innerByKey));
      if (!live()) return;
      innerRegion.header = { cols: inner.cols, widths: innerW };
      S.innerCount = kept1.length;
      S.reading = null;
      steps[0].state = 'is-done';
      show();
      await Promise.all([
        api.flash('inner', 0),
        api.dropPlates(0, srcRows),
        api.tween(420, (x) =>
          srcRows.forEach((t) => {
            t.lift = Math.min(t.lift, 6 * (1 - E(x)));
            t.dim = Math.min(t.dim, 1 - E(x));
            for (const c of Object.keys(t.fade)) t.fade[c] = 1 - E(x);
          }),
        ),
      ]);
      if (!live()) return;
      await api.unflash('inner');
      if (!live()) return;

      // stage 3: the rows that use the inner set
      steps[1].state = 'is-active';
      show();
      const innerRows = api.rows.filter((t) => t.region === 'inner');
      let outRows;
      let keyOf;
      if (test) {
        // The inner set's values light up: S. Rows outside S (a NULL, or the subquery's own WHERE) dim.
        await api.focus(st[1].area);
        if (!live()) return;
        const inS = innerRows.filter((t) => test.litKeys.has(t.k));
        const notS = innerRows.filter((t) => !test.litKeys.has(t.k));
        const lit = { pal: SET_PALS[1], a: 0, cols: new Set([test.subCol]) };
        inS.forEach((t) => (t.lit = lit));
        const a = innerRegion.area;
        api.tags.push({ at: [a.x0 + 0.8 * (a.x1 - a.x0), (a.y0 + a.y1) / 2, api.Z0], text: `${an.name} = { ${test.S.map(api.show).join(', ')} }`, on: true });
        await api.tween(380, (x) => {
          lit.a = E(x);
          notS.forEach((t) => (t.dim = 0.6 * E(x)));
        });
        if (!live()) return;
        await api.wait(420);
        if (!live()) return;
        // every row of the outer table whose value is in S gets a plate, at the same moment
        await api.focus(union(st[0].area, st[2].area));
        if (!live()) return;
        outRows = api.rows.filter((t) => t.region === outer.region && !t.temp);
        keyOf = (t) => t.values[0];
        S.reading = outer.region;
        await api.flash(outer.region, 1, outer.read);
        if (!live()) return;
      } else {
        // The CTE is the FROM: the outer WHERE lights the fields it reads on stage 2's rows.
        await api.focus(union(st[1].area, st[2].area));
        if (!live()) return;
        outRows = innerRows;
        keyOf = (t) => t.k;
        if (outer.where) await api.flash('inner', 1, outer.read);
        if (!live()) return;
      }
      const kept2 = outRows.filter((t) => outer.keys.has(keyOf(t)));
      const rest2 = outRows.filter((t) => !outer.keys.has(keyOf(t)));
      steps[1].count = kept2.length;
      show();
      if (test || outer.where) {
        await Promise.all([api.popPlates(kept2, 1), api.unflash(test ? outer.region : 'inner')]);
        if (!live()) return;
      }
      await rise(kept2, rest2);
      if (!live()) return;
      const f2 = fadeOut(kept2, outer.cols);
      if (f2) await f2;
      if (!live()) return;
      const outByKey = new Map(outer.rows.map((r) => [r[0], r]));
      await fly(copyInto('result', kept2, keyOf, outer.cols, outW, outByKey));
      if (!live()) return;
      reg.get('result').header = { cols: outer.cols, widths: outW };
      S.reading = null;
      S.resultCount = kept2.length;
      steps[1].state = 'is-done';
      fin.count = kept2.length;
      fin.state = 'is-done';
      show();
      api.invalidate();
      await api.wait(500);
      if (!live()) return;
      await api.overview();
    },
  },
};
