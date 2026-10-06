import { expect } from '@playwright/test';
import { installMockApi, test } from './fixtures';

/**
 * Control height responds to display density (§8.4).
 *
 * `density-control` sets `min-height: var(--density-control-h)`, which is 44px in
 * the default mode and 32px in compact. The calendar's Add-task and period-nav
 * controls carry it, so their height is now density-driven rather than pinned.
 *
 * These assertions exist because the previous state was the failure mode this repo
 * cares about: the utility existed in source, no component used it, Tailwind
 * tree-shook it, and `--density-control-h` was declared four times and read zero
 * times. Control height silently did nothing. A green build is not evidence that
 * a token is wired; measuring it is.
 */

async function setDensity(page: import('@playwright/test').Page, mode: string) {
  await page.evaluate((m: string) => {
    document.documentElement.setAttribute('data-density', m);
  }, mode);
  await page.waitForTimeout(250);
}

async function measure(page: import('@playwright/test').Page, testid: string) {
  return page.evaluate((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return null;
    return Math.round(el.getBoundingClientRect().height);
  }, testid);
}

test.describe('density drives control height (§8.4)', () => {
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.goto('/calendar?test_auth=true');
    await expect(page.getByTestId('hour-slot-9')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(400);
  });

  test('the utility is present in the built stylesheet', async ({ page }) => {
    // A source-only utility is tree-shaken away. If this fails, nothing below is
    // meaningful, because the measured heights would just be the static classes.
    const present = await page.evaluate(() =>
      Array.from(document.styleSheets).some((sheet) => {
        try {
          return Array.from(sheet.cssRules).some(
            (r) => r.cssText.includes('.density-control') && r.cssText.includes('--density-control-h'),
          );
        } catch {
          return false;
        }
      }),
    );
    expect(present, '.density-control must survive tree-shaking to be measurable').toBe(true);
  });

  test('calendar controls shrink in compact and return in default', async ({ page }) => {
    await setDensity(page, 'default');
    const addDefault = await measure(page, 'button-calendar-add');
    expect(addDefault, 'Add task control must exist').not.toBeNull();

    await setDensity(page, 'compact');
    const addCompact = await measure(page, 'button-calendar-add');

    await setDensity(page, 'default');
    const addBack = await measure(page, 'button-calendar-add');

    expect(
      addCompact!,
      `compact must shrink the Add-task control (default ${addDefault} -> compact ${addBack === addDefault ? addCompact : addDefault})`,
    ).toBeLessThan(addDefault!);

    // Returning to default restores the original height, which is what proves the
    // height is actually driven by the variable rather than by one-way mutation.
    expect(addBack).toBe(addDefault);
  });

  test('comfortable is not shorter than default', async ({ page }) => {
    await setDensity(page, 'default');
    const d = await measure(page, 'button-calendar-add');
    await setDensity(page, 'comfortable');
    const c = await measure(page, 'button-calendar-add');

    // --density-control-h is 44px default and 48px comfortable, so the box may
    // stay at 44 if content drives it, but it must never get smaller.
    expect(c!).toBeGreaterThanOrEqual(d!);
  });
});