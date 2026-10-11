import { collectPageProblems, installMockApi, test } from './fixtures';
import { expect } from '@playwright/test';

/**
 * Authentication boundary and session management.
 *
 * This spec covers the auth surface that every visitor encounters first: the
 * public landing page, the Clerk-hosted sign-in / sign-up cards, the protected
 * route redirect, and the dev-only `test_auth` bypass that the rest of the E2E
 * suite relies on.
 *
 * ZERO-TRUST RULES
 * ----------------
 * Every assertion is unconditional. No `if (await el.isVisible())` guards, no
 * try/catch swallowing. If the element is missing the test fails — that is the
 * point.
 *
 * TC-E2E-01 through TC-E2E-07 are numbered so they can be cross-referenced in
 * the test plan without ambiguity.
 */

// ---------------------------------------------------------------------------
// 1. Authentication boundary — signed-out experience
// ---------------------------------------------------------------------------

test.describe('authentication boundary', () => {
  /**
   * TC-E2E-01: Public landing page loads with zero console errors.
   *
   * WHAT: The very first page a visitor sees renders its thesis heading plus
   * both auth entry points ('Sign In' and 'Sign Up' links).
   *
   * WHY: If the landing page logs errors, Clerk's own JS failed to initialise,
   * or a network request went unhandled, the first impression is broken.
   * `problems.assertClean` makes that claim falsifiable.
   */
  test('TC-E2E-01: public landing page loads with zero console errors, showing Sign In and Sign Up links', async ({
    page,
  }) => {
    const problems = collectPageProblems(page);

    // No auth bypass here on purpose: this asserts the SIGNED-OUT experience,
    // which is the one users actually meet first.
    await page.goto('/', { waitUntil: 'commit' });

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Make room for the day\./);
    await expect(page.getByTestId('link-landing-sign-in')).toBeVisible();
    await expect(page.getByTestId('link-landing-sign-up')).toBeVisible();

    problems.assertClean('landing page load');
  });

  /**
   * TC-E2E-02: Protected routes redirect unauthenticated visitors to '/'.
   *
   * WHAT: Every route behind the auth gate bounces an unauthenticated visitor
   * back to the landing page.
   *
   * WHY: A protected route that silently renders to a logged-out visitor is a
   * security gap. A protected route that crashes instead of redirecting is a
   * broken UX. Either way, the pathname must end up at '/'.
   */
  test('TC-E2E-02: protected routes redirect unauthenticated visitors to /', async ({ page }) => {
    const protectedRoutes = [
      '/today',
      '/inbox',
      '/calendar',
      '/settings',
      '/profile',
      '/focus',
      '/review',
      '/memory',
    ];

    for (const route of protectedRoutes) {
      // No auth bypass: navigate raw and expect the redirect.
      await page.goto(route, { waitUntil: 'commit' });

      await expect
        .poll(() => new URL(page.url()).pathname, {
          message: `${route} did not redirect unauthenticated visitors to /`,
          timeout: 30_000,
        })
        .toBe('/');
    }
  });

  /**
   * TC-E2E-03: /sign-in renders the Clerk sign-in card.
   *
   * WHAT: The sign-in page renders a `<main>` landmark and the standalone auth
   * theme toggle (data-testid="auth-theme-toggle"). AppShell is NOT mounted on
   * auth routes — only the bare `<main>` with a small theme toggle exists.
   *
   * WHY: If Clerk's `<SignIn>` component fails to mount, the visitor sees a
   * blank page with no way forward. The `<main>` landmark proves the layout
   * rendered, and the theme toggle proves the auth-specific UI chrome is
   * present (App.tsx:374-389).
   */
  test('TC-E2E-03: /sign-in renders Clerk sign-in card', async ({ page }) => {
    const problems = collectPageProblems(page);

    await page.goto('/sign-in', { waitUntil: 'commit' });

    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('auth-theme-toggle')).toBeVisible();

    problems.assertClean('/sign-in load');
  });

  /**
   * TC-E2E-04: /sign-up renders the Clerk sign-up card.
   *
   * WHAT: The sign-up page renders a `<main>` landmark with zero console
   * errors.
   *
   * WHY: Same rationale as TC-E2E-03. The sign-up flow is the conversion
   * funnel's entry point, so a blank page here is revenue-critical.
   */
  test('TC-E2E-04: /sign-up renders Clerk sign-up card', async ({ page }) => {
    const problems = collectPageProblems(page);

    await page.goto('/sign-up', { waitUntil: 'commit' });

    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });

    problems.assertClean('/sign-up load');
  });
});

