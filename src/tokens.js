// Generated from DESIGN.md by scripts/design.mjs. Do not edit: change DESIGN.md and run `npm run design`.
// The 3D scene draws SVG with literal colours, so it reads them here instead of from CSS.
export const color = {
  "primary": "#231e16",
  "on-primary": "#f2efe7",
  "secondary": "#6b6355",
  "tertiary": "#f4b829",
  "on-tertiary": "#231e16",
  "neutral": "#f2efe7",
  "surface": "#f7f4ec",
  "surface-bright": "#fbf7ea",
  "highlight": "#fff4d6",
  "notice": "#fff1bf",
  "success": "#43c25c",
  "success-container": "#dff3e3",
  "error": "#e2483d",
  "outline-variant": "#ddd6c8",
  "scrim": "#f2efe7c7",
  "syntax-keyword": "#1c2948",
  "syntax-string": "#a83a24",
  "syntax-number": "#4b2430",
  "set-1-light": "#f4b829",
  "set-1-mid": "#d49c1f",
  "set-1-dark": "#4e4a18",
  "set-2-light": "#f3a6bb",
  "set-2-mid": "#d8869c",
  "set-2-dark": "#4b2430",
  "set-3-light": "#ef6a4c",
  "set-3-mid": "#cf5038",
  "set-3-dark": "#4a2219",
  "set-4-light": "#93d3b0",
  "set-4-mid": "#71b693",
  "set-4-dark": "#1f4034",
  "ceramic-light": "#fbfaf3",
  "ceramic-mid": "#e3e0d2",
  "ceramic-dark": "#bdb8a6",
  "board-light": "#e6e1d4",
  "board-mid": "#cfc8b8",
  "board-dark": "#aaa293",
  "header-light": "#ece6d6",
  "header-mid": "#d6cfbd",
  "header-dark": "#b3ab98",
  "shadow": "#41538f",
  "grid-line": "#bdb5a4",
  "rule-line": "#c9c1ae"
};

