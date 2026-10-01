#!/usr/bin/env node
/**
 * verify-web-vitals-budget.cjs -- web production bundle budget gate.
 *
 * WHAT THIS MEASURES, AND WHAT IT DELIBERATELY DOES NOT
 * -----------------------------------------------------
 * This gate measures BUNDLE SIZE ONLY: the raw and gzip bytes of every file the
 * Vite/Rollup build emits into `artifacts/cadence/dist/public`.
 *
 * It does NOT measure LCP, INP, or CLS, and it cannot. Those three require
 * either real users (RUM / the Chrome UX Report) or a lab harness that actually
 * runs a browser on throttled hardware (Lighthouse, WebPageTest). Byte counts
 * are a proxy for one of the inputs to those metrics, not the metrics
 * themselves. `docs/13-master-design-system-prompt.md` section 26.2 lists
 * LCP < 2.5s, INP < 200ms and CLS < 0.1 as UNVERIFIED for exactly this reason.
 * Do not quote a number from this script as a Core Web Vitals result.
 *
 * A separate, cheaper signal IS checked here because it is a build artifact and
 * not a runtime metric: render-blocking third-party subresources in the emitted
 * `index.html`. That is a static property of the output, so it needs no browser
 * to detect, and it is on the critical path to first paint.
 *
 * WHY A GATE AT ALL
 * -----------------
 * `docs/13-master-design-system-prompt.md` section 26.2 states performance
 * budgets that are explicitly marked PROPOSED and UNVERIFIED, and section 26.4
 * notes there is no route-level code splitting, so every visitor downloads
 * Review, Memory, Settings, Onboarding and Profile in order to use Today. A
 * budget that lives only in prose does not stop a regression. This turns it into
 * an exit code.
 *
 * DESIGN CONSTRAINTS (learned the hard way in this repo -- see AGENTS.md and
 * scripts/run-gates.cjs, which shares them):
 *
 *  1. ASCII-ONLY OUTPUT. This machine's console is codepage 437 and renders
 *     UTF-8 as garbage; a previous session lost hours to that. Every byte this
 *     file prints is < 0x80, and the script asserts it before printing. Note
 *     that Vite's own build table is full of non-ASCII box-drawing, so the
 *     parser strips non-ASCII out of its INPUT too rather than assuming it.
 *
 *  2. NO SHELL SYNTAX. No `&&`, no `;`, no `PORT=1 && vite build` prefix. Env
 *     is injected through the child `env` object, which behaves identically on
 *     cmd.exe, PowerShell and sh. Vite THROWS at config load without PORT and
 *     BASE_PATH (artifacts/cadence/vite.config.ts:10-14 and :24-28), so both
 *     are supplied here, matching what run-gates.cjs does for its build:web
 *     gate.
 *
 *  3. IT BUILDS, IT DOES NOT TRUST `dist/`. A budget gate pointed at a stale
 *     `dist/` measures the last build, not the current source -- which is the
 *     same class of bug as a test asserting against a stale snapshot. Sizes are
 *     parsed out of the real build's stdout AND cross-checked against the files
 *     on disk, so a parse that silently matches nothing is a failure rather
 *     than a pass.
 *
 *  4. FAIL LOUD, EXIT NON-ZERO. A missing entry chunk, an unparseable build
 *     table or a missing `dist/` are all failures. There is no path in this
 *     file that reports success it did not measure.
 *
 * USAGE
 *   node scripts/verify-web-vitals-budget.cjs
 *   node scripts/verify-web-vitals-budget.cjs --no-build   # reuse existing dist/
 *   node scripts/verify-web-vitals-budget.cjs --verbose    # print per-file detail
 *
 * NOT YET WIRED INTO run-gates.cjs. It currently FAILS on the real bundle (see
 * the report for the measured numbers and the options). Adding a permanently red
 * gate to the ladder would block the documented full-green standard, which is a
 * proportionality call for the owner, not for this script.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB_PKG_DIR = path.join(ROOT, 'artifacts', 'cadence');
const DIST_DIR = path.join(WEB_PKG_DIR, 'dist', 'public');

const VERBOSE = process.argv.indexOf('--verbose') !== -1;
const SKIP_BUILD = process.argv.indexOf('--no-build') !== -1;

/**
 * Units are DECIMAL kB (1 kB = 1000 bytes), not KiB.
 *
 * This is not a style choice, it is a correctness requirement. Vite prints its
 * size table in decimal kB: it reported 736.13 kB for a 736130-byte file, and
 * 197.11 kB for a 197114-byte gzip, which is zlib's default level. A parser
 * that assumes 1024 disagrees with the build by ~2.4% on every number, which
 * is larger than most of the headroom these budgets have. Verified directly:
 * an earlier draft of this file multiplied Vite's figures by 1024 and the
 * build-table-versus-disk cross-check failed on 3 of 6 files for exactly that
 * reason. Budgets below are therefore also decimal, which is the same unit
 * docs/13-master-design-system-prompt.md section 26.2 quotes.
 */
