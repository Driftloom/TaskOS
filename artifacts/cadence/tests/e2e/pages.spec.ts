import { expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONTRAST_HELPER,
  KNOWN_DEFECT,
  collectPageProblems,
  formatContrast,
  formatMeasurement,
  installMockApi,
  measureBorderContrast,
  measureTapTarget,
  measureTextContrast,
  test,
  type BorderContrastMeasurement,
  type ContrastMeasurement,
  type TargetMeasurement,
} from './fixtures';

/**
 * The four routes no test had ever rendered: /calendar, /review, /profile and
 * /settings.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `console.spec.ts` walks seven routes and asserts only that the *shell* mounts
 * (it waits on `button-theme-toggle`, which lives in AppShell, not in the page).
 * `design-system.spec.ts` measures Today and Focus only. So until this file,
 * four reachable, fully-implemented pages had never been loaded by a test in any
 * theme. That is the same shape of gap that let a light theme measure 1.09:1 for
 * an entire session: nothing failed, because nothing looked.
 *
 * WHAT IS ASSERTED, PER PAGE, IN BOTH THEMES
 * ------------------------------------------
 *   1. it renders its OWN content -- not merely that the shell mounted -- with
 *      zero console errors, zero uncaught errors and zero failed requests;
 *   2. its text meets WCAG 2.2 SC 1.4.3 against the theme that is actually
 *      live (4.5:1 body, 3:1 large), measured from computed colours;
 *   3. its *control* boundaries meet SC 1.4.11 at 3:1;
 *   4. its controls offer a 44px target, as max(owned square, owned circle);
 *   5. a screenshot per page per theme.
 *
 * Plus one behavioural test per page, because a page that renders and does
 * nothing is also broken: the view switch, the ritual dialog, the sign-out
 * confirmation, the focus-target save.
 *
 * HONEST-FAILURE RULES OBSERVED HERE
 * ----------------------------------
 * - No `if (...) return`, no `if (await el.isVisible())`, no try/catch that
 *   swallows. If a locator matches nothing, `resolveSelector` THROWS rather
 *   than skipping the measurement, because a skipped measurement is exactly
 *   the vacuous pass this suite was rewritten to eliminate.
 * - A locator that resolves to more than one element logs the count and
 *   measures the first; it never silently measures nothing.
 * - Every failure message carries the measured numbers, not a pass/fail word.
 *
 * A NOTE ON REVIEW
 * ----------------
 * ReviewPage.tsx carries exactly ONE data-testid in its own markup
 * (`review-task-${id}` on a completed ledger row). Everything else is reached
 * here by role and text, which is the documented preference. The measurement
 * helpers take a CSS selector (they call `document.querySelector`), so
 * role/text locators are bridged by stamping an inert `data-e2e-probe`
 * attribute on the resolved node and removing it immediately after the
 * measurement. That is a test-side marker only: no file under `src/` is
 * touched, and a `data-*` attribute has no effect on computed style or layout.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED, AND WHY
 * ------------------------------------------
 * - **Time-block writes on /calendar.** `installMockApi` has no handler for
 *   `POST /api/tasks/:id/blocks` or `PATCH/DELETE /api/blocks/:id`, and it
 *   answers 501 for anything it does not implement -- by design, so contract
 *   drift fails loudly. Clicking "Schedule" in the hour modal would therefore
 *   manufacture a 501 that says nothing about the app. The modal is opened,
 *   its task list asserted, and closed; the block write path stays unmocked
 *   and is reported as a coverage gap.
 * - **Card outlines** are measured and printed but not asserted, matching the
 *   rule design-system.spec.ts already documents: SC 1.4.11 governs the
 *   boundary of a control a user must be able to identify, and a decorative
 *   panel edge is not that.
 * - **Filled primary buttons** (`button-toggle-sound`, `button-save-focus-
 *   target`) carry no border, so they have nothing for SC 1.4.11 to measure;
 *   their fill/label contrast is covered by the text-contrast test instead.
 */

const SHOTS = path.join('test-results', 'screens');

/** Every measurement, plus the numbers, in one failure message. */
function table(rows: string[], headline: string): string {
  return (
    headline +
    '\n\n' +
    rows.join('\n') +
    '\n\nMeasured in the browser by artifacts/cadence/tests/e2e/pages.spec.ts via the\n' +
    'CONTRAST_HELPER canvas resolver and document.elementFromPoint hit testing. No\n' +
    'class name or token value is asserted anywhere in this file.'
  );
}

// ---------------------------------------------------------------------------
// Target resolution: CSS selector, or a role/text locator bridged to one.
// ---------------------------------------------------------------------------

/** A CSS selector, or a role/text locator that is bridged to one. */
type Target = {
  label: string;
  selector?: string;
  loc?: Locator;
  /**
   * Set when the element paints a `background-image` (e.g. `.btn-primary`'s
   * `linear-gradient`). CONTRAST_HELPER cannot resolve a gradient, so its
   * reported backdrop is whatever is behind the gradient and the ratio is not
   * what a user sees. Such a target is still measured and PRINTED, but is not
   * asserted on -- and `assertTextContrast` fails if an `approx` target turns
   * out to be measurable after all, so the flag cannot be used to hide a real
   * regression. The identical colour pairing is asserted elsewhere on a solid
   * `bg-primary` (see the Settings "sound toggle label" row).
   */
  approx?: boolean;
};

const PROBE_ATTR = 'data-e2e-probe';
let probeSeq = 0;

async function resolveSelector(page: Page, t: Target): Promise<string> {
  if (t.selector) return t.selector;
  const loc = t.loc;
  if (!loc) throw new Error(`target "${t.label}" has neither a selector nor a locator`);
  const count = await loc.count();
  if (count === 0) {
    // Deliberately fatal. A target that cannot be located cannot be measured,
    // and quietly skipping it is the failure mode this suite exists to prevent.
    throw new Error(
      `No element matched the locator for "${t.label}".\n` +
        'Refusing to skip it: an unmeasurable target reported as a pass is worse than\n' +
        'no test, because it manufactures confidence.',
    );
  }
  if (count > 1) {
    console.log(`  note: "${t.label}" matched ${count} elements; the first is measured`);
  }
  const id = String(++probeSeq);
  // The attribute NAME has to cross into the page as an argument: a closure over
  // the module-level constant would be evaluated in the browser, where it does
  // not exist.
  await loc.first().evaluate(
    (node, value) => (node as HTMLElement).setAttribute(value.attr, value.id),
    { attr: PROBE_ATTR, id },
  );
  return `[${PROBE_ATTR}="${id}"]`;
}

async function clearProbe(page: Page, selector: string): Promise<void> {
  if (!selector.startsWith(`[${PROBE_ATTR}=`)) return;
  await page.evaluate((sel) => {
    document.querySelector(sel)?.removeAttribute('data-e2e-probe');
  }, selector);
}

async function measureTextTargets(page: Page, targets: Target[]): Promise<ContrastMeasurement[]> {
  const out: ContrastMeasurement[] = [];
  for (const t of targets) {
    const selector = await resolveSelector(page, t);
    try {
      out.push(await measureTextContrast(page, selector, t.label));
    } finally {
      await clearProbe(page, selector);
    }
  }
  return out;
}

async function measureBorderTargets(
  page: Page,
  targets: Target[],
): Promise<BorderContrastMeasurement[]> {
  const out: BorderContrastMeasurement[] = [];
  for (const t of targets) {
    const selector = await resolveSelector(page, t);
    try {
      out.push(await measureBorderContrast(page, selector, t.label));
    } finally {
      await clearProbe(page, selector);
    }
  }
  return out;
}

