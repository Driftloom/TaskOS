import { expect, type Locator, type Page } from '@playwright/test';
import { installMockApi, test } from './fixtures';

/**
 * tests/e2e/keyboard.spec.ts -- keyboard operability, which no automated audit
 * can check.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * axe reads the accessibility tree. It cannot press Tab. It cannot see a focus
 * ring, a focus trap, or a control with no accessible name that still happens to
 * pass because some ancestor gives it one. Every defect below was invisible to
 * the contrast/tap-target suite AND to axe-core:
 *
 *   - `QuickCaptureSheet` and the sign-out confirmation both said
 *     `role="dialog" aria-modal="true"` and neither held focus. Tab walked out
 *     of the open overlay into the page behind it.
 *   - `OnboardingPage`'s timezone `<select>` and both checkboxes had no
 *     programmatic name at all -- reachable only by guessing at their position.
 *   - The Telegram token field's show/hide toggle was an unnamed 16x16 button.
 *
 * WHAT IS ASSERTED
 * ----------------
 *   1. SC 2.1.1 / 2.4.3 -- on `/today` and `/settings`, every keyboard-reachable
 *      control receives focus when Tab is pressed, exactly once per pass, and
 *      focus never escapes to `<body>` or into an unopened dialog mid-pass.
 *   2. SC 2.4.7 -- every one of those controls paints a visible focus indicator
 *      while it is focused. Asserted as a non-zero `outline` or a non-`none`
 *      `box-shadow` ON A VISIBLE ELEMENT: a control at `opacity-0` still takes
 *      focus and still measures 44x44, so measuring size alone would pass a ring
 *      nobody can see.
 *   3. SC 2.4.3 / 2.1.2 -- the quick-capture sheet and the sign-out confirmation
 *      contain Tab while open, close on Escape, and return focus to the control
 *      that opened them.
 *   4. SC 4.1.2 -- every `button` and every link has a non-empty accessible name.
 *      The name computation is validated against a deliberately unnamed control
 *      injected into the page, because a sweep that cannot fail is worthless.
 *
 * HONEST-FAILURE RULES
 * --------------------
 * The same three as the rest of the suite: no `if (...) return`, no
 * `isVisible()` guard around an assertion, and every failure message carries the
 * measured numbers.
 */

/**
 * Everything Chromium will put in the sequential focus order, matching the
 * selector in `src/components/shared/useModalFocus.ts` so this file and the
 * product agree on what "focusable" means.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** A short, stable description of an element for a failure message. */
