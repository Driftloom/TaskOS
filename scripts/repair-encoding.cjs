#!/usr/bin/env node
/**
 * Repair Windows-1252 round-trip corruption by searching pass depth.
 *
 * ROOT CAUSE: PowerShell 5.1 Get-Content/Set-Content use
 * [System.Text.Encoding]::Default = Windows-1252 on this machine. A BOM-less
 * UTF-8 file read that way and written back as UTF-8 has every non-ASCII byte
 * mapped through the 1252 table and re-encoded, so one character becomes two or
 * three. Some files went through the round trip twice, which is why a single
 * inversion produces invalid UTF-8 (a replacement char) rather than clean text.
 *
 * Because an intermediate state can be invalid, greedy single-pass repair stalls.
 * So this ENUMERATES pass depths 1..5, keeps every result that is valid UTF-8
 * with the original line count, and picks the one with the fewest corruption
 * markers. Nothing is written unless it strictly improves on the input.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = [
  path.join(ROOT, 'artifacts', 'cadence', 'src'),
  path.join(ROOT, 'artifacts', 'api-server', 'src'),
];

const WIN1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

function toByte(cp) {
  if (cp < 0x80) return cp;
  if (cp in WIN1252) return WIN1252[cp];
  if (cp >= 0x80 && cp <= 0xff) return cp;
  return -1; // legitimately correct multi-byte char, leave it alone
}

function invert(text) {
  const bytes = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const b = toByte(cp);
    if (b >= 0) bytes.push(b);
    else for (const x of Buffer.from(ch, 'utf8')) bytes.push(x);
  }
  return Buffer.from(bytes).toString('utf8');
}

const CORRUPT = /[\u00C0-\u00DF][\u0080-\u00FF]/;
const score = (t) => (t.match(new RegExp(CORRUPT.source, 'g')) || []).length;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, out);
    } else if (/\.(tsx|ts|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const CHECK_ONLY = process.argv.includes('--check');
const touched = [];
const unresolved = [];

for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of walk(dir)) {
    const cur = fs.readFileSync(f, 'utf8');
    const before = score(cur);
    if (before === 0) continue;
    const lines = cur.split(/\r?\n/).length;

    // Enumerate pass depths, keep the best valid candidate.
    let best = null;
    for (let depth = 1; depth <= 5; depth++) {
      let t = cur;
      for (let i = 0; i < depth; i++) t = invert(t);
      if (t.includes('\uFFFD')) break;
      if (t.split(/\r?\n/).length !== lines) break;
      const s = score(t);
      if (!best || s < best.score) best = { text: t, score: s, depth };
      if (s === 0) break;
    }

    if (!best || best.score >= before) {
      unresolved.push(`${path.relative(ROOT, f).replace(/\\/g, '/')} (markers=${before})`);
      continue;
    }
    const changed = cur.split(/\r?\n/).filter((l, i) => l !== best.text.split(/\r?\n/)[i]).length;
    touched.push(
      `${path.relative(ROOT, f).replace(/\\/g, '/')} (${changed} lines, depth=${best.depth}, ${before}->${best.score})`,
    );
    if (!CHECK_ONLY) fs.writeFileSync(f, best.text, 'utf8');
  }
}

console.log(`\nwindows-1252 repair by depth search ${CHECK_ONLY ? '(CHECK ONLY)' : ''}`);
console.log('='.repeat(72));
console.log(`files repaired : ${touched.length}`);
for (const t of touched) console.log(`  ${t}`);
if (unresolved.length) {
  console.log(`\nunresolved: ${unresolved.length}`);
  for (const u of unresolved) console.log(`  ${u}`);
}
console.log('');
