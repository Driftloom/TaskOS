#!/usr/bin/env node
/**
 * WCAG contrast gate for the design-token palette.
 *
 * Reads tokens/tokens.json (the single source of truth) and checks the
 * foreground/background pairs the UI actually renders, per theme. Fails on any
 * pair below its WCAG threshold, so a palette edit that breaks legibility cannot
 * land unnoticed.
 *
 * Thresholds are the real WCAG 2.2 SC values, not taste:
 *   1.4.3 Contrast (Minimum)   4.5:1 normal text, 3:1 large text
 *   1.4.11 Non-text Contrast   3:1 for UI components and meaningful graphics,
 *                               which is what a control BORDER must meet
 *
 * Colour parsing handles hex and Tailwind v4 `H S% L%` space-separated form,
 * because build-tokens.cjs emits the latter. An earlier ad-hoc check assumed
 * hex and silently reported every token as 1.07:1, which nearly let a real
 * 3.44:1 failure be dismissed as a parser artifact.
 *
 * ASCII-only output, by contract: this machine's console is codepage 437 and
 * renders UTF-8 as garbage.
 *
 * Usage: node scripts/verify-contrast.cjs [--verbose]
 */
const { parseColor, lum, walk, resolveRef, tokens: t } = require('./lib/contrast-lib.cjs');

const VERBOSE = process.argv.includes('--verbose');

const c = (n) => `color.${n}`;

/**
 * [foregroundKey, backgroundKey, minimumRatio, label].
 * `card` is the surface a control most often sits on in both themes.
 */
function pairsFor() {
  return [
    [c('foreground'), c('background'), 4.5, 'body text on page'],
    [c('foreground'), c('card'), 4.5, 'body text on card'],
    [c('cardForeground'), c('card'), 4.5, 'card heading text'],
    [c('mutedForeground'), c('background'), 4.5, 'caption on page'],
    [c('mutedForeground'), c('card'), 4.5, 'caption on card'],
    [c('primaryForeground'), c('primary'), 4.5, 'primary button label'],
    [c('accent'), c('background'), 4.5, 'link / scheduled text on page'],
    [c('accent'), c('card'), 4.5, 'link / scheduled text on card'],
    ['border.control', c('background'), 3, 'control border vs page (1.4.11)'],
    ['border.control', c('card'), 3, 'control border vs card (1.4.11)'],
    // No "border-control on a primary fill" pair: zero elements in the app carry
    // both `border-border-control` and `bg-primary`. Primary CTAs are fill-only,
    // so a control border never sits on a saturated fill. Asserting it would be a
    // constraint on a rendering that does not exist, and would only ever fail.
    ['text.primary', c('background'), 4.5, 'explicit text.primary token'],
    ['text.secondary', c('background'), 4.5, 'explicit text.secondary token'],
    ['text.tertiary', c('background'), 4.5, 'explicit text.tertiary token'],
    ['status.dangerText', c('background'), 4.5, 'urgent status text'],
    ['status.dangerText', c('card'), 4.5, 'urgent status text on card'],
    ['status.successText', c('background'), 4.5, 'completed status text'],
    ['status.successText', c('card'), 4.5, 'completed status text on card'],
    ['status.warningText', c('background'), 4.5, 'caution status text'],
    ['status.warningText', c('card'), 4.5, 'caution status text on card'],
    ['ai.text', c('background'), 4.5, 'memory / AI text on page'],
    ['ai.text', c('card'), 4.5, 'memory / AI text on card'],
    [c('destructiveForeground'), c('destructive'), 4.5, 'destructive fill label'],
    [c('successForeground'), c('success'), 4.5, 'success fill label'],
  ];
}

let failures = 0;
let checks = 0;
let unresolved = 0;

console.log('');
console.log('Cadence contrast gate  --  WCAG 2.2 SC 1.4.3 (4.5:1) / 1.4.11 (3:1)');
console.log('='.repeat(74));