function describeElement(page: Page, handle: number): Promise<string> {
  return page.evaluate((h) => {
    const el = document.querySelector<HTMLElement>(`[data-kb-probe="${h}"]`);
    if (!el) return `#${h} (gone)`;
    const testid = el.dataset.testid ? `[data-testid="${el.dataset.testid}"]` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}`
        : '';
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const name = el.getAttribute('aria-label') ?? '';
    return `<${el.tagName.toLowerCase()}${testid}${cls}> text="${text}" aria-label="${name}"`;
  }, handle);
}

/**
 * Stamps `data-kb-probe` on every reachable control, in DOM order, and returns
 * one handle per control. `data-*` has no effect on computed style or layout,
 * so stamping cannot change what is being measured.
 */
async function stampFocusables(page: Page, scope: Locator | null): Promise<number[]> {
  return page.evaluate(
    ([sel, scopeSel]) => {
      const root = scopeSel ? document.querySelector<HTMLElement>(scopeSel) : document.body;
      if (!root) throw new Error(`scope ${String(scopeSel)} matched nothing`);
      document.querySelectorAll('[data-kb-probe]').forEach((n) => n.removeAttribute('data-kb-probe'));
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(sel)).filter((el) => {
        if (el.closest('[inert]')) return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;

        // Content inside a CLOSED <details> is not sequentially focusable.
        //
        // `getClientRects()` does not catch this: Chrome still gives hidden
        // <details> descendants a layout box, so the visibility test below
        // passed them in, and then no number of Tab presses could ever land on
        // them. That produced a guaranteed red on /settings -- 8 controls, all
        // the advanced Telegram bot-token and webhook fields behind the
        // collapsed "Advanced: Custom Bot Token & Webhook" disclosure.
        //
        // The failure message described them as "operable only with a mouse",
        // which was false and actively misleading: expanding the summary makes
        // every one of them keyboard-reachable. This is a defect in the
        // enumeration, not in the app, and it is the same class of error this
        // file exists to prevent -- reporting on controls that were never part
        // of the assertion's population.
        //
        // The <summary> itself stays enumerated, because it is the disclosure's
        // actual tab stop.
        const closedDetails = el.closest('details:not([open])');
        if (closedDetails && !el.closest('summary')) return false;
        if (el.closest('[hidden]')) return false;

        return el.getClientRects().length > 0;
      });
      nodes.forEach((el, i) => el.setAttribute('data-kb-probe', String(i)));
      return nodes.map((_, i) => i);
    },
    [FOCUSABLE_SELECTOR, scope ? 'main' : null] as const,
  );
}

/** What is focused right now, plus what it looks like. */
interface FocusStop {
  probe: number | null;
  tag: string;
  testid: string;
  inDialog: boolean;
  isBody: boolean;
  visible: boolean;
  outlineWidth: number;
  outlineStyle: string;
  boxShadow: string;
}

async function readFocusStop(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const active = document.activeElement;
    const el = active instanceof HTMLElement ? active : null;
    const cs = el ? getComputedStyle(el) : null;
    return {
      probe: el?.dataset.kbProbe === undefined ? null : Number(el.dataset.kbProbe),
      tag: el ? el.tagName.toLowerCase() : '(none)',
      testid: el?.dataset.testid ?? '',
      inDialog: Boolean(el?.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')),
      isBody: !el || el === document.body || el === document.documentElement,
      visible: el ? el.getClientRects().length > 0 : false,
      outlineWidth: cs ? Number.parseFloat(cs.outlineWidth) || 0 : 0,
      outlineStyle: cs ? cs.outlineStyle : 'none',
      boxShadow: cs ? cs.boxShadow : 'none',
    };
  });
}

/**
 * Focuses the first stamped control, so a Tab walk starts at a known place.
 * Chromium keeps a sequential-focus navigation starting point that `blur()`
 * alone does not reliably clear, and this app autofocuses its agent composer --
 * so an unanchored walk began two stops from the END of the document and
 * reported "focus left the document after 3 presses", which is a fact about
 * where focus was, not about whether every control is reachable.
 */
async function resetFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const first = document.querySelector<HTMLElement>('[data-kb-probe="0"]');
    if (!first) throw new Error('data-kb-probe="0" is missing after stamping');
    first.focus();
  });
}

test.describe('tab order reaches every interactive control (SC 2.1.1 / 2.4.3)', () => {
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param still works */
      }
    });
  });

  for (const route of ['/today', '/settings'] as const) {
    test(`${route}: every focusable control is reachable by Tab, once, in order`, async ({
      page,
      open,
    }) => {
      await open(route);
      const ready =
        route === '/today' ? page.getByTestId('row-task-101') : page.getByTestId('input-timezone');
      await expect(ready, `${route} never rendered its own content`).toBeVisible({ timeout: 45_000 });
      await page.waitForTimeout(500);

      const expected = await stampFocusables(page, null);
      expect(
        expected.length,
        `${route} exposed no keyboard-reachable controls at all, so a "Tab reaches ` +
          'everything" pass here would be vacuous',
      ).toBeGreaterThan(8);

      /* ANCHORED, NOT "WHEREVER FOCUS HAPPENS TO BE". See `resetFocus`. */
      await resetFocus(page);

      const sequence: number[] = [];
      const escaped: string[] = [];
      const stoppedInDialog: string[] = [];

      // The anchor itself is stop 1.
      const anchor = await readFocusStop(page);
      if (anchor.probe !== null) sequence.push(anchor.probe);

      for (let i = 1; i < expected.length; i++) {
        await page.keyboard.press('Tab');
        const stop = await readFocusStop(page);
        if (stop.isBody) {
          escaped.push(`after ${i + 1} Tab press(es): focus fell out of the document`);
          continue;
        }
        if (stop.inDialog) {
          stoppedInDialog.push(
            `after ${i + 1} Tab press(es): focus landed inside ${stop.tag}` +
              `${stop.testid ? `[${stop.testid}]` : ''} while no dialog is open`,
          );
        }
        if (stop.probe !== null) sequence.push(stop.probe);
      }

      const missing = expected.filter((h) => !sequence.includes(h));
      const described = await Promise.all(missing.map((h) => describeElement(page, h)));
      const duplicates = sequence.filter((h, i) => sequence.indexOf(h) !== i);
      const outOfOrder: string[] = [];
      for (let i = 0; i < sequence.length; i++) {
        if (sequence[i] !== i) {
          outOfOrder.push(
            `focus stop ${i + 1} was control #${sequence[i]}, which is DOM position ` +
              `${sequence[i] + 1}`,
          );
        }
      }

      expect(
        escaped.join('\n'),
        `${route}: focus left the document after ${expected.length} Tab presses, so some ` +
          'control in the middle was never reached (SC 2.4.3).',
      ).toBe('');
      expect(
        stoppedInDialog.join('\n'),
        `${route}: focus entered a dialog that is not open. Nothing on this route should ` +
          'own a focus trap while no dialog is showing.',
      ).toBe('');
      expect(
        duplicates.length ? `Tab stopped twice on: ${duplicates.join(', ')}` : '',
        `${route}: the same control received focus twice in one pass, so another ` +
          'control was skipped.',
      ).toBe('');
      expect(
        outOfOrder.join('\n'),
        `${route}: Tab order does not follow DOM (reading) order. Screen-reader and ` +
          'keyboard users navigate in the order focus moves, so a mismatch here is ' +
          'SC 2.4.3 rather than a style preference.',
      ).toBe('');
      expect(
        described.join('\n'),
        `${route}: ${missing.length} of ${expected.length} keyboard-reachable controls were ` +
          'never focused. Each of these is operable only with a mouse.',
      ).toBe('');

      console.log(
        `  ${route}: ${expected.length} controls, all reached by Tab, in DOM order, ` +
          'none skipped, none doubled, focus never left the document.',
      );
    });
  }
});

