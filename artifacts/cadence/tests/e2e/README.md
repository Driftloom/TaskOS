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

### Environment sensitivity, measured 2026-10-01

`verify:e2e` drives a real browser against an **unbundled** Vite dev server, so
it is sensitive to machine load in a way `pnpm run verify` is not. Two runs on
2026-10-01 were deterministic: **11 failed / 81 passed, zero network errors**,
with the same 11 both times. Later runs on the same tree produced 19-27 failures
from a different mechanism entirely — `net::ERR_EMPTY_RESPONSE` and
`net::ERR_CONNECTION_RESET` on document loads, and Vite's HMR WebSocket failing
its handshake (`Connection closed before receiving a handshake response`).

That is **not** caused by this file, and the control is easy to run:

```
pnpm --filter @workspace/cadence run test:e2e -- \
  --grep-invert "automated WCAG|tab order reaches|focused control paints|dialogs contain focus|icon-only control|AA tag set resolves"
```

With all 27 tests added here excluded, the 65-test baseline still failed 6 with
the same errors. It is also not Playwright's management of the web server: running
against a Vite instance this author started by hand, via `PLAYWRIGHT_BASE_URL`,
was *worse* (16 errors), which rules out the stdio pipe and the server lifecycle.

Free physical memory during the bad runs was measured at **256-282 MB of 16 GB**
with 31 `node` and 20 `chrome` processes on the box. Nothing in this suite can
fix that. When re-measuring, check free memory first.

`console.spec.ts` is the most exposed, and correctly so: its guard fails on any
`console.error`, and a browser that cannot complete an HMR handshake logs one.
That entry was **deliberately not added to the `BENIGN` list** in `fixtures.ts`,
because exempting dev-server infrastructure noise to make a red run green is the
thing this suite exists to prevent.


| Command | What it does |
|---|---|
| `pnpm run verify` | The 9 existing gates (`scripts/run-gates.cjs`). Unchanged. |
| `pnpm run verify:e2e` | The full Playwright suite. 92 tests in 9 spec files. |
| `pnpm run verify:e2e:smoke` | `--grep-invert @known-defect`. **Identical to `verify:e2e` since 2026-10-01** -- see below. |
| `pnpm run verify:e2e:desktop` | Alias for the current single-project gate. |
| `pnpm run verify:e2e:list` | Prints the plan without running anything. |
| `pnpm run verify:e2e:install` | One-time browser download (~310 MB). |

`verify:e2e` invokes `pnpm --filter @workspace/cadence run test:e2e`, not
`exec playwright test`. The `--filter ... exec` form resolves the binary but not
the working directory, so Playwright looks for `playwright.config.ts` relative to
the wrong root -- which is why the original script died with
`error: unknown command 'test'`. A package **script** always runs in the package
directory, which is where the config and `testDir` live.

`verify:e2e:smoke` is `--grep-invert @known-defect`. The mechanism exists so that
a standing conformance failure cannot mask a fresh regression: a developer sees
red, assumes it is the known one, and ships a new bug. Tagging by name rather
than grepping titles means the tag cannot silently stop matching when a title is
reworded, and each use carries a doc comment requiring a measured reason.

**As of 2026-10-01 the tag has zero users.** All thirteen of them were removed
after re-running each test and watching it pass; see "Added 2026-10-01: the
thirteen stale `@known-defect` tags" below. `verify:e2e` and `verify:e2e:smoke`
now run exactly the same tests, which is the point: a smoke gate that skips tests
cannot prove anything about them.



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
  reports 52 rather than 58. Left in place deliberately -- deciding whether those
  defects are genuinely fixed or the tests were weakened belongs to whoever owns
  the fixes, not to the test suite.

---

## Added 2026-10-01: the thirteen stale `@known-defect` tags are gone

**Measured before the change: `pnpm run verify:e2e` = 65 tests, of which 13
carried `@known-defect`; `pnpm run verify:e2e:smoke` = 52 passed, 0 failed, exit
0.** The 13 were excluded from the smoke gate purely because of the tag, so a
green smoke run said nothing about whether those 13 defects were fixed.

