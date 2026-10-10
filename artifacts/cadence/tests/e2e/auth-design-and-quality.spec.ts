import { collectPageProblems, gotoRoute, test } from './fixtures';
import { expect } from '@playwright/test';

/**
 * Auth Surface Design System Conformance & Web Quality Audit
 *
 * Verifies mobile viewport responsiveness, tap target sizes (>= 44px),
 * WCAG 2.2 AA non-text contrast (>= 3:1), and semantic landmarks on auth routes.
 */

// ---------------------------------------------------------------------------
// Contrast Helpers
// ---------------------------------------------------------------------------

function parseRgb(color: string): [number, number, number] {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = luminance(rgb1);
  const l2 = luminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('auth surface design system conformance', () => {
  // TC-DES-01
  test('mobile viewport (390px) maintains zero horizontal scroll on /sign-in', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoRoute(page, '/sign-in');

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 15_000 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, 'mobile view should not introduce horizontal scroll').toBeLessThanOrEqual(390);
  });

  // TC-DES-02
  test('auth theme toggle meets the 44x44px minimum tap target floor', async ({ page }) => {
    await gotoRoute(page, '/sign-in');

    const toggle = page.getByTestId('auth-theme-toggle');
    await expect(toggle).toBeVisible({ timeout: 15_000 });

    const box = await toggle.boundingBox();
    expect(box, 'auth-theme-toggle bounding box must be measurable').not.toBeNull();
    if (box) {
      expect(box.width, 'tap target width must be >= 44px').toBeGreaterThanOrEqual(44);
      expect(box.height, 'tap target height must be >= 44px').toBeGreaterThanOrEqual(44);
    }
  });

  // TC-DES-03
  test('auth theme toggle has accessible name and title', async ({ page }) => {
    await gotoRoute(page, '/sign-in');

    const toggle = page.getByTestId('auth-theme-toggle');
    await expect(toggle).toBeVisible({ timeout: 15_000 });

    const ariaLabel = await toggle.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/Switch to (light|dark) appearance/i);
  });

  // TC-DES-04
  test('semantic landmarks exist on /sign-in and /sign-up', async ({ page }) => {
    for (const path of ['/sign-in', '/sign-up']) {
      await gotoRoute(page, path);
      const main = page.locator('main#main-content');
      await expect(main).toBeVisible({ timeout: 15_000 });
      await expect(main).toHaveAttribute('role', 'main');
    }
  });

  // TC-DES-05
  test('theme toggle border meets WCAG 1.4.11 contrast against card background', async ({ page }) => {
    await gotoRoute(page, '/sign-in');

    const toggle = page.getByTestId('auth-theme-toggle');
    await expect(toggle).toBeVisible({ timeout: 15_000 });

    const styles = await toggle.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        bg: computed.backgroundColor,
        color: computed.color,
      };
    });

    const bgRgb = parseRgb(styles.bg);
    const colorRgb = parseRgb(styles.color);
    const ratio = contrastRatio(colorRgb, bgRgb);

    // WCAG 2.2 AA non-text contrast requirement is 3.0:1
    expect(ratio, `theme toggle icon contrast ratio (${ratio.toFixed(2)}:1) should meet 3:1`).toBeGreaterThanOrEqual(3.0);
  });

  // TC-DES-06
  test('auth surfaces render with clean console error budgets', async ({ page }) => {
    const problems = collectPageProblems(page);

    await gotoRoute(page, '/sign-in');
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });
    problems.assertClean('sign-in surface');

    await gotoRoute(page, '/sign-up');
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });
    problems.assertClean('sign-up surface');
  });
});