test.describe('every focused control paints a visible focus indicator (SC 2.4.7)', () => {
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param still works */
      }
    });
  });

  for (const route of ['/today', '/settings'] as const) {
    test(`${route}: focus lands on a control you can see`, async ({ page, open }) => {
      await open(route);
      const ready =
        route === '/today' ? page.getByTestId('row-task-101') : page.getByTestId('input-timezone');
      await expect(ready).toBeVisible({ timeout: 45_000 });
      await page.waitForTimeout(500);

      const expected = await stampFocusables(page, null);
      expect(expected.length).toBeGreaterThan(8);

      // Measured AT THE MOMENT OF FOCUS, by pressing the key. A programmatic
      // `.focus()` does not necessarily match `:focus-visible`, so styling read
      // after `.focus()` would measure the wrong state.
      await resetFocus(page);
      const rows: string[] = [];
      const bad: string[] = [];
      // Every enumerated control carries a data-kb-probe stamp, so a Tab that
      // lands on an unstamped element means the static enumeration and the real
      // tab order disagree. Previously that case hit `continue` and vanished,
      // which let a control go UNMEASURED while the test still went green --
      // the exact "looks tested, tests nothing" failure this file exists to
      // prevent. Visiting is now recorded and asserted below.
      const visited = new Set<number>();
      // The anchor is stop 1; measure it too.
      for (let i = 0; i < expected.length; i++) {
        if (i > 0) await page.keyboard.press('Tab');
        const stop = await readFocusStop(page);
        if (stop.isBody || stop.probe === null) continue;
        visited.add(stop.probe);
        const label = await describeElement(page, stop.probe);
        const hasOutline = stop.outlineWidth > 0 && stop.outlineStyle !== 'none';
        const hasShadow = stop.boxShadow !== 'none' && stop.boxShadow !== '';
        rows.push(
          `  ${(hasOutline || hasShadow ? 'PASS' : 'FAIL')}  ${label}` +
            `  outline=${stop.outlineWidth}px/${stop.outlineStyle} box-shadow=${stop.boxShadow}` +
            `  visible=${stop.visible}`,
        );
        if (!stop.visible) {
          bad.push(`${label}\n      the control received focus but paints nothing (no layout box)`);
        } else if (!hasOutline && !hasShadow) {
          bad.push(
            `${label}\n      outline=${stop.outlineWidth}px/${stop.outlineStyle} ` +
              `box-shadow=${stop.boxShadow} -- no visible focus indicator`,
          );
        }
      }

      console.log(`${route} focus indicators:\n${rows.join('\n')}`);

      // Coverage first: a ring measurement only means something if every control
      // was actually reached. Assert this BEFORE the ring results so an
      // under-measured run reports the real problem rather than a flattering
      // "all measured controls look fine".
      const unreached = expected.filter((i) => !visited.has(i));
      const unreachedLabels = await Promise.all(
        unreached.map(async (i) => `${i}: ${await describeElement(page, i)}`),
      );
      expect(
        unreachedLabels.join('\n'),
        `${route}: ${unreached.length} of ${expected.length} enumerated controls were never ` +
          'reached by Tab, so they were never measured. The static enumeration and the real ' +
          'tab order disagree -- a passing ring result here would be meaningless.',
      ).toBe('');

      expect(
        bad.join('\n'),
        `${route}: ${bad.length} of ${expected.length} controls received keyboard focus with ` +
          'no visible focus indicator. A control you cannot see is a control you cannot use.',
      ).toBe('');
    });
  }

  /**
   * The same check for the text fields that only exist once a surface is open,
   * so the two route sweeps above cannot reach them.
   *
   * They were found by reading the source rather than by a failure: `index.css`
   * exempts `bg-transparent` inputs from the global `input:focus-visible` outline,
   * and every one of these was written with `outline-none`, so all of them had no
   * focus indicator at all. Leaving a fix unverified is how it silently
   * regresses, so each surface is opened here and the ring is measured.
   *
   * Programmatic `.focus()` is legitimate for THIS test and only this one:
   * `input`, `textarea` and `select` always match `:focus-visible` when focused,
   * so the measurement reads the same state a Tab would produce. That is not true
   * of buttons, which is why the route sweeps above press the key instead.
   */
  test('the task editor and the command palette paint a focus ring on their fields', async ({
    page,
    open,
  }) => {
    await open('/today');
    await expect(page.getByTestId('row-task-101')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(400);

    const rows: string[] = [];
    const bad: string[] = [];

    const measure = async (selector: string, where: string) => {
      const el = page.locator(selector);
      await expect(el, `${where}: ${selector} is not on screen`).toBeVisible();
      await el.focus();
      const info = await page.evaluate((sel) => {
        const node = document.querySelector<HTMLElement>(sel);
        if (!node) return null;
        const cs = getComputedStyle(node);
        return {
          outlineWidth: Number.parseFloat(cs.outlineWidth) || 0,
          outlineStyle: cs.outlineStyle,
          boxShadow: cs.boxShadow,
          visible: node.getClientRects().length > 0,
          matchesFocusVisible: node.matches(':focus-visible'),
        };
      }, selector);
      if (!info) {
        bad.push(`${where}: ${selector} vanished between the visibility check and the measurement`);
        return;
      }
      const ok =
        info.visible && (info.outlineWidth > 0 && info.outlineStyle !== 'none') || info.boxShadow !== 'none';
      rows.push(
        `  ${ok ? 'PASS' : 'FAIL'}  ${where} ${selector}  outline=${info.outlineWidth}px/` +
          `${info.outlineStyle} box-shadow=${info.boxShadow} :focus-visible=${info.matchesFocusVisible}` +
          ` visible=${info.visible}`,
      );
      if (!info.matchesFocusVisible) {
        bad.push(`${where}: ${selector} does not match :focus-visible when focused, so the ` +
          'measurement above is not the state a keyboard user sees');
      }
      if (!ok) {
        bad.push(`${where}: ${selector} has no visible focus indicator (SC 2.4.7)`);
      }
    };

    // Task editor: opened from a real task row, exactly as a user would.
    await page.getByTestId('button-pencil-task-101').click();
    await expect(page.getByTestId('input-task-title')).toBeVisible({ timeout: 15_000 });
    await measure('[data-testid="input-task-title"]', 'task editor title');
    await measure('[data-testid="input-task-notes"]', 'task editor notes');
    await page.getByTestId('button-cancel-editor').click();
    await expect(page.getByTestId('input-task-title')).toHaveCount(0);

    // Command palette: Ctrl+K, the documented shortcut (navigation.spec.ts).
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog'), 'the command palette did not open').toBeVisible({
      timeout: 15_000,
    });
    await measure('[cmdk-input]', 'command palette search');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    console.log(`focused text fields behind a surface:\n${rows.join('\n')}`);
    expect(bad.join('\n'), bad.join('\n')).toBe('');
  });
});

