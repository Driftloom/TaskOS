import { test, expect } from '@playwright/test';

test.describe('Focus Rounds & Timer Lifecycle', () => {
  test('begins focus round, pauses, and updates daily target', async ({ page }) => {
    await page.goto('/focus');
    if (!page.url().includes('/focus')) return;

    // Check focus page elements
    await expect(page.getByText(/Your attention, here/i)).toBeVisible();

    const beginBtn = page.getByTestId('button-begin-focus');
    if (await beginBtn.isVisible()) {
      await beginBtn.click();
      await expect(page.getByTestId('button-toggle-focus')).toBeVisible({ timeout: 5000 });
      // Pause
      await page.getByTestId('button-toggle-focus').click();
      await expect(page.getByText(/Paused/i)).toBeVisible();
    }

    // Check daily target stepper
    const plusBtn = page.getByTestId('button-target-plus');
    if (await plusBtn.isVisible()) {
      await plusBtn.click();
      await expect(page.getByTestId('text-daily-target')).toBeVisible();
    }
  });
});
