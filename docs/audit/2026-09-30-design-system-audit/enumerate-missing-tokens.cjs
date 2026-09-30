#!/usr/bin/env node
// Enumerate CSS custom properties that artifacts/cadence/src/components/ui/**.tsx
// reference via var(--x) but that artifacts/cadence/src/index.css never defines.
// Also reports Tailwind utility classes whose backing @theme key is absent.
// This is the evidence for repairing the 54 unmounted shadcn primitives.
// Run: node enumerate-missing-tokens.cjs

const fs = require('fs');
const path = require('path');

const UI_DIR = path.join(__dirname, '..', '..', '..', 'artifacts', 'cadence', 'src', 'components', 'ui');
const CSS = path.join(__dirname, '..', '..', '..', 'artifacts', 'cadence', 'src', 'index.css');
const CONFIG = path.join(__dirname, '..', '..', '..', 'artifacts', 'cadence', 'components.json');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const css = fs.readFileSync(CSS, 'utf8');

// --- collect DEFINED custom properties (--name:) ---
const defined = new Set();
for (const m of css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) defined.add(m[1]);

// --- collect vars REFERENCED by the ui primitives ---
const files = walk(UI_DIR);
const refs = new Map(); // varName -> Set(file:line)
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      const n = m[1];
      if (!refs.has(n)) refs.set(n, new Set());
      refs.get(n).add(`${path.basename(f)}:${i + 1}`);
    }
  });
}

const missing = [...refs.entries()].filter(([n]) => !defined.has(n)).sort();

console.log('=== CSS custom properties referenced by components/ui/** but NOT defined in index.css ===\n');
console.log(`ui primitive files scanned : ${files.length}`);
console.log(`distinct vars referenced   : ${refs.size}`);
console.log(`distinct vars defined      : ${defined.size}`);
console.log(`MISSING                    : ${missing.length}\n`);
for (const [name, sites] of missing) {
  console.log(`${name}`);
  console.log(`    used in ${sites.size} place(s): ${[...sites].slice(0, 6).join(', ')}${sites.size > 6 ? ' …' : ''}`);
}

// --- which of those come from hsl(var(--x)) triple pattern (need a NUMBER, not a color) ---
console.log('\n=== how each missing var is consumed (shadcn expects hsl(N S% L%)) ===\n');
for (const [name] of missing) {
  const triple = new RegExp(`--color-${name.replace(/^--/, '')}\\s*:\\s*hsl\\(var\\(${name}\\)\\)`).test(css);
  console.log(`${name.padEnd(34)} ${triple ? 'consumed as hsl(var(x)) -> needs "H S% L%" triple' : 'not an hsl() triple consumer in index.css'}`);
}

// --- shadcn utility classes whose @theme key is absent ---
console.log('\n=== shadcn utility classes used in ui/** with no @theme key in index.css ===\n');
const themeKeys = new Set([...css.matchAll(/^\s*(--color-[A-Za-z0-9_-]+|--radius-[A-Za-z0-9_-]+|--text-[A-Za-z0-9_-]+|--spacing[A-Za-z0-9_-]*|--shadow-[A-Za-z0-9_-]+):/gm)].map((m) => m[1]));
const utilUse = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\b(hover-elevate|active-elevate-2|shadow-card|shadow-card-hover|shadow-xs|shadow-sm|shadow-md|shadow-lg)\b/g)) {
    if (!utilUse.has(m[1])) utilUse.set(m[1], new Set());
    utilUse.get(m[1]).add(path.basename(f));
  }
}
if (utilUse.size === 0) console.log('(none)');
for (const [u, fs2] of utilUse) console.log(`  ${u.padEnd(20)} in ${fs2.size} file(s): ${[...fs2].join(', ')}`);

console.log('\n=== index.css @theme keys currently defined ===\n');
console.log([...themeKeys].sort().join('\n'));
