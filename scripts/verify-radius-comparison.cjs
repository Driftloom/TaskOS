#!/usr/bin/env node
/**
 * Produces a BEFORE / AFTER comparison of the 2026-10-07 radius adoption.
 *
 * The change moved 511 rendered radii from Tailwind's defaults (4/6/8/12px) to the
 * canonical spec P8 scale (6/10/14/20/28px). That was verified numerically --
 * browser-computed values read 14 / 20 / 28 / 9999px -- but a number is not a
 * picture, and "is this spec-correct" and "does this look right" are different
 * questions. Only the owner can answer the second one.
 *
 * This renders both states side by side from the SAME build output by overriding
 * the four radius variables in CSS, so the comparison isolates radius and nothing
 * else -- no rebuild, no second bundle, no chance of drift between the two shots.
 *
 * Usage: node scripts/verify-radius-comparison.cjs [outDir]
 */
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(process.cwd(), 'screenshots', 'radius-comparison');
const BASE = 'http://127.0.0.1:4173';

// Tailwind v4 defaults, which is what the app rendered before adoption.
//
// These override the CONCRETE `.rounded-*` rules, not the CSS variables. That
// distinction matters: build-tokens.cjs emits @theme inline, which substitutes
// values at build time, so the utilities are literal declarations
// (`.rounded-lg{border-radius:1.25rem}`) and no `--radius-*` variable exists at
// runtime to override. Overriding the variables silently does nothing -- which is
// itself worth knowing, and is why this script reads back what the browser
// actually resolved instead of trusting the injection.
const BEFORE_CSS = `
  .rounded-xs { border-radius: 0.125rem; }
  .rounded-sm { border-radius: 0.25rem; }
  .rounded-md { border-radius: 0.375rem; }
  .rounded-lg { border-radius: 0.5rem; }
  .rounded-xl { border-radius: 0.75rem; }
`;

(async () => {
  const { chromium } = require(require.resolve('@playwright/test', {
    paths: [path.join(process.cwd(), 'artifacts', 'cadence')],
  }));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  const shoot = async (label, css) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    if (css) {
      // Force the override to land AFTER the bundle's stylesheet. addStyleTag
      // appends to <head>; the bundle link is also in <head>, so same-specificity
      // rules added later win. Verified by reading the computed values back.
      await page.addStyleTag({ content: css });
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: false });

    // Read back what the browser resolved, so the numbers in the report are the
    // values actually applied rather than what we asked for.
    const measured = await page.evaluate(() => {
      const out = {};
      for (const cls of ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl']) {
        const el = document.createElement('div');
        el.className = cls;
        el.style.position = 'absolute';
        el.style.visibility = 'hidden';
        document.body.appendChild(el);
        out[cls] = getComputedStyle(el).borderRadius;
        el.remove();
      }
      return out;
    });
    console.log(`${label.padEnd(7)} ${JSON.stringify(measured)}`);
    return measured;
  };

  const before = await shoot('before', BEFORE_CSS);
  const after = await shoot('after', null);

  await browser.close();

  const lines = [
    '# Radius adoption: before vs after',
    '',
    'Before = Tailwind v4 defaults (what the app rendered before 2026-10-07).',
    'After  = canonical spec P8: xs 6 / sm 10 / md 14 / lg 20 / xl 28.',
    '',
    '| class | before | after | ratio |',
    '|---|---|---|---|',
  ];
  for (const k of Object.keys(before)) {
    const b = parseFloat(before[k]);
    const a = parseFloat(after[k]);
    lines.push(`| ${k} | ${before[k]} | ${after[k]} | ${(a / b).toFixed(2)}x |`);
  }
  lines.push('', `Screenshots: ${OUT}`);
  fs.writeFileSync(path.join(OUT, 'README.md'), lines.join('\n') + '\n');

  console.log('');
  console.log(`report written: ${path.join(OUT, 'README.md')}`);
})();