for (const theme of ['light', 'dark']) {
  const flat = {};
  walk(t.semantic[theme], '', flat);

  console.log('');
  console.log(`--- ${theme} ---`);
  for (const [fgK, bgK, min, label] of pairsFor()) {
    const fg = flat[fgK];
    const bg = flat[bgK];
    if (fg === undefined || bg === undefined) {
      unresolved++;
      console.log(`  ??   ${label.padEnd(40)} missing token (${fgK} / ${bgK})`);
      continue;
    }
    if (parseColor(fg) === null || parseColor(bg) === null) {
      unresolved++;
      console.log(`  ??   ${label.padEnd(40)} unparseable value`);
      continue;
    }
    checks++;
    const l1 = lum(parseColor(fg));
    const l2 = lum(parseColor(bg));
    const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const ok = r >= min;
    if (!ok) failures++;
    const detail = VERBOSE ? `   ${fg} on ${bg}` : '';
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(40)} ${r.toFixed(2).padStart(6)}:1  min ${String(min)}${detail}`,
    );
  }
}

/* Component-scope pairs.
 *
 * These live in the `component` layer, which build-tokens.cjs emits unscoped by
 * default -- so a light-theme override has to be declared under
 * `semantic[theme].components` or the component renders with dark values in the
 * light theme. That happened: the sidebar stayed OLED black while the rest of the
 * page went light, and the pair was absent from this gate's table entirely, so
 * every semantic check passed while the screen was visibly broken.
 *
 * This block is the fix. Anything themed at component scope must be asserted
 * here, otherwise "the tokens are fine" will keep meaning "the tokens nobody
 * looks at are fine".
 */
function componentPairs(theme) {
  const scoped = t.semantic[theme].components?.sidebar;
  const g = {};
  walk(t.component.sidebar, '', g);
  // A theme override wins; otherwise fall back to the unscoped component default.
  // Values are `{ value }` in the token file, so unwrap when reading a default.
  const raw = (name) => {
    if (scoped && scoped[name]) return scoped[name].value;
    const leaf = g[name];
    const flat = leaf && typeof leaf === 'object' && 'value' in leaf ? leaf.value : leaf;
    return resolveRef(flat);
  };
  const bg = raw('background');
  const fg = raw('foreground');

  // The `surface` group is the same failure mode, second instance: the sidebar
  // override was the first, and the surface ramp was missed. .card-hig reads
  // --component-surface-card, which was emitted unscoped and identical to dark,
  // so the light theme painted a near-black card and every Profile heading
  // measured ~1.04:1. Sixteen targets, invisible text.
  const scopedSurface = t.semantic[theme].components?.surface;
  const gs = {};
  walk(t.component.surface, '', gs);
  const surf = (name) => {
    if (scopedSurface && scopedSurface[name]) return scopedSurface[name].value;
    const leaf = gs[name];
    const flat = leaf && typeof leaf === 'object' && 'value' in leaf ? leaf.value : leaf;
    return resolveRef(flat);
  };

  return [
    ['sidebar label', fg, bg, 4.5],
    ['sidebar border (1.4.11)', raw('border'), bg, 3],
    ['sidebar primary label', raw('primary'), bg, 4.5],
    ['sidebar selected label', raw('accentForeground'), raw('accent'), 4.5],
    // Card text is the heading-on-card case: the first 16 failures on Profile.
    ['card heading (.card-hig)', surf('cardForeground') || fg, surf('card'), 4.5],
    ['card body text', fg, surf('card'), 4.5],
    // Deliberately NO "card border" pair. A card's hairline is decoration, not a
    // meaningful graphic, so WCAG 1.4.11's 3:1 does not apply to it -- asserting
    // it here would encode a rule that does not exist and would push someone to
    // darken a decorative line for no accessibility gain. The 1.4.11 requirement
    // that DOES bind is control boundaries, asserted in the e2e suite against real
    // rendered borders (which is how btn-secondary's 1.07:1 was found).
    ['raised surface text', fg, surf('raised'), 4.5],
    ['input field text', fg, surf('input'), 4.5],
  ];
}

console.log('');
console.log('='.repeat(74));
console.log(`  pairs checked : ${checks}`);
console.log(`  failing       : ${failures}`);
console.log(`  unresolved    : ${unresolved}`);
console.log('');

// Component scope, asserted per theme.
console.log('');
console.log('--- component scope ---');
for (const theme of ['light', 'dark']) {
  console.log(`  [${theme}]`);
  const scoped = Boolean(t.semantic[theme].components?.sidebar);
  console.log(`    (${scoped ? 'theme override declared' : 'using unscoped component defaults'})`);
  for (const [label, fg, bg, min] of componentPairs(theme)) {
    if (fg === undefined || bg === undefined) {
      unresolved++;
      console.log(`    ??   ${label.padEnd(38)} token missing`);
      continue;
    }
    if (parseColor(fg) === null || parseColor(bg) === null) {
      unresolved++;
      console.log(`    ??   ${label.padEnd(38)} unparseable value`);
      continue;
    }
    checks++;
    const l1 = lum(parseColor(fg));
    const l2 = lum(parseColor(bg));
    const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(
      `    ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(38)} ${r.toFixed(2).padStart(6)}:1  min ${min}`,
    );
  }
}

console.log('');
console.log('='.repeat(74));
console.log(`  pairs checked : ${checks}`);
console.log(`  failing       : ${failures}`);
console.log(`  unresolved    : ${unresolved}`);
console.log('');

if (failures > 0) {
  console.log('  FAIL  contrast below the WCAG minimum. Fix the token, not the gate.');
  console.log('');
  process.exit(1);
}
if (unresolved > 0) {
  console.log('  WARN  pairs could not be resolved, so coverage is incomplete.');
  console.log('        Treat this as a failure until every pair resolves.');
  console.log('');
  process.exit(1);
}
console.log('  PASS  every measured pair meets its WCAG threshold.');
console.log('');
