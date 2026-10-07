#!/usr/bin/env node
/**
 * Cadence design-token build pipeline.
 *
 * Single source of truth: tokens/tokens.json
 *   -> artifacts/cadence/src/styles/tokens.css        (CSS custom properties, all themes,
 *                                                       plus a Tailwind v4 @theme inline block)
 *   -> artifacts/cadence/src/styles/tokens.generated.ts (typed token access)
 *
 * Mirrors the existing OpenAPI -> Orval single-source philosophy described in
 * docs/13-master-design-system-prompt.md P5.4.
 *
 * Usage:
 *   node scripts/build-tokens.cjs            # write outputs
 *   node scripts/build-tokens.cjs --check    # exit 1 if outputs are stale (for CI)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'tokens', 'tokens.json');
const OUT_DIR = path.join(ROOT, 'artifacts', 'cadence', 'src', 'styles');
const OUT_CSS = path.join(OUT_DIR, 'tokens.css');
const OUT_TS = path.join(OUT_DIR, 'tokens.generated.ts');

const CHECK_ONLY = process.argv.includes('--check');

const tokens = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const { global: G, alias: A, semantic: S, component: C } = tokens;

const BANNER = [
  '/* --------------------------------------------------------------------------',
  ' * GENERATED FILE — DO NOT EDIT BY HAND.',
  ' * Source: tokens/tokens.json',
  ' * Regenerate: node scripts/build-tokens.cjs',
  ' * Verify:     node scripts/build-tokens.cjs --check',
  ' * -------------------------------------------------------------------------- */',
].join('\n');

// --- token reference resolution: "{a.b.c}" -> resolved value -----------------
function resolveRef(ref) {
  const pathParts = ref.replace(/[{}]/g, '').split('.');
  const roots = { global: G, alias: A, semantic: S, component: C };
  // Allow refs to be written without the layer prefix, e.g. "{color.orange.600}"
  // resolves against global first, then every layer.
  const candidates = [pathParts];
  if (!['global', 'alias', 'semantic', 'component'].includes(pathParts[0])) {
    for (const r of Object.keys(roots)) candidates.push([r, ...pathParts]);
  }
  for (const parts of candidates) {
    let node = roots;
    let ok = true;
    for (const p of parts) {
      if (node == null || !(p in node)) { ok = false; break; }
      node = node[p];
    }
    if (ok && node != null) return node;
  }
  return null;
}

/** Flatten a token group into { 'dot.path': resolvedValue }. */
function flatten(group, basePath = '', out = {}) {
  for (const [key, node] of Object.entries(group)) {
    if (node == null || typeof node !== 'object') continue;
    const p = basePath ? `${basePath}.${key}` : key;
    if ('value' in node) {
      const raw = node.value;
      let val = raw;
      if (typeof raw === 'string') {
        const refs = raw.match(/\{[^}]+\}/g);
        if (refs) {
          for (const r of refs) {
            const target = resolveRef(r);
            if (target == null || !('value' in target)) {
              throw new Error(`Unresolved token reference ${r} at ${p}`);
            }
            val = val.replace(r, flattenValue(target.value));
          }
        }
      }
      out[p] = { value: val, type: node.type || 'other' };
    } else {
      flatten(node, p, out);
    }
  }
  return out;
}

/** A referenced token may itself be a composite object (typography). */
function flattenValue(v) {
  if (typeof v === 'object' && v !== null) {
    if ('size' in v) return v.size;
    if (typeof v.value === 'string') return v.value;
  }
  return v;
}

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/\./g, '-').toLowerCase();

function cssVarName(dotPath) {
  return `--${kebab(dotPath)}`;
}

// --- build the CSS ----------------------------------------------------------
const globalFlat = flatten(G, 'global');
const aliasFlat = flatten(A, 'alias');
const componentFlat = flatten(C, 'component');
const themes = Object.keys(S);

