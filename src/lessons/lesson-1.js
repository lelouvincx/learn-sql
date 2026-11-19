// Lesson 1, Sets & subsets: WHERE, AND, OR, NOT, drawn as a pipeline of stages.
//
// Every query is read as stages, the way a chain of CTEs reads. This one has two:
//   1 · pets     the raw table, its rows lying loosely, in no order. A query never
//                walks them one by one: each WHERE condition lights the field it
//                reads on every row at once, and every matching row gets a plate
//                in that condition's colour under it, all at the same moment. A
//                row in A ∩ B lies on both plates.
//   2 · subset   the rows that pass, named after the query (young_cats for the
//                starter): the kept rows fly over from stage 1, together.
// The query card shows the same pipeline as a WITH query, which is checked to
// return the learner's rows.
import { splitCondition } from '../db.js';
import { SET_PALS, table } from '../data.js';
import { cteCard, countTag, esc, placeStages, plural, sameRows, setChip, sqlComment as com, sqlHtml, union } from './common.js';

const PETS = table('pets');
const COLS = PETS.cols.map((c) => c.name);
const X = { x0: 0, x1: 172 }; // every region's extent along x: rows lie in lanes along it

// The columns a condition reads, e.g. "species = 'cat'" reads species.
const colsOf = (text) => new Set((text.replace(/'[^']*'/g, '').match(/\b(id|name|species|age|owner_id)\b/gi) ?? []).map((c) => c.toLowerCase()));

// ---------- the query as stages ----------
// The pattern: SELECT * (or a list of pets columns) FROM pets [WHERE …], with no ORDER BY or LIMIT.
function patternOf(parsed) {
  if (!parsed || parsed.table.toLowerCase() !== 'pets' || parsed.tail) return null;
  const sel = parsed.columns.trim();
  if (sel === '*') return { sel, cols: COLS, where: parsed.where };
  const cols = sel.split(',').map((c) => c.trim().toLowerCase());
  if (!cols.every((c) => COLS.includes(c)) || new Set(cols).size !== cols.length) return null;
  return { sel: cols.join(', '), cols, where: parsed.where };
}

// Stage 2's name, a CTE name a learner could type: young_cats, dogs_or_rabbits, not_fish… or matches.
const many = (v) => (/(s|sh)$/.test(v) ? v : `${v}s`);
function wordOf(text) {
  const t = text.trim();
  let m = t.match(/^species\s*=\s*'([a-z]+)'$/i);
  if (m) return { noun: many(m[1].toLowerCase()) };
  m = t.match(/^(?:not\s+species\s*=|species\s*(?:!=|<>))\s*'([a-z]+)'$/i);
  if (m) return { noun: `not_${many(m[1].toLowerCase())}` };
  m = t.match(/^species\s+in\s*\(\s*'([a-z]+)'\s*,\s*'([a-z]+)'\s*\)$/i);
  if (m) return { noun: `${many(m[1].toLowerCase())}_or_${many(m[2].toLowerCase())}` };
  m = t.match(/^age\s*(<=?|>=?)\s*\d+$/i);
  if (m) return { adj: m[1][0] === '<' ? 'young' : 'older' };
  return null;
}
function nameOf(where) {
  if (!where) return 'all_pets';
  const { parts, ops } = splitCondition(where);
  const words = parts.map(wordOf);
  if (words.some((w) => !w)) return 'matches';
  const nouns = words.filter((w) => w.noun).map((w) => w.noun);
  const adjs = words.filter((w) => w.adj).map((w) => w.adj);
  if (parts.length === 1) return nouns[0] ?? `${adjs[0]}_pets`;
  if (nouns.some((n) => n.startsWith('not_'))) return 'matches';
  if (parts.length === 2 && ops[0] === 'AND' && adjs.length === 1) return `${adjs[0]}_${nouns[0] ?? 'pets'}`;
  if (parts.length === 2 && ops[0] === 'OR' && nouns.length === 2) return nouns.join('_or_');
  return 'matches';
}

function cteHtml(p, name) {
  const lines = [com('1 · pets')];
  lines.push(`${sqlHtml(`WITH ${name} AS (`)}  ${com(`2 · ${name}`)}`);
  lines.push(`  ${sqlHtml(`SELECT ${p.sel}`)}`);
  lines.push(`  ${sqlHtml('FROM pets')}`);
  if (p.where) {
    const { parts, ops } = splitCondition(p.where);
    parts.forEach((part, i) => lines.push(`  ${i ? `  ${sqlHtml(ops[i - 1])}` : sqlHtml('WHERE')} ${setChip(i, esc(part))}`));
  }
  lines.push(')');
  lines.push(`${sqlHtml(`SELECT * FROM ${name}`)};`);
  return cteCard(lines);
}

// The card's second line: the same subset in terms of the coloured sets A, B, C… lit on the table.
function setsLine(where) {
  if (!where) return '<span class="card">no condition: the result is the whole set</span>';
  const { parts, ops } = splitCondition(where);
  const setSym = { AND: ' ∩ ', OR: ' ∪ ' };
  const name = (i) => String.fromCharCode(65 + i);
  // AND binds tighter than OR, so when both appear, bracket each run of ∩.
  const mixed = ops.includes('AND') && ops.includes('OR');
  const sets = parts
    .map((p, i) => {
      const n = setChip(i, `${name(i)}${/^not\s/i.test(p) ? '′' : ''}`, 'b');
      const open = mixed && ops[i] === 'AND' && ops[i - 1] !== 'AND' ? '(' : '';
      const close = mixed && ops[i - 1] === 'AND' && ops[i] !== 'AND' ? ')' : '';
      return `${i ? setSym[ops[i - 1]] : ''}${open}${n}${close}`;
    })
    .join('');
  return `<span class="card">= ${sets}${parts.length > 1 ? '' : ' (one subset of pets)'}</span>`;
}

function combineLabel(ops, n) {
  if (n === 0) return 'every row: no WHERE, the whole set';
  if (n === 1) return 'the rows on the plate';
  if (ops.every((o) => o === 'AND')) return 'the rows on every plate (∩, AND)';
  if (ops.every((o) => o === 'OR')) return 'the rows on at least one plate (∪, OR)';
  return 'AND first (∩), then OR (∪)';
}

const idSet = (db, where) => new Set((db.exec(`SELECT id FROM pets${where ? ` WHERE ${where}` : ''}`)[0]?.values ?? []).map((v) => v[0]));

// ---------- the run's state, cleared before every run ----------
const fresh = () => ({ an: null, atoms: [], lit: false, count: null });
let S = fresh();
let A = null; // the engine api, kept for layout
const STARTER_NAME = 'young_cats';

// Where the stages lie: stage 1 (pets), then stage 2 (the subset), left to right.
function place(api, w2, name) {
  return placeStages(api, X, [
    { name: 'pets', note: 'as stored', regions: [['pets', A.petsW]] },
    { name, note: 'WHERE: the rows that pass', regions: [['s2', w2]] },
  ]);
}

export default {
  n: 1,
  title: 'Sets & subsets',
  topic: 'WHERE · AND · OR · NOT',
  starter: `SELECT *
FROM pets
WHERE species = 'cat'
  AND age < 3;`,
  challengeStarter: `SELECT *
FROM pets
WHERE `,

  overview: () => `
    <h3>Sets &amp; subsets</h3>
    <p>A table is a <b>set</b> of rows: 12 rows lying loosely on the <b>pets</b> board. Where a row lies means nothing: there is no first row and no last row. Press <b>Shuffle</b>: the rows move, but it’s the same table.</p>
    <p>Read the query as <b>stages</b>, left to right on the grid. Stage <b>1</b> is pets as stored. Each condition in <code>WHERE</code> lights the field it reads on <b>every</b> row at once, and every matching row gets a coloured plate under it. Stage <b>2</b> is a new set: the <b>subset</b> that passes, named after what it holds, like <code>young_cats</code>.</p>
    <ul class="facts">
      <li><span class="ic">AND</span><span>Keep rows lying on <b>both</b> plates: the intersection ∩</span></li>
      <li><span class="ic">OR</span><span>Keep rows lying on <b>either</b> plate: the union ∪</span></li>
      <li><span class="ic">NOT</span><span>Keep every row the condition <b>misses</b>: the complement</span></li>
    </ul>`,
  notation: () => `
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

  // The query as stages: a WITH query whose CTE is stage 2, then the same subset as A ∩ B….
  formula(sql, parsed) {
    const p = patternOf(parsed);
    if (!p) return '<span class="card">Write a <code>SELECT * FROM pets WHERE …</code> query to see it as stages.</span>';
    return cteHtml(p, nameOf(p.where)) + setsLine(p.where);
  },

  // Runs stage 2 on the live database as a real WITH query, with each row's pet id, and checks that it
  // returns exactly the learner's rows; also each top-level condition as its own set of pet ids.
  analyze(db, sql, result) {
    const p = patternOf(result.parsed);
    if (!p) return null;
    const name = nameOf(p.where);
    const r = db.exec(`WITH ${name} AS (SELECT id AS __id, ${p.sel} FROM pets${p.where ? ` WHERE ${p.where}` : ''}) SELECT * FROM ${name}`)[0] ?? { columns: [], values: [] };
    const rows = r.values.map((v) => ({ id: v[0], values: v.slice(1) }));
    if (!sameRows(rows.map((x) => x.values), result.rows)) return null;
    const passIds = new Set(rows.map((x) => x.id));
    const s2 = { name, cols: p.cols, rows };
    if (!p.where) return { passIds, atoms: [], ops: [], s2 };
    const { parts, ops } = splitCondition(p.where);
    return {
      passIds,
      ops,
      s2,
      atoms: parts.map((text) => {
        const not = text.match(/^not\s+([\s\S]+)$/i);
        return { text, inner: not ? not[1] : null, innerIds: not ? idSet(db, not[1]) : null, ids: idSet(db, text) };
      }),
    };
  },

  challenges: [
    {
      title: 'Dogs and rabbits',
      prompt: 'The groomer is booked for the dogs and the rabbits. Get every pet that is a dog or a rabbit.',
      hint: 'In English it’s “dogs <i>and</i> rabbits”, but no pet is both, so <code>AND</code> gives the empty set. You want everything in either set: the union.',
      answer: "SELECT * FROM pets WHERE species = 'dog' OR species = 'rabbit'",
    },
    {
      title: 'Senior cats',
      prompt: 'Cats aged 4 or older are due for a senior check-up. Get exactly those pets.',
      hint: 'You want the overlap of two sets: the cats, and the pets with <code>age &gt;= 4</code>.',
      answer: "SELECT * FROM pets WHERE species = 'cat' AND age >= 4",
    },
    {
      title: 'No fish',
      prompt: 'The new carrier takes anything except fish. Get every pet that is not a fish.',
      hint: 'Light up the fish, then take every other row: the complement. Put <code>NOT</code> in front of a condition.',
      answer: "SELECT * FROM pets WHERE NOT species = 'fish'",
    },
  ],

  scene: {
    board: { x0: -36, x1: 196, y0: -260, y1: 16 },

    setup(api) {
      A = api;
      const widths = api.measure(COLS, PETS.data);
      A.petsW = api.band(widths, PETS.data.length, X.x1 - X.x0);
      A.defaultW = api.band(widths, 3, X.x1 - X.x0);
      api.region({ id: 'pets', area: { ...X, y0: 0, y1: 0 }, title: 'PETS', header: { cols: COLS, widths }, tag: () => [`PETS: ${plural(PETS.data.length, 'ROW')}`, S.lit] });
      api.region({ id: 's2', area: { ...X, y0: 0, y1: 0 }, title: STARTER_NAME.toUpperCase(), tag: () => [countTag(S.an?.s2.name ?? STARTER_NAME, S.count), !!S.count] });
      PETS.data.forEach((values) => api.row({ key: `p${values[0]}`, cols: COLS, values, widths, region: 'pets' }));
      place(api, A.defaultW, STARTER_NAME);
    },

    // Back to the starter's two stages, with an empty subset.
    reset(api) {
      S = fresh();
      if (!A?.petsW) return;
      const s2 = api.regions.find((r) => r.id === 's2');
      Object.assign(s2, { title: STARTER_NAME.toUpperCase(), header: null });
      place(api, A.defaultW, STARTER_NAME);
    },

    tip(t) {
      if (t.cols.length !== COLS.length) return undefined;
      const [id, name, species, age] = t.values;
      const own = S.atoms.length ? S.atoms.map((a) => `<br>${a.ids.has(id) ? '✓' : '✗'} ${esc(a.text)}`).join('') : '';
      return `<b>${esc(name)}</b>${esc(species)} · age ${age} · id ${id}${own}`;
    },

    async play(result, api, live) {
      const an = result.analysis;
      if (!an) return;
      S.an = an;
      S.atoms = an.atoms;
      const { s2 } = an;
      const xLen = X.x1 - X.x0;
      const w2 = api.measure(s2.cols, s2.rows.map((r) => r.values));
      const reg = api.regions.find((r) => r.id === 's2');
      reg.title = s2.name.toUpperCase();
      const st = place(api, api.band(w2, Math.max(1, s2.rows.length), xLen), s2.name);
      const pets = api.rows.filter((t) => t.region === 'pets');

      const legend = {
        atoms: an.atoms.map((a) => ({ text: a.text, inner: a.inner, state: 'is-pending', phase: a.inner ? 'inner' : 'final', count: '' })),
        final: { state: 'is-pending', count: '' },
      };
      const show = () =>
        api.legend([
          ...legend.atoms.map((a, k) => ({
            slot: k,
            code: a.phase === 'inner' ? a.inner : a.text,
            note: a.phase === 'inner' ? 'then flip to everything else…' : a.inner ? 'complement: everything outside' : '',
            count: a.count,
            state: a.state,
          })),
          { final: true, text: `Stage 2, ${esc(s2.name)}: ${combineLabel(an.ops, an.atoms.length)}`, count: legend.final.count, state: legend.final.state },
        ]);
      show();

      // stage 1: each condition washes over the whole board at once, lighting the field it reads on
      // every row, and every matching row gets plate k under it, at the same moment
      await api.focus(st[0].area);
      if (!live()) return;
      const plate = (k, ids) => api.popPlates(pets.filter((t) => ids.has(t.values[0])), k % SET_PALS.length);
      for (const [k, atom] of an.atoms.entries()) {
        const row = legend.atoms[k];
        row.state = 'is-active';
        show();
        S.lit = true;
        await api.flash('pets', k, colsOf(atom.text));
        if (!live()) return;
        if (atom.inner) {
          row.count = atom.innerIds.size;
          show();
          await Promise.all([plate(k, atom.innerIds), api.unflash('pets')]);
          await api.wait(450);
          if (!live()) return;
          row.phase = 'final';
          await api.dropPlates(k % SET_PALS.length, pets);
          if (!live()) return;
          row.count = atom.ids.size;
          show();
          await plate(k, atom.ids);
        } else {
          row.count = atom.ids.size;
          show();
          await Promise.all([plate(k, atom.ids), api.unflash('pets')]);
        }
        if (!live()) return;
        row.state = 'is-done';
        show();
        await api.wait(320);
        if (!live()) return;
      }
      S.lit = false;

      // stage 1 → 2: the kept rows rise together, the rest fade together
      await api.focus(union(st[0].area, st[1].area));
      if (!live()) return;
      const kept = pets.filter((t) => an.passIds.has(t.values[0]));
      const dropped = pets.filter((t) => !an.passIds.has(t.values[0]));
      legend.final = { state: 'is-active', count: kept.length };
      show();
      await api.tween(520, (x) => {
        kept.forEach((t) => (t.lift = 6 * api.ease(x)));
        dropped.forEach((t) => (t.dim = api.ease(x)));
      });
      if (!live()) return;
      // cells stage 2 doesn't select fade first
      const drop = COLS.filter((c) => !s2.cols.includes(c));
      if (drop.length) {
        await api.tween(320, (x) => kept.forEach((t) => drop.forEach((c) => (t.fade[c] = api.ease(x)))));
        if (!live()) return;
      }
      await api.wait(200);
      if (!live()) return;

      // the subset flies to stage 2's board, every row at the same time
      const byId = new Map(s2.rows.map((r) => [r.id, r.values]));
      const sample = { cols: s2.cols, widths: w2 };
      const targets = kept.length ? api.slots('s2', sample, kept.length) : [];
      const copies = kept.map((t, i) => {
        const z = api.bodyZ(t);
        return { c: api.row({ key: `s${t.values[0]}`, cols: s2.cols, values: byId.get(t.values[0]), widths: w2, region: 's2', x: t.x, y: t.y, z, temp: true }), from: [t.x, t.y, z], to: targets[i] };
      });
      await api.tween(900, (x) => {
        const e = api.ease(x);
        copies.forEach(({ c, from, to }) => Object.assign(c, { x: api.lerp(from[0], to[0], e), y: api.lerp(from[1], to[1], e), z: api.lerp(from[2], api.Z0, e) + Math.sin(Math.PI * e) * 40 }));
      });
      if (!live()) return;
      reg.header = { cols: s2.cols, widths: w2 };
      S.count = kept.length;
      legend.final.state = 'is-done';
      show();
      api.invalidate();
      await api.wait(500);
      if (!live()) return;
      await api.overview();
    },
  },
};
