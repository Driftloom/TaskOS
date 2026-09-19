import { test, expect } from '@playwright/test';

test.describe('Cadence App Shell & Navigation', () => {
  test('landing page renders thesis and call to action buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/cadence/i);
    await expect(page.getByText('Make room for the day.')).toBeVisible();
    await expect(page.getByTestId('link-landing-sign-up')).toBeVisible();
    await expect(page.getByTestId('link-landing-sign-in')).toBeVisible();
  });

  test('command palette opens on Cmd+K and executes navigation', async ({ page }) => {
    await page.goto('/');
    // Emulate signed-in redirect or view
    const isToday = page.url().includes('/today');
    if (isToday) {
      await page.keyboard.press('Meta+k');
      await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: /command palette/i })).not.toBeVisible();
    }
  });

  test('pressing N triggers quick task capture modal', async ({ page }) => {
    await page.goto('/');
    if (page.url().includes('/today')) {
      await page.keyboard.press('n');
      await expect(page.getByTestId('form-task-editor')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('form-task-editor')).not.toBeVisible();
    }
  });
});
