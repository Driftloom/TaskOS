#!/usr/bin/env node
/**
 * One-shot migration: hardcoded hex colors -> semantic token utilities.
 *
 * Context-aware: the same hex becomes a different utility depending on the
 * Tailwind prefix it sits under (bg- / text- / border- / ring- / from- / to-).
 * Only color utilities are rewritten; no size, spacing or layout class is
 * touched, so this cannot move anything on screen beyond recolouring.
 *
 * Bare hex in JS object literals (e.g. the Clerk appearance config) cannot use a
 * Tailwind utility, so it is rewritten to a var() string.
 *
 * Usage: node scripts/migrate-colors-to-tokens.cjs [--dry]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts', 'cadence', 'src');
const DRY = process.argv.includes('--dry');

// hex -> { bg, text, border, ring, from, to, via, fill, stroke, varName }
const MAP = {
  '#FF9F0A': { bg: 'primary', text: 'primary', border: 'primary', ring: 'primary', varName: '--primary' },
  '#FF9500': { bg: 'primary', text: 'primary', border: 'primary', ring: 'primary', varName: '--primary' },
  '#FF8500': { bg: 'primary', text: 'primary', border: 'primary', ring: 'primary', varName: '--primary' },
  '#30D158': { bg: 'success', text: 'success', border: 'success', ring: 'success', varName: '--success' },
  '#34C759': { bg: 'success', text: 'success', border: 'success', ring: 'success', varName: '--success' },
  '#FF453A': { bg: 'destructive', text: 'destructive', border: 'destructive', ring: 'destructive', varName: '--destructive' },
  '#FF3B30': { bg: 'destructive', text: 'destructive', border: 'destructive', ring: 'destructive', varName: '--destructive' },
  '#0A84FF': { bg: 'accent', text: 'accent', border: 'accent', ring: 'accent', varName: '--accent' },
  '#007AFF': { bg: 'accent', text: 'accent', border: 'accent', ring: 'accent', varName: '--accent' },
  '#FFD60A': { bg: 'caution', text: 'caution', border: 'caution', ring: 'caution', varName: '--caution' },
  '#FFCC00': { bg: 'caution', text: 'caution', border: 'caution', ring: 'caution', varName: '--caution' },
  // P6.3: one indigo only. #5E5CE6 and #7A78FF both collapse to the ai token.
  '#5E5CE6': { bg: 'ai', text: 'ai', border: 'ai', ring: 'ai', varName: '--ai-fill' },
  '#7A78FF': { bg: 'ai', text: 'ai', border: 'ai', ring: 'ai', varName: '--ai-fill' },
  '#7D7AFF': { bg: 'ai', text: 'ai', border: 'ai', ring: 'ai', varName: '--ai-fill' },
  // surfaces
  '#1C1C1E': { bg: 'card', text: 'card', border: 'card', ring: 'card', varName: '--card' },
  '#18181B': { bg: 'card', text: 'card', border: 'card', ring: 'card', varName: '--card' },
  '#2C2C2E': { bg: 'muted', text: 'muted', border: 'muted', ring: 'muted', varName: '--muted' },
  '#3A3A3C': { bg: 'muted', text: 'muted', border: 'muted', ring: 'muted', varName: '--muted' },
  '#121214': { bg: 'card', text: 'card', border: 'card', ring: 'card', varName: '--card' },
  '#141416': { bg: 'muted', text: 'muted', border: 'muted', ring: 'muted', varName: '--muted' },
  '#111113': { bg: 'muted', text: 'muted', border: 'muted', ring: 'muted', varName: '--muted' },
  '#242428': { bg: 'muted', text: 'muted', border: 'muted', ring: 'muted', varName: '--muted' },
  '#151518': { bg: 'muted', text: 'muted', border: 'muted', ring: 'muted', varName: '--muted' },
  '#262628': { bg: 'muted', text: 'muted', border: 'muted', ring: 'muted', varName: '--muted' },
  '#323236': { bg: 'muted', text: 'muted', border: 'muted', ring: 'muted', varName: '--muted' },
  '#0E0E10': { bg: 'card', text: 'card', border: 'card', ring: 'card', varName: '--card' },
  // text
  '#F5F5F7': { bg: 'foreground', text: 'foreground', border: 'foreground', ring: 'foreground', varName: '--foreground' },
  '#98989D': { bg: 'muted-foreground', text: 'muted-foreground', border: 'muted-foreground', ring: 'muted-foreground', varName: '--muted-foreground' },
  '#FFFFFF': { bg: 'foreground', text: 'foreground', border: 'foreground', ring: 'foreground', varName: '--foreground' },
  '#FFF': { bg: 'foreground', text: 'foreground', border: 'foreground', ring: 'foreground', varName: '--foreground' },
  '#000000': { bg: 'background', text: 'foreground', border: 'background', ring: 'background', varName: '--background' },
};

const PREFIXES = ['bg', 'text', 'border', 'ring', 'from', 'to', 'via', 'fill', 'stroke', 'divide', 'outline'];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // vendored shadcn primitives, and the GENERATED token layer (which is the
      // definition of these colors, not a consumer of them)
      if (e.name === 'ui' || e.name === 'styles') continue;
      out.push(...walk(p));
    } else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

let totalReplaced = 0;
let totalVar = 0;
const changed = [];
const unmapped = new Map();

for (const f of walk(SRC)) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  let src = fs.readFileSync(f, 'utf8');
  const before = src;

  // 1) context-aware arbitrary utilities:  bg-[#HEX] -> bg-token
  src = src.replace(
    new RegExp(`\\b(${PREFIXES.join('|')})-\\[(${Object.keys(MAP).map((h) => h.replace('#', '#')).join('|')})\\]`, 'gi'),
    (_m, prefix, hexRaw) => {
      const hex = hexRaw.toUpperCase();
      const entry = MAP[hex];
      if (!entry) return _m;
      const token = entry[prefix] || entry.text;
      totalReplaced++;
      return `${prefix}-${token}`;
    },
  );

  // 2) bare hex inside quoted JS string values -> var() reference
  src = src.replace(/(['"])(#[0-9A-Fa-f]{3,8})\1/g, (m, q, hexRaw) => {
    const hex = hexRaw.toUpperCase();
    const entry = MAP[hex];
    if (!entry) {
      unmapped.set(hex, (unmapped.get(hex) || 0) + 1);
      return m;
    }
    // if the surrounding className already got tokenized, skip; else emit var()
    if (/-\[/.test(m)) return m;
    totalVar++;
    return `${q}hsl(var(${entry.varName}))${q}`;
  });

  // 3) any remaining raw hex literal in code (shadow strings etc.) -> report only
  const left = src.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
  for (const h of left) unmapped.set(h.toUpperCase(), (unmapped.get(h.toUpperCase()) || 0) + 1);

  if (src !== before) {
    changed.push({ rel, replaced: (before.match(/-\[#[0-9A-Fa-f]{3,8}\]/gi) || []).length });
    if (!DRY) fs.writeFileSync(f, src);
  }
}

console.log(`\nmigrate-colors-to-tokens ${DRY ? '(DRY RUN)' : ''}`);
console.log('='.repeat(60));
console.log(`files changed          : ${changed.length}`);
console.log(`arbitrary utils tokenized: ${totalReplaced}`);
console.log(`bare hex -> var()         : ${totalVar}`);
if (unmapped.size) {
  console.log(`\nNOT mapped (left as-is, flagged):`);
  for (const [hex, n] of [...unmapped.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${hex}  x${n}`);
  }
}
console.log('');
