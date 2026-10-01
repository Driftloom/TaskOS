#!/usr/bin/env node
/**
 * verify-core-web-vitals.cjs -- LAB Core Web Vitals measurement for the Cadence web app.
 *
 * ============================== READ THIS FIRST ==============================
 * THIS IS A LAB MEASUREMENT ON ONE LOCAL MACHINE. IT IS NOT A CORE WEB VITALS
 * RESULT, and it must never be quoted as one.
 *
 * A real Core Web Vitals assessment is a FIELD (RUM) measurement: it is
 * aggregated from real users, on real devices, on real networks, and it is
 * reported at the 75th PERCENTILE of that population. The thresholds below
 * (LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1) are percentile thresholds -- they
 * are defined against the 75th percentile of real-user page loads, not against
 * a single synthetic page load.
 *
 * What this script produces is a SIMULATED lab number from Lighthouse: one
 * synthetic navigation, on one machine, on one Chromium build, with network
 * and CPU slowdown applied by Lantern. Lantern is a SIMULATION MODEL. It is
 * not a radio and not a phone. Lab numbers are useful for REGRESSION
 * DETECTION -- repeatable, so a change between two runs of the same build is
 * real signal. They are NOT valid for reporting, marketing, competitor
 * comparison, or for claiming the app "passes Core Web Vitals". Only real-user
 * field data can support that claim, and field and lab routinely disagree in
 * both directions by a wide margin.
 * =============================================================================
 *
 * WHAT THIS MEASURES THAT verify-web-vitals-budget.cjs DOES NOT
 * -------------------------------------------------------------
 * The sibling gate measures BUNDLE SIZE: bytes emitted by the build. That is a
 * proxy for one input to load time. It cannot produce LCP, INP or CLS, and it
 * does not pretend to. This script runs an actual browser against the actual
 * production build and reports actual timings.
 *
 * WHY A GATE AT ALL
 * -----------------
 * `docs/13-master-design-system-prompt.md` P26 states LCP / INP / CLS budgets
 * explicitly marked PROPOSED AND UNVERIFIED. A number that lives only in prose
 * does not stop a regression. This turns the published Core Web Vitals "good"
 * thresholds into an exit code against a real measurement.
 *
 * WHAT IT STILL CANNOT DO, AND SAYS SO OUT LOUD
 * ---------------------------------------------
 *  1. INP IS NOT MEASURABLE HERE. Lighthouse's `interaction-to-next-paint`
 *     audit declares `supportedModes: ['timespan']` and returns
 *     `notApplicable` whenever `throttlingMethod` is `simulate`, which is what
 *     navigation mode uses (see
 *     lighthouse/core/audits/metrics/interaction-to-next-paint.js:32,60-62).
 *     It is also excluded from the navigation config entirely. INP needs real
 *     user interactions to exist; a synthetic page load has none. This script
 *     prints NOT MEASURED for INP with the reason. It never prints 0 and
 *     never counts INP as a pass.
 *
 *  2. AUTH-GATED ROUTES ARE REPORTED AS NOT MEASURED. `/today` and `/settings`
 *     sit behind Clerk (artifacts/cadence/src/App.tsx:190-191). The only local
 *     auth bypass is gated on `import.meta.env.DEV`, which is FALSE in every
 *     production build, so an unauthenticated load of those URLs renders the
 *     landing page instead. Every route is cross-checked against what the app
 *     actually rendered; a route that did not render is reported as a coverage
 *     gap, with its numbers clearly labelled as belonging to the redirect
 *     target. Attributing landing-page timings to `/today` would be
 *     fabrication, so this script refuses to do it.
 *
 * DESIGN CONSTRAINTS (learned the hard way in this repo -- see AGENTS.md and
 * scripts/verify-web-vitals-budget.cjs, which shares them):
 *
 *  1. ASCII-ONLY OUTPUT. This machine's console is codepage 437 and renders
 *     UTF-8 as garbage; a previous session lost hours to that. Every byte this
 *     file PRINTS is asserted < 0x80 before it is written. Lighthouse's own
 *     output is full of Unicode (box drawing, arrows, checkmarks), so anything
 *     echoed from it is transliterated first.
 *
 *  2. NO SHELL SYNTAX. No `&&`, no `;`, no `PORT=5173 && vite build`. Env is
 *     injected through the child `env` object, which behaves identically on
 *     cmd.exe, PowerShell and sh. Vite THROWS at config load without PORT and
 *     BASE_PATH (artifacts/cadence/vite.config.ts:10-14 and :24-28).
 *
 *  3. IT BUILDS, IT SERVES THE BUILD, IT MEASURES THE BUILD. A dev-server
 *     measurement would be meaningless (unbundled modules, HMR client, no
 *     minification), and measuring a stale `dist/` measures the last build
 *     rather than the current source -- the same class of bug as a test
 *     asserting against a stale snapshot. So it runs the real production build,
 *     serves `dist/public` from an in-process static server with SPA fallback,
 *     and measures that. `--no-build` exists and announces itself.
 *
 *  4. IT CROSS-CHECKS MEASUREMENTS AGAINST REALITY. Every route is verified to
 *     have actually rendered before its numbers are allowed to count, and every
 *     metric key is verified to exist before it is read. A route that bounced,
 *     or a metric that could not be parsed, is never allowed to become a pass.
 *
 *  5. FAIL LOUD, EXIT NON-ZERO. No Lighthouse, no Chromium, an unparseable
 *     metric, a route that would not render, or a route with zero successful
 *     runs -- all are failures. There is no code path that prints a number
 *     this script did not measure, and none that reports success it did not
 *     earn.
 *
 *  6. REPEATED RUNS. Lighthouse is noisy; a single run is not evidence. Each
 *     route is measured N times (default 3) and reported as MEDIAN plus
 *     min-max spread. The spread is printed as prominently as the median,
 *     because on a shared machine it can be enormous and a reader needs to see
 *     that.
 *
 * USAGE
 *   node scripts/verify-core-web-vitals.cjs
 *   node scripts/verify-core-web-vitals.cjs --no-build        # reuse existing dist/
 *   node scripts/verify-core-web-vitals.cjs --runs=5
 *   node scripts/verify-core-web-vitals.cjs --desktop         # desktop form factor
 *   node scripts/verify-core-web-vitals.cjs --routes=/,/focus
 *   node scripts/verify-core-web-vitals.cjs --no-compress     # serve uncompressed
 *   node scripts/verify-core-web-vitals.cjs --fail-on-blocked # coverage gap is a failure
 *   node scripts/verify-core-web-vitals.cjs --verbose
 *
 * RESOLVING LIGHTHOUSE
 *   Lighthouse is NOT a dependency of this repo, and adding one is a manifest
 *   change only the owner can make. Resolution order:
 *     1. --lighthouse=<path>          path to the package dir, or to core/index.js
 *     2. CADENCE_LIGHTHOUSE_PATH     same, as an env var
 *     3. node_modules/lighthouse      if the owner has added it as a devDependency
 *   If none resolve, this FAILS with the exact command needed. It does not fall
 *   back to estimates, and it does not skip.
 *
 *   Lighthouse 12 and earlier launched Chrome themselves. Lighthouse 13 does
 *   NOT -- its programmatic API takes an already-attached puppeteer page and
 *   otherwise tries to connect to a browser on 127.0.0.1:9222 that will not be
 *   there. So this script launches Chromium through `puppeteer-core`, resolved
 *   as Lighthouse's own transitive dependency, and hands Lighthouse a page. That
 *   is why there is no chrome-launcher call here.
 *
 * NOT WIRED INTO run-gates.cjs. See the report: this needs a Chromium download
 * and a full production build, and on the current build it cannot measure 2 of
 * its 4 default routes. Wiring that into the ladder is the owner's call.
 */

