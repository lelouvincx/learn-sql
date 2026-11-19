import { component } from './tokens.js';

// The tables every lesson writes SQL against. The database, the ERD above the
// editor and the rows on the grid are all built from SCHEMA, so they can't drift.

// pets.owner_id is NULL for the three strays; owner 5 (Eli) has no pets yet.
export const PETS = [
  [1, 'Miso', 'cat', 3, 1],
  [2, 'Biscuit', 'dog', 5, 2],
  [3, 'Luna', 'cat', 1, 1],
  [4, 'Pepper', 'rabbit', 2, 3],
  [5, 'Mochi', 'cat', 7, 2],
  [6, 'Rex', 'dog', 2, 4],
  [7, 'Nori', 'fish', 1, null],
  [8, 'Tofu', 'cat', 4, 3],
  [9, 'Bean', 'dog', 1, 2],
  [10, 'Clover', 'rabbit', 6, null],
  [11, 'Ziggy', 'fish', 3, 4],
  [12, 'Olive', 'cat', 2, null],
];

export const OWNERS = [
  [1, 'Ana', 'Hanoi'],
  [2, 'Bao', 'Saigon'],
  [3, 'Chi', 'Hanoi'],
  [4, 'Duc', 'Da Nang'],
  [5, 'Eli', 'Saigon'],
];

export const SCHEMA = [
  {
    name: 'pets',
    data: PETS,
    cols: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'name', type: 'TEXT' },
      { name: 'species', type: 'TEXT' },
      { name: 'age', type: 'INTEGER' },
      { name: 'owner_id', type: 'INTEGER', ref: 'owners' },
    ],
  },
  {
    name: 'owners',
    data: OWNERS,
    cols: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'name', type: 'TEXT' },
      { name: 'city', type: 'TEXT' },
    ],
  },
];
export const table = (name) => SCHEMA.find((t) => t.name === name);

// One Colorfigures body family per condition in the WHERE clause: the
// plate under a row is shaded light / mid / dark like any other solid.
// The colours are DESIGN.md's set-1 … set-4 (mustard, blush, tomato, mint; not cobalt: the cast shadow is blue).
export const SET_PALS = [
  { l: component['set-chip-1'].bg, m: component['set-plate-1-side'].bg, d: component['set-plate-1-shade'].bg },
  { l: component['set-chip-2'].bg, m: component['set-plate-2-side'].bg, d: component['set-plate-2-shade'].bg },
  { l: component['set-chip-3'].bg, m: component['set-plate-3-side'].bg, d: component['set-plate-3-shade'].bg },
  { l: component['set-chip-4'].bg, m: component['set-plate-4-side'].bg, d: component['set-plate-4-shade'].bg },
];

