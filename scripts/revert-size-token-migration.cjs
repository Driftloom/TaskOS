#!/usr/bin/env node
/**
 * REVERT of migrate-size-to-tokens.cjs.
 *
 * Why this exists: the original migration replaced literals like `min-h-[40px]`
 * with `min-h-size-control-md`, assuming Tailwind would resolve the latter from
 * the `--size-*` token namespace. IT DOES NOT. Verified against the built CSS:
 *
 *   .min-h-size-control-md                    -> 0 rules emitted
 *   .min-h-component-dimension-calendar-cell-min-h -> 0 rules emitted
 *   .max-w-container-canvas                   -> 0 rules emitted
 *
 * Tailwind v4 resolves `min-h-*`, `max-w-*`, `min-w-*` from the `--spacing`
 * namespace ONLY. A bare number works (`min-h-9` -> calc(var(--spacing) * 9));
 * a custom token name under any other namespace (`--size-*`, `--container-*`,
 * `--component-dimension-*`) produces no utility at all. The class silently
 * exists in the markup and does nothing, so `min-height` fell back to `auto`.
 *
 * That is a silent visual regression across 47 usages -- worse than the magic
 * numbers it replaced, because a broken class is invisible in review and the
 * literal at least rendered.
 *
 * This script puts the literals back. It is kept, rather than deleted, because
 * the token definitions it was built against are still correct and a future
 * migration should either use `min-h-<spacing-step>` where a step exists, or
 * introduce real CSS custom properties consumed via an @utility rule -- which is
 * a different, deliberate piece of work.
 *
 * Usage: node scripts/revert-size-token-migration.cjs [--dry]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts', 'cadence', 'src');
const DRY = process.argv.includes('--dry');

const REVERT = {
  'min-h-size-control-sm': 'min-h-[32px]',
  'min-h-size-control-md': 'min-h-[40px]',
  'min-h-size-tap-target': 'min-h-[44px]',
  'min-w-size-control-lg': 'min-w-[48px]',
  'min-h-component-dimension-calendar-cell-min-h': 'min-h-[212px]',
  'min-h-component-dimension-automation-card-min-h': 'min-h-[92px]',
  'min-w-component-dimension-menu-min-w': 'min-w-[8rem]',
  'max-w-component-dimension-dialog-max-w': 'max-w-[420px]',
  'max-w-component-dimension-panel-max-w': 'max-w-[240px]',
  'max-w-container-canvas': 'max-w-[1680px]',
  'min-h-component-dimension-overlay-cta-min-h': 'min-h-[46px]',
  'min-h-component-dimension-overlay-action-min-h': 'min-h-[42px]',
  'min-h-component-dimension-activity-row-min-h': 'min-h-[38px]',
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

  for (const [from, to] of Object.entries(REVERT)) {
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
console.log(`${DRY ? 'DRY RUN' : 'REVERTED'}: ${filesChanged} files, ${replacements} replacements`);
for (const [from, n] of Object.entries(totals)) {
  console.log(`  ${from.padEnd(50)} -> ${REVERT[from].padEnd(14)} ${n}`);
}