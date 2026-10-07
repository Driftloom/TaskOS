#!/usr/bin/env node
/**
 * Cadence design-token lint gate.
 *
 * docs/13-master-design-system-prompt.md P5.3:
 *   "Forbidden: arbitrary Tailwind values (bg-[#...], p-[13px], rounded-[7px]);
 *    hex/rgb in component files; inline style colors.
 *    Enforce with a lint rule or a CI grep — a failing check, not a guideline."
 *
 * This is that failing check. It exits 1 when a rule is violated.
 *
 * Design decisions:
 *  - `components/ui/**` WAS exempt as "vendored shadcn" until 2026-10-07. The
 *    exemption is removed: it hid a shipped, imported component (toast.tsx) whose
 *    destructive close button used raw Tailwind red values measuring 1.23:1 to
 *    3.12:1 against the fill behind them, i.e. a WCAG 1.4.3 / 1.4.11 failure that
 *    this gate reported green on for as long as it existed. The cost of scanning
 *    those 55 files was measured first (5 violations in 3 files) and fixed, not
 *    assumed. See walk().
 *  - Rules match raw lines, so comments are stripped before testing -- a comment
 *    naming a forbidden utility is documentation, not a violation.
 *  - A hex inside a CSS attribute selector is a selector, not an authored colour,
 *    so no-hex-in-component ignores it. See stripHexInAttributeSelectors().
 *  - Severity is per-rule. `errors` is the count that fails the build.
 *    Use --report to print everything without failing.
 *  - New code is expected to be clean. Legacy debt is baselined via
 *    docs/audit/.../token-lint-baseline.json and shrinks over time. That baseline
 *    is now 0 entries, verified with --no-baseline rather than assumed.
 *
 * Usage:
 *   node scripts/lint-tokens.cjs            # fail on any NEW offense
 *   node scripts/lint-tokens.cjs --report   # print all offenses, always exit 0
 *   node scripts/lint-tokens.cjs --no-baseline  # fail on ALL offenses
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts', 'cadence', 'src');
const BASELINE_FILE = path.join(
  ROOT, 'docs', 'audit', '2026-09-30-design-system-audit', 'token-lint-baseline.json',
);

const REPORT_ONLY = process.argv.includes('--report');
const NO_BASELINE = process.argv.includes('--no-baseline');
const WRITE_BASELINE = process.argv.includes('--write-baseline');

const RULES = [
  {
    id: 'no-hex-in-component',
    severity: 'error',
    spec: 'P5.3',
    why: 'hex in component files is forbidden; use a semantic token',
    // A hex inside a CSS attribute selector is a SELECTOR, not a colour we author:
    // `[&_rect[stroke='#ccc']]:stroke-border` matches an SVG attribute recharts
    // sets at runtime, and the colour we actually paint comes from the token in
    // the utility after the colon. Flagging these would force either a broken
    // selector or a hard-coded colour that defeats the design system -- both worse
    // than the pattern. Match hexes that are NOT preceded by `['`, `[stroke=`,
    // `stroke='` and friends on the same line.
    test: (line) => /#[0-9A-Fa-f]{3,8}\b/.test(stripHexInAttributeSelectors(line)),
  },
  {
    id: 'no-raw-rgb-in-component',
    severity: 'error',
    spec: 'P5.3',
    why: 'raw rgb()/rgba() in component files; use a semantic token',
    test: (line) => /\brgba?\(\s*\d/.test(line),
  },
  {
    id: 'no-arbitrary-color-value',
    severity: 'error',
    spec: 'P5.3',
    why: 'arbitrary Tailwind color value; use a token utility',
    test: (line) => /\b(?:bg|text|border|ring|fill|stroke|from|to|via|shadow|outline|divide|caret|decoration)-\[#[0-9A-Fa-f]{3,8}\]/.test(line),
  },
  {
    id: 'no-off-system-tailwind-palette',
    severity: 'error',
    spec: 'P6.3',
    why: 'off-system palette color; semantic colors may not be repurposed (P6.3 semantic exclusivity)',
    test: (line) =>
      /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide)-(?:emerald|green|red|orange|amber|yellow|indigo|violet|purple|blue|sky|cyan|teal|rose|pink|lime|fuchsia)-[0-9]{2,3}\b/.test(line),
  },
  {
    id: 'no-sub-12px-text',
    severity: 'error',
    spec: 'P7',
    why: 'P7 type.caption (12px) is the floor; P8.4 repeats it for density',
    test: (line) => /\btext-\[(?:[0-9]|1[01])px\]/.test(line),
  },
  {
    id: 'no-arbitrary-font-size',
    severity: 'warn',
    spec: 'P5.3',
    why: 'arbitrary font-size; use the P7 type scale (text-caption ... text-timer)',
    test: (line) => /\btext-\[(?!.*(?:var\(--cell-size\)|--cell-size))[\d.]+(?:px|rem|em)\]/.test(line),
  },
  {
    id: 'no-unwrapped-css-var',
    severity: 'error',
    spec: 'Tailwind v4',
    why: 'Tailwind v4 removed the -[--var] shorthand; this emits invalid CSS that the browser discards',
    test: (line) => /-\[--[a-zA-Z0-9_-]+\]/.test(line),
  },
  {
    id: 'no-undersized-tap-target',
    severity: 'warn',
    spec: 'P8.1',
    why: '44x44px minimum tap target; add .tap-target-expand if the visual box must stay small',
    test: (line) => /<button|<a\s|<Link\s/.test(line) && /\b(?:size|h|w|min-h|min-w)-(?:[1-9]|10)\b/.test(line),
  },

// ---------------------------------------------------------------------------
  // Scale-adoption rules. Added 2026-10-07, recalibrated the same day.
  //
  // These exist because of a measured blind spot: the pipeline gate proved the
  // PALETTE was clean while the app reached for raw Tailwind utilities instead of
  // the scales the design system defines.
  //
  // Measured on the BUILT CSS (dist/assets/index-*.css), not by grepping source,
  // because source greps were what made the first version of these descriptions
  // wrong. What each rule actually costs:
  //
  //   font-size  681 hits. NOT a wrong-size problem. text-xs and text-caption both
  //              compile to 0.75rem; text-sm and text-footnote both to 0.8125rem.
  //              The real cost is that the raw utilities drop the token's
  //              tracking, weight and line-height, so those runs render at
  //              Tailwind's defaults instead of the P7 scale's. This is polish and
  //              central retunability, NOT a legibility or correctness defect.
  //
  //   spacing   1086 hits. NOT cosmetic either: Tailwind v4 inlines these to
  //              literals (`.p-3{padding:.75rem}`), so a raw p-3 does NOT read
  //              --spacing-3 and the emitted P8 scale cannot retune it. Real
  //              coupling gap, invisible at runtime until someone edits the scale.
  //
  //   duration    19 hits. Genuinely unused scale: the 5 P10 duration tokens and 3
  //              easing tokens had zero consumers before 2026-10-07.
  //
  // All three stay severity `warn` on purpose. Promoting before the migration lands
  // would turn a green pipeline red and train people to reach for --no-baseline,
  // which is exactly how the previous 101-entry baseline became meaningless. They
  // are promoted to `error` only at zero, where they become the regression guard.
  // ---------------------------------------------------------------------------
  {
    id: 'no-raw-tailwind-font-size',
    severity: 'warn',
    spec: 'P7',
    why:
      'raw Tailwind font-size drops the P7 scale tracking/weight/line-height. ' +
      'Sizes coincide (text-xs = caption 0.75rem), so this is polish + central ' +
      'retunability, NOT a wrong-size bug. Use text-caption / text-footnote / ' +
      'text-body / text-headline / text-title* / text-timer.',
    // Must not fire on the P7 scale itself (text-caption etc.) or on text- inside a
    // variant/arbitrary context such as `text-[13px]` (owned by the rule above).
    test: (line) =>
      /(?<![\w-])text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)(?![\w-])/.test(line),
  },
  {
    id: 'no-raw-tailwind-spacing',
    severity: 'warn',
    spec: 'P8',
    why:
      'raw Tailwind spacing does NOT read the emitted --spacing-* scale: Tailwind v4 ' +
      'inlines it to a literal (`.p-3{padding:.75rem}`), so editing global.space.* ' +
      'cannot move it. Adopt via the scale once the migration runs.',
    // Only a representative sample, to keep the warn count legible rather than
    // emitting one hit per line. p-3 / gap-4 / px-6 style utilities only.
    test: (line) => /(?<![\w-])(?:p|px|py|pt|pb|pl|pr|gap|gap-x|gap-y)-(?:1|2|3|4|5|6|8|10|12|16)(?![\w-])/.test(line),
  },
  {
    id: 'no-raw-tailwind-duration',
    severity: 'warn',
    spec: 'P10',
    why:
      'the P10 motion scale had zero consumers before 2026-10-07. Use ' +
      'duration-instant / fast / base / slow / deliberate, and ease-standard / ' +
      'decelerate / accelerate.',
    test: (line) => /(?<![\w-])duration-(?:0|75|100|150|200|300|500|700|1000)(?![\w-])/.test(line),
  },
];

/**
 * Remove comment content from a source line so rules cannot match prose.
 *
 * Deliberately conservative, because the cost of being wrong is asymmetric:
 *   - FALSE NEGATIVE (a real violation hidden): a violation written entirely
 *     inside a comment is not a violation at all, so there is nothing to hide.
 *   - FALSE POSITIVE (code wrongly blanked): a real violation goes unreported.
 * So this strips aggressively for whole-line comments and block comments, and
 * only strips a trailing `//` when the line has no quote character before it --
 * which is what keeps `https://...` inside a string intact.
 */
