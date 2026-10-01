import { expect } from '@playwright/test';
import { collectPageProblems, installMockApi, test } from './fixtures';

/**
 * Memory transparency and the onboarding wizard.
 *
 * These two were the only specs in the old suite without a vacuous-pass guard,
 * so they are the closest to having been real. They were still wrong in two
 * ways, both fixed here rather than worked around:
 *
 *   - memory asserted `getByText('Source A: Arithmetic')`, a string that exists
 *     nowhere in the current components. Replaced with assertions on the real
 *     surfaces: the `memory-facts-*` testids and the facts the mock returns.
 *   - onboarding asserted the step-1 heading as `24-Hour Flexible Rhythm`, but
 *     that string is an `h4` inside step 1 while the page heading is
 *     `Rhythm & Timezone`. Both are asserted now, in the right role.
 */

/** A Source A fact: behavioural arithmetic, auto-updating. */
const SOURCE_A_FACT = {
  id: 501,
  key: 'thursday_evening_deep_work',
  title: 'Deep work lands best Thursday evenings',
  category: 'chronotype',
  source: 'behavioral',
  confidence: 82,
  evidenceCount: 14,
  lastReinforcedAt: '2026-09-28T02:00:00.000Z',
  rule9Multiplier: 1.5,
  pendingConfirmation: false,
  archived: false,
  value: {},
  createdAt: '2026-09-01T02:00:00.000Z',
  updatedAt: '2026-09-28T02:00:00.000Z',
};

/** A Source B fact: conversational, always needs explicit confirmation. */
const SOURCE_B_FACT = {
  id: 502,
  key: 'avoid_monday_mornings',
  title: 'Mondays before 11am are dead time',
  category: 'procrastination',
  source: 'conversational',
  confidence: 61,
  evidenceCount: 3,
  lastReinforcedAt: '2026-09-29T02:00:00.000Z',
  rule9Multiplier: null,
  pendingConfirmation: true,
  archived: false,
  value: {
    confirmationPrompt: 'You said Monday mornings never work. Should Cadence protect them?',
    suggestedAction: 'Cadence will avoid scheduling deep work on Monday mornings.',
  },
  createdAt: '2026-09-29T02:00:00.000Z',
  updatedAt: '2026-09-29T02:00:00.000Z',
};

test.describe('memory transparency screen', () => {
  test('renders the learned facts and states the Source B trust boundary', async ({ page }) => {
    const problems = collectPageProblems(page);
    await installMockApi(page, {
      memoryFacts: [SOURCE_A_FACT],
      confirmations: [SOURCE_B_FACT],
    });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/memory?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    await expect(page.getByRole('heading', { name: /What Cadence Knows About Me/ })).toBeVisible();
    await expect(page.getByText('Transparency Engine')).toBeVisible();

    // The confirmation queue is the whole point of the screen: an inferred
    // pattern must never change behaviour without the user saying yes.
    const queue = page.getByTestId('memory-confirmation-queue');
    await expect(queue, 'a pending Source B fact produced no confirmation queue').toBeVisible();
    await expect(queue).toContainText(/Inferred Insights Awaiting Your Confirmation \(1\)/);
    await expect(queue).toContainText('Source B: never changes behaviour without your approval');

    // The learned fact must render with its evidence, not as a bare sentence.
    const card = page.getByText(SOURCE_A_FACT.title);
    await expect(card, 'the learned fact was not rendered').toBeVisible();

    problems.assertClean('Memory page load');
  });

  test('an empty memory stays empty instead of inventing a pattern', async ({ page }) => {
    await installMockApi(page, { memoryFacts: [], confirmations: [] });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/memory?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });

    // The honest empty state. A fabricated fact with a confidence percentage
    // would be indistinguishable from a learned one, which is exactly what this
    // screen exists to prevent.
    const empty = page.getByTestId('memory-facts-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(/Nothing learned yet/i);
    await expect(page.getByTestId('memory-confirmation-queue')).toHaveCount(0);
  });

  test('approving a Source B fact calls the approve endpoint', async ({ page }) => {
    const api = await installMockApi(page, {
      memoryFacts: [SOURCE_A_FACT],
      confirmations: [SOURCE_B_FACT],
    });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/memory?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByTestId('memory-confirmation-queue')).toBeVisible({ timeout: 45_000 });

    const approve = page.getByRole('button', { name: /approve|confirm|keep/i }).first();
    await expect(approve, 'the confirmation offered no way to approve').toBeVisible();
    await approve.click();

    await expect
      .poll(
        () => api.writes.filter((w) => /\/api\/memory\/confirmations\/\d+\/approve/.test(w.path)).length,
        { message: 'approving an inferred fact never hit the API', timeout: 15_000 },
      )
      .toBe(1);
  });
});

