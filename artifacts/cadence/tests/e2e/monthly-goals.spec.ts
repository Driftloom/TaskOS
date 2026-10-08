import { expect } from '@playwright/test';
import { collectPageProblems, gotoRoute, installMockApi, test } from './fixtures';

/**
 * Monthly Goals, verified in a real browser (Step 12).
 *
 * The gate under test is NOT "does /goals render". It is the three display
 * rules in the spec that a normal render check cannot see:
 *
 *  1. A goal whose scope was deleted must say so, NOT show a zero bar. A zero
 *     bar reads as "you achieved nothing", which is a different and false
 *     statement when the real cause is that the thing being counted is gone.
 *
 *  2. On-pace is advisory and must sit beside the real number. It derives from
 *     elapsed time, not behaviour, so a goal can be "behind pace" while already
 *     past target. Nothing may call a goal missed while the month is running.
 *
 *  3. The editor must show real 30/90-day baselines next to the metric, so a
 *     target is chosen against actual pace rather than guessed.
 *
 * The API is self-mocked, so no database is required -- same as every other
 * e2e spec in this directory.
 */

test.describe('Monthly Goals', () => {
  test('renders goals with progress and never mislabels an in-progress month', async ({
    page,
  }) => {
    const problems = collectPageProblems(page);
    await installMockApi(page, {
      goals: [
        {
          id: 1,
          title: 'Deep focus',
          month: '2026-10',
          metric: 'focus_minutes',
          target: 1200,
          actual: 800,
          progress: 66.7,
          onPace: true,
          expectedSoFar: 600,
          scopeKind: 'global',
          scopeLabel: 'Global',
          status: 'open',
        },
        {
          id: 2,
          title: 'Ship release features',
          month: '2026-10',
          metric: 'tasks_completed',
          target: 20,
          actual: 22,
          progress: 110,
          onPace: true,
          expectedSoFar: 15,
          scopeKind: 'project',
          scopeProjectId: 3,
          scopeLabel: 'Cadence App',
          status: 'open',
        },
      ],
    });

    await gotoRoute(page, '/goals');

    await expect(page.getByText('Monthly Goals')).toBeVisible();
    await expect(page.getByText('Deep focus')).toBeVisible();
    await expect(page.getByText('Ship release features')).toBeVisible();
    await expect(page.getByText('Cadence App')).toBeVisible();

    // A met goal is reported plainly.
    await expect(page.getByText(/Target reached/i)).toBeVisible();

    // The unmet goal shows its real numbers and an advisory pace line -- never
    // the word "missed" or "failed" while October is still running.
    await expect(page.getByText('800')).toBeVisible();
    await expect(page.getByText('1200')).toBeVisible();
    await expect(page.getByText(/On pace|Berhind pace/)).toBeVisible();

    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/\b(missed|failed|failed to meet)\b/i);

    problems.assertClean('Monthly Goals');
  });

  test('a goal whose scope was deleted explains itself instead of showing a zero bar', async ({
    page,
  }) => {
    const problems = collectPageProblems(page);
    await installMockApi(page, {
      goals: [
        {
          id: 3,
          title: 'Cadence App work',
          month: '2026-10',
          metric: 'tasks_completed',
          target: 20,
          actual: 0,
          progress: 0,
          onPace: false,
          expectedSoFar: 15,
          scopeKind: 'project',
          scopeProjectId: 3,
          scopeLabel: 'Cadence App',
          scopeDeleted: true,
          status: 'open',
        },
      ],
    });

    await gotoRoute(page, '/goals');

    const notice = page.getByTestId('goal-scope-deleted');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/deleted/i);

    // The regression this guards: a plain 0/20 progress bar with no explanation
    // reads as "you did nothing this month".
    const card = page.getByTestId('goal-card-3');
    await expect(card).not.toContainText('0% complete');

    problems.assertClean('Monthly Goals');
  });

  test('the editor shows real 30- and 90-day baselines so a target is not guessed', async ({
    page,
  }) => {
    const problems = collectPageProblems(page);
    await installMockApi(page, { goals: [] });

    await gotoRoute(page, '/goals');
    await page.getByRole('button', { name: /New Goal/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Baselines are the whole reason the picker exists.
    await expect(dialog).toContainText(/recent pace/i);
    await expect(dialog).toContainText(/30 days/i);
    await expect(dialog).toContainText(/90 days/i);

    // Submit stays disabled until the goal is actually well-formed. A title
    // alone is not enough: an empty target parses to 0, and target 0 is not a
    // goal, so the button must stay down until both are valid.
    const submit = dialog.getByRole('button', { name: /Add goal/i });
    await expect(submit).toBeDisabled();

    await dialog.getByLabel(/What do you want this month/i).fill('Read more');
    await expect(submit).toBeDisabled();

    await dialog.getByLabel(/Target for this month/i).fill('20');
    await expect(submit).toBeEnabled();

    problems.assertClean('Monthly Goals');
  });

  test('the monthly review opens and offers carry-forward for unmet goals only', async ({
    page,
  }) => {
    const problems = collectPageProblems(page);
    await installMockApi(page, {
      goals: [
        {
          id: 4,
          title: 'Met goal',
          month: '2026-10',
          metric: 'focus_sessions',
          target: 10,
          actual: 12,
          progress: 120,
          onPace: true,
          expectedSoFar: 10,
          scopeKind: 'global',
          scopeLabel: 'Global',
          status: 'open',
        },
        {
          id: 5,
          title: 'Unmet goal',
          month: '2026-10',
          metric: 'focus_sessions',
          target: 30,
          actual: 12,
          progress: 40,
          onPace: false,
          expectedSoFar: 20,
          scopeKind: 'global',
          scopeLabel: 'Global',
          status: 'open',
        },
      ],
    });

    await gotoRoute(page, '/goals');
    await page.getByRole('button', { name: /Review Month/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    // The review renders each goal in the breakdown and again in the carry
    // section, so scope to first() rather than assuming a single match.
    await expect(dialog.getByText('Met goal').first()).toBeVisible();
    await expect(dialog.getByText('Unmet goal').first()).toBeVisible();

    // Carry-forward belongs on the unmet goal only. A met goal is finished, and
    // offering to roll it forward would be the "silently keep moving things"
    // behaviour this project forbids.
    const rows = dialog.getByRole('button', { name: /Carry Over/i });
    await expect(rows).toHaveCount(1);

    problems.assertClean('Monthly Goals');
  });
});