async function measureTapTargets(page: Page, targets: Target[]): Promise<TargetMeasurement[]> {
  const out: TargetMeasurement[] = [];
  for (const t of targets) {
    const selector = await resolveSelector(page, t);
    try {
      out.push(await measureTapTarget(page, selector, t.label));
    } finally {
      await clearProbe(page, selector);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Boot / theme / screenshot plumbing
// ---------------------------------------------------------------------------

type Open = (path: string) => Promise<void>;

/**
 * Opens a route through the `open` fixture (which asserts the shell mounted and
 * the final pathname) and then asserts the PAGE ITSELF rendered. Waiting on
 * `button-theme-toggle` alone would pass for any route in the app, which is
 * precisely the gap this file closes.
 */
async function boot(
  open: Open,
  page: Page,
  route: string,
  ready: Locator,
  readyDesc: string,
): Promise<void> {
  await open(route);
  await expect(ready, `${route} mounted the app shell but never rendered ${readyDesc}`).toBeVisible({
    timeout: 30_000,
  });
  // Let react-query settle so a late rejection still lands inside the window.
  await page.waitForTimeout(600);
}

/** The app encodes dark as "no data-theme attribute" and light as the attribute. */
async function currentTheme(page: Page): Promise<'light' | 'dark'> {
  const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  return attr === 'light' ? 'light' : 'dark';
}

async function assertDarkDefault(page: Page): Promise<void> {
  await expect
    .poll(() => currentTheme(page), {
      message: 'the app did not start in dark mode, which is the documented default',
      timeout: 45_000,
    })
    .toBe('dark');
  expect(
    await page.evaluate(() => document.documentElement.hasAttribute('data-theme')),
    'dark mode must not carry a data-theme attribute (tokens.css scopes light only)',
  ).toBe(false);
}

async function switchToLight(page: Page): Promise<void> {
  const toggle = page.getByTestId('button-theme-toggle');
  await expect(toggle, 'the header theme toggle is missing, so the theme cannot be switched')
    .toHaveAttribute('aria-label', /light appearance/i);
  await toggle.click();
  await expect
    .poll(() => currentTheme(page), {
      message: 'clicking the theme toggle did not switch the app to light mode',
      timeout: 15_000,
    })
    .toBe('light');
  await expect(toggle).toHaveAttribute('aria-label', /dark appearance/i);
  // tokens.css transitions surfaces, so sample after it settles, not mid-fade.
  await page.waitForTimeout(400);
}

async function shoot(page: Page, name: string): Promise<string> {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  // /calendar is a very tall page and Chromium's full-page capture is not
  // instant, so this gets its own budget rather than the 15s action timeout.
  await page.screenshot({ path: file, fullPage: true, timeout: 90_000 });
  console.log(`  screenshot: ${file}`);
  return file;
}

/** Prefixes each label with the theme so a combined table stays readable. */
function withTheme<T extends { label: string }>(rows: T[], theme: string): T[] {
  return rows.map((r) => ({ ...r, label: `${r.label} (${theme})` }));
}

// ---------------------------------------------------------------------------
// /calendar -- element lists
// ---------------------------------------------------------------------------

const CALENDAR_TEXT = (p: Page): Target[] => [
  { label: 'page heading', selector: 'h1' },
  { label: 'eyebrow', loc: p.locator('main').getByText('Calendar', { exact: true }) },
  { label: 'section detail', loc: p.locator('main').getByText(/Schedule your hours with time blocks/) },
  { label: 'day summary (primary)', loc: p.locator('main').getByText(/^\d+ scheduled . \d+ blocked$/) },
  { label: 'Time Blocks heading', loc: p.getByRole('heading', { name: 'Time Blocks' }) },
  { label: 'hour label 09:00', loc: p.getByTestId('hour-slot-9').locator('span').first() },
  { label: 'drag hint', loc: p.locator('main').getByText(/Drag any task row onto an hour slot/) },
  { label: 'task row title', loc: p.locator('main').getByText('Ship the enterprise release v1.0', { exact: true }) },
  { label: 'Add task label', selector: '[data-testid="button-calendar-add"]' },
  { label: 'Today period label', loc: p.getByRole('button', { name: 'Today', exact: true }) },
  { label: 'segment day (selected)', selector: 'main button[aria-pressed="true"]' },
  { label: 'segment week (unselected)', selector: 'main button[aria-pressed="false"]' },
];

const CALENDAR_BORDERS = (p: Page): Target[] => [
  { label: 'Add task', selector: '[data-testid="button-calendar-add"]' },
  { label: 'previous period', selector: 'button[aria-label="Previous period"]' },
  { label: 'next period', selector: 'button[aria-label="Next period"]' },
  { label: 'Today period', loc: p.getByRole('button', { name: 'Today', exact: true }) },
  { label: 'add block at 09:00', selector: '[data-testid="button-add-block-9"]' },
  { label: 'add block at 15:00', selector: '[data-testid="button-add-block-15"]' },
  {
    label: 'view switch group',
    loc: p.locator('main div.border.border-border-control.bg-background'),
  },
];

const CALENDAR_TAPS = (p: Page): Target[] => [
  { label: 'Add task', selector: '[data-testid="button-calendar-add"]' },
  { label: 'previous period', selector: 'button[aria-label="Previous period"]' },
  { label: 'next period', selector: 'button[aria-label="Next period"]' },
  { label: 'Today period', loc: p.getByRole('button', { name: 'Today', exact: true }) },
  { label: 'segment day', selector: 'main button[aria-pressed="true"]' },
  { label: 'segment week', selector: 'main button[aria-pressed="false"]' },
  { label: 'add block at 09:00', selector: '[data-testid="button-add-block-9"]' },
  { label: 'add block at 22:00', selector: '[data-testid="button-add-block-22"]' },
  { label: 'complete task', selector: '[data-testid="button-complete-task-101"]' },
  { label: 'edit task (pencil)', selector: '[data-testid="button-pencil-task-101"]' },
  { label: 'delete task', selector: '[data-testid="button-delete-task-101"]' },
];

// ---------------------------------------------------------------------------
// /review -- reached by role and text; the page has one testid of its own.
// ---------------------------------------------------------------------------

const REVIEW_TEXT = (p: Page): Target[] => [
  { label: 'page heading', selector: 'h1' },
  { label: 'eyebrow', loc: p.locator('main').getByText('Review', { exact: true }) },
  { label: 'section detail', loc: p.locator('main').getByText(/A calm, honest view of today's work/) },
  { label: 'Today progress label', loc: p.locator('main').getByText(/Today.s Progress/) },
  { label: 'progress count', selector: 'main p.text-3xl' },
  { label: 'progress caption', loc: p.locator('main').getByText(/of \d+ tasks finished/) },
  { label: 'The Ledger label', loc: p.locator('main').getByText('The Ledger', { exact: true }) },
  { label: 'focus minutes', loc: p.locator('main').getByText(/\d+ min focused/) },
  { label: 'ledger tab Today (sel)', loc: p.getByRole('button', { name: 'Today', exact: true }) },
  { label: 'ledger tab Archive', loc: p.getByRole('button', { name: 'Archive (7d)' }) },
  { label: 'ledger row title', loc: p.getByTestId('review-task-103').getByText('Reply to the Telegram pairing digest') },
  { label: 'ledger row duration', loc: p.getByTestId('review-task-103').getByText('15m', { exact: true }) },
  { label: 'morning ritual label', loc: p.locator('main').getByText('Morning Ritual', { exact: true }) },
  { label: 'morning ritual title', loc: p.locator('main').getByText('Give the day a shape', { exact: true }) },
  { label: 'morning ritual body', loc: p.locator('main').getByText(/Pick your primary #1 focus outcome/) },
  { label: 'evening ritual label', loc: p.locator('main').getByText('Evening Ritual', { exact: true }) },
  { label: 'evening ritual title', loc: p.locator('main').getByText('Close the loop', { exact: true }) },
  { label: 'streak note', loc: p.locator('main').getByText('Streak preserved', { exact: true }) },
  { label: 'open task count', loc: p.locator('main').getByText(/\d+ tasks open in Today/) },
  { label: 'Projects heading', loc: p.getByRole('heading', { name: 'Projects' }) },
  { label: 'empty projects note', loc: p.locator('main').getByText(/No projects yet/) },
  { label: 'Tags heading', loc: p.getByRole('heading', { name: 'Tags' }) },
  { label: 'tag chip', loc: p.locator('main').getByText('eng', { exact: true }) },
];

const REVIEW_BORDERS = (p: Page): Target[] => [
  { label: 'Plan Day', loc: p.getByRole('button', { name: 'Plan Day', exact: true }) },
  { label: 'Close Day', loc: p.getByRole('button', { name: 'Close Day', exact: true }) },
  { label: 'new project field', selector: 'input[placeholder="New project name"]' },
];

const REVIEW_TAPS = (p: Page): Target[] => [
  { label: 'Plan Day', loc: p.getByRole('button', { name: 'Plan Day', exact: true }) },
  { label: 'Close Day', loc: p.getByRole('button', { name: 'Close Day', exact: true }) },
  { label: 'ledger tab Today', loc: p.getByRole('button', { name: 'Today', exact: true }) },
  { label: 'ledger tab Archive', loc: p.getByRole('button', { name: 'Archive (7d)' }) },
  { label: 'morning ritual card', loc: p.getByRole('button', { name: /Give the day a shape/ }) },
  { label: 'evening ritual card', loc: p.getByRole('button', { name: /Close the loop/ }) },
  { label: 'new project field', selector: 'input[placeholder="New project name"]' },
  { label: 'new project submit', selector: 'form:has(input[placeholder="New project name"]) button[type="submit"]' },
  { label: 'colour swatch', loc: p.getByRole('button', { name: /^Colour / }) },
  { label: 'tag remove (hover only)', loc: p.getByTitle('Remove eng') },
];

// ---------------------------------------------------------------------------
// /profile
// ---------------------------------------------------------------------------

const PROFILE_TEXT = (p: Page): Target[] => [
  { label: 'page heading', selector: 'h1' },
  { label: 'eyebrow', loc: p.locator('main').getByText('Profile · account & rhythm', { exact: true }) },
  { label: 'section detail', loc: p.locator('main').getByText(/Identity, 24-hour chronotype rhythm/) },
  { label: 'display name', selector: 'main h2' },
  { label: 'Active User badge', loc: p.locator('main').getByText('Active User', { exact: true }) },
  { label: 'email line', loc: p.locator('main').getByText('No email on file', { exact: true }) },
  { label: 'clerk id chip', selector: 'main code' },
  { label: 'single user note', loc: p.locator('main').getByText(/Single User Safe/) },
  { label: 'timezone caption', loc: p.locator('main').getByText(/Asia\/Kolkata/) },
  { label: 'live clock', selector: 'main div.bg-muted.border.border-border-control.font-mono' },
  { label: 'rhythm toggle label', loc: p.locator('main').getByText('24-Hour Working Rhythm', { exact: true }) },
  { label: 'rhythm state', loc: p.locator('main').getByText(/^(Active: No artificial|Constrained: )/) },
  { label: 'learned patterns heading', loc: p.getByRole('heading', { name: 'Learned Patterns' }) },
  { label: 'learned patterns empty', loc: p.locator('main').getByText(/Nothing learned yet/) },
  { label: 'memory link', loc: p.locator('main').getByText('Review everything Cadence knows', { exact: true }) },
  { label: 'momentum heading', loc: p.getByRole('heading', { name: 'Momentum & Consistency' }) },
  { label: 'open review link', loc: p.locator('main').getByText('Open Review', { exact: true }) },
  { label: 'stat label Completed', loc: p.locator('main .grid.grid-cols-2 p.font-mono').nth(0) },
  { label: 'stat value Completed', loc: p.locator('main .grid.grid-cols-2 p.text-2xl').nth(0) },
  { label: 'stat caption Completed', loc: p.locator('main').getByText('Lifetime tasks done', { exact: true }) },
  { label: 'stat value Streak', loc: p.locator('main .grid.grid-cols-2 p.text-2xl').nth(1) },
  { label: 'stat caption Streak', loc: p.locator('main').getByText('Strict, no freeze', { exact: true }) },
  { label: 'stat value Focus', loc: p.locator('main .grid.grid-cols-2 p.text-2xl').nth(2) },
  { label: 'stat value Rounds', loc: p.locator('main .grid.grid-cols-2 p.text-2xl').nth(3) },
  { label: 'telegram disconnected', loc: p.locator('main').getByText('NOT CONNECTED', { exact: true }) },
  { label: 'telegram body', loc: p.locator('main').getByText(/No Telegram bot is connected yet/) },
  { label: 'push not implemented', loc: p.locator('main').getByText('NOT IMPLEMENTED', { exact: true }) },
  { label: 'play test chime label', loc: p.getByRole('button', { name: 'Play Test Chime' }) },
  { label: 'privacy RLS title', loc: p.locator('main').getByText('Row-Level Security', { exact: true }) },
  { label: 'privacy RLS body', loc: p.locator('main').getByText(/Every query executes with/) },
  { label: 'memory card title', loc: p.getByRole('heading', { name: 'What Cadence Knows' }) },
  { label: 'memory card caption', loc: p.locator('main').getByText('Inspect memory facts & confirmation queue', { exact: true }) },
];

const PROFILE_BORDERS = (p: Page): Target[] => [
  { label: 'Export Backup', selector: '[data-testid="button-profile-export"]' },
  { label: 'Sign Out', selector: '[data-testid="button-profile-signout"]' },
  { label: 'clerk id chip', selector: 'main code' },
  { label: 'live clock chip', selector: 'main div.bg-muted.border.border-border-control.font-mono' },
  { label: 'Play Test Chime', loc: p.getByRole('button', { name: 'Play Test Chime' }) },
];

const PROFILE_TAPS_PAGE = (p: Page): Target[] => [
  { label: 'Export Backup', selector: '[data-testid="button-profile-export"]' },
  { label: 'Sign Out', selector: '[data-testid="button-profile-signout"]' },
  { label: '24h rhythm checkbox', selector: '[data-testid="checkbox-profile-24h"]' },
  { label: 'Play Test Chime', loc: p.getByRole('button', { name: 'Play Test Chime' }) },
  { label: 'Open Review link', loc: p.locator('main').getByText('Open Review', { exact: true }) },
  { label: 'memory link', loc: p.locator('main').getByText('Review everything Cadence knows', { exact: true }) },
  { label: 'What Cadence Knows card', loc: p.getByRole('link', { name: /What Cadence Knows/ }) },
  { label: 'Setup Wizard card', loc: p.getByRole('link', { name: /Setup Wizard/ }) },
];

// ---------------------------------------------------------------------------
// /settings
// ---------------------------------------------------------------------------

const SETTINGS_TEXT = (p: Page): Target[] => [
  { label: 'page heading', selector: 'h1' },
  { label: 'eyebrow', loc: p.locator('main').getByText('Preferences -- your rules', { exact: true }) },
  { label: 'section detail', loc: p.locator('main').getByText(/Set your schedule constraints, 24-hour rhythm/) },
  { label: 'memory card title', loc: p.getByRole('heading', { name: 'What Cadence Knows' }) },
  { label: 'memory card caption', loc: p.locator('main').getByText('Memory facts & scheduling rules', { exact: true }) },
  { label: 'rhythm section heading', loc: p.getByRole('heading', { name: '24-Hour Working Rhythm' }) },
  { label: 'rhythm section caption', loc: p.locator('main').getByText(/Flexible day & night scheduling/) },
  { label: 'row label 24h rhythm', loc: p.locator('main').getByText('24-hour flexible rhythm', { exact: true }) },
  { label: 'row description 24h rhythm', loc: p.locator('main').getByText(/When on, work hours are ignored/) },
  { label: 'focus section heading', loc: p.getByRole('heading', { name: 'Daily Focus Target' }) },
  { label: 'row label rounds per day', loc: p.getByTestId('settings-row-focus-target').getByText('Rounds per day', { exact: true }) },
  { label: 'daily target value', selector: '[data-testid="settings-row-focus-target"] span.w-20' },
  { label: 'decrement label', selector: '[data-testid="button-focus-target-decrement"]' },
  { label: 'increment label', selector: '[data-testid="button-focus-target-increment"]' },
  { label: 'save target label', selector: '[data-testid="button-save-focus-target"]', approx: true },
  { label: 'timezone section heading', loc: p.getByRole('heading', { name: 'Timezone & Local Time' }) },
  { label: 'timezone field value', selector: '[data-testid="input-timezone"]' },
  { label: 'work hours row label', loc: p.locator('main').getByText('Schedulable workday', { exact: true }) },
  { label: 'work hours summary', selector: '[data-testid="time-range-work-hours-summary"]' },
  { label: 'work hours start select', selector: '[data-testid="time-range-work-hours-start"]' },
  {
    label: 'work hours scale label',
    selector: '[data-testid="time-range-work-hours"] div[aria-hidden="true"]:nth-of-type(2) span',
  },
  { label: 'work hours tz note', selector: '[data-testid="time-range-work-hours-timezone"]' },
  { label: 'work hours tz value', selector: '[data-testid="time-range-work-hours-timezone"] span.font-mono' },
  { label: 'quiet hours row label', loc: p.locator('main').getByText('Quiet hours', { exact: true }) },
  { label: 'quiet hours summary', selector: '[data-testid="time-range-quiet-hours-summary"]' },
  { label: 'quiet hours equal note', selector: '[data-testid="time-range-quiet-hours-equal-note"]' },
  { label: 'telegram quick setup', loc: p.getByRole('heading', { name: 'Quick setup' }) },
  { label: 'pairing code label', selector: '[data-testid="button-open-telegram-pairing"]' },
  { label: 'sound section heading', loc: p.getByRole('heading', { name: 'Tactile Audio Feedback' }) },
  { label: 'row label sound effects', loc: p.locator('main').getByText('Sound effects', { exact: true }) },
  { label: 'sound toggle label', selector: '[data-testid="button-toggle-sound"]' },
  { label: 'export section heading', loc: p.getByRole('heading', { name: 'Export Data' }) },
  { label: 'export label', selector: '[data-testid="button-export-json"]' },
  { label: 'security footnote', loc: p.locator('main').getByText(/Secured with Clerk Third-Party Auth/) },
];

const SETTINGS_BORDERS: Target[] = [
  { label: 'timezone field', selector: '[data-testid="input-timezone"]' },
  { label: 'decrement target', selector: '[data-testid="button-focus-target-decrement"]' },
  { label: 'increment target', selector: '[data-testid="button-focus-target-increment"]' },
  { label: 'work hours start', selector: '[data-testid="time-range-work-hours-start"]' },
  { label: 'work hours end', selector: '[data-testid="time-range-work-hours-end"]' },
  { label: 'quiet hours start', selector: '[data-testid="time-range-quiet-hours-start"]' },
  { label: 'quiet hours end', selector: '[data-testid="time-range-quiet-hours-end"]' },
  { label: 'Export JSON', selector: '[data-testid="button-export-json"]' },
  { label: 'Create pairing code', selector: '[data-testid="button-open-telegram-pairing"]' },
];

const SETTINGS_TAPS: Target[] = [
  { label: 'decrement target', selector: '[data-testid="button-focus-target-decrement"]' },
  { label: 'increment target', selector: '[data-testid="button-focus-target-increment"]' },
  { label: 'save target', selector: '[data-testid="button-save-focus-target"]' },
  { label: 'timezone field', selector: '[data-testid="input-timezone"]' },
  { label: '24h rhythm switch', selector: '[data-testid="settings-row-toggle"]' },
  { label: 'work hours start', selector: '[data-testid="time-range-work-hours-start"]' },
  { label: 'work hours end', selector: '[data-testid="time-range-work-hours-end"]' },
  { label: 'quiet hours start', selector: '[data-testid="time-range-quiet-hours-start"]' },
  { label: 'sound toggle', selector: '[data-testid="button-toggle-sound"]' },
  { label: 'Export JSON', selector: '[data-testid="button-export-json"]' },
  { label: 'Create pairing code', selector: '[data-testid="button-open-telegram-pairing"]' },
];

// ---------------------------------------------------------------------------
// 1. Renders its own content, with no console error and no failed request
// ---------------------------------------------------------------------------

test.describe('each of the four untested routes renders its own content', () => {
  test('Calendar renders the hour grid and the day task list', async ({ page, open }) => {
    await installMockApi(page);
    const problems = collectPageProblems(page);
    await boot(open, page, '/calendar', page.getByTestId('hour-slot-9'), 'its hour grid');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('See the shape of time.');
    // 06:00 through 22:00 inclusive.
    await expect(page.locator('[data-testid^="hour-slot-"]')).toHaveCount(17);
    await expect(page.getByTestId('hour-slot-6')).toBeVisible();
    await expect(page.getByTestId('hour-slot-22')).toBeVisible();
    await expect(page.getByTestId('hour-slot-23')).toHaveCount(0);
    // Real data reached the day list, not just a placeholder.
    await expect(page.getByTestId('row-task-101')).toBeVisible();
    await expect(page.locator('main').getByText(/^\d+ scheduled . \d+ blocked$/)).toBeVisible();

    problems.assertClean('/calendar load');
  });

  test('Review renders the ledger with real completed work', async ({ page, open }) => {
    await installMockApi(page);
    const problems = collectPageProblems(page);
    await boot(open, page, '/review', page.getByTestId('review-task-103'), 'its completed-task ledger');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notice what moved.');
    // The one testid the page owns: a completed row from the mock.
    await expect(page.getByTestId('review-task-103')).toBeVisible();
    await expect(page.getByTestId('review-task-103')).toContainText('Reply to the Telegram pairing digest');
    // Open tasks must NOT appear in a completed ledger.
    await expect(page.getByTestId('review-task-101')).toHaveCount(0);
    await expect(page.locator('main').getByText(/of \d+ tasks finished/)).toBeVisible();
    await expect(page.locator('main').getByText(/\d+ min focused/)).toBeVisible();
    // Projects/tags had a full CRUD API and no UI until WorkspacePanel landed.
    await expect(page.getByTestId('workspace-panel')).toBeVisible();

    problems.assertClean('/review load');
  });

  test('Profile renders identity, stats and the channel ledger', async ({ page, open }) => {
    await installMockApi(page);
    const problems = collectPageProblems(page);
    await boot(open, page, '/profile', page.getByTestId('button-profile-export'), 'its identity card');

    // No invented identity: with Clerk bypassed, user is null, so the honest
    // fallback name is used rather than a fabricated account.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Signed-in user's Cadence");
    await expect(page.getByTestId('button-profile-export')).toBeEnabled();
    await expect(page.getByTestId('button-profile-signout')).toBeVisible();
    await expect(page.getByTestId('checkbox-profile-24h')).toBeVisible();
    // Live data, not hardcoded copy: the mock reports streakDays 3 and 25 focus
    // minutes (one completed task x 25m).
    await expect(page.locator('main .grid.grid-cols-2 p.text-2xl').nth(1)).toHaveText(/^3 Days$/);
    await expect(page.locator('main .grid.grid-cols-2 p.text-2xl').nth(2)).toHaveText(/^25m$/);
    await expect(page.getByText('NOT CONNECTED', { exact: true })).toBeVisible();
    await expect(page.getByText('NOT IMPLEMENTED', { exact: true })).toBeVisible();
    // The "no real web push" card must not claim readiness.
    await expect(page.getByText(/Not available yet\. There is no web-push delivery/)).toBeVisible();

    problems.assertClean('/profile load');
  });

  test('Settings renders every control group with the server values adopted', async ({ page, open }) => {
    await installMockApi(page);
    const problems = collectPageProblems(page);
    await boot(open, page, '/settings', page.getByTestId('input-timezone'), 'its timezone field');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings & Boundaries');
    // Loading skeletons must be gone, or the form was never filled in.
    await expect(page.getByTestId('settings-loading')).toHaveCount(0);
    // Adopted from GET /api/settings/notifications, not from the browser.
    await expect(page.getByTestId('input-timezone')).toHaveValue('Asia/Kolkata');
    await expect(page.getByTestId('time-range-work-hours-summary')).toHaveText(/09:00 .* 18:00 . 9h/);
    // Quiet hours are 0/0 in the mock, which TimeRangeControl renders as an
    // inactive window plus the allowEqual note.
    await expect(page.getByTestId('time-range-quiet-hours-summary')).toHaveText(/No window/);
    await expect(page.getByTestId('time-range-quiet-hours-equal-note')).toBeVisible();
    await expect(page.getByTestId('button-open-telegram-pairing')).toBeVisible();

    problems.assertClean('/settings load');
  });
});

// ---------------------------------------------------------------------------
// 1b. The page's own behaviour, not just its markup
// ---------------------------------------------------------------------------

test.describe('each route does something when used', () => {
  test('Calendar: view switch, period navigation, and the schedule modal', async ({ page, open }) => {
    const api = await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/calendar', page.getByTestId('hour-slot-9'), 'its hour grid');

    // Period navigation actually moves the day, i.e. the heading is derived.
    const heading = page.locator('main h2');
    const before = await heading.textContent();
    await page.locator('button[aria-label="Next period"]').click();
    await expect.poll(() => heading.textContent(), { message: 'Next period did not move the day view' }).not.toBe(before);
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect.poll(() => heading.textContent()).toBe(before);

    // Week and month replace the hour grid; day brings it back.
    await page.getByRole('button', { name: 'week', exact: true }).click();
    await expect(page.getByTestId('hour-slot-9'), 'the week view did not replace the day hour grid').toHaveCount(0);
    await expect(page.getByRole('button', { name: /\d+ tasks?$/ })).toHaveCount(7);
    await page.getByRole('button', { name: 'month', exact: true }).click();
    await expect(page.locator('main').getByText('Sun', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'day', exact: true }).click();
    await expect(page.getByTestId('hour-slot-9')).toBeVisible();

    // The touch/quick-schedule path (the documented non-drag alternative).
    await page.getByTestId('button-add-block-9').click();
    await expect(page.getByRole('heading', { name: 'Schedule Block at 09:00' })).toBeVisible();
    // Scoped by the meta line the modal renders ("90 min · high priority"): the
    // bare task title also names the four TaskRow buttons behind the overlay,
    // so an unscoped name would be a strict-mode violation, not an assertion.
    await expect(
      page.getByRole('button', { name: /Ship the enterprise release v1\.0 \d+ min · \w+ priority/ }),
    ).toBeVisible();
    // exact: the sidebar's "Close sidebar" also contains "Close".
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Schedule Block at 09:00' })).toHaveCount(0);

    // Sanity: the page really was talking to the mocked API, so the walk above
    // exercised rendered data rather than a static tree.
    expect(api.requestedPaths.length, 'the calendar made no API calls, so nothing was covered')
      .toBeGreaterThan(0);
    // Block writes are deliberately NOT clicked: installMockApi has no handler
    // for /api/tasks/:id/blocks and answers 501, which would say nothing about
    // the app. That gap is reported, not hidden.
    expect(
      api.requestedPaths.filter((r) => r.includes('/blocks') && !r.startsWith('GET')).length,
      'a block write was issued even though this test does not click one',
    ).toBe(0);
  });

  test('Review: the ritual dialog opens from Plan Day and the ledger scope re-queries', async ({ page, open }) => {
    const api = await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/review', page.getByTestId('review-task-103'), 'its completed-task ledger');

    // The scope switch must re-query, not just restyle the two buttons.
    const before = api.requestedPaths.filter((r) => r === 'GET /api/tasks').length;
    await page.getByRole('button', { name: 'Archive (7d)' }).click();
    await expect
      .poll(
        () => api.requestedPaths.filter((r) => r === 'GET /api/tasks').length,
        { message: 'switching the ledger to Archive (7d) did not re-query the task list' },
      )
      .toBeGreaterThan(before);
    await expect(page.getByTestId('review-task-103')).toBeVisible();

    // The ritual dialog is the page's primary action.
    await page.getByRole('button', { name: 'Plan Day', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog, 'Plan Day did not open the ritual dialog').toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('Profile: the rhythm toggle, the chime, and the sign-out confirmation all respond', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/profile', page.getByTestId('checkbox-profile-24h'), 'its rhythm toggle');

    // The checkbox must change the state it describes.
    const checkbox = page.getByTestId('checkbox-profile-24h');
    await expect(checkbox).toBeChecked();
    await expect(page.getByText('Active: No artificial working hour cutoffs.')).toBeVisible();
    await checkbox.uncheck();
    await expect(page.getByText('Constrained: 09:00 - 18:00.')).toBeVisible();
    await checkbox.check();
    await expect(page.getByText('Active: No artificial working hour cutoffs.')).toBeVisible();

    // The chime button synthesises and reports what it played.
    await page.getByRole('button', { name: 'Play Test Chime' }).click();
    await expect(page.getByText(/Major 7th acoustic chime synthesized/)).toBeVisible();

    // Sign-out is destructive, so it must be confirmed -- and cancelling must
    // leave the user signed in on the same route.
    await page.getByTestId('button-profile-signout').click();
    await expect(page.getByTestId('button-confirm-signout')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByTestId('button-confirm-signout')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/profile');
  });

  test('Settings: the focus target saves, sound toggles, and Export JSON downloads', async ({ page, open }) => {
    const api = await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/settings', page.getByTestId('input-timezone'), 'its timezone field');

    // The stepper writes to the server, not just to local state.
    const save = page.getByTestId('button-save-focus-target');
    await expect(save, 'Save target is enabled before anything changed').toBeDisabled();
    await page.getByTestId('button-focus-target-increment').click();
    await expect(page.getByTestId('settings-row-focus-target').getByText('5 rounds', { exact: true })).toBeVisible();
    await expect(save).toBeEnabled();
    await save.click();
    await expect
      .poll(() => api.writes.filter((w) => w.method === 'PATCH' && w.path === '/api/settings/focus').length, {
        message: 'Save target did not PATCH /api/settings/focus',
      })
      .toBe(1);
    const written = api.writes.find((w) => w.method === 'PATCH' && w.path === '/api/settings/focus');
    expect((written?.body as { dailyTarget?: number } | undefined)?.dailyTarget,
      'the PATCH did not carry the new daily target').toBe(5);
    await expect(page.getByText('Daily focus target updated')).toBeVisible();

    // Sound is a device preference and must reflect its own state.
    const sound = page.getByTestId('button-toggle-sound');
    await expect(sound).toHaveText(/Enabled/);
    await sound.click();
    await expect(sound).toHaveText(/Muted/);
    await sound.click();
    await expect(sound).toHaveText(/Enabled/);

    // Export is the one flow that leaves the app; prove it produces a file.
    const download = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByTestId('button-export-json').click();
    const file = await download;
    expect(file.suggestedFilename(), 'Export JSON produced no backup filename').toMatch(
      /^cadence-backup-\d{4}-\d{2}-\d{2}\.json$/,
    );
    await expect(page.getByText('Data exported successfully')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. Both themes + a screenshot per page per theme
// ---------------------------------------------------------------------------

test.describe('both themes render, and both are captured', () => {
  test('Calendar renders and is captured in dark and light', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/calendar', page.getByTestId('hour-slot-9'), 'its hour grid');
    await assertDarkDefault(page);
    await shoot(page, 'calendar-dark');

    await switchToLight(page);
    await expect(page.getByTestId('hour-slot-9'), 'the hour grid unmounted on the theme switch')
      .toBeVisible();
    await shoot(page, 'calendar-light');
  });

  test('Review renders and is captured in dark and light', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/review', page.getByTestId('review-task-103'), 'its completed-task ledger');
    await assertDarkDefault(page);
    await shoot(page, 'review-dark');

    await switchToLight(page);
    await expect(page.getByTestId('review-task-103'), 'the ledger unmounted on the theme switch')
      .toBeVisible();
    await shoot(page, 'review-light');
  });

  test('Profile renders and is captured in dark and light', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/profile', page.getByTestId('button-profile-export'), 'its identity card');
    await assertDarkDefault(page);
    await shoot(page, 'profile-dark');

    await switchToLight(page);
    await expect(page.getByTestId('button-profile-export'), 'the identity card unmounted on the theme switch')
      .toBeVisible();
    await shoot(page, 'profile-light');
  });

  test('Settings renders and is captured in dark and light', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/settings', page.getByTestId('input-timezone'), 'its timezone field');
    await assertDarkDefault(page);
    await shoot(page, 'settings-dark');

    await switchToLight(page);
    await expect(page.getByTestId('input-timezone'), 'the timezone field unmounted on the theme switch')
      .toBeVisible();
    await shoot(page, 'settings-light');
  });
});

// ---------------------------------------------------------------------------
// 3. Text contrast, WCAG 2.2 SC 1.4.3, in the live theme
// ---------------------------------------------------------------------------

async function assertTextContrast(
  page: Page,
  build: (p: Page) => Target[],
  pageName: string,
): Promise<void> {
  const specs = build(page);
  const dark = await measureTextTargets(page, specs);
  await switchToLight(page);
  const light = await measureTextTargets(page, specs);
  const all = [...withTheme(dark, 'dark'), ...withTheme(light, 'light')];

  console.log(all.map(formatContrast).join('\n'));

  const unmeasurable = all.filter((m) => !m.measurable);
  expect(
    unmeasurable.map((m) => `${m.label}: ${m.debug}`).join('\n'),
    table(
      all.map(formatContrast),
      `${pageName}: ${unmeasurable.length} text target(s) could not be measured at all.\n` +
        'A target that cannot be measured is not a pass.',
    ),
  ).toBe('');

  // An `approx` target is only excused when the helper itself reported that the
  // backdrop was unreliable. If it is measurable, the excuse is a bug in the
  // spec and fails here rather than silently widening the exclusion.
  const approxLabels = new Set(specs.filter((s) => s.approx).map((s) => s.label));
  const unjustified = all.filter(
    (m) => approxLabels.has(m.label.replace(/ \((dark|light)\)$/, '')) && !m.uncertainBecause,
  );
  expect(
    unjustified.map((m) => `${m.label} is flagged approx but measured cleanly`).join('\n'),
    table(
      all.map(formatContrast),
      `${pageName}: ${approxLabels.size} target(s) are flagged approx because they paint a\n` +
        'background-image. The flag is only honoured when the measurement is genuinely\n' +
        'unreliable, so this list must stay empty.',
    ),
  ).toBe('');

  const excused = all.filter(
    (m) => approxLabels.has(m.label.replace(/ \((dark|light)\)$/, '')) && m.uncertainBecause !== null,
  );
  if (excused.length) {
    console.log(
      `  note: ${excused.length} measurement(s) printed but not asserted, because the element ` +
        `paints a background-image: ${excused.map((m) => m.label).join(', ')}`,
    );
  }

  const failing = all.filter(
    (m) => m.measurable && !m.passes && !approxLabels.has(m.label.replace(/ \((dark|light)\)$/, '')),
  );
  expect(
    failing.map((m) => `${m.label}=${m.ratio} need ${m.required}`).join('; '),
    table(all.map(formatContrast), `${pageName}: measured text contrast, both themes.`),
  ).toBe('');
}

test.describe('text contrast (WCAG 2.2 SC 1.4.3: 4.5:1 body, 3:1 large)', () => {
  test('Calendar text is legible in both themes', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/calendar', page.getByTestId('hour-slot-9'), 'its hour grid');
    await assertTextContrast(page, CALENDAR_TEXT, 'Calendar');
  });

  /**
   * @known-defect ReviewPage.tsx:268 -- the Evening Ritual label uses
   * `text-success`, which resolves to `hsl(var(--success))`, and tokens.css
   * declares `--success: 142 69% 50%` IDENTICALLY in the dark block (line 177)
   * and the light block (line 248). Measured: rgb(40, 215, 104) on
   * rgb(255, 255, 255) = 1.91:1 at 12px/700, needing 4.5. The sibling Morning
   * Ritual label on the same card uses `text-accent`, which IS overridden for
   * light (measured rgb(0, 108, 224) = 4.97:1, passing), and a text-safe token
   * already exists and is unused here: `--status-success-text` is #30D158 in
   * dark and #1E7B34 in light (tokens.css:191 and :262). The other 22 of 23
   * targets pass in both themes. Remove the tag when the label uses the
   * text-safe success token.
   */
  test('Review text is legible in both themes', { tag: KNOWN_DEFECT }, async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/review', page.getByTestId('review-task-103'), 'its completed-task ledger');
    await assertTextContrast(page, REVIEW_TEXT, 'Review');
  });

  /**
   * @known-defect index.css:148 -- `.card-hig { background-color:
   * var(--component-surface-card) }`, and tokens.css declares
   * `--component-surface-card: #1C1C1E` in the `:root[data-theme="light"]` block
   * (line 292) with the SAME value as the dark block (line 221). So every
   * `.card-hig` on /profile stays near-black in light mode. ProfilePage is built
   * from 12 of them, so 15 of 34 measured targets fail in light and every one
   * traces to that one token: `text-foreground` (rgb(24,24,27)) lands on
   * rgb(28,28,30) = 1.04:1, and `--muted-foreground` lands at 2.93:1. This is the
   * identical defect `.card-enterprise` had (fixed, index.css:235), on the
   * sibling class that Profile uses instead. `--status-success-text` is a
   * second, independent cause here: the "Focus" stat value uses `text-success`
   * (rgb(40,215,104)) on the theme-aware `bg-muted` = 1.66:1. Dark passes all 34.
   * Remove the tag when the light block overrides both tokens.
   */
  test('Profile text is legible in both themes', { tag: KNOWN_DEFECT }, async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/profile', page.getByTestId('button-profile-export'), 'its identity card');
    await assertTextContrast(page, PROFILE_TEXT, 'Profile');
  });

  test('Settings text is legible in both themes', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/settings', page.getByTestId('input-timezone'), 'its timezone field');
    await assertTextContrast(page, SETTINGS_TEXT, 'Settings');
  });
});

// ---------------------------------------------------------------------------
// 4. Control boundaries, WCAG 2.2 SC 1.4.11 (3:1 non-text contrast)
// ---------------------------------------------------------------------------

async function assertBorderContrast(
  page: Page,
  build: (p: Page) => Target[],
  pageName: string,
): Promise<void> {
  const dark = await measureBorderTargets(page, build(page));
  await switchToLight(page);
  const light = await measureBorderTargets(page, build(page));
  const all = [...withTheme(dark, 'dark'), ...withTheme(light, 'light')];

  console.log(all.map(formatContrast).join('\n'));

  const unmeasurable = all.filter((m) => !m.measurable);
  expect(
    unmeasurable.map((m) => `${m.label}: ${m.debug}`).join('\n'),
    table(
      all.map(formatContrast),
      `${pageName}: ${unmeasurable.length} control boundary/boundaries could not be measured.\n` +
        'A control with no measurable boundary is not a pass.',
    ),
  ).toBe('');

  const failing = all.filter((m) => m.measurable && !m.passes);
  expect(
    failing.map((m) => `${m.label}=${m.ratio} need 3`).join('; '),
    table(
      all.map(formatContrast),
      `${pageName}: measured control-boundary contrast, both themes.\n` +
        'WCAG 1.4.11 floor is 3:1 against the adjacent surface.',
    ),
  ).toBe('');
}

test.describe('control boundaries (WCAG 2.2 SC 1.4.11, 3:1)', () => {
  test('Calendar control boundaries meet 3:1 in both themes', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/calendar', page.getByTestId('hour-slot-9'), 'its hour grid');
    await assertBorderContrast(page, CALENDAR_BORDERS, 'Calendar');
  });

  test('Review control boundaries meet 3:1 in both themes', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/review', page.getByTestId('review-task-103'), 'its completed-task ledger');
    await assertBorderContrast(page, REVIEW_BORDERS, 'Review');
  });

  /**
   * @known-defect Two independent causes, both measured:
   *
   * 1. `index.css:208` -- `.btn-secondary { border: 1px solid
   *    var(--border-subtle) }`. `--border-subtle` is rgba(255,255,255,0.08) in
   *    dark and rgba(0,0,0,0.08) in light, so the primary "Export Backup"
   *    button's ONLY affordance measures 1.27:1 in dark and 1.07:1 in light
   *    against its own surface. AGENTS.md section 5 states the rule as
   *    "border-control must stay >=3:1 against its surface -- it is not
   *    border-subtle", so this is a direct violation of a written requirement.
   *    Its surface is wrong for the same reason as the text failure above:
   *    `--component-surface-raised: #3A3A3C` is repeated unchanged in the light
   *    block (tokens.css:293).
   * 2. Low-alpha accent borders on tinted fills: "Sign Out" is
   *    `border-destructive/30` on `bg-destructive/10` = 1.51:1, and
   *    "Play Test Chime" is `border-primary/20` on `bg-primary/10` = 1.49:1, in
   *    BOTH themes.
   *
   * The two controls that do carry `--border-control` (the clerk-id chip and the
   * live clock) pass at 3.13:1 dark and 3.22:1 light, which is what makes the
   * three failures a token problem rather than a measurement problem.
   */
  test('Profile control boundaries meet 3:1 in both themes', { tag: KNOWN_DEFECT }, async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/profile', page.getByTestId('button-profile-export'), 'its identity card');
    await assertBorderContrast(page, PROFILE_BORDERS, 'Profile');
  });

  test('Settings control boundaries meet 3:1 in both themes', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/settings', page.getByTestId('input-timezone'), 'its timezone field');
    await assertBorderContrast(page, () => SETTINGS_BORDERS, 'Settings');
  });
});

// ---------------------------------------------------------------------------
// 5. Tap targets, 44px floor (AGENTS.md section 5)
// ---------------------------------------------------------------------------

async function assertTapTargets(
  page: Page,
  build: (p: Page) => Target[],
  pageName: string,
): Promise<void> {
  const dark = await measureTapTargets(page, build(page));
  await switchToLight(page);
  const light = await measureTapTargets(page, build(page));
  const all = [...withTheme(dark, 'dark'), ...withTheme(light, 'light')];

  console.log(all.map(formatMeasurement).join('\n'));

  const unmeasurable = all.filter((m) => !m.measurable);
  expect(
    unmeasurable.map((m) => `${m.label}: ${m.debug}`).join('\n'),
    table(
      all.map(formatMeasurement),
      `${pageName}: ${unmeasurable.length} control(s) could not be measured.\n` +
        'A control that is absent or unmeasurable is not a pass.',
    ),
  ).toBe('');

  const failing = all.filter((m) => m.measurable && !m.passes44);
  expect(
    failing.map((m) => `${m.label}=${Math.max(m.ownedSquare, m.ownedCircle)}px`).join('; '),
    table(
      all.map(formatMeasurement),
      `${pageName}: measured tap targets, both themes.\n` +
        'The number is max(owned square, owned circle): the largest fully-hit-tested\n' +
        'square or circle centred on the control, so a 44px round control is not\n' +
        'reported as 31.1px and called a failure.',
    ),
  ).toBe('');
}

test.describe('tap targets (44x44 floor, AGENTS.md section 5)', () => {
  test('Calendar controls present a 44px target in both themes', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/calendar', page.getByTestId('hour-slot-9'), 'its hour grid');
    await assertTapTargets(page, CALENDAR_TAPS, 'Calendar');
  });

  /**
   * @known-defect ReviewPage.tsx:170 and :186 -- the two Ledger scope tabs are
   * `px-2 py-0.5`, measuring 45.67x20 and 75.34x20 visual and 20px owned, in
   * both themes. WorkspacePanel accounts for the other three: the "New project"
   * field is `h-9` (36px), the colour swatches are `size-5` (22px owned), and a
   * tag's remove button is a bare `<X size={3} />` (12px). That last one is
   * `opacity-0 group-hover:opacity-100`, so it is additionally UNREACHABLE BY
   * TOUCH, where there is no hover: the control that deletes a tag has no
   * mobile affordance at all. "Plan Day" and "Close Day" (both `tap-target-expand`,
   * 44px) and the project submit button (44px) pass, so the page is not
   * uniformly non-compliant -- the tab strip and the workspace controls are.
   */
  test('Review controls present a 44px target in both themes', { tag: KNOWN_DEFECT }, async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/review', page.getByTestId('review-task-103'), 'its completed-task ledger');
    await assertTapTargets(page, REVIEW_TAPS, 'Review');
  });

  /**
   * @known-defect 8 of 11 measured Profile controls are under 44px, identically
   * in both themes, and none of them is a measurement artefact:
   *
   *   Export Backup      40px  `btn-secondary ... h-10`         (index.css:202)
   *   Sign Out           40px  `h-10`                            (ProfilePage:231)
   *   24h rhythm check   20px  `size-5` native checkbox          (ProfilePage:277)
   *   Play Test Chime    38px  `py-1.5 text-xs`                  (ProfilePage:437)
   *   Open Review link   16px  `text-xs` bare link               (ProfilePage:337)
   *   memory link        20px  `text-xs` bare link               (ProfilePage:314)
   *   cancel sign out    40px  `py-2 text-xs`                    (ProfilePage:545)
   *   dialog dismiss X   32px  `size-8`                          (ProfilePage:529)
   *
   * The 20px checkbox is the worst of them: it is the only control on the
   * chronotype card and it carries no label element, so neither its size nor its
   * accessible name is acceptable. The dismiss X is also the only icon-only
   * button on the page with NO accessible name at all, which is a WCAG 4.1.2
   * failure on top of the 32px target. "What Cadence Knows" / "Setup Wizard"
   * (82px cards) and "Confirm Sign Out" (44px) pass, so the page is partly
   * compliant. The next measurement down is 40px, i.e. nothing here is a
   * borderline rounding question.
   */
  test('Profile controls present a 44px target in both themes', { tag: KNOWN_DEFECT }, async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(
      open,
      page,
      '/profile',
      page.getByTestId('button-profile-signout'),
      'its sign-out button',
    );
    // The confirm dialog sits under a z-50 overlay that covers the header, so its
    // controls are measured with the dialog open and the dialog is closed again
    // before the theme is switched.
    const modalTargets = async (): Promise<Target[]> => {
      await page.getByTestId('button-profile-signout').click();
      await expect(page.getByTestId('button-confirm-signout')).toBeVisible();
      return [
        { label: 'confirm sign out', selector: '[data-testid="button-confirm-signout"]' },
        { label: 'cancel sign out', loc: page.getByRole('button', { name: 'Cancel', exact: true }) },
        // The dismiss X is icon-only with NO accessible name, so it cannot be
        // reached by role. Selected structurally: the only `size-8` button inside
        // the modal overlay. Its missing name is an a11y finding, not a test gap.
        { label: 'dialog dismiss X', selector: 'div.fixed.inset-0.z-50 button.size-8' },
      ];
    };
    const measured = await measureTapTargets(page, PROFILE_TAPS_PAGE(page));
    const darkModal = await measureTapTargets(page, await modalTargets());
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await switchToLight(page);
    const light = await measureTapTargets(page, PROFILE_TAPS_PAGE(page));
    const lightModal = await measureTapTargets(page, await modalTargets());
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    const all = [
      ...withTheme(measured, 'dark'),
      ...withTheme(darkModal, 'dark'),
      ...withTheme(light, 'light'),
      ...withTheme(lightModal, 'light'),
    ];
    console.log(all.map(formatMeasurement).join('\n'));

    const unmeasurable = all.filter((m) => !m.measurable);
    expect(
      unmeasurable.map((m) => `${m.label}: ${m.debug}`).join('\n'),
      table(all.map(formatMeasurement), `Profile: ${unmeasurable.length} control(s) could not be measured.`),
    ).toBe('');

    const failing = all.filter((m) => m.measurable && !m.passes44);
    expect(
      failing.map((m) => `${m.label}=${Math.max(m.ownedSquare, m.ownedCircle)}px`).join('; '),
      table(all.map(formatMeasurement), 'Profile: measured tap targets, both themes, dialog included.'),
    ).toBe('');
  });

  /**
   * @known-defect SettingsPage.tsx:318, :333 and :344 -- the three controls in
   * the "Daily Focus Target" row are `min-h-9 w-9` (36px) and
   * `btn-primary ... min-h-9` (36px), and none of them carries
   * `tap-target-expand`, so the largest owned shape is exactly 36px in both
   * themes. Every other Settings control measured reaches 44px, several of them
   * by expansion (`settings-row-toggle` is a 36x20 pill inside a 44px expanded
   * box, and correctly passes on the circle). The contrast and overflow halves of
   * this page are clean, so this is a sizing gap confined to one row.
   */
  test('Settings controls present a 44px target in both themes', { tag: KNOWN_DEFECT }, async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/settings', page.getByTestId('input-timezone'), 'its timezone field');
    await assertTapTargets(page, () => SETTINGS_TAPS, 'Settings');
  });
});