/** shadcn/ui consumes semantic colors as hsl(var(--background)) — unprefixed.
 *  So the `color.*` group must be emitted WITHOUT the `color.` segment in :root,
 *  while @theme inline re-exposes it as the `--color-*` Tailwind utility key. */
function rootVarName(semanticPath) {
  return semanticPath.startsWith('color.') ? semanticPath.slice('color.'.length) : semanticPath;
}

/**
 * §P8.4 display density, emitted from global.density.*.
 *
 * These were hand-written custom properties in index.css until 2026-10-06. That
 * put them outside every gate: tokens:check only compares generated output, and
 * the lint rules walk source, so a typo in a density value would have shipped
 * silently. As tokens they are covered by both.
 *
 * Unlike a theme, compact is POINTER-GATED rather than user-chosen: §P8.4 allows
 * it only under `(pointer: fine)`, because it shrinks rows to 38px while
 * TaskRow's complete-task control keeps a 44px hit box. Emitting the compact block
 * unconditionally would reintroduce overlapping hit areas on phones. The coarse/none
 * fallback restates the default values, which also neutralises a stale
 * `data-density` attribute set by anything other than DensityProvider.
 */
function densityBlock() {
  const D = G.density;
  if (!D || typeof D !== 'object') return '';
  const lines = [];
  const FIELD_ORDER = ['rowMinH', 'controlH', 'padY', 'padX', 'gap'];
  const kebabField = (f) => f.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

  const blockFor = (mode) => {
    const entry = D[mode];
    if (!entry || !entry.value) return null;
    const body = FIELD_ORDER.filter((f) => entry.value[f] !== undefined)
      .map((f) => `    --density-${kebabField(f)}: ${entry.value[f]};`)
      .join('\n');
    return body;
  };

  const fallback = blockFor('default');

  lines.push('/* Display density (P8.4). Emitted from global.density.* -- do not hand-edit. */');

  for (const mode of Object.keys(D)) {
    if (mode.startsWith('_')) continue;
    const body = blockFor(mode);
    if (!body) continue;

    if (mode === 'compact') {
      lines.push('@media (pointer: fine) {');
      lines.push(`  [data-density='${mode}'] {`);
      lines.push(body.replace(/^/gm, '  '));
      lines.push('  }');
      lines.push('}');
      // A coarse or absent pointer must land on the default values even if the
      // attribute says compact. Listed positively rather than negated so this does
      // not depend on engine handling of a top-level `not`.
      if (fallback) {
        lines.push('@media (pointer: coarse), (pointer: none) {');
        lines.push(`  [data-density='${mode}'] {`);
        lines.push(fallback.replace(/^/gm, '  '));
        lines.push('  }');
        lines.push('}');
      }
      continue;
    }

    lines.push(`[data-density='${mode}'] {`);
    lines.push(body);
    lines.push('}');
  }
  return lines.join('\n');
}

function themeBlock(themeName, selector) {
  const flat = flatten(S[themeName], `semantic.${themeName}`);
  const prefix = `semantic.${themeName}.`;
  const lines = [];
  lines.push(`  /* ${themeName} */`);
  for (const [p, t] of Object.entries(flat)) {
    const path = p.startsWith(prefix) ? p.slice(prefix.length) : p;
    if (path === 'colorScheme') continue;
    // `components.*` is handled separately below: those keys are component-layer
    // overrides, not root variables, and emitting `--components-sidebar-...`
    // would be both wrong-named and shadowed by nothing.
    if (path.startsWith('components.')) continue;
    lines.push(`  ${cssVarName(rootVarName(path))}: ${t.value};`);
  }
  // Component tokens are emitted into the DARK block only, which made every
  // component-scoped colour theme-invariant. The sidebar is the visible
  // consequence: OLED black inside the light theme. A component layer that cannot
  // vary by theme is a theme layer that lies.
  //
  // Fix: let a theme override any component token by declaring it under
  // `semantic[theme].components`. The dark block keeps the unscoped component
  // defaults (so existing values are unchanged), and a theme that declares an
  // override emits it, which CSS specificity resolves over the unscoped :root.
  for (const [p, t] of Object.entries(componentFlat)) {
    lines.push(`  ${cssVarName(p)}: ${t.value};`);
  }

  const themeComponents = S[themeName].components;
  if (themeComponents) {
    for (const [p, t] of Object.entries(flatten(themeComponents, 'components'))) {
      const leaf = p.slice('components.'.length);
      if (leaf.startsWith('_')) continue; // documentation keys are not tokens
      // Re-key from `components.sidebar.background` onto the canonical
      // `component.sidebar.background` path the global block already emits.
      const canonical = 'component.' + leaf;
      lines.push(`  ${cssVarName(canonical)}: ${t.value};`);
    }
  }

  return `${selector} {\n${lines.join('\n')}\n}`;
}

