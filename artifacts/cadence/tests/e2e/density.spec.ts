import { expect } from '@playwright/test';
import { installMockApi, test } from './fixtures';

/**
 * Display density (§8.4 / P1), verified in a real browser.
 *
 * The gate under test here is not "does the selector exist". It is the
 * touch-safety constraint: §8.4 restricts compact to `(pointer: fine)` and §P8.1
 * repeats "Compact density may go to 32px only when `(pointer: fine)`". Compact
 * sets a 38px row pitch, and `TaskRow`'s complete-task control keeps a 44px hit
 * box, so on a coarse pointer the two overlap.
 *
 * Playwright's Desktop Chrome reports a fine pointer and does not emulate touch,
 * so the coarse-pointer half of the gate is driven here by overriding
 * `matchMedia`. That is a deliberate limitation and is stated as such: this
 * proves the CSS media query and the DOM behaviour under a simulated pointer, not
 * that a physical phone behaves identically. The provider-level gate has its own
 * 12 unit tests, which is the layer that can be trusted without a device.
 */

const DENSITY_MODES = ['comfortable', 'default', 'compact'] as const;

/** Override matchMedia so a simulated pointer type is reported to the app. */
async function setPointer(page: import('@playwright/test').Page, pointer: 'fine' | 'coarse') {
  await page.addInitScript((p: string) => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query === '(pointer: fine)' || query === '(pointer: coarse)') {
        return {
          media: query,
          matches: query.includes(p),
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          onchange: null,
          dispatchEvent: () => false,
        } as unknown as MediaQueryList;
      }
      return original(query);
    };
  }, pointer);
}

async function openSettings(page: import('@playwright/test').Page) {
  await installMockApi(page);
  await page.goto('/settings?test_auth=true');
  await expect(page.getByTestId('section-automation-flags')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(400);
}

test.describe('display density (§8.4)', () => {
  test('exposes the modes a fine pointer supports, including compact', async ({ page }) => {
    await setPointer(page, 'fine');
    await openSettings(page);

    for (const mode of DENSITY_MODES) {
      await expect(page.getByTestId(`button-density-${mode}`)).toBeVisible();
    }
  });

  test('hides compact on a coarse pointer and says why', async ({ page }) => {
    await setPointer(page, 'coarse');
    await openSettings(page);

    await expect(page.getByTestId('button-density-compact')).toHaveCount(0);
    await expect(page.getByTestId('button-density-comfortable')).toBeVisible();
    await expect(page.getByTestId('button-density-default')).toBeVisible();
    // The explanation is the point: an absent control the user cannot account for
    // reads as a bug.
    await expect(page.getByText(/Compact is unavailable on touch devices/)).toBeVisible();
  });

  test('a stored compact value is not honoured on a coarse pointer', async ({ page }) => {
    await setPointer(page, 'coarse');
    // Simulate a desktop session that left compact persisted.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence.density', 'compact');
      } catch {
        /* storage can throw in sandboxed contexts */
      }
    });
    await openSettings(page);

    const applied = await page.evaluate(() => document.documentElement.getAttribute('data-density'));
    expect(applied, 'stored compact must not survive onto a coarse pointer').not.toBe('compact');
  });

  test('applies the mode to documentElement and persists it', async ({ page }) => {
    await setPointer(page, 'fine');
    await openSettings(page);

    await page.getByTestId('button-density-comfortable').click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-density')))
      .toBe('comfortable');

    await page.getByTestId('button-density-compact').click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-density')))
      .toBe('compact');

    const stored = await page.evaluate(() => window.localStorage.getItem('cadence.density'));
    expect(stored).toBe('compact');
  });

  test('compact does not shrink the complete-task tap target below 44px', async ({ page }) => {
    await setPointer(page, 'fine');
    await installMockApi(page);
    await page.goto('/today?test_auth=true');
    await expect(page.getByTestId('row-task-101')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(400);

    const measure = () =>
      page.evaluate(() => {
        const btn = document.querySelector('[data-testid="button-complete-task-101"]');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });

    const before = await measure();
    expect(before, 'the complete-task control must exist').not.toBeNull();

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact');
    });
    await page.waitForTimeout(300);

    const after = await measure();
    // The control's own box must not shrink. `tap-target-expand` keeps the hit
    // area at 44px regardless of density; this asserts the visual box too, so a
    // future change that removes the utility cannot silently pass.
    expect(
      after!.h,
      `complete-task control height must not drop below 44px in compact (was ${before!.h})`,
    ).toBeGreaterThanOrEqual(44);
    expect(after!.w).toBeGreaterThanOrEqual(44);
  });
});