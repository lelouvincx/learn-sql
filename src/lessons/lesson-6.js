// Lesson 6, Every pair: JOIN, drawn as a pipeline of stages.
//
// Every query is read as stages, the way a chain of CTEs reads: each stage is
// a set of rows, made from the stages before it. The board lays them out left
// to right and the camera pans along:
//   1 · raw tables   pets and owners, as they are stored
//   2 · the join     every pet paired with every owner (the 60 cells of the
//                    pair grid appear in this stage), the ON condition keeps
//                    the matching pairs, and those pairs become its rows
//   3 · result       only when the query filters, sorts or cuts the joined
//                    rows (WHERE / ORDER BY / LIMIT): the rows that pass
// The query card shows the same pipeline as a WITH query, which is checked to
// return the learner's rows.
import { SET_PALS, table } from '../data.js';
import { clean, countTag as regionTagText, cteCard, esc, placeStages, plural, sameRows, setChip, sqlComment as com, sqlHtml, union } from './common.js';

const PETS = table('pets');
const OWNERS = table('owners');
const PET_COLS = PETS.cols.map((c) => c.name);
const OWN_COLS = OWNERS.cols.map((c) => c.name);
const SLOT = { on: 0, where: 1, left: 2, product: 3 };
const X = { x0: 0, x1: 172 }; // every region's extent along x: rows lie in lanes along it
const MATRIX_W = 76; // the pair grid needs this much of stage 2
const DEFAULT_W = 76;
const JOIN_KW = { INNER: 'JOIN', LEFT: 'LEFT JOIN', CROSS: 'CROSS JOIN' };

const keyOf = (pid, oid) => `${pid}|${oid}`;
const petById = new Map(PETS.data.map((v) => [v[0], v]));
const ownerById = new Map(OWNERS.data.map((v) => [v[0], v]));

// `SELECT … FROM pets [p] [LEFT|INNER|CROSS] JOIN owners [o] [ON …] [WHERE …] [ORDER BY / LIMIT …]`, either table first.
const NOT_ALIAS1 = '(?!(?:left|inner|cross|join|natural|outer)\\b)';
const NOT_ALIAS2 = '(?!(?:on|where|order|limit|group)\\b)';
const JOIN_RE = new RegExp(
  `^select\\s+([\\s\\S]+?)\\s+from\\s+(pets|owners)(?:\\s+(?:as\\s+)?${NOT_ALIAS1}([a-z_]\\w*))?\\s+(?:(left(?:\\s+outer)?|inner|cross)\\s+)?join\\s+(pets|owners)(?:\\s+(?:as\\s+)?${NOT_ALIAS2}([a-z_]\\w*))?(?:\\s+on\\s+([\\s\\S]+?))?(?:\\s+where\\s+([\\s\\S]+?))?(\\s+(?:order\\s+by|limit)\\b[\\s\\S]*)?$`,
  'i',
);
function parseJoin(sql) {
  const m = clean(sql).match(JOIN_RE);
  if (!m) return null;
  const [t1, t2] = [m[2].toLowerCase(), m[5].toLowerCase()];
  if (t1 === t2) return null;
  const on = m[7]?.trim() ?? null;
  const left = !!m[4] && /^left/i.test(m[4]);
  const q = { select: m[1].trim(), t1, a1: m[3] ?? null, t2, a2: m[6] ?? null, on, where: m[8]?.trim() ?? null, tail: m[9]?.trim() ?? '' };
  q.type = left ? 'LEFT' : on ? 'INNER' : 'CROSS';
  q.pa = t1 === 'pets' ? q.a1 ?? 'pets' : q.a2 ?? 'pets';
  q.oa = t1 === 'owners' ? q.a1 ?? 'owners' : q.a2 ?? 'owners';
  return q;
}

// The columns of each table a condition reads, e.g. "p.owner_id = o.id" reads pets.owner_id and owners.id.
function colsOf(q, text) {
  const out = { pets: new Set(), owners: new Set() };
  const bare = text.replace(/'[^']*'/g, '');
  const tableOf = (a) => (a.toLowerCase() === q.pa.toLowerCase() ? 'pets' : a.toLowerCase() === q.oa.toLowerCase() ? 'owners' : null);
  for (const [, a, c] of bare.matchAll(/\b([a-z_]\w*)\.([a-z_]\w*)\b/gi)) {
    const t = tableOf(a);
    if (t) out[t].add(c.toLowerCase());
  }
  for (const [c] of bare.replace(/\b[a-z_]\w*\.[a-z_]\w*\b/gi, '').matchAll(/\b[a-z_]\w*\b/gi)) {
    const lc = c.toLowerCase();
    const inP = PET_COLS.includes(lc);
    const inO = OWN_COLS.includes(lc);
    if (inP !== inO) out[inP ? 'pets' : 'owners'].add(lc);
  }
  return out;
}


