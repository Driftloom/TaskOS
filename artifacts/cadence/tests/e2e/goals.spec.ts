import { expect } from '@playwright/test';
import { installMockApi, test, type MockGoalSeed } from './fixtures';

const SEED_GOALS: MockGoalSeed[] = [
  {
    id: 701,
    title: 'Daily Deep Focus',
    month: '2026-10',
    metric: 'focus_minutes',
    target: 1200,
    actual: 800,
    progress: 66.7,
    onPace: true,
    expectedSoFar: 600,
    scopeKind: 'global',
    scopeLabel: 'Global',
    status: 'open',
  },
  {
    id: 702,
    title: 'Ship Core Milestones',
    month: '2026-10',
    metric: 'tasks_completed',
    target: 10,
    actual: 12,
    progress: 120,
    onPace: true,
    expectedSoFar: 8,
    scopeKind: 'project',
    scopeLabel: 'Cadence App',
    status: 'open',
  },
];

test.describe('Monthly Goals Subsystem', () => {
  test('navigates to /goals, displays goals and allows review and creation', async ({ page }) => {
    await installMockApi(page, { goals: SEED_GOALS });

    // Navigate to Goals page
    await page.goto('/goals?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: 'Monthly Goals' })).toBeVisible({ timeout: 45_000 });

    // Verify existing seeded goals appear
    await expect(page.getByText('Daily Deep Focus')).toBeVisible();
    await expect(page.getByText('Ship Core Milestones')).toBeVisible();
    await expect(page.getByTestId('goal-card-701')).toBeVisible();
    await expect(page.getByTestId('goal-card-702')).toBeVisible();

    // Verify target reached label on goal 702
    await expect(page.getByText(/Target reached/i)).toBeVisible();

    // Open Monthly Review dialog
    const reviewBtn = page.getByRole('button', { name: 'Review Month' });
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    // Assert dialog content
    const reviewDialog = page.getByRole('dialog');
    await expect(reviewDialog).toBeVisible();
    await expect(page.getByText(/Monthly Review — 2026-10/i)).toBeVisible();
    await expect(page.getByText('50%')).toBeVisible(); // 1 of 2 achieved = 50%
    await expect(page.getByText('1 / 2')).toBeVisible(); // 1 achieved of 2 total

    // Incomplete goal has Carry Over button
    const carryBtn = reviewDialog.getByRole('button', { name: /Carry Over/i });
    await expect(carryBtn).toBeVisible();
    await carryBtn.click();
    await expect(page.getByText(/Carried Forward/i)).toBeVisible();

    // Close review dialog
    await page.getByRole('button', { name: 'Close Review' }).click();
    await expect(reviewDialog).not.toBeVisible();

    // Open New Goal modal
    const newGoalBtn = page.getByRole('button', { name: 'New Goal' });
    await expect(newGoalBtn).toBeVisible();
    await newGoalBtn.click();

    const editorDialog = page.getByRole('dialog');
    await expect(editorDialog).toBeVisible();
    await expect(editorDialog.getByRole('heading', { name: 'New monthly goal' })).toBeVisible();

    // Fill goal title and target
    const titleInput = editorDialog.locator('#goal-title');
    await titleInput.fill('Morning Focus Hour');
    const targetInput = editorDialog.locator('#goal-target');
    await targetInput.fill('600');

    // Save goal
    await editorDialog.getByRole('button', { name: 'Add goal' }).click();

    // Modal closes and new goal appears
    await expect(editorDialog).not.toBeVisible();
    await expect(page.getByText('Morning Focus Hour')).toBeVisible();
  });
});