test.describe('onboarding wizard', () => {
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/onboarding?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 45_000 });
  });

  test('walks all three steps and exposes the locked defaults', async ({ page }) => {
    const problems = collectPageProblems(page);

    // Step 1 -- Rhythm & Timezone. The page heading and the card heading are
    // different strings; the old spec asserted the card text as if it were the
    // step title.
    await expect(page.getByRole('heading', { name: 'Rhythm & Timezone' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '24-Hour Flexible Rhythm' })).toBeVisible();

    // Locked decision: Asia/Kolkata, and 24-hour flexibility by default.
    //
    // SELECTORS: these controls were reached by ROLE, not by label, because
    // OnboardingPage rendered every <label> as a sibling with no `htmlFor` and no
    // wrapping, so they had NO programmatic accessible name at all. axe called
    // that `select-name` and `label`, both CRITICAL, on 2026-10-01; the page now
    // uses a real `<label htmlFor>` per control. So the label-based locator is
    // asserted here as well -- not as a substitute, but as proof that the defect
    // is actually gone, since a role locator would keep passing either way.
    const timezoneSelect = page.getByRole('combobox').first();
    await expect(timezoneSelect, 'the timezone select is missing from step 1').toHaveValue(
      'Asia/Kolkata',
    );
    // The seven shipped zones, first and last, so a truncated list is caught.
    await expect(timezoneSelect.locator('option')).toHaveCount(7);
    await expect(timezoneSelect.locator('option').last()).toHaveText(/Asia\/Singapore/);

    // SC 4.1.2 / 3.3.2: every control on this step must be nameable.
    await expect(
      page.getByLabel('Primary Timezone (IANA)'),
      'the timezone select still has no programmatic label',
    ).toHaveValue('Asia/Kolkata');
    await expect(
      page.getByLabel('24-Hour Flexible Rhythm'),
      'the 24-hour switch still has no programmatic label',
    ).toBeChecked();
    await expect(
      page.getByLabel('Quiet Hours Suppression'),
      'the quiet-hours switch still has no programmatic label',
    ).not.toBeChecked();

    const flexible = page.getByRole('checkbox').first();
    await expect(flexible, 'the 24-hour flexibility toggle was not checked by default').toBeChecked();

    await page.getByRole('button', { name: 'Next Step' }).click();

    // Step 2 -- Smart Reschedule Dial.
    await expect(page.getByRole('heading', { name: 'Smart Reschedule Dial' })).toBeVisible();
    await expect(page.getByText(/Auto \(Recommended\)/)).toBeVisible();
    // Locked decision: reschedule cap of 5. The stepper's readout is the only
    // element with that exact text on the step.
    await expect(page.locator('span.w-8.text-center')).toHaveText('5');

    await page.getByRole('button', { name: 'Next Step' }).click();

    // Step 3 -- Channels & Telegram.
    await expect(page.getByRole('heading', { name: 'Channels & Telegram' })).toBeVisible();
    // Web Push is declared UNAVAILABLE rather than offering a toggle that
    // silently does nothing; that honesty is worth pinning.
    await expect(page.getByText('UNAVAILABLE')).toBeVisible();

    // Step 3 must offer a real finish, not a dead end.
    await expect(page.getByRole('button', { name: /Complete Setup/i })).toBeVisible();

    problems.assertClean('onboarding walkthrough');
  });

  test('step 1 toggles the 24-hour switch and reveals the working-hours inputs', async ({ page }) => {
    const flexible = page.getByRole('checkbox').first();
    await expect(flexible).toBeChecked();

    // Reached by type, as above. There are exactly two time inputs (work start,
    // work end) when the switch is off -- and both now carry a real <label for>,
    // which the axe audit and the assertion below both depend on.
    const timeInputs = page.locator('input[type="time"]');
    await expect(timeInputs, 'the working-hours inputs were already showing').toHaveCount(0);

    await flexible.uncheck();

    // Turning it off must reveal the window; if it does not, the setting is a
    // decoration.
    await expect(timeInputs, 'turning off 24-hour flexibility revealed no work window').toHaveCount(2);
    await expect(page.getByLabel('Work Starts')).toHaveValue('09:00');
    await expect(page.getByLabel('Work Ends')).toHaveValue('18:00');
    await expect(timeInputs.first()).toHaveValue('09:00');
    await expect(timeInputs.last()).toHaveValue('18:00');

    await flexible.check();
    await expect(timeInputs).toHaveCount(0);
  });

  test('step 1 quiet hours reveal a suppression window', async ({ page }) => {
    // The second checkbox on step 1 is Quiet Hours. It must actually control
    // something rather than being a decorative toggle. The work window stays
    // hidden here because 24-hour flexibility is on by default, so exactly the
    // two quiet-hours inputs appear.
    const quiet = page.getByRole('checkbox').nth(1);
    await expect(quiet).not.toBeChecked();
    const timeInputs = page.locator('input[type="time"]');
    await expect(timeInputs).toHaveCount(0);

    await quiet.check();
    await expect(timeInputs, 'enabling quiet hours revealed no suppression window').toHaveCount(2);
    await expect(page.getByText('Quiet Hours Suppression')).toBeVisible();
    await expect(page.getByLabel('Quiet Starts')).toBeVisible();
    await expect(page.getByLabel('Quiet Ends')).toBeVisible();
  });

  test('going back preserves the step you advanced from', async ({ page }) => {
    await page.getByRole('button', { name: 'Next Step' }).click();
    await expect(page.getByText(/Step 2 of 3/)).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rhythm & Timezone' })).toBeVisible();

    // And there is no Back affordance on the first step.
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });

  test('completing setup writes both settings groups and enters Today', async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param is the fallback */
      }
    });
    await page.goto('/onboarding?test_auth=true', { waitUntil: 'commit' });
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 45_000 });

    await page.getByRole('button', { name: 'Next Step' }).click();
    await page.getByRole('button', { name: 'Next Step' }).click();
    await page.getByRole('button', { name: /Complete Setup/i }).click();

    // Both settings must be persisted; the wizard uses allSettled precisely so
    // one failure does not discard the other, which means a silent partial
    // write is the failure mode worth catching.
    await expect
      .poll(
        () =>
          api.writes.filter(
            (w) =>
              (w.path === '/api/settings/notifications' || w.path === '/api/settings/rescheduling') &&
              w.method === 'PATCH',
          ).length,
        { message: 'completing setup did not persist the settings', timeout: 15_000 },
      )
      .toBe(2);

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
      .toBe('/today');
  });
});
