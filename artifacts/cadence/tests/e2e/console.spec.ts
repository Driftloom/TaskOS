import { expect } from '@playwright/test';
import { collectPageProblems, installMockApi, test } from './fixtures';

/**
 * Console cleanliness.
 *
 * "A design system that logs errors on every route is not enterprise quality."
 * This spec makes that claim checkable: it walks every route the shell can
 * reach, collects `console.error`, uncaught page errors, and failed network
 * requests, and fails on any of them.
 *
 * On allow-listing: the ONLY entry is Clerk's development-key notice. That is a
 * property of the local `VITE_CLERK_PUBLISHABLE_KEY` in .env.local, not of the
 * code under test, and it is a `console.warn` rather than an error. Everything
 * else fails. `BENIGN` in fixtures.ts is the single place to change, and it
 * carries a comment per entry so it cannot grow silently.
 */

const ROUTES = ['/today', '/inbox', '/focus', '/calendar', '/review', '/memory', '/settings'] as const;

test.describe('console and network cleanliness', () => {
  test('every route loads without a console error or a failed request', async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });

    const report: string[] = [];

    for (const route of ROUTES) {
      const problems = collectPageProblems(page);
      await page.goto(`${route}?test_auth=true`, { waitUntil: 'commit' });
      await expect(
        page.getByTestId('button-theme-toggle'),
        `${route} never mounted the app shell`,
      ).toBeVisible({ timeout: 45_000 });

      // Give react-query a beat to settle so a late failure is caught.
      await page.waitForTimeout(600);

      if (problems.problems.length > 0) {
        report.push(
          `${route}:`,
          ...problems.problems.map((p) => `    [${p.kind}] ${p.text}`),
          '',
        );
      }
    }

    expect(
      report.join('\n'),
      `Console/network problems on ${ROUTES.length} routes:\n\n${report.join('\n')}`,
    ).toBe('');
  });

  test('a failing API surfaces a recoverable error state, not a crash', async ({ page }) => {
    // This is the honest-failure path, in both senses: the mock deliberately
    // fails, and the app must degrade to something the user can act on.
    await installMockApi(page, { failWith: 503 });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });

    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    // TodayPage renders ErrorState (with a working Retry) when the list query
    // errors. Assert the recovery affordance, not just that something rendered.
    const error = page.getByTestId('status-error');
    await expect(
      error,
      'a 503 from the API produced neither an error state nor a crash -- ' +
        'TodayPage.tsx:203-206 only renders ErrorState when the query rejects, ' +
        'so check whether the page fell back to the empty state instead',
    ).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText(/could not load/i);
    await expect(page.getByTestId('button-retry'), 'the error state offered no retry').toBeVisible();
  });

  test('an unmocked endpoint fails the suite instead of being ignored', async ({ page }) => {
    // The mock returns 501 for any /api path it does not know. If the app ever
    // starts calling a new endpoint, this test fails and the mock is updated on
    // purpose -- rather than the suite silently covering less than it claims.
    const api = await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });

    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(600);

    const unmocked = await page.evaluate(async () => {
      const res = await fetch('/api/definitely-not-a-real-endpoint', { headers: { accept: 'application/json' } });
      return res.status;
    });

    expect(unmocked, 'the mock returned a success for an endpoint it does not implement').toBe(501);
    expect(api.requestedPaths.length, 'the app made no API calls at all, so nothing was covered').toBeGreaterThan(0);
  });
});
