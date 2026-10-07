/**
 * Verifies the `@utility` sizing classes resolve to real computed values in a
 * browser.
 *
 * This exists because the first attempt at this migration produced classes that
 * emitted NO CSS, which is invisible in source review and silently drops
 * min-height to auto. Asserting on the compiled CSS caught it; this asserts on
 * the values the browser actually resolves, which is stronger still.
 *
 * Usage: node scripts/verify-sizing-utilities.cjs
 */
const path = require('path');
const { chromium } = require(require.resolve('@playwright/test', {
  paths: [path.join(process.cwd(), 'artifacts', 'cadence')],
}));

const BASE = 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Inject a probe element for each utility and read back the computed style.
  const result = await page.evaluate(() => {
    const probes = [
      ['calendar-cell', 'minHeight', '212px'],
      ['automation-card', 'minHeight', '92px'],
      ['menu-surface', 'minWidth', '128px'],
      ['dialog-surface', 'maxWidth', '420px'],
      ['side-panel', 'maxWidth', '240px'],
      ['app-canvas', 'maxWidth', '1680px'],
      ['control-md-h', 'minHeight', '40px'],
      ['control-sm-h', 'minHeight', '32px'],
      ['tap-target-h', 'minHeight', '44px'],
      ['control-lg-w', 'minWidth', '48px'],
      ['overlay-cta-h', 'minHeight', '46px'],
      ['overlay-action-h', 'minHeight', '42px'],
      ['filter-chip-h', 'minHeight', '38px'],
    ];
    const out = [];
    for (const [cls, prop, expected] of probes) {
      const el = document.createElement('div');
      el.className = cls;
      el.style.position = 'absolute';
      el.style.visibility = 'hidden';
      document.body.appendChild(el);
      const cs = getComputedStyle(el);
      out.push({ cls, prop, expected, actual: cs[prop] });
      el.remove();
    }
    return out;
  });

  let failures = 0;
  console.log('utility               property    expected   actual     verdict');
  console.log('-'.repeat(66));
  for (const r of result) {
    const ok = r.actual === r.expected;
    if (!ok) failures++;
    console.log(
      `${r.cls.padEnd(22)} ${r.prop.padEnd(11)} ${r.expected.padEnd(10)} ${r.actual.padEnd(10)} ${ok ? 'PASS' : 'FAIL'}`,
    );
  }

  await browser.close();
  console.log('');
  console.log(failures === 0 ? 'RESULT: PASS -- every utility resolves to its token value' : `RESULT: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})();