'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const WEB_PKG_DIR = path.join(ROOT, 'artifacts', 'cadence');
const DIST_DIR = path.join(WEB_PKG_DIR, 'dist', 'public');

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */
const argv = process.argv.slice(2);
const VERBOSE = argv.indexOf('--verbose') !== -1;
const SKIP_BUILD = argv.indexOf('--no-build') !== -1;
const NO_COMPRESS = argv.indexOf('--no-compress') !== -1;
const DESKTOP = argv.indexOf('--desktop') !== -1;
const FAIL_ON_BLOCKED = argv.indexOf('--fail-on-blocked') !== -1;

function flagValue(name) {
  const prefix = '--' + name + '=';
  for (const a of argv) if (a.startsWith(prefix)) return a.slice(prefix.length);
  return null;
}

const RUNS = Math.max(1, Number(flagValue('runs') || 3) || 3);
const LH_FLAG = flagValue('lighthouse') || process.env.CADENCE_LIGHTHOUSE_PATH || null;
const ROUTES = (flagValue('routes') || '/,/sign-in,/today,/settings')
  .split(',')
  .map(function (s) { return s.trim(); })
  .filter(Boolean);

/* ------------------------------------------------------------------ *
 * THRESHOLDS -- the published Core Web Vitals "good" thresholds.
 *
 * NOT invented here, and NOT taken from P26. These are the values Google
 * publishes at web.dev/articles/vitals and reports in the Chrome UX Report:
 *
 *     Largest Contentful Paint     good <= 2.5 s    poor >  4.0 s
 *     Interaction to Next Paint    good <= 200 ms   poor >  500 ms
 *     Cumulative Layout Shift      good <= 0.10     poor >  0.25
 *
 * PERCENTILE BASIS -- this is the part that matters, and the part a lab run
 * cannot reproduce. Each threshold is defined against the 75th PERCENTILE of
 * real-user page loads: "good" means at least 75% of real visits to this URL
 * were at or under this value, across real phones, real networks and real
 * sessions. A single simulated navigation on a developer laptop is one
 * synthetic sample of one. It is the right tool for catching a regression
 * between two builds and the wrong tool for asserting a percentile.
 *
 * MEDIAN is the run statistic rather than a percentile because a 3-run sample
 * has no meaningful percentile: the 75th percentile of 3 samples is the max,
 * which would only reward noise.
 * ------------------------------------------------------------------ */
const THRESHOLDS = {
  lcp: { ms: 2500, short: 'LCP', name: 'Largest Contentful Paint' },
  cls: { ms: 0.1, short: 'CLS', name: 'Cumulative Layout Shift' },
  inp: { ms: 200, short: 'INP', name: 'Interaction to Next Paint' },
};

/* ------------------------------------------------------------------ *
 * Output helpers -- ASCII ONLY, by contract. See constraint (1).
 * ------------------------------------------------------------------ */
const LINE = '='.repeat(74);
const THIN = '-'.repeat(74);

function assertAscii(s, where) {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) {
      throw new Error(
        'Non-ASCII byte at offset ' + i + ' of ' + where + ' (charCode ' + s.charCodeAt(i) + '). ' +
          'This console is codepage 437 and will render it as garbage.'
      );
    }
  }
}

function out(msg) {
  assertAscii(msg, 'stdout');
  process.stdout.write(msg + '\n');
}

function fail(msg) {
  assertAscii(msg, 'stderr');
  process.stderr.write(msg + '\n');
}

/** Transliterates anything non-ASCII to '?' so third-party output is safe to print. */
function ascii(s) {
  let r = '';
  for (let i = 0; i < s.length; i++) r += s.charCodeAt(i) > 0x7f ? '?' : s[i];
  return r;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function padCut(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n - 3) + '...' : s + ' '.repeat(n - s.length);
}

/* ------------------------------------------------------------------ *
 * pnpm resolution -- same three-step fallback as run-gates.cjs and
 * scripts/verify-web-vitals-budget.cjs. Windows cannot spawn a bare .cmd
 * without a shell, so pnpm's JS entrypoint is invoked with the current node
 * binary. Fixed arg arrays throughout; no shell interpolation of any value
 * taken from build output.
 * ------------------------------------------------------------------ */