function tailwindThemeBlock() {
  // The app is CSS-first (no tailwind.config.*), so @theme inline IS the Tailwind config.
  // Semantic paths map to utilities by prefix:
  //   color.background -> --color-background
  //   border.control  -> --color-border-control
  //   text.primary    -> --color-text-primary
  //   status.dangerFill -> --color-status-danger-fill
  //   ai.fill         -> --color-ai-fill
  //   shadow.e1       -> --shadow-e1
  const lines = [];
  const darkFlat = flatten(S.dark, 'semantic.dark');
  const prefix = 'semantic.dark.';

  for (const [p, t] of Object.entries(darkFlat)) {
    const path = p.startsWith(prefix) ? p.slice(prefix.length) : p;
    const [group, ...rest] = path.split('.');
    const leaf = rest.join('-');
    if (path === 'colorScheme') continue;
    const varRef = `var(${cssVarName(rootVarName(path))})`;

    if (group === 'color') {
      const util = kebab(rest.join('-'));
      lines.push(t.type === 'colorHsl' ? `  --color-${util}: hsl(${varRef});` : `  --color-${util}: ${varRef};`);
    } else if (group === 'shadow') {
      lines.push(`  --shadow-${kebab(leaf)}: ${varRef};`);
    } else if (t.type === 'colorHsl') {
      lines.push(`  --color-${kebab(path)}: hsl(${varRef});`);
    } else {
      lines.push(`  --color-${kebab(path)}: ${varRef};`);
    }
  }

  // sidebar family: shadcn expects bg-sidebar / text-sidebar-foreground, so the
  // token named `background` becomes the `sidebar` utility itself.
  for (const [p, t] of Object.entries(componentFlat)) {
    if (!p.startsWith('component.sidebar.')) continue;
    const leaf = p.replace(/^component\.sidebar\./, '');
    if (!['background', 'foreground', 'primary', 'primary-foreground', 'accent', 'accent-foreground', 'border', 'ring'].includes(leaf)) continue;
    const util = leaf === 'background' ? 'sidebar' : `sidebar-${leaf}`;
    const varName = cssVarName(p);
    lines.push(t.type === 'colorHsl' ? `  --color-${util}: hsl(var(${varName}));` : `  --color-${util}: var(${varName});`);
  }

  // fonts, radii, type scale, motion, z-index, spacing-4 contract
  // Fonts are dynamically emitted from global.font.* so any new font token
  // in tokens/tokens.json emits automatically to --font-*.
  if (G.font && typeof G.font === 'object') {
    for (const [k, fontObj] of Object.entries(G.font)) {
      if (fontObj && typeof fontObj === 'object' && fontObj.value) {
        lines.push(`  --font-${kebab(k)}: ${fontObj.value};`);
      }
    }
  }
  // P7 type scale -> --text-* (additive: none of these names collide with a
  // Tailwind default, so emitting them cannot restyle existing utilities).
  for (const [k, t] of Object.entries(globalFlat)) {
    if (k.startsWith('global.type.')) {
      const name = kebab(k.split('.').pop());
      const v = t.value;
      lines.push(`  --text-${name}: ${v.size};`);
      lines.push(`  --text-${name}--line-height: ${v.lineHeight};`);
      lines.push(`  --text-${name}--letter-spacing: ${v.tracking};`);
      lines.push(`  --text-${name}--font-weight: ${v.weight};`);
    }
  }
  // P8 spacing scale -> --spacing-*.
  //
  // Until 2026-10-07 this emitted exactly ONE value, `--spacing-4`, and only
  // because shadcn's sidebar.tsx reads var(--spacing-4) inside a calc(). The other
  // ten steps in global.space.* emitted nothing, so the P8 scale was a
  // declaration with no reachable surface: you could not write `p-3` from a token,
  // and `tokens:check` could not tell the difference between "scale exists" and
  // "scale is dead", because dead emits nothing and therefore looks up-to-date.
  //
  // SAFE to emit additively: Tailwind v4 derives every spacing utility from the
  // single `--spacing: 0.25rem` base, so `p-4` is `calc(var(--spacing) * 4)`. The
  // token steps are the exact multiples of that base (0.25rem x N), so emitting
  // them introduces utilities that were previously unreachable and restyles
  // nothing that already existed. See the radius note below for a case where
  // that reasoning does NOT hold.
  if (G.space && typeof G.space === 'object') {
    for (const [k, t] of Object.entries(G.space)) {
      if (t && typeof t === 'object' && 'value' in t) lines.push(`  --spacing-${k}: ${t.value};`);
    }
  }

  // RADIUS: deliberately NOT emitted.
  //
  // Unlike spacing, the radius steps are NOT the Tailwind defaults, and
  // --radius-* is the namespace `rounded-*` resolves against. Emitting these
  // would silently restyle every rounded utility in the app:
  //   rounded-sm  0.25rem -> 0.625rem   (rounded-sm: 22 usages)
  //   rounded-md  0.375rem -> 0.875rem  (rounded-md: 102 usages)
  //   rounded-lg  0.5rem  -> 1.25rem    (rounded-lg: 174 usages)
  //   rounded-xl  0.75rem -> 1.75rem    (rounded-xl: 213 usages)
  // ...and the scale has no 2xl/3xl step at all, while the app uses rounded-2xl
  // 83 times and rounded-3xl 3 times. So the token scale is not a restatement of
  // what the app renders; adopting it is a VISUAL REDESIGN of all 511 rounded-*
  // usages, not a mechanical refactor. That is an owner design decision with a
  // screenshot review attached, so it is deliberately not automated here.
  //
  // The tokens remain reachable as `--global-radius-*` (emitted in LAYER 1) for
  // anyone doing that migration deliberately.

  // P10 motion scale -> --duration-* / --ease-*.
  //
  // Previously defined in global.duration/easing and emitted nowhere reachable:
  // `duration-{instant,fast,base,slow,deliberate}` and `ease-{standard,decelerate,
  // accelerate}` could not be written as utilities, so the app carried 21 raw
  // Tailwind `duration-*` usages against a scale it could not reference.
  //
  // SAFE to emit additively: Tailwind's own defaults are `ease-in` / `ease-out` /
  // `ease-in-out` / `ease-linear`, and duration defaults are bare numbers
  // (duration-100 ... duration-1000). None of the token names collide with either,
  // so this adds new utilities and restyles nothing.
  if (G.duration && typeof G.duration === 'object') {
    for (const [k, t] of Object.entries(G.duration)) {
      if (t && typeof t === 'object' && 'value' in t) lines.push(`  --duration-${kebab(k)}: ${t.value};`);
    }
  }
  if (G.easing && typeof G.easing === 'object') {
    for (const [k, t] of Object.entries(G.easing)) {
      if (t && typeof t === 'object' && 'value' in t) lines.push(`  --ease-${kebab(k)}: ${t.value};`);
    }
  }

  // z-index scale -> --z-index-*.
  //
  // Previously emitted nowhere reachable. SAFE to emit additively: Tailwind v4's
  // z-index utilities are bare numbers (z-10, z-50); these are named steps
  // (dock, overlay, modal, toast), so no existing utility changes meaning and the
  // scale finally documents the layer order P8 requires.
  if (G.zIndex && typeof G.zIndex === 'object') {
    for (const [k, t] of Object.entries(G.zIndex)) {
      if (t && typeof t === 'object' && 'value' in t) lines.push(`  --z-index-${kebab(k)}: ${t.value};`);
    }
  }

  return `@theme inline {\n${lines.join('\n')}\n}`;
}

