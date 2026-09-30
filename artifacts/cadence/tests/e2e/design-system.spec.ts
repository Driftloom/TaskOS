import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONTRAST_HELPER,
  KNOWN_DEFECT,
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
 * Design-system conformance, measured in the browser.
 *
 * THIS SUITE IS EXPECTED TO FAIL AGAINST THE CURRENT CODE. That is the finding,
 * not a defect in the tests. Three concrete, reproducible problems were measured
 * on 2026-09-30 and are asserted below without weakening:
 *
 *   1. The light theme is not functional. `index.css:212` hardcodes
 *      `.card-enterprise { background-color: #121214 }` with no light override,
 *      and `SectionHeading` / AppShell hardcode `text-white`. Result: white
 *      headings on a #F5F5F7 canvas (ratio 1.09) and #18181B text on the dark
 *      card (ratio 1.06). Both are below the WCAG AA floor of 4.5:1 and are
 *      invisible to a human.
 *   2. `border-control` misses WCAG 1.4.11 in light mode: 2.84:1 against the
 *      light `--muted` surface, against a 3:1 floor.
 *   3. Several primary controls measure 24-32px, not 44px. See the
 *      TAP_TARGETS table; the 44px floor is the one AGENTS.md states.
 *
 * What is asserted is only what was measured. Nothing here checks a class name.
 */

const SHOTS = path.join('test-results', 'screens');

/** Every measurement, plus the numbers, in one failure message. */
function table(rows: string[], headline: string): string {
  return (
    headline +
    '\n\n' +
    rows.join('\n') +
    '\n\nMeasured with document.elementFromPoint / getComputedStyle in ' +
    'artifacts/cadence/tests/e2e/design-system.spec.ts.'
  );
}

// ---------------------------------------------------------------------------
// Elements to measure. Selectors point at real testids, not at class names.
// ---------------------------------------------------------------------------

/**
 * Representative text on Today. `SectionHeading`'s h1 is first because it is
 * the largest, most prominent string on the screen: if the theme is broken that
 * is where it shows.
 */
const TODAY_TEXT: [string, string][] = [
  ['Today page heading', 'h1'],
  ['sidebar nav item', '[data-testid="link-nav-inbox"]'],
  ['task title row', '[data-testid^="row-task-"] button span span'],
  ['task metadata line', '[data-testid^="row-task-"] .font-mono'],
  ['momentum heading', '[data-testid="card-momentum"] .font-mono'],
  ['momentum done count', '[data-testid="card-momentum"] p'],
  ['assistant heading', '[data-testid="agent-panel"] h2'],
  ['assistant trust boundary', '[data-testid="agent-trust-boundary"]'],
  ['quick capture field', '[data-testid="input-quick-capture"]'],
  ['Next Up card title', '[data-testid="card-momentum"]'],
];

/**
 * Interactive control borders. WCAG 1.4.11 applies to the boundary of a control
 * a user must be able to identify, so decorative card outlines are deliberately
 * NOT in this list; see README.md for why that distinction matters here.
 */
const TODAY_BORDER_CONTROLS: [string, string][] = [
  ['theme toggle', '[data-testid="button-theme-toggle"]'],
  ['sidebar New task', '[data-testid="button-sidebar-capture"]'],
  ['assistant Log button', '[data-testid="agent-log-toggle"]'],
  ['assistant Undo last', '[data-testid="agent-undo-last"]'],
  ['assistant composer', '[data-testid="agent-composer"]'],
];

const FOCUS_TEXT: [string, string][] = [
  ['Focus page heading', 'h1'],
  ['timer task title', '[data-testid="focus-timer"] .text-title3'],
  ['timer digits', '[data-testid="focus-timer-digits"]'],
  ['Begin focus label', '[data-testid="button-begin-focus"]'],
  ['Read time label', '[data-testid="button-focus-read-time"]'],
];

const FOCUS_BORDER_CONTROLS: [string, string][] = [
  ['Finish round', '[data-testid="button-complete-focus"]'],
  ['Read time', '[data-testid="button-focus-read-time"]'],
  ['Back to today', '[data-testid="link-return-today"]'],
  ['daily target minus', '[data-testid="button-target-minus"]'],
  ['daily target plus', '[data-testid="button-target-plus"]'],
  ['status chip', '[data-testid="focus-timer"] span.rounded-full'],
];

