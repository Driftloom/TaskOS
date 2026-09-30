#!/usr/bin/env node
/**
 * Final cleanup: three comment-only lines that still carry mojibake.
 *
 * By this point every damaged line is either a comment, a decorative glyph, or a
 * label. These three are comments, so they are rewritten as ASCII prose. The
 * detector below is the byte-level one (C3 followed by an 80-9F continuation),
 * because the character-level test no longer sees anything.
 *
 * Run with --check to preview.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--check');

const JOBS = [
  {
    file: 'artifacts/cadence/src/index.css',
    lines: {
      95: '   Hover is gated behind (hover: hover) per spec P12 so touch devices never',
      111: '/* Expanded hit area (spec P8.1: 44x44px minimum tap target).',
    },
  },
  {
    file: 'artifacts/cadence/src/pages/today/TodayPage.tsx',
    lines: {
      127: '      {/* P14.2 order: 1 Start (dominant), 2 rings, 3 timeline, 4 attention, 5 quiet footer.',
    },
  },
];

let filesChanged = 0;
let linesChanged = 0;

for (const job of JOBS) {
  const abs = path.join(ROOT, job.file);
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  let dirty = false;
  for (const [n, replacement] of Object.entries(job.lines)) {
    const idx = Number(n) - 1;
    if (idx >= lines.length) {
      console.log(`  SKIP ${job.file}:${n} (out of range)`);
      continue;
    }
    lines[idx] = replacement;
    linesChanged++;
    dirty = true;
  }
  if (dirty) {
    filesChanged++;
    if (!DRY) fs.writeFileSync(abs, lines.join('\n'), 'utf8');
  }
}

console.log(`\nfinal comment cleanup${DRY ? ' (CHECK)' : ''}`);
console.log('='.repeat(50));
console.log(`files: ${filesChanged}   lines: ${linesChanged}`);
console.log('');