const cssParts = [BANNER, ''];
cssParts.push('/* LAYER 1: global primitives (theme-agnostic raw values) */');
cssParts.push(':root {');
for (const [p, t] of Object.entries(globalFlat)) {
  cssParts.push(`  ${cssVarName(p)}: ${flattenValue(t.value)};`);
}
cssParts.push('}');
cssParts.push('');

// §P8.4 display density. The :root block above already emitted the flattened
// `density.*` primitives; these scope them to [data-density="mode"]. Emitted
// here rather than hand-written in index.css so `tokens:check` covers them --
// previously a typo in a density value shipped silently, because no gate walked
// that block.
const densityCss = densityBlock();
if (densityCss) {
  cssParts.push(densityCss);
  cssParts.push('');
}
cssParts.push('/* LAYER 2: brand-level aliases */');
cssParts.push(':root {');
for (const [p, t] of Object.entries(aliasFlat)) {
  cssParts.push(`  ${cssVarName(p)}: ${t.value};`);
}
cssParts.push('}');
cssParts.push('');
cssParts.push('/* LAYER 3: semantic roles. Default scope is dark (preserves shipped');
cssParts.push('   appearance). Light overrides the same variable names via [data-theme]. */');
cssParts.push(themeBlock('dark', ':root'));
cssParts.push('');
cssParts.push(themeBlock('light', ':root[data-theme="light"]'));
cssParts.push('');
cssParts.push('/* Tailwind v4 CSS-first theme config. Emits the --color-* / --text-* /');
cssParts.push('   --spacing-* / --duration-* / --ease-* / --z-index-* utilities.');
cssParts.push('   Radius is intentionally absent -- see tailwindThemeBlock() for why. */');
cssParts.push(tailwindThemeBlock());
cssParts.push('');
cssParts.push('/* P23 / WCAG high-contrast: map semantics onto system colors, strengthen borders. */');
cssParts.push('@media (prefers-contrast: more) {');
cssParts.push('  :root {');
const hcFlat = flatten(S['high-contrast'], 'semantic.high-contrast');
for (const [p, t] of Object.entries(hcFlat)) {
  const name = p.replace(/^semantic\.high-contrast\./, '');
  cssParts.push(`    ${cssVarName(name)}: ${t.value};`);
}
cssParts.push('  }');
cssParts.push('}');
cssParts.push('');
cssParts.push('@media (forced-colors: active) {');
cssParts.push('  :root {');
cssParts.push('    --border-control: CanvasText;');
cssParts.push('    --color-ring: Highlight;');
cssParts.push('  }');
cssParts.push('}');
cssParts.push('');
const css = cssParts.join('\n');

