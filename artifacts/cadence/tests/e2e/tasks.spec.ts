import { expect } from '@playwright/test';
import { collectPageProblems, installMockApi, test } from './fixtures';

/**
 * Task capture and the CRUD affordances on Today.
 *
 * The previous version of this file had three tests and zero assertions that
 * could fail:
 *
 *     await page.goto('/today');
 *     if (!page.url().includes('/today')) return;          // auth bounce = PASS
 *     ...
 *     if (await firstTaskCompleteBtn.isVisible()) { ... } // empty list = PASS
 *
 * It also targeted `form-task-editor`, `input-task-title`, `input-task-duetext`
 * and `button-save-task`, none of which exist in the current components. The
 * real surfaces are QuickCaptureForm (`form-quick-capture`, inline on Today,
 * Enter-to-save) and QuickCaptureSheet (`form-quick-capture-sheet`, opened by N
 * or the sidebar, with a `capture-submit` button).
 *
 * The network is mocked (option (a) in the brief). Measured reason: with the
 * API unreachable the app does not show an error state, it CRASHES into the
 * error boundary with "list.map is not a function" -- Vite's SPA fallback
 * answers /api/tasks with index.html and HTTP 200, so customFetch parses HTML
 * as the task array. See README.md.
 */

test.describe('task capture', () => {
  test('a captured task is parsed, POSTed, and rendered as a row', async ({ page }) => {
    const problems = collectPageProblems(page);
    const api = await installMockApi(page, { tasks: [] });

    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    // With no tasks the empty state must show, not a blank list.
    await expect(page.getByTestId('empty-tasks')).toBeVisible();
    await expect(page.locator('[data-testid^="row-task-"]')).toHaveCount(0);

    // The inline capture form on Today is Enter-to-save (QuickCaptureForm,
    // variant="inline" -- deliberately no button).
    const field = page.getByTestId('input-quick-capture');
    await expect(field).toBeVisible();
    await field.fill('Ship the enterprise release v1.0 tomorrow 5pm 45m');

    // The parse chips are the misparse guard (P12/P13); they must appear before
    // submit, otherwise "natural language capture" is just a text box.
    await expect(page.getByTestId('capture-chips')).toBeVisible();
    await expect(page.locator('[data-testid^="capture-chip-date-"]')).toHaveCount(1);
    await expect(page.locator('[data-testid^="capture-chip-time-"]')).toHaveCount(1);
    await expect(page.locator('[data-testid^="capture-chip-duration-"]')).toHaveCount(1);

    await field.press('Enter');

    // The row must appear. This is the assertion the old spec could not make.
    const row = page.locator('[data-testid^="row-task-"]');
    await expect(row, 'the captured task never rendered as a row').toHaveCount(1);
    await expect(row).toContainText('Ship the enterprise release v1.0');

    // The due text must have been consumed into dueText, not left in the title.
    await expect(row).not.toContainText('tomorrow');

    // And it must have really gone over the wire, not just appeared optimistically.
    const create = api.writes.filter((w) => w.method === 'POST' && w.path === '/api/tasks');
    expect(create, 'no POST /api/tasks was issued').toHaveLength(1);
    const payload = create[0].body as { title?: string; dueText?: string; durationMin?: number };
    expect(payload.title).toBe('Ship the enterprise release v1.0');
    expect(payload.dueText).toContain('5pm');
    expect(payload.durationMin).toBe(45);

    problems.assertClean('task capture on Today');
  });

  test('the capture form refuses an empty submit with a visible reason', async ({ page }) => {
    const api = await installMockApi(page, { tasks: [] });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    // Submitting nothing must not create anything, and must say why.
    await page.getByTestId('input-quick-capture').press('Enter');
    await expect(page.getByTestId('capture-error')).toBeVisible();
    await expect(page.getByTestId('capture-error')).toContainText(/Type a task first/i);

    expect(api.writes.filter((w) => w.method === 'POST')).toHaveLength(0);
  });
});

