import { expect } from '@playwright/test';
import { collectPageProblems, gotoRoute, installMockApi, test } from './fixtures';

/**
 * The §P16 / §P11.1 running-timer mini chip (P0).
 *
 * P16 requires it on mobile. The original wording — "a mini chip above the
 * tab bar" — described the bottom dock, which the drawer redesign removed
 * (owner decision 2026-10-20: mis-tap complaint against five cramped slots).
 * The chip survives as a floating pill just above the bottom edge, and the
 * requirements that actually bind are unchanged: it exists while a round
 * runs, it opens the full timer, it stays out of the way.
 *
 * The chip was previously untested: nothing seeded an active focus session, so
 * the hidden branch was the only branch ever exercised and the present branch
 * could rot silently. These tests exist to close that.
 */

const ACTIVE_ROUND = {
  id: 501,
  taskId: 101,
  plannedMinutes: 25,
  elapsedMinutes: 7,
  status: 'active',
  startedAt: new Date().toISOString(),
  endedAt: null,
};

test.describe('Running-timer mini chip (§P16)', () => {
  test('is hidden on mobile when no round is running', async ({ page }) => {
    const problems = collectPageProblems(page);
    await installMockApi(page, { focusSessions: [] });

    await gotoRoute(page, '/today');

    // 390px: the chip and the navigation drawer are the mobile-only surfaces.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('focus-mini-chip')).toHaveCount(0);
    problems.assertClean('Running-timer mini chip');
  });

  test('floats above the bottom edge while a round is running, and opens /focus', async ({
    page,
  }) => {
    const problems = collectPageProblems(page);
    await installMockApi(page, { focusSessions: [ACTIVE_ROUND] });

    await gotoRoute(page, '/today');
    await page.setViewportSize({ width: 390, height: 844 });

    const chip = page.getByTestId('focus-mini-chip');
    await expect(chip).toBeVisible();

    // P16: it opens the full timer.
    await expect(chip).toHaveAttribute('href', '/focus');

    // With no bottom dock to sit above, the chip floats just above the bottom
    // edge (plus safe-area inset). It must be fully on screen — not clipped by
    // the viewport edge the way an unanchored floating element can be.
    const chipBox = await chip.boundingBox();
    expect(chipBox, 'the chip rendered but had no layout box').not.toBeNull();
    if (chipBox) {
      expect(
        chipBox.y + chipBox.height,
        'the mini chip is clipped by the bottom of the viewport',
      ).toBeLessThanOrEqual(844);
    }

    problems.assertClean('Running-timer mini chip');
  });

  test('is hidden on desktop, where the sidebar already carries timer state', async ({
    page,
  }) => {
    const problems = collectPageProblems(page);
    await installMockApi(page, { focusSessions: [ACTIVE_ROUND] });

    await gotoRoute(page, '/today');
    await page.setViewportSize({ width: 1440, height: 900 });

    // The chip is scoped `lg:hidden`. On desktop the sidebar/top bar owns the
    // affordance, and two indicators for one state is worse than one.
    await expect(page.getByTestId('focus-mini-chip')).toBeHidden();

    problems.assertClean('Running-timer mini chip');
  });

  test('does not announce a live region that churns every second', async ({ page }) => {
    const problems = collectPageProblems(page);
    await installMockApi(page, { focusSessions: [ACTIVE_ROUND] });

    await gotoRoute(page, '/today');
    await page.setViewportSize({ width: 390, height: 844 });

    const chip = page.getByTestId('focus-mini-chip');
    await expect(chip).toBeVisible();

    // §P11.1: "announces start/pause/finish and remaining time on request
    // only (never every second)". An aria-live region on a ticking timer is
    // exactly the failure that clause forbids.
    await expect(chip).not.toHaveAttribute('aria-live', /.+/);

    // The link still needs an accessible name that does not churn.
    const label = await chip.getAttribute('aria-label');
    expect(label, 'the chip has no accessible name').toBeTruthy();
    expect(label).toMatch(/focus round/i);

    problems.assertClean('Running-timer mini chip');
  });
});