function stripComments(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  // Trailing line comment: only if the // is not preceded by a quote on this
  // line (covers import specifiers and URLs).
  const slash = line.indexOf('//');
  if (slash === -1) return line;
  const before = line.slice(0, slash);
  if (before.includes('"') || before.includes("'") || before.includes('`')) return line;
  return before;
}

/**
 * Blank out hex literals that sit inside a CSS attribute selector.
 *
 * `[&_.recharts-grid_line[stroke='#ccc']]:stroke-border` contains `#ccc` only to
 * MATCH a DOM attribute; the colour actually painted is `stroke-border`. Keeping
 * the pattern is correct and keeping the hex is unavoidable, so the hex is not a
 * design-system violation. Returns the line with those occurrences replaced by
 * spaces so offsets and any later matching stay stable.
 */
function stripHexInAttributeSelectors(line) {
  return line.replace(/\[([^\]]*#[0-9A-Fa-f]{3,8}[^\]]*)\]/g, (m) => m.replace(/#[0-9A-Fa-f]{3,8}\b/g, ''));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // `components/ui/**` was exempt until 2026-10-07 as "vendored shadcn". That
      // exemption is REMOVED, and the reason is concrete: it hid a shipped,
      // imported component (toast.tsx) whose destructive close button used raw
      // Tailwind red ramp values measuring 1.23:1-3.12:1 against the fill they
      // sat on -- an accessibility failure (WCAG 1.4.3 and 1.4.11) that the gate
      // reported green on for as long as it existed.
      //
      // "Vendored" was also never accurate for this tree: 13 of the 55 files are
      // imported and shipped, and they had been edited. The cost of scanning them
      // was measured before removing the exemption, not assumed: 5 violations in
      // 3 files, all fixed (see calendar.tsx / form.tsx / chart.tsx). The `ui`
      // directory is now scanned like any other source.
      if (e.name === 'generated') continue; // generated clients (Orval) are exempt
      out.push(...walk(p));
    } else if (/\.(tsx|ts)$/.test(e.name)) {
      // GENERATED FILES ARE EXEMPT. This rule set targets hand-written source
      // only. Linting generator output is meaningless and actively wrong here:
      // styles/tokens.generated.ts is the canonical materialization of
      // tokens/tokens.json, so its hex literals ARE the design tokens. Flagging
      // them would demand we delete the design system. The file was previously
      // invisible to this scanner only because it was syntactically invalid
      // (a broken header comment), which is not a property worth relying on.
      if (/\.generated\.(ts|tsx)$/.test(e.name)) continue;
      out.push(p);
    }
  }
  return out;
}

