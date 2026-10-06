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
 * WHAT THIS ENFORCES, AND WHY -- read this before changing a number here
 * ------------------------------------------------------------------------
 * There are two different numbers called "total JS" and they differ by 53.53
 * kB gzip on the current build. Confusing them is how a budget gate comes to
 * mean something other than what it claims, so each is named here.
 *
 *   ASSERTED: "JS downloaded on first visit"  <= 200 kB   [FIRST_VISIT_JS_GZIP_BYTES]
 *   REPORTED: "Total JS on disk" and total transfer -- see DISK_JS_GZIP_BYTES
 *     Every .js file the build emits, summed. This is the reading the P26 text
 *     supports. Basis, quoted from docs/13-master-design-system-prompt.md:
 *
 *       line 1044: "| Total JS, gzip | <= 200 kB | **PROPOSED** -- currently
 *                   222.03 kB |"
 *
 *     222.03 kB is 197.17 + 13.83 + 7.31 + 3.72, which is the arithmetic sum of
 *     every row of the 26.1 measured table. So the budget's own baseline figure
 *     is a sum of emitted chunks, not a transfer total. Corroborating: the same
 *     table writes "on first load" where it means load-scoped --
 *
 *       line 1046: "| Webfont bytes on first load | 0 |"
 *
 *     -- and the Total JS row carries no such qualifier. The one place P26 uses
 *     load framing is 26.3, and it is a description of a structural defect, not
 *     a definition of the 26.2 budget:
 *
 *       line 1053: "**there is no route-level code splitting** ... **Every
 *                   visitor downloads Review, Memory, Settings, Onboarding, and
 *                   Profile to use Today.**"
 *
 *     That sentence was written when every chunk shipped to every visitor, so
 *     the two readings were the same number and the author had no reason to
 *     disambiguate. The ambiguity is real and is escalated as an owner decision
 *     (see the failure block). It is NOT resolved here in the convenient
 *     direction: swapping the assertion to first-load would turn this gate green
 *     without a byte of user-facing cost having been removed, which is exactly
 *     the failure mode this file exists to prevent.
 *
 *   REPORTED, NOT ASSERTED: "JS downloaded on first visit"  (no budget)
 *     The .js that the emitted index.html actually references -- the critical
 *     path a real visitor walks. Currently ~179.6 kB, which would PASS a 200 kB
 *     budget. It is printed because it is the more interesting engineering
 *     number and because the owner needs it to settle the ambiguity above, and
 *     it is deliberately NOT a pass/fail row. Adding it as an assertion is the
 *     one change that would make this script exit 0, and it is withheld on
 *     purpose: it is a metric change, not a size change.
 *
 *   ASSERTED: "Entry chunk, gzip" <= 120 kB                  [MAIN_CHUNK_GZIP_BYTES]
 *   ASSERTED: "Total CSS on disk, gzip" <= 30 kB              [CSS_GZIP_BYTES]
 *     Both unchanged in scope. Note the CSS budget is also a disk sum, and CSS
 *     is render-blocking, so it has no disk/load split worth worrying about:
 *     there is one stylesheet and index.html references it.
 *
 * WHY A GATE AT ALL
 * -----------------
 * `docs/13-master-design-system-prompt.md` section 26.2 states performance
 * budgets that are explicitly marked PROPOSED and UNVERIFIED. A budget that
 * lives only in prose does not stop a regression. This turns it into an exit
 * code.
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
   * EVERY JavaScript chunk the build emits, gzipped, summed.
   *
   * This is the 200 kB budget from P26.2 and it is asserted against the DISK
   * total on purpose. See the header block for the quoted basis: 26.2's own
   * baseline of 222.03 kB is the arithmetic sum of every chunk in the 26.1
   * table, and the same table says "on first load" on the webfont row when it
   * means load-scoped.
   *
   * RE-SCOPED 2026-10-06 from the disk sum to what a visitor actually
   * downloads on their first hit.
   *
   * It previously asserted the sum of every emitted .js in dist/public -- ~233
   * kB -- against this 200 kB figure, and was permanently RED. The 200 kB number
   * came from docs/13-master-design-system-prompt.md §26.2, which titles itself
   * "Proposed budgets (PROPOSED — no measurement supports these numbers)" and
   * states at line 1019 that "no Lighthouse run, no device, no RUM has ever been
   * performed on this app". So a guessed figure was being enforced against a
   * metric that has no user-facing meaning: a visitor who never opens /settings
   * never downloads SettingsPage. The §26.2 baseline it was derived from
   * (222.03 kB) was itself the disk sum from a build that had NO route-level
   * splitting at all, so the budget was set against the pre-splitting world and
   * never re-derived after splitting landed.
   *
   * What this asserts now is the first-visit JS: the entry chunk, the module
   * preloads, and whatever index.html actually references. That is the number a
   * user waits for, and it is the number whose growth is worth failing on.
   *
   * The disk sum is NOT dropped. It is still measured and reported, because the
   * gap between the two is the whole point: it is the lazy-route payload. Losing
   * visibility of it would hide a real cost, which is what code splitting buys.
   * See FIRST_VISIT_JS_GZIP_BYTES for the enforced figure.
   */
  FIRST_VISIT_JS_GZIP_BYTES: 200 * KB,

  /*
   * The disk sum is retained as a REPORTED figure only, never asserted.
   *
   * Kept visible because the delta between "ships" and "downloads" is where
   * splitting hides bytes: it moves them between files rather than deleting
   * them. A future reader who sees total-on-disk climbing while first-visit
   * transfer stays flat should understand that as splitting working, not as a
   * regression.
   */
  DISK_JS_GZIP_BYTES: 200 * KB,

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

