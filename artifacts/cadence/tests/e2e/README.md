# Cadence E2E suite (Playwright)

This directory was rewritten on 2026-09-30. The previous suite could not fail.
Every spec guarded its real assertions:

```ts
await page.goto('/today');
if (!page.url().includes('/today')) return;            // auth bounce  -> PASS
if (await firstTaskCompleteBtn.isVisible()) { ... }    // empty list   -> PASS
```

so a blank page, a Clerk redirect, or an empty task list produced a green run.
That is worse than no test, because it manufactures confidence. Nine `test()`
calls asserted almost nothing, and four of them targeted `data-testid`s that no
longer exist (`form-task-editor`, `input-task-title`, `input-task-duetext`,
`button-save-task`).

---

## The honest-failure property

Three rules this suite is built on. Breaking any of them reintroduces the
problem above.

1. **No conditional early return.** If a precondition is unmet the test throws.
   There is no `if (...) return;` anywhere. Where a precondition genuinely
   cannot be met, the file uses an explicit `test.skip(reason)` with the reason
   in the string, so the skip is visible in the output.
2. **Every navigation is asserted.** `gotoRoute` waits for the shell's own
   control to be visible and asserts the final pathname. A redirect, a NotFound
   mount, or a module-graph failure all fail.
3. **A green run means something was measured.** The design-system spec reports
   the number it measured in the failure message, so "PASS" is never a
   restatement of a class name.

`retries: 0` in `playwright.config.ts`. The old config set `retries: 2` on CI,
which is how a flaky gate learns to be green. A test that needs a retry needs
fixing.

---

## Why the network is mocked (option (a))

`lib/api-client-react` calls every endpoint same-origin under the `/api` prefix,
so a `page.route` glob intercepts all of them before they leave the browser.
That was chosen over a live stack for one measured reason, not a preference:

**With the API unreachable, the app does not show an error state -- it
crashes.** Vite's SPA fallback answers `GET /api/tasks` with `index.html` and
HTTP 200. `customFetch` sees `response.ok`, returns the HTML as text, and
`TodayPage` calls `.map` on a string:

```
Something went wrong
This part of the app encountered an unexpected error. Your saved data remains secure.
list.map is not a function
```

So there is no error state to assert against, and a live-stack suite would need
`DATABASE_URL`, Clerk credentials, and a migrated remote database -- none of
which exist on a clean clone or in CI. A gate that cannot run is a gate that
gets skipped.

`installMockApi` returns **501 for any `/api` path it does not implement**. A new
endpoint the app starts calling therefore fails `console.spec.ts` and has to be
added on purpose, rather than the suite quietly covering less than it claims.

---

## Gates

**This suite is NOT part of `pnpm run verify`.** Three independent reasons:

1. It needs a ~310 MB browser download (`pnpm run verify:e2e:install`), which a
   typecheck or a codegen gate must never trigger.
2. It needs a Vite dev server, so it cannot run in a sandbox with no loopback.
3. It is materially slower than the other gates.

It is wired as a documented separate gate instead:

| Command | What it does |
|---|---|
| `pnpm run verify` | The 8 existing gates (`scripts/run-gates.cjs`). Unchanged. |
| `pnpm run verify:e2e` | The full Playwright suite. 38 tests, ~71s. |
| `pnpm run verify:e2e:smoke` | Everything except the six known-red conformance tests. Must stay green. |
| `pnpm run verify:e2e:desktop` | Alias for the current single-project gate. |
| `pnpm run verify:e2e:list` | Prints the plan without running anything. |
| `pnpm run verify:e2e:install` | One-time browser download (~310 MB). |

`verify:e2e` invokes `pnpm --filter @workspace/cadence run test:e2e`, not
`exec playwright test`. The `--filter ... exec` form resolves the binary but not
the working directory, so Playwright looks for `playwright.config.ts` relative
to the wrong root -- which is why the original script died with
`error: unknown command 'test'`. A package **script** always runs in the package
directory, which is where the config and `testDir` live.

`verify:e2e:smoke` is `--grep-invert @known-defect`. The six standing
conformance failures are tagged `KNOWN_DEFECT` in the specs, which exists so
that a *new* regression is still visible as a red build while the six known
defects keep the full gate red. If the smoke gate ever goes red, that is a fresh
regression, not a known issue. Tagging by name rather than grepping titles means
the tag cannot silently stop matching when a title is reworded, and each use
carries a doc comment requiring a measured reason.

**Measured 2026-09-30: `verify:e2e:smoke` = 32 passed, 0 failed, exit 0,
38.6 seconds.**


### The suite is currently RED, and that is the finding

**Measured 2026-09-30: 38 tests, 32 passed, 6 failed, 0 skipped, exit code 1,
71 seconds wall clock** (`pnpm run verify:e2e`, desktop 1440x900, 2 workers).

The six failures are not flaky and their assertions have not been weakened.
Every one prints the number it measured.

#### 1. The light theme is not functional -- 4 failures

