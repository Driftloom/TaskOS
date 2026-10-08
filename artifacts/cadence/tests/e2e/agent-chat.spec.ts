import { expect } from '@playwright/test';
import { collectPageProblems, installMockApi, test } from './fixtures';

/**
 * The agent chat panel, driven in a browser.
 *
 * ## Why this file exists
 *
 * `/api/agent/chat` was unmocked in the e2e fixture, so it fell through to the
 * `501 unmocked_endpoint` branch. The chat path had never run in a browser: no
 * spec exercised send → render → tool card → confirmation gate. A user reported
 * typing `"Broh create shedule from tomorrow 9 to 5"` and receiving a canned
 * greeting, and nothing in CI could have caught it.
 *
 * These assertions are deliberately structural. The mocked reply is the
 * What/Why/How clarification the product is supposed to produce, and the spec
 * fails if the panel renders the dead-end greeting instead — the exact
 * regression, pinned at the layer where it was reported from.
 */

const DEAD_END_GREETING =
  "I'm Cadence, your task co-pilot. You can ask me to create tasks, complete items, inspect your schedule, or review learned habits.";

async function gotoWithRetry(page: import('@playwright/test').Page, path: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await page.goto(path, { waitUntil: 'commit' });
      return;
    } catch (e) {
      if (attempt === 4) throw e;
      await page.waitForTimeout(1000);
    }
  }
}

async function openAgent(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cadence_test_auth', 'true');
    } catch {
      /* the ?test_auth=true query param is the fallback */
    }
  });
  await gotoWithRetry(page, '/?test_auth=true');
  await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('link-nav-assistant').click();
  await expect(page.getByTestId('agent-composer')).toBeVisible({ timeout: 45_000 });
}

async function sendMessage(page: import('@playwright/test').Page, text: string) {
  const composer = page.getByTestId('agent-composer');
  await composer.fill(text);
  await page.getByTestId('agent-send').click();
}

test('the chat panel renders the assistant reply, not a dead-end greeting', async ({ page }) => {
  const problems = collectPageProblems(page);
  await installMockApi(page);
  await openAgent(page);

  await sendMessage(page, 'Broh create shedule from tomorrow 9 to 5');

  const transcript = page.getByTestId('agent-transcript');
  await expect(transcript, 'the assistant never rendered a transcript').toBeVisible({ timeout: 20_000 });

  // The user's own message must appear, so we know the send actually happened.
  await expect(transcript).toContainText('Broh create shedule from tomorrow 9 to 5');

  // And the assistant must answer with something actionable.
  await expect(
    transcript,
    `the assistant returned the dead-end greeting: "${DEAD_END_GREETING}"`,
  ).not.toContainText(DEAD_END_GREETING);

  await expect(transcript).toContainText(/WHAT/i);
  await expect(transcript).toContainText(/WHY/i);
  await expect(transcript).toContainText(/HOW/i);

  problems.assertClean('Agent chat send');
});

test('the trust boundary is stated before any action is taken', async ({ page }) => {
  const problems = collectPageProblems(page);
  await installMockApi(page);
  await openAgent(page);

  const boundary = page.getByTestId('agent-trust-boundary');
  await expect(boundary).toBeVisible();
  await expect(boundary).toContainText(/create, edit, move, and complete/i);

  // The >10-task approval promise must be present, because the backend now
  // populates `requiresConfirmation` to keep it.
  await expect(page.getByTestId('agent-approval-note')).toContainText(/more than 10 tasks/i);

  problems.assertClean('Agent trust boundary');
});

test('a tool call is rendered as an action, not a bare sentence', async ({ page }) => {
  const problems = collectPageProblems(page);
  await installMockApi(page, {
    agentReplies: [
      {
        reply: 'Created task "Ship mobile fixes".',
        toolCallsExecuted: [
          {
            name: 'create_task',
            arguments: { title: 'Ship mobile fixes' },
            result: { success: true },
          },
        ],
        requiresConfirmation: false,
      },
    ],
  });
  await openAgent(page);

  await sendMessage(page, 'add task Ship mobile fixes');

  const transcript = page.getByTestId('agent-transcript');
  await expect(transcript).toContainText('Ship mobile fixes', { timeout: 20_000 });

  // A mutating tool call must surface as an AgentActionCard, not a bare
  // sentence. The card names what it changed (P15.1 data honesty: the verb and
  // count come from the real tool call, never inferred from the prose).
  const card = page.getByTestId('agent-action-card');
  await expect(
    card.first(),
    'a mutating tool call rendered no AgentActionCard',
  ).toBeVisible({ timeout: 20_000 });
  await expect(card.first()).toContainText(/Created\s+1\s+task/i);

  problems.assertClean('Agent tool call render');
});

