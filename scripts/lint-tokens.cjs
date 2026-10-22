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
 *   node scripts/lint-tokens.cjs --self-test   # prove every RULE fires on its
 *                                               # known-bad sample and is silent
 *                                               # on its known-good sample
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
const SELF_TEST_ONLY = process.argv.includes('--self-test');

/**
 * @typedef {Object} Rule
 * @property {string} id
 * @property {'error'|'warn'} severity
 * @property {string} spec
 * @property {string} why
 * @property {(line: string) => boolean} [test]  per-line matcher
 * @property {(code: string, rel: string) => Array<{line: number, excerpt: string}>} [testFile]
 *   whole-file matcher, for rules that cannot work on one line. A rule declares
 *   EITHER `test` OR `testFile`, never both: declaring both would report the
 *   same defect twice.
 */

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
    // NO word boundary, deliberately.
    //
    // Tailwind writes an arbitrary value with underscores, so the shape that
    // actually ships is:
    //     hover:shadow-[0_24px_50px_-12px_rgba(0,0,0,0.7)]
    // The character before `rgba(` is `_`, which IS a word character, so `\b`
    // can never match there and the rule matched 0 of the 4 live violations in
    // the tree. A rule that matches nothing is worse than no rule: it converts
    // "not enforced" into "verified", and this ladder reported green on all
    // four. The self-test below is what keeps that from happening again.
    test: (line) => /rgba?\(\s*\d/.test(line),
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
    why: 'off-system palette color; semantic colors may not be repurposed (P6.3 semantic exclusivity). The five neutral families were added 2026-10-07: P18.5 and P29.2 both recorded that this list omitted zinc|neutral|slate|stone|gray while the tree happened to contain zero uses of them, so the omission was a blind spot rather than a backlog. Prevention, not cleanup.',
    test: (line) =>
      /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide)-(?:emerald|green|red|orange|amber|yellow|indigo|violet|purple|blue|sky|cyan|teal|rose|pink|lime|fuchsia|zinc|neutral|slate|stone|gray)-[0-9]{2,3}\b/.test(line),
  },
  {
    id: 'no-sub-12px-text',
    severity: 'error',
    spec: 'P7',
    why: 'P7 type.caption (12px) is the floor; P8.4 repeats it for density',
    test: (line) => /\btext-\[(?:[0-9]|1[01])px\]/.test(line),
  },
  {
    id: 'no-nonadditive-safe-area-with-padding',
    severity: 'error',
    spec: 'P8.4',
    why:
      '.pt-safe / .pb-safe set `padding: env(...)` outright, so they REPLACE whatever padding the ' +
      'element already had. Paired with a padding utility the authored value is discarded: a footer ' +
      'carrying `py-3.5 pb-safe` collapses from 56px to the 34px notch inset on an iPhone. Use ' +
      '.safe-inset-* (additive, max()-floored) or an inline `calc(base + env(...))` instead.',
    // Token-based rather than a flat regex: `pt-safe-top` and `px-safe-x` start
    // with `pt-`/`px-`, so a naive /pt-\d/ style match reports them as padding and
    // flags correct code. An earlier draft did exactly that and produced two
    // false positives. Every safe-area token is removed before padding is
    // looked for, and a padding utility only counts when a digit follows the
    // dash, because padding steps are always numeric.
    test: (line) => {
      if (!/(?<![\w-])(?:pt|pb)-safe(?![\w-])/.test(line)) return false;
      const stripped = line
        .replace(/(?<![\w-])(?:p|px|py|pt|pb|pl|pr)-safe(?:-[\w-]+)?(?![\w-])/g, ' ')
        .replace(/(?<![\w-])safe-inset-[\w-]+(?![\w-])/g, ' ')
        .replace(/(?<![\w-])sheet-close-safe(?![\w-])/g, ' ');
      return /(?<![\w-])(?:p|px|py|pt|pb|pl|pr)-\[?[\d.]/.test(stripped);
    },
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
    severity: 'error',
    spec: 'P8.1',
    why: '44x44px minimum tap target; add .tap-target-expand if the visual box must stay small',
    // A per-line matcher CANNOT work here: in this codebase the `<button` tag
    // and its className are always on separate lines, so requiring them on one
    // line matched 0 of the 42 real violations while the ladder reported green
    // on every one of them. This rule therefore matches whole elements.
    //
    // PROMOTED from warn to error 2026-10-20, once the backlog reached zero --
    // the same promotion path no-arbitrary-spacing-or-radius took (see the
    // note above that rule). It is a regression guard now: a new `size-6`
    // button fails CI.
    testFile: (code, rel) => findUndersizedButtons(code, rel),
  },
  {
    // P5.3 forbids arbitrary px spacing and radius. The canonical spec's own
    // anti-pattern table admits this gap in as many words: "Arbitrary `px`
    // spacing/radius | -- | **no rule exists**; P5.3 forbids it, nothing checks
    // it". This is that rule, so the spec no longer under-describes itself.
    //
    // warn, not error, because the measured backlog is 64 usages across ~30
    // files and promoting now would turn the ladder red for existing, working
    // code -- the exact failure mode that taught people to use --no-baseline
    // earlier in this project's history. It reports honestly and trends to zero.
    id: 'no-arbitrary-spacing-or-radius',
    // PROMOTED to error 2026-10-07 once it reached zero -- but only after the
    // first migration attempt was reverted. That attempt renamed literals to
    // `min-h-size-control-md` style classes, assuming Tailwind would resolve
    // them from the --size namespace. It does NOT: `min-h-*`/`max-w-*`/`min-w-*`
    // resolve from --spacing only, so all six classes emitted zero rules and the
    // markup carried dead classes that silently dropped min-height to auto.
    // Verified in the built CSS, then reverted.
    //
    // It reached a TRUE zero only via `@utility` rules in index.css reading the
    // runtime-visible token variables (the same pattern as .row-density), which
    // were checked one at a time and confirmed to emit real CSS before migrating
    // anything. Single-use literals stay unreported: a literal used once is a
    // local decision, not a scale bypass.
    severity: 'error',
    spec: 'P5.3',
    why:
      'arbitrary px/rem spacing or radius bypasses the P8 scale (--spacing-*, ' +
      '--radius-*). Prefer the scale utility; where a value is genuinely bespoke ' +
      '(a 212px calendar grid cell), express it once as a component-level token ' +
      'rather than repeating a magic number inline.',
    // Excludes values <= 2px. A 1-2px value is a HAIRLINE, not a spacing step:
    // `p-[1px]` in shadcn's scroll-area is a border-width inset trick, and
    // `h-[1px]` / `w-[2px]` are dividers. The design system governs those through
    // border tokens, so flagging them under P5.3 "spacing" would be categorising
    // the wrong thing. Spacing scale steps are never this small -- the smallest
    // global.space step is 0 (and 0.25rem above it).
    test: (line) => {
      const re = /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|w|h|min-w|min-h|max-w|max-h|rounded)-\[(?!.*(?:var\(--|calc\(var\(--))([\d.]+)(px|rem|em)\]/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const n = parseFloat(m[1]);
        const hairline = n <= 2;
        if (!hairline) return true;
      }
      return false;
    },
  },

// ---------------------------------------------------------------------------
  // Scale-adoption rules. Added 2026-10-07, recalibrated twice, PROMOTED to error
  // the same day once they reached zero.
  //
  // These exist because of a measured blind spot: the pipeline gate proved the
  // PALETTE was clean while the app reached for raw Tailwind utilities instead of
  // the scales the design system defines.
  //
  // Everything below was verified against the BUILT CSS, because source greps and
  // plausible reasoning got this wrong twice:
  //
  //   font-size  681 hits at introduction. Migrated to 0 by extending the P7 scale
  //              with micro/macro/display1-4 at EXACTLY the values the Tailwind
  //              utilities already rendered, so 695 migrations were pure renames
  //              with zero rendered change.
  //
  //   spacing    A rule existed here claiming 1085 offenses. It was WRONG and was
  //              deleted. Probe: global.space."3" 0.75rem -> 0.83rem moved the
  //              compiled `.p-3` from `.75rem` to `.83rem`. Raw spacing IS
  //              token-coupled; `@theme inline` substitutes the value at build
  //              time, so the "literal" IS the token. See the deleted rule.
  //
  //   duration   19 hits, genuinely coupled-less: `duration-200` compiled to
  //              `--tw-duration: .2s`, not to --duration-base. Migrated to 0 with
  //              a documented +/--20ms trade on three of four values.
  //
  // These were `warn` while the migration was in flight, and that was the point:
  // promoting early would have turned the ladder red and trained people to reach
  // for --no-baseline, which is how the previous 101-entry baseline became
  // meaningless. At zero they are promoted to `error`, where their whole job is
  // to stop a regression -- a new `text-sm` or `duration-200` now fails CI.
  // ---------------------------------------------------------------------------
  {
    id: 'no-raw-tailwind-font-size',
    severity: 'error',
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
  // no-raw-tailwind-spacing: DELETED 2026-10-07, after being disproved.
  //
  // This rule reported 1085 offenses and claimed:
  //   "raw Tailwind spacing does NOT read the emitted --spacing-* scale:
  //    Tailwind v4 inlines it to a literal, so editing global.space.*
  //    cannot move it."
  //
  // That claim is FALSE, and it was falsified by experiment rather than argument.
  // Changing global.space."3" from 0.75rem to 0.83rem and rebuilding moved the
  // compiled utility from `.p-3{padding:.75rem}` to `.p-3{padding:.83rem}`.
  // The literal IS the token's value: `@theme inline` substitutes the value at
  // build time, so `p-3`, `gap-4` and `px-6` are token-coupled exactly as
  // intended. The rule was flagging 1085 usages that are already correct.
  //
  // A gate that fails correct code is worse than no gate: it is noise that
  // trains people to ignore output and reach for --no-baseline. Removed.
  //
  // Genuine (but tiny) related case, deliberately NOT re-added as a rule:
  // spacing steps that do not exist in global.space at all -- p-7, gap-7, px-7,
  // pl-7, mt-9, pr-11, pr-20, pt-20, pl-60 -- fall back to
  // `calc(var(--spacing) * N)` against Tailwind's own base, so they are not
  // token-coupled. That is 9 classes / 11 usages, and they are bespoke structural
  // offsets (pl-60 is 240px of sidebar compensation, not a spacing step), so
  // flagging them would argue with intent rather than enforce a scale.

  {
    id: 'no-raw-tailwind-duration',
    severity: 'error',
    spec: 'P10',
    why:
      'the P10 motion scale had zero consumers before 2026-10-07. Use ' +
      'duration-instant / fast / base / slow / deliberate (resolved via @utility ' +
      'to --duration-*), and ease-standard / decelerate / accelerate. ' +
      'Raw duration-200 compiles to `--tw-duration: .2s`, NOT to --duration-base, ' +
      'so these do not read the token scale.',
    test: (line) => /(?<![\w-])duration-(?:0|75|100|150|200|300|500|700|1000)(?![\w-])/.test(line),
  },
];

/**
 * Known-bad / known-good samples for every rule.
 *
 * A lint rule that matches nothing is worse than no rule: it converts "not
 * enforced" into "verified" and the ladder reports green on a defect. This
 * file has already shipped two vacuous rules (no-raw-rgb-in-component's word
 * boundary, no-undersized-tap-target's same-line requirement), and two rules
 * that over-reported (1085 and 56 false offenses). Each rule therefore needs
 * a sample it MUST catch and a sample it MUST NOT catch.
 *
 * BAD  - must be reported by the rule.
 * GOOD - must NOT be reported by the rule (guards against over-reporting).
 *
 * `bad` and `good` accept a string or an array of strings; EVERY entry must
 * behave as stated. A rule with no GOOD sample is a rule nobody has checked
 * for over-reporting, which is precisely how the 1085-offense rule shipped.
 *
 * `pending: true` marks an entry whose rule is known-broken and is being
 * repaired in the same branch. The self-test reports it as SKIPPED so the
 * ladder can stay green between the two commits, and it PRINTS the pending
 * rule id so it cannot be quietly forgotten.
 */
const SELF_TEST = [
  {
    rule: 'no-hex-in-component',
    // NOTE: the BAD sample is deliberately NOT `text-[#ff0000]`. Bracketed
    // values are blanked by stripHexInAttributeSelectors() (a hex inside `[...]`
    // is treated as an attribute-selector match, not an authored colour), so
    // that string is caught by no-arbitrary-color-value instead and would tell
    // us nothing about THIS rule.
    bad: ["style={{ color: '#ff0000' }}", "const BRAND_HEX = '#34C759';"],
    good: [
      'className="text-destructive"',
      // The documented attribute-selector exemption: a hex that only MATCHES a
      // runtime SVG attribute, with the painted colour coming from the token
      // after the colon.
      "[&_.recharts-grid_line[stroke='#ccc']]:stroke-border",
    ],
  },
  {
    rule: 'no-raw-rgb-in-component',
    // The live violation that proved the rule vacuous. `_` before `rgba(` is a
    // word character, so the old `\b` could never match it.
    bad: ['className="shadow-[0_24px_50px_-12px_rgba(0,0,0,0.7)]"'],
    good: ['className="shadow-e3"', "const glass = 'hsl(var(--card) / 0.82)';"],
  },
  {
    rule: 'no-arbitrary-color-value',
    bad: ['className="bg-[#123456]"'],
    good: ['className="bg-primary"'],
  },
  {
    rule: 'no-off-system-tailwind-palette',
    bad: ['className="text-gray-500"'],
    good: ['className="text-muted-foreground"'],
  },
  {
    rule: 'no-sub-12px-text',
    bad: ['className="text-[10px]"'],
    good: ['className="text-caption"'],
  },
  {
    rule: 'no-nonadditive-safe-area-with-padding',
    // The second BAD is the same axis: `pt-safe` REPLACES the padding, so
    // `pt-safe pt-4` silently drops the authored 4.
    bad: ['className="py-3.5 pb-safe"', 'className="pt-safe pt-4"'],
    good: ['className="pb-safe-content"', 'className="pt-safe"'],
  },
  {
    rule: 'no-arbitrary-font-size',
    bad: ['className="text-[13px]"'],
    good: ['className="text-body"', 'className="text-[var(--cell-size)]"'],
  },
  {
    rule: 'no-unwrapped-css-var',
    bad: ['className="bg-[--brand]"'],
    good: ['className="bg-brand"'],
  },
  {
    rule: 'no-undersized-tap-target',
    // The BAD sample spans several lines on purpose: that is the exact case
    // the old per-line matcher missed, because it required the `<button` tag
    // and the size class on the SAME physical line. `expectLine` pins the
    // reported line to the `<button` tag, so a rule that fired on the wrong
    // line would fail too.
    bad: [
      sampleJsxButton('size-6'),
      // Tailwind v4's important modifier is a SUFFIX. A `size-6!` that the
      // rule cannot parse is a size it cannot see, so the button would be
      // missed entirely.
      sampleJsxButton('size-6!'),
    ],
    expectLine: 3,
    good: [
      // The documented escape hatch: the visual box stays 24px, the hit area
      // grows to 44px.
      sampleJsxButton('size-6 tap-target-expand'),
      sampleJsxButton('min-h-11'),
      // A `min-*` floor plus an exact size on the SAME axis: CSS uses the
      // LARGER, so this renders 44px tall. A rule that reports the `min-h-9`
      // here is reporting a 44px button.
      sampleJsxButton('min-h-9 h-11'),
      // The same, with the v4 important suffix on the class that decides the
      // axis. If the suffix is not parsed, `h-11` is invisible and the axis
      // falls back to the 36px floor.
      sampleJsxButton('min-h-9 h-11!'),
    ],
  },
  {
    rule: 'no-arbitrary-spacing-or-radius',
    bad: ['className="w-[212px]"'],
    // A 1-2px value is a HAIRLINE (a divider), not a spacing step.
    good: ['className="w-[2px]"', 'className="w-[calc(var(--x))]"'],
  },
  {
    rule: 'no-raw-tailwind-font-size',
    bad: ['className="text-sm"'],
    good: ['className="text-caption"'],
  },
  {
    rule: 'no-raw-tailwind-duration',
    bad: ['className="duration-200"'],
    good: ['className="duration-base"'],
  },
];

/**
 * A multi-line JSX button, the shape this codebase actually writes.
 *
 * The old tap-target rule required the `<button` tag and the size class on the
 * same physical line, so every realistic sample had to be built this way to
 * expose the gap. A single-line sample would have passed the broken rule and
 * hidden it.
 */
function sampleJsxButton(className) {
  return [
    'export function Example() {',
    '  return (',
    '    <button',
    '      type="button"',
    `      className="${className}"`,
    '      aria-label="Example"',
    '    >',
    '      <Icon size={12} />',
    '    </button>',
    '  );',
    '}',
  ].join('\n');
}

/** The synthetic path a file-level rule is handed during the self-test. */
const SELF_TEST_REL = 'artifacts/cadence/src/components/SelfTestFixture.tsx';

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Run every rule against its known-bad and known-good samples.
 *
 * This validates the RULES, not the code: it never touches the source tree,
 * so it can run in a clean checkout and it fails for exactly one reason - a
 * rule that no longer behaves as specified.
 */
function runSelfTest() {
  const rows = [];
  let failures = 0;
  let skipped = 0;

  for (const entry of SELF_TEST) {
    const rule = RULES.find((r) => r.id === entry.rule);
    if (!rule) {
      rows.push({ rule: entry.rule, bad: '-', good: '-', verdict: 'FAIL (no such rule)' });
      failures++;
      continue;
    }
    if (entry.pending) {
      rows.push({ rule: entry.rule, bad: '-', good: '-', verdict: 'SKIPPED (pending)' });
      skipped++;
      continue;
    }
    if (rule.test && rule.testFile) {
      rows.push({
        rule: entry.rule,
        bad: '-',
        good: '-',
        verdict: 'FAIL (declares both test and testFile)',
      });
      failures++;
      continue;
    }

    const isFileRule = typeof rule.testFile === 'function';
    // The engine hands a file-level rule the comment-stripped source, so the
    // self-test does too: otherwise the harness would test a different
    // contract than the one the ladder enforces.
    const hitsFor = (sample) => {
      if (isFileRule) return rule.testFile(stripAllComments(sample), SELF_TEST_REL);
      return [];
    };
    const fires = (sample) => {
      if (isFileRule) return hitsFor(sample).length > 0;
      return sample.split(/\r?\n/).some((line) => rule.test(line));
    };

    const bads = toArray(entry.bad);
    const goods = toArray(entry.good);
    const badFired = bads.length > 0 && bads.every(fires);
    // A rule with NO known-good sample has never been checked for
    // over-reporting, which is how the 1085-offense rule shipped. It is a
    // failure of its own, and it is reported as its own failure: claiming it
    // "fires on GOOD" would point a maintainer at a false positive that does
    // not exist.
    const hasGood = goods.length > 0;
    const goodSilent = hasGood && goods.every((s) => !fires(s));

    // A file-level rule must also report the element on the RIGHT line. A rule
    // that fires but mis-attributes the hit sends a maintainer to the wrong
    // place, which is the same class of defect as a rule that never fires.
    let lineOk = true;
    if (isFileRule && entry.expectLine !== undefined && badFired) {
      lineOk = bads.some((s) => hitsFor(s).some((h) => h.line === entry.expectLine));
    }

    let verdict = 'PASS';
    if (!badFired) {
      verdict = 'FAIL (silent on BAD)';
    } else if (!hasGood) {
      verdict = 'FAIL (no GOOD sample)';
    } else if (!goodSilent) {
      verdict = 'FAIL (fires on GOOD)';
    } else if (!lineOk) {
      verdict = 'FAIL (wrong line)';
    }
    if (verdict !== 'PASS') failures++;
    rows.push({
      rule: entry.rule,
      bad: badFired ? 'fires' : 'SILENT',
      good: hasGood ? (goodSilent ? 'silent' : 'FIRES') : 'NONE',
      verdict,
    });
  }

  // Every rule must have a sample. A rule added to RULES without a self-test
  // entry would silently escape the harness, which is the failure this whole
  // mechanism exists to prevent.
  const covered = new Set(SELF_TEST.map((e) => e.rule));
  const uncovered = RULES.filter((r) => !covered.has(r.id)).map((r) => r.id);
  if (uncovered.length) {
    failures++;
    rows.push({
      rule: '(uncovered)',
      bad: '-',
      good: '-',
      verdict: 'FAIL (no self-test: ' + uncovered.join(', ') + ')',
    });
  }

  console.log('');
  console.log('Cadence token lint -- rule self-test');
  console.log('='.repeat(72));
  console.log('Every rule must FIRE on its known-bad sample and be SILENT on its');
  console.log('known-good sample. This validates the rules, not the source tree.');
  console.log('');
  console.log(`${'rule'.padEnd(34)} ${'BAD'.padEnd(9)} ${'GOOD'.padEnd(9)} verdict`);
  console.log('-'.repeat(72));
  for (const r of rows) {
    console.log(`${r.rule.padEnd(34)} ${r.bad.padEnd(9)} ${r.good.padEnd(9)} ${r.verdict}`);
  }
  console.log('-'.repeat(72));
  console.log(
    `${rows.length} rule(s): ${rows.length - failures - skipped} PASS, ${failures} FAIL, ${skipped} SKIPPED`,
  );
  if (skipped) {
    console.log('PENDING (known-broken, being repaired):');
    for (const r of rows) if (r.verdict.indexOf('SKIPPED') === 0) console.log('  ' + r.rule);
  }

  if (failures) {
    console.error('');
    console.error(`SELF-TEST FAIL -- ${failures} rule(s) did not behave as specified.`);
    for (const entry of SELF_TEST) {
      const row = rows.find((r) => r.rule === entry.rule);
      if (!row || row.verdict === 'PASS' || row.verdict.indexOf('SKIPPED') === 0) continue;
      console.error(`  rule: ${entry.rule}  (${row.verdict})`);
      if (row.verdict.indexOf('silent on BAD') !== -1) {
        for (const s of toArray(entry.bad)) console.error(`    BAD sample not reported: ${s.split('\n')[0]}`);
      }
      if (row.verdict.indexOf('no GOOD sample') !== -1) {
        console.error('    no known-good sample: this rule is UNCHECKED for over-reporting.');
        console.error('    A rule with no GOOD sample has never been tested against a false positive.');
      }
      if (row.verdict.indexOf('fires on GOOD') !== -1) {
        for (const s of toArray(entry.good)) console.error(`    GOOD sample reported: ${s.split('\n')[0]}`);
      }
    }
    process.exit(1);
  }
  console.log('');
  console.log('SELF-TEST PASS -- every rule fires on its known-bad sample and is silent on its known-good sample.');
  process.exit(0);
}

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
 * Create a comment stripper that carries block-comment state ACROSS lines.
 *
 * `stripComments` on its own is stateless per line: it blanks a line that OPENS
 * a block comment, but keeps no memory that the comment is still open on the
 * next line. Every line after the first therefore leaks its prose, and prose
 * that names a utility is indistinguishable from code to a regex.
 *
 * This was not hypothetical, it shipped in the report:
 * `pages/calendar/CalendarPage.tsx` documents a past calendar fix in a
 * multi-line block comment reading "It was `min-h-[50px]` with `py-2`". That
 * value is used by NO live class -- the row now uses `min-h-14` -- yet the
 * single-use report listed `[50px]` as a real arbitrary value and told the
 * maintainer to go tokenise a literal that had already been deleted.
 *
 * A comment describing a migration is documentation. Counting it as a live
 * value sends someone to fix code that does not exist.
 *
 * Also improves two cases the old version got wrong in the other direction: a
 * block comment opened AND closed on one line now preserves code after the
 * comment instead of blanking the whole line, and a block comment that opens
 * mid-line no longer leaks.
 */
function makeCommentStripper() {
  let inBlock = false;
  return function strip(line) {
    let rest = line;
    if (inBlock) {
      const close = rest.indexOf('*/');
      if (close === -1) return '';
      inBlock = false;
      rest = rest.slice(close + 2);
    }
    const open = rest.indexOf('/*');
    if (open !== -1) {
      const close = rest.indexOf('*/', open + 2);
      if (close === -1) {
        inBlock = true;
        return rest.slice(0, open);
      }
      rest = rest.slice(0, open) + ' ' + rest.slice(close + 2);
    }
    return stripComments(rest);
  };
}

/**
 * Strip comments from a WHOLE file at once, reusing makeCommentStripper().
 *
 * A file-level rule needs the same view of the source the per-line rules get:
 * code with comments removed. Writing a second stripper for that would be two
 * implementations of one idea, and the two would drift -- which is how a
 * `<button>` inside a commented-out block ends up reported as a live element.
 *
 * Line count and line numbers are preserved exactly, so a file-level hit can
 * still be attributed to the line the offending tag sits on.
 */
function stripAllComments(code) {
  const strip = makeCommentStripper();
  return code
    .split(/\r?\n/)
    .map((line) => strip(line))
    .join('\n');
}

/**
 * The 44x44px tap-target floor (P8.1, locked decision D-29), in pixels.
 */
const TAP_TARGET_FLOOR_PX = 44;

/**
 * One Tailwind spacing step, in pixels: 1 step = 0.25rem = 4px at a 16px root.
 */
const TAILWIND_STEP_PX = 4;

/**
 * Utilities that already guarantee a 44px hit area, so an element carrying one
 * of them is not a violation no matter how small its visual box is.
 *
 *  - tap-target-expand  expands the hit area with a pseudo-element (index.css)
 *  - tap-target-44      forces min-height/min-width to 44px (index.css)
 *  - tap-target-h       forces the height to 44px (index.css)
 */
const TAP_TARGET_HELPERS = new Set(['tap-target-expand', 'tap-target-44', 'tap-target-h']);

/**
 * Elements that are not a tap target even when they carry a size class.
 *
 *  - sr-only        visually hidden, for screen readers only
 *  - hidden         display:none
 *  - absolute       positioned out of flow; its box is not the target the
 *                   layout gives the reader
 *  - aria-hidden    decorative, removed from the accessibility tree
 */
const NON_TARGET_CLASSES = new Set(['sr-only', 'hidden', 'absolute']);

/**
 * Find interactive elements whose DECLARED box is smaller than 44x44px.
 *
 * The rule is about a box a finger has to hit, so it works on whole elements
 * rather than on lines: a `<button>` and its `className` are on different
 * lines in every realistic JSX file, which is exactly why the old per-line
 * matcher matched nothing.
 *
 * Only a DECLARED size counts. A button with no size class is sized by its
 * content and padding, which this rule cannot measure and does not govern; it
 * is not "exempted", it is simply out of scope.
 */
function findUndersizedButtons(code, rel) {
  // Test fixtures are not shipped UI: a `size-6` button in a test double is
  // not a target a thumb can miss.
  if (/\.(test|spec)\.(tsx|ts)$/.test(rel)) return [];

  const hits = [];
  const tagRe = /<(button|a|Link)\b/g;
  let m;
  while ((m = tagRe.exec(code)) !== null) {
    const tagName = m[1];
    const tagStart = m.index;
    const tagEnd = findOpeningTagEnd(code, tagStart);
    if (tagEnd === -1) continue;
    const tagText = code.slice(tagStart, tagEnd + 1);

    // An anchor is only a target when it is a link.
    if (tagName !== 'button' && !/(?<![\w-])href\s*=/.test(tagText)) continue;

    const className = extractClassNames(tagText);
    if (!className) continue;
    const tokens = className.split(/\s+/).filter(Boolean).map(stripImportant);

    if (tokens.some((t) => TAP_TARGET_HELPERS.has(t))) continue;
    if (tokens.some((t) => NON_TARGET_CLASSES.has(t))) continue;
    if (/(?<![\w-])aria-hidden\s*=\s*(?:"true"|'true'|\{true\})/.test(tagText)) continue;

    const offenders = undersizedDimensions(tokens);
    if (!offenders.length) continue;

    const line = lineNumberAt(code, tagStart);
    const detail = offenders.map((o) => `${o.cls} = ${o.px}px ${o.axis}`).join(', ');
    hits.push({
      line,
      excerpt: `${tagName} class="${className.slice(0, 60)}" (${detail}; floor ${TAP_TARGET_FLOOR_PX}px)`.slice(
        0,
        120,
      ),
    });
  }
  return hits;
}

/**
 * The declared box dimensions, in pixels, that fall below the floor.
 *
 * `size-N` sets both axes; `h-N`/`min-h-N` set the height; `w-N`/`min-w-N` set
 * the width.
 *
 * The verdict is per AXIS, not per class. CSS uses the LARGER of an exact size
 * and a `min-*` floor, so `min-h-9 h-11` renders 44px tall and is NOT a
 * violation. Deciding per class reported the `min-h-9` and ignored the `h-11`
 * that raised the axis to 44px -- a false positive on an ordinary Tailwind
 * idiom (floor + exact), on a rule that is now `severity: 'error'` and is a CI
 * regression guard. Over-reporting is the failure mode this rule must not
 * have: this file has already shipped rules that claimed 1085 and 56 false
 * offenses.
 *
 * max() is a conservative approximation of the cascade: it can only
 * UNDER-report, never over-report, which is the safe direction for a gate.
 *
 * `min-h-0` / `min-w-0` are NOT floors. They are Tailwind's "allow this to
 * shrink" reset: a floor of zero constrains nothing, so the axis is left
 * undeclared rather than measured as 0px. Reading `min-w-0` as a 0px-wide
 * button reported a full-width flex row button as a tap-target defect.
 *
 * Variant-prefixed utilities (`md:size-6`, `hover:size-6`) are OUT OF SCOPE.
 * The rule measures the RESTING box, so an element needs a BASE size to be
 * measured at all: a button whose only size is `md:size-6` has an unmeasured
 * base (its box comes from its content) and a 24px box at >=768px, and is NOT
 * reported. That is a known scope limit, not an oversight.
 */
function undersizedDimensions(tokens) {
  const declared = [];
  let height = null;
  let width = null;

  const raise = (axis, cls, px) => {
    declared.push({ cls, px, axes: [axis] });
    if (axis === 'height') height = height === null ? px : Math.max(height, px);
    else width = width === null ? px : Math.max(width, px);
  };

  for (const token of tokens) {
    let match;
    if ((match = /^size-(\d+)$/.exec(token))) {
      const px = Number(match[1]) * TAILWIND_STEP_PX;
      declared.push({ cls: token, px, axes: ['height', 'width'] });
      height = height === null ? px : Math.max(height, px);
      width = width === null ? px : Math.max(width, px);
    } else if ((match = /^min-h-(\d+)$/.exec(token))) {
      const n = Number(match[1]);
      if (n === 0) continue; // a floor of zero is not a floor
      raise('height', token, n * TAILWIND_STEP_PX);
    } else if ((match = /^h-(\d+)$/.exec(token))) {
      raise('height', token, Number(match[1]) * TAILWIND_STEP_PX);
    } else if ((match = /^min-w-(\d+)$/.exec(token))) {
      const n = Number(match[1]);
      if (n === 0) continue; // a floor of zero is not a floor
      raise('width', token, n * TAILWIND_STEP_PX);
    } else if ((match = /^w-(\d+)$/.exec(token))) {
      raise('width', token, Number(match[1]) * TAILWIND_STEP_PX);
    }
  }

  // One verdict per axis, then the classes that constrain that axis.
  const heightBelow = height !== null && height < TAP_TARGET_FLOOR_PX;
  const widthBelow = width !== null && width < TAP_TARGET_FLOOR_PX;
  if (!heightBelow && !widthBelow) return [];

  const offenders = [];
  for (const d of declared) {
    const axes = d.axes.filter((a) => (a === 'height' ? heightBelow : widthBelow));
    if (!axes.length) continue;
    offenders.push({
      cls: d.cls,
      px: d.px,
      axis: axes.length === 2 ? 'both axes' : axes[0],
    });
  }
  return offenders;
}

/**
 * Find the `>` that closes an opening tag.
 *
 * A regex cannot do this: `onClick={() => ...}` contains a `>` that is not the
 * end of the tag, and a string attribute may contain one too. So the tag is
 * scanned, tracking quote state and brace depth.
 */
function findOpeningTagEnd(code, start) {
  let i = start + 1;
  let depth = 0;
  let quote = null;
  while (i < code.length) {
    const ch = code[i];
    if (quote) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      i++;
      continue;
    }
    if (ch === '{') {
      depth++;
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      i++;
      continue;
    }
    if (ch === '>' && depth === 0) return i;
    i++;
  }
  return -1;
}

/**
 * Read the `className` of an opening tag.
 *
 * Handles the three shapes this codebase writes:
 *   className="size-6 tap-target-expand"     (string literal)
 *   className={`size-6 ${extra}`}             (template literal)
 *   className={cn('size-6', cond && 'x')}     (expression container)
 *
 * For the expression form every string literal inside the braces is collected,
 * because that is where the size classes live.
 */
function extractClassNames(tagText) {
  const m = /(?<![\w-])className\s*=/.exec(tagText);
  if (!m) return null;
  const rest = tagText.slice(m.index + m[0].length).replace(/^\s+/, '');
  if (!rest) return null;

  if (rest[0] === '"' || rest[0] === "'" || rest[0] === '`') {
    return readQuoted(rest, 0).value;
  }
  if (rest[0] !== '{') return null;

  const parts = [];
  let depth = 0;
  let i = 0;
  while (i < rest.length) {
    const ch = rest[i];
    if (ch === '{') {
      depth++;
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      i++;
      if (depth === 0) break;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const read = readQuoted(rest, i);
      parts.push(read.value);
      i = read.next;
      continue;
    }
    i++;
  }
  return parts.join(' ');
}

/**
 * Read a quoted string starting at `start`; returns its value and the index
 * just past the closing quote.
 */
function readQuoted(text, start) {
  const quote = text[start];
  let i = start + 1;
  let value = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      value += text[i + 1] === undefined ? '' : text[i + 1];
      i += 2;
      continue;
    }
    if (ch === quote) {
      i++;
      break;
    }
    value += ch;
    i++;
  }
  return { value, next: i };
}

