#!/usr/bin/env node
/**
 * Repairs CP1252 / Latin-1 double-encoding in place.
 *
 * The inverse of scan-mojibake.cjs's round-trip detector: re-encode each
 * affected line back through CP1252 and decode as strict UTF-8. A line only gets
 * rewritten when that decode SUCCEEDS and produces different text, so genuine
 * typography is left alone by construction -- this is the property the scanner's
 * character-class heuristic could not provide (it flagged 276 clean lines).
 *
 * Default is a dry run. Pass --fix to write. Lines that cannot be recovered this
 * way are reported so they can be fixed by hand; do not blind-decode them.
 *
 * ASCII-only output by contract: the console here is codepage 437.
 *
 * Usage:
 *   node scripts/repair-encoding.cjs            (report only)
 *   node scripts/repair-encoding.cjs --fix      (write changes)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FIX = process.argv.includes('--fix');

const CP1252_SPECIAL = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

// Bytes that decode as valid UTF-8 into codepoints CP1252 can encode back.
const LATIN1_SPECIAL = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};
const CP1252_TO_LATIN1 = new Map();
for (const [cp, byte] of Object.entries(LATIN1_SPECIAL)) {
  CP1252_TO_LATIN1.set(byte, Number(cp));
}

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

const STRICT = new TextDecoder('utf-8', { fatal: true });

/**
 * Some lines went through the mangler more than once, so a single pass is not
 * always enough. An em dash (U+2014) maps to CP1252 byte 0x97; that byte is not
 * valid UTF-8 on its own, so one round leaves U+00E2 U+20AC U+201D, and a second
 * round through CP1252 turns those into more Latin-1. Iterating to a fixed point
 * handles any number of passes. It is safe
 * because a line only changes when the CP1252 re-encode decodes as strict UTF-8
 * into something DIFFERENT, and legitimate typography never satisfies that, so
 * the loop always terminates without touching prose.
 */
function attempt(line) {
  let current = line;
  for (let pass = 0; pass < 8; pass++) {
    const b = toCp1252Bytes(current);
    if (!b || b.length === 0) break;
    let decoded;
    try {
      decoded = STRICT.decode(b);
    } catch {
      break;
    }
    if (decoded === current) break;
    current = decoded;
  }
  return current === line ? null : current;
}

const TARGETS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const files = TARGETS.length > 0 ? TARGETS : [
  'scripts/lint-tokens.cjs',
  'artifacts/cadence/src/components/chrome/CommandPalette.tsx',
  'artifacts/cadence/src/components/chrome/AppShell.tsx',
  'artifacts/cadence/src/index.css',
  'artifacts/cadence/src/pages/settings/MessagingIntegrationsView.tsx',
];

let fixedLines = 0;
let failedLines = 0;
const failures = [];

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.log(`  MISSING  ${rel}`);
    continue;
  }
  const src = fs.readFileSync(abs, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  let changed = 0;

  for (let i = 0; i < lines.length; i++) {
    const repaired = attempt(lines[i]);
    if (repaired !== null) {
      lines[i] = repaired;
      changed++;
      fixedLines++;
    }
  }

  if (changed > 0) {
    console.log(`  ${FIX ? 'REPAIRED' : 'WOULD REPAIR'}  ${rel}  (${changed} line(s))`);
    if (FIX) fs.writeFileSync(abs, lines.join(eol), 'utf8');
  } else {
    // Byte-pattern hits that the round trip cannot undo need manual attention:
    // they may be double-encoded TWICE, which only one CP1252 pass cannot undo.
    const latin1 = Buffer.from(src, 'utf8').toString('latin1');
    const dd = (latin1.match(/\xC3[\x82\x83\x85\x8B\x8F\x94]/g) || []).length;
    if (dd > 0) {
      failedLines += dd;
      failures.push({ rel, dd });
      console.log(`  NEEDS MANUAL  ${rel}  (${dd} latin1 hit(s) the round trip could not undo)`);
    }
  }
}

console.log('');
console.log(`  mode            : ${FIX ? 'FIX' : 'dry run'}`);
console.log(`  lines repaired  : ${fixedLines}`);
console.log(`  lines remaining : ${failedLines}`);
console.log('');
if (failedLines > 0) {
  console.log('  For lines the round trip cannot undo, prefer restoring the file from');
  console.log('  git and re-running the deterministic transform that changed it.');
  console.log('');
}