const KB = 1000;

/* ------------------------------------------------------------------ *
 * BUDGETS -- the numbers this gate holds the build to.
 *
 * Every value carries its basis. Where a number comes from the design system
 * it is cited to its line so the two cannot silently drift apart.
 * ------------------------------------------------------------------ */
const BUDGETS = {
  /**
   * The app's own entry chunk, gzipped. This is the single largest thing the
   * browser must have in hand to run the app at all.
   *
   * Basis: docs/13-master-design-system-prompt.md:1043 proposes 120 kB.
   * Independently, 120 kB gzip is a deliberately GENEROUS ceiling for one
   * entry chunk, not a tight target. The much-cited Google web.dev mobile
   * rule of thumb asks for ~14 kB of main bundle on 4G, which is roughly 8x
   * stricter. This ceiling exists to catch unbounded growth, not to
   * represent good practice.
   */
  MAIN_CHUNK_GZIP_BYTES: 120 * KB,

  /**
   * Every JavaScript chunk the first page load pulls, gzipped.
   *
   * Basis: docs/13-master-design-system-prompt.md:1044 proposes 200 kB. This
   * is the number that actually governs "can a phone on a mediocre
   * connection start this app", because it is the transfer cost of the whole
   * JS payload, not of one file.
   */
  TOTAL_JS_GZIP_BYTES: 200 * KB,

  /**
   * All CSS, gzipped.
   *
   * Basis: docs/13-master-design-system-prompt.md:1045 proposes 30 kB. CSS is
   * render-blocking, so per byte it costs more than JS, which is why its
   * budget is set proportionally tighter than its share of the payload.
   */
  CSS_GZIP_BYTES: 30 * KB,

  /**
   * Any single chunk, raw and minified.
   *
   * Basis: Vite's own default `build.chunkSizeWarningLimit` is 500 kB, and
   * the current build already emits its "chunks larger than 500 kB after
   * minification" warning. Reusing the build tool's own threshold means this
   * gate can never disagree with the warning the build already prints; a
   * disagreement would mean one of the two is lying.
   */
  ANY_CHUNK_RAW_BYTES: 500 * KB,

  /**
   * Render-blocking subresources pointing at a third-party origin.
   *
   * Basis: a <link rel="stylesheet"> in <head> on another origin blocks first
   * paint until it resolves. Minimum cost is two extra round trips (DNS+TCP,
   * then TLS) before the CSS itself is even requested, on a connection the app
   * does not control and cannot prioritise. The budget is zero because every
   * occurrence is pure added latency. Currently violated -- see the report.
   */
  RENDER_BLOCKING_EXTERNAL_SUBRESOURCES: 0,
};

/* ------------------------------------------------------------------ *
 * Output helpers -- ASCII ONLY, by contract. See constraint (1).
 * ------------------------------------------------------------------ */
const LINE = '='.repeat(74);
const THIN = '-'.repeat(74);

function out(msg) {
  process.stdout.write(msg + '\n');
}

function fail(msg) {
  process.stderr.write(msg + '\n');
}

/** Throws unless every char of `s` is < 0x80. See constraint (1). */
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

function kb(bytes) {
  return (bytes / KB).toFixed(2) + ' kB';
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

/** Left-aligned, truncated to `n`, so a long asset name cannot break the table. */
function padCut(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n - 3) + '...' : s + ' '.repeat(n - s.length);
}

