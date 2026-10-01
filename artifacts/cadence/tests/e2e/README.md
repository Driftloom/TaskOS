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
| `pnpm run verify:e2e` | The full Playwright suite. 65 tests, ~3.8m. |
| `pnpm run verify:e2e:smoke` | Everything except the 13 `@known-defect` tests. Must stay green. |
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

## Added 2026-10-01: `pages.spec.ts` — the four routes nothing had ever rendered

**Measured 2026-10-01: `pnpm run verify:e2e` = 65 tests, 58 passed, 7 failed,
0 skipped, exit code 1, 3.8m. `pnpm run verify:e2e:smoke` = 52 passed, 0 failed,
exit 0, 2.1m.**

The baseline before this file was **38 tests, 38 passed, exit 0** — so the six
defects recorded above have since been fixed and their `@known-defect` tags are
now **stale** (see the note at the end of this section). `pages.spec.ts` adds 27
tests covering `/calendar`, `/review`, `/profile` and `/settings`, which no test
had loaded in any theme. All four render, all four are free of console errors
and failed requests, and each is now measured in both themes with a screenshot
per theme.

Seven of the new tests fail, every one against a measured product defect. Two
root causes account for most of them.

### Root cause A — the light theme block repeats the dark component surfaces

`src/styles/tokens.css` declares the same values in `:root` and
`:root[data-theme="light"]` for two tokens:

| Token | dark (line) | light (line) | Consequence |
|---|---|---|---|
| `--component-surface-card` | `#1C1C1E` (221) | `#1C1C1E` (292) | `.card-hig` (index.css:148) stays near-black in light mode |
| `--component-surface-raised` | `#3A3A3C` (222) | `#3A3A3C` (293) | `.btn-secondary` (index.css:209) stays dark-grey in light mode |

This is the same defect `.card-enterprise` had — and it *was* fixed, at
index.css:235 — on the sibling class that `/profile` uses instead. Profile is
built from twelve `.card-hig` cards, so **15 of 34 measured text targets fail in
light**, all of them traceable to that one token, and the worst measure
**1.04:1**:

| Element | fg | bg | Measured | Needed |
|---|---|---|---|---|
| display name (24px/800) | `rgb(24,24,27)` | `rgb(28,28,30)` | **1.04:1** | 3:1 |
| "24-Hour Working Rhythm" label | `rgb(24,24,27)` | `rgb(28,28,30)` | **1.04:1** | 4.5:1 |
| "Learned Patterns" heading | `rgb(24,24,27)` | `rgb(28,28,30)` | **1.04:1** | 4.5:1 |
| "Momentum & Consistency" heading | `rgb(24,24,27)` | `rgb(28,28,30)` | **1.04:1** | 4.5:1 |
| email / rhythm state / learned-patterns / telegram body (12px muted) | `rgb(101,101,103)` | `rgb(28,28,30)` | **2.93:1** | 4.5:1 |
| "Review everything Cadence knows" / "Open Review" links | `rgb(166,75,0)` | `rgb(28,28,30)` | **2.94:1** | 4.5:1 |
| "Active User" badge | `rgb(166,75,0)` | `rgb(62,47,26)` | **2.24:1** | 4.5:1 |
| "Play Test Chime" label | `rgb(166,75,0)` | `rgb(51,40,27)` | **2.48:1** | 4.5:1 |

**All 34 pass in dark** (worst: 4.23:1, on the 24px "Rounds Aim" value). The fix
is two lines in `tokens.css`.

### Root cause B — `text-success` has no light variant, and a text-safe one exists

`--success: 142 69% 50%` is declared identically at tokens.css:177 (dark) and
:248 (light), so `text-success` renders `rgb(40, 215, 104)` on both. A text-safe
token already exists and is unused: `--status-success-text` is `#30D158` in dark
and `#1E7B34` in light (tokens.css:191, :262).

| Page | Element | fg | bg | Measured | Needed |
|---|---|---|---|---|---|
| /review | "Evening Ritual" label (12px/700) | `rgb(40,215,104)` | `rgb(255,255,255)` | **1.91:1** | 4.5:1 |
| /profile | "Focus" stat value (24px/900) | `rgb(40,215,104)` | `rgb(239,239,240)` | **1.66:1** | 3:1 |

The sibling "Morning Ritual" label on the same `/review` card uses `text-accent`,
which *is* overridden for light (measured `rgb(0,108,224)` = 4.97:1, passing) —
so the Evening Ritual label is the odd one out on a card that otherwise works.

### Control boundaries (WCAG 1.4.11) — three real failures on /profile

