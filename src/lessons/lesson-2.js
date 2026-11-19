// Lesson 2, Pick columns: SELECT and DISTINCT, drawn as a pipeline of stages.
//
// Every query is read as stages, the way a chain of CTEs reads. The board lays
// them out left to right and the camera pans along:
//   1 · pets           the table as it is stored
//   2 · filtered       only with WHERE: the whole rows that pass
//   3 · picked         SELECT: one shorter row per row of the stage before,
//                      with only the chosen columns. Equal rows stay separate,
//                      so this stage can be a multiset
//   4 · distinct_rows  only with DISTINCT: equal picked rows merge into one,
//                      tagged with how many merged, so this stage is a set
// The query card shows the same pipeline as a WITH query, which is checked to
// return the learner's rows.
import { SET_PALS, table } from '../data.js';
import { clean, countTag, cteCard, esc, placeStages, plural, sameRows, setChip, sqlComment as com, sqlHtml, union } from './common.js';

const PETS = table('pets');
const COLS = PETS.cols.map((c) => c.name);
const X = { x0: 0, x1: 172 }; // every region's extent along x: rows lie in lanes along it
const SLOT = { where: 0, select: 1, distinct: 3 };
const STARTER_COLS = ['species'];

// The columns a condition reads, e.g. "species = 'cat'" reads species.
const colsOf = (text) => new Set((text.replace(/'[^']*'/g, '').match(/\b(id|name|species|age|owner_id)\b/gi) ?? []).map((c) => c.toLowerCase()));

// The SELECT list as { distinct, cols, star }, when it is * or plain, different pets column names; otherwise null.
function selectList(columns) {
  const m = columns.match(/^(distinct\s+)?([\s\S]+)$/i);
  const list = m[2].trim();
  const cols = list === '*' ? COLS : list.split(',').map((c) => c.trim().toLowerCase());
  if (!cols.length || !cols.every((c) => COLS.includes(c)) || new Set(cols).size !== cols.length) return null;
  return { distinct: !!m[1], cols, star: list === '*' };
}

// `SELECT [DISTINCT] cols FROM pets [WHERE …] [ORDER BY …]`, or null.
function parse(parsed) {
  if (!parsed || parsed.table.toLowerCase() !== 'pets') return null;
  if (parsed.tail && !/^order\s+by\b/i.test(parsed.tail)) return null;
  if (/\blimit\b/i.test(parsed.tail)) return null;
  const sel = selectList(parsed.columns);
  return sel && { ...sel, where: parsed.where, tail: parsed.tail };
}

// ---------- the query as stages ----------
// One CTE per stage after pets; the query ends by reading the last one.
function planOf(q) {
  const cols = q.star ? '*' : q.cols.join(', ');
  const ctes = [];
  let from = 'pets';
  if (q.where) {
    ctes.push({ name: 'filtered', select: '*', from, where: q.where });
    from = 'filtered';
  }
  ctes.push({ name: 'picked', select: cols, from });
  from = 'picked';
  if (q.distinct) {
    ctes.push({ name: 'distinct_rows', select: cols, distinct: true, from });
    from = 'distinct_rows';
  }
  return { ctes, last: from, tail: q.tail };
}
const cteSql = (c) => `${c.name} AS (SELECT ${c.distinct ? 'DISTINCT ' : ''}${c.select} FROM ${c.from}${c.where ? ` WHERE ${c.where}` : ''})`;
const planSql = (plan, upTo = plan.ctes.length) => `WITH ${plan.ctes.slice(0, upTo).map(cteSql).join(', ')}`;

function cteHtml(plan) {
  const lines = [com('1 · pets: the table as stored')];
  plan.ctes.forEach((c, i) => {
    lines.push(`${i ? '' : sqlHtml('WITH ')}${sqlHtml(`${c.name} AS (`)}  ${com(`${i + 2} · ${c.name}`)}`);
    const sel = c.select === '*' ? sqlHtml('*') : setChip(SLOT.select, esc(c.select));
    const pick = c.name === 'picked' ? sel : sqlHtml(c.select);
    lines.push(`  ${sqlHtml('SELECT ')}${c.distinct ? `${setChip(SLOT.distinct, sqlHtml('DISTINCT'))} ` : ''}${pick} ${sqlHtml(`FROM ${c.from}`)}`);
    if (c.where) lines.push(`  ${sqlHtml('WHERE')} ${setChip(SLOT.where, esc(c.where))}`);
    lines.push(i < plan.ctes.length - 1 ? '),' : ')');
  });
  lines.push(`${sqlHtml(`SELECT * FROM ${plan.last}`)}${plan.tail ? ` ${sqlHtml(plan.tail)}` : ''};`);
  return cteCard(lines);
}

const valueKey = (values) => JSON.stringify(values);
const showValue = (v) => (v == null ? 'NULL' : String(v));

// ---------- the run's state, cleared before every run ----------
let an = null;
let counts = {}; // region id -> its row count, once the run has filled it
let heads = []; // the rows left standing in distinct_rows after equal ones merge: { c, n }
let oneLane = false; // the merged rows stand in one lane, so their tags need no staggering
let A = null; // the engine api, kept for layout helpers

// Where the stages lie, left to right; only the stages this query has.
function place(api, q, widths) {
  return placeStages(api, X, [
    { name: 'pets', note: 'the table as stored', regions: [['pets', widths.pets]] },
    ...(q.where ? [{ name: 'filtered', note: 'WHERE: the rows that pass', regions: [['filtered', widths.filtered]] }] : []),
    { name: 'picked', note: 'SELECT: only the chosen columns', regions: [['picked', widths.picked]] },
    ...(q.distinct ? [{ name: 'distinct_rows', note: 'DISTINCT: equal rows merge into one', regions: [['distinct', widths.distinct]] }] : []),
  ]);
}
// The starter's stages, before any run: pets → picked (12 species) → distinct_rows (4).
function placeStarter(api) {
  const w = api.measure(STARTER_COLS, PETS.data.map((v) => [v[COLS.indexOf('species')]]));
  const xLen = X.x1 - X.x0;
  place(api, { distinct: true }, { pets: A.petsW, picked: api.band(w, PETS.data.length, xLen), distinct: api.band(w, 4, xLen) });
}

export default {
  n: 2,
  title: 'Pick columns',
  topic: 'SELECT · DISTINCT',
  starter: `SELECT DISTINCT species
FROM pets;`,
  challengeStarter: `SELECT `,

  overview: () => `
    <h3>Pick columns</h3>
    <p>Read every query as <b>stages</b>, left to right on the grid. Each stage is a set of rows, made from the stage before it. Stage <b>1</b> is <b>pets</b>, as stored.</p>
    <p><code>SELECT</code> picks the <b>columns</b> you keep. In the <b>picked</b> stage, every pet row becomes a shorter row with only those columns, all at the same moment. In set words this is a <b>projection</b>.</p>
    <p>Two picked rows can be exactly the same: five pets are cats, so five picked rows read <code>cat</code>. Plain <code>SELECT</code> keeps all five, so the result can hold the same row more than once. That is a <b>multiset</b>, not a set.</p>
    <p><code>DISTINCT</code> adds one more stage: equal rows merge into one. <code>SELECT DISTINCT species</code> turns 12 rows into 4, and the result is a true <b>set</b>: every row is different.</p>
    <ul class="facts">
      <li><span class="ic">SELECT</span><span>Keep these columns from <b>every</b> row: the projection π</span></li>
      <li><span class="ic">*</span><span>Keep every column: each picked row is the whole row</span></li>
      <li><span class="ic">DISTINCT</span><span>Equal rows <b>merge into one</b>, so the result is a set</span></li>
      <li><span class="ic">WHERE</span><span>Leave rows out <b>first</b>, in a stage of its own, then pick the columns</span></li>
      <li><span class="ic">WITH</span><span>Each stage is a CTE. The query card writes your query that way, with the stage numbers</span></li>
    </ul>`,
  notation: () => `
    <h3>SQL as set notation</h3>
    <p>Picking columns is a projection, written π with the columns underneath. Each line is one stage:</p>
    <table class="mapping"><thead><tr><th>Stage</th><th>SQL</th><th>Set notation</th></tr></thead><tbody>
      <tr><td>1 · pets</td><td>pets</td><td>pets</td></tr>
      <tr><td>2 · filtered</td><td>SELECT * FROM pets WHERE a</td><td>{ p ∈ pets | a }</td></tr>
      <tr><td>3 · picked</td><td>SELECT name, age FROM filtered</td><td>π<sub>name, age</sub>(filtered), a multiset</td></tr>
      <tr><td>4 · distinct_rows</td><td>SELECT DISTINCT name, age FROM picked</td><td>π<sub>name, age</sub>(filtered), a set</td></tr>
    </tbody></table>
    <p>In set algebra, π always gives a set, so equal rows count once. SQL only does that when you write <code>DISTINCT</code>. Without it, the result is a multiset: the same row can appear many times.</p>
    <p><code>DISTINCT</code> compares whole rows. <code>SELECT DISTINCT species, age</code> keeps a row for each different pair, and it treats every <code>NULL</code> as the same value.</p>`,

  formula(sql, parsed) {
    const q = parse(parsed);
    if (!q || /\b(group\s+by|having|join|union)\b/i.test(clean(sql))) return '<span class="card">Write <code>SELECT [DISTINCT] columns FROM pets</code> to see it as stages.</span>';
    const note = q.distinct
      ? 'DISTINCT: equal rows merge, so the result is a true set'
      : q.star
        ? 'every column, so no two rows are equal: the id differs'
        : 'no DISTINCT: equal rows stay, so the result can be a multiset';
    return `${cteHtml(planOf(q))}<span class="card">${note}</span>`;
  },

  // Runs every stage of the plan on the live database as a real WITH query, with each row's pet id, and
  // checks that the last stage returns exactly the learner's rows. Any mismatch keeps the grid calm.
  analyze(db, sql, result) {
    const q = parse(result.parsed);
    if (!q || /\b(group\s+by|having|join|union)\b/i.test(clean(sql))) return null;
    const exec = (text) => db.exec(text)[0] ?? { columns: [], values: [] };
    const plan = planOf(q);
    const final = exec(`${planSql(plan)} SELECT * FROM ${plan.last}${plan.tail ? ` ${plan.tail}` : ''}`);
    if (!sameRows(final.values, result.rows, /\border\s+by\b/i.test(q.tail))) return null;
    // the picked stage with each row's pet id, read from the stage before it
    const pickAt = plan.ctes.findIndex((c) => c.name === 'picked');
    const before = pickAt ? `${planSql(plan, pickAt)} ` : '';
    const picked = exec(`${before}SELECT id, ${q.cols.join(', ')} FROM ${plan.ctes[pickAt].from}`).values;
    const groups = new Map();
    for (const [id, ...values] of picked) {
      const k = valueKey(values);
      if (!groups.has(k)) groups.set(k, { values, ids: [] });
      groups.get(k).ids.push(id);
    }
    const list = [...groups.values()];
    if (q.distinct) {
      const distinct = exec(`${planSql(plan)} SELECT * FROM distinct_rows`).values;
      if (!sameRows(distinct, list.map((g) => g.values))) return null;
    }
    return { ...q, plan, passIds: new Set(picked.map((r) => r[0])), groups: list };
  },

  challenges: [
    {
      title: 'Name tags',
      prompt: 'The vet prints a name tag for every pet younger than 3. Each tag shows only the pet’s name and species.',
      hint: 'Two steps: <code>WHERE age &lt; 3</code> keeps the young pets, and <code>SELECT name, species</code> keeps only those two columns.',
      answer: "SELECT name, species FROM pets WHERE age < 3",
    },
    {
      title: 'Older kinds',
      prompt: 'Which species have at least one pet aged 4 or older? List each species once.',
      hint: 'Keep the pets with <code>age &gt;= 4</code>, pick the <code>species</code> column, then use <code>DISTINCT</code> so two older cats count as one row.',
      answer: 'SELECT DISTINCT species FROM pets WHERE age >= 4',
    },
    {
      title: 'Owner ids',
      prompt: 'List every different value in the <code>owner_id</code> column of pets, once each. Keep the strays’ empty value too.',
      hint: 'Pick the <code>owner_id</code> column with <code>DISTINCT</code>. The three strays all hold <code>NULL</code>, and <code>DISTINCT</code> treats those as one value.',
      answer: 'SELECT DISTINCT owner_id FROM pets',
    },
  ],

  scene: {
    board: { x0: -36, x1: 196, y0: -300, y1: 16 },

    setup(api) {
      A = api;
      const widths = api.measure(COLS, PETS.data);
      A.petsW = api.band(widths, PETS.data.length, X.x1 - X.x0);
      const tagOf = (id, name) => () => [countTag(name, counts[id]), counts[id] != null];
      api.region({ id: 'pets', area: { ...X, y0: 0, y1: 0 }, title: 'PETS', header: { cols: COLS, widths }, tag: () => [`PETS: ${plural(PETS.data.length, 'ROW')}`, an != null] });
      api.region({ id: 'filtered', area: { ...X, y0: 0, y1: 0 }, title: 'FILTERED', hidden: true, header: { cols: COLS, widths }, tag: tagOf('filtered', 'filtered') });
      api.region({ id: 'picked', area: { ...X, y0: 0, y1: 0 }, title: 'PICKED', tag: tagOf('picked', 'picked') });
      // the merged rows keep the spots play() gives them, so Shuffle never piles them and their tags together
      api.region({ id: 'distinct', area: { ...X, y0: 0, y1: 0 }, title: 'DISTINCT_ROWS', scatter: false, tag: tagOf('distinct', 'distinct_rows') });
      PETS.data.forEach((values) => api.row({ key: `p${values[0]}`, cols: COLS, values, widths, region: 'pets' }));
      placeStarter(api);
    },

    // Back to the starter's stages, with empty boards.
    reset(api) {
      an = null;
      counts = {};
      heads = [];
      oneLane = false;
      if (!A?.petsW) return;
      for (const id of ['picked', 'distinct']) api.regions.find((r) => r.id === id).header = null;
      placeStarter(api);
    },

    // A tag on every merged row: how many equal rows it stands for.
    draw(api) {
      const h = api.shape === 'bar' ? 4.5 : 1.4;
      const over = heads
        .filter(({ c, n }) => n > 1 && !c.hidden)
        .sort((a, b) => a.c.x - b.c.x)
        .map(({ c, n }, i) => tag([c.x, c.y, api.bodyZ(c) + h], 0, !oneLane && i % 2 ? -46 : -24, esc(`×${n} ${c.values.map(showValue).join(' · ')}`), true))
        .join('');
      return { over };
    },

    tip(t) {
      const fields = t.cols.map((c, i) => `${esc(c)} ${esc(showValue(t.values[i]))}`).join(' · ');
      const head = heads.find((h) => h.c === t);
      return `<b>${esc(showValue(t.values[t.cols.indexOf('name')] ?? t.values[0]))}</b>${fields}${head && head.n > 1 ? `<br>${head.n} equal rows merged into this row` : ''}`;
    },

    async play(result, api, live) {
      if (!result.analysis) return;
      an = result.analysis;
      const xLen = X.x1 - X.x0;
      const reg = new Map(api.regions.map((r) => [r.id, r]));
      const pets = api.rows.filter((t) => t.region === 'pets' && !t.temp);
      const kept = pets.filter((t) => an.passIds.has(t.values[0]));
      const out = pets.filter((t) => !an.passIds.has(t.values[0]));
      const chosen = new Set(an.cols);
      const faded = COLS.filter((c) => !chosen.has(c));
      const idx = an.cols.map((c) => COLS.indexOf(c));
      const widths = api.measure(an.cols, PETS.data.map((v) => idx.map((i) => v[i])));
      const kinds = an.groups.length;
      const dupGroups = an.groups.filter((g) => g.ids.length > 1);
      const st = place(api, an, {
        pets: A.petsW,
        filtered: api.band(pets[0].widths, Math.max(1, kept.length), xLen),
        picked: api.band(widths, Math.max(1, kept.length), xLen),
        distinct: api.band(widths, Math.max(1, kinds), xLen),
      });
      const stageOf = (name) => st.find((s) => s.name === name);
      reg.get('picked').header = { cols: an.cols, widths };
      reg.get('distinct').header = { cols: an.cols, widths };

      const steps = [];
      if (an.where) steps.push({ slot: SLOT.where, code: `WHERE ${an.where}`, note: 'stage 1 → 2: the rows that pass', state: 'is-pending', count: '' });
      steps.push({ slot: SLOT.select, code: `SELECT ${an.star ? '*' : an.cols.join(', ')}`, note: `stage ${an.where ? 2 : 1} → ${an.where ? 3 : 2}: ${faded.length ? 'only these columns, one row per row' : 'every column, one row per row'}`, state: 'is-pending', count: '' });
      if (an.distinct) steps.push({ slot: SLOT.distinct, code: 'DISTINCT', note: 'equal rows merge into one', state: 'is-pending', count: '' });
      const final = { final: true, sym: '=', text: '', count: '', state: 'is-pending' };
      const show = () => api.legend([...steps, final]);
      const step = (k, state, count) => {
        Object.assign(steps[k], { state }, count == null ? {} : { count });
        show();
      };
      show();
      let k = 0;
      const h = api.shape === 'bar' ? 4.5 : 1.4;
      // Rows fly from where they are to their spots in the next stage, all at the same moment.
      const fly = (list, arc) =>
        api.tween(900, (x) => {
          const e = api.ease(x);
          list.forEach(({ c, from, to }) => Object.assign(c, { x: api.lerp(from[0], to[0], e), y: api.lerp(from[1], to[1], e), z: api.lerp(from[2], to[2], e) + Math.sin(Math.PI * e) * arc }));
        });
      const empty = async (text) => {
        Object.assign(final, { state: 'is-done', count: 0, text });
        show();
        await api.wait(500);
        if (live()) await api.overview();
      };

      // stage 1: pets, as stored
      await api.focus(st[0].area);
      if (!live()) return;
      api.invalidate();

      // stage 2, only with WHERE: the condition lights the field it reads, and the rows that pass are copied on
      let source = kept;
      if (an.where) {
        step(k, 'is-active');
        await api.flash('pets', SLOT.where, colsOf(an.where));
        if (!live()) return;
        step(k, 'is-active', kept.length);
        await Promise.all([api.tween(520, (x) => out.forEach((t) => (t.dim = api.ease(x)))), api.unflash('pets')]);
        if (!live()) return;
        await api.focus(union(st[0].area, stageOf('filtered').area));
        if (!live()) return;
        const spots = kept.length ? api.slots('filtered', kept[0], kept.length) : [];
        const copies = kept.map((t, i) => {
          const c = api.copy(t, { region: 'filtered' });
          return { c, from: [c.x, c.y, c.z], to: [...spots[i], api.Z0] };
        });
        await fly(copies, 30);
        if (!live()) return;
        counts.filtered = kept.length;
        step(k++, 'is-done');
        api.invalidate();
        if (!kept.length) {
          counts.picked = 0;
          if (an.distinct) counts.distinct = 0;
          await empty('No row passes, so every later stage is empty: ∅');
          return;
        }
        source = copies.map((o) => o.c);
        await api.wait(250);
        if (!live()) return;
      }

      // stage picked: the chosen cells light on every row, the other columns fade, and each row
      // sends a shorter row, with only the chosen cells, to the picked board
      const srcId = an.where ? 'filtered' : 'pets';
      await api.focus(union(stageOf(an.where ? 'filtered' : 'pets').area, stageOf('picked').area));
      if (!live()) return;
      step(k, 'is-active');
      await Promise.all([api.flash(srcId, SLOT.select, chosen), api.tween(520, (x) => source.forEach((t) => faded.forEach((c) => (t.fade[c] = api.ease(x)))))]);
      if (!live()) return;
      // each picked row leaves from the cells it shows
      const startOf = (t) => {
        if (api.shape === 'bar') {
          let y1 = t.y + t.widths.reduce((a, w) => a + w, 0) / 2;
          const mid = t.widths.map((w) => {
            y1 -= w;
            return y1 + w / 2;
          });
          return [t.x, idx.reduce((s, i) => s + mid[i], 0) / idx.length];
        }
        const p = 4.6;
        return [idx.reduce((s, i) => s + t.x - (p * (t.cols.length - 1)) / 2 + p * i, 0) / idx.length, t.y];
      };
      const groupOf = new Map();
      an.groups.forEach((g, gi) => g.ids.forEach((id, si) => groupOf.set(id, [gi, si])));
      const picked = source.map((t) => {
        const [x, y] = startOf(t);
        const [gi, si] = groupOf.get(t.values[0]);
        const c = api.copy(t, { region: 'picked', cols: an.cols, values: idx.map((i) => t.values[i]), widths, x, y, z: api.bodyZ(t) + h });
        return { c, gi, si, from: [x, y, c.z] };
      });
      const spots = api.slots('picked', picked[0].c, picked.length);
      picked.forEach((o, i) => (o.to = [...spots[i], api.Z0]));
      step(k, 'is-active', picked.length);
      await Promise.all([fly(picked, 30), api.wait(480).then(() => api.unflash(srcId))]);
      if (!live()) return;
      counts.picked = picked.length;
      step(k++, 'is-done');
      // equal picked rows share a plate colour, so the repeats are easy to see
      const plated = dupGroups.length && dupGroups.length <= SET_PALS.length;
      if (plated) {
        await Promise.all(dupGroups.map((g, j) => api.popPlates(picked.filter((o) => an.groups[o.gi] === g).map((o) => o.c), j)));
        if (!live()) return;
      }
      api.invalidate();

      // stage distinct_rows: every picked row is copied on; equal rows land on the same spot, stack, and settle into one
      if (an.distinct) {
        await api.wait(300);
        await api.focus(union(stageOf('picked').area, stageOf('distinct_rows').area));
        if (!live()) return;
        step(k, 'is-active');
        const copies = picked.map((o) => {
          const c = api.copy(o.c, { region: 'distinct' });
          return { ...o, c, from: [o.c.x, o.c.y, c.z] };
        });
        // one lane spread evenly along x when the merged rows fit, so they and their tags stand apart;
        // otherwise the usual scattered spots
        const a = reg.get('distinct').area;
        const hd = api.half(copies[0].c)[0];
        const lo = a.x0 + (api.shape === 'bar' ? 16 : 4) + hd + 12; // clear of the stage title, which the first tag would cover
        const hi = a.x1 - 4 - hd;
        const pitch = kinds > 1 ? (hi - lo) / (kinds - 1) : 0;
        oneLane = kinds === 1 || pitch >= 2 * hd + 6;
        const targets = oneLane ? Array.from({ length: kinds }, (_, i) => [lo + pitch * i, (a.y0 + a.y1) / 2]) : api.slots('distinct', copies[0].c, kinds);
        const lift = h + 0.8;
        copies.forEach((o) => {
          const [tx, ty] = targets[o.gi];
          o.to = [tx + o.si * 0.7, ty - o.si * 0.7, api.Z0 + o.si * lift];
        });
        await fly(copies, 40);
        if (!live()) return;
        await api.wait(380);
        if (!live()) return;
        const stacked = copies.filter((o) => o.si > 0);
        await api.tween(520, (x) => {
          const e = api.ease(x);
          stacked.forEach(({ c, to, si }) => Object.assign(c, { x: api.lerp(to[0], to[0] - si * 0.7, e), y: api.lerp(to[1], to[1] + si * 0.7, e), z: api.lerp(to[2], api.Z0, e) }));
        });
        if (!live()) return;
        stacked.forEach(({ c }) => (c.hidden = true));
        const standing = copies.filter((o) => o.si === 0);
        heads = standing.map((o) => ({ c: o.c, n: an.groups[o.gi].ids.length }));
        counts.distinct = kinds;
        step(k++, 'is-done', kinds);
        if (plated) {
          await Promise.all(dupGroups.map((g, j) => api.popPlates(standing.filter((o) => an.groups[o.gi] === g).map((o) => o.c), j)));
          if (!live()) return;
        }
      }

      const merged = picked.length - kinds;
      final.text = an.distinct
        ? merged
          ? `A set: ${merged} equal ${merged === 1 ? 'row' : 'rows'} merged, every row differs`
          : 'A set: no two picked rows were equal'
        : merged
          ? `A multiset: ${merged} ${merged === 1 ? 'row repeats' : 'rows repeat'} another row`
          : 'No two picked rows are equal, so it is already a set';
      Object.assign(final, { state: 'is-done', count: an.distinct ? kinds : picked.length });
      show();
      api.invalidate();
      await api.wait(500);
      if (!live()) return;
      await api.overview();
    },
  },
};