/** A representative spread: header, sidebar, task row, agent panel, capture. */
const TODAY_TAPS: [string, string][] = [
  ['theme toggle', '[data-testid="button-theme-toggle"]'],
  ['command palette button', 'button[aria-label="Command palette"]'],
  ['profile button', '[data-testid="button-profile"]'],
  ['collapse sidebar', '[data-testid="button-collapse-sidebar"]'],
  ['sidebar New task', '[data-testid="button-sidebar-capture"]'],
  ['sidebar nav item', '[data-testid="link-nav-inbox"]'],
  ['complete task checkbox', '[data-testid^="button-complete-task-"]'],
  ['task edit (pencil)', '[data-testid^="button-pencil-task-"]'],
  ['task delete', '[data-testid^="button-delete-task-"]'],
  ['Add task', '[data-testid="button-add-task"]'],
  ['Plan Day', 'button[title="Plan My Day Ritual"]'],
  ['quick capture field', '[data-testid="input-quick-capture"]'],
  ['assistant Undo last', '[data-testid="agent-undo-last"]'],
  ['assistant Send', '[data-testid="agent-send"]'],
];

const FOCUS_TAPS: [string, string][] = [
  ['Begin focus', '[data-testid="button-begin-focus"]'],
  ['Finish round', '[data-testid="button-complete-focus"]'],
  ['Read time', '[data-testid="button-focus-read-time"]'],
  ['Back to today', '[data-testid="link-return-today"]'],
  ['daily target minus', '[data-testid="button-target-minus"]'],
  ['daily target plus', '[data-testid="button-target-plus"]'],
];

// ---------------------------------------------------------------------------

async function bootToday(page: import('@playwright/test').Page) {
  await page.addInitScript(CONTRAST_HELPER);
  await installMockApi(page);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cadence_test_auth', 'true');
    } catch {
      /* the ?test_auth=true query param is the fallback */
    }
  });
  await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
  await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-testid^="row-task-"]').first()).toBeVisible();
}

async function bootFocus(page: import('@playwright/test').Page) {
  await page.addInitScript(CONTRAST_HELPER);
  await installMockApi(page);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cadence_test_auth', 'true');
    } catch {
      /* the ?test_auth=true query param is the fallback */
    }
  });
  await page.goto('/focus?test_auth=true', { waitUntil: 'commit' });
  await expect(page.getByTestId('focus-timer')).toBeVisible({ timeout: 45_000 });
}

/** Reads the live theme, which the app encodes as attribute-present vs absent. */
async function currentTheme(page: import('@playwright/test').Page): Promise<'light' | 'dark'> {
  const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  return attr === 'light' ? 'light' : 'dark';
}

async function measureText(
  page: import('@playwright/test').Page,
  targets: [string, string][],
): Promise<ContrastMeasurement[]> {
  const out: ContrastMeasurement[] = [];
  for (const [label, selector] of targets) {
    out.push(await measureTextContrast(page, selector, label));
  }
  return out;
}

async function measureBorders(
  page: import('@playwright/test').Page,
  targets: [string, string][],
): Promise<BorderContrastMeasurement[]> {
  const out: BorderContrastMeasurement[] = [];
  for (const [label, selector] of targets) {
    out.push(await measureBorderContrast(page, selector, label));
  }
  return out;
}

async function measureTaps(
  page: import('@playwright/test').Page,
  targets: [string, string][],
): Promise<TargetMeasurement[]> {
  const out: TargetMeasurement[] = [];
  for (const [label, selector] of targets) {
    out.push(await measureTapTarget(page, selector, label));
  }
  return out;
}

async function shoot(page: import('@playwright/test').Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  // Today is a long page and Chromium's full-page capture is not instant, so
  // this gets its own generous budget rather than inheriting the 15s action
  // timeout that the default supplies.
  await page.screenshot({ path: file, fullPage: true, timeout: 90_000 });
  console.log(`  screenshot: ${file}`);
}

// ---------------------------------------------------------------------------