// ---------- the query as stages ----------
// A joined column is named after the table it came from: pets.name -> pet_name, owners.city -> owner_city.
const pre = (t, c) => `${t === 'pets' ? 'pet' : 'owner'}_${c}`;
const aliasTable = (q, a) => (a.toLowerCase() === q.pa.toLowerCase() ? 'pets' : a.toLowerCase() === q.oa.toLowerCase() ? 'owners' : null);
// Rewrites p.name / pets.name / bare species into the joined stage's names, leaving strings alone.
function rw(q, text) {
  return text
    .split(/('(?:[^']|'')*')/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/\b([a-z_]\w*)\.([a-z_]\w*)\b|(?<![.\w])([a-z_]\w*)\b/gi, (m, a, c, bare) => {
            if (a) {
              const t = aliasTable(q, a);
              return t ? pre(t, c.toLowerCase()) : m;
            }
            const lc = bare.toLowerCase();
            const inP = PET_COLS.includes(lc);
            const inO = OWN_COLS.includes(lc);
            return inP !== inO ? pre(inP ? 'pets' : 'owners', lc) : m;
          }),
    )
    .join('');
}
// The stages of a join query: always the raw tables, then the join; a third stage when the query
// filters, sorts or cuts the joined rows. The join stage keeps only the columns later stages read.
function planOf(q) {
  const from = `${q.t1}${q.a1 ? ` ${q.a1}` : ''} ${JOIN_KW[q.type]} ${q.t2}${q.a2 ? ` ${q.a2}` : ''}`;
  if (!q.where && !q.tail) return { from, s2: { name: 'result', select: q.select }, s3: null };
  const star = /(^|,)\s*(\w+\.)?\*\s*(,|$)/.test(q.select);
  const used = star ? { pets: new Set(PET_COLS), owners: new Set(OWN_COLS) } : colsOf(q, `${q.select} ${q.where ?? ''} ${q.tail}`);
  const list = [
    ...PET_COLS.filter((c) => used.pets.has(c)).map((c) => [`${q.pa}.${c}`, pre('pets', c)]),
    ...OWN_COLS.filter((c) => used.owners.has(c)).map((c) => [`${q.oa}.${c}`, pre('owners', c)]),
  ];
  return {
    from,
    s2: { name: 'joined', select: list.map(([e, as]) => `${e} AS ${as}`).join(', '), names: list.map(([, as]) => as) },
    s3: { name: 'result', select: star ? '*' : rw(q, q.select), where: q.where && rw(q, q.where), tail: q.tail && rw(q, q.tail) },
  };
}

