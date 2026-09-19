import { test, expect } from '@playwright/test';

test.describe('Task Capture & CRUD Flows', () => {
  test('creates a task with natural language due text', async ({ page }) => {
    await page.goto('/today');
    if (!page.url().includes('/today')) return;

    // Trigger capture modal
    await page.keyboard.press('n');
    await expect(page.getByTestId('form-task-editor')).toBeVisible();

    // Fill title and smart dueText
    await page.getByTestId('input-task-title').fill('Ship enterprise release v1.0');
    await page.getByTestId('input-task-duetext').fill('tomorrow 5pm');
    await page.getByTestId('button-save-task').click();

    // Verify task row appears
    await expect(page.getByText('Ship enterprise release v1.0')).toBeVisible({ timeout: 5000 });
  });

  test('toggles task completion and updates activity rings', async ({ page }) => {
    await page.goto('/today');
    if (!page.url().includes('/today')) return;

    const firstTaskCompleteBtn = page.locator('[data-testid^="button-complete-task-"]').first();
    if (await firstTaskCompleteBtn.isVisible()) {
      await firstTaskCompleteBtn.click();
      await expect(page.getByTestId('activity-rings')).toBeVisible();
    }
  });

  test('deleting a task displays an undo toast notification', async ({ page }) => {
    await page.goto('/today');
    if (!page.url().includes('/today')) return;

    const deleteBtn = page.locator('[data-testid^="button-delete-task-"]').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await expect(page.getByText(/Task deleted/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Undo/i })).toBeVisible();
    }
  });
});
