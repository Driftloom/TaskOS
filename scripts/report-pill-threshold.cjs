/**
 * Finds every element whose corner radius meets or exceeds half its height.
 *
 * THAT IS THE PILL THRESHOLD. When border-radius >= height/2, the two corner arcs
 * meet in the middle and the element renders as a stadium (pill) rather than a
 * rounded rectangle. It is not a bug -- plenty of design systems do this on purpose
 * -- but it is a visible shift, and it is worth knowing exactly which surfaces it
 * hit rather than discovering it by eye.
 *
 * Reads the real browser, so the numbers are what actually resolved, not what the
 * CSS says should happen.
 *
 * Usage: node scripts/report-pill-threshold.cjs
 */
const path = require('path');
const { chromium } = require(require.resolve('@playwright/test', {
  paths: [path.join(process.cwd(), 'artifacts', 'cadence')],
}));

const BASE = 'http://127.0.0.1:4173';
const ROUTES = ['/', '/download'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const all = [];

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    const rows = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        const radius = parseFloat(cs.borderTopLeftRadius);
        const h = el.getBoundingClientRect().height;
        const w = el.getBoundingClientRect().width;
        if (!Number.isFinite(radius) || radius < 8) continue;
        if (h < 16 || w < 16) continue;
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        // A true pill: radius >= half the height on BOTH corners.
        const pill = radius >= h / 2 - 0.5;
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && String(el.className).slice(0, 70)) || '',
          radius: Math.round(radius),
          height: Math.round(h),
          half: Math.round(h / 2),
          pill,
          text: (el.textContent || '').trim().slice(0, 24),
        });
      }
      return out;
    });
    for (const r of rows) all.push({ ...r, route });
  }

  await browser.close();

  const pills = all.filter((r) => r.pill);
  const near = all.filter((r) => !r.pill && r.radius >= r.half * 0.6);

  console.log(`elements with radius >= 8px : ${all.length}`);
  console.log(`FULL PILLS (radius >= height/2): ${pills.length}`);
  console.log('');
  console.log('route     radius  height  half  element            label');
  console.log('-'.repeat(78));
  for (const p of pills) {
    console.log(
      `${p.route.padEnd(9)}${String(p.radius).padStart(4)}${String(p.height).padStart(7)}${String(p.half).padStart(6)}  ${(p.tag + ' ' + p.cls.split(' ')[0]).padEnd(18).slice(0, 18)} ${p.text}`,
    );
  }
  console.log('');
  console.log(`near-pill (radius >= 60% of half-height): ${near.length}`);
  for (const p of near.slice(0, 12)) {
    console.log(
      `${p.route.padEnd(9)}${String(p.radius).padStart(4)}${String(p.height).padStart(7)}${String(p.half).padStart(6)}  ${(p.tag + ' ' + p.cls.split(' ')[0]).padEnd(18).slice(0, 18)} ${p.text}`,
    );
  }
})();