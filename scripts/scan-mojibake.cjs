#!/usr/bin/env node
/**
 * Ground truth for text corruption.
 *
 * Two independent detectors, because the two corruption modes have different
 * signatures and catching only one is what let 18 damaged lines through a
 * previous version of this gate:
 *
 *   1. BYTE PATTERN -- U+FFFD (EF BF BD, true data loss) and Latin-1
 *      double-encoding leads (C3 82 / C3 83 / C3 85 / C3 8B / C3 8F).
 *
 *   2. LOSSY ROUND TRIP -- the stronger check, and the one that found the
 *      remaining damage. Take the file's UTF-8 text, re-encode those codepoints
 *      to bytes using CP1252 (exactly what PowerShell 5.1 does on the way out),
 *      and if those bytes decode as valid UTF-8 into a DIFFERENT string, the
 *      file has been through the mangler.
 *
 * Why the round trip is the right test and a character-class scan is wrong:
 * the obvious heuristic "does this line contain U+2013, U+2014, U+2026, U+2019"
 * flags 276 lines of perfectly good typography -- en dashes, ellipses, curly
 * apostrophes. It cannot tell an em dash in prose from a mangled em dash. The
 * round trip can, because damage round-trips and prose does not: every mangled
 * codepoint came from CP1252's own 0x00-0xFF range, whereas a legitimate en dash
 * is NOT representable in CP1252, so re-encoding it produces a byte that cannot
 * begin a valid UTF-8 sequence and the round trip is rejected.
 *
 * Why this needs to exist at all: the console on this machine is codepage 437 and
 * renders valid UTF-8 as garbage. A terminal read therefore cannot distinguish a
 * clean file from a corrupt one, and one repair pass "fixed" clean files because
 * of it. Output here is ASCII-only for the same reason.
 *
 * Exit 0 = clean. Exit 1 = corruption present (paths + counts, ASCII only).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Only tracked source and docs. node_modules, dist, .git, and editor/build
// caches are excluded because they are not reviewable and are regenerated.
const SCAN_ROOTS = [
  'artifacts',
  'lib',
  'scripts',
  'docs',
  'spec',
  'tokens',
  'AGENTS.md',
  'AUDIT.md',
  'PROGRESS.md',
  'README.md',
  'package.json',
];
const SKIP_DIR = /node_modules|\.git|dist|test-results|playwright-report|coverage|\.conversation/;
const EXT = /\.(ts|tsx|cjs|mjs|js|css|md|json|html|ya?ml)$/;

/** CP1252 code points above U+00FF, and the byte each maps to. */
const CP1252_SPECIAL = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

/**
 * Encode a string back through CP1252. Returns null when any codepoint is not
 * representable, which is the signal that this text could not have come out of a
 * CP1252 decoder in the first place.
 */
function toCp1252Bytes(str) {
  const out = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp < 0x100) out.push(cp);
    else if (CP1252_SPECIAL[cp] !== undefined) out.push(CP1252_SPECIAL[cp]);
    else return null;
  }
  return Buffer.from(out);
}

const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Returns the ORIGINAL text if this line is corrupt, else null.
 * A line is corrupt when re-encoding it as CP1252 yields bytes that are valid
 * UTF-8 spelling something else.
 */
function recoverOriginal(line) {
  const bytes = toCp1252Bytes(line);
  if (!bytes || bytes.length === 0) return null;
  let decoded;
  try {
    decoded = STRICT_UTF8.decode(bytes);
  } catch {
    return null;
  }
  return decoded === line ? null : decoded;
}

function collect(relPath, out = []) {
  const abs = path.join(ROOT, relPath);
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return out;
  }
  if (st.isFile()) {
    if (EXT.test(relPath)) out.push(relPath);
    return out;
  }
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const child = `${relPath}/${e.name}`;
    if (e.isDirectory()) {
      if (SKIP_DIR.test(child)) continue;
      collect(child, out);
    } else if (EXT.test(e.name)) {
      out.push(child);
    }
  }
  return out;
}

const files = [];
for (const r of SCAN_ROOTS) collect(r, files);

let replacementChars = 0;
let bytePatternHits = 0;
let roundTripHits = 0;
const bad = [];

for (const rel of files) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const latin1 = buf.toString('latin1');
  const repl = (latin1.match(/\xEF\xBF\xBD/g) || []).length;
  const dd = (latin1.match(/\xC3[\x82\x83\x85\x8B\x8F\x94]/g) || []).length;

  const lines = buf.toString('utf8').split(/\r?\n/);
  let rt = 0;
  for (const line of lines) {
    if (recoverOriginal(line) !== null) rt++;
  }

  replacementChars += repl;
  bytePatternHits += dd;
  roundTripHits += rt;

  const total = repl + dd + rt;
  if (total > 0) bad.push({ rel, repl, dd, rt, total });
}

bad.sort((a, b) => b.total - a.total);

console.log('');
console.log('=== text-encoding ground truth (ASCII-only output) ===');
console.log('  files scanned                :', files.length);
console.log('  U+FFFD (real data loss)      :', replacementChars);
console.log('  Latin-1 double-encoded       :', bytePatternHits);
console.log('  CP1252 round-trip damage     :', roundTripHits);
console.log('');

if (bad.length === 0) {
  console.log('  VERDICT: CLEAN.');
  console.log('  Any garbling seen in a terminal is the codepage-437 console,');
  console.log('  not the files. Do not "fix" it.');
  console.log('');
  console.log('  Repair method when this DOES fail: restore the clean bytes from');
  console.log('  git and re-run the deterministic transform, rather than decoding');
  console.log('  the damage. Use scripts/repair-encoding.cjs --fix to attempt the');
  console.log('  round-trip in reverse automatically; verify by eye afterwards.');
} else {
  console.log(`  VERDICT: ${bad.length} file(s) corrupt:`);
  console.log('');
  console.log('    file                                     U+FFFD  latin1  cp1252');
  for (const b of bad) {
    console.log(
      `    ${b.rel.padEnd(40)} ${String(b.repl).padStart(5)}  ${String(b.dd).padStart(6)}  ${String(b.rt).padStart(6)}`,
    );
  }
}
console.log('');
process.exit(bad.length === 0 ? 0 : 1);
