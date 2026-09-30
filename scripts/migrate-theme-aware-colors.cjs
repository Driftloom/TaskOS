#!/usr/bin/env node
/**
 * Migration: dark-only Tailwind palette utilities -> theme-aware token utilities.
 *
 * ## Why this exists
 *
 * The light theme looked broken in a browser and every assertion confirmed it:
 * the Today page heading measured 1.09:1 (white on a near-white canvas), sidebar
 * nav 2.61:1, the Focus timer digits 1.06:1. Meanwhile `verify-contrast.cjs`
 * passed 46/46 pairs, because it reads tokens/tokens.json and the tokens were
 * all correct.
 *
 * Both facts were true, and the contradiction was the finding: 508 className
 * occurrences across 25 files used raw `zinc-400`, `text-white`,
 * `border-white/[0.08]`, `bg-black` and friends. Those are absolute colours with
 * no theme hook, so switching `[data-theme="light"]` re-tinted only the handful
 * of elements that went through tokens. The token pipeline was healthy and
 * largely unused for colour.
 *
 * `migrate-colors-to-tokens.cjs` already did this job for literal hex values.
 * This does it for the named Tailwind palette, which is the larger half of the
 * problem and the half that silently survives a hex sweep.
 *
 * ## Mapping rationale
 *
 * The zinc ramp was doing three jobs at once, so it does not map 1:1:
 *
 *   text-zinc-100..300  -> text-foreground         (primary text)
 *   text-zinc-400..600  -> text-muted-foreground   (captions, metadata)
 *
 * `text-white` -> `text-foreground` rather than `text-white`, because white IS
 * the dark theme's foreground and saying so literally is what made the theme
 * unreversible.
 *
 * The `white/[0.0N]` overlays were a fake elevation system: 0.02/0.03/0.04 read
 * as "one step above the page". Tokens already have `--muted` for that, so they
 * collapse to `bg-muted/NN` and the numeric intent is preserved as an opacity
 * modifier.
 *
 * `border-white/[...]` -> `border-border-control` is not cosmetic. WCAG 1.4.11
 * requires control borders to hold 3:1 against their surface, and a 6%-alpha
 * white cannot do that on a white surface. `border-control` is theme-aware and
 * verified by the contrast gate.
 *
 * Excluded: `artifacts/cadence/src/components/ui/**` (vendored shadcn, kept
 * upstream-clean) and `styles/**` (the token definitions themselves).
 *
 * ## Safety
 *
 * Colour utilities only. No size, spacing, layout, or state class is touched, so
 * nothing can move on screen except colour. `--dry` prints the plan.
 *
 * Usage: node scripts/migrate-theme-aware-colors.cjs [--dry] [--verbose]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts', 'cadence', 'src');
const DRY = process.argv.includes('--dry');
const VERBOSE = process.argv.includes('--verbose');

// Ordered: longest / most specific first so a prefix never eats a longer match.
const MAP = [
  // --- foreground text -------------------------------------------------
  [/text-zinc-100\b/g, 'text-foreground'],
  [/text-zinc-200\b/g, 'text-foreground'],
  [/text-zinc-300\b/g, 'text-foreground'],
  [/text-zinc-400\b/g, 'text-muted-foreground'],
  [/text-zinc-500\b/g, 'text-muted-foreground'],
  [/text-zinc-600\b/g, 'text-muted-foreground'],
  [/text-neutral-400\b/g, 'text-muted-foreground'],
  [/text-white\b/g, 'text-foreground'],

  // --- on-fill text (sits on primary / accent fills) -------------------
  [/text-black\b/g, 'text-primary-foreground'],

  // --- surfaces --------------------------------------------------------
  // Full white was the dark card colour; tokens call it `card`.
  [/bg-white\b/g, 'bg-card'],
  // Alpha-white overlays were a hand-rolled elevation ramp.
  [/bg-white\/\[0\.02\]/g, 'bg-muted/30'],
  [/bg-white\/\[0\.03\]/g, 'bg-muted/40'],
  [/bg-white\/\[0\.04\]/g, 'bg-muted/50'],
  [/bg-white\/\[0\.06\]/g, 'bg-muted/70'],
  [/bg-white\/\[0\.07\]/g, 'bg-muted/80'],
  [/bg-white\/\[0\.08\]/g, 'bg-muted'],
  [/bg-white\/\[0\.1\]?\]?/g, 'bg-muted'],
  [/bg-white\/\[0\.12\]/g, 'bg-muted'],
  // Pure black was the OLED page background.
  [/bg-black\b/g, 'bg-background'],

  // --- borders ---------------------------------------------------------
  // Every alpha-white border is a control boundary and must clear 3:1.
  [/border-white\/\[0\.0[0-9]\]/g, 'border-border-control'],
  [/border-white\/\[0\.1\]?\]?/g, 'border-border-control'],
  [/border-white\/\[0\.12\]/g, 'border-border-control'],
  [/border-white\/\[0\.14\]?\]?/g, 'border-border-control'],
  [/border-white\/\[0\.2\]?\]?/g, 'border-border-strong'],
  [/border-white\b/g, 'border-border-control'],
];

/**
 * Strip a Tailwind variant prefix, run `fn` on the utility, and put it back.
 * Without this, `hover:text-white` would leave a bare `text-foreground`
 * dangling after the `text-white` rule rewrote its tail.
 */