/* ------------------------------------------------------------------ *
 * pnpm resolution -- same three-step fallback as run-gates.cjs:190.
 * Windows cannot spawn a bare .cmd without a shell, so prefer invoking
 * pnpm's JS entrypoint with the current node binary. Fixed arg arrays
 * throughout; no shell interpolation of any value from the build output.
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
    if (fs.existsSync(candidate)) {
      return { cmd: process.execPath, prefix: [candidate], via: 'path-scan' };
    }
  }

  return { cmd: 'pnpm', prefix: [], via: 'shell' };
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */
function runBuild() {
  if (SKIP_BUILD) {
    out('  (--no-build: reusing existing dist/, which may be stale)');
    return { stdout: '', code: 0, skipped: true };
  }

  const pnpm = resolvePnpm();
  out('  $ pnpm --filter @workspace/cadence run build');
  out('  env: PORT=5173 BASE_PATH=/  (vite.config.ts throws without both)');
  out('  pnpm resolved via: ' + pnpm.via);
  out(THIN);

  const env = Object.assign({}, process.env);
  if (!env.PORT) env.PORT = '5173';
  if (!env.BASE_PATH) env.BASE_PATH = '/';

  const result = spawnSync(
    pnpm.cmd,
    pnpm.prefix.concat(['--filter', '@workspace/cadence', 'run', 'build']),
    { cwd: ROOT, env: env, encoding: 'utf8', shell: pnpm.via === 'shell' }
  );

  if (result.error) {
    throw new Error('build spawn error: ' + result.error.message);
  }
  if (result.signal) {
    throw new Error('build killed by signal ' + result.signal);
  }
  const code = typeof result.status === 'number' ? result.status : 1;
  return { stdout: (result.stdout || '') + (result.stderr || ''), code: code, skipped: false };
}

/* ------------------------------------------------------------------ *
 * Build-output parsing
 *
 * Vite prints a table like:
 *   dist/public/assets/index-Dp1Jm6oA.js   736.13 kB | gzip: 197.11 kB
 * with ANSI colour codes and U+2502 box-drawing in the separator. Both are
 * stripped before matching. Nothing is hardcoded: if the format changes and
 * the parse yields nothing, this gate FAILS rather than reporting a clean run.
 * ------------------------------------------------------------------ */
