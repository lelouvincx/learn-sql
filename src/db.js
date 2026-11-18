// Real SQLite (sql.js) behind the filing room. Every run gets a fresh
// database, so a DROP or UPDATE never breaks the next run.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { PETS, SCHEMA } from './data.js';

let SQL;

export async function initDb() {
  SQL = await initSqlJs({ locateFile: () => wasmUrl });
}

function freshDb() {
  const db = new SQL.Database();
  for (const t of SCHEMA) db.run(`CREATE TABLE ${t.name} (${t.cols.map((c) => `${c.name} ${c.type}${c.pk ? ' PRIMARY KEY' : ''}`).join(', ')});`);
  const insert = db.prepare('INSERT INTO pets VALUES (?, ?, ?, ?)');
  for (const row of PETS) insert.run(row);
  insert.free();
  return db;
}

// Splits a simple `SELECT … FROM … [WHERE …] [ORDER BY/LIMIT …]` into its
// clauses so the 3D scene can show which drawer, which gate, which fields.
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

function idSet(db, condition) {
  const res = db.exec(`SELECT id FROM pets${condition ? ` WHERE ${condition}` : ''}`);
  return new Set((res[0]?.values ?? []).map((v) => v[0]));
}

function friendly(message) {
  let m = message.match(/no such table: (\S+)/i);
  if (m) return `There is no drawer labelled “${m[1]}”. The open drawer is pets.`;
  m = message.match(/no such column: (\S+)/i);
  if (m) return `The cards have no “${m[1]}” field. Each card has id, name, species and age.`;
  if (/incomplete input/i.test(message)) return 'The request slip stops mid-sentence. Finish the last clause.';
  return message;
}

export function runQuery(sql) {
  const db = freshDb();
  try {
    const results = db.exec(sql);
    const last = results.at(-1) ?? { columns: [], values: [] };
    const parsed = parseQuery(sql);
    // The scene lights each top-level condition as its own set, then shows
    // the subset the whole WHERE keeps.
    let passIds = null;
    let atoms = [];
    let ops = [];
    if (parsed && parsed.table.toLowerCase() === 'pets') {
      try {
        passIds = idSet(db, parsed.where);
        if (parsed.where) {
          const split = splitCondition(parsed.where);
          ops = split.ops;
          atoms = split.parts.map((text) => {
            const not = text.match(/^not\s+([\s\S]+)$/i);
            return {
              text,
              inner: not ? not[1] : null,
              innerIds: not ? idSet(db, not[1]) : null,
              ids: idSet(db, text),
            };
          });
        }
      } catch {
        passIds = null;
      }
    }
    return { columns: last.columns, rows: last.values, parsed, passIds, atoms, ops };
  } catch (err) {
    return { error: friendly(err.message), parsed: parseQuery(sql) };
  } finally {
    db.close();
  }
}

// The pets a condition keeps, for checking challenge answers.
export function idsFor(condition) {
  const db = freshDb();
  try {
    return idSet(db, condition);
  } finally {
    db.close();
  }
}