const files = walk(SRC);
const offenses = [];

for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    // Rules are regexes over raw lines, so they cannot tell code from prose: a
    // comment that NAMES a forbidden utility (which is exactly what you want when
    // documenting a migration or a measured violation) would otherwise be
    // reported as a violation. Strip comments before testing, and only for the
    // line-comment and block-comment forms that appear in .tsx/.ts source.
    const code = stripComments(line);
    for (const rule of RULES) {
      if (rule.test(code)) {
        offenses.push({
          rule: rule.id,
          severity: rule.severity,
          spec: rule.spec,
          file: rel,
          line: i + 1,
          why: rule.why,
          excerpt: line.trim().slice(0, 90),
        });
      }
    }
  });
}

// --- baseline: suppress known legacy debt, fail only on NEW offenses ---------
// Baseline keys intentionally EXCLUDE the line number. Inserting an import or a
// few lines of JSX shifts every line below it, and a line-numbered baseline would
// then report a large file's entire pre-existing debt as "new" after any edit.
// Instead we key on rule + file + excerpt and compare COUNTS (multiset), so a
// file can legitimately have N instances of the same violation baselined, and
// adding an N+1th instance of that exact text still fails.
let baseline = {};
if (!NO_BASELINE && fs.existsSync(BASELINE_FILE)) {
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  } catch {
    console.error('warning: baseline file unreadable, treating as empty');
  }
}
function baselineKey(o) {
  return `${o.rule}|${o.file}|${o.excerpt}`;
}
const remaining = new Map();
for (const k of baseline.entries || []) {
  remaining.set(k, (remaining.get(k) || 0) + 1);
}
const fresh = [];
const freshSet = new Set();
for (const o of offenses) {
  const k = baselineKey(o);
  const left = remaining.get(k) || 0;
  if (left > 0) remaining.set(k, left - 1);
  else { fresh.push(o); freshSet.add(o); }
}
const errors = fresh.filter((o) => o.severity === 'error');
const warns = fresh.filter((o) => o.severity === 'warn');