// --- build the TS types -----------------------------------------------------
function tsType(t) {
  switch (t.type) {
    case 'color':
    case 'colorHsl':
      return 'string';
    case 'typography':
      return '{ size: string; lineHeight: string; weight: number; tracking: string }';
    default:
      return 'string';
  }
}
// Serialize a leaf token's VALUE into a TypeScript literal.
// Keys are emitted verbatim (NOT kebab-cased) so the shape matches the
// `typography` contract declared by tsType() above:
//   { size: string; lineHeight: string; weight: number; tracking: string }
// Note tsType() itself is currently unused -- it is dead code, kept here as the
// documented contract that tsValue() emits against.
function tsValue(node) {
  const v = node.value;
  if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v !== null && typeof v === 'object') {
    const parts = Object.keys(v).map(function (k) {
      const raw = v[k];
      const lit =
        typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : `'${String(raw).replace(/'/g, "\\'")}'`;
      return `${k}: ${lit}`;
    });
    return '{ ' + parts.join(', ') + ' }';
  }
  return 'null';
}

function emitTsGroup(group, basePath, indent) {
  const pad = '  '.repeat(indent);
  const lines = [];
  for (const [key, node] of Object.entries(group)) {
    if (node == null || typeof node !== 'object') continue;
    const p = basePath ? `${basePath}.${key}` : key;
    if ('value' in node) {
      // Comma, not semicolon: these entries live inside an object literal
      // (`export const tokens = { ... }`), where ';' is a syntax error. The
      // themes block emitted further down already used ',' consistently; this
      // was the one divergent emitter. A trailing comma is valid in TS.
      lines.push(`${pad}'${kebab(p)}': ${tsValue(node)},`);
    } else {
      lines.push(`${pad}'${kebab(p)}': {`);
      lines.push(...emitTsGroup(node, p, indent + 1));
      lines.push(`${pad}},`);
    }
  }
  return lines;
}

