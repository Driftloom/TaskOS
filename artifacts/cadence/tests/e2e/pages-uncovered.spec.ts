import { type Page, type Locator } from '@playwright/test';
import { expect, test, installMockApi } from './fixtures';

type Open = (path: string) => Promise<void>;

/**
 * Opens a route through the `open` fixture (which asserts the shell mounted
 * and the route resolved) and then asserts the page ITSELF rendered -- not
 * merely that the AppShell chrome is present.
 */
async function boot(
  open: Open,
  page: Page,
  route: string,
  ready: Locator,
  readyDesc: string,
): Promise<void> {
  await open(route);
  await expect(ready, `${route} mounted the app shell but never rendered ${readyDesc}`).toBeVisible({
    timeout: 30_000,
  });
  // Let react-query settle so a late rejection still lands inside the window.
  await page.waitForTimeout(600);
}

/**
 * Uncovered routes: pages that had no E2E test covering them and were absent
 * from APP_ROUTES.
 */
test.describe('Uncovered routes', () => {
  test('Projects page renders and lets you create a project', async ({ page, open }) => {
    await installMockApi(page, { tasks: [], projects: [] });
    await boot(open, page, '/projects', page.getByTestId('button-create-project'), 'its project list');
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();

    await page.getByTestId('button-create-project').click();
    await page.getByLabel('Project name').fill('Acme Corp');
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page.getByRole('heading', { name: 'Acme Corp' })).toBeVisible();
  });

  test('Activity page renders its device-local empty state', async ({ page, open }) => {
    await installMockApi(page);
    await boot(open, page, '/activity', page.getByText('Nothing has been recorded on this device yet'), 'its empty state');
    await expect(page.getByText('Nothing has been recorded on this device yet')).toBeVisible();
    await expect(
      page.getByText(
        'Task, focus, and ritual events appear here as you use Cadence on this device. Nothing is synced to your account.',
      ),
    ).toBeVisible();
  });

  test('Dashboard page renders', async ({ page, open }) => {
    await installMockApi(page);
    await boot(open, page, '/dashboard', page.getByText('Multi-user safe RLS isolation'), 'its dashboard shell');
    await expect(page.getByText('Multi-user safe RLS isolation')).toBeVisible();
    await expect(page.getByTestId('card-dashboard-momentum')).toBeVisible();
    await expect(page.getByTestId('button-dashboard-focus')).toBeVisible();
    await expect(page.getByTestId('button-dashboard-capture')).toBeVisible();
    await expect(page.getByTestId('button-dashboard-today')).toBeVisible();
  });

  test('Download page renders the APK version, not the web app version', async ({ page }) => {
    await page.goto('/download');
    await expect(page.getByText('Android app version: 1.0.0.0 (Build 1)')).toBeVisible();
    await expect(page.getByText('Web app version: v0.1.9')).toBeVisible();
  });

  test('Agent page loads via direct navigation', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/agent?test_auth=true');
    await expect(page.getByRole('heading', { name: 'Assistant', level: 1 })).toBeVisible();
  });
});
