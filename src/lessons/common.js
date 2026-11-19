// Small helpers the lesson modules share.
import { SET_PALS } from '../data.js';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Text on set colour k (0…3), as used in the formula and the legend: <span class="set-chip set-1">…</span>.
export const setChip = (k, html, tag = 'span') => `<${tag} class="set-chip set-${(k % SET_PALS.length) + 1}">${html}</${tag}>`;

// The query with comments and the final semicolon removed, on one line, for matching clauses.
export const clean = (sql) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().replace(/;\s*$/, '');

// ---------- stages: every query read as a pipeline of sets, the way a chain of CTEs reads ----------
// A lesson splits its query into stages: 1 · the raw tables, then one stage per step (filter, join,
// group, …), each a set of rows made from the stages before it. The board draws each stage as its
// own board, left to right; the query card writes the same stages as a WITH query.

export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 'S'}`;
// A region's tag: its name, then its row count once the run has filled it.
export const countTag = (name, n) => (n == null ? name.toUpperCase() : n ? `${name.toUpperCase()}: ${plural(n, 'ROW')}` : `${name.toUpperCase()}: EMPTY SET`);
// The rectangle that covers several areas, to frame two neighbouring stages with api.focus.
export const union = (...areas) => ({
  x0: Math.min(...areas.map((a) => a.x0)),
  x1: Math.max(...areas.map((a) => a.x1)),
  y0: Math.min(...areas.map((a) => a.y0)),
  y1: Math.max(...areas.map((a) => a.y1)),
});

export const STAGE_GAP = 52; // between stages: bare floor between their boards
export const REGION_GAP = 16; // between the regions of one stage
// Lay stages out left to right (toward -y), the regions of a stage side by side, over x extent X.
// spec: [{ name, note?, regions: [[regionId, widthAlongY], …] }]. Regions in no stage are hidden.
// Sets api.stages and api.board, and returns the stages (each with its area, for api.focus).
export function placeStages(api, X, spec) {
  const reg = new Map(api.regions.map((r) => [r.id, r]));
  const shown = new Set();
  let y = 0;
  const stages = spec.map((st) => {
    const y1 = y;
    for (const [id, w] of st.regions) {
      Object.assign(reg.get(id), { area: { ...X, y1: y, y0: y - w }, hidden: false });
      shown.add(id);
      y -= w + REGION_GAP;
    }
    const y0 = y + REGION_GAP;
    y = y0 - STAGE_GAP;
    return { name: st.name, note: st.note, area: { ...X, y0, y1 } };
  });
  for (const r of api.regions) if (!shown.has(r.id)) r.hidden = true;
  api.stages = stages;
  api.board({ x0: X.x0 - 36, x1: X.x1 + 24, y0: stages.at(-1).area.y0 - 16, y1: 16 });
  return stages;
}

// SQL as HTML for the query card: keywords bold, strings coloured. Wrap conditions in setChip yourself.
const KW = /\b(with|as|select|distinct|from|join|left|inner|cross|outer|on|where|and|or|not|order|by|limit|offset|is|null|asc|desc|in|like|between|group|having|count|sum|avg|min|max|coalesce|case|when|then|else|end)\b/gi;
export const sqlHtml = (text) =>
  text
    .split(/('(?:[^']|'')*')/)
    .map((part, i) => (i % 2 ? `<span class="tok-str">${esc(part)}</span>` : esc(part).replace(KW, (k) => `<b class="tok-kw">${k.toUpperCase()}</b>`)))
    .join('');
export const sqlComment = (t) => `<span class="tok-com">-- ${t}</span>`;
// The query card's WITH rewrite: lines of HTML, one per line of SQL.
export const cteCard = (lines) => `<span class="cte">${lines.join('\n')}</span>`;

// Whether a stage's rows are exactly the learner's rows: as multisets, or in order when `ordered`.
export function sameRows(rows, learnerRows, ordered = false) {
  const a = rows.map((r) => JSON.stringify(r));
  const b = learnerRows.map((r) => JSON.stringify(r));
  if (!ordered) [a, b].forEach((l) => l.sort());
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
