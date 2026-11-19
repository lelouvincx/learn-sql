---
$id: https://learn-sql.lelouvincx.com/product.md
$type: Product
$context: https://schema.org.ai
productmd: 1
register: product
---

# Learn SQL

Learn to think in SQL as sets, not loops, on a hand-drawn isometric grid you can turn and shuffle.

## Register

product

## Users

Fresh graduates, students and non-technical colleagues (analysts, marketers, operations and
product people) who need to pull their own numbers and have never written a query. They read
English and can use a spreadsheet; they do not know programming. They learn on a laptop in short
sessions, often between other work. Their job to be done: read and write everyday SQL with
confidence, and understand why a query returns the rows it does.

## Problem

Beginners learn SQL as syntax to memorise. They picture a query as a loop that walks rows one by
one, so `AND` versus `OR`, `NULL`, `GROUP BY` and `JOIN` keep surprising them. They copy queries
they cannot check, and a wrong answer looks exactly like a right one.

## Product Purpose

Learn SQL shows every query as an operation on a set. Each lesson puts a small table on a 3D grid:
every row is a bar, every `WHERE` condition lights the rows it keeps all at once, and the result
set is the overlap you can see. Queries run in the browser on a real SQLite database, and each
lesson ends with short challenges that check the learner's result set against the expected one.

The core curriculum is short on purpose: seven lessons, easy to hard, that cover what a beginner
needs to answer real questions.

| # | Lesson | SQL | The set idea |
| --- | --- | --- | --- |
| 1 | Sets & subsets | `WHERE`, `AND`, `OR`, `NOT` | A condition picks a subset; `AND`, `OR` and `NOT` are intersection, union and complement. |
| 2 | Pick columns | `SELECT`, `DISTINCT` | Keep some fields of every row; `DISTINCT` collapses duplicates, because a set has no repeats. |
| 3 | Line them up | `ORDER BY`, `LIMIT` | A set has no order; sorting is a step you ask for, and `LIMIT` keeps the first few. |
| 4 | The unknown | `NULL` | A missing value is neither true nor false, so it falls out of both a set and its complement. |
| 5 | Stacks | `GROUP BY`, `COUNT`, `SUM` | Partition the set into stacks, then sum up each stack into one row. |
| 6 | Every pair | `JOIN` | Pair rows from two tables, then keep the pairs that match. |
| 7 | Sets in, set out | subqueries, CTE | Every query returns a set, so a query can use another query as its input. |

After the core lessons, the next track is **Dimensional modeling** (facts and dimensions): how
analytics tables are shaped so the queries above stay simple. It is coming soon.

Success means a learner finishes the seven lessons, solves every challenge without the hint, and
can predict a query's result set before pressing Run.

## Brand Personality

Calm, patient, exact. A tutor who draws the answer on paper instead of reciting rules.

### Tone

Plain, short and literal, for a reader who has never seen SQL. Every term is explained the first
time it appears. The full voice rules live in [DESIGN.md](DESIGN.md) under Voice & Content
Strategy.

## Anti-references

- MUST NOT look like a software dashboard or an admin console; it is a workbench of printed cards
  and one hand-drawn model.
- MUST NOT explain a query as a loop over rows; every row is checked at the same moment.
- MUST NOT assume programming knowledge or use jargon without defining it.
- No gamified streaks, points, leaderboards or confetti.
- No video lectures or walls of text before the learner can touch the grid.

## Design Principles

1. Show the set. Every concept is something the learner can see change on the grid.
2. One idea per lesson. A lesson adds one clause and the set idea behind it.
3. Do, then name. The learner runs a query first; the term for what happened comes after.
4. Real SQL. Queries run on a real database and use standard syntax the learner can take to work.
5. The grid is the loudest thing on screen. The interface stays calm while it animates.

## Accessibility & Inclusion

- Every control MUST be reachable and usable from the keyboard, with a visible focus ring.
- Colour MUST NOT be the only signal: each set has a colour and a label, and results are also shown
  as a table.
- Text MUST meet WCAG 2.2 AA contrast on the paper background.
- Animations explain, then stop; nothing loops except the running indicator.
- Copy is written for readers whose first language is not English.

## Offer

Learn SQL is free. There is no account, no paywall and no tracking of answers; everything runs in
the browser. The source is MIT licensed.

```json product.md
{ "model": "free", "price": 0, "currency": "USD", "license": "MIT" }
```

## Boundaries

- Not a database administration course: no indexes, tuning, transactions or permissions.
- Not a reference manual: it teaches the ideas behind the clauses, not every function.
- Not tied to one vendor: lessons use standard SQL that runs on SQLite.
- Not a certification or a grading platform.

## Stack

- [AGENTS.md](AGENTS.md): build, deploy and delivery conventions.
- [DESIGN.md](DESIGN.md): colours, type, spacing and components.
- [README.md](README.md): how to run the site.
