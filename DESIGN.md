---
version: alpha
name: Learn SQL · Ink on Paper
description: >-
  The design system of Learn SQL, a lesson site that teaches SQL as set theory on an
  isometric grid. It extends the Colorfigures look (warm paper, dark ink, hard offset
  shadows, hand-drawn 3D figures) to a dashboard of cards, controls and code.
---

# Learn SQL design system

This file is the single source of truth for every colour, type style, spacing step, radius and
component on the page. `npm run design` lints it with `@google/design.md`, regenerates
`src/tokens.css` and `src/tokens.js` from it, and fails when the stylesheet or the scripts use a
value that is not a token. Change a value here, never in the CSS.

## Overview

Ink on paper. The page should feel like a workbench covered in printed cards and one hand-drawn
model, not like a software dashboard. Everything is drawn with the same dark ink on warm paper:
outlines are ink, text is ink, the active state is solid ink or the single mustard accent.
Hierarchy comes from weight, letter spacing and capitals, not from size: the whole interface uses
one monospace family in a narrow band of sizes, so the 3D grid stays the loudest thing on screen.

The audience is someone learning to think in sets. The interface must stay calm and legible while
the grid animates, and it must never compete with the grid for colour: colour on the page is
reserved for the set plates (one colour per WHERE condition) and for the one accent that marks
"current" or "working".

## Colors

```yaml
colors:
  primary: "#231e16"
  on-primary: "#f2efe7"
  secondary: "#6b6355"
  tertiary: "#f4b829"
  on-tertiary: "#231e16"
  neutral: "#f2efe7"
  surface: "#f7f4ec"
  surface-bright: "#fbf7ea"
  highlight: "#fff4d6"
  notice: "#fff1bf"
  success: "#43c25c"
  success-container: "#dff3e3"
  error: "#e2483d"
  outline-variant: "#ddd6c8"
  scrim: "#f2efe7c7"
  syntax-keyword: "#1c2948"
  syntax-string: "#a83a24"
  syntax-number: "#4b2430"
  set-1:
    light: "#f4b829"
    mid: "#d49c1f"
    dark: "#4e4a18"
  set-2:
    light: "#f3a6bb"
    mid: "#d8869c"
    dark: "#4b2430"
  set-3:
    light: "#ef6a4c"
    mid: "#cf5038"
    dark: "#4a2219"
  set-4:
    light: "#93d3b0"
    mid: "#71b693"
    dark: "#1f4034"
  ceramic:
    light: "#fbfaf3"
    mid: "#e3e0d2"
    dark: "#bdb8a6"
  board:
    light: "#e6e1d4"
    mid: "#cfc8b8"
    dark: "#aaa293"
  header:
    light: "#ece6d6"
    mid: "#d6cfbd"
    dark: "#b3ab98"
  shadow: "#41538f"
  grid-line: "#bdb5a4"
  rule-line: "#c9c1ae"
```