function resolvePnpm() {
  const execPath = process.env.npm_execpath;
  if (execPath && /\.(c|m)?js$/i.test(execPath) && fs.existsSync(execPath)) {
    return { cmd: process.execPath, prefix: [execPath], via: 'npm_execpath' };
  }
  const candidates = [];
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    candidates.push(path.join(dir, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'));
    candidates.push(path.join(dir, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'));
  }
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'));
  }
  if (process.env.PNPM_HOME) {
    candidates.push(path.join(process.env.PNPM_HOME, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'));
  }
  if (process.env.HOME) {
    candidates.push(
      path.join(process.env.HOME, '.local', 'share', 'pnpm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
    );
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { cmd: process.execPath, prefix: [candidate], via: 'path-scan' };
  }
  return { cmd: 'pnpm', prefix: [], via: 'shell' };
}

/* ------------------------------------------------------------------ *
 * Static server for the BUILT output
 *
 * Why not `vite preview`: it is a dev tool's preview server, not what
 * production serves, and its headers differ. This serves the emitted files.
 *
 * Why gzip by default: Vite does not precompress, but every real static host
 * (Netlify, Render, Cloudflare) sends these assets Content-Encoding'd on the
 * wire. Measuring raw bytes down a simulated 1.6 Mbit/s pipe would report a
 * transfer time roughly 3x too slow and blame the network for the repo's build
 * settings. `--no-compress` reports that case instead.
 *
 * SPA fallback: extensionless unknown paths serve index.html, which is what a
 * real static host does here and what makes `/today` a client route.
 * ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function startServer(distDir) {
  const stats = { requests: 0, gzipHits: 0, bytesOut: 0 };
  const server = http.createServer(function (req, res) {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
    } catch (_) {
      rel = '';
    }
    let abs = path.join(distDir, rel);
    if (!rel || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      abs = path.join(distDir, 'index.html');
    }
    if (!fs.existsSync(abs)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    const raw = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'x-cadence-served-by': 'verify-core-web-vitals',
    };
    if (abs.endsWith('index.html') || abs.endsWith('offline.html')) {
      headers['cache-control'] = 'no-cache';
    } else if (rel.startsWith('assets/')) {
      headers['cache-control'] = 'public, max-age=31536000, immutable';
    } else {
      headers['cache-control'] = 'public, max-age=3600';
    }
    const accepts = String(req.headers['accept-encoding'] || '');
    stats.requests++;
    if (!NO_COMPRESS && /\bgzip\b/.test(accepts) && raw.length > 512) {
      const gz = zlib.gzipSync(raw, { level: zlib.constants.Z_DEFAULT_COMPRESSION });
      headers['content-encoding'] = 'gzip';
      headers['content-length'] = String(gz.length);
      headers.vary = 'Accept-Encoding';
      stats.gzipHits++;
      stats.bytesOut += gz.length;
      res.writeHead(200, headers);
      res.end(gz);
      return;
    }
    headers['content-length'] = String(raw.length);
    stats.bytesOut += raw.length;
    res.writeHead(200, headers);
    res.end(raw);
  });
  return new Promise(function (resolve, reject) {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, port: server.address().port, stats: stats });
    });
  });
}

/* ------------------------------------------------------------------ *
 * Lighthouse + Chromium resolution. See "RESOLVING LIGHTHOUSE" in the header.
 * ------------------------------------------------------------------ */
function lighthousePkgDir() {
  if (LH_FLAG) {
    const abs = path.resolve(LH_FLAG);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return path.dirname(path.dirname(abs));
    if (fs.existsSync(path.join(abs, 'package.json'))) return abs;
    const nested = path.join(abs, 'node_modules', 'lighthouse');
    if (fs.existsSync(path.join(nested, 'package.json'))) return nested;
    return null;
  }
  const local = path.join(ROOT, 'node_modules', 'lighthouse');
  return fs.existsSync(path.join(local, 'package.json')) ? local : null;
}

function lighthouseEntryFile() {
  const dir = lighthousePkgDir();
  if (!dir) return null;
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const entry = path.join(dir, pkg.main || 'core/index.js');
  return fs.existsSync(entry) ? entry : null;
}

function lighthouseVersion() {
  const dir = lighthousePkgDir();
  if (!dir) return 'unknown';
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  } catch (_) {
    return 'unknown';
  }
}

/**
 * Chromium. Prefers an explicit CHROME_PATH, then falls back to the Chromium
 * `pnpm run verify:e2e` already installs, so this gate needs no second browser
 * download. If neither exists it FAILS: silently skipping the measurement is
 * the one unacceptable outcome.
 */
function resolveChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return { p: fromEnv, via: 'CHROME_PATH' };
  try {
    const req = require('node:module').createRequire(path.join(WEB_PKG_DIR, 'package.json'));
    const exe = req('@playwright/test').chromium.executablePath();
    if (exe && fs.existsSync(exe)) return { p: exe, via: 'playwright chromium (@playwright/test)' };
  } catch (_) { /* fall through */ }
  return null;
}

/**
 * Lighthouse 13 does not launch a browser. Resolve puppeteer-core as Lighthouse's
 * own transitive dependency.
 *
 * realpathSync is REQUIRED here, not defensive: under pnpm, node_modules/lighthouse
 * is a SYMLINK into node_modules/.pnpm/lighthouse@<ver>/node_modules/lighthouse,
 * and the package's dependencies are siblings of that real directory rather
 * than of the symlink. createRequire() on the symlink path resolves
 * `puppeteer-core` against the symlink's parent, does not find it, and throws
 * ERR_MODULE_NOT_FOUND. Resolving from the realpath finds it every time.
 */
function resolvePuppeteerCore(entry) {
  try {
    const real = fs.realpathSync(entry);
    const req = require('node:module').createRequire(real);
    return req.resolve('puppeteer-core');
  } catch (e) {
    return { error: ascii(e && e.message ? e.message : String(e)) };
  }
}

/* ------------------------------------------------------------------ *
 * Route identity probe
 *
 * The most important cross-check in this file. A route's Lighthouse numbers are
 * only that route's numbers if the route actually rendered.
 *
 * Checking the pathname alone is NOT sufficient, and that was a real bug in an
 * earlier draft of this file: `/settings` stays on `/settings` while Clerk is
 * still loading, because App.tsx:190 returns <LoadingScreen /> until Clerk
 * resolves, so a pathname check called that "RENDERED".
 *
 * Checking that the loading marker is ABSENT is ALSO not sufficient, and that
 * was the next bug: an empty <body> trivially contains no marker, so the wait
 * loop exited on its first iteration and then reported "rendered no text at
 * all" for the two routes that actually render best. Readiness has to be
 * positive evidence, in this order:
 *
 *   1. React has mounted something  (body text is non-empty)
 *   2. the Clerk loading screen is gone  (marker no longer present)
 *
 * Only then is the pathname meaningful. Lighthouse's own finalDisplayedUrl
 * cannot be used at all here: the redirect is a client-side
 * history.replaceState, which is not a navigation, so Lighthouse records the URL
 * that was requested and never observes the redirect happen.
 * ------------------------------------------------------------------ */
const LOADING_MARKER = 'Loading your cadence';

function playwrightReq() {
  return require('node:module').createRequire(path.join(WEB_PKG_DIR, 'package.json'));
}

function identityProbeAvailable() {
  try {
    playwrightReq().resolve('@playwright/test');
    return { available: true };
  } catch (_) {
    return { available: false, reason: 'playwright (@playwright/test) not resolvable' };
  }
}

async function probeRouteIdentity(port, route) {
  const browser = await playwrightReq()('@playwright/test').chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    await page.goto('http://127.0.0.1:' + port + route, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // textContent, NOT innerText. This is the third bug this function had.
    // The loading screen's caption carries `uppercase`, and innerText returns
    // text AFTER text-transform, so the page said "LOADING YOUR CADENCE" and a
    // case-sensitive search for "Loading your cadence" never matched. The
    // marker check therefore reported "cleared" while the app was still on the
    // loading screen, which is how /today got called RENDERED. textContent is
    // the DOM text as authored and is immune to text-transform.
    let mounted = false;
    for (let i = 0; i < 30 && !mounted; i++) {
      mounted = await page.evaluate(function () {
        return (document.body.textContent || '').trim().length > 0;
      });
      if (!mounted) await page.waitForTimeout(500);
    }

    let loadingCleared = !mounted;
    for (let i = 0; i < 30 && mounted && !loadingCleared; i++) {
      loadingCleared = await page.evaluate(function (m) {
        return (document.body.textContent || '').indexOf(m) === -1;
      }, LOADING_MARKER);
      if (!loadingCleared) await page.waitForTimeout(500);
    }

    const state = await page.evaluate(function () {
      const h = document.querySelector('h1, h2');
      const text = (document.body.textContent || '').trim();
      return {
        pathname: window.location.pathname,
        heading: h ? String(h.textContent).trim().slice(0, 60) : '(no h1/h2)',
        textLen: text.length,
      };
    });
    const reasons = [];
    if (!samePath(state.pathname, route)) reasons.push('redirected to ' + state.pathname);
    if (!mounted) reasons.push('React never mounted any content in 15s');
    else if (!loadingCleared) reasons.push('stuck on the Clerk loading screen after mount');
    if (state.textLen === 0) reasons.push('rendered no text at all');
    return {
      available: true,
      ok: reasons.length === 0,
      settledPath: state.pathname,
      heading: state.heading,
      why: reasons.join('; '),
    };
  } finally {
    await browser.close();
  }
}

function samePath(a, b) {
  const norm = function (p) {
    let v = String(p || '/').split('?')[0].split('#')[0];
    if (!v.startsWith('/')) v = '/' + v;
    if (v.length > 1 && v.endsWith('/')) v = v.slice(0, -1);
    return v === '' ? '/' : v;
  };
  return norm(a) === norm(b);
}

/* ------------------------------------------------------------------ *
 * Metric extraction
 *
 * Every value is read out of the Lighthouse result. Nothing is hardcoded. A
 * missing key is a FAILURE, not a default: a default would be a fabricated
 * number, which is the exact failure mode this exercise exists to close.
 * ------------------------------------------------------------------ */
function pickMetrics(result, where) {
  const lhr = result && result.lhr ? result.lhr : result;
  const audit = lhr && lhr.audits && lhr.audits.metrics;
  if (!audit || !audit.details || !Array.isArray(audit.details.items) || !audit.details.items[0]) {
    throw new Error('no metrics audit payload in the Lighthouse result for ' + where);
  }
  const m = audit.details.items[0];

  const need = ['largestContentfulPaint', 'firstContentfulPaint', 'cumulativeLayoutShift', 'speedIndex', 'totalBlockingTime'];
  const missing = need.filter(function (k) { return typeof m[k] !== 'number'; });
  if (missing.length) {
    throw new Error(
      'Lighthouse metrics payload for ' + where + ' is missing ' + missing.join(', ') + '. Available: ' +
        Object.keys(m).sort().join(', ')
    );
  }

  // TTFB is in the metrics payload AND as its own audit. Read the audit first
  // (it is the same number Lighthouse shows as "Server response time"), fall
  // back to the payload.
  const ttfbAudit = lhr.audits['server-response-time'];
  const ttfb = ttfbAudit && typeof ttfbAudit.numericValue === 'number'
    ? ttfbAudit.numericValue
    : (typeof m.timeToFirstByte === 'number' ? m.timeToFirstByte : null);
  if (ttfb === null) throw new Error('no TTFB (server-response-time or timeToFirstByte) for ' + where);

  // INP: structurally absent from a navigation-mode run. Read the flag rather
  // than assume it, so a future Lighthouse that does emit it gets used.
  const inpAudit = lhr.audits['interaction-to-next-paint'];
  const inp = { measured: false, value: null, reason: '' };
  if (inpAudit && inpAudit.notApplicable !== true && typeof inpAudit.numericValue === 'number') {
    inp.measured = true;
    inp.value = inpAudit.numericValue;
  } else if (inpAudit && inpAudit.notApplicable) {
    inp.reason = 'audit returned notApplicable (timespan-mode only, and not under simulated throttling)';
  } else {
    inp.reason = 'audit absent from a navigation-mode Lighthouse run (timespan-only metric)';
  }

  const bytesAudit = lhr.audits['total-byte-weight'];
  const bootAudit = lhr.audits['bootup-time'];

  // Per-origin transfer breakdown: the evidence for WHERE the bytes go, which
  // is the difference between "the bundle is big" and "something specific is".
  const byOrigin = {};
  const reqs = lhr.audits['network-requests'];
  const items = reqs && reqs.details && Array.isArray(reqs.details.items) ? reqs.details.items : [];
  let totalTransfer = 0;
  for (const it of items) {
    let host = '(unparsed)';
    const url = String(it.url || '');
    try {
      host = new URL(url).host;
    } catch (_) { /* keep placeholder */ }
    if (!host) host = /^(data|blob|about):/i.test(url) ? '(inline, no origin)' : '(no origin)';
    const b = typeof it.transferSize === 'number' && it.transferSize > 0 ? it.transferSize : 0;
    if (!byOrigin[host]) byOrigin[host] = { n: 0, bytes: 0 };
    byOrigin[host].n++;
    byOrigin[host].bytes += b;
    totalTransfer += b;
  }

  return {
    lcp: m.largestContentfulPaint,
    fcp: m.firstContentfulPaint,
    cls: m.cumulativeLayoutShift,
    si: m.speedIndex,
    tbt: m.totalBlockingTime,
    ttfb: ttfb,
    lcpDelay: typeof m.lcpLoadDelay === 'number' ? m.lcpLoadDelay : null,
    lcpLoad: typeof m.lcpLoadDuration === 'number' ? m.lcpLoadDuration : null,
    lcpRender: typeof m.lcpRenderDelay === 'number' ? m.lcpRenderDelay : null,
    inp: inp,
    bytes: bytesAudit && typeof bytesAudit.numericValue === 'number' ? bytesAudit.numericValue : null,
    mainThreadMs: bootAudit && typeof bootAudit.numericValue === 'number' ? bootAudit.numericValue : null,
    requestCount: items.length,
    byOrigin: byOrigin,
    totalTransfer: totalTransfer,
    perfScore: lhr.categories && lhr.categories.performance && typeof lhr.categories.performance.score === 'number'
      ? Math.round(lhr.categories.performance.score * 100)
      : null,
  };
}

function median(values) {
  const s = values.slice().sort(function (a, b) { return a - b; });
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function summarize(values) {
  return { median: median(values), min: Math.min.apply(null, values), max: Math.max.apply(null, values), all: values };
}

function fmtMs(v) {
  return v === null || v === undefined ? 'n/a' : Math.round(v) + ' ms';
}

function fmtMsSpread(s) {
  return Math.round(s.median) + ' [' + Math.round(s.min) + '-' + Math.round(s.max) + '] ms';
}

function fmtClsSpread(s) {
  return s.median.toFixed(3) + ' [' + s.min.toFixed(3) + '-' + s.max.toFixed(3) + ']';
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */
function runBuild() {
  if (SKIP_BUILD) {
    out('  (--no-build: reusing existing dist/, which may be stale)');
    return { ok: true, skipped: true };
  }
  const pnpm = resolvePnpm();
  out('  $ pnpm --filter @workspace/cadence run build');
  out('  env: PORT=5173 BASE_PATH=/  (vite.config.ts throws without both)');
  out('  pnpm resolved via: ' + pnpm.via);

  const env = Object.assign({}, process.env);
  if (!env.PORT) env.PORT = '5173';
  if (!env.BASE_PATH) env.BASE_PATH = '/';
  // An inherited NODE_ENV would change which React build gets bundled and
  // would silently invalidate the measurement. Vite defaults to production for
  // `build`; pin it so nothing inherited can interfere.
  env.NODE_ENV = 'production';

  const result = spawnSync(
    pnpm.cmd,
    pnpm.prefix.concat(['--filter', '@workspace/cadence', 'run', 'build']),
    { cwd: ROOT, env: env, encoding: 'utf8', shell: pnpm.via === 'shell' }
  );
  if (result.error) throw new Error('build spawn error: ' + result.error.message);
  if (result.signal) throw new Error('build killed by signal ' + result.signal);
  const code = typeof result.status === 'number' ? result.status : 1;
  if (code !== 0) {
    fail('  FAIL  the production build itself failed (exit ' + code + ').');
    fail(ascii(((result.stdout || '') + (result.stderr || '')).split(/\r?\n/).slice(-25).join('\n')));
    fail('        Core Web Vitals cannot be assessed on a build that did not finish.');
    return { ok: false, skipped: false };
  }
  return { ok: true, skipped: false };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
async function main() {
  out('');
  out(LINE);
  out('Cadence Core Web Vitals gate');
  out(LINE);
  out('');
  out('  *** THIS IS A LAB MEASUREMENT ON THIS LOCAL MACHINE. ***');
  out('  *** IT IS NOT A FIELD/RUM CORE WEB VITALS RESULT.       ***');
  out('');
  out('  The thresholds below are the published Core Web Vitals "good"');
  out('  values (web.dev/articles/vitals): LCP <= 2.5 s, INP <= 200 ms,');
  out('  CLS <= 0.1. Each is defined at the 75th PERCENTILE of REAL USER page');
  out('  loads on real devices and networks. A lab run cannot produce a');
  out('  percentile: this is one simulated navigation per run, on one machine,');
  out('  with network and CPU slowdown SIMULATED (Lantern), not real.');
  out('');
  out('  Useful for regression detection between two builds. NOT valid for');
  out('  reporting, marketing, competitor comparison, or any claim that the');
  out('  app "passes Core Web Vitals" -- only real-user field data can say');
  out('  that, and field and lab routinely disagree in both directions.');
  out('');
  out(LINE);
  out('node:        ' + process.version + '   platform: ' + process.platform + ' (' + process.arch + ')');
  out('dist:        ' + DIST_DIR);
  out('form factor: ' + (DESKTOP ? 'DESKTOP' : 'MOBILE (emulated; this is a mobile-first PWA)'));
  out('runs/route:  ' + RUNS + '   (reported as MEDIAN plus min-max spread)');
  out('compression: ' + (NO_COMPRESS ? 'NONE (uncompressed bytes on the wire)' : 'gzip, zlib default level 6'));
  out('routes:      ' + ROUTES.join('  '));
  out('');

  // --- prerequisites -----------------------------------------------------
  const entry = lighthouseEntryFile();
  if (!entry) {
    out('--- prerequisites ---');
    fail('  FAIL  Lighthouse could not be resolved.');
    fail('');
    fail('  Tried, in order:');
    if (LH_FLAG) fail('    1. --lighthouse / CADENCE_LIGHTHOUSE_PATH = ' + ascii(LH_FLAG) + '  (no lighthouse package.json there)');
    fail('    2. ' + path.join(ROOT, 'node_modules', 'lighthouse') + '  (not installed)');
    fail('');
    fail('  Lighthouse is not a dependency of this repo, and adding one is a');
    fail('  manifest change, which this script will not make. To fix, either');
    fail('  add it as a root devDependency (exact line in the report), or');
    fail('  install it out of tree and point this gate at it:');
    fail('');
    fail('    pnpm add -Dw lighthouse');
    fail('    # or, without touching the repo manifest at all:');
    fail('    pnpm add lighthouse --dir <somewhere-outside-the-repo>');
    fail('    node scripts/verify-core-web-vitals.cjs --lighthouse=<that dir>');
    fail('');
    fail('  NOT falling back to estimates. Refusing to print a number that was');
    fail('  not measured is the entire reason this script exists.');
    fail('');
    return 2;
  }

  const chrome = resolveChrome();
  if (!chrome) {
    fail('  FAIL  No Chromium/Chrome found.');
    fail('        Set CHROME_PATH, or install the one verify:e2e already uses:');
    fail('          pnpm run verify:e2e:install');
    fail('');
    return 2;
  }

  const pp = resolvePuppeteerCore(entry);
  if (!pp || pp.error) {
    fail('  FAIL  could not resolve puppeteer-core, which Lighthouse 13 needs.');
    fail('        Lighthouse 13 does not launch a browser; the caller must supply');
    fail('        a page. This script reuses Lighthouse\'s own dependency.');
    fail('        ' + (pp && pp.error ? pp.error : 'resolve returned nothing'));
    fail('');
    return 2;
  }

  const version = lighthouseVersion();
  out('--- prerequisites ---');
  out('  lighthouse:    ' + version);
  out('  chromium:      ' + chrome.via);
  out('  chromium path: ' + ascii(chrome.p));
  out('  lighthouse at: ' + ascii(entry));
  out('  puppeteer:     ' + ascii(pp));

  // --- build ------------------------------------------------------------
  out('');
  out('--- build ---');
  const build = runBuild();
  if (!build.ok) return 1;
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    fail('  FAIL  dist/public/index.html does not exist after the build.');
    fail('        Refusing to serve nothing and call it a measurement.');
    return 1;
  }
  if (!build.skipped) out('  build: exit 0');

  // --- serve the built output -------------------------------------------
  const srv = await startServer(DIST_DIR);
  out('');
  out('--- serving the built output (NOT the dev server) ---');
  out('  origin: http://127.0.0.1:' + srv.port);
  out('  serving: ' + DIST_DIR);
  out('  SPA fallback: yes    hashed /assets immutable: yes');
  try {
    const smoke = await new Promise(function (resolve, reject) {
      http.get('http://127.0.0.1:' + srv.port + '/', function (res) {
        let n = 0;
        res.on('data', function (c) { n += c.length; });
        res.on('end', function () { resolve({ status: res.statusCode, bytes: n }); });
      }).on('error', reject);
    });
    if (smoke.status !== 200 || smoke.bytes < 100) {
      fail('  FAIL  smoke check on / returned HTTP ' + smoke.status + ', ' + smoke.bytes + ' bytes.');
      srv.server.close();
      return 1;
    }
    out('  smoke check /: HTTP ' + smoke.status + ', ' + smoke.bytes + ' bytes');
  } catch (e) {
    fail('  FAIL  smoke check on / threw: ' + ascii(e.message));
    srv.server.close();
    return 1;
  }

  // --- load lighthouse + launch chromium ---------------------------------
  let lighthouse, puppeteer, desktopConfig;
  try {
    const mod = await import(pathToFileURL(entry).href);
    lighthouse = mod.default || mod;
    desktopConfig = mod.desktopConfig || null;
    const ppMod = await import(pathToFileURL(pp).href);
    puppeteer = ppMod.default || ppMod;
  } catch (e) {
    fail('  FAIL  could not load Lighthouse or puppeteer-core.');
    fail('        ' + ascii(e && e.message ? e.message : String(e)));
    srv.server.close();
    return 2;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chrome.p,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
    out('  chromium: launched');
  } catch (e) {
    fail('  FAIL  could not launch Chromium: ' + ascii(e && e.message ? e.message : String(e)));
    srv.server.close();
    return 2;
  }

  // --- probe route identity ----------------------------------------------
  out('');
  out('--- route identity: did the requested route actually render? ---');
  const identities = {};
  const probe = identityProbeAvailable();
  if (probe.available) {
    for (const route of ROUTES) {
      let r;
      try {
        r = await probeRouteIdentity(srv.port, route);
      } catch (e) {
        r = { ok: false, settledPath: '(probe threw)', heading: '', why: ascii(e && e.message ? e.message : String(e)) };
      }
      identities[route] = r;
      out('  ' + padCut(route, 12) + pad(r.ok ? 'RENDERED' : 'NOT RENDERED', 14) +
        'settled=' + pad(r.settledPath, 14) + (r.ok ? '' : '  reason: ' + r.why));
      if (r.ok) out('  ' + pad('', 12) + 'heading: "' + r.heading + '"');
    }
    const good = ROUTES.filter(function (r) { return identities[r].ok; }).length;
    out('  verdict: ' + good + ' of ' + ROUTES.length + ' route(s) actually render for an unauthenticated visitor');
  } else {
    out('  UNVERIFIED (' + probe.reason + ')');
    out('  Route identity could not be confirmed, so NO route number below may be');
    out('  attributed to a specific route. Every route is treated as NOT MEASURED.');
    for (const route of ROUTES) {
      identities[route] = { ok: false, settledPath: '(unverified)', heading: '', why: probe.reason };
    }
  }

  // --- measure -----------------------------------------------------------
  const results = {};
  let configRead = null;

  for (const route of ROUTES) {
    out('');
    out('--- measuring ' + route + '  (' + RUNS + ' run' + (RUNS === 1 ? '' : 's') + ') ---');
    const runs = [];
    for (let i = 1; i <= RUNS; i++) {
      let page = null;
      let res = null;
      try {
        page = await browser.newPage();
        res = await lighthouse(
          'http://127.0.0.1:' + srv.port + route,
          { output: ['json'], logLevel: 'error', maxWaitForLoad: 60000 },
          DESKTOP && desktopConfig ? desktopConfig : undefined,
          page
        );
      } catch (e) {
        fail('  run ' + i + ' of ' + route + ' FAILED: ' + ascii(e && e.message ? e.message : String(e)));
        continue;
      } finally {
        if (page) { try { await page.close(); } catch (_) { /* already gone */ } }
      }
      let m;
      try {
        m = pickMetrics(res, route + ' run ' + i);
      } catch (e) {
        fail('  run ' + i + ' of ' + route + ': ' + e.message);
        continue;
      }
      runs.push(m);
      const lhr = res && res.lhr ? res.lhr : res;
      if (!configRead && lhr && lhr.configSettings) configRead = lhr.configSettings;
      out(
        '  run ' + i + ': LCP ' + fmtMs(m.lcp) +
        '  FCP ' + fmtMs(m.fcp) +
        '  CLS ' + m.cls.toFixed(3) +
        '  SI ' + fmtMs(m.si) +
        '  TBT ' + fmtMs(m.tbt) +
        '  TTFB ' + fmtMs(m.ttfb) +
        (m.bytes !== null ? '  xfer ' + (m.bytes / 1000).toFixed(0) + ' kB' : '') +
        (m.perfScore !== null ? '  perf ' + m.perfScore : '')
      );
      if (VERBOSE && m.byOrigin) {
        const keys = Object.keys(m.byOrigin).sort();
        for (const k of keys) out('           ' + padCut(k, 40) + m.byOrigin[k].n + ' req  ' + (m.byOrigin[k].bytes / 1000).toFixed(1) + ' kB');
      }
    }
    results[route] = runs;
  }

  await browser.close();
  srv.server.close();

  out('');
  out('  static server saw ' + srv.stats.requests + ' request(s), ' + (srv.stats.bytesOut / 1000).toFixed(1) +
    ' kB on the wire, ' + srv.stats.gzipHits + ' gzip response(s)');

  // --- conditions actually used -----------------------------------------
  out('');
  out('--- conditions actually used (read back from the Lighthouse result) ---');
  if (configRead) {
    const t = configRead.throttling || {};
    const g = function (v) { return v === undefined ? '?' : String(v); };
    out('  lighthouse version      : ' + version);
    out('  form factor            : ' + (configRead.formFactor || '?'));
    out('  screen emulation       : ' + JSON.stringify(configRead.screenEmulation || {}));
    out('  user agent             : ' + ascii(String(configRead.emulatedUserAgent || '(none)')).slice(0, 60));
    out('  throttling method      : ' + (configRead.throttlingMethod || '?'));
    out('  rttMs                  : ' + g(t.rttMs));
    out('  throughputKbps         : ' + g(t.throughputKbps));
    out('  downloadThroughputKbps : ' + g(t.downloadThroughputKbps));
    out('  uploadThroughputKbps   : ' + g(t.uploadThroughputKbps));
    out('  requestLatencyMs       : ' + g(t.requestLatencyMs));
    out('  cpuSlowdownMultiplier  : ' + g(t.cpuSlowdownMultiplier));
    out('  REMEMBER: SIMULATED. Lantern models a link. It is not a radio, not a');
    out('  real phone, and not a real network.');
  } else {
    out('  could not read back configSettings -- no run succeeded.');
  }

  // --- aggregate ---------------------------------------------------------
  const rows = [];
  for (const route of ROUTES) {
    const runs = results[route] || [];
    const id = identities[route] || { ok: false, why: 'not probed', settledPath: '?' };
    if (runs.length === 0) {
      rows.push({ route: route, state: 'error', why: 'no successful run', id: id });
      continue;
    }
    const agg = {
      lcp: summarize(runs.map(function (r) { return r.lcp; })),
      fcp: summarize(runs.map(function (r) { return r.fcp; })),
      cls: summarize(runs.map(function (r) { return r.cls; })),
      si: summarize(runs.map(function (r) { return r.si; })),
      tbt: summarize(runs.map(function (r) { return r.tbt; })),
      ttfb: summarize(runs.map(function (r) { return r.ttfb; })),
      inpMeasured: runs.some(function (r) { return r.inp.measured; }),
    };
    // LCP decomposition. Lighthouse reports lcpLoadDelay / lcpLoadDuration /
    // lcpRenderDelay in the same metrics payload, but ONLY when the LCP element
    // is a loaded resource. When LCP is a text node the fields are null, and
    // summing nulls with numbers produces a plausible-looking wrong answer --
    // which is exactly what an earlier draft of this file printed. So each part
    // is aggregated independently and the row is only rendered when all three
    // are numeric AND they actually sum to LCP.
    const partOf = function (key) {
      const vals = runs.filter(function (r) { return typeof r[key] === 'number'; }).map(function (r) { return r[key]; });
      return vals.length === runs.length ? summarize(vals) : null;
    };
    agg.lcpDelay = partOf('lcpDelay');
    agg.lcpLoad = partOf('lcpLoad');
    agg.lcpRender = partOf('lcpRender');
    agg.lcpPartsConsistent =
      !!(agg.lcpDelay && agg.lcpLoad && agg.lcpRender) &&
      Math.abs(agg.lcpDelay.median + agg.lcpLoad.median + agg.lcpRender.median - agg.lcp.median) <
        Math.max(60, agg.lcp.median * 0.06);
    const first = runs[0];
    agg.bytes = first.bytes;
    agg.mainThreadMs = first.mainThreadMs;
    agg.byOrigin = first.byOrigin;
    agg.totalTransfer = first.totalTransfer;
    agg.requestCount = first.requestCount;
    agg.perfScore = first.perfScore;
    agg.n = runs.length;
    const breaches = [];
    if (agg.lcp.median > THRESHOLDS.lcp.ms) breaches.push('LCP');
    if (agg.cls.median > THRESHOLDS.cls.ms) breaches.push('CLS');
    rows.push({
      route: route,
      state: id.ok ? (breaches.length ? 'fail' : 'pass') : 'not-measured',
      breaches: id.ok ? breaches : [],
      agg: agg,
      id: id,
    });
  }

  out('');
  out(LINE);
  out('  MEASURED -- lab. Median of ' + RUNS + ' run(s); [min - max] is the spread.');
  out('  A large spread means this machine is noisy and the median is weak.');
  out(LINE);
  out('');
  out('  ' + pad('route', 13) + pad('outcome', 15) + pad('LCP  good<=2500ms', 23) + pad('CLS  good<=0.100', 23) + 'INP');
  out('  ' + THIN.slice(0, 92));
  for (const r of rows) {
    if (!r.agg) {
      out('  ' + pad(r.route, 13) + pad('ERROR', 15) + 'no successful run -- ' + r.why);
      continue;
    }
    const label = r.state === 'pass' ? 'pass'
      : r.state === 'fail' ? 'FAIL ' + r.breaches.join('+')
      : 'NOT MEASURED';
    out('  ' + pad(r.route, 13) + pad(label, 15) +
      pad(fmtMsSpread(r.agg.lcp), 23) + pad(fmtClsSpread(r.agg.cls), 23) + 'n/a');
  }
  out('  ' + THIN.slice(0, 92));

  // --- supporting detail -------------------------------------------------
  const good = rows.filter(function (r) { return r.state === 'pass' || r.state === 'fail'; });
  const any = rows.filter(function (r) { return r.agg; });
  if (any.length) {
    out('');
    out('--- supporting timings (median [min - max]) ---');
    out('  ' + pad('route', 13) + pad('FCP', 21) + pad('TTFB', 21) + pad('SpeedIndex', 21) + pad('TBT', 21) + pad('perf', 6));
    for (const r of any) {
      out('  ' + pad(r.route, 13) + pad(fmtMsSpread(r.agg.fcp), 21) + pad(fmtMsSpread(r.agg.ttfb), 21) +
        pad(fmtMsSpread(r.agg.si), 21) + pad(fmtMsSpread(r.agg.tbt), 21) +
        pad(r.agg.perfScore !== null ? String(r.agg.perfScore) : 'n/a', 6));
    }
    out('');
    out('  TTFB is meaningless here: it is a loopback static server with no');
    out('  network, no TLS and no backend. In production it is a real number and');
    out('  it is where a Supabase round trip and TLS handshake will land.');
    out('');
    out('--- where the bytes go (measured, run 1 of each route) ---');
    for (const r of any) {
      out('  ' + r.route + ':  ' + (r.agg.bytes !== null ? (r.agg.bytes / 1000).toFixed(1) + ' kB total transfer' : 'total transfer unknown') +
        ' over ' + r.agg.requestCount + ' request(s)');
      const origins = Object.keys(r.agg.byOrigin || {}).sort(function (a, b) {
        return r.agg.byOrigin[b].bytes - r.agg.byOrigin[a].bytes;
      });
      for (const o of origins) {
        const v = r.agg.byOrigin[o];
        const pct = r.agg.totalTransfer > 0 ? (v.bytes / r.agg.totalTransfer) * 100 : 0;
        out('    ' + padCut(o, 42) + pad(v.n + ' req', 8) + pad((v.bytes / 1000).toFixed(1) + ' kB', 12) + pad(pct.toFixed(1) + '%', 8));
      }
    }
    out('');
    out('--- LCP decomposition (why LCP is what it is) ---');
    out('  loadDelay = browser found the LCP resource late; load = fetching it;');
    out('  renderDelay = painting it. Lighthouse populates these ONLY when the');
    out('  LCP element is a loaded resource. A text-element LCP leaves them null,');
    out('  and they are then not printed, because a sum over nulls is a fiction.');
    out('  ' + pad('route', 13) + pad('loadDelay', 14) + pad('load', 14) + pad('renderDelay', 14) + pad('sum', 12) + 'LCP median');
    for (const r of any) {
      if (!r.agg.lcpPartsConsistent) {
        out('  ' + pad(r.route, 13) + 'no usable breakdown: LCP is a text element, not a loaded resource.');
        continue;
      }
      const a = r.agg;
      const sum = a.lcpDelay.median + a.lcpLoad.median + a.lcpRender.median;
      out('  ' + pad(r.route, 13) + pad(fmtMs(a.lcpDelay.median), 14) + pad(fmtMs(a.lcpLoad.median), 14) +
        pad(fmtMs(a.lcpRender.median), 14) + pad(fmtMs(sum), 12) + fmtMs(a.lcp.median));
    }
  }

  // --- INP --------------------------------------------------------------
  out('');
  out('--- INP: NOT MEASURED, and not measurable by this harness ---');
  out('  Good threshold is <= 200 ms, at the 75th percentile of REAL interactions.');
  out('  Lighthouse\'s interaction-to-next-paint audit declares');
  out('  supportedModes: ["timespan"] and returns notApplicable whenever');
  out('  throttlingMethod is "simulate" (interaction-to-next-paint.js:32,60-62).');
  out('  Navigation mode does not run it at all. INP needs real user');
  out('  interactions to exist; a synthetic page load has none.');
  out('  Reported as n/a above. NOT counted as a pass, NOT guessed, NOT zeroed.');
  out('  To actually measure INP you need field/RUM collection, or a Lighthouse');
  out('  user-flow timespan run with scripted interactions and devtools');
  out('  throttling (no simulation) -- which measures this machine, not a phone.');

  // --- verdict ----------------------------------------------------------
  let breaches = 0;
  let gaps = 0;
  let errors = 0;
  for (const r of rows) {
    if (r.state === 'fail') breaches += r.breaches.length;
    else if (r.state === 'not-measured') gaps++;
    else if (r.state === 'error') errors++;
  }

  out('');
  out('='.repeat(74));
  out('  SUMMARY');
  out('='.repeat(74));
  out('  measurement kind      : LAB (simulated). NOT field Core Web Vitals.');
  out('  lighthouse            : ' + version);
  out('  form factor           : ' + (DESKTOP ? 'desktop' : 'mobile (emulated)'));
  out('  throttling            : ' + (configRead ? (configRead.throttlingMethod || '?') : '?'));
  out('  runs per route        : ' + RUNS);
  out('  routes requested      : ' + ROUTES.length);
  out('  routes rendered+tested: ' + good.length);
  out('  routes NOT measured   : ' + gaps + '  (auth-gated, see below)');
  out('  routes errored        : ' + errors);
  out('  threshold breaches    : ' + breaches);
  out('');

  const blocked = rows.filter(function (r) { return r.state === 'not-measured' || r.state === 'error'; });
  if (blocked.length) {
    out('  COVERAGE GAP -- no usable measurement for:');
    for (const r of blocked) {
      out('    ' + pad(r.route, 13) + (r.id && r.id.why ? r.id.why : r.why));
    }
    out('');
    out('  Why: /today and /settings sit behind Clerk');
    out('  (artifacts/cadence/src/App.tsx:190-191). The only local auth bypass is');
    out('  gated on import.meta.env.DEV, which is false in every production');
    out('  build, so an unauthenticated load of those URLs renders the landing');
    out('  page instead. Measuring them needs one of:');
    out('    (a) a real authenticated session: deploy, then measure the deployed');
    out('        URL with real Clerk test credentials;');
    out('    (b) a production build whose auth gate can be satisfied locally --');
    out('        an App.tsx change, and an owner decision;');
    out('    (c) field/RUM data, which is the only way to obtain a true');
    out('        75th-percentile number for these routes at all.');
    out('');
    out('  This gate will NOT report the redirect target\'s timings as these');
    out('  routes\' timings. Doing so is the exact failure this script exists to');
    out('  prevent.');
    out('');
  }

  if (breaches > 0) {
    fail('  FAIL  ' + breaches + ' measured threshold breach(es) against the published');
    fail('        Core Web Vitals "good" thresholds:');
    for (const r of rows) {
      if (r.breaches && r.breaches.length) {
        fail('    ' + r.route + ': ' + r.breaches.join(', ') + ' -- LCP ' + fmtMsSpread(r.agg.lcp) + ', CLS ' + fmtClsSpread(r.agg.cls));
      }
    }
    fail('');
    fail('  These are the published Core Web Vitals thresholds, not a');
    fail('  repo-invented target. Do not loosen them to make this pass; the');
    fail('  regression is the finding.');
    out('');
    return 1;
  }

  if (errors > 0) {
    fail('  FAIL  ' + errors + ' route(s) produced NO successful run.');
    fail('');
    fail('  A gate that measured nothing and returned success is worse than no');
    fail('  gate: it manufactures confidence. This run has no evidence for those');
    fail('  routes, so it cannot pass. Re-run; if it persists, Lighthouse or the');
    fail('  browser is broken, not the app.');
    out('');
    return 1;
  }

  if (FAIL_ON_BLOCKED && gaps > 0) {
    fail('  FAIL  --fail-on-blocked and ' + gaps + ' route(s) were not measured.');
    out('');
    return 1;
  }

  out('  PASS  no measured route breached LCP <= 2.5 s or CLS <= 0.1.');
  out('        INP was not measured and is not claimed.');
  if (gaps > 0) {
    out('        ' + gaps + ' route(s) were NOT measured (auth-gated) and are');
    out('        excluded from this verdict rather than assumed good.');
  }
  out('        LAB ONLY. This is not a Core Web Vitals result and must not be');
  out('        reported as one.');
  out('');
  return 0;
}

(async function () {
  let code;
  try {
    code = await main();
  } catch (err) {
    fail('');
    fail('  GATE ERROR: ' + ascii(err && err.message ? err.message : String(err)));
    fail('');
    code = 2;
  }
  process.exit(code);
})();
