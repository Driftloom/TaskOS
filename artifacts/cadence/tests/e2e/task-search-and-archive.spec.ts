import { expect } from '@playwright/test';
import { installMockApi, test, type MockTaskSeed } from './fixtures';

const SEED_TASKS: MockTaskSeed[] = [
  {
    id: 301,
    title: 'Enterprise release verification',
    status: 'open',
    priority: 'high',
    durationMin: 60,
    notes: 'Verify 10-gate ladder and search subsystem',
    dueAt: '2026-10-09T10:00:00.000Z',
  },
  {
    id: 302,
    title: 'Archive testing memo',
    status: 'inbox',
    priority: 'medium',
    durationMin: 30,
    dueAt: null,
  },
  {
    id: 303,
    title: 'Completed design doc sprint',
    status: 'completed',
    priority: 'low',
    durationMin: 45,
    completedAt: '2026-10-08T15:00:00.000Z',
  },
];

test.describe('Task search, archival and rich links', () => {
  test('Ctrl+K searches tasks dynamically and selecting navigates', async ({ page }) => {
    await installMockApi(page, { tasks: SEED_TASKS });

    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    // Open Command Palette with keyboard shortcut
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette, 'Ctrl+K did not open the command palette').toBeVisible();

    // Type query into palette search input
    const input = palette.getByPlaceholder(/Type a command or jump to page/i);
    await input.fill('Enterprise');

    // Task should appear in Tasks group
    const taskItem = page.getByTestId('command-task-item-301');
    await expect(taskItem).toBeVisible();
    await expect(taskItem).toContainText('Enterprise release verification');

    // Click/select task item
    await taskItem.click();

    // Palette closes
    await expect(palette).toHaveCount(0);
  });

  test('Inbox supports archival workflow and restoring tasks', async ({ page }) => {
    await installMockApi(page, { tasks: SEED_TASKS });

    await page.goto('/inbox?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('inbox-container')).toBeVisible({ timeout: 45_000 });

    // Verify Active Captures tab shows the inbox task
    await expect(page.getByTestId('tab-active-captures')).toBeVisible();
    await expect(page.getByTestId('card-inbox-task-302')).toBeVisible();

    // Archive task 302
    const archiveBtn = page.getByTestId('button-archive-inbox-302');
    await expect(archiveBtn).toBeVisible();
    await archiveBtn.click();

    // Task disappears from Active Captures
    await expect(page.getByTestId('card-inbox-task-302')).not.toBeVisible();

    // Switch to Archived tab
    const archivedTab = page.getByTestId('tab-archived-captures');
    await archivedTab.click();

    // Task appears in Archived tab with Restore button
    await expect(page.getByTestId('card-inbox-task-302')).toBeVisible();
    const restoreBtn = page.getByTestId('button-restore-inbox-302');
    await expect(restoreBtn).toBeVisible();

    // Restore task
    await restoreBtn.click();
    await expect(page.getByTestId('card-inbox-task-302')).not.toBeVisible();

    // Switch back to Active Captures: task is back
    await page.getByTestId('tab-active-captures').click();
    await expect(page.getByTestId('card-inbox-task-302')).toBeVisible();
  });
});
