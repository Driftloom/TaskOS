import AxeBuilder from '@axe-core/playwright';
import type { AxeResults, Result } from 'axe-core';
import { expect, installMockApi, test } from './fixtures';

/**
 * tests/e2e/a11y-audit.spec.ts -- an automated WCAG 2.0/2.1/2.2 AA audit.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The suite measured contrast (1.4.3), control boundaries (1.4.11) and tap
 * targets (2.5.5) by hand, in both themes, on every route -- but it never ran an
 * audit and it never pressed a key. Those are the two cheapest possible ways to
 * find a whole class of defects: everything axe can decide mechanically
 * (roles, names, labels, contrast, target size, heading order, landmark
 * structure) and everything that only shows up under a keyboard. Both were
 * untested, and both found real defects the first time they ran -- see
 * README.md, "Added 2026-10-01: a11y-audit.spec.ts".
 *
 * WHAT IS ASSERTED
 * ----------------
 *   `violations.length === 0` for the tag set
 *   ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
 *   on every route, in BOTH themes.
 *
 *   "Every rule axe can evaluate automatically." Anything axe cannot decide is
 *   reported as `incomplete`, never as a pass -- the two are different claims
 *   and conflating them is how an audit turns into a rubber stamp.
 *
 *   Note what is NOT in the tag set: `best-practice`. Rules like
 *   `region`/`landmark-one-main` are WCAG-best-practice, not AA, and mixing them
 *   in would make this file a style opinion rather than a conformance check.
 *
 * THE THEME IS SET THROUGH THE APP'S OWN STORE
 * --------------------------------------------
 * `ThemeProvider` reads `localStorage['cadence.theme']` on first paint and
 * removes/sets `data-theme` from it. Setting the key and reloading is therefore
 * the only route to the light theme that cannot be defeated by a toggle that has
 * not rendered yet -- which is exactly the bug the first draft of this file hit
 * on `/`, where there is no header toggle at all. The test then ASSERTS the
 * live `data-theme` value, so "we audited light mode" cannot be a claim about a
 * page that is still dark.
 *
 * THE FAILURE MESSAGE IS THE DATA
 * -------------------------------
 * A failure prints, per rule: impact, node count, the WCAG tags, and every
 * offending node's target selector, HTML and axe's own computed-ratio reason.
 * "PASS" therefore never means "axe returned no array", it means "axe returned
 * an empty array on a page proven to be in the theme named in the test title".
 */

/** WCAG 2.0 A + AA, 2.1 A + AA, 2.2 AA. Not `best-practice`. */
const AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

const THEME_KEY = 'cadence.theme';

export type Theme = 'dark' | 'light';

async function audit(page: import('@playwright/test').Page): Promise<AxeResults> {
  return new AxeBuilder({ page }).withTags([...AA_TAGS]).analyze();
}

/**
 * Proves the theme the audit is about to run against is the theme actually
 * live.
 *
 * The check is on the RESOLVED `--background`, not on the `data-theme`
 * attribute, because dark is encoded as "no attribute" -- asserting its absence
 * would pass instantly on a document that has not painted at all, which is
 * exactly the race that made the first version of this file audit `/focus` as
 * light while it was still dark. `design-system.spec.ts` already establishes
 * that these two byte values are what the tokens resolve to per theme, so this
 * is a positive signal in BOTH themes.
 */
const BACKGROUND_BY_THEME: Record<Theme, string> = {
  dark: 'rgb(0, 0, 0)',
  light: 'rgb(245, 245, 245)',
};

async function assertLiveTheme(
  page: import('@playwright/test').Page,
  route: string,
  theme: Theme,
): Promise<void> {
  const want = BACKGROUND_BY_THEME[theme];
  await expect
    .poll(
      () =>
        page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
      {
        message:
          `${route} never resolved to the ${theme} canvas (${want}). The theme is applied ` +
          'by ThemeProvider in an effect after first paint, so polling the resolved token ' +
          'is the only way to know the audit is about to measure the right theme.',
        timeout: 45_000,
      },
    )
    .toBe(want);
}

/**
 * Opens `route` in the app's DEFAULT theme (dark), which needs no store write
 * at all -- `readInitialTheme` returns `dark` when nothing is stored -- and then
 * proves it by the resolved canvas.
 *
 * This is also the cheaper half of the theme dance: the first navigation costs
 * one document load instead of two, because there is nothing to set before it.
 * See `auditBothThemes`; the Vite dev server is shared by every worker and every
 * document load re-transforms the route chunk.
 */