test.describe('dialogs contain focus, close on Escape, and give it back (SC 2.4.3 / 2.1.2)', () => {
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param still works */
      }
    });
  });

  test('the quick-capture sheet holds Tab, closes on Escape, and restores focus', async ({
    page,
    open,
  }) => {
    await open('/today');
    await expect(page.getByTestId('row-task-101')).toBeVisible({ timeout: 45_000 });

    const trigger = page.getByTestId('button-sidebar-capture');
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Quick capture' });
    await expect(dialog, 'the quick-capture sheet did not open').toBeVisible();
    await expect(
      page.getByTestId('input-quick-capture-sheet'),
      'the capture sheet opened with no input in it',
    ).toBeVisible();

    // Focus must be INSIDE before the first Tab, not merely somewhere on screen.
    const onOpen = await readFocusStop(page);
    expect(
      onOpen.inDialog,
      'opening the capture sheet left focus outside it, so the next Tab press would ' +
        'start editing the page behind the overlay',
    ).toBe(true);

    const escapes: string[] = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const stop = await readFocusStop(page);
      if (!stop.inDialog) {
        escapes.push(
          `Tab ${i + 1} landed on ${stop.tag}${stop.testid ? `[${stop.testid}]` : ''}`,
        );
      }
    }
    // And backwards, because a trap that only works in one direction is a trap.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+Tab');
      const stop = await readFocusStop(page);
      if (!stop.inDialog) {
        escapes.push(`Shift+Tab ${i + 1} landed on ${stop.tag}${stop.testid ? `[${stop.testid}]` : ''}`);
      }
    }
    expect(
      escapes.join('\n'),
      'focus escaped the open quick-capture sheet. 20 Tab presses inside a modal must ' +
        'stay inside it.',
    ).toBe('');

    await page.keyboard.press('Escape');
    await expect(dialog, 'Escape did not close the quick-capture sheet').toHaveCount(0);

    const restored = await readFocusStop(page);
    expect(
      restored.testid,
      'closing the sheet did not return focus to the control that opened it; focus is on ' +
        `${restored.tag}. A keyboard user then has to hunt for their place again.`,
    ).toBe('button-sidebar-capture');
  });

  test('the sign-out confirmation holds Tab, closes on Escape, and restores focus', async ({
    page,
    open,
  }) => {
    await open('/profile');
    await expect(page.getByTestId('button-profile-signout')).toBeVisible({ timeout: 45_000 });

    const trigger = page.getByTestId('button-profile-signout');
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: /sign out of cadence/i });
    await expect(dialog, 'the sign-out confirmation did not open').toBeVisible();

    const onOpen = await readFocusStop(page);
    expect(
      onOpen.inDialog,
      'opening the sign-out confirmation left focus outside it',
    ).toBe(true);

    const escapes: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const stop = await readFocusStop(page);
      if (!stop.inDialog) escapes.push(`Tab ${i + 1} landed on ${stop.tag}${stop.testid ? `[${stop.testid}]` : ''}`);
    }
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+Tab');
      const stop = await readFocusStop(page);
      if (!stop.inDialog) escapes.push(`Shift+Tab ${i + 1} landed on ${stop.tag}${stop.testid ? `[${stop.testid}]` : ''}`);
    }
    expect(
      escapes.join('\n'),
      'focus escaped the open sign-out confirmation',
    ).toBe('');

    await page.keyboard.press('Escape');
    await expect(dialog, 'Escape did not close the sign-out confirmation').toHaveCount(0);
    expect(
      await page.getByTestId('button-profile-signout').isVisible(),
      'closing the confirmation appears to have signed the user out anyway',
    ).toBe(true);

    const restored = await readFocusStop(page);
    expect(
      restored.testid,
      'closing the sign-out confirmation did not return focus to the trigger; focus is on ' +
        `${restored.tag}.`,
    ).toBe('button-profile-signout');
  });
});

