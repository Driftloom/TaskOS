import { expect } from '@playwright/test';
import { collectPageProblems, gotoRoute, installMockApi, test } from './fixtures';

/**
 * The §P16 / §P11.1 running-timer mini chip (P0).
 *
 * P16 requires it on mobile: "The running timer appears as a mini chip above
 * the tab bar and opens the full timer." It is the only place a user can tell
 * a round is still going after navigating away from /focus, so "it exists" is
 * the actual requirement -- a rendering check is enough, and anything more
 * would be asserting on a visual that P16 deliberately leaves free.
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

    // 390px: the chip and the bottom dock are the mobile-only surfaces.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('focus-mini-chip')).toHaveCount(0);
    problems.assertClean('Running-timer mini chip');
  });

  test('appears above the tab bar while a round is running, and opens /focus', async ({
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

    // The chip must not sit on top of the dock. P16 puts it *above* the tab
    // bar, so its bottom edge has to clear the dock's top edge.
    const dock = page.getByTestId('dock-mobile').or(page.locator('nav').last());
    const chipBox = await chip.boundingBox();
    if (chipBox) {
      const dockBox = await dock.boundingBox().catch(() => null);
      if (dockBox) {
        expect(
          chipBox.y + chipBox.height,
          'the mini chip overlaps the bottom dock',
        ).toBeLessThanOrEqual(dockBox.y + 1);
      }
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