| Element | Border | Surface | Measured | Needed |
|---|---|---|---|---|
| Export Backup (dark) | `rgba(255,255,255,0.08)` | `rgb(58,58,60)` | **1.27:1** | 3:1 |
| Export Backup (light) | `rgba(0,0,0,0.08)` | `rgb(58,58,60)` | **1.07:1** | 3:1 |
| Sign Out (both) | `border-destructive/30` | `rgb(51,32,33)` | **1.51:1** | 3:1 |
| Play Test Chime (both) | `border-primary/20` | `rgb(51,41,28)` | **1.49:1** | 3:1 |
| clerk-id chip (dark / light) | `rgb(110,110,115)` / `rgb(132,132,142)` | `rgb(34,34,37)` / `rgb(239,239,240)` | 3.13 / 3.22:1 | 3:1 |
| live clock chip (dark / light) | same | same | 3.13 / 3.22:1 | 3:1 |

`Export Backup` is `btn-secondary`, whose border is
`1px solid var(--border-subtle)` (index.css:208) — a direct violation of the rule
AGENTS.md §5 states as "border-control must stay ≥3:1 against its surface — it is
not border-subtle". The two passing controls are the only ones that actually use
`--border-control`, which is what makes the other three a token problem rather
than a measurement problem. `/calendar`, `/review` and `/settings` control
boundaries all pass in both themes.

### Tap targets (44px) — 17 controls under the floor, all measured

| Page | Control | Visual | Owned (max sq/circle) |
|---|---|---|---|
| /profile | 24h rhythm checkbox (`size-5`) | 20x20 | **20px** |
| /profile | "Open Review" link | 87.52x16 | **16px** |
| /profile | "Review everything Cadence knows" link | 200x20 | **20px** |
| /profile | dialog dismiss X (`size-8`, no accessible name) | 32x32 | **32px** |
| /profile | "Play Test Chime" | 246x38 | **38px** |
| /profile | "Export Backup" (`h-10`) | 129.94x40 | **40px** |
| /profile | "Sign Out" (`h-10`) | 110.95x40 | **40px** |
| /profile | modal "Cancel" (`py-2 text-xs`) | 77.97x40 | **40px** |
| /review | tag remove (`<X size={3} />`) | 12x12 | **12px** |
| /review | Ledger tab "Today" (`px-2 py-0.5`) | 45.67x20 | **20px** |
| /review | Ledger tab "Archive (7d)" | 75.34x20 | **20px** |
| /review | colour swatch (`size-5`) | 22x22 | **22px** |
| /review | "New project" field (`h-9`) | 752x36 | **36px** |
| /settings | focus-target decrement (`min-h-9 w-9`) | 36x36 | **36px** |
| /settings | focus-target increment (`min-h-9 w-9`) | 36x36 | **36px** |
| /settings | "Save target" (`btn-primary min-h-9`) | 98.06x36 | **36px** |

Identical in both themes. Three observations that matter more than the count:

- **The `/review` tag-remove button is `opacity-0 group-hover:opacity-100`.** It
  is 12px *and* it only appears on hover, so on touch — where there is no hover —
  the control that deletes a tag has no affordance at all.
- **The `/profile` 24h chronotype checkbox is 20px and has no `<label>`**, so
  neither its target nor its accessible name is acceptable.
- **`/settings`' three failures are one row** ("Daily Focus Target"). Every other
  Settings control reaches 44px, several via `tap-target-expand` — including the
  36x20 `settings-row-toggle` pill, which correctly passes on its owned *circle*.

`/calendar` is fully compliant: all 11 measured controls are exactly 44px.

### Mobile 390x844 — the previously-removed project, done honestly

`playwright.config.ts` still ships **no mobile project**, and the question "is the
Mobile Safari (iPhone 14) project defined/enabled" answers *no* — it is not in
this config at all, and `verify:e2e:desktop` is an alias for the single
`desktop-chromium` project. `pages.spec.ts` adds mobile coverage *inside* the
existing project via `test.use({ viewport: … })`, and asserts the mobile layout is
genuinely in effect before measuring (sidebar `hidden`, bottom dock and the
mobile header capture present, `window.innerWidth === 390`), which is what the
removed project failed to do.

- **No horizontal overflow anywhere.** `documentElement.scrollWidth <= clientWidth`
  holds on `/today` (also with the "More" sheet open), `/settings` and `/calendar`
  (also in month view, the densest layout in the app at 7 columns in 390px).
- **The gap the removed project recorded is now closed.** It reported the
  task-row pencil and delete at **32px** and the profile button at **32px** at
  390px. All three now measure **44px owned** (32px visual + `tap-target-expand`),
  as do the theme toggle, header capture, and all five bottom-dock slots
  (50px, and the centre capture a 44px circle). `/today` mobile is fully
  compliant.
