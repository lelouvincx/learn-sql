// Lesson 4, The unknown: NULL, drawn as a pipeline of stages.
//
// NULL means "unknown", and a test on an unknown is neither true nor false.
// The query reads as two stages, the way a WITH query reads:
//   1 · pets      the table as stored. Each WHERE condition lights the field it
//                 reads on every row at once, and every row gets one of three
//                 answers: TRUE (a plate in the condition's colour), FALSE (no
//                 plate) or UNKNOWN (a "?" badge). The UNKNOWN rows are not a
//                 step of the query, so they stay on this board: they get a
//                 dashed ghost plate and are pushed aside into its UNKNOWN pile.
//   2 · <name>    the result: only the TRUE rows, copied over from stage 1.
// The query card shows the same pipeline as a WITH query, which is checked to
// return the learner's rows.
import { splitCondition } from '../db.js';
import { SET_PALS, table } from '../data.js';
import { clean, countTag, cteCard, esc, placeStages, plural, sameRows, setChip, sqlComment as com, sqlHtml, union } from './common.js';

const PETS = table('pets');
const OWNERS = table('owners');
const COLS = PETS.cols.map((c) => c.name);
const X = { x0: 0, x1: 172 }; // every region's extent along x: rows lie in lanes along it
const DEFAULT = { t: 6, u: 3 }; // the starter's TRUE and UNKNOWN rows, to size the boards before a run
const GHOST_PAD = 1.6;
const BADGE = 7;

