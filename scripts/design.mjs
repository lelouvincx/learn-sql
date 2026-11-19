// The design system's gate. DESIGN.md is the single source of truth:
//
//   1. lint it with Google's @google/design.md linter (any error or warning fails);
//   2. generate src/tokens.css and src/tokens.js from its tokens and components
//      (with --check, fail if they are out of date instead of writing them);
//   3. fail if the stylesheet, the scripts or the page use a value that is not a token.
//
// Run it with `npm run design` (writes) or `npm run lint` (checks only).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { lint } from '@google/design.md/linter';
import YAML from 'yaml';
import postcss from 'postcss';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => join(ROOT, p);
const read = (p) => readFileSync(at(p), 'utf8');
const CHECK = process.argv.includes('--check');
const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

// ---------- 1. lint DESIGN.md ----------
const source = read('DESIGN.md');
const report = lint(source);
for (const f of report.findings) {
  if (f.severity === 'info') continue;
  fail(`DESIGN.md${f.path ? ` (${f.path})` : ''}`, `[${f.rule ?? 'model'} ${f.severity}] ${f.message}`);
}

// ---------- 2. tokens, read from the raw YAML so references stay references ----------
// (the linter's resolved model inlines every reference and drops unitless line heights)
const blocks = [];
const front = source.match(/^---\n([\s\S]*?)\n---\n/);
if (front) blocks.push(front[1]);
for (const m of source.matchAll(/```yaml\n([\s\S]*?)```/g)) blocks.push(m[1]);
const spec = Object.assign({}, ...blocks.map((b) => YAML.parse(b)));

const flat = (obj, prefix = '') =>
  Object.entries(obj ?? {}).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${prefix}${k}-`) : [[`${prefix}${k}`, v]]));
const colors = Object.fromEntries(flat(spec.colors));
const spacing = Object.fromEntries(flat(spec.spacing));
const rounded = Object.fromEntries(flat(spec.rounded));
const typography = spec.typography ?? {};
const components = spec.components ?? {};

const SECTION_VAR = { colors: 'color', spacing: 'spacing', rounded: 'rounded' };
// {colors.set-1.light} -> var(--color-set-1-light); a literal stays a literal
function toCss(value) {
  const ref = String(value).match(/^\{(colors|spacing|rounded|typography)\.([\w.-]+)\}$/);
  if (!ref) return String(value);
  const name = ref[2].replace(/\./g, '-');
  return ref[1] === 'typography' ? `var(--type-${name})` : `var(--${SECTION_VAR[ref[1]]}-${name})`;
}
// the same reference, resolved to its literal value (for the scene, which draws with hex strings)
function toValue(value) {
  const ref = String(value).match(/^\{(colors|spacing|rounded)\.([\w.-]+)\}$/);
  if (!ref) return String(value);
  return { colors, spacing, rounded }[ref[1]][ref[2].replace(/\./g, '-')];
}
const PROP = { backgroundColor: 'bg', textColor: 'fg', rounded: 'radius', padding: 'padding', size: 'size', height: 'height', width: 'width' };

const css = [];
const line = (k, v) => css.push(`  --${k}: ${v};`);
css.push('/* Generated from DESIGN.md by scripts/design.mjs. Do not edit: change DESIGN.md and run `npm run design`. */', ':root {');
for (const [k, v] of Object.entries(colors)) line(`color-${k}`, v);
for (const [k, v] of Object.entries(spacing)) line(`spacing-${k}`, v);
for (const [k, v] of Object.entries(rounded)) line(`rounded-${k}`, v);
for (const [k, t] of Object.entries(typography)) {
  const family = t.fontFamily.split(',').map((s) => s.trim()).map((s) => (/\s/.test(s) ? `"${s}"` : s)).join(', ');
  line(`type-${k}`, `${t.fontWeight} ${t.fontSize}/${t.lineHeight} ${family}`);
  line(`type-${k}-tracking`, t.letterSpacing ?? 'normal');
}
const componentJs = {};
for (const [name, props] of Object.entries(components)) {
  componentJs[name] = {};
  for (const [p, v] of Object.entries(props)) {
    if (p === 'typography') {
      line(`c-${name}-type`, toCss(v));
      line(`c-${name}-tracking`, toCss(v).replace(/\)$/, '-tracking)'));
    } else {
      line(`c-${name}-${PROP[p]}`, toCss(v));
      if (p === 'backgroundColor' || p === 'textColor') componentJs[name][PROP[p]] = toValue(v);
    }
  }
}
css.push('}', '');
const tokensCss = css.join('\n');
const tokensJs = `// Generated from DESIGN.md by scripts/design.mjs. Do not edit: change DESIGN.md and run \`npm run design\`.
// The 3D scene draws SVG with literal colours, so it reads them here instead of from CSS.
export const color = ${JSON.stringify(colors, null, 2)};