test.describe('task completion', () => {
  test('completing a task PATCHes it and advances the Activity Rings', async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    const row = page.locator('[data-testid^="row-task-"]').first();
    await expect(row).toBeVisible();

    // The rings are an img with a spoken summary; assert the summary so the
    // assertion is on the accessible value, not a class name.
    const rings = page.getByTestId('activity-rings');
    await expect(rings).toBeVisible();
    const before = await rings.getAttribute('aria-label');
    expect(before, 'Activity Rings lost its accessible description').toMatch(
      /Activity rings: \d+ of \d+ tasks done/,
    );
    const completedBefore = Number(/of (\d+) tasks done/.exec(before ?? '')?.[1] ?? '-1');
    expect(completedBefore).toBeGreaterThanOrEqual(0);

    const title = (await row.innerText()).split('\n')[0];
    const complete = row.locator('[data-testid^="button-complete-task-"]');
    await complete.click();

    // The PATCH must be issued against the right row.
    await expect
      .poll(
        () => api.writes.filter((w) => /\/api\/tasks\/\d+$/.test(w.path) && w.method === 'PATCH').length,
        { message: 'completing a task never PATCHed the API', timeout: 15_000 },
      )
      .toBe(1);
    const patch = api.writes.find((w) => /\/api\/tasks\/\d+$/.test(w.path) && w.method === 'PATCH');
    expect((patch?.body as { status?: string })?.status).toBe('completed');

    // The task title must become struck through (visual state, not a class).
    await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
    await expect
      .poll(async () => (await rings.getAttribute('aria-label')) ?? '', { timeout: 15_000 })
      .not.toBe(before ?? '');
  });
});