const tsParts = [
  // Use BANNER verbatim. It is already a well-formed block comment, and the
  // CSS output uses it unchanged (see cssParts above). The previous
  // `BANNER.replace('/* ', '// ').replace(' */', '')` rewrote only the opening
  // and closing delimiters, leaving the ' * ' continuation lines on lines
  // 2-6 as bare invalid TypeScript -- which broke `tsc` for artifacts/cadence
  // (198 errors) while `build-tokens.cjs --check` still reported "ok", because
  // the corrupted file matched the corrupted generator output exactly.
  BANNER,
  '',
  "export type ThemeName = 'light' | 'dark';",
  '',
  '/** CSS custom property name for a semantic token. */',
  "export const cssVar = (token: string): string => `--${token}`;",
  '',
  '/** Resolved token values, keyed by kebab-case token path. */',
  'export const tokens = {',
  ...emitTsGroup(G, 'global', 1),
  '};',
  '',
  'export const themes: Record<ThemeName, Record<string, string>> = {',
  ...Object.keys(S)
    .filter((t) => t !== 'high-contrast')
    .map((t) => {
      const flat = flatten(S[t], `semantic.${t}`);
      const prefix = `semantic.${t}.`;
      const body = Object.entries(flat)
        .map(([p, tok]) => {
          const name = p.startsWith(prefix) ? p.slice(prefix.length) : p;
          return `    '${kebab(name)}': '${tok.value}',`;
        })
        .join('\n');
      return `  ${t}: {\n${body}\n  },`;
    }),
  '};',
  '',
];
const ts = tsParts.join('\n');

// --- coverage self-test ------------------------------------------------------
//
// `--check` compares generated output against the file on disk. That catches
// "someone edited the emitter and forgot to regenerate". It CANNOT catch the
// failure that actually happened here: a token family that is fully declared in
// tokens.json and emits NOTHING, which is byte-for-byte consistent between runs
// and therefore permanently "ok".
//
// Concretely, on 2026-10-07 four whole families (space, radius, zIndex,
// duration/easing) were declared, emitted only as inert `--global-*` vars or not
// at all, and every `tokens:check` in CI reported ok for months. This test is the
// missing assertion: every declared family must actually reach the Tailwind
// `@theme` surface, or be explicitly declared as intentionally-not-emitted with a
// written reason.
//
// NOT_EMITTED is an allowlist, not a suppression list. Adding a family to it
// requires a reason string, so "why is this dead?" is answerable from the source.
const NOT_EMITTED_TO_THEME = {
  radius:
    'Deliberate: token values differ from Tailwind defaults (sm .625rem vs .25rem, ' +
    'lg 1.25rem vs .5rem) and the scale lacks 2xl/3xl, so emitting --radius-* ' +
    'would restyle all 511 rounded-* usages. Visual redesign, owner decision.',
  font: 'Emitted as --font-* by the dedicated loop above.',
  color: 'Emitted as --color-* by the semantic loop above.',
  type: 'Emitted as --text-* by the dedicated loop above.',
  density: 'Emitted as [data-density] blocks via densityBlock(), not @theme.',
  size: 'Primitive sizing values; consumed as --global-size-* and by component CSS.',
  grid: 'Layout primitives; consumed as --global-grid-* and by component CSS.',
  breakpoint: 'Informational; Vite/Tailwind breakpoints are configured in CSS, not here.',
  opacity: 'Informational; no component currently opts in.',
};