// --- report -----------------------------------------------------------------
const byRule = {};
for (const o of offenses) {
  byRule[o.rule] = byRule[o.rule] || { total: 0, fresh: 0, severity: o.severity, spec: o.spec, why: o.why };
  byRule[o.rule].total++;
  if (freshSet.has(o)) byRule[o.rule].fresh++;
}

console.log('\nCadence token lint -- P5.3 enforcement gate');
console.log('='.repeat(72));
// Report real coverage. This gate used to print "scanned 92 source files
// (components/ui/** exempt)", which reads like full coverage at a glance while
// quietly skipping 55 files -- 13 of them imported and shipped. A gate that
// hides its own blind spot is worse than no gate, so the header now states
// scanned / total and names the only remaining exemption.
function countSourceFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'generated') continue;
      n += countSourceFiles(p);
    } else if (/\.(tsx|ts)$/.test(e.name) && !/\.generated\.(ts|tsx)$/.test(e.name)) {
      n++;
    }
  }
  return n;
}
const totalSource = countSourceFiles(SRC);
const skipped = totalSource - files.length;
console.log(
  `scanned ${files.length}/${totalSource} source files` +
    (skipped > 0 ? `  (${skipped} skipped: *.generated.* only)` : '  (full coverage)'),
);
console.log('');
console.log(`${'rule'.padEnd(34)} ${'sev'.padEnd(6)} ${'total'.padStart(6)} ${'new'.padStart(5)}  spec`);
console.log('-'.repeat(72));
for (const [id, s] of Object.entries(byRule)) {
  console.log(`${id.padEnd(34)} ${s.severity.padEnd(6)} ${String(s.total).padStart(6)} ${String(s.fresh).padStart(5)}  ${s.spec}`);
}
console.log('-'.repeat(72));

if (fresh.length) {
  console.log(`\nNEW violations (${fresh.length}):`);
  for (const o of fresh.slice(0, 40)) {
    console.log(`  ${o.severity === 'error' ? 'ERROR' : 'warn '} ${o.file}:${o.line}  [${o.rule}]`);
    console.log(`         ${o.excerpt}`);
  }
  if (fresh.length > 40) console.log(`  ... and ${fresh.length - 40} more`);
}

console.log('');
console.log(`legacy baselined: ${offenses.length - fresh.length}   new: ${fresh.length}   errors: ${errors.length}   warns: ${warns.length}`);

// Separate the two audiences explicitly. `warn` here is ADVISORY DEBT, not a
// gate failure, and the two were previously indistinguishable in the output --
// which is how a 1786-item advisory backlog could sit next to "PASS" without
// anyone noticing it was unbounded. Errors block; warns are a tracked migration
// backlog that must trend to zero before promotion.
const ADVISORY = ['no-raw-tailwind-font-size', 'no-raw-tailwind-spacing', 'no-raw-tailwind-duration'];
const advisoryFresh = fresh.filter((o) => ADVISORY.includes(o.rule));
const blockingFresh = fresh.filter((o) => !ADVISORY.includes(o.rule));
if (advisoryFresh.length) {
  const byAdv = {};
  for (const o of advisoryFresh) byAdv[o.rule] = (byAdv[o.rule] || 0) + 1;
  console.log('');
  console.log(`ADVISORY (non-blocking) scale-adoption backlog: ${advisoryFresh.length}`);
  for (const [id, n] of Object.entries(byAdv)) console.log(`  ${id.padEnd(30)} ${String(n).padStart(5)}`);
  const files = new Set(advisoryFresh.map((o) => o.file));
  console.log(`  spread across ${files.size} files -- must reach 0 before promotion to error`);
}
if (blockingFresh.length === 0 && advisoryFresh.length > 0) {
  console.log('');
  console.log('NOTE: gate PASSES. The items above are warn-severity and do not fail CI.');
}

if (WRITE_BASELINE) {
  const entries = offenses.map(baselineKey);
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify(
      {
        $comment:
          'Generated by: node scripts/lint-tokens.cjs --write-baseline\n' +
          'Known legacy design-token debt. The gate fails on any NEW violation.\n' +
          'Re-baseline only after deliberately fixing debt, never to silence a regression.',
        generatedAt: new Date().toISOString(),
        count: entries.length,
        entries: entries.sort(),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nbaseline written: ${path.relative(ROOT, BASELINE_FILE)} (${entries.length} entries)`);
  process.exit(0);
}

if (REPORT_ONLY) {
  console.log('\n(--report: not failing)');
  process.exit(0);
}

if (errors.length > 0) {
  console.error(`\nFAIL -- ${errors.length} new error-level violation(s). Fix, or run with --report to inspect.`);
  process.exit(1);
}
console.log('\nPASS -- no new error-level violations.');