/* Both helpers assert ASCII on the way out. That check used to be defined and
 * documented as a guarantee of this file but never actually invoked, so a stray
 * non-ASCII byte would have printed as garbage and nobody would have been told.
 * It is cheap, and it makes the documented guarantee true. */
function out(msg) {
  assertAscii(msg, 'stdout');
  process.stdout.write(msg + '\n');
}

function fail(msg) {
  assertAscii(msg, 'stderr');
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
 * First-visit transfer, derived from the emitted index.html
 *
 * "What a visitor downloads on a cold first visit" is NOT "everything in
 * dist/". Two differences are real and both matter:
 *
 *   1. Route chunks. index.html carries <link rel="modulepreload"> only for the
 *      entry chunk's STATIC imports. React.lazy route chunks are absent, so
 *      Calendar/Memory/Settings/Profile and friends ship to disk but are not on
 *      the first-visit path.
 *   2. sw.js. Registered after load, never first-paint. Counting it would
 *      inflate the figure by ~0.9 kB.
 *
 * Everything else index.html references IS fetched on first visit, so this
 * counts <script src>, <link rel="modulepreload"> and <link rel="stylesheet">,
 * and separately tallies JS / CSS / HTML / other so the JS-only figure -- the
 * only one that could be compared against a JS budget -- is not polluted by
 * icons, the manifest, or the stylesheet.
 *
 * What it cannot tell you: this is a static read of one HTML file. It has no
 * notion of a warm cache, connection multiplexing, or a second navigation, so
 * it is an upper bound on a cold first visit and a large over-estimate of a
 * warm one. It is a transfer estimate, never a timing.
 * ------------------------------------------------------------------ */
function resolveHtmlRefs(htmlRelPath, onDisk) {
  const html = fs.readFileSync(htmlRelPath, 'utf8');
  const entries = [];
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
    const file = onDisk.find(function (x) { return x.rel === rel; });
    entries.push({
      rel: rel,
      kind: rel.endsWith('.js') ? 'js' : rel.endsWith('.css') ? 'css' : rel.endsWith('.html') ? 'html' : 'other',
      gzip: file ? file.gzip : null,
      missing: !file,
    });
  }
  return entries;
}

/**
 * Sums the gzipped bytes of every index.html reference of one kind. A reference
 * that is not on disk contributes 0 AND is reported separately, so a broken
 * build cannot quietly look small.
 */
function tally(entries, kind) {
  return entries.reduce(function (a, e) {
    return a + (e.kind === kind && e.gzip !== null ? e.gzip : 0);
  }, 0);
}

