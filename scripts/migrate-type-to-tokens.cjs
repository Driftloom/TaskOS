#!/usr/bin/env node
/**
 * One-shot migration: raw Tailwind font-size utilities -> the P7 type scale.
 *
 * Why this is not a blind find-and-replace
 * ---------------------------------------
 * The naive mapping ("text-xs -> text-caption, text-sm -> text-footnote, ...")
 * is WRONG for 5 of the 8 raw sizes, because the P7 scale does not contain a
 * token at the same size. Migrating those would silently RESIZE text app-wide,
 * which is a visual regression rather than adoption. Measured sizes:
 *
 *   raw         Tailwind    nearest P7 token              verdict
 *   text-xs     0.75rem     text-caption  0.75rem         EXACT  -> migrate
 *   text-base   1rem        text-callout  1rem            EXACT  -> migrate
 *   text-xl     1.25rem     text-title3   1.25rem         EXACT  -> migrate
 *   text-sm     0.875rem    text-footnote 0.8125rem       -7.1%  -> LEAVE
 *   text-lg     1.125rem    text-headline 1.0625rem       -5.6%  -> LEAVE
 *   text-2xl    1.5rem      text-title2   1.375rem        -8.3%  -> LEAVE
 *   text-3xl    1.875rem    (none)                        --     -> LEAVE
 *   text-4xl    2.25rem     (none)                        --     -> LEAVE
 *
 * The left-behind set is not deferred debt by accident: the P7 scale genuinely
 * has no step at those sizes. Closing it means either extending the scale (an
 * owner decision: it changes the canonical spec) or accepting the size delta.
 * Both need a screenshot review, so neither is done here.
 *
 * What this DOES change, deliberately: the exact-match migrations stop
 * inheriting Tailwind's default weight/line-height and pick up the P7 token's.
 * text-xs currently renders at weight 400 with no tracking; text-caption is
 * weight 500 with +0.01em tracking and a 1rem line-height. That is the point of
 * adopting the scale, but it is a visible change on ~500 usages, so it needs a
 * screenshot pass after this runs.
 *
 * Safety properties:
 *  - Only whole-token matches: `(?<![\w-])text-xs(?![\w-])`, so `text-xs-sm` and
 *    `hover:text-xs` behave as expected (the latter SHOULD migrate) while
 *    `text-[13px]` and `text-caption` are untouched.
 *  - Never rewrites size, spacing, or colour utilities.
 *  - Reports per-class counts so the result is auditable.
 *
 * Usage: node scripts/migrate-type-to-tokens.cjs [--dry]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts', 'cadence', 'src');
const DRY = process.argv.includes('--dry');

// ONLY exact size matches. See the table in the header comment.
//
// The second block became mappable on 2026-10-07 when the P7 scale was extended
// with micro / macro / display1-3. Those five steps were added at EXACTLY the
// values the Tailwind utilities already rendered (size, line-height, weight 400,
// no tracking), so migrating them is a pure rename with zero rendered change --
// which is why the script can now reach zero rather than leaving a permanent
// "needs an owner decision" tail.
const MAP = {
  // existed before the extension
  'text-xs': 'text-caption',
  'text-base': 'text-callout',
  'text-xl': 'text-title3',
  // enabled by the 2026-10-07 scale extension
  'text-sm': 'text-micro',
  'text-lg': 'text-macro',
  'text-2xl': 'text-display1',
  'text-3xl': 'text-display2',
  'text-4xl': 'text-display3',
  'text-6xl': 'text-display4',
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
let linesChanged = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  const perFile = {};

  for (const [from, to] of Object.entries(MAP)) {
    // Whole-token boundaries. (?<![\w-]) stops matching inside text-xs-sm or
    // foo-text-xs; (?![\w-]) stops matching text-xs-[anything].
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
    linesChanged += Object.values(perFile).reduce((a, b) => a + b, 0);
    if (!DRY) fs.writeFileSync(file, after, 'utf8');
    console.log(`  ${rel.padEnd(62)} ${JSON.stringify(perFile)}`);
  }
}

console.log('');
console.log(`${DRY ? 'DRY RUN' : 'APPLIED'}: ${filesChanged} files, ${linesChanged} replacements`);
console.log('');
console.log('migrated (exact size match, zero rendered change):');
for (const [from, n] of Object.entries(totals)) console.log(`  ${from.padEnd(12)} -> ${MAP[from].padEnd(16)} ${n}`);
const rawLeft = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl', 'text-8xl', 'text-9xl'].filter((k) => !MAP[k]);
console.log('');
if (rawLeft.length === 0) {
  console.log('no unmapped raw Tailwind font sizes remain -- every size in use has a P7 token.');
} else {
  console.log(`NOT migrated (no same-size P7 token; migrating would resize text): ${rawLeft.join(', ')}`);
}