export const component = {
  "page": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "card": {
    "bg": "#f7f4ec",
    "fg": "#231e16"
  },
  "card-title": {
    "bg": "#f7f4ec",
    "fg": "#231e16"
  },
  "kicker": {
    "bg": "#f7f4ec",
    "fg": "#6b6355"
  },
  "brand": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "prose": {
    "bg": "#f7f4ec",
    "fg": "#231e16"
  },
  "prose-lg": {
    "bg": "#f7f4ec",
    "fg": "#231e16"
  },
  "note": {
    "bg": "#f7f4ec",
    "fg": "#6b6355"
  },
  "caption": {
    "bg": "#f7f4ec",
    "fg": "#6b6355"
  },
  "button": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "button-hover": {
    "bg": "#fff4d6",
    "fg": "#231e16"
  },
  "button-primary": {
    "bg": "#231e16",
    "fg": "#f2efe7"
  },
  "button-icon": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "button-run": {
    "bg": "#231e16",
    "fg": "#f2efe7"
  },
  "tab": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "tab-active": {
    "bg": "#231e16",
    "fg": "#f2efe7"
  },
  "segmented": {
    "bg": "#f2efe7",
    "fg": "#6b6355"
  },
  "segmented-option-active": {
    "bg": "#231e16",
    "fg": "#f2efe7"
  },
  "step": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "step-hover": {
    "bg": "#f4b829",
    "fg": "#231e16"
  },
  "step-current": {
    "bg": "#231e16",
    "fg": "#f2efe7"
  },
  "chip": {
    "bg": "#fff4d6",
    "fg": "#231e16"
  },
  "operator-badge": {
    "bg": "#fff4d6",
    "fg": "#231e16"
  },
  "tooltip": {
    "bg": "#fff4d6",
    "fg": "#231e16"
  },
  "editor": {
    "bg": "#fbf7ea",
    "fg": "#231e16"
  },
  "editor-gutter": {
    "bg": "#fbf7ea",
    "fg": "#6b6355"
  },
  "syntax-keyword": {
    "bg": "#fbf7ea",
    "fg": "#1c2948"
  },
  "syntax-string": {
    "bg": "#fbf7ea",
    "fg": "#a83a24"
  },
  "syntax-number": {
    "bg": "#fbf7ea",
    "fg": "#4b2430"
  },
  "console": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "console-head": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "status-running": {
    "bg": "#f4b829"
  },
  "status-done": {
    "bg": "#43c25c"
  },
  "status-error": {
    "bg": "#e2483d"
  },
  "alert": {
    "bg": "#fff1bf",
    "fg": "#231e16"
  },
  "verdict-ok": {
    "bg": "#dff3e3",
    "fg": "#231e16"
  },
  "divider": {
    "bg": "#ddd6c8"
  },
  "scrim": {
    "bg": "#f2efe7c7"
  },
  "progress-track": {
    "bg": "#ddd6c8"
  },
  "progress-fill": {
    "bg": "#f4b829"
  },
  "nav-item": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "nav-item-current": {
    "bg": "#f4b829",
    "fg": "#231e16"
  },
  "pill-soon": {
    "bg": "#f2efe7",
    "fg": "#6b6355"
  },
  "lesson-card": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "lesson-card-current": {
    "bg": "#f4b829",
    "fg": "#231e16"
  },
  "erd-table": {
    "bg": "#f2efe7",
    "fg": "#231e16"
  },
  "erd-head": {
    "bg": "#f4b829",
    "fg": "#231e16"
  },
  "legend-count": {
    "bg": "#f7f4ec",
    "fg": "#231e16"
  },
  "set-chip-1": {
    "bg": "#f4b829",
    "fg": "#231e16"
  },
  "set-chip-2": {
    "bg": "#f3a6bb",
    "fg": "#231e16"
  },
  "set-chip-3": {
    "bg": "#ef6a4c",
    "fg": "#231e16"
  },
  "set-chip-4": {
    "bg": "#93d3b0",
    "fg": "#231e16"
  },
  "set-plate-1-side": {
    "bg": "#d49c1f"
  },
  "set-plate-1-shade": {
    "bg": "#4e4a18"
  },
  "set-plate-2-side": {
    "bg": "#d8869c"
  },
  "set-plate-2-shade": {
    "bg": "#4b2430"
  },
  "set-plate-3-side": {
    "bg": "#cf5038"
  },
  "set-plate-3-shade": {
    "bg": "#4a2219"
  },
  "set-plate-4-side": {
    "bg": "#71b693"
  },
  "set-plate-4-shade": {
    "bg": "#1f4034"
  },
  "scene-row": {
    "bg": "#fbfaf3",
    "fg": "#231e16"
  },
  "scene-row-side": {
    "bg": "#e3e0d2"
  },
  "scene-row-shade": {
    "bg": "#bdb8a6"
  },
  "scene-region": {
    "bg": "#f7f4ec",
    "fg": "#231e16"
  },
  "scene-board": {
    "bg": "#e6e1d4",
    "fg": "#231e16"
  },
  "scene-board-side": {
    "bg": "#cfc8b8"
  },
  "scene-board-shade": {
    "bg": "#aaa293"
  },
  "scene-header": {
    "bg": "#ece6d6",
    "fg": "#231e16"
  },
  "scene-header-side": {
    "bg": "#d6cfbd"
  },
  "scene-header-shade": {
    "bg": "#b3ab98"
  },
  "scene-cell-label": {
    "bg": "#fbfaf3",
    "fg": "#6b6355"
  },
  "scene-shadow": {
    "bg": "#41538f"
  },
  "scene-grid-line": {
    "bg": "#bdb5a4"
  },
  "scene-rule-line": {
    "bg": "#c9c1ae"
  },
  "scene-card-margin": {
    "bg": "#ef6a4c"
  }
};
