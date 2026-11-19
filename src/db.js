// Real SQLite (sql.js) in the browser. Every run gets a fresh database built
// from SCHEMA, so a DROP or UPDATE never breaks the next run.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { SCHEMA } from './data.js';

let SQL;

export async function initDb() {
  SQL = await initSqlJs({ locateFile: () => wasmUrl });
}

function freshDb() {
  const db = new SQL.Database();
  for (const t of SCHEMA) {
    db.run(`CREATE TABLE ${t.name} (${t.cols.map((c) => `${c.name} ${c.type}${c.pk ? ' PRIMARY KEY' : ''}`).join(', ')});`);
    const insert = db.prepare(`INSERT INTO ${t.name} VALUES (${t.cols.map(() => '?').join(', ')})`);
    for (const row of t.data) insert.run(row);
    insert.free();
  }
  return db;
}

// The last statement's result as { columns, rows }; empty when it returns nothing.
export function query(db, sql) {
  const last = db.exec(sql).at(-1);
  return { columns: last?.columns ?? [], rows: last?.values ?? [] };
}

// Splits a simple `SELECT … FROM … [WHERE …] [ORDER BY/LIMIT …]` into its clauses.
export function parseQuery(sql) {
  const clean = sql.replace(/--.*$/gm, '').trim().replace(/;\s*$/, '');
  const m = clean.match(
    /^select\s+([\s\S]+?)\s+from\s+([A-Za-z_]\w*)(?:\s+where\s+([\s\S]+?))?(\s+(?:order\s+by|limit)\b[\s\S]*)?$/i,
  );
  if (!m) return null;
  return { columns: m[1].trim(), table: m[2], where: m[3]?.trim() ?? null, tail: m[4]?.trim() ?? '' };
}

// Splits a condition at its top-level AND / OR, so `a AND (b OR c)` gives
// the parts `a` and `(b OR c)`. Quotes, parentheses and BETWEEN x AND y stay
// intact.
export function splitCondition(where) {
  const parts = [];
  const ops = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < where.length; i++) {
    const ch = where[i];
    if (ch === "'") inStr = !inStr;
    if (inStr) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && /\s/.test(where[i - 1] ?? '')) {
      const m = where.slice(i).match(/^(and|or)\b/i);
      if (!m) continue;
      const seg = where.slice(start, i);
      const afterBetween = seg.split(/\bbetween\b/i);
      if (afterBetween.length > 1 && !/\band\b/i.test(afterBetween.at(-1)) && m[1].toLowerCase() === 'and') continue;
      parts.push(seg.trim());
      ops.push(m[1].toUpperCase());
      start = i + m[1].length;
      i = start - 1;
    }
  }
  parts.push(where.slice(start).trim());
  return { parts, ops };
}

const NAMES = SCHEMA.map((t) => t.name).join(' and ');
function friendly(message) {
  let m = message.match(/no such table: (\S+)/i);
  if (m) return `There is no table called “${m[1]}”. The tables are ${NAMES}.`;
  m = message.match(/no such column: (\S+)/i);
  if (m) return `No table here has a “${m[1]}” column. Check the schema above the editor.`;
  m = message.match(/ambiguous column name: (\S+)/i);
  if (m) return `Both tables have a “${m[1]}” column. Say which one, as in pets.${m[1]} or owners.${m[1]}.`;
  if (/incomplete input/i.test(message)) return 'The query stops mid-sentence. Finish the last clause.';
  return message;
}

// Runs the learner's SQL. `analyze(db, sql, result)` is the lesson's hook: it
// reads the same fresh database to work out what the grid should show, and
// whatever it returns arrives as result.analysis. A failing hook only costs
// the animation, never the result.
export function runQuery(sql, analyze) {
  const db = freshDb();
  try {
    const result = { sql, ...query(db, sql), parsed: parseQuery(sql), analysis: null };
    if (analyze) {
      try {
        result.analysis = analyze(db, sql, result) ?? null;
      } catch {
        result.analysis = null;
      }
    }
    return result;
  } catch (err) {
    return { sql, error: friendly(err.message), parsed: parseQuery(sql), analysis: null };
  } finally {
    db.close();
  }
}

// Runs SQL on a fresh database and gives { columns, rows }, for answer keys.
export function resultOf(sql) {
  const db = freshDb();
  try {
    return query(db, sql);
  } finally {
    db.close();
  }
}

// Whether two results hold the same rows: as multisets (a set has no order),
// or in sequence when the question asks for an order.
export function sameRows(a, b, ordered = false) {
  if (a.columns.length !== b.columns.length || a.rows.length !== b.rows.length) return false;
  const key = (r) => JSON.stringify(r);
  const ka = a.rows.map(key);
  const kb = b.rows.map(key);
  if (!ordered) {
    ka.sort();
    kb.sort();
  }
  return ka.every((k, i) => k === kb[i]);
}