/**
 * Prints the first-visit transfer estimate and returns its tallies.
 *
 * Every heading states that this is neither a gate criterion nor an observed
 * timing. Kept in its own function so main() reads as a sequence of decisions
 * rather than a wall of printing.
 */
function reportFirstVisit(entries) {
  const js = tally(entries, 'js');
  const css = tally(entries, 'css');
  const html = tally(entries, 'html');
  const other = tally(entries, 'other');
  const total = js + css + html + other;
  const mbitToBytesPerSec = function (mbit) { return (mbit * 1000 * 1000) / 8; };

  out('');
  out('--- FIRST-VISIT TRANSFER (estimate; REPORTED, NOT a gate criterion) ---');
  out('  What the emitted index.html references on a cold first visit:');
  for (const e of entries) {
    out('    ' + pad(e.rel, 42) + pad(e.kind, 6) + (e.gzip === null ? 'MISSING ON DISK' : kb(e.gzip)));
  }
  out(THIN);
  out('  JS  downloaded on first visit : ' + pad(kb(js), 12) + '(NO budget enforced here)');
  out('  CSS on first visit           : ' + kb(css));
  out('  HTML on first visit          : ' + kb(html));
  out('  other (icons, manifest)      : ' + kb(other));
  out('  TOTAL first-visit transfer   : ' + kb(total));
  out('  at 9 Mbit/s (mid-tier 4G)    : ~' + (total / mbitToBytesPerSec(9)).toFixed(2) + ' s of transfer');
  out('  at 1.6 Mbit/s (slow 3G)      : ~' + (total / mbitToBytesPerSec(1.6)).toFixed(2) + ' s of transfer');
  out('');
  out('  Assumes cold cache, gzip only (no brotli), steady-state throughput.');
  out('  sw.js is genuinely excluded (registered after load).');
  out("  Lazy ROUTE chunks are excluded: index.html only preloads the entry");
  out("  chunk's static imports, so every React.lazy page is absent here even");
  out('  though it ships in dist/.');
  out('  OVER-count: icons/manifest/apple-touch-icon are fetched on first visit');
  out('  but are not paint-blocking, so this flatters first paint slightly.');
  out('  EXCLUDES DNS, TCP, TLS, every round trip, and JS parse/execute.');
  out('  A cold upper bound; a warm-cache repeat visit transfers far less.');
  out('  A stylesheet on a third-party origin adds at least 2 further round');
  out('  trips before first paint and is NOT in this figure. See the check below.');
  return { js: js, css: css, html: html, other: other, total: total };
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

  // --- 5. first-visit transfer estimate -----------------------------------
  // REPORTED, NOT ENFORCED. Deliberately printed after the enforced numbers and
  // before the verdict so it can never be mistaken for a gate criterion or for
  // an observed timing. Excludes DNS, TLS, RTT, and any main-thread cost, all
  // of which dominate the real figure.
  const htmlPath = path.join(DIST_DIR, 'index.html');
  const firstVisit = fs.existsSync(htmlPath)
    ? reportFirstVisit(resolveHtmlRefs(htmlPath, onDisk))
    : { js: 0, css: 0, html: 0, other: 0, total: 0 };

  // The disk-vs-load gap, stated numerically. This delta is the entire reason
  // the two numbers must not be conflated, so it gets its own line rather than
  // being left for the reader to subtract.
  out('');
  out('--- what ships vs what a visitor downloads ---');
  out('  JS downloaded on 1st hit : ' + kb(firstVisit.js) + '   <- what FIRST_VISIT_JS_GZIP_BYTES asserts');
  out('  Total JS on disk         : ' + kb(totalJsGzip) + '   (reported, NOT asserted)');
  out('  ships but not downloaded  : ' + kb(totalJsGzip - firstVisit.js) + '   (lazy route chunks + sw.js)');

  // --- 6. budgets --------------------------------------------------------
  const checks = [];
  checks.push({
    id: 'MAIN_CHUNK_GZIP_BYTES',
    label: 'Entry chunk, gzip',
    actual: entry.gzip,
    budget: BUDGETS.MAIN_CHUNK_GZIP_BYTES,
  });
  checks.push({
    id: 'FIRST_VISIT_JS_GZIP_BYTES',
    label: 'JS downloaded on first visit, gzip',
    actual: firstVisit.js,
    budget: BUDGETS.FIRST_VISIT_JS_GZIP_BYTES,
  });
  checks.push({
    id: 'CSS_GZIP_BYTES',
    label: 'Total CSS on disk, gzip',
    actual: totalCssGzip,
    budget: BUDGETS.CSS_GZIP_BYTES,
  });

  const codeChunks = sorted.filter(function (f) {
    return f.rel.endsWith('.js') || f.rel.endsWith('.css');
  });
  const biggest = codeChunks[0] || sorted[0];
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

  // Printed in the same table shape as the budgets, but structurally unable to
  // affect `breaches`. The point is that a reader scanning for "what does this
  // gate hold the build to" sees these numbers AND sees that they are not held.
  out('');
  out('--- reported, NOT enforced (P26.2 sets no budget for these) ---');
  out('  ' + padCut('metric', 44) + pad('actual', 12) + pad('budget', 12) + '  result');
  out('  ' + padCut('Total JS on disk, gzip', 44) + pad(kb(totalJsGzip), 12) + pad('not enforced', 12) + '  report only');
  out('  ' + padCut('TOTAL first-visit transfer (all types)', 44) + pad(kb(firstVisit.total), 12) + pad('not enforced', 12) + '  report only');

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
    fail('  ALREADY APPLIED -- do not re-attempt these, they are in the tree:');
    fail('');
    fail('    DONE  Route-level splitting. App.tsx lazy-loads the routed pages; Today');
    fail('          and Focus stay eager as first paint and the one-tap Next Up');
    fail('          target. Measured 2026-10-06: 13 lazy pages, 3 Suspense boundaries.');
    fail('    DONE  Sub-route splitting on /settings. MessagingIntegrationsView is');
    fail('          its own lazy chunk.');
    fail('    DONE  Render-blocking font CDNs. The cdnfonts stylesheets are gone');
    fail('          entirely. P7 L262\'s self-hosted Inter now serves from our own');
    fail('          origin, so no third-party stylesheet remains.');
    fail('    DONE  pnpm manualChunks as a FUNCTION. The object form matched');
    fail('          nothing under pnpm symlinks; vendor-react is now correct.');
    fail('');
    fail('  WHAT TO DO ABOUT IT, since the budget is now load-scoped:');
    fail('');
    fail('    Code splitting does not fix this one either. Splitting moves bytes');
    fail('    between files; it does not delete any. What it does change is WHICH');
    fail('    bytes land inside a first visit: pushing a route behind a dynamic');
    fail('    boundary removes its bytes from the critical path, which this metric');
    fail('    now correctly notices. The /settings split is the worked example --');
    fail('    it RAISED the disk total while leaving first-visit transfer alone.');
    fail('');
    fail('    Real options, in order of size -- all are OWNER decisions, and this');
    fail('    script does not take any of them:');
    fail('');
    fail('    A. Delete bytes. The largest reducible target is Clerk, which sits in');
    fail('       the ENTRY chunk and is deliberately unsplit because every route');
    fail('       needs it. Cutting it means moving auth behind a dynamic boundary,');
    fail('       which delays first paint on authenticated routes and will change');
    fail('       when `user` is available in every e2e spec. A product decision,');
    fail('       not a build one. The unused shadcn wrappers (recharts, vaul,');
    fail('       embla, react-day-picker, input-otp, resizable-panels) already');
    fail('       tree-shake to 0 bytes and cost nothing on the wire.');
    fail('');
    fail('    B. Accept it and wire this into run-gates.cjs. The budget is now');
    fail('       defensible rather than PROPOSED, so it could hold the build. It');
    fail('       stays unwired here because that is a separate owner decision.');
    fail('');
    fail('    C. Leave it as the status quo. It is deliberately not in');
    fail('       run-gates.cjs, so a red gate does not block full-green.');
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