function cteHtml(q, plan) {
  const on = q.on ? ` ${sqlHtml('ON')} ${setChip(SLOT.on, esc(q.on))}` : '';
  const lines = [com('1 · raw tables: pets, owners')];
  lines.push(`${sqlHtml(`WITH ${plan.s2.name} AS (`)}  ${com(`2 · ${plan.s2.name}`)}`);
  lines.push(`  ${sqlHtml(`SELECT ${plan.s2.select}`)}`);
  lines.push(`  ${sqlHtml(`FROM ${plan.from}`)}${on}`);
  lines.push(')');
  if (!plan.s3) lines.push(`${sqlHtml(`SELECT * FROM ${plan.s2.name}`)};`);
  else {
    const s3 = plan.s3;
    lines.push(`${sqlHtml(`SELECT ${s3.select}`)}  ${com('3 · result')}`);
    lines.push(sqlHtml(`FROM ${plan.s2.name}`));
    if (s3.where) lines.push(`${sqlHtml('WHERE')} ${setChip(SLOT.where, esc(s3.where))}`);
    if (s3.tail) lines.push(sqlHtml(s3.tail));
    lines[lines.length - 1] += ';';
  }
  return cteCard(lines);
}

// ---------- the run's state, cleared before every run ----------
let S = null;
const fresh = () => ({ an: null, appear: 0, match: 0, pad: 0, rise: 0, fade: 0, on: false, s2Count: null, s3Count: null, M: null });
S = fresh();
let A = null; // the engine api, kept for draw helpers

// Where the regions and stages lie: stages left to right (toward -y), the regions of a stage side by side.
function place(api, w2, w3, names = { s2: 'result', s3: 'result' }) {
  return placeStages(api, X, [
    { name: 'raw tables', note: 'as stored', regions: [['pets', A.petsW], ['owners', A.ownersW]] },
    { name: names.s2, note: 'JOIN: pets × owners, kept where ON holds', regions: [['s2', w2]] },
    ...(w3 != null ? [{ name: names.s3, note: 'WHERE: the joined rows that pass', regions: [['s3', w3]] }] : []),
  ]);
}

// The pair grid in stage 2: pets down the side (along x), owners across the top (along y), one cell per pair.
function matrixOf(a, an) {
  const padPets = an.pads.some(([, o]) => o == null);
  const padOwners = an.pads.some(([p]) => p == null);
  const pets = [...PETS.data.map((v) => v[0]), ...(padOwners ? [null] : [])];
  const owners = [...OWNERS.data.map((v) => v[0]), ...(padPets ? [null] : [])];
  const xa = a.x0 + 10;
  const xb = a.x1 - 3;
  const ya = a.y1 - 19;
  const yb = a.y0 + 2;
  const xp = (xb - xa) / pets.length;
  const yp = (ya - yb) / owners.length;
  return {
    pets,
    owners,
    a,
    x: new Map(pets.map((id, i) => [id, xa + xp * (i + 0.5)])),
    y: new Map(owners.map((id, j) => [id, ya - yp * (j + 0.5)])),
    cw: xp * 0.72,
    ch: Math.min(yp * 0.72, 11),
  };
}

// One cell of the pair grid: a flat tile, raised and lit when ON keeps it.
function cell(api, x, y, k, pad) {
  const M = S.M;
  const sc = pad ? S.pad : S.appear;
  if (sc < 0.01 || S.fade > 0.99) return null;
  const dx = (M.cw / 2) * sc;
  const dy = (M.ch / 2) * sc;
  const keep = pad || (S.an.on ? S.an.matched.has(k) : true);
  const lit = pad ? 1 : S.an.on && keep ? S.match : 0;
  const dim = Math.max(!keep ? 0.8 * S.match : 0, S.fade);
  const op = dim > 0.01 ? ` opacity="${f(1 - dim)}"` : '';
  const z = api.Z0;
  if (lit < 0.01 && S.rise < 0.01) return { under: `<g${op}>${shape(api.rect(x - dx, y - dy, x + dx, y + dy, z + 0.15), CERAMIC.l, 0.55)}</g>` };
  const zb = z + (keep ? 4 * S.rise : 0);
  const top = zb + 0.8 + 2.4 * lit;
  const pal = pad ? SET_PALS[SLOT.left] : lit > 0.01 ? SET_PALS[SLOT.on] : CERAMIC;
  let svg = box(x - dx, y - dy, zb, x + dx, y + dy, top, pal, tone, 0.8);
  if (pad && sc > 0.6) svg += api.flatText(x + 0.8, y, top, 'NULL', 2.2, INK, 800, 'middle', 2 * dy - 0.8);
  return { part: { svg: `<g${op}>${svg}</g>`, box: [[x - dx, y - dy, z], [x + dx, y + dy, top]] } };
}


export default {
  n: 6,
  title: 'Every pair',
  topic: 'JOIN',
  starter: `SELECT pets.name, owners.name, owners.city
FROM pets
JOIN owners ON pets.owner_id = owners.id;`,
  challengeStarter: `SELECT pets.name, owners.name
FROM pets
JOIN owners ON `,

  overview: () => `
    <h3>Every pair</h3>
    <p>Read every query as <b>stages</b>, left to right on the grid. Each stage is a set of rows, made from the stages before it. A join has two: <b>1</b>, the raw tables, 12 pets and 5 owners; <b>2</b>, the joined rows.</p>
    <p>Stage 2 starts from the <b>Cartesian product</b> pets × owners: every pet paired with every owner, 12 × 5 = 60 cells. <code>ON</code> is checked on all 60 at the same moment, and each pair where it holds becomes one joined row: the pet’s columns next to the owner’s. A <code>WHERE</code> adds stage 3: the joined rows that pass.</p>
    <ul class="facts">
      <li><span class="ic">JOIN</span><span>Keep only the pairs where <code>ON</code> holds: a <b>subset</b> of pets × owners</span></li>
      <li><span class="ic">LEFT</span><span>Also keep every left row that matched <b>nothing</b>, with NULL in the other table’s columns</span></li>
      <li><span class="ic">WITH</span><span>Each stage is a CTE. The query card writes your query that way, with the stage numbers</span></li>
    </ul>`,
  notation: () => `
    <h3>SQL as set notation</h3>
    <p>A join is a product of two sets, then a condition on the pairs. Each line is one stage:</p>
    <table class="mapping"><thead><tr><th>Stage</th><th>SQL</th><th>Set notation</th></tr></thead><tbody>
      <tr><td>1 · raw tables</td><td>pets, owners</td><td>pets, owners</td></tr>
      <tr><td>2 · every pair</td><td>pets CROSS JOIN owners</td><td>pets × owners</td></tr>
      <tr><td>2 · joined</td><td>pets JOIN owners ON c</td><td>σ<sub>c</sub>(pets × owners)</td></tr>
      <tr><td>2 · joined</td><td>pets LEFT JOIN owners ON c</td><td>σ<sub>c</sub>(pets × owners) ∪ (unmatched pets × {NULL})</td></tr>
      <tr><td>3 · result</td><td>SELECT … FROM joined WHERE w</td><td>σ<sub>w</sub>(joined)</td></tr>
    </tbody></table>
    <p>σ (sigma) means “the rows where …”, the same subset as <code>WHERE</code> in lesson 1. A stage’s columns carry the table they came from, as in <code>pet_name</code> and <code>owner_city</code>, so later stages can tell the two <code>name</code> columns apart.</p>`,

  formula(sql) {
    const q = parseJoin(sql);
    if (!q) return '<span class="card">Write a <code>SELECT … FROM pets JOIN owners ON …</code> query to see it as stages.</span>';
    return cteHtml(q, planOf(q));
  },

  // Runs every stage of the plan on the live database, with each row's pair (pet id, owner id), and checks
  // that the last stage returns exactly the learner's rows. Any mismatch keeps the grid calm.
  analyze(db, sql, result) {
    const q = parseJoin(sql);
    if (!q || /\b(distinct|count|sum|avg|min|max|group_concat|total)\b/i.test(q.select) || /\b(group\s+by|having|union|intersect|except)\b/i.test(clean(sql))) return null;
    const exec = (text) => db.exec(text)[0] ?? { columns: [], values: [] };
    const on = q.on ? ` ON ${q.on}` : '';
    const sel = `SELECT ${q.pa}.id AS __p, ${q.oa}.id AS __o`;
    const matchedList = exec(`${sel} FROM ${q.t1}${q.a1 ? ` ${q.a1}` : ''} ${q.on ? 'JOIN' : 'CROSS JOIN'} ${q.t2}${q.a2 ? ` ${q.a2}` : ''}${on}`).values;
    const matched = new Set(matchedList.map(([p, o]) => keyOf(p, o)));
    let pads = [];
    if (q.type === 'LEFT') {
      const leftPets = q.t1 === 'pets';
      const hit = new Set(matchedList.map(([p, o]) => (leftPets ? p : o)));
      pads = (leftPets ? PETS : OWNERS).data.map((v) => v[0]).filter((id) => !hit.has(id)).map((id) => (leftPets ? [id, null] : [null, id]));
    }
    const plan = planOf(q);
    const stage = (r) => ({ cols: r.columns.slice(2), rows: r.values.map((v) => ({ key: keyOf(v[0], v[1]), values: v.slice(2) })) });
    const s2 = stage(exec(`${sel}, ${plan.s2.select} FROM ${plan.from}${on}`));
    let s3 = null;
    if (plan.s3) {
      const p3 = plan.s3;
      const body = p3.select === '*' ? plan.s2.names.join(', ') : p3.select;
      s3 = stage(exec(`WITH ${plan.s2.name} AS (${sel}, ${plan.s2.select} FROM ${plan.from}${on}) SELECT __p, __o, ${body} FROM ${plan.s2.name}${p3.where ? ` WHERE ${p3.where}` : ''}${p3.tail ? ` ${p3.tail}` : ''}`));
    }
    const last = s3 ?? s2;
    const ordered = /\border\s+by\b/i.test(q.tail);
    if (!sameRows(last.rows.map((r) => r.values), result.rows, ordered)) return null;
    return { q, plan, matched, pads, on: !!q.on, cols: q.on ? colsOf(q, q.on) : { pets: new Set(), owners: new Set() }, whereCols: q.where ? colsOf(q, q.where) : null, s2, s3 };
  },

  challenges: [
    {
      title: 'Hanoi pets',
      prompt: 'The Hanoi vet is calling every pet whose owner lives in Hanoi. Get each such pet’s name and its owner’s name.',
      hint: 'Join pets to owners on <code>pets.owner_id = owners.id</code>, then keep the joined rows with <code>WHERE owners.city = \'Hanoi\'</code>.',
      answer: "SELECT pets.name, owners.name FROM pets JOIN owners ON pets.owner_id = owners.id WHERE owners.city = 'Hanoi'",
    },
    {
      title: 'Strays too',
      prompt: 'Make a list of every pet with its owner’s name, strays included. A stray has no owner, so its owner name is NULL.',
      hint: 'An inner join drops the 3 strays: no pair matches them. <code>LEFT JOIN</code> keeps every row of the left table, with NULL where nothing matched.',
      answer: 'SELECT pets.name, owners.name FROM pets LEFT JOIN owners ON pets.owner_id = owners.id',
    },
    {
      title: 'No pets yet',
      prompt: 'Find the owners who have no pet at all. Get their names.',
      hint: 'Put <code>owners</code> on the left of a <code>LEFT JOIN</code>: an owner with no match gets NULL in every pet column. Keep those rows with <code>WHERE pets.id IS NULL</code>.',
      answer: 'SELECT owners.name FROM owners LEFT JOIN pets ON pets.owner_id = owners.id WHERE pets.id IS NULL',
    },
  ],

  scene: {
    board: { x0: -36, x1: 196, y0: -300, y1: 16 },

    setup(api) {
      A = api;
      const pw = api.measure(PET_COLS, PETS.data);
      const ow = api.measure(OWN_COLS, OWNERS.data);
      A.petsW = api.band(pw, PETS.data.length, X.x1 - X.x0);
      A.ownersW = api.band(ow, OWNERS.data.length, X.x1 - X.x0);
      api.region({ id: 'pets', area: { ...X, y0: 0, y1: 0 }, title: 'PETS', header: { cols: PET_COLS, widths: pw }, tag: () => [`PETS: ${plural(PETS.data.length, 'ROW')}`, S.on] });
      api.region({ id: 'owners', area: { ...X, y0: 0, y1: 0 }, title: 'OWNERS', header: { cols: OWN_COLS, widths: ow }, tag: () => [`OWNERS: ${plural(OWNERS.data.length, 'ROW')}`, S.on] });
      api.region({ id: 's2', area: { ...X, y0: 0, y1: 0 }, title: 'RESULT', tag: () => [regionTagText(S.an?.plan.s2.name ?? 'result', S.s2Count), S.s2Count != null && !S.an?.s3] });
      api.region({ id: 's3', area: { ...X, y0: 0, y1: 0 }, title: 'RESULT', hidden: true, tag: () => [regionTagText('result', S.s3Count), S.s3Count != null] });
      PETS.data.forEach((values) => api.row({ key: `p${values[0]}`, cols: PET_COLS, values, widths: pw, region: 'pets' }));
      OWNERS.data.forEach((values) => api.row({ key: `o${values[0]}`, cols: OWN_COLS, values, widths: ow, region: 'owners' }));
      place(api, DEFAULT_W, null);
    },

    // Back to the starter's two stages, with an empty result.
    reset(api) {
      S = fresh();
      if (!A?.petsW) return;
      const s2 = api.regions.find((r) => r.id === 's2');
      Object.assign(s2, { title: 'RESULT', header: null });
      place(api, DEFAULT_W, null);
    },

    draw(api) {
      if (!S.an || !S.M || S.appear < 0.01) return {};
      const M = S.M;
      let under = '';
      const parts = [];
      const add = (c) => {
        if (!c) return;
        if (c.under) under += c.under;
        else parts.push(c.part);
      };
      for (const p of M.pets) for (const o of M.owners) if (p != null && o != null) add(cell(api, M.x.get(p), M.y.get(o), keyOf(p, o), false));
      for (const [p, o] of S.an.pads) add(cell(api, M.x.get(p), M.y.get(o), keyOf(p, o), true));
      // the axes: pet names down the side, owner names across the top
      const z = api.Z0 + 0.1;
      const a = 1 - S.fade;
      let labels = '';
      for (const p of M.pets) labels += api.flatText(M.x.get(p) + 1, M.a.y1 - 2, z, p == null ? 'NULL' : esc(PETS.data.find((v) => v[0] === p)[1]), 2.7, INK, 700, 'start', 16);
      for (const o of M.owners) labels += api.flatText(M.a.x0 + 7, M.y.get(o), z, o == null ? 'NULL' : esc(OWNERS.data.find((v) => v[0] === o)[1]), 2.7, INK, 700, 'middle', M.ch);
      under += `<g opacity="${f(a * Math.min(1, S.appear))}">${labels}</g>`;
      return { under, parts };
    },

    async play(result, api, live) {
      const an = result.analysis;
      if (!an) return;
      S.an = an;
      const xLen = X.x1 - X.x0;
      const w2 = api.measure(an.s2.cols, an.s2.rows.map((r) => r.values));
      const w3 = an.s3 && api.measure(an.s3.cols, an.s3.rows.map((r) => r.values));
      const band2 = Math.max(MATRIX_W, api.band(w2, Math.max(1, an.s2.rows.length), xLen));
      const band3 = an.s3 ? api.band(w3, Math.max(1, an.s3.rows.length), xLen) : null;
      const reg = new Map(api.regions.map((r) => [r.id, r]));
      reg.get('s2').title = an.plan.s2.name.toUpperCase();
      const st = place(api, band2, band3, { s2: an.plan.s2.name, s3: 'result' });
      S.M = matrixOf(reg.get('s2').area, an);

      const legend = [
        { slot: SLOT.product, code: 'pets × owners', note: 'stage 2 starts from every pair', count: '', state: 'is-pending' },
        ...(an.on ? [{ slot: SLOT.on, code: `ON ${an.q.on}`, note: 'the pairs it keeps', count: '', state: 'is-pending' }] : []),
        ...(an.pads.length ? [{ slot: SLOT.left, code: 'LEFT JOIN', note: `each ${an.q.t1 === 'pets' ? 'pet' : 'owner'} with no match, next to NULL`, count: '', state: 'is-pending' }] : []),
        ...(an.s3 && an.q.where ? [{ slot: SLOT.where, code: `WHERE ${an.q.where}`, note: 'stage 2 → 3', count: '', state: 'is-pending' }] : []),
      ];
      const fin = { final: true, text: '', count: '', state: 'is-pending' };
      const show = () => api.legend([...legend, fin]);
      const step = (slot, count) => {
        legend.forEach((r) => r.state === 'is-active' && (r.state = 'is-done'));
        const r = legend.find((x) => x.slot === slot);
        if (r) Object.assign(r, { state: 'is-active', count });
        show();
      };
      show();

      // stage 1: the raw tables, with the columns ON reads lit on every row at once
      await api.focus(st[0].area);
      if (!live()) return;
      S.on = true;
      const c1 = an.on ? SLOT.on : SLOT.product;
      await Promise.all([api.flash('pets', c1, an.cols.pets), api.flash('owners', c1, an.cols.owners)]);
      if (!live()) return;

      // stage 2: every pair appears, ON keeps the matching ones
      await api.focus(union(st[0].area, st[1].area));
      if (!live()) return;
      step(SLOT.product, PETS.data.length * OWNERS.data.length);
      await api.tween(420, (t) => (S.appear = api.ease(t)));
      if (!live()) return;
      await api.wait(300);
      if (an.on) {
        step(SLOT.on, an.matched.size);
        await api.tween(380, (t) => (S.match = api.ease(t)));
        if (!live()) return;
      }
      await Promise.all([api.unflash('pets'), api.unflash('owners')]);
      if (an.pads.length) {
        step(SLOT.left, an.pads.length);
        await api.tween(320, (t) => (S.pad = api.ease(t)));
        if (!live()) return;
      }
      await api.tween(320, (t) => (S.rise = api.ease(t)));
      if (!live()) return;
      await api.focus(st[1].area);
      if (!live()) return;

      // the kept pairs become stage 2's rows, all together, while the grid fades
      const M = S.M;
      const at = (key) => {
        const [p, o] = key.split('|').map((v) => (v === 'null' ? null : Number(v)));
        return [M.x.get(p) ?? M.x.get(null), M.y.get(o) ?? M.y.get(null)];
      };
      const sample = { cols: an.s2.cols, widths: w2 };
      const spots = an.s2.rows.length ? api.slots('s2', sample, an.s2.rows.length) : [];
      const rows2 = an.s2.rows.map((r, i) => {
        const [x, y] = at(r.key);
        return { t: api.row({ key: `j${i}`, cols: an.s2.cols, values: r.values, widths: w2, region: 's2', x, y, z: api.Z0 + 4, dim: 1, temp: true }), from: [x, y], to: spots[i], key: r.key };
      });
      await api.tween(900, (t) => {
        const e = api.ease(t);
        S.fade = e;
        rows2.forEach(({ t: row, from, to }) => Object.assign(row, { x: api.lerp(from[0], to[0], e), y: api.lerp(from[1], to[1], e), z: api.lerp(api.Z0 + 4, api.Z0, e) + Math.sin(Math.PI * e) * 14, dim: 1 - e }));
      });
      if (!live()) return;
      reg.get('s2').header = { cols: an.s2.cols, widths: w2 };
      S.s2Count = an.s2.rows.length;
      fin.text = an.s3 ? `stage 2, ${an.plan.s2.name}: one row per kept pair` : 'The result: one row per kept pair';
      fin.count = an.s2.rows.length;
      fin.state = an.s3 ? 'is-pending' : 'is-done';
      legend.forEach((r) => r.state === 'is-active' && (r.state = 'is-done'));
      show();
      api.invalidate();

      // stage 3: the joined rows that pass WHERE, sorted or cut by the tail, copied on
      if (an.s3) {
        await api.wait(300);
        await api.focus(union(st[1].area, st[2].area));
        if (!live()) return;
        const keep = new Map(an.s3.rows.map((r, i) => [r.key, i]));
        if (an.q.where) {
          step(SLOT.where, an.s3.rows.length);
          const lit = new Set([...an.whereCols.pets].map((c) => pre('pets', c)).concat([...an.whereCols.owners].map((c) => pre('owners', c))));
          await api.flash('s2', SLOT.where, lit);
          if (!live()) return;
        }
        const kept = rows2.filter((r) => keep.has(r.key));
        await Promise.all([
          api.tween(520, (x) => rows2.forEach((r) => (keep.has(r.key) ? (r.t.lift = 5 * api.ease(x)) : (r.t.dim = api.ease(x))))),
          an.q.where ? api.unflash('s2') : null,
        ]);
        if (!live()) return;
        // cells stage 3 doesn't select fade first
        const drop = an.s2.cols.filter((c) => !an.s3.cols.includes(c));
        if (drop.length && an.s3.cols.every((c) => an.s2.cols.includes(c))) {
          await api.tween(320, (x) => kept.forEach((r) => drop.forEach((c) => (r.t.fade[c] = api.ease(x)))));
          if (!live()) return;
        }
        const sample3 = { cols: an.s3.cols, widths: w3 };
        const spots3 = an.s3.rows.length ? api.slots('s3', sample3, an.s3.rows.length) : [];
        const copies = kept.map((r) => {
          const i = keep.get(r.key);
          const z = api.bodyZ(r.t);
          return { c: api.row({ key: `r${i}`, cols: an.s3.cols, values: an.s3.rows[i].values, widths: w3, region: 's3', x: r.t.x, y: r.t.y, z, temp: true }), from: [r.t.x, r.t.y, z], to: spots3[i] };
        });
        await api.tween(900, (x) => {
          const e = api.ease(x);
          copies.forEach(({ c, from, to }) => Object.assign(c, { x: api.lerp(from[0], to[0], e), y: api.lerp(from[1], to[1], e), z: api.lerp(from[2], api.Z0, e) + Math.sin(Math.PI * e) * 30 }));
        });
        if (!live()) return;
        reg.get('s3').header = { cols: an.s3.cols, widths: w3 };
        S.s3Count = an.s3.rows.length;
        fin.text = 'Stage 3, the result: the joined rows that pass';
        fin.count = an.s3.rows.length;
        fin.state = 'is-done';
        legend.forEach((r) => r.state === 'is-active' && (r.state = 'is-done'));
        show();
        api.invalidate();
      }
      await api.wait(500);
      if (!live()) return;
      await api.overview();
    },
  },
};