// ---------------------------------------------------------------------------
// 6. Mobile viewport, 390x844
//
// playwright.config.ts deliberately ships NO mobile project: the previous one
// failed for the wrong reason (the sidebar is `hidden lg:flex`, so every sidebar
// selector was legitimately absent and the hit-probe correctly reported "zero
// size"). The fix is not to re-enable that project but to assert only controls
// that genuinely exist at 390px, and to prove we really are at 390px before
// measuring anything -- see the sidebar/dock assertions below.
// ---------------------------------------------------------------------------

const MOBILE_VIEWPORT = { width: 390, height: 844 };

interface OverflowReport {
  scrollWidth: number;
  clientWidth: number;
  offenders: string[];
}

async function overflowReport(page: Page): Promise<OverflowReport> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const limit = de.clientWidth;
    const offenders: string[] = [];
    const all = document.querySelectorAll<HTMLElement>('body *');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= limit + 1) continue;
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : '';
      const tid = el.dataset.testid ? `[data-testid="${el.dataset.testid}"]` : '';
      offenders.push(
        `<${el.tagName.toLowerCase()}${tid}${cls}> left=${Math.round(r.left)} right=${Math.round(r.right)} width=${Math.round(r.width)} vs viewport ${limit}`,
      );
      if (offenders.length >= 10) break;
    }
    return { scrollWidth: de.scrollWidth, clientWidth: limit, offenders };
  });
}

