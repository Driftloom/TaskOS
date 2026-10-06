import { collectPageProblems, installMockApi, test } from './fixtures';
import { expect } from '@playwright/test';

/**
 * Navigation, routing, and the global keyboard shortcuts.
 *
 * The previous version of this file asserted the landing page and then guarded
 * everything else:
 *
 *     await page.keyboard.press('Meta+k');
 *     const cmdPalette = page.getByRole('dialog', { name: /command palette/i });
 *     if (await cmdPalette.isVisible()) { ... }
 *
 * so if the palette never opened the test still passed. It also pressed
 * `Meta+k` on a project whose own hook
 * (src/hooks/use-keyboard-shortcuts.ts:21) binds `metaKey || ctrlKey`, and then
 * expected Escape to close the palette, which CommandPalette does not
 * implement. Both are replaced below with unconditional assertions.
 */

test.describe('public landing page', () => {
  test('landing page renders the thesis and both auth entry points', async ({ page }) => {
    const problems = collectPageProblems(page);

    // No auth bypass here on purpose: this asserts the SIGNED-OUT experience,
    // which is the one users actually meet first.
    await page.goto('/', { waitUntil: 'commit' });

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Make room for the day\./);
    await expect(page.getByTestId('link-landing-sign-up')).toBeVisible();
    await expect(page.getByTestId('link-landing-sign-in')).toBeVisible();

    // Both CTAs must resolve, not just exist.
    await expect(page.getByTestId('link-landing-sign-up')).toHaveAttribute('href', '/sign-up');
    await expect(page.getByTestId('link-landing-sign-in')).toHaveAttribute('href', '/sign-in');

    // The three feature cards are the value proposition; if one silently
    // disappears the page still "renders" but the pitch is gone. Scoped to the
    // card heading because "Time Blocking" also appears in the body copy.
    await expect(page.getByRole('heading', { name: 'Natural Speed' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Activity Rings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Time Blocking' })).toBeVisible();

    problems.assertClean('landing page load');
  });

  test('every nav destination in the shell resolves to a real route', async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });

    const destinations: [string, string][] = [
      ['[data-testid="link-nav-today"]', '/today'],
      ['[data-testid="link-nav-inbox"]', '/inbox'],
      ['[data-testid="link-nav-focus"]', '/focus'],
      ['[data-testid="link-nav-calendar"]', '/calendar'],
      ['[data-testid="link-nav-review"]', '/review'],
      ['[data-testid="link-nav-memory"]', '/memory'],
      ['[data-testid="link-nav-settings"]', '/settings'],
      ['[data-testid="link-nav-profile"]', '/profile'],
    ];

    // Land on Today first so the sidebar is mounted.
    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    for (const [selector, expected] of destinations) {
      const link = page.locator(selector);
      await expect(link, `${selector} is missing from the sidebar`).toBeVisible();
      await link.click();
      await expect
        .poll(() => new URL(page.url()).pathname, {
          message: `clicking ${selector} did not navigate to ${expected}`,
          timeout: 15_000,
        })
        .toBe(expected);
      // The shell must still be mounted, i.e. we did not fall through to
      // NotFound or get redirected to the signed-out landing page.
      await expect(page.getByTestId('button-theme-toggle')).toBeVisible();
    }
  });
});

test.describe('global keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
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
    await page.locator('body').click();
  });

  test('Ctrl+K opens the command palette and Escape-free close works', async ({ page }) => {
    // src/hooks/use-keyboard-shortcuts.ts binds metaKey || ctrlKey. The old spec
    // used Meta+k, which is wrong on Windows and Linux.
    await page.keyboard.press('Control+k');

    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette, 'Ctrl+K did not open the command palette').toBeVisible();
    await expect(palette.getByPlaceholder(/Type a command or jump to page/i)).toBeFocused();

    // The palette must actually be usable, not merely present.
    await palette.getByPlaceholder(/Type a command or jump to page/i).fill('memory');
    await expect(palette.getByText('Go to Memory & Insights')).toBeVisible();

    // Escape is deliberately NOT asserted to close it: CommandPalette has no
    // Escape handler, so that would be asserting behaviour that does not exist.
    // Toggling with the same chord is the documented close path.
    await page.keyboard.press('Control+k');
    await expect(palette).toHaveCount(0);
  });

  test('the command palette navigates when a destination is selected', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();

    await palette.getByPlaceholder(/Type a command or jump to page/i).fill('calendar');
    await palette.getByText('Go to Calendar').click();

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
      .toBe('/calendar');
    await expect(palette).toHaveCount(0);
  });

  test('N opens quick capture and Escape closes it without losing the draft', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('n');

    // `N` opens the QuickCaptureSheet (AppShell -> captureOpen), whose form is
    // `form-quick-capture-sheet`. The old spec looked for `form-task-editor`,
    // which no longer exists anywhere in the app.
    const sheetForm = page.getByTestId('form-quick-capture-sheet');
    await expect(sheetForm, 'pressing N did not open the quick capture sheet').toBeVisible();

    // The sheet autofocuses the field (P11.1).
    const field = page.getByTestId('input-quick-capture-sheet');
    await expect(field).toBeFocused();

    await field.fill('Draft that must survive a dismissal');
    await page.keyboard.press('Escape');
    await expect(sheetForm).toHaveCount(0);

    // P11.1: "never loses typed text". The draft is persisted, so reopening the
    // sheet restores it. This is the guarantee that was never tested.
    await page.keyboard.press('n');
    await expect(page.getByTestId('input-quick-capture-sheet')).toHaveValue(
      'Draft that must survive a dismissal',
    );
  });

  test('number keys navigate to the six primary destinations', async ({ page }) => {
    const routes: [string, string][] = [
      ['1', '/today'],
      ['2', '/inbox'],
      ['3', '/focus'],
      ['4', '/calendar'],
      ['5', '/review'],
      ['6', '/memory'],
    ];

    for (const [key, expected] of routes) {
      // The shortcut deliberately ignores keys pressed inside an input, so make
      // sure focus is on the body first.
      await page.locator('body').click({ position: { x: 5, y: 400 } });
      await page.keyboard.press(key);
      await expect
        .poll(() => new URL(page.url()).pathname, {
          message: `pressing "${key}" did not navigate to ${expected}`,
          timeout: 15_000,
        })
        .toBe(expected);
    }
  });
});
