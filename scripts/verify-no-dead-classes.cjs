#!/usr/bin/env node
/**
 * Fails if a Tailwind class in app source emits NO CSS in the built bundle.
 *
 * WHY THIS EXISTS
 * ---------------
 * Twice in this project a migration produced classes that silently did nothing:
 *
 *   1. `min-h-[40px]` -> `min-h-size-control-md`, across 47 sites. Tailwind v4
 *      resolves `min-h-*`/`max-w-*`/`min-w-*` from the --spacing namespace ONLY, so
 *      a custom token under `--size-*`, `--container-*` or
 *      `--component-dimension-*` emits no utility. min-height fell back to `auto`.
 *   2. A later `git checkout --` to revert a one-line probe reverted an entire
 *      file's migrations and reinstated those dead classes.
 *
 * In both cases every existing gate passed: typecheck cannot see it, lint sees
 * valid syntax, `tokens:check` only compares generated files, and the build
 * succeeds. Only the compiled output reveals it. THIS is that check.
 *
 * The failure is silent and invisible in review, so it gets a gate rather than a
 * convention.
 *
 * Requires `pnpm --filter @workspace/cadence run build` to have been run.
 *
 * Usage: node scripts/verify-no-dead-classes.cjs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts', 'cadence', 'src');
const DIST = path.join(ROOT, 'artifacts', 'cadence', 'dist', 'public', 'assets');

// Tailwind namespaces that resolve only for numbers / known keywords. A custom
// token name under any OTHER namespace produces no utility at all.
const DEAD_PATTERNS = [
  { name: 'min-h-* under a non-spacing namespace', re: /(?:min-h)-((?:size|component-dimension|container)-[a-z0-9-]+)/g },
  { name: 'min-w-* under a non-spacing namespace', re: /(?:min-w)-((?:size|component-dimension|container)-[a-z0-9-]+)/g },
  { name: 'max-w-* under a non-spacing namespace', re: /(?:max-w)-((?:size|component-dimension|container)-[a-z0-9-]+)/g },
  { name: 'h-* under a non-spacing namespace', re: /(?<![\w-])h-((?:size|component-dimension|container)-[a-z0-9-]+)/g },
  { name: 'w-* under a non-spacing namespace', re: /(?<![\w-])w-((?:size|component-dimension|container)-[a-z0-9-]+)/g },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'generated') continue;
      out.push(...walk(p));
    } else if (/\.(tsx|ts)$/.test(e.name) && !/\.generated\./.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error('MISSING build output. Run: pnpm --filter @workspace/cadence run build');
  process.exit(1);
}

const css = fs
  .readdirSync(DIST)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(DIST, f), 'utf8'))
  .join('\n');

if (!css) {
  console.error('No CSS emitted. Cannot verify.');
  process.exit(1);
}

// A class is "present in the bundle" if the escaped selector appears at all.
const emitted = (cls) => {
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.includes(`.${esc}`) || css.includes(`.${cls}`);
};

const hits = [];
for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');
  for (const { name, re } of DEAD_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const cls = m[1];
      // @utility classes are legitimate; the check is whether Tailwind emitted
      // anything for this exact class name.
      if (!emitted(cls)) hits.push({ rel, cls, name, line: src.slice(0, m.index).split('\n').length });
    }
  }
}

if (hits.length === 0) {
  console.log('PASS -- every custom-namespace size class in source emits CSS in the bundle.');
  console.log('       (a class that emits nothing is a silent regression: it stays in the');
  console.log('        markup, does nothing, and lets the property fall back to its default)');
  process.exit(0);
}

console.error(`FAIL -- ${hits.length} class(es) in source emit NO CSS:`);
for (const h of hits) console.error(`  ${h.rel}:${h.line}  ${h.cls}   [${h.name}]`);
console.error('');
console.error('Tailwind resolves min-h-*/max-w-*/min-w-* from --spacing only. For a custom');
console.error('value use an @utility rule in index.css, or an arbitrary value with var().');
process.exit(1);