test('a bulk action surfaces the confirmation gate', async ({ page }) => {
  const problems = collectPageProblems(page);
  await installMockApi(page, {
    agentReplies: [
      {
        reply:
          'This would move 12 tasks. Confirm to proceed?\n\nOption 1: Confirm and apply\nOption 2: Cancel',
        toolCallsExecuted: [
          {
            name: 'bulk_reschedule',
            arguments: { taskIds: Array.from({ length: 12 }, (_, i) => i + 1), targetDate: '2026-10-08' },
            result: { success: false, requiresConfirmation: true },
          },
        ],
        // The backend only sets this once `requiresConfirmation` is populated,
        // which it never was until this change set.
        requiresConfirmation: true,
      },
    ],
  });
  await openAgent(page);

  await sendMessage(page, 'move all my tasks to tomorrow');

  const transcript = page.getByTestId('agent-transcript');
  await expect(transcript).toContainText(/12 tasks/i, { timeout: 20_000 });

  // The real gate: ActionPreview is the awaiting-approval surface, and it only
  // renders when `requiresConfirmation` is true. Before this change set that
  // field was never populated, so this whole surface was dead code.
  const preview = page.getByTestId('action-preview');
  await expect(
    preview,
    'a >10 task bulk action did not render the approval preview',
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('action-preview-count')).toContainText('12');

  problems.assertClean('Agent confirmation gate');
});

test('settings shows the provider key state instead of implying full capability', async ({ page }) => {
  const problems = collectPageProblems(page);
  await installMockApi(page, { agentCredentials: [] });

  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cadence_test_auth', 'true');
    } catch {
      /* the ?test_auth=true query param is the fallback */
    }
  });
  await gotoWithRetry(page, '/settings?test_auth=true');
  await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

  const view = page.getByTestId('agent-settings-view');
  await expect(view, 'the provider-key settings section never rendered').toBeVisible({
    timeout: 20_000,
  });

  // With no credential stored the user must be told the agent is on its offline
  // logic — the silent version of this state is what the original report was.
  await expect(view).toContainText(/No provider key stored/i);

  // Each provider gets a row so a key can be added.
  const geminiRow = page.getByTestId('agent-provider-row-gemini');
  await expect(geminiRow).toBeVisible();

  // Fields stay collapsed until the provider is chosen, so the page is not
  // 15 text inputs deep before the user has done anything.
  await expect(page.getByTestId('agent-provider-open-gemini')).toBeVisible();
  await expect(page.getByLabel('Google Gemini API key')).toHaveCount(0);

  // Expanding reveals a write-only field: empty, never seeded from the server.
  await page.getByTestId('agent-provider-open-gemini').click();
  await expect(page.getByLabel('Google Gemini API key')).toHaveValue('');

  problems.assertClean('Agent provider settings');
});

test('a stored credential is shown as a masked hint, never the key', async ({ page }) => {
  const problems = collectPageProblems(page);
  await installMockApi(page, {
    agentCredentials: [{ provider: 'gemini', keyHint: 'CDEF', model: 'gemini-3.1-flash-lite' }],
  });

  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cadence_test_auth', 'true');
    } catch {
      /* the ?test_auth=true query param is the fallback */
    }
  });
  await gotoWithRetry(page, '/settings?test_auth=true');
  await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

  const row = page.getByTestId('agent-provider-row-gemini');
  await expect(row, 'a stored credential row did not render').toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText('••••CDEF');

  // A replace affordance exists, but the key itself is never in the DOM until
  // the user expands the form — and even then it starts empty.
  await expect(page.getByTestId('agent-provider-open-gemini')).toBeVisible();
  await expect(page.getByLabel('Google Gemini API key')).toHaveCount(0);
  await page.getByTestId('agent-provider-open-gemini').click();
  await expect(page.getByLabel('Google Gemini API key')).toHaveValue('');

  problems.assertClean('Agent stored credential');
});