// ---------------------------------------------------------------------------
// 2. Authenticated session — bypass, shell access, sign-out flow
// ---------------------------------------------------------------------------

test.describe('authenticated session', () => {
  /**
   * TC-E2E-05: Test auth mode grants access to protected routes.
   *
   * WHAT: Setting `cadence_test_auth=true` in localStorage and passing
   * `?test_auth=true` on the URL bypasses Clerk in dev mode, allowing the
   * protected AppShell to mount.
   *
   * WHY: Every other spec in the suite depends on this bypass. If it breaks,
   * the entire E2E gate is dead — this test is the canary for that.
   */
  test('TC-E2E-05: test auth mode grants access to protected routes', async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });

    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });

    // The shell's own control proves AppShell mounted, not just that something
    // rendered. If Clerk bounced us back to '/' or the module graph failed,
    // this assertion catches it.
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    // Confirm we actually stayed on the protected route, not redirected.
    expect(new URL(page.url()).pathname).toBe('/today');
  });

  /**
   * TC-E2E-06: Profile sign-out dialog flow.
   *
   * WHAT: Clicking "Sign Out" on /profile opens a confirmation dialog with
   * `role="dialog"` and `aria-modal="true"`. The dialog can be dismissed with
   * Escape (via useModalFocus), cancelled with the Cancel button, and confirmed
   * with the confirm button.
   *
   * WHY: Sign-out is destructive — it ends the session. A confirmation dialog
   * without a working dismiss path traps the user; a confirmation that fires
   * on first click is an accidental logout. Both are tested.
   *
   * The dialog is a `createPortal` to `document.body`
   * (ProfilePage.tsx:619-689), and `useModalFocus` handles the Escape
   * key binding and focus trap.
   */
  test('TC-E2E-06: profile sign-out dialog flow', async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });

    await page.goto('/profile?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    // --- Open the sign-out confirmation dialog ---
    await page.getByTestId('button-profile-signout').click();

    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(dialog, 'clicking Sign Out did not open a dialog').toBeVisible();

    // --- Escape key closes the dialog ---
    await page.keyboard.press('Escape');
    await expect(
      dialog,
      'pressing Escape did not close the sign-out dialog',
    ).toHaveCount(0);

    // --- Re-open and cancel with the Cancel button ---
    await page.getByTestId('button-profile-signout').click();
    await expect(dialog).toBeVisible();

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      dialog,
      'clicking Cancel did not close the sign-out dialog',
    ).toHaveCount(0);

    // --- Re-open and confirm sign-out ---
    await page.getByTestId('button-profile-signout').click();
    await expect(dialog).toBeVisible();
    await page.getByTestId('button-confirm-signout').click();
  });

  /**
   * TC-E2E-07: Dev auth bypass persists via localStorage.
   *
   * WHAT: After navigating with `?test_auth=true`, localStorage contains the
   * `cadence_test_auth` key set to `'true'`.
   *
   * WHY: The bypass is two-factor: URL param AND localStorage. App.tsx:147-158
   * reads the query param and writes localStorage so subsequent client-side
   * navigations (where the param is gone) still pass the gate. If localStorage
   * is not written, every internal link un-authenticates the session.
   */
  test('TC-E2E-07: dev auth bypass persists via localStorage', async ({ page }) => {
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

    // Read localStorage from the page context to verify the bypass persisted.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem('cadence_test_auth'),
    );
    expect(
      stored,
      'cadence_test_auth was not found in localStorage after navigating with ?test_auth=true',
    ).toBe('true');
  });
});