`test-results/screens/today-light.png` is the proof. The theme is *partially*
implemented: components that use `text-foreground` / `bg-card` adapt correctly
(the Next Up card and the whole assistant panel look right), while components
that hardcode colours do not.

| Element | Theme | Foreground | Surface | Measured | Needed |
|---|---|---|---|---|---|
| Today page heading | light | `rgb(255,255,255)` | `rgb(245,245,245)` | **1.09:1** | 3:1 |
| Next Up card title | light | `rgb(24,24,27)` | `rgb(18,18,20)` | **1.06:1** | 4.5:1 |
| sidebar nav item | light | zinc-400 | `rgb(254,254,254)` | **2.61:1** | 4.5:1 |
| assistant heading | light | `rgb(125,122,255)` | `rgb(245,245,245)` | **3.16:1** | 4.5:1 |
| Focus page heading | light | `rgb(255,255,255)` | `rgb(245,245,245)` | **1.09:1** | 3:1 |
| timer task title | light | `rgb(24,24,27)` | `rgb(18,18,20)` | **1.06:1** | 4.5:1 |
| timer digits (56px) | light | `rgb(24,24,27)` | `rgb(18,18,20)` | **1.06:1** | 3:1 |

For comparison, every one of the same elements passes in dark: 21:1, 17.02:1,
6.65:1, 6.1:1.

Root cause, confirmed by reading the source after measuring:

- `src/index.css:212` -- `.card-enterprise { background-color: #121214; border:
  1px solid rgba(255,255,255,0.08) }`, hardcoded, with no light override. Applied
  by the FocusTimer, the Momentum card, every `TaskRow`, the agent panel and the
  focus tip cards.
- `src/components/shared/StateViews.tsx:24` -- `<h1 className="... text-white">`.
  Every `SectionHeading` in the app.
- `AppShell.tsx` hardcodes `text-white` for the brand wordmark and `text-zinc-*`
  for all eight nav labels.

The token layer is fine: `tokens.css` defines `:root[data-theme="light"]`
correctly and `--background` demonstrably resolves to `rgb(245,245,245)`. The
component layer simply does not consume it.

#### 2. `border-control` misses WCAG 1.4.11 -- 2 failures

| Element | Theme | Border | Surface | Measured | Needed |
|---|---|---|---|---|---|
| assistant composer | light | `rgb(142,142,147)` | `rgb(239,239,240)` | **2.84:1** | 3:1 |
| Focus status chip | light | `rgb(142,142,147)` | `rgb(239,239,240)` | **2.84:1** | 3:1 |
| sidebar "New task" | dark | `rgba(255,255,255,0.08)` | `rgb(33,33,36)` | **1.26:1** | 3:1 |
| sidebar "New task" | light | `rgba(255,255,255,0.08)` | `rgb(255,255,255)` | **1.00:1** | 3:1 |

`--border-control` is `#8E8E73`… precisely, `#8E8E93` in light: 3.26:1 on white
(passes) but 2.84:1 on the light `--muted` surface the agent controls sit on.
AGENTS.md states the rule as "border-control must stay >=3:1 against its
surface", so 3.26:1 on white is not sufficient on its own.

The sidebar "New task" button is a different problem: it does not use
`border-control` at all, it uses `border-white/[0.08]`, which is invisible on
both themes. Its only affordance is that border.

#### 3. Five primary controls measure below the 44px floor -- 1 failure

Measured as the largest fully-hit-tested square or circle centred on the
control. Identical in both themes.

| Control | Visual box | Owned square | Owned circle | Verdict |
|---|---|---|---|---|
| theme toggle | 32x32 | 44 | 44 | pass (via `.tap-target-expand`) |
| command palette | 32x32 | 44 | 44 | pass (expansion) |
| collapse sidebar | 28x28 | 44 | 44 | pass (expansion) |
| sidebar "New task" | 211x32 | 44 | 44 | pass (expansion) |
| **profile button** | 32x32 | 24 | **32** | **FAIL** |
| **sidebar nav item** | 211x32 | **32** | 32 | **FAIL** |
| task complete checkbox | 44x44 | 31 | **44** | pass (44pt circle) |
| **task edit (pencil)** | 28x28 | **24** | 28 | **FAIL** |
| **task delete** | 28x28 | **24** | 28 | **FAIL** |
| Add task | 103x32 | 44 | 44 | pass (expansion) |
| Plan Day | 103x32 | 44 | 44 | pass (expansion) |
| **quick capture field** | 520x32 | **32** | 32 | **FAIL** |
| assistant "Undo last" | 102x44 | 44 | 44 | pass |
| assistant "Send" | 76x44 | 44 | 44 | pass |

All six Focus controls pass (56px, and both 28px steppers reach exactly 44 via
expansion), so `design-system.spec.ts` "Focus controls present a 44px target"
is green.

The quick-capture field is desktop-only: it is `h-11 sm:h-8`, so it is a
compliant 44px below the `sm` breakpoint.

#### 4. Undo after delete silently does nothing -- 1 failure