test.describe('theme', () => {
  test('both themes render and the toggle switches between them', async ({ page }) => {
    await bootToday(page);

    // Dark is the default: tokens.css puts dark on :root and the ThemeProvider
    // REMOVES the attribute rather than setting data-theme="dark".
    await expect
      .poll(() => currentTheme(page), {
        message: 'the app did not start in dark mode',
        timeout: 45_000,
      })
      .toBe('dark');
    expect(
      await page.evaluate(() => document.documentElement.hasAttribute('data-theme')),
      'dark mode must not carry a data-theme attribute',
    ).toBe(false);

    await shoot(page, 'today-dark');

    // Toggle to light.
    const toggle = page.getByTestId('button-theme-toggle');
    await expect(toggle).toHaveAttribute('aria-label', /light appearance/i);
    await toggle.click();
    await expect
      .poll(() => currentTheme(page), { message: 'the theme toggle did not switch to light' })
      .toBe('light');
    await expect(toggle).toHaveAttribute('aria-label', /dark appearance/i);

    // The tokens must actually resolve differently, not just the attribute.
    const lightBg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(lightBg, 'the light background token did not resolve').toBe('rgb(245, 245, 245)');

    // The choice must survive a reload.
    await page.reload({ waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });
    expect(await currentTheme(page), 'the light theme did not persist across a reload').toBe('light');

    await shoot(page, 'today-light');

    // And back to dark.
    await page.getByTestId('button-theme-toggle').click();
    await expect.poll(() => currentTheme(page)).toBe('dark');
    const darkBg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(darkBg, 'the dark background token did not resolve').toBe('rgb(0, 0, 0)');
  });

  test('the Focus page renders in both themes', async ({ page }) => {
    await bootFocus(page);
    await shoot(page, 'focus-dark');

    await page.getByTestId('button-theme-toggle').click();
    await expect.poll(() => currentTheme(page)).toBe('light');
    await shoot(page, 'focus-light');

    // The timer must still be mounted and in a real state after the switch; a
    // theme change that unmounts the feature is a bug this catches.
    await expect(page.getByTestId('focus-timer')).toBeVisible();
    await expect(page.getByTestId('focus-timer')).toHaveAttribute('data-state', /idle|running|paused/);
  });
});

// ---------------------------------------------------------------------------

test.describe('text contrast (WCAG 2.2 SC 1.4.3)', () => {
  test('Today text is legible in the dark theme', async ({ page }) => {
    await bootToday(page);
    const results = await measureText(page, TODAY_TEXT);
    console.log(results.map(formatContrast).join('\n'));

    const failures = results.filter((r) => !r.passes);
    expect(
      failures.map((f) => failures.length ? `${f.label} ratio=${f.ratio} (need ${f.required})` : '').join('; '),
      table(results.map(formatContrast), 'Dark-theme contrast on Today:'),
    ).toBe('');
  });

  test('Today text is legible in the light theme', { tag: KNOWN_DEFECT }, async ({ page }) => {
    await bootToday(page);
    await page.getByTestId('button-theme-toggle').click();
    await expect.poll(() => currentTheme(page)).toBe('light');
    // Let the transition settle so nothing is sampled mid-animation.
    await page.waitForTimeout(400);

    const results = await measureText(page, TODAY_TEXT);
    console.log(results.map(formatContrast).join('\n'));

    const failures = results.filter((r) => !r.passes);
    expect(
      failures.map((f) => `${f.label}=${f.ratio} need ${f.required}`).join('; '),
      table(
        results.map(formatContrast),
        'Light-theme contrast on Today FAILS. Root cause: index.css:212 hardcodes\n' +
          '.card-enterprise { background-color: #121214 } with no light override, and\n' +
          'SectionHeading (components/shared/StateViews.tsx:24) hardcodes text-white.',
      ),
    ).toBe('');
  });

  test('Focus text is legible in both themes', { tag: KNOWN_DEFECT }, async ({ page }) => {
    await bootFocus(page);
    const dark = await measureText(page, FOCUS_TEXT);

    await page.getByTestId('button-theme-toggle').click();
    await expect.poll(() => currentTheme(page)).toBe('light');
    await page.waitForTimeout(400);
    const light = await measureText(page, FOCUS_TEXT);

    const all = [...dark.map((d) => ({ ...d, label: `${d.label} (dark)` })), ...light.map((l) => ({ ...l, label: `${l.label} (light)` }))];
    console.log(all.map(formatContrast).join('\n'));

    expect(
      all.filter((r) => !r.passes).map((f) => `${f.label}=${f.ratio} need ${f.required}`).join('; '),
      table(
        all.map(formatContrast),
        'Focus contrast. The light failures are the same .card-enterprise defect as\n' +
          'Today: the timer card stays #121214 while its text switches to light-theme ink.',
      ),
    ).toBe('');
  });
});

// ---------------------------------------------------------------------------

