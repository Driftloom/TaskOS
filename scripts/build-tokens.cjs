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
  lines.push(`  --font-sans: ${G.font.sans.value};`);
  lines.push(`  --font-mono: ${G.font.mono.value};`);
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
  // P7 hard floor: nothing below 12px is authored. caption (0.75rem) is the floor.
  // shadcn contract: sidebar.tsx reads var(--spacing-4) inside a calc(), and
  // Tailwind v4 emits only a single --spacing base.
  lines.push(`  --spacing-4: ${G.space['4'].value};`);
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
cssParts.push('   --radius-* / --z-index-* utilities the app uses. */');
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
  process.exit(stale === 0 ? 0 : 1);
}

ensureDir();
fs.writeFileSync(OUT_CSS, css);
fs.writeFileSync(OUT_TS, ts);

console.log(`generated ${path.relative(ROOT, OUT_CSS)}  (${css.length} bytes)`);
console.log(`generated ${path.relative(ROOT, OUT_TS)}  (${ts.length} bytes)`);
console.log(`themes: ${themes.join(', ')}`);
console.log(`global tokens: ${Object.keys(globalFlat).length}`);
console.log(`component tokens: ${Object.keys(componentFlat).length}`);
for (const t of themes) {
  console.log(`  ${t}: ${Object.keys(flatten(S[t], `semantic.${t}`)).length} semantic tokens`);
}
