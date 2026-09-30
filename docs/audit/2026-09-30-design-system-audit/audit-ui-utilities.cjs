#!/usr/bin/env node
// Diff every Tailwind *utility* class used by artifacts/cadence/src/components/ui/**
// against (a) the --color-* keys defined in index.css @theme, and (b) the Tailwind
// v4 default palette. Anything in neither set renders as a no-op.
// Run: node audit-ui-utilities.cjs

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const UI_DIR = path.join(ROOT, 'artifacts', 'cadence', 'src', 'components', 'ui');
const CSS = path.join(ROOT, 'artifacts', 'cadence', 'src', 'index.css');
const THEME_CSS = path.join(ROOT, 'node_modules', '.pnpm', 'tailwindcss@4.3.3', 'node_modules', 'tailwindcss', 'theme.css');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const css = fs.readFileSync(CSS, 'utf8');
const theme = fs.existsSync(THEME_CSS) ? fs.readFileSync(THEME_CSS, 'utf8') : '';

// --color-* keys defined by the app
const appColors = new Set([...css.matchAll(/(--color-[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1].slice('--color-'.length)));

// Tailwind default palette + keyword colors (slate..stone, white, black, transparent, current, inherit)
const TW_PALETTE = new Set();
for (const m of theme.matchAll(/--color-([a-z]+)-(\d{2,3})\s*:/g)) TW_PALETTE.add(`${m[1]}-${m[2]}`);
for (const m of theme.matchAll(/--color-([a-z]+)\s*:/g)) TW_PALETTE.add(m[1]);
const KEYWORDS = new Set(['white', 'black', 'transparent', 'current', 'inherit']);

const COLOR_PREFIX = /^(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|caret|accent|decoration|shadow)-/;
// gradient direction + position utilities that share the prefix but are not colors
const NOT_COLOR = /^(?:from|to|via)-(?:\d|full|top|bottom|left|right|center)/;
const POSITION = /-(?:\d{1,4}|[xy]|px|auto|full|none|inherit|initial|unset|reverse)$/;

const files = walk(UI_DIR);
const usage = new Map(); // class -> Set(file)
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
    const blob = m[1] || m[2] || m[3] || '';
    // strip template interpolation
    for (const tok of blob.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
      const c = tok.trim();
      if (!c) continue;
      if (!COLOR_PREFIX.test(c)) continue;
      if (NOT_COLOR.test(c)) continue;
      let name = c.replace(COLOR_PREFIX, '');
      // strip state prefix already consumed; strip trailing position/percent
      name = name.replace(/-\d{1,4}%$/, '');
      if (POSITION.test(name)) continue;
      if (KEYWORDS.has(name)) continue;
      // opacity modifier
      name = name.split('/')[0];
      if (KEYWORDS.has(name)) continue;
      if (!usage.has(c)) usage.set(c, new Set());
      usage.get(c).add(path.basename(f));
    }
  }
}

const broken = [];
for (const [cls, fs2] of usage) {
  const name = cls.replace(COLOR_PREFIX, '').split('/')[0].replace(/-\d{1,4}%$/, '');
  if (appColors.has(name)) continue;
  if (TW_PALETTE.has(name)) continue;
  if (KEYWORDS.has(name)) continue;
  broken.push([cls, name, fs2]);
}

console.log('=== Tailwind color utilities in components/ui/** with NO backing token ===\n');
console.log(`app @theme --color-* keys : ${appColors.size}  (${[...appColors].sort().join(', ')})`);
console.log(`ui files scanned          : ${files.length}`);
console.log(`distinct color utilities  : ${usage.size}`);
console.log(`UNBACKED                  : ${broken.length}\n`);

const byName = new Map();
for (const [cls, name, fs2] of broken) {
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(cls + '  <- ' + [...fs2].join(','));
}
for (const [name, list] of [...byName.entries()].sort()) {
  console.log(`--color-${name}`);
  list.forEach((l) => console.log('    ' + l));
}

console.log('\n=== non-color custom utilities referenced but never defined (no @utility in index.css) ===\n');
const CUSTOM = ['hover-elevate', 'active-elevate-2', 'card-hig', 'btn-primary', 'btn-secondary', 'card-enterprise', 'tap-target-44', 'glass-chrome', 'interactive-press'];
for (const c of CUSTOM) {
  const inCss = new RegExp(`\\.${c}\\b`).test(css);
  let used = 0;
  for (const f of walk(path.join(ROOT, 'artifacts', 'cadence', 'src'))) {
    if (path.join(UI_DIR) === f.substring(0, UI_DIR.length)) continue;
    if (new RegExp(`\\b${c}\\b`).test(fs.readFileSync(f, 'utf8'))) used++;
  }
  console.log(`  .${c.padEnd(18)} defined-in-index.css=${String(inCss).padEnd(5)} used-outside-ui-in ${used} file(s)`);
}