- **Mobile does not rescue the `/settings` focus-target row**: the same three
  controls still measure 36px at 390px, because `min-h-9` is unconditional.

### What the new file deliberately does NOT assert

- **Time-block writes on `/calendar`.** `installMockApi` has no handler for
  `POST /api/tasks/:id/blocks` or `PATCH/DELETE /api/blocks/:id`, and it answers
  **501** for anything it does not implement — by design, so contract drift fails
  loudly. Clicking "Schedule" in the hour modal would therefore manufacture a 501
  that says nothing about the app. The modal is opened, its task list asserted and
  closed; the block lifecycle stays **unverified**, and the test asserts
  explicitly that no block write was issued. Adding the two mock handlers is the
  single highest-value follow-up in this suite.
- **`.btn-primary`'s gradient label.** "Save target" paints a
  `linear-gradient`, which `CONTRAST_HELPER` cannot resolve, so its reported
  backdrop is whatever sits behind the gradient. Such targets are marked
  `approx: true`: still measured and printed, not asserted — and the test *fails*
  if an `approx` target turns out to be measurable after all, so the flag cannot
  be widened to hide a real regression. The identical colour pairing
  (`--primary-foreground` on `--primary`) is asserted on the solid
  `button-toggle-sound`: 10.08:1 dark, 8.27:1 light.
- **Card outlines.** Measured and printed, not asserted, per the rule already
  documented above.
- **Mobile Safari / WebKit / Firefox.** Still not covered anywhere.

### Two testability findings, not fixed here

- **`ReviewPage.tsx` has exactly one `data-testid` in its own markup**
  (`review-task-${id}` on a completed ledger row). Everything else is reached by
  role and text. That is workable, but the measurement helpers take a CSS
  selector, so `pages.spec.ts` bridges role/text locators to one by stamping an
  inert `data-e2e-probe` attribute on the resolved node and removing it
  immediately after. No file under `src/` is touched. Adding testids to the other
  three pages' missing affordances — particularly `/profile`'s unlabelled 32px
  dialog dismiss button and its unlabelled 20px checkbox — is a real
  accessibility fix, not a test fix, and is out of scope for the test owner.
- **The six pre-existing `@known-defect` tags in `design-system.spec.ts` and
  `tasks.spec.ts` are stale**: all six tests now pass (38/38 green at the
  baseline). They are still excluded from `verify:e2e:smoke`, which is why smoke
  reports 52 rather than 58. Left in place deliberately — deciding whether those
  defects are genuinely fixed or the tests were weakened belongs to whoever owns
  the fixes, not to the test suite.

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
- **Chromium only.** No WebKit, no Firefox, no Mobile Safari project --
  `playwright.config.ts` still defines one project, `desktop-chromium`, and
  `verify:e2e:desktop` is an alias for it. Safari-specific PWA behaviour, iOS
  standalone install and Web Push remain unverified. A mobile *project* was
  written and then **removed** (see above for why: at 390px the sidebar is
  `hidden lg:flex`, so every sidebar selector was legitimately absent and the
  tap-target probe correctly reported "zero size" for them, producing failures
  that were artefacts of the viewport rather than defects). Mobile coverage is
  now provided a different way, by `pages.spec.ts` asserting only controls that
  exist at 390px and proving the mobile layout is in effect before measuring --
  see the 2026-10-01 section. It covers `/today`, `/settings` and `/calendar`
  only, and Chromium only.
  The gap the removed project recorded is closed: the task-row pencil and delete
  and the profile button, all recorded as 32px at 390px on 2026-09-30, now
  measure 44px owned.

- **No Lighthouse, no performance budget, no visual regression.** The suite has
  no baseline snapshots.
- **Not covered at all:** Calendar drag-and-drop and the time-block write
  lifecycle (`installMockApi` has no `/api/tasks/:id/blocks` handler and answers
  501, so the path is deliberately left unclicked), Inbox beyond a route load, the
  agent chat round-trip, Telegram, reschedule proposals, recurrence, file
  attachments, and search.
  Covered as of 2026-10-01: Review, Settings, Profile, the four page routes in
  both themes, `/settings` Export JSON (asserts a real download event), the
  Calendar view switch / period navigation / schedule modal, the Review ritual
  dialog and ledger scope switch, and the Profile rhythm toggle, chime and
  sign-out confirmation.
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
| `pages.spec.ts` | `/calendar`, `/review`, `/profile`, `/settings`: own-content render + console/network cleanliness, one behavioural test each, both themes + 8 screenshots, text contrast, control boundaries, tap targets, and 390x844 tap targets + horizontal overflow. |