test.describe('control borders (WCAG 2.2 SC 1.4.11, 3:1 non-text contrast)', () => {
  test('border-control meets 3:1 in the dark theme', { tag: KNOWN_DEFECT }, async ({ page }) => {
    await bootToday(page);
    const today = await measureBorders(page, TODAY_BORDER_CONTROLS);

    await page.getByTestId('link-nav-focus').click();
    await expect(page.getByTestId('focus-timer')).toBeVisible({ timeout: 45_000 });
    const focus = await measureBorders(page, FOCUS_BORDER_CONTROLS);

    const all = [
      ...today.map((t) => ({ ...t, label: `${t.label} (Today)` })),
      ...focus.map((f) => ({ ...f, label: `${f.label} (Focus)` })),
    ];
    console.log(all.map(formatContrast).join('\n'));

    expect(
      all.filter((r) => !r.passes).map((f) => `${f.label}=${f.ratio}`).join('; '),
      table(all.map(formatContrast), 'Dark-theme border-control contrast:'),
    ).toBe('');
  });

  test('border-control meets 3:1 in the light theme', { tag: KNOWN_DEFECT }, async ({ page }) => {
    await bootToday(page);
    await page.getByTestId('button-theme-toggle').click();
    await expect.poll(() => currentTheme(page)).toBe('light');
    await page.waitForTimeout(400);
    const today = await measureBorders(page, TODAY_BORDER_CONTROLS);

    await page.getByTestId('link-nav-focus').click();
    await expect(page.getByTestId('focus-timer')).toBeVisible({ timeout: 45_000 });
    const focus = await measureBorders(page, FOCUS_BORDER_CONTROLS);

    const all = [
      ...today.map((t) => ({ ...t, label: `${t.label} (Today)` })),
      ...focus.map((f) => ({ ...f, label: `${f.label} (Focus)` })),
    ];
    console.log(all.map(formatContrast).join('\n'));

    expect(
      all.filter((r) => !r.passes).map((f) => `${f.label}=${f.ratio} need 3`).join('; '),
      table(
        all.map(formatContrast),
        'Light-theme border-control contrast FAILS. --border-control is #8E8E93 in\n' +
          'light, which is 3.26:1 on white but only 2.84:1 on the light --muted\n' +
          'surface the agent controls sit on. WCAG 1.4.11 floor is 3:1.',
      ),
    ).toBe('');
  });
});

// ---------------------------------------------------------------------------

test.describe('tap targets (44x44 floor, AGENTS.md section 5)', () => {
  test('Today controls present a 44px target in both themes', { tag: KNOWN_DEFECT }, async ({ page }) => {
    await bootToday(page);
    const dark = await measureTaps(page, TODAY_TAPS);

    await page.getByTestId('button-theme-toggle').click();
    await expect.poll(() => currentTheme(page)).toBe('light');
    await page.waitForTimeout(300);
    const light = await measureTaps(page, TODAY_TAPS);

    const all = [
      ...dark.map((d) => ({ ...d, label: `${d.label} (dark)` })),
      ...light.map((l) => ({ ...l, label: `${l.label} (light)` })),
    ];
    console.log(all.map(formatMeasurement).join('\n'));

    expect(
      all.filter((r) => !r.passes44).map((f) => `${f.label}=${Math.max(f.ownedSquare, f.ownedCircle)}px`).join('; '),
      table(
        all.map(formatMeasurement),
        'Tap targets below 44px. Measured as the largest fully-hit-tested square or\n' +
          'circle centred on the control (document.elementFromPoint), which is what a\n' +
          'finger can press. A CSS class name is not evidence and is not used here.\n' +
          'Controls that DO use index.css .tap-target-expand measure exactly 44 and pass.',
      ),
    ).toBe('');
  });

  test('Focus controls present a 44px target in both themes', async ({ page }) => {
    await bootFocus(page);
    const dark = await measureTaps(page, FOCUS_TAPS);

    await page.getByTestId('button-theme-toggle').click();
    await expect.poll(() => currentTheme(page)).toBe('light');
    await page.waitForTimeout(300);
    const light = await measureTaps(page, FOCUS_TAPS);

    const all = [
      ...dark.map((d) => ({ ...d, label: `${d.label} (dark)` })),
      ...light.map((l) => ({ ...l, label: `${l.label} (light)` })),
    ];
    console.log(all.map(formatMeasurement).join('\n'));

    expect(
      all.filter((r) => !r.passes44).map((f) => `${f.label}=${Math.max(f.ownedSquare, f.ownedCircle)}px`).join('; '),
      table(all.map(formatMeasurement), 'Focus tap targets:'),
    ).toBe('');
  });
});
