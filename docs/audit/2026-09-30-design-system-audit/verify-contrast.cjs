#!/usr/bin/env node
// Contrast verification for docs/13-master-design-system-prompt.md P6.
// P6 states its ratios were "hand-computed and must be re-verified by script".
// This script re-verifies every ratio quoted in P6, then measures the values
// actually present in artifacts/cadence. Run: node verify-contrast.cjs

function hexToRgb(h) {
  let s = h.replace('#', '').trim();
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

function relLuminance(h) {
  const [r, g, b] = hexToRgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const a = relLuminance(fg);
  const b = relLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG 2.2: 1.4.3 text 4.5 (3.0 for large), 1.4.11 non-text/UI graphics 3.0
function grade(r) {
  if (r >= 4.5) return 'PASS text';
  if (r >= 3.0) return 'PASS large/graphic only';
  return 'FAIL';
}

function row(label, fg, bg, claim, kind) {
  const r = ratio(fg, bg);
  const claimStr = claim == null ? '-' : claim.toFixed(2);
  let verdict;
  if (claim != null) {
    const drift = Math.abs(r - claim);
    if (drift > 0.15) verdict = `CLAIM-DRIFT(${drift.toFixed(2)})`;
    else verdict = 'claim-ok';
  } else {
    verdict = '';
  }
  const line = `${label.padEnd(46)} ${fg} on ${bg}  ${r.toFixed(2).padStart(6)}:1  ${grade(r).padEnd(24)} ${claimStr.padStart(6)}  ${verdict}`;
  console.log(line);
  return { label, fg, bg, r, claim, grade: grade(r), verdict };
}

const results = [];

console.log('\n=== PART 1 — ratios quoted in P6 (claim column = the doc\'s hand-computed number) ===\n');
console.log('--- light mode, P6.1 ---');
results.push(row('interactive.primary.bg orange on white', '#FF9500', '#FFFFFF', 2.2));
results.push(row('text.on-accent on orange', '#1D1D1F', '#FF9500', 7.7));
results.push(row('status.success.fill green on white', '#34C759', '#FFFFFF', 2.2));
results.push(row('status.danger.fill red on white', '#FF3B30', '#FFFFFF', 3.55));
results.push(row('system blue on white (rejected)', '#007AFF', '#FFFFFF', 4.0));
results.push(row('interactive.primary.text-safe on white', '#B25000', '#FFFFFF', 5.2));
results.push(row('status.success.text on white', '#1E7B34', '#FFFFFF', 5.3));
results.push(row('status.danger.text on white', '#D70015', '#FFFFFF', 5.4));
results.push(row('interactive.secondary / link on white', '#0040DD', '#FFFFFF', null));
results.push(row('text.secondary on bg.canvas', '#6E6E73', '#F5F5F7', 4.65));
results.push(row('text.tertiary on surface (non-essential)', '#8E8E93', '#FFFFFF', 3.3));
results.push(row('ai.fill indigo on bg.surface dark', '#5E5CE6', '#1C1C1E', 3.4));

console.log('\n--- dark mode, P6.1 ---');
results.push(row('primary orange on black', '#FF9F0A', '#000000', 10.0));
results.push(row('primary orange on surface', '#FF9F0A', '#1C1C1E', 8.0));
results.push(row('text.secondary on surface', '#98989D', '#1C1C1E', null));
results.push(row('text.tertiary on surface', '#6E6E73', '#1C1C1E', null));
results.push(row('ai.fill lightened on surface', '#7D7AFF', '#1C1C1E', null));
results.push(row('ai.fill lightened on black', '#7D7AFF', '#000000', null));
results.push(row('border.control on surface (needs 3:1)', '#6E6E73', '#1C1C1E', null));
results.push(row('link blue on surface', '#0A84FF', '#1C1C1E', null));
results.push(row('link blue on black', '#0A84FF', '#000000', null));
results.push(row('text.on-accent on dark orange', '#1D1D1F', '#FF9F0A', null));

console.log('\n=== PART 2 — colors ACTUALLY in artifacts/cadence vs surfaces ACTUALLY used ===\n');
console.log('--- indigo: three values coexist in the app ---');
results.push(row('#5E5CE6 (x56) on #1C1C1E', '#5E5CE6', '#1C1C1E', null));
results.push(row('#5E5CE6 (x56) on #18181B', '#5E5CE6', '#18181B', null));
results.push(row('#5E5CE6 (x56) on #000000', '#5E5CE6', '#000000', null));
results.push(row('#7A78FF (x13, =--p-indigo) on #1C1C1E', '#7A78FF', '#1C1C1E', null));
results.push(row('#7A78FF (x13) on #18181B', '#7A78FF', '#18181B', null));
results.push(row('#7D7AFF (P6 dark value) on #1C1C1E', '#7D7AFF', '#1C1C1E', null));

console.log('\n--- status + accent on the surfaces the app actually paints ---');
results.push(row('success #30D158 on #1C1C1E', '#30D158', '#1C1C1E', null));
results.push(row('success #30D158 on #18181B', '#30D158', '#18181B', null));
results.push(row('success #30D158 on #000000', '#30D158', '#000000', null));
results.push(row('danger #FF453A on #1C1C1E', '#FF453A', '#1C1C1E', null));
results.push(row('orange #FF9F0A on #1C1C1E', '#FF9F0A', '#1C1C1E', null));
results.push(row('orange #FF9F0A on #0E0E10 sidebar', '#FF9F0A', '#0E0E10', null));
results.push(row('orange #FF8500 (x3, off-system) on #1C1C1E', '#FF8500', '#1C1C1E', null));
results.push(row('blue #0A84FF on #1C1C1E', '#0A84FF', '#1C1C1E', null));
results.push(row('blue #0055D6 (x1, off-system) on #1C1C1E', '#0055D6', '#1C1C1E', null));
results.push(row('text #98989D on #1C1C1E', '#98989D', '#1C1C1E', null));
results.push(row('text #F5F5F7 on #1C1C1E', '#F5F5F7', '#1C1C1E', null));

console.log('\n--- borders used as control boundaries (WCAG 1.4.11 needs 3:1) ---');
results.push(row('#262628 border on #1C1C1E', '#262628', '#1C1C1E', null));
results.push(row('#242428 border on #1C1C1E', '#242428', '#1C1C1E', null));
results.push(row('#2C2C2E border on #1C1C1E', '#2C2C2E', '#1C1C1E', null));
results.push(row('#323236 border on #1C1C1E', '#323236', '#1C1C1E', null));
results.push(row('#3A3A3C border on #1C1C1E', '#3A3A3C', '#1C1C1E', null));
results.push(row('rgba(255,255,255,0.08) on #1C1C1E (approx)', '#2E2E30', '#1C1C1E', null));

console.log('\n--- border.control REMEDIATION (P6.1 #6E6E73, applied 2026-09-30) ---');
results.push(row('border-control on #18181B (input bg)', '#6E6E73', '#18181B', null));
results.push(row('border-control on #1C1C1E (card)', '#6E6E73', '#1C1C1E', null));
results.push(row('border-control on #141416', '#6E6E73', '#141416', null));
results.push(row('border-control on #000000 (canvas)', '#6E6E73', '#000000', null));
results.push(row('REJECTED lighter alt #646468 on #1C1C1E', '#646468', '#1C1C1E', null));
results.push(row('REJECTED lighter alt #646468 on #18181B', '#646468', '#18181B', null));

console.log('\n=== SUMMARY ===\n');
const drift = results.filter((r) => r.verdict.startsWith('CLAIM-DRIFT'));
const textFails = results.filter((r) => r.grade === 'FAIL');
const graphicOnly = results.filter((r) => r.grade === 'PASS large/graphic only');

console.log(`pairs measured        : ${results.length}`);
console.log(`P6 claim drift >0.15  : ${drift.length}`);
drift.forEach((r) => console.log(`   ! ${r.label}: doc says ${r.claim}, actual ${r.r.toFixed(2)}`));
console.log(`FAIL (<3:1)           : ${textFails.length}`);
textFails.forEach((r) => console.log(`   ! ${r.label}: ${r.r.toFixed(2)}:1`));
console.log(`graphic-only (3-4.5:1) : ${graphicOnly.length}`);
graphicOnly.forEach((r) => console.log(`   ~ ${r.label}: ${r.r.toFixed(2)}:1`));
console.log('');