export const component = ${JSON.stringify(componentJs, null, 2)};
`;
for (const [file, text] of [['src/tokens.css', tokensCss], ['src/tokens.js', tokensJs]]) {
  let current = null;
  try {
    current = read(file);
  } catch {}
  if (current === text) continue;
  if (CHECK) fail(file, 'out of date with DESIGN.md; run `npm run design`');
  else writeFileSync(at(file), text);
}

// ---------- 3. enforce: the code uses tokens, and only tokens ----------
// components the Colorfigures engine draws itself; the parity check below pins their colours
const ENGINE_COMPONENTS = ['scene-row', 'scene-row-side', 'scene-row-shade', 'scene-board', 'scene-board-side', 'scene-board-shade', 'scene-shadow'];
const defined = new Set([...tokensCss.matchAll(/--([\w-]+):/g)].map((m) => m[1]));
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(?:white|black|gr[ae]y|red|green|blue|yellow|orange|purple|pink|brown|navy|teal)\b/i;
const LENGTH_LITERAL = /(?<![\w-])-?(?:\d*\.)?\d+(?:px|em|rem)\b/;
const TYPE_PROPS = /^(?:font|font-size|font-family|font-weight|line-height|letter-spacing)$/;
const SPACE_PROPS =
  /^(?:margin|padding)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?$|^(?:gap|row-gap|column-gap|top|right|bottom|left|inset|outline-offset|outline-width|outline|box-shadow|border(?:-(?:top|right|bottom|left))?(?:-width)?|border(?:-(?:top|bottom)-(?:left|right))?-radius)$/;
const TYPE_VALUE = /^(?:var\(--[\w-]+\)|inherit|normal|initial)$/;

// custom properties the page sets at run time, on top of the generated ones
const runtime = new Set();
const style = postcss.parse(read('src/style.css'), { from: 'src/style.css' });
style.walkDecls(/^--/, (d) => runtime.add(d.prop.slice(2)));
for (const f of ['src/main.js', 'src/scene.js']) for (const m of read(f).matchAll(/setProperty\('--([\w-]+)'/g)) runtime.add(m[1]);

const used = new Set();
style.walkDecls((d) => {
  const where = `src/style.css:${d.source.start.line} ${d.parent.selector ?? ''}`.trim();
  const v = d.value;
  for (const m of v.matchAll(/var\(--([\w-]+)/g)) {
    used.add(m[1]);
    if (!defined.has(m[1]) && !runtime.has(m[1])) fail(where, `var(--${m[1]}) is not a token`);
  }
  if (d.prop.startsWith('--')) {
    if (!/^var\(--[\w-]+\)$/.test(v)) fail(where, `${d.prop} must alias a token, not a literal (${v})`);
    return;
  }
  const bare = v.replace(/url\([^)]*\)/g, '');
  if (COLOR_LITERAL.test(bare)) fail(where, `${d.prop}: ${v} uses a colour literal; use a --color- or --c- token`);
  if (TYPE_PROPS.test(d.prop) && !TYPE_VALUE.test(v)) fail(where, `${d.prop}: ${v} must be a --type- or --c-…-type token`);
  if (SPACE_PROPS.test(d.prop) && LENGTH_LITERAL.test(bare)) fail(where, `${d.prop}: ${v} uses a length literal; use a --spacing- or --rounded- token`);
});
// a type style's font and its tracking travel together
style.walkRules((rule) => {
  const decl = (p) => rule.nodes.find((n) => n.type === 'decl' && n.prop === p)?.value;
  const font = decl('font');
  const track = decl('letter-spacing');
  const where = `src/style.css:${rule.source.start.line} ${rule.selector}`;
  if (font?.startsWith('var(--')) {
    // var(--type-label) pairs with var(--type-label-tracking); var(--c-tab-type) with var(--c-tab-tracking)
    const expect = font.endsWith('-type)') ? font.replace(/-type\)$/, '-tracking)') : font.replace(/\)$/, '-tracking)');
    if (track !== expect) fail(where, `font ${font} needs letter-spacing: ${expect}`);
  }
  if (track && !font) fail(where, 'letter-spacing without its font; set both from one type token');
});

// scripts and the page: no literal colours outside the generated tokens and the vendored engine
const LESSON_FILES = readdirSync(at('src/lessons')).filter((f) => f.endsWith('.js')).map((f) => `src/lessons/${f}`);
for (const f of ['src/main.js', 'src/scene.js', 'src/data.js', 'src/db.js', 'src/erd.js', 'index.html', ...LESSON_FILES]) {
  read(f)
    .split('\n')
    .forEach((text, i) => {
      if (f === 'index.html' && /name="theme-color"/.test(text)) {
        const c = text.match(/content="([^"]+)"/)?.[1];
        if (c !== colors.neutral) fail(`${f}:${i + 1}`, `theme-color ${c} must equal colors.neutral (${colors.neutral})`);
        return;
      }
      if (/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![\w-])|\brgba?\(/i.test(text.replace(/&#\w+;/g, ''))) fail(`${f}:${i + 1}`, `colour literal; read it from src/tokens.js`);
      if (/style="[^"]*\d(?:px|em|rem)/.test(text)) fail(`${f}:${i + 1}`, 'inline style with a length literal; use a class');
    });
}

// every component is used: by the stylesheet through its --c- properties, by the scripts by name,
// or by the engine (see ENGINE_COMPONENTS above)
const js = ['src/main.js', 'src/scene.js', 'src/data.js', 'src/erd.js', ...LESSON_FILES].map(read).join('\n');
for (const name of Object.keys(components)) {
  const inCss = [...used].some((u) => u.startsWith(`c-${name}-`) && defined.has(u));
  const inJs = js.includes(`'${name}'`) || js.includes(`"${name}"`) || js.includes(`\`${name}\``);
  if (!inCss && !inJs && !ENGINE_COMPONENTS.includes(name)) fail('DESIGN.md', `component "${name}" is never used by the page; style it through --c-${name}-* or remove it`);
}

