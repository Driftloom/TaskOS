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
  // Component tokens: the unscoped defaults live in the DARK block only, because
  // dark IS the default theme. Emitting them into every theme block meant the
  // light block carried dark values first and its own overrides second, so light
  // was correct purely by source order:
  //     :root[data-theme="light"] { --component-sidebar-background: #0E0E10 }  <- dark
  //     :root[data-theme="light"] { --component-sidebar-background: #FFFFFF }  <- light
  // Reorder the emitter, or let anything insert a rule between them, and light
  // mode silently renders a black sidebar on a white app. That is the failure
  // mode the design system names outright: "an unscoped component token renders
  // with dark values in the light theme and is invisible to a semantic-only
  // contrast gate." One block per theme, holding only that theme's values.
  //
  // A theme that declares no `components` block inherits the unscoped default.
  // That is a deliberate invariant, now stated in code rather than left implicit.
  const isDefaultTheme = themeName === 'dark';
  if (isDefaultTheme) {
    for (const [p, t] of Object.entries(componentFlat)) {
      lines.push(`  ${cssVarName(p)}: ${t.value};`);
    }
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

  // P8 radius scale -> --radius-*.
  //
  // Held back until 2026-10-07 because `--radius-*` is the namespace `rounded-*`
  // resolves against and these values are NOT Tailwind's defaults, so emitting
  // restyles every rounded utility in the app. What changed the decision is that
  // these values are not a preference -- they are the canonical spec.
  // docs/13-master-design-system-prompt.md P8 states:
  //     Radius: xs 6 · sm 10 · md 14 · lg 20 · xl 28 · full
  // and tokens.json matches that to the pixel (.375/.625/.875/1.25/1.75rem).
  // So the tokens were already correct and the APP was out of spec, rendering
  // Tailwind defaults (4/6/8/12px).
  //
  // Measured blast radius from actual class counts:
  //   rounded-sm   4px -> 10px     22 usages
  //   rounded-md   6px -> 14px    102 usages
  //   rounded-lg   8px -> 20px    174 usages
  //   rounded-xl  12px -> 28px    213 usages
  //   rounded-full unchanged (both effectively infinite)  81 usages
  //   rounded-none unchanged                                  6 usages
  //
  // Owner decision, 2026-10-07: emit, and bring the off-spec `rounded-2xl`
  // (83 usages, Tailwind 16px) onto the scale, because leaving it would place
  // 16px BELOW rounded-lg at 20px and break monotonicity -- 2xl elements would
  // render visibly LESS rounded than lg elements. P8 defines no 2xl step, so
  // those map to rounded-lg rather than inventing a token the spec lacks.
  // (rounded-3xl has 0 usages, so it needs no mapping.)
  //
  // This needs a screenshot pass after it lands: 511 rendered radii grow.
  if (G.radius && typeof G.radius === 'object') {
    for (const [k, t] of Object.entries(G.radius)) {
      if (t && typeof t === 'object' && 'value' in t) lines.push(`  --radius-${kebab(k)}: ${t.value};`);
    }
  }

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

  // Sizing scale -> --size-*.
  //
  // Declared but never emitted, which meant the app hand-wrote the very values the
  // tokens already held: `min-h-[40px]` x4, `min-h-[44px]`, `min-h-[32px]` and
  // `min-w-[48px]` x3 were all literals matching controlMd / tapTarget /
  // controlSm / controlLg exactly. Emitting makes four already-approved sizes
  // reachable; the migration that followed is a pure rename.
  if (G.size && typeof G.size === 'object') {
    for (const [k, t] of Object.entries(G.size)) {
      if (t && typeof t === 'object' && 'value' in t) lines.push(`  --size-${kebab(k)}: ${t.value};`);
    }
  }

  // Grid/container scale -> --container-*.
  //
  // Previously emitted nowhere, so the app hand-wrote `max-w-[1680px]` in 4 places
  // for the docked-canvas width DESIGN.md section 2 defines as a layout contract.
  // Tokenised at 105rem (= 1680px), a pure rename.
  if (G.grid && typeof G.grid === 'object') {
    for (const [k, t] of Object.entries(G.grid)) {
      if (!k.startsWith('container')) continue;
      if (t && typeof t === 'object' && 'value' in t) {
        lines.push(`  --container-${kebab(k.replace(/^container/, ''))}: ${t.value};`);
      }
    }
  }

  // Component-layer dimensions -> --component-dimension-*.
  //
  // P5.3 forbids arbitrary px, and the smell is a magic number repeated across
  // components. Each of these existed as a literal in 2+ files; each token holds
  // exactly the value that shipped, so the migration is a pure rename. The
  // 38/42/46px trio is a genuine drift surfaced on purpose, not endorsed -- see
  // the `_comment_drift` field in tokens/tokens.json.
  for (const [p, t] of Object.entries(componentFlat)) {
    if (!p.startsWith('component.dimension.')) continue;
    const leaf = p.replace(/^component\.dimension\./, '');
    if (leaf.startsWith('_')) continue; // documentation keys
    lines.push(`  --component-dimension-${kebab(leaf)}: ${t.value};`);
  }

  // Breakpoints -> --breakpoint-*.
  //
  // These were declared but emitted nowhere, AND `sm` was wrong: the token said
  // 30rem while every `sm:` prefix in the app renders at Tailwind's 40rem. A token
  // that contradicts what ships is worse than a missing one. Corrected to 40rem
  // and emitted, so the token is now the source of truth instead of a comment
  // that happens to agree.
  //
  // SAFE to emit: the values match Tailwind's own defaults exactly (sm 40, md 48,
  // lg 64, xl 80, 2xl 96), so this introduces no restyle and only makes the
  // existing scale reachable.
  if (G.breakpoint && typeof G.breakpoint === 'object') {
    for (const [k, t] of Object.entries(G.breakpoint)) {
      if (t && typeof t === 'object' && 'value' in t) lines.push(`  --breakpoint-${kebab(k)}: ${t.value};`);
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
cssParts.push('   --spacing-* / --radius-* / --duration-* / --ease-* / --z-index-*');
cssParts.push('   utilities. Every declared global.* family must reach this surface or');
cssParts.push('   be listed in NOT_EMITTED_TO_THEME with a reason. */');
cssParts.push(tailwindThemeBlock());
cssParts.push('');
cssParts.push('/* P23 / WCAG high-contrast: map semantics onto system colors, strengthen borders. */');
cssParts.push('@media (prefers-contrast: more) {');
cssParts.push('  :root {');
const hcFlat = flatten(S['high-contrast'], 'semantic.high-contrast');
for (const [p, t] of Object.entries(hcFlat)) {
  const name = p.replace(/^semantic\.high-contrast\./, '');
  // Same `components.*` -> `component.*` re-key that themeBlock() performs. This
  // block flattened the raw path and called cssVarName() on it directly, so
  // high-contrast component overrides were emitted as `--components-sidebar-*`
  // while the wired namespace is `--component-sidebar-*`. They therefore never
  // applied: `prefers-contrast: more` overrode nothing in the component layer,
  // and the dead parallel namespace was the only evidence they existed.
  const leaf = name.startsWith('components.') ? 'component.' + name.slice('components.'.length) : name;
  if (leaf.split('.')[1]?.startsWith('_')) continue; // documentation keys are not tokens
  cssParts.push(`    ${cssVarName(leaf)}: ${t.value};`);
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
          // Mirror the CSS canonicalisation: `components.*` is re-keyed to
          // `component.*`. Without this the generated object exported
          // `components-sidebar-background`, whose `cssVar()` round-trip pointed
          // at a custom property that exists in no light or dark block -- a
          // theme-blind key that still type-checked and returned a value.
          const leaf = name.startsWith('components.')
            ? 'component.' + name.slice('components.'.length)
            : name;
          if (leaf.split('.')[1]?.startsWith('_')) return null; // documentation keys
          return `    '${kebab(leaf)}': '${tok.value}',`;
        })
        .filter((line) => line !== null)
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
  font: 'Emitted as --font-* by the dedicated loop above.',
  color: 'Emitted as --color-* by the semantic loop above.',
  type: 'Emitted as --text-* by the dedicated loop above.',
  density: 'Emitted as [data-density] blocks via densityBlock(), not @theme.',
  opacity: 'Informational; no component currently opts in. Tailwind opacity is a fixed numeric scale with no base var, so unlike spacing there is no coupling to win here.',
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
  radius: '--radius-',
  duration: '--duration-',
  easing: '--ease-',
  zIndex: '--z-index-',
  breakpoint: '--breakpoint-',
  size: '--size-',
  grid: '--container-',
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