function themeBody() {
  const m = css.match(/@theme inline \{([\s\S]*?)\n\}/);
  return m ? m[1] : '';
}

// Family -> the @theme namespace it must reach. The token family name and the
// emitted namespace are not always identical (zIndex -> --z-index-*, easing ->
// --ease-*), so the mapping is explicit rather than guessed: a wrong guess here
// would either fail a healthy family or wave through a dead one.
const THEME_NAMESPACE = {
  space: '--spacing-',
  duration: '--duration-',
  easing: '--ease-',
  zIndex: '--z-index-',
  type: '--text-',
  font: '--font-',
  color: '--color-',
  shadow: '--shadow-',
};

const theme = themeBody();
const coverageProblems = [];
const families = Object.keys(globalFlat).map((p) => p.replace(/^global\./, '').split('.')[0]);
for (const fam of new Set(families)) {
  if (!G[fam] || typeof G[fam] !== 'object') continue;
  if (fam in NOT_EMITTED_TO_THEME) continue;
  const ns = THEME_NAMESPACE[fam];
  if (!ns) {
    coverageProblems.push(`${fam} (no THEME_NAMESPACE mapping)`);
    continue;
  }
  if (!theme.includes(ns)) coverageProblems.push(fam);
}

if (coverageProblems.length) {
  console.error(
    `TOKEN COVERAGE FAIL: ${coverageProblems.join(', ')} declared in tokens.json ` +
      `but never reach the Tailwind @theme surface. Either emit the family or ` +
      `add it to NOT_EMITTED_TO_THEME in build-tokens.cjs with a reason.`,
  );
}

// --- write or check ---------------------------------------------------------
function ensureDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

if (CHECK_ONLY) {
  let stale = 0;
  for (const [file, content] of [[OUT_CSS, css], [OUT_TS, ts]]) {
    const rel = path.relative(ROOT, file);
    if (!fs.existsSync(file)) {
      console.error(`MISSING  ${rel}  (run: node scripts/build-tokens.cjs)`);
      stale++;
    } else if (fs.readFileSync(file, 'utf8') !== content) {
      console.error(`STALE    ${rel}  (run: node scripts/build-tokens.cjs)`);
      stale++;
    } else {
      console.log(`ok       ${rel}`);
    }
  }
  // Coverage is checked on BOTH paths: a stale file is already a failure, and a
  // fresh file with a dead token family is a DIFFERENT failure that the staleness
  // comparison structurally cannot see.
  process.exit(stale === 0 && coverageProblems.length === 0 ? 0 : 1);
}

ensureDir();
fs.writeFileSync(OUT_CSS, css);
fs.writeFileSync(OUT_TS, ts);

console.log(`generated ${path.relative(ROOT, OUT_CSS)}  (${css.length} bytes)`);
console.log(`generated ${path.relative(ROOT, OUT_TS)}  (${ts.length} bytes)`);
console.log(`themes: ${themes.join(', ')}`);
if (coverageProblems.length) {
  console.error(
    `TOKEN COVERAGE FAIL: ${coverageProblems.join(', ')} — see NOT_EMITTED_TO_THEME in build-tokens.cjs`,
  );
  process.exit(1);
}
console.log(`global tokens: ${Object.keys(globalFlat).length}`);
console.log(`component tokens: ${Object.keys(componentFlat).length}`);
for (const t of themes) {
  console.log(`  ${t}: ${Object.keys(flatten(S[t], `semantic.${t}`)).length} semantic tokens`);
}