/**
 * Strip Tailwind's important modifier; it is not part of the utility name.
 *
 * v4 writes it as a SUFFIX (`size-6!`); v3 wrote it as a prefix (`!size-6`),
 * which v4 still accepts for compatibility. Both are stripped, because a
 * `size-6!` that is not recognised is a size the rule cannot see: it would
 * match none of the size branches and the button would be silently missed.
 */
function stripImportant(token) {
  let t = token;
  if (t.startsWith('!')) t = t.slice(1);
  if (t.endsWith('!')) t = t.slice(0, -1);
  return t;
}

/** The 1-based line number of a character offset. */
function lineNumberAt(code, index) {
  let line = 1;
  for (let i = 0; i < index && i < code.length; i++) {
    if (code[i] === '\n') line++;
  }
  return line;
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

// The self-test runs BEFORE the tree walk and exits on its own: it validates
// the RULES, so it must not depend on, or report on, the state of the source.
if (SELF_TEST_ONLY) {
  runSelfTest();
}

const files = walk(SRC);
const offenses = [];

for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const raw = fs.readFileSync(f, 'utf8');
  const lines = raw.split(/\r?\n/);
  // One stripper per FILE, not per line: block-comment state has to persist
  // across lines or the prose inside a multi-line comment leaks into matching.
  //
  // The SAME stripped source feeds the per-line rules and the whole-file
  // rules, so there is exactly one definition of "the code" in this gate. A
  // second stripper for the file-level pass would be a second implementation
  // of the same idea, and the two would drift.
  const fileText = stripAllComments(raw);
  const codeLines = fileText.split('\n');
  lines.forEach((line, i) => {
    // Rules are regexes over raw lines, so they cannot tell code from prose: a
    // comment that NAMES a forbidden utility (which is exactly what you want when
    // documenting a migration or a measured violation) would otherwise be
    // reported as a violation. Strip comments before testing, and only for the
    // line-comment and block-comment forms that appear in .tsx/.ts source.
    const code = codeLines[i];
    for (const rule of RULES) {
      if (!rule.test) continue;
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

  // Whole-file pass, for rules that cannot work on one line.
  //
  // The per-line loop above is the right shape for a regex over a source line,
  // and the WRONG shape for a rule about an ELEMENT: in this codebase the
  // `<button` tag and its className are always on separate lines, so a rule
  // that required them on one line matched 0 of the 42 real violations and
  // the ladder reported green on all of them. A rule that matches nothing is
  // worse than no rule, so rules that need whole-element context declare
  // `testFile` and are evaluated here, once per file.
  for (const rule of RULES) {
    if (!rule.testFile) continue;
    for (const hit of rule.testFile(fileText, rel)) {
      offenses.push({
        rule: rule.id,
        severity: rule.severity,
        spec: rule.spec,
        file: rel,
        line: hit.line,
        why: rule.why,
        excerpt: hit.excerpt,
      });
    }
  }
}

/**
 * Narrow `no-arbitrary-spacing-or-radius` to REPEATED arbitrary values.
 *
 * Why this exists: as written, the rule flagged all 56 arbitrary values, and the
 * first number was about to be reported as "56 items of debt". That count was
 * misleading. P5.3 exists because a magic number appearing EVERYWHERE means the
 * scale cannot be changed in one place. A literal that appears ONCE is not
 * bypassing a scale -- it is a local decision, and minting a token for it would be
 * ceremony: a token with one consumer, named after itself.
 *
 * So the real signal is repetition. Count every arbitrary value across the tree
 * and report only those appearing more than once. Single-use values are still
 * MIGRATED when an exact token exists (migrate-size-to-tokens.cjs), they are just
 * not reported as debt.
 *
 * This is the second time in this project a rule over-reported: after
 * no-raw-tailwind-spacing claimed 1085 false offenses. Both times the fix was to
 * measure what a rule actually catches rather than trust its count.
 */
function narrowRepeatedArbitrary(offenses) {
  const ARB = /no-arbitrary-spacing-or-radius/;
  const VALUE_RE = /-(\[[\d.]+(?:px|rem|em)\])/;
  const counts = new Map();
  for (const o of offenses) {
    if (!ARB.test(o.rule)) continue;
    const m = VALUE_RE.exec(String(o.excerpt));
    if (!m) continue;
    counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  const kept = [];
  const singles = new Map();
  for (const o of offenses) {
    if (!ARB.test(o.rule)) {
      kept.push(o);
      continue;
    }
    const m = VALUE_RE.exec(String(o.excerpt));
    if (!m) continue; // unparseable: not a spacing literal, drop
    if (counts.get(m[1]) > 1) kept.push(o);
    else singles.set(m[1], (singles.get(m[1]) || 0) + 1);
  }
  return { kept, singles, counts };
}

const { kept: narrowedOffenses, singles: singleUseArbitrary } = narrowRepeatedArbitrary(offenses);

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
for (const o of narrowedOffenses) {
  const k = baselineKey(o);
  const left = remaining.get(k) || 0;
  if (left > 0) remaining.set(k, left - 1);
  else { fresh.push(o); freshSet.add(o); }
}
const errors = fresh.filter((o) => o.severity === 'error');
const warns = fresh.filter((o) => o.severity === 'warn');

// --- report -----------------------------------------------------------------
const byRule = {};
for (const o of narrowedOffenses) {
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
console.log(`legacy baselined: ${narrowedOffenses.length - fresh.length}   new: ${fresh.length}   errors: ${errors.length}   warns: ${warns.length}`);

// Separate the two audiences explicitly. `warn` here is ADVISORY DEBT, not a
// gate failure, and the two were previously indistinguishable in the output --
// which is how a 1786-item advisory backlog could sit next to "PASS" without
// anyone noticing it was unbounded. Errors block; warns are a tracked migration
// backlog that must trend to zero before promotion.
const ADVISORY = ['no-raw-tailwind-font-size', 'no-raw-tailwind-duration', 'no-arbitrary-spacing-or-radius'];
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
if (singleUseArbitrary && singleUseArbitrary.size) {
  console.log('');
  console.log(
    `single-use arbitrary values (NOT reported as debt): ${singleUseArbitrary.size} distinct -- ${[...singleUseArbitrary.keys()].join(' ')}`,
  );
  console.log('  A literal used once is a local decision, not a scale bypass. Reported for');
  console.log('  visibility so the list stays reviewable; promote this rule to error at 0.');
}
if (blockingFresh.length === 0 && advisoryFresh.length > 0) {
  console.log('');
  console.log('NOTE: gate PASSES. The items above are warn-severity and do not fail CI.');
}

if (WRITE_BASELINE) {
  const entries = narrowedOffenses.map(baselineKey);
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