**Procedure: run each of the 13 on its own (`--grep @known-defect`), confirm it
passes, then remove the tag and replace the doc comment with one naming what the
test now protects against.** Measured result: **13 passed, 0 failed, 2.1m.**

| # | File | Test | Root cause the tag recorded | Genuinely fixed? |
|---|---|---|---|---|
| 1 | `design-system.spec.ts` | Today text is legible in the light theme | `.card-enterprise { background-color: #121214 }` with no light override + `SectionHeading` hardcoding `text-white`. Measured 1.09:1 heading, 1.06:1 card title. | **Yes** |
| 2 | `design-system.spec.ts` | Focus text is legible in both themes | Same `.card-enterprise` defect on the timer card; the 56px digits measured 1.06:1 in light. | **Yes** |
| 3 | `design-system.spec.ts` | border-control meets 3:1 in the dark theme | Sidebar "New task" used `border-white/[0.08]` = 1.26:1, invisible on either theme and its only affordance. | **Yes** |
| 4 | `design-system.spec.ts` | border-control meets 3:1 in the light theme | `--border-control` measured 2.84:1 on the light `--muted` surface the agent controls sit on. | **Yes** |
| 5 | `design-system.spec.ts` | Today controls present a 44px target in both themes | Profile button 24px, nav items 32px, task pencil/delete 24px. | **Yes** |
| 6 | `pages.spec.ts` | Review text is legible in both themes | Evening Ritual label used `text-success`, which tokens.css declares identically in both themes: 1.91:1 at 12px/700. | **Yes** |
| 7 | `pages.spec.ts` | Profile text is legible in both themes | `--component-surface-card` repeated unchanged in the light block, so 15 of 34 targets failed in light, worst 1.04:1. Plus `text-success` at 1.66:1. | **Yes** |
| 8 | `pages.spec.ts` | Profile control boundaries meet 3:1 in both themes | `.btn-secondary` used `border-subtle` (1.27:1 dark / 1.07:1 light); `border-destructive/30` 1.51:1; `border-primary/20` 1.49:1. | **Yes** |
| 9 | `pages.spec.ts` | Review controls present a 44px target in both themes | Ledger tabs 20px, "New project" 36px, colour swatch 22px, tag remove 12px **and** `opacity-0 group-hover:opacity-100`, so unreachable by touch. | **Yes** |
| 10 | `pages.spec.ts` | Profile controls present a 44px target in both themes | 8 of 11 under 44px; the 20px checkbox had no `<label>` and the dismiss X had no accessible name. | **Yes** |
| 11 | `pages.spec.ts` | Settings controls present a 44px target in both themes | The three "Daily Focus Target" controls were `min-h-9 w-9` with no `tap-target-expand` = 36px. | **Yes** |
| 12 | `pages.spec.ts` | Settings offers 44px targets and no horizontal overflow at 390px | The same three controls at 390x844, where `min-h-9` is unconditional. | **Yes** |
| 13 | `tasks.spec.ts` | the delete toast offers a working undo that re-creates the task | Undo fired through a mutation owned by an unmounted `TaskRow`, so its `onSuccess` never ran: POST 201, then nothing on screen, no console error. | **Yes** |

The brief anticipated seven. There were thirteen: seven in `pages.spec.ts`, five
in `design-system.spec.ts` and one in `tasks.spec.ts`. All thirteen were removed,
because leaving six stale tags would have kept the smoke gate from proving
anything about those six either.

**Counts after the change:** `verify:e2e` = 92 tests (65 existing + 11 axe + 16
keyboard), `verify:e2e:smoke` = 92 tests, identical. Before: 65 and 52.

---

## Added 2026-10-01: `a11y-audit.spec.ts` — an automated WCAG 2.0/2.1/2.2 AA audit

The suite measured contrast (1.4.3), control boundaries (1.4.11) and tap targets
(2.5.5) by hand, in both themes, on every route — and had never run an audit.
`@axe-core/playwright` 4.13.0 now runs `AxeBuilder` over every route in both
themes against the tag set `['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']`
— WCAG AA only, deliberately **not** `best-practice`, because mixing that in would
turn a conformance check into a style opinion.

