import { component } from './tokens.js';

// Lesson content and the one table on the grid.

export const FIELDS = ['id', 'name', 'species', 'age'];

export const PETS = [
  [1, 'Miso', 'cat', 3],
  [2, 'Biscuit', 'dog', 5],
  [3, 'Luna', 'cat', 1],
  [4, 'Pepper', 'rabbit', 2],
  [5, 'Mochi', 'cat', 7],
  [6, 'Rex', 'dog', 2],
  [7, 'Nori', 'fish', 1],
  [8, 'Tofu', 'cat', 4],
  [9, 'Bean', 'dog', 1],
  [10, 'Clover', 'rabbit', 6],
  [11, 'Ziggy', 'fish', 3],
  [12, 'Olive', 'cat', 2],
];

// The tables the learner writes SQL against, drawn as an ERD above the editor.
// The database is created from this too, so the diagram can't drift from it.
export const SCHEMA = [
  {
    name: 'pets',
    rows: PETS.length,
    cols: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'name', type: 'TEXT' },
      { name: 'species', type: 'TEXT' },
      { name: 'age', type: 'INTEGER' },
    ],
  },
];

// One Colorfigures body family per condition in the WHERE clause: the
// plate under a row is shaded light / mid / dark like any other solid.
// The colours are DESIGN.md's set-1 … set-4 (mustard, blush, tomato, mint; not cobalt: the cast shadow is blue).
export const SET_PALS = [
  { l: component['set-chip-1'].bg, m: component['set-plate-1-side'].bg, d: component['set-plate-1-shade'].bg },
  { l: component['set-chip-2'].bg, m: component['set-plate-2-side'].bg, d: component['set-plate-2-shade'].bg },
  { l: component['set-chip-3'].bg, m: component['set-plate-3-side'].bg, d: component['set-plate-3-shade'].bg },
  { l: component['set-chip-4'].bg, m: component['set-plate-4-side'].bg, d: component['set-plate-4-shade'].bg },
];

export const STARTER = `SELECT *
FROM pets
WHERE species = 'cat'
  AND age < 3;`;

export const CHALLENGE_STARTER = `SELECT *
FROM pets
WHERE `;

export const CHALLENGES = [
  {
    title: 'Dogs and rabbits',
    prompt: 'The groomer is booked for the dogs and the rabbits. Get every pet that is a dog or a rabbit.',
    hint: 'In English it’s “dogs <i>and</i> rabbits”, but no pet is both, so <code>AND</code> gives the empty set. You want everything in either set: the union.',
    expected: "species = 'dog' OR species = 'rabbit'",
  },
  {
    title: 'Senior cats',
    prompt: 'Cats aged 4 or older are due for a senior check-up. Get exactly those pets.',
    hint: 'You want the overlap of two sets: the cats, and the pets with <code>age &gt;= 4</code>.',
    expected: "species = 'cat' AND age >= 4",
  },
  {
    title: 'No fish',
    prompt: 'The new carrier takes anything except fish. Get every pet that is not a fish.',
    hint: 'Light up the fish, then take every other row: the complement. Put <code>NOT</code> in front of a condition.',
    expected: "NOT species = 'fish'",
  },
];

// The core curriculum, easy to hard, for someone who has never written SQL. PRODUCT.md owns its scope.
export const LESSONS = [
  { n: 1, title: 'Sets & subsets', topic: 'WHERE · AND · OR · NOT', ready: true },
  { n: 2, title: 'Pick columns', topic: 'SELECT · DISTINCT' },
  { n: 3, title: 'Line them up', topic: 'ORDER BY · LIMIT' },
  { n: 4, title: 'The unknown', topic: 'NULL' },
  { n: 5, title: 'Stacks', topic: 'GROUP BY · COUNT · SUM' },
  { n: 6, title: 'Every pair', topic: 'JOIN' },
  { n: 7, title: 'Sets in, set out', topic: 'subqueries · CTE' },
];

// The track after the core lessons. Not counted in progress.
export const NEXT_TRACK = { title: 'Dimensional modeling' };
