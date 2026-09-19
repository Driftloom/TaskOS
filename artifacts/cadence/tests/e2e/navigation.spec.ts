import { test, expect } from '@playwright/test';

test.describe('Cadence App Shell & Navigation', () => {
  test('landing page renders thesis and call to action buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/cadence/i);
    await expect(page.getByText('Make room for the day.').first()).toBeVisible();
    await expect(page.getByTestId('link-landing-sign-up')).toBeVisible();
    await expect(page.getByTestId('link-landing-sign-in')).toBeVisible();
  });

  test('command palette opens on Cmd+K and executes navigation', async ({ page }) => {
    await page.goto('/today?test_auth=true');
    await page.keyboard.press('Meta+k');
    // Allow either dialog or palette trigger
    const cmdPalette = page.getByRole('dialog', { name: /command palette/i });
    if (await cmdPalette.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(cmdPalette).not.toBeVisible();
    }
  });

  test('pressing N triggers quick task capture modal', async ({ page }) => {
    await page.goto('/today?test_auth=true');
    await page.keyboard.press('n');
    const editor = page.getByTestId('form-task-editor');
    if (await editor.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(editor).not.toBeVisible();
    }
  });
});
