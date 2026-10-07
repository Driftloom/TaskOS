#!/usr/bin/env node
/**
 * One-shot migration: arbitrary px sizing -> emitted token scales.
 *
 * Every mapping here is an EXACT value match, so this is a pure rename: nothing
 * resizes, nothing moves. Two sources of tokens:
 *
 *   global.size.*      controlSm/Md/Lg, tapTarget -- declared all along but never
 *                      emitted, so the app hand-wrote the exact values it already
 *                      had tokens for (min-h-[40px] x4, min-h-[44px], etc).
 *   component.dimension.*  recurring component literals (calendar cell 212px x10,
 *                      automation card 92px x4, shadcn menu min-width 8rem x6, ...).
 *   global.grid.*      containerCanvas = 105rem = 1680px, the docked-canvas width
 *                      DESIGN.md section 2 defines but the app hard-coded 4x.
 *
 * Values with no token (34/38/42/46/50/60/192/300/560px, 12rem/16rem) are NOT
 * mapped: inventing a size is a design decision, and shifting them would resize
 * real components. Those are reported by the lint rule instead.
 *
 * Usage: node scripts/migrate-size-to-tokens.cjs [--dry]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts', 'cadence', 'src');
const DRY = process.argv.includes('--dry');

const MAP = {
  'min-h-[32px]': 'min-h-size-control-sm',
  'min-h-[40px]': 'min-h-size-control-md',
  'min-h-[44px]': 'min-h-size-tap-target',
  'min-w-[48px]': 'min-w-size-control-lg',
  'min-h-[212px]': 'min-h-component-dimension-calendar-cell-min-h',
  'min-h-[92px]': 'min-h-component-dimension-automation-card-min-h',
  'min-w-[8rem]': 'min-w-component-dimension-menu-min-w',
  'max-w-[420px]': 'max-w-component-dimension-dialog-max-w',
  'max-w-[240px]': 'max-w-component-dimension-panel-max-w',
  'max-w-[1680px]': 'max-w-container-canvas',
  // Known control-height drift, tokenised at existing values (see _comment_drift
  // in tokens.json). Pure renames -- these do NOT resize anything.
  'min-h-[46px]': 'min-h-component-dimension-overlay-cta-min-h',
  'min-h-[42px]': 'min-h-component-dimension-overlay-action-min-h',
  'min-h-[38px]': 'min-h-component-dimension-activity-row-min-h',
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
    console.log(`  ${rel.padEnd(58)} ${JSON.stringify(perFile)}`);
  }
}

console.log('');
console.log(`${DRY ? 'DRY RUN' : 'APPLIED'}: ${filesChanged} files, ${replacements} replacements`);
for (const [from, n] of Object.entries(totals)) {
  console.log(`  ${from.padEnd(16)} -> ${MAP[from].padEnd(48)} ${n}`);
}