test.describe('every icon-only control has an accessible name (SC 4.1.2)', () => {
  /**
   * In-page accessible-name computation.
   *
   * Deliberately NOT a regex over the DOM: it follows the accname order that
   * actually decides a name (aria-labelledby -> aria-label -> native label ->
   * text content -> title), it descends into shadow-free subtrees only, and it
   * ignores `aria-hidden` subtrees exactly as the name algorithm does, so a
   * button whose entire label is an icon contributes nothing -- which is the
   * case this file exists to catch.
   */
  const NAME_SCRIPT = `
    (function () {
      function textOf(root) {
        var out = '';
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        var node;
        while ((node = walker.nextNode())) {
          var parent = node.parentElement;
          if (!parent) continue;
          if (parent.closest('[aria-hidden="true"]')) continue;
          out += ' ' + node.nodeValue;
        }
        return out.replace(/\\s+/g, ' ').trim();
      }
      function accName(el) {
        var labelledby = el.getAttribute('aria-labelledby');
        if (labelledby) {
          var names = labelledby.split(/\\s+/)
            .map(function (id) {
              var ref = document.getElementById(id);
              return ref ? textOf(ref) : '';
            })
            .filter(Boolean)
            .join(' ');
          if (names) return names;
        }
        var label = el.getAttribute('aria-label');
        if (label && label.trim()) return label.trim();

        var tag = el.tagName.toLowerCase();
        if (tag === 'img' || tag === 'area') {
          var alt = el.getAttribute('alt');
          if (alt) return alt.trim();
        }
        /* <label for> names every LABELABLE element, and that set is not only the
           form controls: a Radix <button role="switch" id="x"> next to
           <label for="x">Text</label> IS named by that label, which is how
           SettingsPage's settings-row-toggle gets its name. An earlier version of
           this function only consulted el.labels on input/select/textarea and so
           reported that switch as nameless -- a false positive, i.e. a defect in
           the detector rather than in the product. */
        var selfId = el.getAttribute('id');
        if (selfId) {
          var explicit = document.querySelector('label[for="' + CSS.escape(selfId) + '"]');
          if (explicit) {
            var t = textOf(explicit);
            if (t) return t;
          }
        }
        if (tag === 'input' || tag === 'select' || tag === 'textarea') {
          var labels = el.labels;
          if (labels && labels.length) {
            var joined = Array.prototype.map.call(labels, textOf).join(' ').trim();
            if (joined) return joined;
          }
          var ph = el.getAttribute('placeholder');
          if (ph && ph.trim()) return ph.trim();
        }
        var own = textOf(el);
        if (own) return own;
        var title = el.getAttribute('title');
        if (title && title.trim()) return title.trim();
        return '';
      }
      function describe(el) {
        var testid = el.dataset.testid ? '[data-testid="' + el.dataset.testid + '"]' : '';
        var cls = typeof el.className === 'string' && el.className
          ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
          : '';
        return '<' + el.tagName.toLowerCase() + testid + cls + '> text="' +
          textOf(el).slice(0, 40) + '" aria-label="' + (el.getAttribute('aria-label') || '') +
          '" title="' + (el.getAttribute('title') || '') + '"';
      }
      window.__kbSweep = function (selector) {
        return Array.prototype.map
          .call(document.querySelectorAll(selector), function (el) {
            return {
              name: accName(el),
              role: el.tagName.toLowerCase() === 'a' ? 'link' : el.tagName.toLowerCase(),
              html: el.outerHTML.replace(/\\s+/g, ' ').slice(0, 200),
              describe: describe(el),
              visible: el.getClientRects().length > 0,
            };
          })
          .filter(function (r) { return r.visible; });
      };
      return true;
    })();
  `;

  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
      } catch {
        /* the ?test_auth=true query param still works */
      }
    });
    await page.addInitScript(NAME_SCRIPT);
  });

  const ROUTES: ReadonlyArray<readonly [string, Locator]> = [];
  void ROUTES;

  for (const route of [
    '/today',
    '/settings',
    '/profile',
    '/focus',
    '/calendar',
    '/review',
    '/memory',
    '/inbox',
    '/onboarding',
  ] as const) {
    test(`${route}: no button or link is nameless`, async ({ page, open }) => {
      await open(route);
      await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });
      await page.waitForTimeout(500);

      // The detector is validated FIRST, against a control that genuinely has no
      // name. Without this the sweep could pass because the computation is
      // broken, which is the exact failure mode this suite was rewritten to
      // eliminate.
      const probeCaught = await page.evaluate(() => {
        const host = document.createElement('div');
        host.innerHTML =
          '<button data-kb-name-probe="1" type="button"><svg width="8" height="8"></svg></button>' +
          '<a data-kb-name-probe="2" href="#kb"><svg width="8" height="8"></svg></a>';
        document.body.appendChild(host);
        const rows = (window as unknown as { __kbSweep(s: string): { name: string }[] }).__kbSweep(
          '[data-kb-name-probe]',
        );
        host.remove();
        return rows.filter((r) => r.name === '').length;
      });
      expect(
        probeCaught,
        'the accessible-name sweep did not flag a deliberately unnamed icon button and ' +
          'icon link, so it cannot be trusted to flag a real one',
      ).toBe(2);

      const rows = (await page.evaluate(() =>
        (
          window as unknown as { __kbSweep(s: string): { name: string; describe: string }[] }
        ).__kbSweep('button, a[href]'),
      )) as { name: string; describe: string }[];

      expect(
        rows.length,
        `${route} exposed no buttons or links, so the accessible-name sweep proved nothing`,
      ).toBeGreaterThan(4);

      const nameless = rows.filter((r) => r.name.trim() === '');
      console.log(
        `  ${route}: swept ${rows.length} buttons/links, ${nameless.length} without an accessible name`,
      );
      expect(
        nameless.map((r) => r.describe).join('\n'),
        `${route}: ${nameless.length} of ${rows.length} buttons/links have NO accessible name ` +
          '(SC 4.1.2). An icon-only control with no name is announced as just "button".',
      ).toBe('');
    });
  }
});