The theme is set through the app's own store (`localStorage['cadence.theme']` +
reload) rather than by clicking the header toggle, because `/` has no toggle at
all and a toggle that has not rendered yet can silently leave the audit looking at
the wrong theme. Every test then **asserts the live `data-theme`**, so "we audited
light mode" cannot be a claim about a page that is still dark.

A twelfth test reads the rule catalogue back off `window.axe.getRules()` after an
audit and asserts two separate things: that the tag set resolves to **70 rules,
every one of them AA-tagged** (so `best-practice` cannot leak in), and that nine
named rules this suite's findings came from are still in it (so an axe upgrade
that retires one cannot pass unnoticed). It then asserts the audit applied at
least 15 rules to a real page — a liveness check, with the floor set below the
smallest count measured across all 24 screens.

### Per-screen result — 24 screens (10 routes × 2 themes, plus all 3 onboarding steps × 2 themes)

| Screen | Rules passing | **Violations** | Incomplete | n/a |
|---|---|---|---|---|
| `/` dark / light | 15 / 15 | **1 / 1** | 1 | 47 |
| `/today` dark / light | 24 / 24 | **1 / 1** | 1 | 38 |
| `/inbox` dark / light | 19 / 19 | **1 / 1** | 1 | 43 |
| `/focus` dark / light | 21 / 21 | **1 / 1** | 1 | 41 |
| `/review` dark / light | 23 / 23 | **1 / 1** | 1 | 39 |
| `/calendar` dark / light | 17 / 17 | **1 / 1** | 1 | 45 |
| `/memory` dark / light | 22 / 22 | **1 / 1** | 1 | 40 |
| `/onboarding` step 1 dark / light | 21 / 21 | **1 / 1** | 1 | 41 |
| `/onboarding` step 2 dark / light | 17 / 17 | **1 / 1** | 2 | 45 |
| `/onboarding` step 3 dark / light | 21 / 21 | **1 / 1** | 1 | 41 |
| `/profile` dark / light | 20 / 20 | **1 / 1** | 1 | 42 |
| `/settings` dark / light | 26 / 26 | **1 / 1** | 1 | 36 |

**After the fixes below, exactly one rule fails on all 24 screens: `meta-viewport`,
one node each.** Before the fixes the table below lists **10 route-level findings
covering 6 distinct rule ids**; 9 of the 10 were fixed.

`/onboarding` is audited at all three steps because it is three screens behind one
URL. The 24-hour switch is turned **off** first, on purpose: the work-start /
work-end time inputs only render in that branch, so leaving it on would hide two
now-labelled controls from the audit entirely — the same class of blind spot as
auditing a route that never rendered.

### What `incomplete` means here, and why it is not a pass

Every `incomplete` on every screen is `color-contrast`, and they are the elements
whose backdrop axe cannot resolve: `.btn-primary` and `.btn-secondary` paint a
`linear-gradient`, `.font-black` headings and `.inset-0` eyebrows sit over the
glass chrome and the ambient `bg-primary/10` blur, the onboarding stepper value
(`.w-8`) sits over a tinted card, and the `.bg-status-warning-fill/10` chips sit
on a `bg-card/[0.04]` overlay. axe returns *needs review*, which is a third
answer, not a pass. It is printed with the same node detail as a violation and is
never counted as a pass. The solid equivalents of those pairings are asserted by
the existing `CONTRAST_HELPER` measurements, which is why `pages.spec.ts` already
documents gradients as an `approx` (printed, not asserted) case.

### Every violation found, and what happened to it

