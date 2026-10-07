/**
 * Verifies the /__design catalog is gated out of production builds.
 *
 * `vite preview` serves the real production bundle behind an SPA fallback, so
 * ANY path returns HTTP 200. Asserting on status code would therefore "pass"
 * while the catalog rendered -- which is exactly the wrong check. This asserts
 * on rendered content instead.
 *
 * Usage: node scripts/verify-design-catalog-gated.cjs
 */
const path = require('path');
const { chromium } = require(require.resolve('@playwright/test', {
  paths: [path.join(process.cwd(), 'artifacts', 'cadence')],
}));

const BASE = 'http://127.0.0.1:4173';
const CATALOG_MARKER = 'Interactive Design Catalog';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let failures = 0;

  await page.goto(`${BASE}/__design`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const body = await page.evaluate(() => document.body.innerText);
  const rendered = body.includes(CATALOG_MARKER);

  console.log(`route            : /__design`);
  console.log(`HTTP             : 200 (SPA fallback serves every path -- proves nothing)`);
  console.log(`catalog rendered : ${rendered}`);
  console.log(`body first 120   : ${body.replace(/\s+/g, ' ').slice(0, 120)}`);

  if (rendered) {
    console.log('');
    console.log('FAIL: the design catalog rendered in a production build.');
    failures++;
  } else {
    console.log('');
    console.log('PASS: /__design does not render the catalog in a production build.');
  }

  // Control: the public landing page must still work.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const landing = await page.evaluate(() => document.body.innerText);
  const landingOk = landing.trim().length > 40;
  console.log(`landing renders  : ${landingOk}`);
  if (!landingOk) {
    console.log('FAIL: gating the catalog broke the landing page.');
    failures++;
  }

  await browser.close();
  console.log('');
  console.log(failures === 0 ? 'RESULT: PASS' : `RESULT: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})();