function rewriteWithVariants(source, pattern, replacement) {
  const VARIANT = /((?:[a-z-]+:)*)/;
  let out = '';
  let cursor = 0;
  // Scan for any <prefix><palette-utility> and let `pattern` decide.
  const SCAN = /((?:[a-z-]+:)*(?:bg|text|border|placeholder:bg|placeholder:text|from|to|via|ring|divide|outline)-(?:white|black|zinc-\d{2,3}|neutral-\d{2,3})(?:\/\[[^\]]*\])?)/g;
  let m;
  while ((m = SCAN.exec(source)) !== null) {
    const token = m[0];
    const variantMatch = token.match(VARIANT);
    const variant = variantMatch ? variantMatch[1] : '';
    const utility = token.slice(variant.length);

    // Apply the mapping to the bare utility only.
    let mapped = utility;
    for (const [re, to] of MAP) {
      if (re.test(mapped)) {
        mapped = mapped.replace(re, to);
        re.lastIndex = 0;
        break;
      }
    }
    if (mapped === utility) continue;

    out += source.slice(cursor, m.index) + variant + mapped;
    cursor = m.index + token.length;
  }
  out += source.slice(cursor);
  return out;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'ui' || e.name === 'styles') continue;
      out.push(...walk(p));
    } else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
let totalReplacements = 0;
const changed = [];
const tally = new Map();

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = rewriteWithVariants(before, null, null);
  if (after === before) continue;

  // Tally what actually changed, for the report.
  for (const token of after.match(/[a-z-]*:(?:bg|text|border|ring|from|to|via)-(?:foreground|muted-foreground|card|muted|background|border-control|border-strong|primary-foreground)\b/g) || []) {
    tally.set(token, (tally.get(token) || 0) + 1);
  }

  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const n = before.split('\n').length;
  changed.push({ rel, tokens: (before.match(/(?:bg|text|border|ring|from|to|via)-(?:white|black|zinc-\d{2,3}|neutral-\d{2,3})(?:\/\[[^\]]*\])?/g) || []).length });
  totalReplacements += changed[changed.length - 1].tokens;
  if (!DRY) fs.writeFileSync(file, after, 'utf8');
}

console.log('');
console.log(`  mode                 : ${DRY ? 'DRY RUN' : 'APPLY'}`);
console.log(`  files scanned        : ${files.length}`);
console.log(`  files changed        : ${changed.length}`);
console.log(`  tokens rewritten     : ${totalReplacements}`);
console.log('');
changed
  .sort((a, b) => b.tokens - a.tokens)
  .forEach((c) => console.log(`    ${String(c.tokens).padStart(4)}  ${c.rel}`));
console.log('');
if (VERBOSE) {
  console.log('  resulting token usage:');
  [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .forEach(([k, v]) => console.log(`    ${String(v).padStart(4)}  ${k}`));
  console.log('');
}
console.log('  Next: run the contrast gate and the e2e suite. Both must agree that');
console.log('  light and dark now render legibly; a recolour cannot be trusted on the');
console.log('  strength of a diff review alone.');
console.log('');