| Rule | Impact | Screens | Nodes | Defect | Disposition |
|---|---|---|---|---|---|
| `meta-viewport` | moderate | **all 24** | 1 each | `artifacts/cadence/index.html` sets `maximum-scale=1` in the viewport meta, which disables pinch-zoom. axe tags it `wcag2aa, wcag144` — a real SC 1.4.4 failure. | **NOT FIXED — file outside this work's ownership.** Reported below. |
| `color-contrast` | serious | `/today`, `/calendar` (dark **and** light) | 3 each | The completed task row was dimmed with a blanket `opacity-60`, which took its own already-muted ink to **3.17:1 dark / 2.49:1 light** on the strikethrough title, the priority chip and the duration. | **Fixed.** `TaskRow.tsx` no longer dims the row; completion is carried by the filled check circle + `line-through` + muted ink, i.e. by shape as well as colour, which is what AGENTS.md §5 asks for. |
| `color-contrast` | serious | `/focus` (dark **and** light) | 1 each | The Focus status chip painted `text-accent` on `bg-muted`: **4.22:1 dark / 4.32:1 light** against 4.5:1. | **Fixed.** `FocusTimer.tsx` — the chip's neutral fill is now `bg-card`, where `--accent` measures 4.53:1 / 4.97:1. Its `border-border-control` still carries SC 1.4.11 (4.60:1 / 3.70:1). Both chips changed together, since the second one has the same defect in the `recovered` state. |
| `color-contrast` | serious | `/memory` (dark) | 3 | Three solid `bg-ai` buttons labelled with `text-foreground`: **3.13:1**. | **Fixed.** `MemoryPage.tsx` now uses `text-primary-foreground` on `bg-ai` — **6.10:1 dark / 4.89:1 light** — which is the convention `AgentPanel`, `ActionPreview` and `AgentActionCard` already use. A fourth site (the add-fact form's submit) had the identical defect and was fixed with them; it is not rendered in the default state, so the audit cannot exercise it. |
| `color-contrast` | serious | `/onboarding` (dark **and** light) | 1 | The primary CTA was `bg-accent` + `text-foreground`: **3.41:1 dark / 3.56:1 light**. | **Fixed.** `OnboardingPage.tsx` — `bg-primary` + `text-primary-foreground` (**10.22:1 / 8.70:1**). AGENTS.md §5 assigns orange to primary CTAs and reserves blue for scheduled blocks and secondary links, so this is also the off-system-token correction. The step-3 "Verify" button had the identical pairing and was fixed with it. |
| `label` | **critical** | `/onboarding` (dark **and** light) | 2 | The 24-hour and quiet-hours checkboxes were rendered as bare `<input type="checkbox">` siblings of their heading, with no `<label>` and no `for`. No accessible name at all. | **Fixed structurally.** The heading text is now a real `<label htmlFor>` **inside** the `<h4>` — visible text, no `aria-label`, no duplicated `sr-only` string. The four `input[type=time]` fields in the same file had the same defect on a branch the audit cannot reach; all four got `id` + `htmlFor` too. |
| `select-name` | **critical** | `/onboarding` (dark **and** light) | 1 | The timezone `<select>`'s `<label>` was a sibling with no `htmlFor`, so the control had no accessible name and could not be reached with `getByLabel`. `memory-and-rituals.spec.ts` had documented this as a known defect and worked around it by role. | **Fixed structurally.** `id` + `htmlFor`. |
| `button-name` | **critical** | `/settings` (dark **and** light) | 1 | The Telegram token field's show/hide toggle was a bare `<button>` wrapping an `<Eye size={16}/>`: no discernible text, and the SVG had no accessible name either. | **Fixed.** `MessagingIntegrationsView.tsx` — `aria-label` that flips with the state, plus `aria-pressed` so the toggle's state is announced. This is a name the control genuinely lacked, not an attribute added to quiet a rule about something else. |
| `target-size` | serious | `/settings` (dark **and** light) | 1 | The same toggle measured **16×16**. WCAG 2.2 SC 2.5.8 asks for 24; AGENTS.md §5 asks for 44. | **Fixed.** The button is now `grid size-11` (44×44) and the input's right padding was widened from `pr-10` to `pr-11` so the caret never lands under it. `aria-label` would not have fixed this, so it did not try to. |
| `color-contrast` | serious | `/settings` (dark **and** light) | 3 dark / 5 light | `bg-accent/20 text-accent` "Primary" badge (**3.33 / 3.31**); the two inline `@BotFather` / `@userinfobot` links (`text-accent` on `--muted`, **4.22 / 4.32**); light-only, `bg-success/20 text-status-success-text` "Watchdog" (**4.37**) and `text-destructive` "*REQUIRED*" (**3.40** on white). | **Fixed.** All in `MessagingIntegrationsView.tsx`. The two badges moved from `/20` to `/10` tints; the links take `text-foreground` with a **persistent** `underline decoration-border-control` instead of hue, because `--accent` cannot be text on `--muted` in either theme; `*REQUIRED` now uses `text-status-danger-text` (`#D70015` in light = 5.38:1), which is the text-safe danger token the design system already defines. |

### The one violation left, and why

`meta-viewport`, one node, on all 24 screens, in
`artifacts/cadence/index.html`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1">
```

`maximum-scale=1` disables pinch-zoom, which is an SC 1.4.4 (Resize text) failure
and is tagged `wcag2aa` by axe-core. The fix is to delete `maximum-scale=1`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

**It was not applied.** `artifacts/cadence/index.html` is neither
`tests/e2e/**` nor `src/components/**` nor `src/pages/**`, so it is outside the
ownership this work was given, and `AGENTS.md` §5 additionally says the token
layer and `index.css` are not to be hand-edited. The test is therefore **left
failing on purpose** — an `axe-disable` or an excluded rule would have made the
gate green while the product stayed broken, which is the failure mode this suite
was rewritten to eliminate. `pnpm run verify:e2e` exits 1 because of this and
because of the `/settings` focus ring described in the next section; nothing else
fails.

### The token-layer finding underneath four of those fixes

`--accent` is Apple system blue: `#0A84FF` in dark, `#006CE0` in light. It reaches
4.5:1 on `--card` (4.53 / 4.97) and **fails on `--muted` (4.18 / 4.33)** and on
every accent tint (3.31–4.32). It also cannot carry a label on its own fill in
either theme — white gives 3.75 dark, near-black gives 4.49 dark / 3.38 light.
The design system's own spec already knows this: `docs/13-master-design-system-prompt.md`
line 228 assigns links `#0040DD` in light precisely because "`#007AFF` is only
≈4.0:1 on white", and `tokens.json` has an unused `link`/`linkLight` alias that
was never wired into a semantic token.

So the components that could be fixed at the component layer were fixed by moving
the *surface* (`FocusTimer`) or the *ink* (`MemoryPage`, `OnboardingPage`,
`MessagingIntegrationsView`) — but the gap itself is in `tokens/tokens.json`, which
this work does not own. A theme-aware on-fill text token (`--accent-text-safe`,
and a link token distinct from `--accent`) would remove the whole class.

---

## Added 2026-10-01: `keyboard.spec.ts` — keyboard operability

axe reads the accessibility tree. It cannot press Tab, so every defect below was
invisible to both the hand-written contrast/tap-target measurements **and** to
axe-core.

### Tab order (SC 2.1.1 / 2.4.3) — `/today` and `/settings`

Both routes: **every** keyboard-reachable control receives focus, in DOM (reading)
order, exactly once per pass, with focus never leaving the document and never
entering an unopened dialog.

| Route | Controls | Reached by Tab | Out of DOM order | Doubled stops |
|---|---|---|---|---|
| `/today` | **39** | 39 | 0 | 0 |
| `/settings` | **43** | 43 | 0 | 0 |

One methodological note, because the first draft of this test reported a false
failure: pressing Tab from "wherever focus happens to be" is not a tab-order test.
Chromium keeps a sequential-focus navigation starting point that `blur()` does not
reliably clear, and the app autofocuses its agent composer, so the unanchored walk
on `/today` began two stops from the **end** of the document and claimed "focus
left the document after 3 presses". The walk is now anchored on the first control
explicitly, and the order it produces is asserted against DOM order — which is
what SC 2.4.3 actually asks for.

### Visible focus indicator (SC 2.4.7) — 9 groups of text inputs (14 fields) with no focus indicator at all

`index.css` paints a 2px `--primary` ring on `button:focus-visible`,
`a:focus-visible`, `select:focus-visible` and `input:focus-visible`, but the input
rule carries three opt-outs: `:not([class*="border-none"])`,
`:not([class*="outline-none"])`, `:not([class*="bg-transparent"])`. So any input
written with `outline-none`, and any `bg-transparent` input, got **no ring at
all** — measured `outline-width: 1px` with `outline-style: none` and
`box-shadow: none`, which is nothing.

| Control | File | Was | Now |
|---|---|---|---|
| Agent composer (`agent-composer`) | `components/agent/AgentPanel.tsx` | none | 2px solid, 2px offset |
| Quick-capture field, inline and in the sheet | `components/task/QuickCaptureSheet.tsx` | none | `focus-visible:outline-2` + offset + `--primary` |
| Today task filter | `pages/today/TodayPage.tsx` | none | `focus-visible:outline-2` + offset + `--primary` |
| Inbox search filter | `pages/inbox/InboxPage.tsx` | none | same |
| Workspace project rename | `components/task/WorkspacePanel.tsx` | none | same (not reachable with the current mock) |
| Command palette search | `components/chrome/CommandPalette.tsx` | none | same |
| Task editor title + notes | `components/task/TaskEditor.tsx` | none (`outline-none focus:outline-none focus:ring-0`, under a comment reading "No Orange Focus Box") | same — the box stays borderless, the *ring* comes back |
| Four Telegram credential inputs | `pages/settings/MessagingIntegrationsView.tsx` | none | 2px solid via the global rule |
| **`/settings` timezone field (`input-timezone`)** | **`pages/settings/SettingsPage.tsx:430`** | **none** | **NOT FIXED — see below** |

Visibility is asserted, not just size: the spec reads the indicator at the moment
of focus **and** checks the control has a layout box, because a control at
`opacity-0` still takes focus and would otherwise pass. Note the two borderless
TaskEditor fields are auto-focused the instant the dialog opens, so before this
fix a keyboard user landed in a text field they could not see themselves in.

### Dialogs: focus containment, Escape, and restore (SC 2.4.3 / 2.1.2)

Three overlays in this app are hand-rolled rather than Radix, so they get none of
the dialog keyboard contract for free. All three declared
`role="dialog" aria-modal="true"` and **none of them held focus**: Tab walked out
of the overlay and into the page behind it.

| Overlay | Focus moved in | Tab contained | Escape closes | Focus restored to trigger |
|---|---|---|---|---|
| Quick-capture sheet (`components/task/QuickCaptureSheet.tsx`) | was no | **was no** (20 presses escaped) | was yes | **was no** — focus landed on `<body>` |
| Sign-out confirmation (`pages/profile/ProfilePage.tsx`) | was no | **was no** (15 presses escaped) | **was no** | **was no** |
| Command palette (`components/chrome/CommandPalette.tsx`) | cmdk's own `autoFocus` | **was no** | **was no** | **was no** |

All three are now fixed by one shared helper,
`components/shared/useModalFocus.ts`, which moves focus in on open, contains Tab
and Shift+Tab with a `document`-level capture listener (so a consumer cannot
swallow the Tab that keeps focus contained), closes on Escape, and restores focus
on close. The sign-out confirmation also gained `role="dialog"`,
`aria-modal="true"` and `aria-labelledby`; it previously had none of them, which is
why no audit could see it.

One subtlety worth recording, because the first implementation got it wrong and
produced the exact bug it was written to remove: **the element that opened the
dialog cannot be read inside the effect.** React applies `autoFocus` during the
commit, so by effect time the sheet's own text field is already
`document.activeElement`, and "restore focus" dutifully focuses a node that is
being unmounted — leaving focus on `<body>`. The opener is therefore captured
during render, which is the only moment `document.activeElement` still names the
trigger.

### Accessible names (SC 4.1.2) — every button and link, nine routes

| Route | Buttons/links swept | Without an accessible name |
|---|---|---|
| `/today` | 38 | 0 |
| `/settings` | 37 | 0 |
| `/profile` | 23 | 0 |
| `/focus` | 22 | 0 |
| `/calendar` | 52 | 0 |
| `/review` | 30 | 0 |
| `/memory` | 25 | 0 |
| `/inbox` | 25 | 0 |
| `/onboarding` | 17 | 0 |

The sweep follows the accname order that actually decides a name
(`aria-labelledby` → `aria-label` → native/`<label for>` → text content →
`title`), descends past `aria-hidden` subtrees, and — deliberately — **does not**
filter on opacity, because an icon-only control hidden at `opacity-0` is exactly
the case worth catching.

**The detector is validated before it is trusted.** Each test injects a
deliberately unnamed icon `<button>` and icon `<a>` into the live page and asserts
the sweep flags both. Without that step a broken name computation would report
"0 nameless" and the whole block would be a rubber stamp.

It earned its keep immediately: the first version only consulted `el.labels` on
`input`/`select`/`textarea`, so it reported `/settings`' `settings-row-toggle` as
nameless. That was a **false positive** — `<button role="switch" id="x">` next to
`<label for="x">` is named by that label, and axe agreed there was no violation. A
detector that cries wolf is a defect in the detector, so it was fixed.

### The one keyboard finding left, and why

`/settings` → the IANA timezone field, `data-testid="input-timezone"`, measured
`outline-width: 1px`, `outline-style: none`, `box-shadow: none` while focused.
`SettingsPage.tsx:430` ends its class list with `outline-none`, which is one of
the three opt-outs in the `input:focus-visible` rule.

**It was not fixed.** `pages/settings/SettingsPage.tsx` is explicitly excluded
from this work's ownership. The one-line fix is to delete `outline-none` from that
class list, after which the existing global `input:focus-visible` rule applies a
2px `--primary` ring at 2px offset — exactly what the four sibling inputs in
`MessagingIntegrationsView.tsx` now get. The test is left failing on purpose.

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
- **Screen-reader announcement.** Nothing here drives VoiceOver, NVDA or
  `aria-live` speech. The `role="status"` regions are asserted to *exist* in
  `focus.spec.ts`, not to be *announced*, and that only a real AT run can prove.
- **Focus-ring CONTRAST.** `keyboard.spec.ts` asserts a focus indicator is
  painted, not that it is legible. Measured and reported here rather than gated,
  for the same reason card outlines are printed rather than asserted:
  `outline: 2px solid hsl(var(--primary))` in `index.css` measures **10.1:1** on
  the dark canvas but only **1.9:1** on the light one (`#FFA800` on `#F5F5F7`),
  because `--primary` is the orange *fill* and light mode's text-safe orange is
  `--primary-text` (`#A64B00`, 5.0:1). SC 2.4.7 / 1.4.11 want 3:1. `index.css` is
  a token-layer file this work does not own and AGENTS.md §5 forbids hand-editing
  it, so this is reported, not fixed. The one-line fix is
  `hsl(var(--primary))` → `hsl(var(--primary-text))` in the four `:focus-visible`
  rules at `index.css:95-110`.
- **Keyboard operability on the remaining hand-rolled dialogs.** Three overlays
  were found, fixed and gated. Four more declare `aria-modal="true"` and were
  **not** touched, because they are outside the brief and each is covered by an
  existing spec: `components/rituals/RitualDialog.tsx:126`,
  `components/task/TaskEditor.tsx:163`, `pages/calendar/CalendarPage.tsx:684`,
  and `components/agent/ActionPreview.tsx` (the action-preview overlay). They
  should be assumed to have the same three defects until `useModalFocus` is
  applied to them — that is an assumption, not a measurement.
- **Focus-ring contrast on hover/focus states of tinted chips** -- e.g.
  `MessagingIntegrationsView`'s `hover:bg-success/20`. axe cannot reach a hover
  state, so the resting state is gated and the hover tint is not.

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
| `a11y-audit.spec.ts` | axe-core WCAG 2.0/2.1/2.2 AA over all 10 routes + all 3 onboarding steps, both themes; asserts the tag set resolved to real rules. |
| `keyboard.spec.ts` | Tab order and visible focus ring on `/today` + `/settings`; dialog focus containment / Escape / restore on three overlays; accessible names for every button and link on nine routes. |