// The columns a condition reads, e.g. "owner_id IS NULL" reads owner_id.
const colsOf = (text) => new Set((text.replace(/'[^']*'/g, '').match(/\b(id|name|species|age|owner_id)\b/gi) ?? []).map((c) => c.toLowerCase()));

// `x = NULL`, `x <> NULL`, `x != NULL`: a comparison with an unknown, never TRUE.
const comparesNull = (text) => /(=|<>|!=|<|>)\s*null\b|\bnull\s*(=|<>|!=|<|>)/i.test(text.replace(/'[^']*'/g, ''));

// Each pet's answer to a condition: 1 (TRUE), 0 (FALSE) or null (UNKNOWN).
function answers(db, cond) {
  const sql = `SELECT id, CASE WHEN (${cond}) THEN 1 WHEN NOT (${cond}) THEN 0 ELSE NULL END FROM pets`;
  const tv = new Map((db.exec(sql)[0]?.values ?? []).map(([id, v]) => [id, v]));
  const n = (want) => [...tv.values()].filter((v) => v === want).length;
  return { tv, t: n(1), f: n(0), u: n(null) };
}

const WORD = { 1: 'TRUE', 0: 'FALSE', null: 'UNKNOWN' };
const MARK = { 1: '✓', 0: '✗', null: '?' };

// ---------- the query as stages ----------
// `SELECT * | col, col FROM pets [WHERE …] [ORDER BY …]`: the lesson's pattern. LIMIT would cut TRUE rows, so it is out.
function parse(sql, parsed) {
  if (!parsed || parsed.table.toLowerCase() !== 'pets' || /\b(limit|offset)\b/i.test(parsed.tail)) return null;
  const sel = parsed.columns.trim();
  const cols = sel === '*' ? COLS : sel.split(',').map((c) => c.trim().toLowerCase());
  if (!cols.every((c) => COLS.includes(c)) || /\b(group|having|union|intersect|except)\b/i.test(clean(sql))) return null;
  return { select: sel, cols, where: parsed.where, tail: parsed.tail };
}

// A short CTE name a learner could type for the TRUE rows, e.g. owner_id <> 2 -> not_bao.
const ownerName = (id) => OWNERS.data.find((v) => v[0] === Number(id))?.[1].toLowerCase().replace(/\W+/g, '_');
function stageName(where) {
  if (!where) return 'all_pets';
  const w = where.replace(/\s+/g, ' ').trim();
  let m;
  if (/^owner_id is null$/i.test(w)) return 'strays';
  if (/^owner_id is not null$/i.test(w)) return 'owned';
  if ((m = w.match(/^owner_id ?(?:<>|!=) ?(\d+)$/i)) && ownerName(m[1])) return `not_${ownerName(m[1])}`;
  if ((m = w.match(/^owner_id ?= ?(\d+)$/i)) && ownerName(m[1])) return `${ownerName(m[1])}_pets`;
  if ((m = w.match(/^species ?= ?'([a-z]+)'$/i))) return /(s|sh)$/i.test(m[1]) ? m[1].toLowerCase() : `${m[1].toLowerCase()}s`;
  // two parts: species AND owned -> owned_cats; not_ana OR strays -> not_ana_or_stray
  const { parts, ops } = splitCondition(w);
  if (parts.length === 2) {
    const [a, b] = parts.map(stageName).sort((x, y) => (x === 'owned' || x === 'strays' ? 1 : y === 'owned' || y === 'strays' ? -1 : 0));
    if (ops[0] === 'AND' && b === 'owned' && !['kept', 'owned', 'strays'].includes(a) && !a.includes('_')) return `owned_${a}`;
    if (ops[0] === 'OR' && b === 'strays' && a.startsWith('not_')) return `${a}_or_stray`;
  }
  return 'kept';
}

// The WHERE condition with each top-level part on its set colour, joined by AND / OR.
function condHtml(where) {
  const { parts, ops } = splitCondition(where);
  return parts.map((p, i) => `${i ? ` ${sqlHtml(ops[i - 1])} ` : ''}${setChip(i, esc(p))}`).join('');
}

function cteHtml(q, name) {
  const lines = [com(`1 · pets: as stored, ${PETS.data.length} rows`)];
  lines.push(`${sqlHtml(`WITH ${name} AS (`)}  ${com(`2 · ${name}`)}`);
  lines.push(`  ${sqlHtml(`SELECT ${q.select}`)}`);
  lines.push(`  ${sqlHtml('FROM pets')}`);
  if (q.where) lines.push(`  ${sqlHtml('WHERE')} ${condHtml(q.where)}`);
  lines.push(')');
  lines.push(`${sqlHtml(`SELECT * FROM ${name}${q.tail ? ` ${q.tail}` : ''}`)};`);
  return cteCard(lines);
}

// ---------- the run's state, cleared before every run ----------
let resultCount = null;
let unknownCount = null;
let lit = false;
let atoms = [];
let A = null; // the engine api, kept for sizing

// Stage 1 holds the UNKNOWN pile (far from stage 2, so its rows are pushed away from the result) and pets;
// stage 2 holds the result.
function place(api, t, u, name) {
  const xLen = X.x1 - X.x0;
  const resW = A.resWidths ?? A.petW;
  return placeStages(api, X, [
    { name: 'pets', note: 'as stored · UNKNOWN rows pushed aside, left out', regions: [['unknown', api.band(A.petW, Math.max(1, u), xLen)], ['pets', A.petsBand]] },
    { name, note: 'WHERE: only the TRUE rows', regions: [['result', api.band(resW, Math.max(1, t), xLen)]] },
  ]);
}

export default {
  n: 4,
  title: 'The unknown',
  topic: 'NULL',
  starter: `SELECT *
FROM pets
WHERE owner_id <> 2;`,
  challengeStarter: `SELECT *
FROM pets
WHERE `,

  overview: () => `
    <h3>The unknown</h3>
    <p>Three pets are strays: their <code>owner_id</code> is <b>NULL</b>. NULL is not zero and not empty. It means <b>unknown</b>: we don’t know who the owner is.</p>
    <p>A test on an unknown has no yes-or-no answer. Is a stray’s owner “not Bao”? Nobody knows, so the answer is <b>UNKNOWN</b>. Read the query as two <b>stages</b>: <b>1</b>, pets as stored, where every row lands in one of three groups; <b>2</b>, the result, which keeps only one of them.</p>
    <ul class="facts">
      <li><span class="ic">TRUE</span><span>Gets a plate and is <b>kept</b>: it is copied to stage 2</span></li>
      <li><span class="ic">FALSE</span><span>No plate: left out</span></li>
      <li><span class="ic">?</span><span><b>UNKNOWN</b>: a NULL in the test. Pushed aside on stage 1, left out too</span></li>
    </ul>
    <p><code>owner_id = NULL</code> asks “is the owner equal to an unknown?”, which is UNKNOWN for every row, so the result is ∅. To find the strays, write <code>owner_id IS NULL</code>: it is always TRUE or FALSE.</p>`,
  notation: () => `
    <h3>Three-valued logic</h3>
    <p>With NULL, a condition has three answers: T (TRUE), F (FALSE) and ? (UNKNOWN). <code>WHERE</code> keeps the rows that answer T, so stage 2 is <code>{ p ∈ pets | a is T }</code>.</p>
    <table class="mapping"><thead><tr><th>a</th><th>NOT a</th></tr></thead><tbody>
      <tr><td>T</td><td>F</td></tr><tr><td>F</td><td>T</td></tr><tr><td>?</td><td>?</td></tr>
    </tbody></table>
    <table class="mapping"><thead><tr><th>a AND b</th><th>b = T</th><th>b = F</th><th>b = ?</th></tr></thead><tbody>
      <tr><td>a = T</td><td>T</td><td>F</td><td>?</td></tr>
      <tr><td>a = F</td><td>F</td><td>F</td><td>F</td></tr>
      <tr><td>a = ?</td><td>?</td><td>F</td><td>?</td></tr>
    </tbody></table>
    <table class="mapping"><thead><tr><th>a OR b</th><th>b = T</th><th>b = F</th><th>b = ?</th></tr></thead><tbody>
      <tr><td>a = T</td><td>T</td><td>T</td><td>T</td></tr>
      <tr><td>a = F</td><td>T</td><td>F</td><td>?</td></tr>
      <tr><td>a = ?</td><td>T</td><td>?</td><td>?</td></tr>
    </tbody></table>
    <p>F AND anything is F, and T OR anything is T: the unknown can’t change those. Everything else with a ? stays ?.</p>
    <table class="mapping"><thead><tr><th>SQL</th><th>Means</th><th>Answer</th></tr></thead><tbody>
      <tr><td>x = NULL</td><td>Equal to an unknown?</td><td>always ?</td></tr>
      <tr><td>x IS NULL</td><td>Is x unknown?</td><td>T or F</td></tr>
      <tr><td>x IS NOT NULL</td><td>Is x known?</td><td>T or F</td></tr>
      <tr><td>COALESCE(x, 0)</td><td>x, or 0 when x is NULL</td><td>never NULL</td></tr>
    </tbody></table>`,

  // The query as stages, written as a WITH query: stage 2 is the rows where the condition is TRUE.
  formula(sql, parsed) {
    const q = parse(sql, parsed);
    if (!q) return '<span class="card">Write a <code>SELECT … FROM pets WHERE …</code> query to see it as stages.</span>';
    if (!q.where) return `${cteHtml(q, stageName(null))}<span class="card">no condition: stage 2 is the whole set</span>`;
    const note = splitCondition(q.where).parts.some(comparesNull)
      ? 'a comparison with NULL is UNKNOWN (?) for every row, never TRUE. To test for NULL, write <code>IS NULL</code>'
      : 'stage 2 keeps only the rows where WHERE is TRUE; FALSE and UNKNOWN (?) rows are dropped';
    return `${cteHtml(q, stageName(q.where))}<span class="card">${note}</span>`;
  },

  // Each top-level condition's answer for every pet (TRUE, FALSE or UNKNOWN), and the whole WHERE's. Runs
  // stage 2 as a real WITH query and returns null unless it gives exactly the learner's rows.
  analyze(db, sql, result) {
    const q = parse(sql, result.parsed);
    if (!q) return null;
    const name = stageName(q.where);
    const out = db.exec(`WITH ${name} AS (SELECT id AS __id, ${q.select} FROM pets${q.where ? ` WHERE ${q.where}` : ''}) SELECT * FROM ${name}${q.tail ? ` ${q.tail}` : ''}`)[0];
    const s2 = { cols: q.cols, rows: (out?.values ?? []).map((v) => ({ id: v[0], values: v.slice(1) })) };
    if (!sameRows(s2.rows.map((r) => r.values), result.rows, /\border\s+by\b/i.test(q.tail))) return null;
    const all = answers(db, q.where ?? '1');
    // stage 2 must be exactly the TRUE rows, one per pet
    if (s2.rows.length !== all.t || !s2.rows.every((r) => all.tv.get(r.id) === 1)) return null;
    if (!q.where) return { q, name, s2, atoms: [], ops: [], all };
    const { parts, ops } = splitCondition(q.where);
    return { q, name, s2, ops, atoms: parts.map((text) => ({ text, ...answers(db, text) })), all };
  },

  challenges: [
    {
      title: 'The strays',
      prompt: 'The shelter wants a list of the strays: every pet with no owner on record.',
      hint: 'A stray’s <code>owner_id</code> is NULL. <code>owner_id = NULL</code> is UNKNOWN for every row, so it finds nothing. Ask <code>IS NULL</code> instead.',
      answer: 'SELECT * FROM pets WHERE owner_id IS NULL',
    },
    {
      title: 'Not Ana’s',
      prompt: 'Ana is moving away. Get every pet that is not Ana’s (owner 1), and count the strays in: they are not Ana’s either.',
      hint: '<code>owner_id &lt;&gt; 1</code> is UNKNOWN for the strays, so they get pushed aside. Add them back with <code>OR owner_id IS NULL</code>, or turn NULL into a real value first: <code>COALESCE(owner_id, 0) &lt;&gt; 1</code>.',
      answer: 'SELECT * FROM pets WHERE owner_id <> 1 OR owner_id IS NULL',
    },
    {
      title: 'Cats with a home',
      prompt: 'The vet sends reminders to owners. Get every cat that has an owner.',
      hint: 'You want the overlap of two sets: the cats, and the pets whose <code>owner_id</code> is known. <code>IS NOT NULL</code> is never UNKNOWN.',
      answer: "SELECT * FROM pets WHERE species = 'cat' AND owner_id IS NOT NULL",
    },
  ],

  scene: {
    board: { x0: -36, x1: 196, y0: -300, y1: 16 },

    setup(api) {
      A = api;
      A.petW = api.measure(COLS, PETS.data);
      A.petsBand = api.band(A.petW, PETS.data.length, X.x1 - X.x0);
      const header = { cols: COLS, widths: A.petW };
      api.region({ id: 'pets', area: { ...X, y0: 0, y1: 0 }, title: 'PETS', header, tag: () => [`PETS: ${plural(PETS.data.length, 'ROW')}`, lit] });
      api.region({
        id: 'unknown',
        area: { ...X, y0: 0, y1: 0 },
        title: 'UNKNOWN ?',
        header,
        scatter: false,
        tag: () => [unknownCount == null ? 'UNKNOWN: LEFT OUT' : `UNKNOWN: ${unknownCount ? plural(unknownCount, 'ROW') : 'NO ROWS'}, LEFT OUT`, !!unknownCount],
      });
      api.region({ id: 'result', area: { ...X, y0: 0, y1: 0 }, title: 'NOT_BAO', header, tag: () => [countTag(A.stageName ?? 'not_bao', resultCount), !!resultCount] });
      PETS.data.forEach((values) => api.row({ key: `p${values[0]}`, cols: COLS, values, widths: A.petW, region: 'pets' }));
      place(api, DEFAULT.t, DEFAULT.u, 'not_bao');
    },

    // Back to the starter's stages, with an empty result.
    reset(api) {
      resultCount = null;
      unknownCount = null;
      lit = false;
      atoms = [];
      // the ghost plate and "?" badges are this lesson's own row state; the engine doesn't reset them
      api.rows.forEach((t) => Object.assign(t, { ghost: 0, q: {} }));
      if (!A?.petW) return;
      A.stageName = 'not_bao';
      A.resWidths = null;
      Object.assign(api.regions.find((r) => r.id === 'result'), { title: 'NOT_BAO', header: { cols: COLS, widths: A.petW } });
      place(api, DEFAULT.t, DEFAULT.u, 'not_bao');
    },

    // A dashed ghost plate under every UNKNOWN row, and a "?" badge, in the condition's colour,
    // for every condition a row answered UNKNOWN.
    draw(api) {
      let under = '';
      const zg = api.Z0 + 0.15;
      for (const t of api.rows) {
        if (t.hidden) continue;
        const [hd, hw] = api.half(t);
        if (t.ghost > 0.01) {
          const d = pd(api.rect(t.x - hd - GHOST_PAD, t.y - hw - GHOST_PAD, t.x + hd + GHOST_PAD, t.y + hw + GHOST_PAD, zg));
          under += `<path d="${d}" fill="${CERAMIC.l}" fill-opacity="${f(0.7 * t.ghost)}" stroke="${INK}" stroke-opacity="${f(t.ghost)}" stroke-width=".9" stroke-dasharray="2.4 1.8"/>`;
        }
        Object.entries(t.q ?? {}).forEach(([slot, a], i) => {
          if (a < 0.01) return;
          const yc = t.y + hw + 5.2 + i * (BADGE + 1.4);
          const s = BADGE / 2;
          under += `<g opacity="${f(a)}">${shape(api.rect(t.x - s, yc - s, t.x + s, yc + s, zg), SET_PALS[slot % SET_PALS.length].l, 0.8)}${api.flatText(t.x + 2, yc, zg, '?', 5.8, INK, 800)}</g>`;
        });
      }
      return { under };
    },

    tip(t) {
      if (t.cols.length !== COLS.length) return undefined; // a stage 2 row with picked columns: the default tooltip
      const [id, name, species, age, owner] = t.values;
      const own = atoms.map((a) => `<br>${MARK[a.tv.get(id)]} ${esc(a.text)}: ${WORD[a.tv.get(id)]}`).join('');
      return `<b>${esc(name)}</b>${esc(species)} · age ${age} · owner_id ${owner ?? 'NULL'}${own}`;
    },

    async play(result, api, live) {
      const an = result.analysis;
      if (!an) return;
      atoms = an.atoms;
      // stage 2's cells keep the width they have in pets, so a copied row looks the same
      const w2 = an.s2.cols.map((c) => A.petW[COLS.indexOf(c)]);
      A.stageName = an.name;
      A.resWidths = w2;
      Object.assign(api.regions.find((r) => r.id === 'result'), { title: an.name.toUpperCase(), header: { cols: an.s2.cols, widths: w2 } });
      const st = place(api, an.all.t, an.all.u, an.name);
      const pets = api.rows.filter((t) => t.region === 'pets' && !t.temp);
      const verdict = (t) => an.all.tv.get(t.values[0]);
      const legend = {
        atoms: atoms.map((a) => ({ text: a.text, state: 'is-pending', count: '', note: '' })),
        final: 'is-pending',
      };
      const show = () => {
        const fin = legend.final;
        const c = (n) => (fin === 'is-done' ? n : '');
        api.legend([
          ...legend.atoms.map((a, k) => ({ slot: k, code: a.text, note: a.note, count: a.count, state: a.state })),
          { final: true, sym: '✓', text: `TRUE: kept, copied to stage 2, ${an.name}`, count: c(an.all.t), state: fin },
          { final: true, sym: '✗', text: 'FALSE: no plate, left out', count: c(an.all.f), state: fin },
          { final: true, sym: '?', text: 'UNKNOWN: pushed aside on stage 1, left out too', count: c(an.all.u), state: fin },
        ]);
      };
      show();

      // stage 1: each condition washes over the whole table at once: every TRUE row gets plate k and
      // every UNKNOWN row gets a "?" badge in colour k, at the same moment.
      await api.focus(st[0].area);
      if (!live()) return;
      for (const [k, atom] of atoms.entries()) {
        const row = legend.atoms[k];
        row.state = 'is-active';
        show();
        lit = true;
        await api.flash('pets', k, colsOf(atom.text));
        if (!live()) return;
        const yes = pets.filter((t) => atom.tv.get(t.values[0]) === 1);
        const unk = pets.filter((t) => atom.tv.get(t.values[0]) == null);
        row.count = atom.t;
        row.note = `${atom.f} false · ${atom.u} unknown${atom.u ? ' (?)' : ''}`;
        show();
        unk.forEach((t) => (t.q[k] = 0));
        await Promise.all([
          api.popPlates(yes, k % SET_PALS.length),
          api.tween(320, (x) => unk.forEach((t) => (t.q[k] = api.ease(x)))),
          api.unflash('pets'),
        ]);
        if (!live()) return;
        row.state = 'is-done';
        show();
        await api.wait(320);
        if (!live()) return;
      }
      lit = false;

      // The verdict: TRUE rows rise, FALSE rows fade, UNKNOWN rows get a ghost plate, together.
      const kept = pets.filter((t) => verdict(t) === 1);
      const dropped = pets.filter((t) => verdict(t) === 0);
      const unknown = pets.filter((t) => verdict(t) == null);
      legend.final = 'is-done';
      show();
      await api.tween(520, (x) => {
        const e = api.ease(x);
        kept.forEach((t) => (t.lift = 6 * e));
        dropped.forEach((t) => (t.dim = e));
        unknown.forEach((t) => (t.ghost = e));
      });
      if (!live()) return;
      // cells stage 2 doesn't select fade first
      const drop = COLS.filter((c) => !an.s2.cols.includes(c));
      if (drop.length && kept.length) {
        await api.tween(320, (x) => kept.forEach((t) => drop.forEach((c) => (t.fade[c] = api.ease(x)))));
        if (!live()) return;
      }
      await api.focus(union(st[0].area, st[1].area));
      if (!live()) return;

      // The TRUE rows fly to stage 2 while the UNKNOWN rows are pushed aside into stage 1's pile, all at once.
      const byId = new Map(kept.map((t) => [t.values[0], t]));
      const spots2 = an.s2.rows.length ? api.slots('result', { cols: an.s2.cols, widths: w2 }, an.s2.rows.length) : [];
      const copies = an.s2.rows.map((r, i) => {
        const t = byId.get(r.id);
        const z = api.bodyZ(t);
        return { c: api.row({ key: `r${r.id}`, cols: an.s2.cols, values: r.values, widths: w2, region: 'result', x: t.x, y: t.y, z, temp: true }), from: [t.x, t.y, z], to: spots2[i] };
      });
      const spotsU = unknown.length ? api.slots('unknown', unknown[0], unknown.length) : [];
      const aside = unknown.map((t, i) => {
        const c = api.copy(t, { region: 'unknown', ghost: 1, q: { ...t.q } });
        t.hidden = true;
        return { c, from: [t.x, t.y, api.bodyZ(t)], to: spotsU[i] };
      });
      await api.tween(900, (x) => {
        const e = api.ease(x);
        copies.forEach(({ c, from, to }) => Object.assign(c, { x: api.lerp(from[0], to[0], e), y: api.lerp(from[1], to[1], e), z: api.lerp(from[2], api.Z0, e) + Math.sin(Math.PI * e) * 30 }));
        aside.forEach(({ c, from, to }) => Object.assign(c, { x: api.lerp(from[0], to[0], e), y: api.lerp(from[1], to[1], e), z: api.lerp(from[2], api.Z0, e) + Math.sin(Math.PI * e) * 14 }));
      });
      if (!live()) return;
      resultCount = an.s2.rows.length;
      unknownCount = unknown.length;
      api.invalidate();
      await api.wait(500);
      if (!live()) return;
      await api.overview();
    },
  },
};