test.describe('deletion and undo', () => {
  test('deleting a task removes the row and issues a DELETE', async ({ page }) => {
    const problems = collectPageProblems(page);
    const api = await installMockApi(page);

    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    const rows = page.locator('[data-testid^="row-task-"]');
    // WAIT for the list, do not sample it. AppShell mounts before the task query
    // resolves, so a one-shot count() races the SkeletonList and intermittently
    // reads 0. Measured flake: 1 failure in 4 runs under 2 workers.
    await expect(rows, 'the fixture should render three task rows').toHaveCount(3);
    const startCount = await rows.count();
    expect(startCount).toBeGreaterThan(1);

    const target = rows.first();
    const title = (await target.innerText()).split('\n')[0];
    const testId = (await target.getAttribute('data-testid')) ?? '';
    const id = /row-task-(\d+)/.exec(testId)?.[1];

    await target.locator('[data-testid^="button-delete-task-"]').click();

    // The row must actually leave.
    await expect(rows, 'the deleted task stayed on screen').toHaveCount(startCount - 1);
    await expect(page.getByText(title, { exact: false })).toHaveCount(0);

    // And it must have really gone over the wire.
    const deletes = api.writes.filter((w) => w.method === 'DELETE');
    expect(deletes, 'no DELETE was issued').toHaveLength(1);
    expect(deletes[0].path).toBe(`/api/tasks/${id}`);

    problems.assertClean('deleting a task');
  });

  /**
   * Tag removed 2026-10-01. Protects locked decision D-26: a destructive action
   * must be reversible. This was tagged because `TaskRow.handleDelete` fired the
   * undo through a mutation owned by a `TaskRow` that had already unmounted, so
   * its per-call `onSuccess` never ran -- the POST was sent and returned 201, then
   * nothing happened on screen, with no console error to explain it. A silent
   * reversibility affordance is worse than none.
   */
  test('the delete toast offers a working undo that re-creates the task', async ({ page }) => {
    const problems = collectPageProblems(page);
    const api = await installMockApi(page);

    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    const rows = page.locator('[data-testid^="row-task-"]');
    // Same race as the sibling test: wait for the rows, do not sample them.
    await expect(rows, 'the fixture should render three task rows').toHaveCount(3);
    const startCount = await rows.count();
    expect(startCount).toBeGreaterThan(1);

    const target = rows.first();
    const title = (await target.innerText()).split('\n')[0];
    await target.locator('[data-testid^="button-delete-task-"]').click();

    // Destructive actions must be reversible (locked decision D-26).
    //
    // Sonner auto-dismisses after ~4s, so this test asserts the toast and
    // clicks Undo IMMEDIATELY. A previous version checked the row count first,
    // which burned the toast's lifetime and then failed on a missing element --
    // a race, not a product defect. The row-removal behaviour is covered by the
    // sibling test above.
    //
    // `[data-sonner-toast]` is sonner's own hook, which is more stable than
    // matching the transient text node it wraps.
    const toast = page.locator('[data-sonner-toast]');
    await expect(toast, 'deleting a task showed no confirmation').toBeVisible();
    await expect(toast).toContainText('Task deleted');
    await expect(toast).toContainText(title);

    const undo = toast.getByRole('button', { name: 'Undo' });
    await expect(undo, 'the delete toast offered no Undo').toBeVisible();
    await undo.click({ timeout: 5_000 });

    // Assert the write FIRST: that is deterministic, whereas the row count
    // depends on React Query settling a refetch afterwards.
    await expect
      .poll(
        () => api.writes.filter((w) => w.method === 'POST' && w.path === '/api/tasks').length,
        { message: 'Undo never re-created the task over the network', timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(1);
    const posts = api.writes.filter((w) => w.method === 'POST' && w.path === '/api/tasks');
    expect((posts[posts.length - 1].body as { title?: string }).title).toBe(title);

    // "Task restored" only fires from the mutation's onSuccess, so this
    // separates "the write never landed" from "the write landed but nothing
    // refreshed" -- two very different defects.
    //
    // MEASURED DEFECT (2026-09-30): the POST is issued and the mock returns
    // 201, yet onSuccess never runs -- no refetch, no confirmation toast, the
    // row stays gone, and nothing is logged. The undo's `create` mutation is
    // owned by the TaskRow that has just unmounted, so its per-call callbacks
    // never fire. Net effect for the user: click Undo, see nothing happen, and
    // conclude the task is deleted, while it actually exists on the server.
    // That is a silent failure of a reversibility affordance (locked decision
    // D-26), so this assertion stays strict until the app is fixed.
    await expect
      .poll(
        async () =>
          (await page.locator('[data-sonner-toast]').filter({ hasText: 'Task restored' }).count()) > 0,
        {
          message:
            'DEFECT: the undo POST is sent but its onSuccess never runs, so the list ' +
            'never refreshes and the user is never told the restore succeeded.\n' +
            'requests: ' +
            api.requestedPaths.slice(-8).join(', ') +
            '\nconsole/network problems: ' +
            JSON.stringify(problems.problems),
          timeout: 15_000,
        },
      )
      .toBe(true);

    // Then the visible outcome: the row is back with the same title.
    // Scoped to the row list on purpose. `getByText(title)` unscoped now matches
    // TWO elements -- the restored row AND the success toast, whose description
    // quotes the title -- and Playwright's strict mode rejects that as a selector
    // error rather than a UI failure. Asserting on the list keeps the test
    // measuring what it claims to measure: that the task is rendered again.
    await expect
      .poll(async () => rows.count(), {
        message:
          'Undo re-created the task but the list never showed it again.\n' +
          'requests after the undo: ' +
          api.requestedPaths.slice(-12).join(', ') +
          '\nconsole/network problems: ' +
          JSON.stringify(problems.problems, null, 2),
        timeout: 20_000,
      })
      .toBe(startCount);
    await expect(rows.filter({ hasText: title })).toHaveCount(1);

    problems.assertClean('delete then undo');
  });
});

test.describe('search and empty states', () => {
  test('the filter box narrows the list to matching tasks', async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    // The filter only renders when there is more than one task (TodayPage:167),
    // so the fixture must supply several. Assert it exists rather than assuming.
    const filter = page.getByPlaceholder('Filter tasks...');
    await expect(filter, 'the task filter did not render for a multi-task day').toBeVisible();

    const rows = page.locator('[data-testid^="row-task-"]');
    await expect(rows).toHaveCount(3);

    await filter.fill('Telegram');
    await expect(rows, 'filtering did not narrow the list').toHaveCount(1);
    await expect(rows).toContainText('Telegram');

    // A query that matches nothing must say so, not show a stale list.
    await filter.fill('zzzzz-no-such-task');
    await expect(page.getByText(/No tasks match/)).toBeVisible();
    await expect(rows).toHaveCount(0);
  });
});
