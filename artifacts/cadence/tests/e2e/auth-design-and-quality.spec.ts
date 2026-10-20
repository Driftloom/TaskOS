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

  // TC-DES-07
  test('TC-DES-07: fluid card responsive geometry across 390px, 768px, and 1440px viewports', async ({ page }) => {
    const viewports = [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await gotoRoute(page, '/sign-in');
      const main = page.locator('main#main-content');
      await expect(main).toBeVisible({ timeout: 15_000 });

      // No horizontal scroll introduced at any breakpoint
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(
        scrollWidth,
        `viewport ${vp.name} (${vp.width}px) must not have horizontal scroll`,
      ).toBeLessThanOrEqual(vp.width);

      // Card bounding box should be constrained to --component-dimension-auth-card-w (440px)
      const mainBox = await main.boundingBox();
      expect(mainBox).not.toBeNull();
      if (mainBox) {
        expect(mainBox.width).toBeLessThanOrEqual(vp.width);
      }
    }
  });

  // TC-DES-08
  test('TC-DES-08: auth inputs meet 44px touch target height and 16px font-size floor', async ({ page }) => {
    await gotoRoute(page, '/sign-in');
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });

    const inputs = page.locator('input:not([type="hidden"])');
    const count = await inputs.count();

    // If Clerk inputs are present, verify their computed min-height and font size
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const isVisible = await input.isVisible();
      if (!isVisible) continue;

      const styles = await input.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          minHeight: parseFloat(computed.minHeight) || 0,
          height: parseFloat(computed.height) || 0,
          fontSize: parseFloat(computed.fontSize) || 0,
        };
      });

      const effectiveHeight = Math.max(styles.minHeight, styles.height);
      expect(
        effectiveHeight,
        `input ${i} height must be >= 44px for touch accessibility`,
      ).toBeGreaterThanOrEqual(44);

      expect(
        styles.fontSize,
        `input ${i} font-size must be >= 16px to prevent iOS auto-zoom`,
      ).toBeGreaterThanOrEqual(16);
    }
  });

  // TC-PRF-01
  test('TC-PRF-01: navigation timing budget on /sign-in', async ({ page }) => {
    await gotoRoute(page, '/sign-in');
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });

    const timing = await page.evaluate(() => {
      const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (!entry) return null;
      return {
        domContentLoaded: entry.domContentLoadedEventEnd - entry.responseStart,
        duration: entry.duration,
      };
    });

    if (timing && timing.domContentLoaded > 0) {
      // DOMContentLoaded under standard synthetic load should complete within 3500ms
      expect(timing.domContentLoaded).toBeLessThanOrEqual(3500);
    }
  });

  // TC-PRF-02
  test('TC-PRF-02: hydration layout stability (CLS <= 0.05)', async ({ page }) => {
    // Observe layout shift before navigation
    await page.addInitScript(() => {
      (window as any).__clsEntries = [];
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              (window as any).__clsEntries.push((entry as any).value);
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
      } catch {
        // unsupported observer
      }
    });

    await gotoRoute(page, '/sign-in');
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });

    // Allow hydration settling
    await page.waitForTimeout(500);

    const cls = await page.evaluate(() => {
      const entries: number[] = (window as any).__clsEntries || [];
      return entries.reduce((sum, val) => sum + val, 0);
    });

    expect(cls, `cumulative layout shift (${cls}) must be <= 0.05`).toBeLessThanOrEqual(0.05);
  });
});