test.describe('mobile viewport 390x844', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  /** Proves the mobile layout is genuinely in effect before anything is measured. */
  async function assertMobileLayout(page: Page): Promise<void> {
    expect(
      await page.evaluate(() => window.innerWidth),
      'the viewport was not actually narrowed, so a mobile "pass" would be a desktop pass',
    ).toBe(390);
    await expect(
      page.getByTestId('link-nav-today'),
      'the desktop sidebar is visible at 390px, so the mobile layout did not apply',
    ).toBeHidden();
    await expect(
      page.getByTestId('link-mobile-today'),
      'the mobile bottom dock is missing at 390px',
    ).toBeVisible();
    await expect(
      page.getByTestId('button-header-capture'),
      'the mobile-only header capture button is missing at 390px',
    ).toBeVisible();
  }

  async function assertNoOverflow(page: Page, where: string): Promise<void> {
    const report = await overflowReport(page);
    expect(
      report.scrollWidth,
      `${where} overflows horizontally at 390x844.\n` +
        `documentElement.scrollWidth=${report.scrollWidth} > clientWidth=${report.clientWidth}\n` +
        `Widest offenders:\n${report.offenders.join('\n') || '(none reported; the overflow is from a margin or scrollbar)'}`,
    ).toBeLessThanOrEqual(report.clientWidth);
  }

  test('Today offers 44px targets and no horizontal overflow at 390px', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/today', page.getByTestId('row-task-101'), 'its task list');
    await assertMobileLayout(page);
    await assertNoOverflow(page, '/today');

    const targets: Target[] = [
      { label: 'theme toggle', selector: '[data-testid="button-theme-toggle"]' },
      { label: 'header capture', selector: '[data-testid="button-header-capture"]' },
      { label: 'profile button', selector: '[data-testid="button-profile"]' },
      { label: 'quick capture field', selector: '[data-testid="input-quick-capture"]' },
      { label: 'complete task', selector: '[data-testid="button-complete-task-101"]' },
      { label: 'edit task (pencil)', selector: '[data-testid="button-pencil-task-101"]' },
      { label: 'delete task', selector: '[data-testid="button-delete-task-101"]' },
      { label: 'dock: Today', selector: '[data-testid="link-mobile-today"]' },
      { label: 'dock: Calendar', selector: '[data-testid="link-mobile-calendar"]' },
      { label: 'dock: centre capture', selector: '[data-testid="button-mobile-capture"]' },
      { label: 'dock: Focus', selector: '[data-testid="link-mobile-focus"]' },
      { label: 'dock: More', selector: '[data-testid="button-mobile-more"]' },
    ];
    const measured = await measureTapTargets(page, targets);
    console.log(measured.map(formatMeasurement).join('\n'));

    const unmeasurable = measured.filter((m) => !m.measurable);
    expect(
      unmeasurable.map((m) => `${m.label}: ${m.debug}`).join('\n'),
      table(measured.map(formatMeasurement), 'Today at 390x844: unmeasurable controls.'),
    ).toBe('');
    const failing = measured.filter((m) => m.measurable && !m.passes44);
    expect(
      failing.map((m) => `${m.label}=${Math.max(m.ownedSquare, m.ownedCircle)}px`).join('; '),
      table(measured.map(formatMeasurement), 'Today at 390x844: measured tap targets.'),
    ).toBe('');

    // Overflow must also hold after the dock is opened, which is the tallest
    // mobile-only surface in the shell.
    await page.getByTestId('button-mobile-more').click();
    await page.waitForTimeout(300);
    await assertNoOverflow(page, '/today with the mobile "More" sheet open');
  });

  /**
   * @known-defect The same three Settings "Daily Focus Target" controls as the
   * desktop test, and the failure is NOT fixed by the narrow viewport: at 390x844
   * they still measure 36x36 with 36px owned, because `min-h-9` is unconditional.
   * Everything else in this test passes at 390px -- no horizontal overflow on the
   * page or in month view, and 8 of 11 controls at 44px -- so mobile is not
   * uniformly worse here, it just does not rescue this row. Note what the
   * numbers also confirm: the quick-capture field and the task-row pencil/delete
   * on /today all reach 44px at this width, which is the improvement the
   * previously-removed mobile project recorded as outstanding.
   */
  test('Settings offers 44px targets and no horizontal overflow at 390px', { tag: KNOWN_DEFECT }, async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/settings', page.getByTestId('input-timezone'), 'its timezone field');
    await assertMobileLayout(page);
    await assertNoOverflow(page, '/settings');

    const measured = await measureTapTargets(page, SETTINGS_TAPS);
    console.log(measured.map(formatMeasurement).join('\n'));

    const unmeasurable = measured.filter((m) => !m.measurable);
    expect(
      unmeasurable.map((m) => `${m.label}: ${m.debug}`).join('\n'),
      table(measured.map(formatMeasurement), 'Settings at 390x844: unmeasurable controls.'),
    ).toBe('');
    const failing = measured.filter((m) => m.measurable && !m.passes44);
    expect(
      failing.map((m) => `${m.label}=${Math.max(m.ownedSquare, m.ownedCircle)}px`).join('; '),
      table(measured.map(formatMeasurement), 'Settings at 390x844: measured tap targets.'),
    ).toBe('');
  });

  test('Calendar offers 44px targets and no horizontal overflow at 390px', async ({ page, open }) => {
    await installMockApi(page);
    await page.addInitScript(CONTRAST_HELPER);
    await boot(open, page, '/calendar', page.getByTestId('hour-slot-9'), 'its hour grid');
    await assertMobileLayout(page);
    await assertNoOverflow(page, '/calendar');

    const measured = await measureTapTargets(page, CALENDAR_TAPS(page));
    console.log(measured.map(formatMeasurement).join('\n'));

    const unmeasurable = measured.filter((m) => !m.measurable);
    expect(
      unmeasurable.map((m) => `${m.label}: ${m.debug}`).join('\n'),
      table(measured.map(formatMeasurement), 'Calendar at 390x844: unmeasurable controls.'),
    ).toBe('');
    const failing = measured.filter((m) => m.measurable && !m.passes44);
    expect(
      failing.map((m) => `${m.label}=${Math.max(m.ownedSquare, m.ownedCircle)}px`).join('; '),
      table(measured.map(formatMeasurement), 'Calendar at 390x844: measured tap targets.'),
    ).toBe('');

    // The month grid is the densest layout in the app: 7 columns at 390px.
    await page.getByRole('button', { name: 'month', exact: true }).click();
    await page.waitForTimeout(300);
    await assertNoOverflow(page, '/calendar in month view');
  });
});