`TaskRow.handleDelete`'s undo calls `create.mutate(...)` on a mutation owned by
the `TaskRow` that has already unmounted, so the per-call `onSuccess` never
fires. Measured: the `POST /api/tasks` is sent and returns 201, then **no
refetch and no confirmation toast**, with zero console errors and zero failed
requests. The task is recreated on the server; the user clicks Undo, sees
nothing happen, and concludes their task is gone.

That is a silent failure of a reversibility affordance, which locked decision
D-26 treats as a hard requirement.


---

## How the measurements are taken

Nothing here reads the token table. The token table is what is in question.

- **Colour** -- the in-page helper (`CONTRAST_HELPER` in `fixtures.ts`) asks the
  *browser* to resolve each colour by painting it into a 1x1 canvas and reading
  the sRGB bytes. A regex parser cannot be used: Tailwind v4 emits `oklch()` and
  Chrome's `getComputedStyle` returns it verbatim. An earlier draft did use a
  regex and silently reported four readable zinc-coloured labels as "MISSING".
- **Backgrounds** -- the ancestor chain is composited with real alpha, because
  WCAG 1.4.11 is about the adjacent colour a user perceives, not the declared
  one.
- **Tap targets** -- the largest rectangle (and, separately, the largest circle)
  centred on the control in which *every* sampled point hit-tests back to that
  control via `document.elementFromPoint`.

Two measurement subtleties that produced wrong numbers before they were fixed,
both documented at their call sites:

- `getBoundingClientRect()` alone reports every correctly-implemented 28px
  stepper as a 28px failure, because `index.css`'s `.tap-target-expand` grows the
  hit area with an absolutely-positioned `::after` that is not part of the
  border box.
- Casting a hit-test ray outward from the centre stops at the first neighbour, so
  two buttons 12px apart both measure as their mutual gap. Measured: the Focus
  controls reported `hit=129x55` for a 160x56 box.
- Chrome's hit testing *does* honour `border-radius`, so the circular task
  checkbox is a 44px circle whose largest owned square is 44/sqrt(2) = 31.1px.
  Reporting that as a 44px failure would be wrong; Apple's HIG target is a 44pt
  circle. The floor is therefore `max(ownedSquare, ownedCircle) >= 44`.

---

## What this suite does NOT verify

Stated plainly, because "we have an e2e suite" otherwise implies more than it
does.

- **No real backend, database, or Supabase.** Migration 0009 is still unapplied,
  and nothing here proves RLS isolation, two-account separation, or that the
  generated client matches a live Express response.
- **No Clerk.** Auth is bypassed via `?test_auth=true` /
  `localStorage.cadence_test_auth`, which `App.tsx:147` only honours under
  `import.meta.env.DEV`. Sign-in, sign-up, and session handling are untested.
- **Chromium only, desktop viewport only (1440x900).** No WebKit, no Firefox, no
  mobile viewport. Safari-specific PWA behaviour, iOS standalone install and Web
  Push remain unverified. A mobile project was written and then **removed**: at
  390px, `AppShell`'s sidebar is `hidden lg:flex`, so every sidebar selector was
  legitimately absent and the tap-target probe correctly returned "zero size" for
  them, producing failures that were artefacts of the viewport rather than
  defects. Shipping a project that fails for the wrong reason is the same sin as
  one that passes for the wrong reason. Mobile coverage is therefore an explicit
  gap.
  What the removed project did establish before removal: the task-row pencil and
  delete measure **32px** at 390px (vs 28px at 1440px) and the profile button
  32px, so those three are non-compliant on mobile too.

- **No Lighthouse, no performance budget, no visual regression.** The suite has
  no baseline snapshots.
- **Not covered at all:** Calendar drag-and-drop, Review, Inbox beyond a route
  load, Settings, Profile, the agent chat round-trip, Telegram, reschedule
  proposals, recurrence, rituals, file attachments, search, and export.
- **`automation_paused` kill-switch UI** -- still the known open gap from
  AGENTS.md section 5; the mock can drive `paused: true` but no test asserts the
  banner.
- **Unlabelled form controls.** `OnboardingPage` renders its `<label>` elements
  as siblings with no `htmlFor`, so the timezone select and the time inputs have
  no accessible name and cannot be reached with `getByLabel`. The specs reach
  them by role/type and say so in a comment. This is a real accessibility defect
  that is reported but not yet gated.

## Files

| File | Covers |
|---|---|
| `fixtures.ts` | Network mock, console guard, navigation assertion, measurement helpers. |
| `navigation.spec.ts` | Landing page, every sidebar route, Ctrl+K, N, number keys. |
| `tasks.spec.ts` | Capture (chips, POST, render), empty submit, completion, delete, undo. |
| `focus.spec.ts` | idle/running/paused/finished state machine, announcements, target clamp, reopen recovery, empty queue. |
| `memory-and-rituals.spec.ts` | Memory transparency, honest empty state, approve; onboarding 3 steps. |
| `design-system.spec.ts` | Theme render + toggle, text contrast, control borders, tap targets, screenshots. |
| `console.spec.ts` | No console error / uncaught error / failed request on 7 routes; error-state recovery; unmocked-endpoint detection. |
