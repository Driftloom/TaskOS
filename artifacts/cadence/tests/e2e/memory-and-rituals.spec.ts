import { test, expect } from '@playwright/test';

test.describe('Memory & Transparency Engine', () => {
  test('renders memory transparency screen and confirmation queue', async ({ page }) => {
    await page.goto('/memory?test_auth=true');
    await expect(page.getByText('What Cadence Knows About Me')).toBeVisible();
    await expect(page.getByText('Transparency Engine')).toBeVisible();
    await expect(page.getByText('Source A: Arithmetic').first()).toBeVisible();
  });
});

test.describe('Guided Rituals & 24h Rhythm', () => {
  test('onboarding flow mounts 3 steps and advances', async ({ page }) => {
    await page.goto('/onboarding?test_auth=true');
    await expect(page.getByText('Step 1 of 3')).toBeVisible();
    await expect(page.getByText('24-Hour Flexible Rhythm')).toBeVisible();

    // Advance to Step 2
    await page.getByRole('button', { name: /Next Step/i }).click();
    await expect(page.getByText('Step 2 of 3')).toBeVisible();
    await expect(page.getByText('Smart Reschedule Dial')).toBeVisible();

    // Advance to Step 3
    await page.getByRole('button', { name: /Next Step/i }).click();
    await expect(page.getByText('Step 3 of 3')).toBeVisible();
    await expect(page.getByText('Channels & Telegram')).toBeVisible();
  });
});
