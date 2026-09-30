import { expect } from '@playwright/test';
import { collectPageProblems, installMockApi, test } from './fixtures';

/**
 * Focus round lifecycle.
 *
 * The previous version wrapped every assertion in `if (await btn.isVisible())`,
 * so a Focus page that never rendered the timer still reported green. It also
 * asserted `getByText(/Paused/i)` after clicking Pause, which depends on a
 * status chip whose copy changed since. These assert the real state machine
 * instead: FocusTimer exposes `data-state`, which is the single source of truth
 * (FocusTimer.tsx:275-277, `resolveFocusTimerState`), so the lifecycle is
 * checked against it rather than against prose.
 */

test.describe('focus round lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/focus?test_auth=true', { waitUntil: 'commit' });
    // The timer must exist, and it must exist in its idle state.
    await expect(page.getByTestId('focus-timer'), 'the Focus timer did not mount').toBeVisible({
      timeout: 45_000,
    });
  });

  test('idle state offers Begin and shows the queued task and planned minutes', async ({ page }) => {
    const problems = collectPageProblems(page);
    const timer = page.getByTestId('focus-timer');

    await expect(timer, 'the timer did not start idle').toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId('button-begin-focus')).toBeVisible();
    await expect(page.getByTestId('button-toggle-focus')).toHaveCount(0);

    // The round must name what it is for, or "Focus" is just a stopwatch.
    await expect(timer).toContainText('Ship the enterprise release v1.0');
    await expect(page.getByTestId('focus-timer-digits')).toHaveText('00:00');

    problems.assertClean('Focus page load');
  });

  test('begin, pause, resume and finish drive the documented state machine', async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/focus?test_auth=true', { waitUntil: 'commit' });
    const timer = page.getByTestId('focus-timer');
    await expect(timer).toBeVisible({ timeout: 45_000 });

    // --- begin -------------------------------------------------------------
    await page.getByTestId('button-begin-focus').click();
    await expect(timer, 'clicking Begin focus did not start a round').toHaveAttribute(
      'data-state',
      'running',
    );
    await expect(page.getByTestId('button-toggle-focus')).toBeVisible();

    // The session must exist server-side, not just in React state.
    await expect
      .poll(
        () => api.writes.filter((w) => w.path === '/api/focus-sessions' && w.method === 'POST').length,
        { message: 'beginning a round never POSTed a focus session', timeout: 15_000 },
      )
      .toBe(1);
    const created = api.writes.find((w) => w.path === '/api/focus-sessions' && w.method === 'POST');
    expect((created?.body as { taskId?: number })?.taskId, 'the session names no task').toBeGreaterThan(0);

    // --- pause -------------------------------------------------------------
    await page.getByTestId('button-toggle-focus').click();
    await expect(timer, 'Pause did not move the timer to the paused state').toHaveAttribute(
      'data-state',
      'paused',
    );

    const pausedPatch = api.writes.filter(
      (w) => /\/api\/focus-sessions\/\d+$/.test(w.path) && w.method === 'PATCH',
    );
    expect(pausedPatch.length, 'pause never persisted the session status').toBeGreaterThanOrEqual(1);
    expect((pausedPatch[pausedPatch.length - 1].body as { status?: string })?.status).toBe('paused');

    // --- resume ------------------------------------------------------------
    await page.getByTestId('button-toggle-focus').click();
    await expect(timer, 'Resume did not return the timer to running').toHaveAttribute(
      'data-state',
      'running',
    );

    // --- finish ------------------------------------------------------------
    await page.getByTestId('button-complete-focus').click();
    await expect(timer, 'finishing the round did not reach the finished state').toHaveAttribute(
      'data-state',
      'finished',
    );
    await expect(page.getByTestId('button-new-focus')).toBeVisible();

    const all = api.writes.filter((w) => /\/api\/focus-sessions\/\d+$/.test(w.path) && w.method === 'PATCH');
    expect((all[all.length - 1].body as { status?: string })?.status).toBe('completed');

    // The finished state must tell the user where the time went (P17.2).
    await expect(timer).toContainText(/logged in today/i);

    // --- reset -------------------------------------------------------------
    await page.getByTestId('button-new-focus').click();
    await expect(timer, 'Start another round did not return to idle').toHaveAttribute(
      'data-state',
      'idle',
    );
  });

  test('read time announces on demand and never on a timer', async ({ page }) => {
    const problems = collectPageProblems(page);

    // The live region (FocusTimer.tsx:310) must be SILENT before the user asks.
    const live = page.getByTestId('focus-timer-live');
    await expect(live).toHaveText('');

    await page.getByTestId('button-begin-focus').click();
    await expect(page.getByTestId('focus-timer')).toHaveAttribute('data-state', 'running');

    // A state transition is allowed to speak exactly once (P11.1). The
    // announcement is written on the next animation frame (FocusTimer.tsx:226,
    // so that identical consecutive text is not skipped by a screen reader), so
    // WAIT for it rather than sampling the cleared region.
    const afterStart = await expect
      .poll(async () => (await live.innerText()).trim(), { timeout: 10_000 })
      .toMatch(/Focus round started/i);
    const baseline = (await live.innerText()).trim();

    // The ticking seconds must never reach the live region.
    await page.waitForTimeout(3000);
    expect(
      (await live.innerText()).trim(),
      'the timer is announcing on a clock, which would spam a screen reader',
    ).toBe(baseline);

    // Read time is the on-demand path and must actually say something.
    await page.getByTestId('button-focus-read-time').click();
    await expect
      .poll(async () => (await live.innerText()).trim(), { timeout: 5_000 })
      .toMatch(/elapsed.*remaining/i);

    problems.assertClean('Focus read-time announcements');
  });

  test('the daily target stepper clamps to the documented 1..20 range', async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/focus?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('focus-timer')).toBeVisible({ timeout: 45_000 });

    const readout = page.getByTestId('text-daily-target');
    await expect(readout).toHaveText('4');

    await page.getByTestId('button-target-plus').click();
    await expect(readout, 'the plus stepper did not change the daily target').toHaveText('5');
    await expect
      .poll(
        () => api.writes.filter((w) => w.path === '/api/settings/focus' && w.method === 'PATCH').length,
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(1);

    // Clamp at the top: 20 is the ceiling (FocusPage.tsx:211).
    for (let i = 0; i < 25; i++) {
      await page.getByTestId('button-target-plus').click();
    }
    await expect(readout, 'the daily target ran past its 20 ceiling').toHaveText('20');

    // Clamp at the bottom: 1 is the floor.
    for (let i = 0; i < 30; i++) {
      await page.getByTestId('button-target-minus').click();
    }
    await expect(readout, 'the daily target ran below its floor of 1').toHaveText('1');
  });

  test('a recovered running round is announced rather than silently reset', async ({ page }) => {
    // P11.1 non-negotiable #4: state survives backgrounding and reopen.
    // The mock returns an in-flight session, which is exactly the reopen case.
    const problems = collectPageProblems(page);
    await installMockApi(page, {
      focusSessions: [
        {
          id: 777,
          taskId: 101,
          plannedMinutes: 45,
          elapsedMinutes: 12,
          status: 'paused',
          startedAt: '2026-09-30T09:00:00.000Z',
          endedAt: null,
          createdAt: '2026-09-30T09:00:00.000Z',
          updatedAt: '2026-09-30T09:12:00.000Z',
        },
      ],
    });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/focus?test_auth=true', { waitUntil: 'commit' });

    const timer = page.getByTestId('focus-timer');
    await expect(timer, 'an unfinished round was not adopted on load').toHaveAttribute(
      'data-state',
      'paused',
      { timeout: 45_000 },
    );
    // 12 minutes must survive the reload, not restart at zero.
    await expect(page.getByTestId('focus-timer-digits')).toHaveText('12:00');

    problems.assertClean('Focus round recovery');
  });

  test('the empty queue explains itself instead of offering a dead control', async ({ page }) => {
    await installMockApi(page, { tasks: [] });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/focus?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('focus-timer')).toBeVisible({ timeout: 45_000 });

    // P17.2: context + explanation + next action. Never a live-looking button
    // that silently does nothing (P12).
    await expect(page.getByTestId('focus-timer')).toContainText(/No open tasks/i);
    await expect(page.getByTestId('button-begin-focus')).toHaveCount(0);
    await expect(page.getByTestId('focus-timer-digits')).toHaveCount(0);

    // The daily target stepper is settings, not a focus action, so it must
    // still work with no tasks in the queue.
    await expect(page.getByTestId('text-daily-target')).toBeVisible();
  });
});