- **Ink (primary, #231e16):** every outline, all body text, the solid fill of a selected tab or
  pressed button. It is the Colorfigures engine's ink, so the page and the drawing match exactly.
- **Muted ink (secondary, #6b6355):** captions, column headers, kickers and anything that labels
  rather than says. It is the lightest ink that still passes WCAG AA (5.2:1) on paper.
- **Mustard (tertiary, #f4b829):** the only accent. It marks the current lesson, the current
  sidebar item, a running query, the table header in the ERD and a tag that is working. Text on it
  is always ink.
- **Paper (neutral, #f2efe7), card (surface, #f7f4ec), editor (surface-bright, #fbf7ea):** three
  warm whites, each a little lighter, for the page, the cards on it and the code inside a card.
- **Highlight, notice, success-container:** pale fills for chips, the tooltip, hover, warnings and
  a correct answer. They only ever sit behind ink text.
- **Success, error:** small status dots only, never text.
- **Set palettes (set-1 to set-4):** mustard, blush, tomato and mint, each as the light, mid and
  dark faces of one solid, exactly as the engine shades a body. Condition *k* of a WHERE clause
  always gets set *k*: its plates on the grid, its chip in the formula and its swatch in the legend.
  Cobalt is left out because the engine's cast shadow is blue.
- **Ceramic, board, header, shadow, grid-line, rule-line:** materials of the 3D scene. Ceramic,
  board and shadow are the engine's own and must not drift from `public/core.js`.

## Typography

```yaml
typography:
  display:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.14em
  title:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.08em
  body:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 12.5px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0em
  body-lg:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: 0em
  body-sm:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  label:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.12em
  label-sm:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 9px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.12em
  control:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 0.04em
  control-sm:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 10.5px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 0.04em
  code:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 13px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: 0em
  code-lg:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 15px
    fontWeight: 400
    lineHeight: 26px
    letterSpacing: 0em
  data:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0em
  data-sm:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 11.5px
    fontWeight: 400
    lineHeight: 17px
    letterSpacing: 0em
  data-strong:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 12px
    fontWeight: 700
    lineHeight: 20px
    letterSpacing: 0.02em
  caption:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 10.5px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: 0.04em
  figure:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 15px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: 0em
```

One family everywhere: the system monospace. SQL is code, the grid's labels are code, and a single
family keeps columns of values aligned in the ERD, the result table and the editor.

- **display** is the wordmark only. **title** heads a card; **label** is a kicker, a column header
  or a status line. Both are set in capitals; their letter spacing is part of the style, so always
  apply a style's tracking together with its font.
- **body**, **body-lg** (a maximized panel) and **body-sm** (notes and the tooltip) carry prose.
- **control** is every button and toggle in the toolbars, **control-sm** the pills in the lesson
  panel. Controls are never in capitals, which keeps them distinct from labels.
- **code** and **code-lg** are the editor at normal and maximized size; the formula uses **code**.
- **data** and **data-strong** are tabular values: result rows, ERD columns, lesson titles;
  **data-sm** is the ERD on short screens.
- **caption** is the smallest readable text (types, hints); **label-sm** is reserved for tiny
  status pills such as "Soon". **figure** is a count that should read at a glance.

## Layout

```yaml
spacing:
  2xs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  hairline: 1px
  stroke: 1.5px
  focus: 2px
  offset-sm: 2px
  offset-md: 3px
  rail: 72px
  content: 100px
  header: 96px
  panel: 470px
  footer: 52px
```

A fixed dashboard on one screen, with no page scroll:

- A **rail** (72px) on the left holds the section icons at its top edge, then the lesson progress:
  a short bar and the count.
- The **stage** fills the rest of the width up to the side panel. It holds the 3D grid, the set
  card at its bottom left and the grid toolbar at its bottom right.
- The **side panel** (470px by default, resizable by dragging the gap) stacks the lesson panel,
  the schema and the editor, from the header line (96px) down to the footer line (52px).
- The **lessons drawer** is tucked under the bottom edge and slides up from its tab.

Spacing uses a 4px-based scale: 2xs and xs inside controls, sm between related items, md as the
standard card padding and gap, lg between groups, xl as the outer gutter, 2xl for maximized
content. `hairline`, `stroke` and `focus` are line widths; `offset-sm` and `offset-md` are shadow
offsets (see Elevation). `rail`, `content`, `header`, `panel` and `footer` are the fixed layout
lines.

## Elevation & Depth

Depth is drawn, not blurred. A raised surface gets a hard ink shadow offset down and to the right
with no blur: `offset-md` (3px) for cards that sit on the page, `offset-sm` (2px) for smaller
objects such as a lesson card, the ERD table, the current sidebar item or the tooltip. Nothing on
the page uses a soft drop shadow.

Things that sit *in* the stage rather than on the page (the set card, the toolbar) stay flat, with
an outline and no shadow, so they read as part of the figure. A maximized card covers the page with
the `scrim` colour behind it. The 3D grid has its own depth: the Colorfigures engine shades every
solid with a light, mid and dark face and casts a blue (`shadow`) shadow on the board.

## Shapes

```yaml
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  full: 999px
```

Cards are `lg`. Tables, chips inside cards, the editor and the console are `md`; inline code chips
and legend swatches are `xs`; the resize grip is `sm`. Every button, toggle, tab and status pill is
a full pill, so anything you can press is round-ended and anything you read is a rounded rectangle.
Outlines are always ink at `stroke` (1.5px); inner rules between rows are `hairline` and
`outline-variant`, dashed between data rows.

## Motion & Micro-interaction

Motion explains the set operations; the chrome barely moves.

- **Grid animations** are timed by the scene: a condition lights the region and the field it reads
  over 380ms and holds for 420ms; plates pop in 320ms; the kept rows rise in 520ms; the copy into
  the result region flies for 900ms. Every row moves at the same moment, never one after another,
  because a set has no order.
- **Chrome:** 150ms for hover and focus colour changes, 200ms for a drawer arrow turning, 260ms
  with `cubic-bezier(.2, .7, .2, 1)` for the lessons drawer, 350ms for a result row fading in.
- The running dot pulses at 800ms. Nothing else loops.

The `@google/design.md` schema has no motion tokens yet, so these durations live here in prose.

## Voice & Content Strategy

Plain, short and literal. Say what the learner sees on the grid ("every row is checked at the same
moment"), not what the database does internally. Use the set words (set, subset, union,
intersection, complement, ∅) alongside the SQL words, never instead of them. Labels are nouns in
capitals ("RESULT SET", "SCHEMA"); buttons are verbs or nouns in sentence case ("Start
challenges"). Grid toolbar actions (3D or 2D, back to the starting view, run, shuffle) are icons only,
named in their tooltip and accessible label. Errors explain the fix in one sentence. Unbuilt features say "Soon".

## Components

```yaml
components:
  page:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: 12px
  card-title:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.title}"
  kicker:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
  brand:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.display}"
  prose:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
  prose-lg:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body-lg}"
  note:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.body-sm}"
  caption:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.caption}"
  button:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.control}"
    rounded: "{rounded.full}"
    height: 32px
    padding: 0 16px
  button-hover:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.primary}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.full}"
    height: 32px
    padding: 0 16px
  button-icon:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    width: 40px
    height: 36px
  button-run:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    width: 40px
    height: 36px
  tab:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.control-sm}"
    rounded: "{rounded.full}"
    padding: 4px 8px
  tab-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  segmented:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: 32px
  segmented-option-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
  step:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.control-sm}"
    rounded: "{rounded.md}"
  step-hover:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
  step-current:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  chip:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.primary}"
    rounded: "{rounded.xs}"
    padding: 0 4px
  operator-badge:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
  tooltip:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 8px 12px
  editor:
    backgroundColor: "{colors.surface-bright}"
    textColor: "{colors.primary}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
  editor-gutter:
    backgroundColor: "{colors.surface-bright}"
    textColor: "{colors.secondary}"
  syntax-keyword:
    backgroundColor: "{colors.surface-bright}"
    textColor: "{colors.syntax-keyword}"
  syntax-string:
    backgroundColor: "{colors.surface-bright}"
    textColor: "{colors.syntax-string}"
  syntax-number:
    backgroundColor: "{colors.surface-bright}"
    textColor: "{colors.syntax-number}"
  console:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
  console-head:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
  status-running:
    backgroundColor: "{colors.tertiary}"
    size: 8px
  status-done:
    backgroundColor: "{colors.success}"
    size: 8px
  status-error:
    backgroundColor: "{colors.error}"
    size: 8px
  alert:
    backgroundColor: "{colors.notice}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
  verdict-ok:
    backgroundColor: "{colors.success-container}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
  divider:
    backgroundColor: "{colors.outline-variant}"
    height: 1px
  scrim:
    backgroundColor: "{colors.scrim}"
  progress-track:
    backgroundColor: "{colors.outline-variant}"
    rounded: "{rounded.full}"
    height: 10px
  progress-fill:
    backgroundColor: "{colors.tertiary}"
  nav-item:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    size: 44px
  nav-item-current:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
  pill-soon:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
  lesson-card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.data-strong}"
    rounded: "{rounded.md}"
    height: 70px
  lesson-card-current:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
  erd-table:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
    width: 196px
  erd-head:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "{typography.data-strong}"
  legend-count:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.figure}"
  set-chip-1:
    backgroundColor: "{colors.set-1.light}"
    textColor: "{colors.primary}"
  set-chip-2:
    backgroundColor: "{colors.set-2.light}"
    textColor: "{colors.primary}"
  set-chip-3:
    backgroundColor: "{colors.set-3.light}"
    textColor: "{colors.primary}"
  set-chip-4:
    backgroundColor: "{colors.set-4.light}"
    textColor: "{colors.primary}"
  set-plate-1-side:
    backgroundColor: "{colors.set-1.mid}"
  set-plate-1-shade:
    backgroundColor: "{colors.set-1.dark}"
  set-plate-2-side:
    backgroundColor: "{colors.set-2.mid}"
  set-plate-2-shade:
    backgroundColor: "{colors.set-2.dark}"
  set-plate-3-side:
    backgroundColor: "{colors.set-3.mid}"
  set-plate-3-shade:
    backgroundColor: "{colors.set-3.dark}"
  set-plate-4-side:
    backgroundColor: "{colors.set-4.mid}"
  set-plate-4-shade:
    backgroundColor: "{colors.set-4.dark}"
  scene-row:
    backgroundColor: "{colors.ceramic.light}"
    textColor: "{colors.primary}"
  scene-row-side:
    backgroundColor: "{colors.ceramic.mid}"
  scene-row-shade:
    backgroundColor: "{colors.ceramic.dark}"
  scene-region:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
  scene-board:
    backgroundColor: "{colors.board.light}"
    textColor: "{colors.primary}"
  scene-board-side:
    backgroundColor: "{colors.board.mid}"
  scene-board-shade:
    backgroundColor: "{colors.board.dark}"
  scene-header:
    backgroundColor: "{colors.header.light}"
    textColor: "{colors.primary}"
  scene-header-side:
    backgroundColor: "{colors.header.mid}"
  scene-header-shade:
    backgroundColor: "{colors.header.dark}"
  scene-cell-label:
    backgroundColor: "{colors.ceramic.light}"
    textColor: "{colors.secondary}"
  scene-shadow:
    backgroundColor: "{colors.shadow}"
  scene-grid-line:
    backgroundColor: "{colors.grid-line}"
  scene-rule-line:
    backgroundColor: "{colors.rule-line}"
  scene-card-margin:
    backgroundColor: "{colors.set-3.light}"
```

Components name the role a set of tokens plays. Each becomes a group of custom properties
(`--c-button-bg`, `--c-button-fg`, `--c-button-type`, `--c-button-tracking`, `--c-button-radius`,
`--c-button-padding`, `--c-button-height`). The stylesheet styles a component through its own
properties and uses the primitives (`--color-*`, `--type-*`, `--spacing-*`, `--rounded-*`) only for
layout and for parts that are not a component. The `scene-*` and `set-plate-*` components are read
by the 3D scene from `src/tokens.js`; `scene-row`, `scene-board` and `scene-shadow` pin the
Colorfigures engine's own materials, and the gate fails if `public/core.js` drifts from them.
Every component must be used, or the gate fails.

- **card** is the only container on the page: surface fill, ink outline, `lg` corners, `offset-md`
  shadow, `md` padding, a **card-title** heading. The set card uses the same recipe, flat.
- **button** (outlined pill) and **button-primary** (solid ink pill) are the only two button
  looks; **button-icon** and **button-run** are their square-ish icon forms. Hover fills an
  outlined button with highlight; focus is a `focus`-wide ink ring offset by `2xs`.
- **tab** and **segmented** are pill groups where the selected option turns solid ink.
- **chip** marks inline code. **set-chip-1** to **set-chip-4** mark condition *k* in the formula
  and the legend: a light set colour behind ink text.
- **status-running / done / error** are the console's 8px dot; **alert** and **verdict-ok** are the
  only coloured message boxes.

## Do's and Don'ts

- Do take every value from a token; if one is missing, add it to this file first.
- Do pair a type style's font with its tracking (`--type-x` with `--type-x-tracking`).
- Do keep colour for the sets and the one accent; everything else is ink, paper and their tints.
- Do put text only on fills it passes WCAG AA on; the linter checks every component pair.
- Don't use coloured text. A set colour is a fill (a plate, a chip, a swatch) with ink on it.
- Don't add soft or blurred shadows, gradients or a second accent colour.
- Don't set chrome text in capitals unless it is a title or a label; never set a button in capitals.
- Don't introduce a second font family or a size outside the type scale.
- Don't hand-edit `src/tokens.css` or `src/tokens.js`; they are generated.