async function bootDark(page: import('@playwright/test').Page, route: string): Promise<void> {
  await page.goto(`${route}?test_auth=true`, { waitUntil: 'commit' });
  await assertLiveTheme(page, route, 'dark');
}

/**
 * Switches the live document to the other theme through the app's own store and
 * reloads. Deliberately one reload, not a fresh navigation plus a reload.
 */
async function switchToLight(page: import('@playwright/test').Page, route: string): Promise<void> {
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [THEME_KEY, 'light']);
  await page.reload({ waitUntil: 'commit' });
  await assertLiveTheme(page, route, 'light');
}

/** One fixed-width report row per rule, plus one per offending node. */
function report(results: AxeResults, route: string, theme: Theme): string {
  const lines: string[] = [];
  lines.push(`${route} (${theme}) -- axe-core WCAG 2.0/2.1/2.2 AA`);
  lines.push(
    `  passes=${results.passes.length} violations=${results.violations.length} ` +
      `incomplete=${results.incomplete.length} inapplicable=${results.inapplicable.length}`,
  );
  for (const v of results.violations) {
    lines.push(`  [${v.impact}] ${v.id}  nodes=${v.nodes.length}  tags=${v.tags.join(',')}`);
    lines.push(`      help: ${v.help} -- ${v.helpUrl}`);
    for (const n of v.nodes) {
      lines.push(`      target: ${JSON.stringify(n.target)}`);
      lines.push(`      html:   ${n.html.replace(/\s+/g, ' ').slice(0, 260)}`);
      if (n.failureSummary) {
        for (const l of n.failureSummary.split('\n').filter(Boolean)) {
          lines.push(`        ${l.trim()}`);
        }
      }
    }
  }
  if (results.incomplete.length) {
    lines.push('  -- incomplete (axe could NOT decide; these are NOT passes) --');
    for (const inc of results.incomplete) {
      lines.push(`  INCOMPLETE [${inc.impact}] ${inc.id}  nodes=${inc.nodes.length}`);
      for (const n of inc.nodes.slice(0, 4)) {
        lines.push(`      target: ${JSON.stringify(n.target)}`);
        lines.push(`      html:   ${n.html.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Audits one screen in both themes and asserts zero violations.
 *
 * Two document loads per screen, not four: the dark pass is a single navigation
 * (dark is the default, so nothing has to be written to the store first) and the
 * light pass is one reload after writing it. Every worker shares one Vite dev
 * server, and each document load re-transforms that route's chunk, so load count
 * is the cheapest thing to economise on here without touching an assertion.
 *
 * `prepare` runs AFTER the theme is applied and BEFORE the audit, so a screen
 * that only exists after an interaction is audited in the state a user actually
 * sees it in. It must THROW if it cannot reach that state -- a screen that
 * silently failed to open would otherwise be audited as its parent and reported
 * green.
 */
async function auditBothThemes(
  page: import('@playwright/test').Page,
  route: string,
  screen: string,
  ready: import('@playwright/test').Locator,
  readyDesc: string,
  prepare?: (page: import('@playwright/test').Page) => Promise<void>,
): Promise<void> {
  const blocks: string[] = [];

  const measure = async (theme: Theme): Promise<void> => {
    await expect(
      ready,
      `${route}${screen} mounted the shell but never rendered ${readyDesc}, so auditing ` +
        'its parent instead would be a vacuous pass',
    ).toBeVisible({ timeout: 30_000 });
    if (prepare) await prepare(page);
    // Let react-query and any transition settle before measuring.
    await page.waitForTimeout(600);
    blocks.push(report(await audit(page), `${route}${screen}`, theme));
  };

  await bootDark(page, route);
  await measure('dark');

  await switchToLight(page, route);
  await measure('light');

  console.log(blocks.join('\n\n'));

  // Re-assert so the assertion message can carry the whole table.
  const lines = blocks.join('\n\n').split('\n');
  const offending = lines.filter((l) => /^ {2}\[(critical|serious|moderate|minor)\]/.test(l));
  expect(
    offending.join('\n'),
    `axe found ${offending.length} rule violation(s) against the WCAG 2.0/2.1/2.2 AA tag set.\n\n` +
      blocks.join('\n\n'),
  ).toBe('');
}

/** The shell's own control: proves AppShell mounted, on every protected route. */
const SHELL = (page: import('@playwright/test').Page) => page.getByTestId('button-theme-toggle');

test.describe('automated WCAG 2.0/2.1/2.2 AA audit (axe-core)', () => {
  /**
   * The same two prerequisites every other spec in this suite establishes, and
   * for the same reasons.
   *
   * 1. `installMockApi` -- with the API unreachable, Vite's SPA fallback answers
   *    `GET /api/tasks` with index.html and HTTP 200, `customFetch` hands the
   *    HTML to `TodayPage` as a string, and `.map` throws. The audited page would
   *    be the error boundary, which is a completely different accessibility
   *    surface from the real one.
   * 2. The Clerk bypass, seeded before any page script runs, so the protected
   *    shell actually mounts. DEV-only, so it cannot become a production bypass.
   */
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* storage unavailable; the ?test_auth=true query param still works */
      }
    });
  });

  test('landing / has no violations in either theme', async ({ page }) => {
    await auditBothThemes(
      page,
      '/',
      '',
      page.getByRole('heading', { level: 1 }),
      'its landing headline',
    );
  });

  test('/today has no violations in either theme', async ({ page }) => {
    await auditBothThemes(
      page,
      '/today',
      '',
      page.getByTestId('row-task-101'),
      'its task list',
    );
  });

  test('/inbox has no violations in either theme', async ({ page }) => {
    await auditBothThemes(page, '/inbox', '', SHELL(page), 'the app shell');
  });

  test('/focus has no violations in either theme', async ({ page }) => {
    await auditBothThemes(
      page,
      '/focus',
      '',
      page.getByTestId('focus-timer'),
      'its focus timer',
    );
  });

  test('/calendar has no violations in either theme', async ({ page }) => {
    await auditBothThemes(
      page,
      '/calendar',
      '',
      page.getByTestId('hour-slot-9'),
      'its hour grid',
    );
  });

  test('/review has no violations in either theme', async ({ page }) => {
    await auditBothThemes(
      page,
      '/review',
      '',
      page.getByTestId('review-task-103'),
      'its completed-task ledger',
    );
  });

  test('/memory has no violations in either theme', async ({ page }) => {
    await auditBothThemes(page, '/memory', '', SHELL(page), 'the app shell');
  });

  /**
   * `/onboarding` is three screens behind one URL, so all three are audited.
   *
   * The 24-hour switch is turned OFF first on purpose: the work-start / work-end
   * time inputs only render in that branch, so leaving it on would hide two
   * labelled controls from the audit entirely -- the same class of blind spot as
   * auditing a route that never rendered.
   */
  test('/onboarding has no violations on any of its three steps', async ({ page }) => {
    const blocks: string[] = [];

    const walkAllSteps = async (theme: Theme): Promise<void> => {
      await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 45_000 });

      await page.getByRole('checkbox').first().uncheck();
      await expect(
        page.locator('input[type="time"]'),
        'turning the 24-hour switch off revealed no work-window inputs, so the ' +
          'labelling of those controls was never audited',
      ).toHaveCount(2);

      for (const step of [1, 2, 3] as const) {
        if (step > 1) {
          await page.getByRole('button', { name: 'Next Step' }).click();
          await expect(
            page.getByText(new RegExp(`Step ${step} of 3`)),
            `onboarding never advanced to step ${step}`,
          ).toBeVisible({ timeout: 15_000 });
        }
        await page.waitForTimeout(400);
        blocks.push(report(await audit(page), `/onboarding step ${step}`, theme));
      }
    };

    await bootDark(page, '/onboarding');
    await walkAllSteps('dark');
    await switchToLight(page, '/onboarding');
    await walkAllSteps('light');

    console.log(blocks.join('\n\n'));
    const offending = blocks
      .join('\n\n')
      .split('\n')
      .filter((l) => /^ {2}\[(critical|serious|moderate|minor)\]/.test(l));
    expect(
      offending.join('\n'),
      `axe found ${offending.length} rule violation(s) on /onboarding.\n\n${blocks.join('\n\n')}`,
    ).toBe('');
  });

  test('/profile has no violations in either theme', async ({ page }) => {
    await auditBothThemes(
      page,
      '/profile',
      '',
      page.getByTestId('button-profile-export'),
      'its identity card',
    );
  });

  test('/settings has no violations in either theme', async ({ page }) => {
    await auditBothThemes(
      page,
      '/settings',
      '',
      page.getByTestId('input-timezone'),
      'its timezone field',
    );
  });
});

/**
 * Rule coverage, asserted rather than assumed.
 *
 * The tag set is what makes this file an AA conformance check; a typo in it (or
 * an `axe-core` upgrade that renames a tag) would silently reduce coverage to
 * nothing while the suite stayed green.
 *
 * Two separate claims, and they need separate evidence:
 *
 *   1. THE TAG SET RESOLVES TO RULES. Read back off `AxeBuilder.getRules()`,
 *      which is the rule catalogue for the configured tags and is independent of
 *      any page -- so this cannot be moved by a page that happens to render
 *      fewer elements. It also asserts every rule it returns is tagged for AA,
 *      which is what keeps `best-practice` out.
 *   2. THE AUDIT ACTUALLY RAN ON A REAL PAGE. `applied` counts only
 *      passes + violations + incomplete; `inapplicable` is excluded, because a
 *      rule with no matching elements is not evidence of anything. The floor is
 *      set below the smallest count measured across all 24 screens (15 on the
 *      landing page) so it is a liveness check, not a per-page constant.
 */
test('the AA tag set resolves to AA rules, and the audit runs', async ({ page }) => {
  await installMockApi(page);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cadence_test_auth', 'true');
    } catch {
      /* storage unavailable; the ?test_auth=true query param still works */
    }
  });

  await bootDark(page, '/today');
  await expect(page.getByTestId('row-task-101')).toBeVisible({ timeout: 30_000 });

  const results = await audit(page);
  const applied: Result[] = [...results.passes, ...results.violations, ...results.incomplete];
  expect(
    applied.length,
    'the audit applied almost no rules to a rendered page, which means it did not ' +
      'really run',
  ).toBeGreaterThanOrEqual(15);

  // `AxeBuilder` has no catalogue accessor, but `analyze()` has just injected
  // axe into the page, so the catalogue is readable from `window.axe`. That is
  // the rule list the tag set resolves to, independent of what this particular
  // page happened to contain -- which is what makes it a coverage check rather
  // than a restatement of the run above.
  const catalogue = (await page.evaluate((tags) => {
    const axe = (window as unknown as { axe?: { getRules(t: string[]): { ruleId: string; tags: string[] }[] } })
      .axe;
    if (!axe) return null;
    return axe.getRules(tags).map((r) => ({ ruleId: r.ruleId, tags: r.tags }));
  }, [...AA_TAGS])) as { ruleId: string; tags: string[] }[] | null;

  expect(catalogue, 'axe was not left on the page after analyze(), so the rule catalogue is unreadable')
    .not.toBeNull();
  const rules = catalogue ?? [];
  expect(
    rules.length,
    'the AA tag set resolved to almost no rules, so this audit was checking nothing',
  ).toBeGreaterThan(40);

  const notAA = rules.filter((r) => !AA_TAGS.some((t) => r.tags.includes(t))).map((r) => r.ruleId);
  expect(
    notAA.join(', '),
    'the rule catalogue contains rules that are not tagged for WCAG AA, so ' +
      '`best-practice` has leaked into a conformance check',
  ).toBe('');

  // Spot-check that the rules this suite's findings actually came from are among
  // them, so a future axe release that retires one cannot pass unnoticed.
  const ids = new Set(rules.map((r) => r.ruleId));
  const expected = [
    'color-contrast',
    'label',
    'select-name',
    'button-name',
    'link-name',
    'image-alt',
    'aria-required-attr',
    'target-size',
    'meta-viewport',
  ];
  expect(
    expected.filter((id) => !ids.has(id)).join(', '),
    'these AA rules are no longer in the catalogue; if an axe upgrade retired one, ' +
      'the corresponding finding below needs re-deriving by hand',
  ).toBe('');

  console.log(
    `  axe catalogue: ${rules.length} AA rules. On /today the audit applied ` +
      `${applied.length} of them (${results.passes.length} pass, ` +
      `${results.violations.length} violation, ${results.incomplete.length} incomplete, ` +
      `${results.inapplicable.length} n/a).`,
  );
});
