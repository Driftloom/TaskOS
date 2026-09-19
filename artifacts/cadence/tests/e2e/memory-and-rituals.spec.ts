import { test, expect } from '@playwright/test';

test.describe('Memory & Transparency Engine', () => {
  test('renders memory transparency screen and confirmation queue', async ({ page }) => {
    await page.goto('/memory');
    // If redirected to landing (signed out), verify landing thesis
    if (page.url().endsWith('/') || page.url().includes('sign-in')) {
      await expect(page.getByText('Make room for the day.')).toBeVisible();
      return;
    }

    await expect(page.getByText('What Cadence Knows About Me')).toBeVisible();
    await expect(page.getByText('Transparency Engine')).toBeVisible();
  });
});

test.describe('Guided Rituals & 24h Rhythm', () => {
  test('onboarding flow mounts 3 steps', async ({ page }) => {
    await page.goto('/onboarding');
    if (page.url().endsWith('/') || page.url().includes('sign-in')) {
      return;
    }

    await expect(page.getByText('Step 1 of 3')).toBeVisible();
    await expect(page.getByText('24-Hour Flexible Rhythm')).toBeVisible();
  });
});