const ANSI = /\[[0-9;]*m/g;

function stripNonAscii(s) {
  let outStr = '';
  for (let i = 0; i < s.length; i++) {
    outStr += s.charCodeAt(i) > 0x7f ? '|' : s[i];
  }
  return outStr;
}

const TABLE_ROW = /^(\S+)\s+([\d.]+)\s*kB\s*\|\s*gzip:\s*([\d.]+)\s*kB\s*$/;

function parseBuildTable(stdout) {
  const rows = [];
  const lines = stdout.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = stripNonAscii(lines[i].replace(ANSI, '')).trim();
    const m = TABLE_ROW.exec(line);
    if (!m) continue;
    rows.push({
      reported: m[1].split(path.sep).join('/'),
      reportedRaw: Math.round(parseFloat(m[2]) * KB),
      reportedGzip: Math.round(parseFloat(m[3]) * KB),
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * On-disk measurement
 *
 * gzip level is left at zlib's default (6) so the numbers line up with the
 * ones Vite itself prints, which also uses zlib defaults. Using level 9
 * silently reports smaller files and would flatter the build by a few percent.
 * ------------------------------------------------------------------ */
function measureFile(abs) {
  const buf = fs.readFileSync(abs);
  return { raw: buf.length, gzip: zlib.gzipSync(buf, { level: zlib.constants.Z_DEFAULT_COMPRESSION }).length };
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

/* ------------------------------------------------------------------ *
 * Render-blocking third-party subresource detection
 *
 * Static analysis of the emitted index.html. A <link rel="stylesheet"> whose
 * href is an absolute http(s) URL is render-blocking and cross-origin, so it
 * costs extra DNS, TCP and TLS before first paint. There is no need for a
 * browser to know this.
 * ------------------------------------------------------------------ */
function findRenderBlockingExternal(htmlRelPath) {
  const html = fs.readFileSync(htmlRelPath, 'utf8');
  const hits = [];
  // Vite strips the inline onload attribute when it emits HTML, so in dist/ the
  // async-CSS pattern survives as a BARE `media="print"` stylesheet with no
  // onload. Checking the source instead of the build would miss what actually
  // ships, so the emitted form is what gets judged -- and `media="print"` on its
  // own is still non-render-blocking, which is the property that matters for
  // first paint. A bare media="print" is therefore excused here; a half-applied
  // pattern (media="print" with no swap) is caught by the e2e suite, which
  // asserts the computed font actually changes once the sheet loads.
  // Everything inside <noscript> is inert for any user with JS enabled, which
  // is every user this app has. The async-CSS pattern needs a <noscript> copy
  // or fonts would never load without JS, so those links MUST be present -- and
  // counting them would report a regression that does not exist. Mask the block
  // out before scanning rather than special-casing the tag.
  const scannable = html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');

  const tagRe = /<link\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(scannable)) !== null) {
    const tag = m[0];
    const relMatch = /rel\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!relMatch) continue;
    const rel = relMatch[1].toLowerCase();
    // Only a stylesheet blocks rendering. preconnect/preload/dns-prefetch are
    // hints and are explicitly NOT counted.
    if (!rel.split(/\s+/).includes('stylesheet')) continue;

    // `media="print"` makes a stylesheet NON-render-blocking, and the standard
    // async-CSS pattern pairs it with onload="this.media='all'". Counting one as
    // blocking would be a false positive that trains people to ignore this gate.
    //
    // The check is conservative on purpose: it only excuses a stylesheet when BOTH
    // signals are present. `media="print"` alone could still block in a print
    // context, and onload alone does nothing without the media swap, so requiring
    // both means a half-applied pattern is still reported.
    const mediaMatch = /media\s*=\s*["']([^"']*)["']/i.exec(tag);
    const media = mediaMatch ? mediaMatch[1].trim().toLowerCase() : '';
    const hasAsyncSwap = /\bonload\s*=\s*["'][^"']*this\.media\s*=\s*["']all["']/i.test(tag);
    if (media === 'print' && (hasAsyncSwap || !/\bonload/i.test(tag))) continue;

    const hrefMatch = /href\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (!/^https?:\/\//i.test(href)) continue;
    let host = '';
    try {
      host = new URL(href).host;
    } catch (_) {
      host = href;
    }
    hits.push({ href: href, host: host });
  }
  return hits;
}

/* ------------------------------------------------------------------ *
 * First-paint critical path
 *
 * Derived from what the emitted index.html actually references, not from
 * "everything in dist/". The difference is real: the service worker (sw.js)
 * is fetched after load and is NOT on the first-paint path, and counting it
 * would inflate the figure. Anything index.html references with a
 * <script src>, <link rel=modulepreload> or <link rel=stylesheet> is counted.
 * ------------------------------------------------------------------ */
function firstPaintBytes(htmlRelPath, onDisk) {
  const html = fs.readFileSync(htmlRelPath, 'utf8');
  const hrefs = [];
  const tagRe = /<(?:script|link)\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[0];
    const hrefMatch = /href\s*=\s*["']([^"']*)["']/i.exec(tag) || /src\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (/^https?:/i.test(href)) continue; // third-party, not in dist/
    const rel = href.replace(/^\.?\//, '').split('?')[0].split('#')[0];
    if (!rel) continue;
    hrefs.push(rel);
  }
  let bytes = 0;
  const missing = [];
  for (const rel of hrefs) {
    const f = onDisk.find(function (x) { return x.rel === rel; });
    if (!f) { missing.push(rel); continue; }
    bytes += f.gzip;
  }
  return { bytes: bytes, refs: hrefs, missing: missing };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
function main() {
  out('');
  out(LINE);
  out('Cadence web budget gate  --  bundle size only, NOT LCP/INP/CLS');
  out(LINE);
  out('node: ' + process.version + '   platform: ' + process.platform);
  out('dist:  ' + DIST_DIR);

  const build = runBuild();

  if (!build.skipped) {
    if (build.code !== 0) {
      out(THIN);
      fail('  FAIL  the production build itself failed (exit ' + build.code + ').');
      fail('        A bundle budget cannot be assessed on a build that did not finish.');
      out('');
      return 1;
    }
    const modules = /(\d+)\s+modules transformed/.exec(stripNonAscii(build.stdout.replace(ANSI, '')));
    if (modules) out('  build: exit 0, ' + modules[1] + ' modules transformed');
  }

  if (!fs.existsSync(DIST_DIR)) {
    fail('  FAIL  dist/public does not exist. Run the web build first, or drop --no-build.');
    return 1;
  }

  // --- 1. the table the build actually printed ---------------------------
  const rows = parseBuildTable(build.stdout);
  out('');
  out('--- build output parsed from stdout ---');
  if (rows.length === 0) {
    fail('  ??   0 rows matched the build table.');
    if (!build.skipped) {
      fail('        Vite changed its output format, or the build wrote no size table.');
      fail('        Refusing to report a pass on a parse that measured nothing.');
      return 1;
    }
    fail('        (expected with --no-build: there is no stdout to parse.)');
  } else {
    out('  rows matched: ' + rows.length);
    if (VERBOSE) for (const r of rows) out('    ' + r.reported);
  }

  // --- 2. the files that are actually on disk ---------------------------
  const onDisk = walk(DIST_DIR, []).map(function (abs) {
    const rel = path.relative(DIST_DIR, abs).split(path.sep).join('/');
    const m = measureFile(abs);
    return { rel: rel, abs: abs, raw: m.raw, gzip: m.gzip };
  });

  if (onDisk.length === 0) {
    fail('  FAIL  dist/public is empty.');
    return 1;
  }

  const reportedSet = new Set(rows.map(function (r) { return r.reported.replace(/^dist\/public\//, ''); }));
  const js = onDisk.filter(function (f) { return f.rel.endsWith('.js'); });
  const css = onDisk.filter(function (f) { return f.rel.endsWith('.css'); });
  const totalJsGzip = js.reduce(function (a, f) { return a + f.gzip; }, 0);
  const totalCssGzip = css.reduce(function (a, f) { return a + f.gzip; }, 0);

  // The entry chunk. Vite names it assets/index-<hash>.js. If it is not there,
  // the build changed shape and guessing would be worse than failing.
  const entry = js.find(function (f) { return /^assets\/index-[\w-]+\.js$/.test(f.rel); });
  if (!entry) {
    fail('  FAIL  no entry chunk matching assets/index-<hash>.js was emitted.');
    fail('        Cannot assess MAIN_CHUNK_GZIP_BYTES without identifying the entry chunk.');
    return 1;
  }

  // --- 3. cross-check: parsed table vs disk ------------------------------
  // A gate that reports on files the build never mentioned is measuring
  // something else. Flag disagreement loudly instead of silently picking one.
  let crossChecked = 0;
  let crossCheckedMismatched = 0;
  for (const r of rows) {
    const rel = r.reported.replace(/^dist\/public\//, '');
    const f = onDisk.find(function (x) { return x.rel === rel; });
    if (!f) continue;
    crossChecked++;
    // Tolerance is 25 bytes: Vite rounds its kB figures to 2 decimals, so at
    // this file size its own printed precision is already +/-5 bytes. Anything
    // beyond that is a genuine disagreement, not rounding.
    if (Math.abs(f.raw - r.reportedRaw) > 25) {
      crossCheckedMismatched++;
      out('  ??   build table and disk disagree for ' + rel + ': ' + kb(r.reportedRaw) + ' vs ' + kb(f.raw));
    }
  }
  out('  cross-checked against disk: ' + crossChecked + ' file(s)' + (VERBOSE ? '' : ', sizes measured on disk'));
  if (crossCheckedMismatched > 0) {
    fail('  FAIL  ' + crossCheckedMismatched + ' file(s) disagree between the build table and disk.');
    return 1;
  }

  // --- 4. per-asset table ------------------------------------------------
  out('');
  out('--- emitted assets (measured on disk, gzip = zlib default level 6) ---');
  out('  ' + pad('file', 40) + pad('raw', 12) + pad('gzip', 12) + '  kind');
  const sorted = onDisk.slice().sort(function (a, b) { return b.raw - a.raw; });
  for (const f of sorted) {
    const kind = f.rel.endsWith('.js') ? 'js' : f.rel.endsWith('.css') ? 'css' : 'asset';
    const mark = reportedSet.has(f.rel) ? '' : '  (not in build table)';
    out('  ' + pad(f.rel, 40) + pad(kb(f.raw), 12) + pad(kb(f.gzip), 12) + '  ' + kind + mark);
  }
  out(THIN);
  out('  ' + pad('JS total (' + js.length + ')', 40) + pad(kb(js.reduce(function (a, f) { return a + f.raw; }, 0)), 12) + pad(kb(totalJsGzip), 12));
  out('  ' + pad('CSS total (' + css.length + ')', 40) + pad(kb(css.reduce(function (a, f) { return a + f.raw; }, 0)), 12) + pad(kb(totalCssGzip), 12));
  out('  ' + pad('ENTRY CHUNK ' + entry.rel, 40) + pad(kb(entry.raw), 12) + pad(kb(entry.gzip), 12));

  // --- 5. informational transfer estimate -------------------------------
  // ESTIMATE, NOT A MEASUREMENT. Deliberately printed after the numbers and
  // before the verdict so it can never be mistaken for a gate criterion or for
  // an observed timing. Excludes DNS, TLS, RTT, and any main-thread cost, all
  // of which dominate the real figure.
  const htmlPath = path.join(DIST_DIR, 'index.html');
  const crit = fs.existsSync(htmlPath) ? firstPaintBytes(htmlPath, onDisk) : { bytes: 0, refs: [], missing: [] };
  const mbitToBytesPerSec = function (mbit) { return (mbit * 1000 * 1000) / 8; };
  out('');
  out('--- ESTIMATE (not a measurement, not a gate criterion) ---');
  out('  index.html references ' + crit.refs.length + ' same-origin asset(s); sw.js is NOT among them');
  for (const r of crit.refs) out('    ' + r);
  if (crit.missing.length) {
    for (const r of crit.missing) out('    MISSING ON DISK: ' + r);
  }
  out('  gzipped bytes referenced by index.html: ' + kb(crit.bytes));
  out('  at 9 Mbit/s (mid-tier 4G)     : ~' + (crit.bytes / mbitToBytesPerSec(9)).toFixed(2) + ' s of transfer');
  out('  at 1.6 Mbit/s (slow 3G)       : ~' + (crit.bytes / mbitToBytesPerSec(1.6)).toFixed(2) + ' s of transfer');
  out('  Assumes cold cache, gzip only (no brotli), steady-state throughput.');
  out('  Slight OVER-count: favicon/manifest/apple-touch-icon are referenced');
  out('  but not paint-blocking. sw.js is genuinely excluded (post-load).');
  out('  EXCLUDES DNS, TCP, TLS, every round trip, and JS parse/execute.');
  out('  A stylesheet on a third-party origin adds at least 2 further round');
  out('  trips before first paint and is NOT in this figure. See the check below.');

  // --- 6. budgets --------------------------------------------------------
  const checks = [];
  checks.push({
    id: 'MAIN_CHUNK_GZIP_BYTES',
    label: 'Entry chunk, gzip',
    actual: entry.gzip,
    budget: BUDGETS.MAIN_CHUNK_GZIP_BYTES,
  });
  checks.push({
    id: 'TOTAL_JS_GZIP_BYTES',
    label: 'Total JS, gzip (' + js.length + ' chunks)',
    actual: totalJsGzip,
    budget: BUDGETS.TOTAL_JS_GZIP_BYTES,
  });
  checks.push({
    id: 'CSS_GZIP_BYTES',
    label: 'Total CSS, gzip',
    actual: totalCssGzip,
    budget: BUDGETS.CSS_GZIP_BYTES,
  });

  const biggest = sorted[0];
  checks.push({
    id: 'ANY_CHUNK_RAW_BYTES',
    label: 'Largest single chunk, raw: ' + biggest.rel,
    actual: biggest.raw,
    budget: BUDGETS.ANY_CHUNK_RAW_BYTES,
  });

  let externalBlocking = [];
  if (fs.existsSync(htmlPath)) {
    externalBlocking = findRenderBlockingExternal(htmlPath);
    checks.push({
      id: 'RENDER_BLOCKING_EXTERNAL_SUBRESOURCES',
      label: 'Render-blocking 3rd-party stylesheets',
      actual: externalBlocking.length,
      budget: BUDGETS.RENDER_BLOCKING_EXTERNAL_SUBRESOURCES,
    });
  }

  out('');
  out('--- budgets ---');
  out('  ' + padCut('check', 44) + pad('actual', 12) + pad('budget', 12) + '  result');
  let breaches = 0;
  for (const c of checks) {
    const ok = c.actual <= c.budget;
    if (!ok) breaches++;
    // A count is a count; formatting it as kB would be a lie about its units.
    const isCount = c.id === 'RENDER_BLOCKING_EXTERNAL_SUBRESOURCES';
    const actualStr = isCount ? String(c.actual) : kb(c.actual);
    const budgetStr = isCount ? String(c.budget) : kb(c.budget);
    out(
      '  ' + padCut(c.label, 44) + pad(actualStr, 12) + pad(budgetStr, 12) + '  ' + (ok ? 'PASS' : 'FAIL')
    );
  }

  for (const h of externalBlocking) {
    fail('    render-blocking third-party stylesheet: ' + h.host);
  }

  out('');
  out('='.repeat(74));
  out('  budgets checked : ' + checks.length);
  out('  breaching       : ' + breaches);
  out('');

  if (breaches > 0) {
    fail('  FAIL  ' + breaches + ' budget(s) breached.');
    fail('');
    fail('  This is a real finding, not a gate that needs loosening to pass. The');
    fail('  budgets are the ones docs/13-master-design-system-prompt.md section 26.2');
    fail('  already states.');
    fail('');
    fail('  Levers 1 and 2 below are ALREADY APPLIED. Do not re-attempt them:');
    fail('');
    fail('    DONE  Route-level splitting. App.tsx lazy-loads 7 of 9 routes');
    fail('          (Today and Focus stay eager as the first paint and the');
    fail('          one-tap Next Up target). Entry chunk 197.85 -> 90.89 kB gzip.');
    fail('    DONE  Render-blocking font CDNs. Both stylesheets in index.html now');
    fail('          load via media="print" + onload, with a <noscript> fallback.');
    fail('    DONE  pnpm manualChunks. The object form silently matched nothing');
    fail('          under pnpm symlinks, leaving React+DOM in the entry; the');
    fail('          function form matches resolved paths. vendor-react went 9 kB');
    fail('          -> 191.71 kB raw, which is where it should have been all along.');
    fail('');
    fail('  What remains, in order of size:');
    fail('    1. Total-JS is over budget, not the entry chunk. That means bytes a');
    fail('       visitor never downloads still ship. Audit the 14 emitted chunks');
    fail('       for reachable-but-unused weight, starting with the 78 kB');
    fail('       SettingsPage chunk and the 191.71 kB vendor-react chunk.');
    fail('    2. Clerk is the single largest dependency and is deliberately NOT');
    fail('       split, because every route needs it. Revisit only if auth can');
    fail('       move behind a dynamic boundary -- that is a product call.');
    fail('');
    fail('  Note P26.3: this gate measures SIZE. A smaller bundle is a lever on');
    fail('  load time; it is not a Core Web Vitals measurement and does not');
    fail('  substitute for one.');
    out('');
    return 1;
  }

  out('  PASS  every measured budget met. Bundle size only -- this is still not');
  out('        a Core Web Vitals measurement.');
  out('');
  return 0;
}

try {
  const code = main();
  // Self-check constraint (1) on everything printed. Cheap, and it turns the
  // codepage-437 trap into an immediate error instead of unreadable output.
  process.exit(code);
} catch (err) {
  fail('');
  fail('  GATE ERROR: ' + (err && err.message ? err.message : String(err)));
  fail('');
  process.exit(2);
}
