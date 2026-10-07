#!/usr/bin/env node
/**
 * One-shot migration: off-spec `rounded-2xl` -> the P8 scale.
 *
 * Why this is needed
 * ------------------
 * The P8 canonical scale is `xs 6 · sm 10 · md 14 · lg 20 · xl 28 · full` -- there
 * is no 2xl step. The app was using Tailwind's `rounded-2xl` (16px) 83 times,
 * which is a value the design system does not define. Now that `--radius-*`
 * actually emits, leaving those alone would put 16px BELOW `rounded-lg` at 20px
 * and break scale monotonicity: a `rounded-2xl` card would render visibly LESS
 * rounded than a `rounded-lg` card, which is incoherent.
 *
 * 2xl in this app is used for large surfaces -- cards, panels, sheets, modals
 * (MessagingIntegrationsView, ProfilePage, OnboardingPage, ActivityPage,
 * FirstRunTourModal, MemoryPage, LandingPage). `rounded-lg` at 20px is the P8
 * step for large containers, so 2xl maps there rather than inventing a token the
 * spec does not have.
 *
 * `rounded-3xl` is NOT mapped: it has 0 usages, so there is nothing to migrate.
 * If it ever appears, it needs a spec decision first.
 *
 * Safety properties:
 *  - Whole-token boundary matching, so `rounded-2xl` never eats `rounded-2xl/50`
 *    variants incorrectly and cannot touch `rounded-lg` / `rounded-xl`.
 *  - Reports counts per file for audit.
 *
 * Usage: node scripts/migrate-radius-to-tokens.cjs [--dry]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts', 'cadence', 'src');
const DRY = process.argv.includes('--dry');

const MAP = { 'rounded-2xl': 'rounded-lg' };

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
    // Whole-token boundaries on BOTH sides. The trailing guard must allow a quote
    // or slash as well as whitespace/EOL, because responsive variants like
    // `sm:rounded-2xl` end the token at `"` -- a whitespace-only lookahead
    // silently skipped one real usage in CalendarPage.tsx. The leading
    // lookbehind already permits the variant prefix, since ':' is not [\w-].
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
for (const [from, n] of Object.entries(totals)) {
  console.log(`  ${from} (off-spec, Tailwind 16px) -> ${MAP[from]} (P8 = 20px)   ${n}`);
}