// the vendored Colorfigures engine draws with its own constants; they must match the tokens
const core = read('public/core.js');
const engine = (re) => core.match(re)?.[1]?.toLowerCase();
const parity = [
  ['INK', engine(/const INK = '(#\w+)'/), colors.primary],
  ['SHADOW', engine(/const SHADOW = '(#\w+)'/), colors.shadow],
  ['label pill', engine(/'var\(--accent,#\w+\)' : '(#\w+)'/), colors.highlight],
  ['accent pill', engine(/var\(--accent,(#\w+)\)/), colors.tertiary],
];
for (const [mat, key] of [['CERAMIC', 'ceramic'], ['BOARD', 'board'], ['mustard', 'set-1'], ['blush', 'set-2'], ['tomato', 'set-3'], ['mint', 'set-4']]) {
  const m = core.match(new RegExp(`${mat}\\s*[:=]\\s*\\{ ?l: ?'(#\\w+)', ?m: ?'(#\\w+)', ?d: ?'(#\\w+)'`));
  ['light', 'mid', 'dark'].forEach((shade, i) => parity.push([`${mat}.${shade[0]}`, m?.[i + 1]?.toLowerCase(), colors[`${key}-${shade}`]]));
}
for (const [what, got, want] of parity) if (got !== want?.toLowerCase()) fail('public/core.js', `engine ${what} is ${got}, but DESIGN.md says ${want}`);

// ---------- report ----------
const s = report.summary;
if (problems.length) {
  console.error(`design: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n${problems.map((p) => `  ✗ ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `design: DESIGN.md lint clean (${s.errors} errors, ${s.warnings} warnings); ` +
    `${Object.keys(colors).length} colours, ${Object.keys(typography).length} type styles, ${Object.keys(spacing).length} spacing, ` +
    `${Object.keys(rounded).length} radii, ${Object.keys(components).length} components; tokens ${CHECK ? 'up to date' : `written to ${relative(ROOT, at('src'))}/`}; code uses tokens only`,
);
