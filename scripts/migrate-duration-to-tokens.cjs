#!/usr/bin/env node
/**
 * One-shot migration: raw Tailwind `duration-*` -> the P10 motion scale.
 *
 * Unlike the type and radius migrations, NONE of these are exact matches:
 *
 *   raw          compiled      nearest P10 token   delta
 *   duration-100  0.1s         duration-fast (120ms)  +20ms
 *   duration-200  0.2s         duration-base (200ms)   0     <- exact
 *   duration-300  0.3s         duration-slow (320ms)  +20ms
 *   duration-500  0.5s         duration-deliberate (480ms)  -20ms
 *
 * The three non-zero deltas are all +/--20ms on 100-500ms transitions, which is
 * below the ~50-100ms threshold at which humans perceive a change in motion
 * timing. This is a deliberate, bounded trade: the gain is that the app is on the
 * semantic motion scale (duration-base means "the normal transition" rather than
 * "whatever number someone typed"), so P10 can be retuned centrally. The cost is
 * a difference nobody will see. Recorded here so it is not mistaken for a no-op.
 *
 * `duration-1000` is NOT mapped: it would halve to 480ms, which IS visible. It
 * has 0 usages, so nothing needs it.
 *
 * Verified coupled-less before migrating: `.duration-200` compiles to
 * `--tw-duration: .2s`, NOT to `--duration-base`, so these genuinely do not read
 * the token scale today.
 *
 * Usage: node scripts/migrate-duration-to-tokens.cjs [--dry]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts', 'cadence', 'src');
const DRY = process.argv.includes('--dry');

const MAP = {
  'duration-100': 'duration-fast',
  'duration-200': 'duration-base',
  'duration-300': 'duration-slow',
  'duration-500': 'duration-deliberate',
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

const files = walk(SRC);
const totals = {};
let filesChanged = 0;
let replacements = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  const perFile = {};

  for (const [from, to] of Object.entries(MAP)) {
    const re = new RegExp(`(?<![\\w-])${from}(?![\\w-])`, 'g');
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
    console.log(`  ${rel.padEnd(62)} ${JSON.stringify(perFile)}`);
  }
}

console.log('');
console.log(`${DRY ? 'DRY RUN' : 'APPLIED'}: ${filesChanged} files, ${replacements} replacements`);
console.log('');
for (const [from, n] of Object.entries(totals)) {
  console.log(`  ${from.padEnd(14)} -> ${MAP[from].padEnd(22)} ${n}`);
}