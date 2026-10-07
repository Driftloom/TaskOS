#!/usr/bin/env node
/**
 * One-shot migration: recurring arbitrary px dimensions -> `@utility` classes.
 *
 * WHY NOT SIMPLY `min-h-size-control-md`
 * --------------------------------------
 * That was tried and it does not work. Tailwind v4 resolves `min-h-*`, `max-w-*`
 * and `min-w-*` from the --spacing namespace ONLY. A custom token under any other
 * namespace (--size-*, --container-*, --component-dimension-*) emits NO utility:
 * the class exists in the markup, does nothing, and min-height falls back to auto.
 * Measured in the built CSS with all six attempted classes present -- zero rules.
 * `@theme inline` does not rescue it either, because it substitutes values at
 * build time and leaves no variable defined.
 *
 * The working pattern is the one this codebase already uses for `.row-density`
 * and `.density-control`: an explicit `@utility` in index.css that reads the
 * runtime-visible token variable. Verified first with `calendar-cell`, which
 * produced `.calendar-cell{min-height:var(--component-dimension-calendar-cell-min-h, 212px)}`.
 *
 * Every mapping below is an EXACT value match, so this is a pure rename and
 * nothing resizes. Hairlines (<=2px) are untouched -- they are border widths.
 *
 * Usage: node scripts/migrate-size-to-tokens.cjs [--dry]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts', 'cadence', 'src');
const DRY = process.argv.includes('--dry');

const MAP = {
  'min-h-[212px]': 'calendar-cell',
  'min-h-[92px]': 'automation-card',
  'min-w-[8rem]': 'menu-surface',
  'max-w-[420px]': 'dialog-surface',
  'max-w-[240px]': 'side-panel',
  'max-w-[1680px]': 'app-canvas',
  'min-h-[40px]': 'control-md-h',
  'min-h-[32px]': 'control-sm-h',
  'min-h-[44px]': 'tap-target-h',
  'min-w-[48px]': 'control-lg-w',
  // Known control-height drift, tokenised at existing values (see _comment_drift).
  'min-h-[46px]': 'overlay-cta-h',
  'min-h-[42px]': 'overlay-action-h',
  'min-h-[38px]': 'activity-row',
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'generated') continue;
      out.push(...walk(p));
    } else if (/\.tsx$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const totals = {};
let filesChanged = 0;
let replacements = 0;

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  const perFile = {};

  for (const [from, to] of Object.entries(MAP)) {
    const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const hits = (before.match(re) || []).length;
    if (hits) {
      perFile[from] = hits;
      totals[from] = (totals[from] || 0) + hits;
      after = after.replace(re, to);
    }
  }

  if (after !== before) {
    filesChanged++;
    replacements += Object.values(perFile).reduce((a, b) => a + b, 0);
    if (!DRY) fs.writeFileSync(file, after, 'utf8');
    console.log(`  ${rel.padEnd(56)} ${JSON.stringify(perFile)}`);
  }
}

console.log('');
console.log(`${DRY ? 'DRY RUN' : 'APPLIED'}: ${filesChanged} files, ${replacements} replacements`);
for (const [from, n] of Object.entries(totals)) {
  console.log(`  ${from.padEnd(16)} -> ${MAP[from].padEnd(18)} ${n}`);
}