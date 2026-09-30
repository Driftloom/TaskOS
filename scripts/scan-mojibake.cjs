#!/usr/bin/env node
/**
 * Ground truth for text corruption.
 *
 * PowerShell's console here is codepage 437, which re-renders valid UTF-8 as
 * garbage. That makes every naive terminal read of these files look corrupted
 * even when the bytes are perfect. This script answers the question at the byte
 * level and prints only ASCII, so its own output cannot be misread:
 *
 *   - U+FFFD encoded as UTF-8  -> EF BF BD   (true replacement char = lost data)
 *   - double-encoded lead      -> C3 83 / C3 82 / C3 85 / C3 8B / C3 8F
 *                                  (a UTF-8 sequence that was decoded as
 *                                   Latin-1 and re-encoded as UTF-8)
 *
 * Exit 0 = clean.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = [
  path.join(ROOT, 'artifacts', 'cadence', 'src'),
  path.join(ROOT, 'artifacts', 'api-server', 'src'),
];

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

let files = 0;
let replacement = 0;
let doubleEncoded = 0;
const bad = [];

for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of walk(dir)) {
    files++;
    const buf = fs.readFileSync(f);
    const latin1 = buf.toString('latin1');

    // U+FFFD in UTF-8 is EF BF BD.
    const replMatches = latin1.match(/\xEF\xBF\xBD/g) || [];
    // A double-encoded 3-byte sequence: the first char was itself UTF-8 that
    // got Latin-1'd, so we see C3 followed by a continuation byte.
    const ddMatches = latin1.match(/\xC3[\x82\x83\x85\x8B\x8F\x94]/g) || [];

    const n = replMatches.length + ddMatches.length;
    if (n > 0) {
      bad.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), n });
      replacement += replMatches.length;
      doubleEncoded += ddMatches.length;
    }
  }
}

console.log('');
console.log('=== text-encoding ground truth (ASCII-only output) ===');
console.log('  files scanned            :', files);
console.log('  U+FFFD (real data loss)  :', replacement);
console.log('  double-encoded sequences :', doubleEncoded);
console.log('');

if (bad.length === 0) {
  console.log('  VERDICT: CLEAN.');
  console.log('  Any garbling seen in a terminal is the codepage-437 console,');
  console.log('  not the files. Do not "fix" it.');
} else {
  console.log(`  VERDICT: ${bad.length} file(s) genuinely corrupt:`);
  for (const b of bad) console.log(`    ${String(b.n).padStart(4)}  ${b.file}`);
}
console.log('');
process.exit(bad.length === 0 ? 0 : 1);
