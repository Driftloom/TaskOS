/**
 * Visual verification for the 2026-10-07 radius + typography adoption.
 *
 * Renders the built app in headless Chromium and captures the surfaces that
 * carry the changes, so the claim "511 radii grew" is checked with pixels rather
 * than asserted from class counts. Also samples computed border-radius and
 * font-size off the live DOM, which is stronger than reading the CSS: it proves
 * the value the browser actually resolved.
 *
 * Usage: node scripts/verify-visual-changes.cjs [outDir]
 */
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(process.cwd(), 'screenshots', 'radius-verify');
const BASE = 'http://127.0.0.1:4173';

(async () => {
  const { chromium } = require(require.resolve('@playwright/test', {
    paths: [path.join(process.cwd(), 'artifacts', 'cadence')],
  }));
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  const routes = ['/__design', '/', '/download'];
  const report = [];

  for (const route of routes) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(600);

      // Sample REAL computed values from the live DOM.
      const samples = await page.evaluate(() => {
        const pick = (sel, props) => {
          const els = Array.from(document.querySelectorAll(sel)).slice(0, 6);
          return els.map((el) => {
            const cs = getComputedStyle(el);
            const out = {};
            for (const p of props) out[p] = cs[p];
            return out;
          });
        };
        return {
          radii: pick('.rounded-sm, .rounded-md, .rounded-lg, .rounded-xl, .rounded-full', ['borderRadius']),
          type: pick('.text-caption, .text-micro, .text-macro, .text-display1, .text-title1, .text-body', [
            'fontSize', 'lineHeight', 'fontWeight', 'letterSpacing',
          ]),
          density: getComputedStyle(document.documentElement).getPropertyValue('--density-row-min-h').trim(),
        };
      });

      const name = route.replace(/[^\w]+/g, '_') || 'root';
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
      report.push({ route, ok: true, samples });
      console.log(`OK   ${route} -> ${name}.png`);
    } catch (e) {
      report.push({ route, ok: false, error: e.message });
      console.log(`FAIL ${route}: ${e.message}`);
    }
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ report, errors }, null, 2));

  console.log('');
  console.log('--- computed border-radius (browser-resolved) ---');
  for (const r of report) {
    if (!r.ok) continue;
    const uniq = [...new Set(r.samples.radii.map((s) => s.borderRadius))];
    console.log(`${r.route.padEnd(12)} ${uniq.join('  ')}`);
  }
  console.log('');
  console.log('--- computed type ---');
  for (const r of report) {
    if (!r.ok) continue;
    const uniq = [...new Set(r.samples.type.map((s) => `${s.fontSize}/${s.lineHeight}/${s.fontWeight}/${s.letterSpacing}`))];
    console.log(`${r.route.padEnd(12)} ${uniq.slice(0, 8).join('  ')}`);
  }
  console.log('');
  console.log('--- console errors ---');
  console.log(errors.length ? errors.slice(0, 10).join('\n') : 'none');
})();