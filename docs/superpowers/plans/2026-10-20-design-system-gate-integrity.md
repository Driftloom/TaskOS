# Design-System Gate Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the design-system gates able to fail, then clear the backlog they surface — so every future design-system fix is verifiable instead of asserted.

**Architecture:** Two lint rules in `scripts/lint-tokens.cjs` currently match nothing: `no-raw-rgb-in-component` uses a word boundary that cannot match inside a Tailwind arbitrary value, and `no-undersized-tap-target` requires the `<button` tag and its size class on the same physical line, which never happens in multi-line JSX. The fix is three-part: give the script a `--self-test` mode that proves every rule fires on a known-bad sample (and does not fire on a known-good one), repair the two broken rules — one of which needs file-level context the current per-line rule engine cannot provide — and then clear the 45 violations they surface. Ordering is load-bearing: the lint-rule repair lands first, because until the rules can fire, every other task in this plan is unverifiable.

**Tech Stack:** Node.js (CommonJS scripts), Tailwind v4, React 19, Vitest, Playwright, three.js (via the landing 3D canvases), WebGL.

**Spec:** `docs/superpowers/specs/2026-10-20-frontend-truthfulness-and-design-integrity-design.md`

## Global Constraints

- **pnpm only.** Root `preinstall` blocks npm/yarn.
- **Never edit `tokens/tokens.json` by hand to fix a component.** The file is the source of truth and `pnpm run tokens:build` regenerates `artifacts/cadence/src/styles/tokens.css`. If a new token is needed, add it to `tokens/tokens.json`, regenerate, and commit both.
- **Tailwind v4 `@utility` naming gotcha.** `min-h-*`, `max-w-*`, `w-*`, `h-*` resolve from `--spacing` **only**. Custom token namespaces (`--component-dimension-*`, `--size-*`) emit **zero CSS** when written as arbitrary Tailwind classes like `w-auth-card-w` or `min-h-size-control-md`. Consume custom dimensions through the explicit `@utility` classes in `artifacts/cadence/src/index.css` (`calendar-cell`, `auth-card-w`, `task-editor-max-w`, `timezone-menu-min-w`, `control-md-h`, `tap-target-h`, `tap-target-expand`, …) and use the **exact utility name** in markup.
- **Token class names, not raw values.** Raw font sizes (`text-xs`, `text-sm`) and durations (`duration-200`) fail `pnpm run lint:tokens`. Use `text-caption`, `text-callout`, `text-macro`, `text-display1..4`, `duration-base`.
- **No new hex literals in component files.** Use the semantic tokens. `shadow-e3` already exists (`--shadow-e3`, used at `artifacts/cadence/src/index.css:392`).
- **44px is the floor** (D-29). The existing `tap-target-expand` utility (`artifacts/cadence/src/index.css:262`) keeps a small visual box at a 44px hit area — use it rather than growing dense icon buttons.
- **Docs move with the change** (`AGENTS.md` §5).
- **Text encoding.** Use the Write/Edit tools, never `Set-Content`/`Out-File`. `node scripts/scan-mojibake.cjs` is the only arbiter.
- **Every task ends with `pnpm run verify:fast` green** and `git status --porcelain` empty.

## Review Focus

These are the failure modes the spec implies that no existing test exercises. Each is pinned to a task below.

1. **A rule that silently stops matching.** If a future refactor changes how `lint-tokens.cjs` strips comments or splits lines, a rule can go vacuous again and the ladder will keep reporting green. The `--self-test` must assert that each rule *fires* on a known-bad sample — a rule that matches nothing is a failure, not a pass. → Task 1
2. **A rule that over-reports.** This repo has already hit that twice (documented at `lint-tokens.cjs:143-147` and `:422-438`): a rule that flagged 1085 and 56 false offenses respectively. Every rule change must also assert that it does **not** fire on a known-good sample. → Task 1
3. **Enforcing the 44px floor must not break dense layouts.** The design system has a density system (`DensityProvider`, `density-control` utility) where a 44px floor could silently change density or row heights. → Task 2
4. **A modal without a focus trap lets a keyboard user edit the page behind it.** Four hand-rolled overlays currently do this. Closing one of them must not silently reopen another. → Task 5
5. **Pausing an animation loop must not break the canvas.** A paused rAF loop that never resumes (e.g. after the tab becomes visible again) leaves a permanently frozen landing page. → Task 7

---

### Task 1: The lint script proves its own rules fire

**Files:**
- Modify: `scripts/lint-tokens.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `node scripts/lint-tokens.cjs --self-test` — exits 0 only if every rule fires on its known-bad sample and does not fire on its known-good sample; prints a per-rule table
  - The rule interface gains an optional `testFile?: (code: string, rel: string) => Array<{ line: number; excerpt: string }>` for rules that need whole-file context (used by Task 2)

- [ ] **Step 1: Add the self-test harness**

In `scripts/lint-tokens.cjs`, add near the top (after `RULES` is defined):

```js
/**
 * Known-bad / known-good samples for every rule.
 *
 * A lint rule that matches nothing is worse than no rule: it converts "not
 * enforced" into "verified" and the ladder reports green on a defect. This
 * file has already shipped two vacuous rules (no-raw-rgb-in-component's word
 * boundary, no-undersized-tap-target's same-line requirement), and two rules
 * that over-reported (1085 and 56 false offenses). Each rule therefore needs
 * a sample it MUST catch and a sample it MUST NOT catch.
 *
 * BAD  - must be reported by the rule.
 * GOOD - must NOT be reported by the rule (guards against over-reporting).
 */
const SELF_TEST = [ /* filled in Step 2 */ ];
```

Add a `--self-test` branch to `process.argv` handling that:

1. Iterates `SELF_TEST`.
2. For each entry, calls the rule's `test` (and `testFile`, where the entry defines one) against `BAD` and `GOOD`.
3. Records a pass/fail per rule.
4. Prints a table: `rule | fires on BAD | silent on GOOD | verdict`.
5. `process.exit(1)` if any rule fails either assertion, with a message naming the rule and the sample.

The self-test must run **without** scanning the source tree — it validates the rules, not the code.

- [ ] **Step 2: Write the samples for every existing rule**

Add one `SELF_TEST` entry per rule in `RULES`. Use the real violations found in the audit as the `BAD` samples — they are proven to exist in the tree:

- `no-hex-in-component`: BAD `className="text-[#ff0000]"` · GOOD `className="text-destructive"` and GOOD `[&_.recharts-grid_line[stroke='#ccc']]:stroke-border` (the documented attribute-selector exemption)
- `no-raw-rgb-in-component`: BAD `shadow-[0_24px_50px_-12px_rgba(0,0,0,0.7)]` · GOOD `shadow-e3`
- `no-arbitrary-color-value`: BAD `bg-[#123456]` · GOOD `bg-primary`
- `no-off-system-tailwind-palette`: BAD `text-gray-500` · GOOD `text-muted-foreground`
- `no-sub-12px-text`: BAD `text-[10px]` · GOOD `text-caption`
- `no-nonadditive-safe-area-with-padding`: BAD `className="py-3.5 pb-safe"` · GOOD `className="pb-safe-content"` and GOOD `className="pt-safe pt-4"` is **BAD** (padding + safe on the same axis)
- `no-arbitrary-font-size`: BAD `text-[13px]` · GOOD `text-body`
- `no-unwrapped-css-var`: BAD `bg-[--brand]` · GOOD `bg-brand`
- `no-arbitrary-spacing-or-radius`: BAD `w-[212px]` · GOOD `w-[2px]` (the hairline exemption) and GOOD `w-[calc(var(--x))]`
- Every other rule in `RULES`: a BAD sample drawn from the rule's own `why` text and a GOOD sample that is normal token usage.

- [ ] **Step 3: Run the self-test — it must fail**

Run: `node scripts/lint-tokens.cjs --self-test`
Expected: **FAIL** on `no-raw-rgb-in-component` — the BAD sample `shadow-[0_24px_50px_-12px_rgba(0,0,0,0.7)]` does not match `/\brgba?\(\s*\d/` because the preceding `_` is a word character, so `\b` cannot match there.

Also expect `no-undersized-tap-target` to FAIL: its BAD sample (a `<button>` and a `size-6` on the same line) — decide the intended behaviour in Task 2 and make this task's sample reflect the **current** (broken) requirement so the failure is visible. Adjust this specific entry in Task 2 when the rule is repaired.

- [ ] **Step 4: Fix `no-raw-rgb-in-component`**

In `scripts/lint-tokens.cjs` line ~69, change:

```js
test: (line) => /\brgba?\(\s*\d/.test(line),
```

to:

```js
// No word boundary: Tailwind arbitrary values write `shadow-[..._rgba(0,0,0,0.7)]`,
// and the preceding `_` is a word character, so `\b` can never match there. The
// boundary made this rule vacuous -- it matched 0 of the 4 live violations.
test: (line) => /rgba?\(\s*\d/.test(line),
```

- [ ] **Step 5: Run the self-test — it must now fail only on the tap-target rule**

Run: `node scripts/lint-tokens.cjs --self-test`
Expected: FAIL on `no-undersized-tap-target` only.

- [ ] **Step 6: Run the live scan to see what the repaired rule surfaces**

Run: `node scripts/lint-tokens.cjs`
Expected: **FAIL** with 4 new `no-raw-rgb-in-component` errors:
- `artifacts/cadence/src/pages/landing/components/TiltCard3D.tsx:137` — `hover:shadow-[0_24px_50px_-12px_rgba(0,0,0,0.7)]`
- `artifacts/cadence/src/pages/profile/ProfilePage.tsx:225` — `shadow-[0_8px_24px_rgba(255,159,10,0.35)]`
- `artifacts/cadence/src/components/task/TaskRow.tsx:205` — `shadow-[0_0_8px_rgba(48,209,88,0.3)]`
- `artifacts/cadence/src/pages/settings/MessagingIntegrationsView.tsx:1073` — `shadow-[0_0_30px_rgba(52,199,89,0.4)]`

This is expected — Task 2 clears them. **Do not commit a red ladder**; continue to Step 7.

- [ ] **Step 7: Clear the 4 rgba violations now, so the ladder is green at the end of this task**

Replace each arbitrary shadow with a token:

| File | Replacement |
|---|---|
| `TiltCard3D.tsx:137` | `hover:shadow-e3` (the `--shadow-e3` token already exists) |
| `ProfilePage.tsx:225` | `shadow-e3` — or, if the intent is an amber glow, add a `--glow-accent` token to `tokens/tokens.json`, run `pnpm run tokens:build`, and use `shadow-glow-accent` |
| `TaskRow.tsx:205` | `shadow-e3` |
| `MessagingIntegrationsView.tsx:1073` | `shadow-e3` — note this one is a **green** glow hardcoding the *light* theme's success colour (`#34C759`); the dark token is `#30D158`. If a glow is genuinely wanted, add a semantic `--glow-success` token that flips per theme rather than hardcoding either value |

Prefer the token route over `shadow-e3` where the visual intent is a coloured glow — `shadow-e3` is a neutral elevation shadow. Either way, **no `rgba()` may remain in component source.**

- [ ] **Step 8: Wire the self-test into the gate**

In the root `package.json`, change:

```json
"lint:tokens": "node scripts/lint-tokens.cjs",
```

to:

```json
"lint:tokens": "node scripts/lint-tokens.cjs && node scripts/lint-tokens.cjs --self-test",
```

The self-test runs after the live scan, so a broken rule is reported after the code violations it would have caught.

- [ ] **Step 9: Verify green**

Run: `node scripts/lint-tokens.cjs && node scripts/lint-tokens.cjs --self-test`
Expected: live scan PASS (0 errors, 0 warns, 0 baselined); self-test PASS on every rule except `no-undersized-tap-target`, which Task 2 repairs.

Run: `pnpm run lint:tokens`
Expected: PASS — **except** the tap-target self-test, which is still failing. Because that would leave the ladder red, **complete Task 2 in the same commit** before committing Task 1. If you must commit separately, gate the tap-target self-test entry behind a `pending: true` flag that the self-test reports as SKIPPED — and remove the flag in Task 2. Prefer the single commit.

- [ ] **Step 10: Commit (with Task 2 if it was not completed separately)**

```bash
git add scripts/lint-tokens.cjs package.json artifacts/cadence/src/pages/landing/components/TiltCard3D.tsx artifacts/cadence/src/pages/profile/ProfilePage.tsx artifacts/cadence/src/components/task/TaskRow.tsx artifacts/cadence/src/pages/settings/MessagingIntegrationsView.tsx tokens/tokens.json artifacts/cadence/src/styles/tokens.css
git commit --no-gpg-sign -m "fix(tokens): make the rgb rule able to fire and prove every lint rule matches its sample"
```

---

### Task 2: The 44px floor is enforced, and the backlog is cleared

**Files:**
- Modify: `scripts/lint-tokens.cjs`
- Modify: `package.json` (no change needed beyond Task 1)
- Modify: the component files listed in Step 5
- Modify: `docs/audit/2026-09-30-design-system-audit/token-lint-baseline.json` (must remain `{"entries": []}` — regenerate only if the lint insists)

**Interfaces:**
- Consumes: the `testFile` rule hook added in Task 1
- Produces: `no-undersized-tap-target` becomes `severity: 'error'` and is enforced against whole `<button>` elements

- [ ] **Step 1: Give the rule engine file-level context**

In `scripts/lint-tokens.cjs`:

- Change the `RULES` array's element type to allow an optional `testFile`:

```js
/**
 * @typedef {Object} Rule
 * @property {string} id
 * @property {'error'|'warn'} severity
 * @property {string} spec
 * @property {string} why
 * @property {(line: string) => boolean} [test]      per-line matcher
 * @property {(code: string, rel: string) => Array<{line: number, excerpt: string}>} [testFile]
 *        whole-file matcher, for rules that cannot work on one line
 */
```

- In the file loop (~line 391-418), after the existing per-line loop, add a second pass:

```js
const fileText = fs.readFileSync(f, 'utf8');
for (const rule of RULES) {
  if (!rule.testFile) continue;
  for (const hit of rule.testFile(stripAllComments(fileText), rel)) {
    offenses.push({
      rule: rule.id, severity: rule.severity, spec: rule.spec,
      file: rel, line: hit.line, why: rule.why, excerpt: hit.excerpt,
    });
  }
}
```

`stripAllComments` must reuse the existing comment-stripping approach (`makeCommentStripper`) but across the whole file at once — a `<button>` inside a commented-out block must not be reported. Read `makeCommentStripper` before writing this and reuse it rather than adding a second stripper.

- [ ] **Step 2: Replace `no-undersized-tap-target`**

Replace the rule at ~line 132-137 with a file-level implementation:

```js
{
  id: 'no-undersized-tap-target',
  severity: 'error',
  spec: 'P8.1',
  why: '44x44px minimum tap target; add .tap-target-expand if the visual box must stay small',
  // A per-line matcher cannot work here: in this codebase the <button> tag and
  // its className are always on separate lines, so requiring them on one line
  // matched 0 of the 41 real violations. This rule therefore matches whole
  // elements.
  testFile: (code) => findUndersizedButtons(code),
},
```

`findUndersizedButtons(code)` must:

1. Find every `<button` opening tag (and `<a ` / `<Link ` with an `href`) with its source offset.
2. Extract the element's `className` (string literal or template literal).
3. Map declared box classes to pixels — Tailwind spacing: `size-N` → N×4 both axes; `h-N`/`min-h-N` → height; `w-N`/`min-w-N` → width. Values below `11` (44px) are the offenders.
4. **Exempt** any element whose class list contains `tap-target-expand`, `tap-target-44`, or `tap-target-h` (these utilities already guarantee a 44px hit area).
5. **Exempt** `sr-only`, `hidden`, `absolute` and `aria-hidden="true"` elements.
6. Return `{ line, excerpt }` for each offender, where `line` is the 1-based line of the `<button` tag.

Do not exempt an element merely because it has no explicit size — a button with no size class is sized by its content and padding and is not what this rule governs.

- [ ] **Step 3: Write the self-test samples for the new rule**

In the `SELF_TEST` array, replace the tap-target entry with:

- BAD: a multi-line `<button className="size-6">` with no tap-target helper → must be reported, with the correct line number.
- GOOD: a multi-line `<button className="size-6 tap-target-expand">` → must **not** be reported.
- GOOD: a multi-line `<button className="min-h-11">` (44px) → must **not** be reported.

The BAD sample must span multiple lines — that is the exact case the old rule missed.

- [ ] **Step 4: Run the self-test — it must fail**

Run: `node scripts/lint-tokens.cjs --self-test`
Expected: FAIL — `no-undersized-tap-target` has no `testFile` implementation yet.

- [ ] **Step 5: Implement `findUndersizedButtons` and clear the backlog**

Implement the helper described in Step 2, then run:

Run: `node scripts/lint-tokens.cjs`
Expected: **FAIL** with the newly-surfaced `no-undersized-tap-target` errors. The audit's partial list (re-derive the full list from this output — the audit found 41 across all non-test `.tsx` files):

- `artifacts/cadence/src/components/settings/TimezoneSelect.tsx:310` — `size-6` (24px)
- `artifacts/cadence/src/pages/projects/ProjectsPage.tsx:320,330,450` — `size-7` (28px)
- `artifacts/cadence/src/components/task/TaskAttachments.tsx:364,371` — `h-7` (28px)
- `artifacts/cadence/src/components/task/TaskEditor.tsx:207` — `size-7`
- `artifacts/cadence/src/components/rituals/RitualDialog.tsx:199` — `size-7`
- `artifacts/cadence/src/pages/inbox/InboxPage.tsx:334,343,353,363` — `size-8` (32px)
- `artifacts/cadence/src/components/task/QuickCaptureSheet.tsx:769,801,813,822,953,991` — `min-h-9` (36px)
- `artifacts/cadence/src/components/task/RescheduleProposals.tsx:171` — `min-h-9` (36px)

For **each** offender, choose one of two fixes and apply it:

- **Grow the box** — `size-6` → `size-11`, `min-h-9` → `min-h-11` — where the surrounding layout has room and the icon-only button will not look oversized.
- **Keep the visual box, grow the hit area** — add the existing `tap-target-expand` utility to the class list. This is the right answer for dense icon buttons, and it is what the rule's own `why` text recommends.

**Density constraint:** `DensityProvider` and the `density-control` utility exist so dense mode can compress rows. Do not defeat density by making every row 44px tall — use `tap-target-expand` for icon buttons inside dense rows so the row height is unchanged and only the hit area grows.

**Do not change the rule to make the backlog disappear.** The rule states the floor; the code must meet it.

- [ ] **Step 6: Run the self-test — it must pass**

Run: `node scripts/lint-tokens.cjs --self-test`
Expected: PASS on every rule, including `no-undersized-tap-target`.

- [ ] **Step 7: Verify the ladder is green**

Run: `pnpm run lint:tokens`
Expected: PASS — 0 errors, 0 warns, **0 legacy baselined**.

Run: `node scripts/lint-tokens.cjs --no-baseline`
Expected: PASS — the baseline must not be masking anything. The baseline file must still contain an empty `entries` array.

- [ ] **Step 8: Verify the density system still works**

Run: `pnpm run verify:e2e -- --grep "density"`
Expected: PASS — the density specs must not regress from the tap-target changes.

- [ ] **Step 9: Commit**

```bash
git add scripts/lint-tokens.cjs artifacts/cadence/src/ tokens/tokens.json artifacts/cadence/src/styles/tokens.css
git commit --no-gpg-sign -m "fix(tokens): enforce the 44px tap-target floor against whole elements"
```

---

### Task 3: The mobile drawer gets its bottom safe-area inset back

**Files:**
- Modify: `artifacts/cadence/src/components/chrome/AppShell.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: the drawer panel applies `paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))'`

- [ ] **Step 1: Write the failing test**

In `artifacts/cadence/tests/e2e/pages.spec.ts` (the "mobile chrome is drawer-based" spec), add an assertion that the drawer panel's computed `padding-bottom` is greater than 0 at a 390px viewport, and — more meaningfully — that the **last** quick-settings row (`button-palette-drawer`) is fully inside the viewport's safe area.

Read the existing drawer spec first and extend it rather than creating a parallel one.

Run: `pnpm run verify:e2e -- --grep "drawer"`
Expected: FAIL.

- [ ] **Step 2: Apply the inset**

In `artifacts/cadence/src/components/chrome/AppShell.tsx` lines ~804-811, change the drawer's inline style from:

```tsx
style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
```

to:

```tsx
style={{
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
}}
```

The focus chip at line ~748 already uses `bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))'` — match that spacing so the chip and the drawer agree.

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm run verify:e2e -- --grep "drawer"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/cadence/src/components/chrome/AppShell.tsx artifacts/cadence/tests/e2e/pages.spec.ts
git commit --no-gpg-sign -m "fix(mobile): restore the drawer's bottom safe-area inset"
```

---

### Task 4: Card actions are reachable on touch, and the close button has a name

**Files:**
- Modify: `artifacts/cadence/src/pages/projects/ProjectsPage.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: the action cluster is visible on coarse pointers and on keyboard focus; both buttons carry `aria-label`s

- [ ] **Step 1: Write the failing test**

In `artifacts/cadence/src/pages/projects/ProjectsPage.test.tsx`, assert:

- the edit button has an accessible name (query by role/name, not by testid),
- the delete button has an accessible name,
- the action cluster's computed `opacity` is `1` when the container is matched with `(hover: none)` — this is the coarse-pointer case.

The third assertion is the important one. It is hard to assert in jsdom (which has no pointer media queries), so **also** add a Playwright assertion in `artifacts/cadence/tests/e2e/pages.spec.ts` under a touch project (or emulate `hasTouch: true`) asserting the buttons are visible at a 390px viewport. Put the Playwright assertion in the new `/projects` coverage spec that Plan 3 Task 4 creates — until then, add it to `pages.spec.ts`.

Run: `pnpm --filter @workspace/cadence test -- src/pages/projects/ProjectsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Fix the visibility rule**

In `artifacts/cadence/src/pages/projects/ProjectsPage.tsx` line ~314, change:

```tsx
className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
```

to:

```tsx
className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity"
```

- [ ] **Step 3: Name the buttons and grow their hit area**

Lines ~315-335:

- Add `aria-label="Edit project"` and `aria-label="Delete project"` to the two buttons (the codebase uses this convention everywhere else).
- Apply the 44px floor from Plan 2 Task 2 — `size-7` (28px) fails it. Either `size-11` or `size-7 tap-target-expand`.

- [ ] **Step 4: Fix the modal close button**

Lines ~446-453: the close button has no accessible name and a 28px target.

- Add `aria-label="Close"` and `type="button"`.
- Apply the 44px floor (`size-11` or `size-7 tap-target-expand`).

Every other close button in the codebase already has an `aria-label` (`MemoryPage.tsx:539`, `MessagingIntegrationsView.tsx:1050`, `CalendarPage.tsx:764`) — match them.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/pages/projects/ProjectsPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/cadence/src/pages/projects/ProjectsPage.tsx artifacts/cadence/src/pages/projects/ProjectsPage.test.tsx artifacts/cadence/tests/e2e/pages.spec.ts
git commit --no-gpg-sign -m "fix(projects): keep card actions reachable on touch and name the close button"
```

---

### Task 5: Every label is associated with its control

**Files:**
- Modify: `artifacts/cadence/src/pages/memory/MemoryPage.tsx`
- Modify: `artifacts/cadence/src/pages/onboarding/OnboardingPage.tsx`
- Modify: `artifacts/cadence/src/pages/projects/ProjectsPage.tsx`
- Modify: `artifacts/cadence/src/pages/settings/MessagingIntegrationsView.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: 9 `label`/`input` pairs joined by `htmlFor`/`id`

- [ ] **Step 1: Write the failing test**

In `artifacts/cadence/src/pages/memory/MemoryPage.test.tsx` (created by Plan 1 Task 9), `artifacts/cadence/src/pages/projects/ProjectsPage.test.tsx`, and a new `artifacts/cadence/src/pages/settings/SettingsPage.test.tsx` (created by Plan 1 Task 11), assert that each labelled input is reachable by its visible label text — i.e. `getByLabelText('Fact Title')` resolves to an element.

Run: `pnpm --filter @workspace/cadence test -- src/pages/memory/ src/pages/projects/ src/pages/settings/`
Expected: FAIL — the labels are currently orphaned.

- [ ] **Step 2: Join the pairs**

Give each input a stable `id` and point its label's `htmlFor` at it. The 9 sites:

| File | Lines | Label text |
|---|---|---|
| `MemoryPage.tsx` | 548, 563, 576, 595 | "Fact Title" and three others (read the file for the exact texts) |
| `OnboardingPage.tsx` | 400 | (read the file) |
| `ProjectsPage.tsx` | 458, 472 | "Project Name", and one more |
| `MessagingIntegrationsView.tsx` | 664, 701 | (read the file) |

Use a per-component id scheme that cannot collide when two instances render (e.g. `useId()` from React, or a `${componentName}-${field}` literal). `useId()` is preferred where the component can mount more than once — `MemoryFactCard` and the Onboarding wizard both can.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/cadence test -- src/pages/memory/ src/pages/projects/ src/pages/settings/`
Expected: PASS.

- [ ] **Step 4: Verify with the axe suite**

Run: `pnpm run verify:e2e -- --grep "a11y"`
Expected: PASS, and no new `label` violations in the axe output.

- [ ] **Step 5: Commit**

```bash
git add artifacts/cadence/src/pages/memory/MemoryPage.tsx artifacts/cadence/src/pages/onboarding/OnboardingPage.tsx artifacts/cadence/src/pages/projects/ProjectsPage.tsx artifacts/cadence/src/pages/settings/MessagingIntegrationsView.tsx artifacts/cadence/src/pages/
git commit --no-gpg-sign -m "fix(a11y): associate every label with its form control"
```

---

### Task 6: Every hand-rolled modal traps focus and declares itself

**Files:**
- Modify: `artifacts/cadence/src/pages/memory/MemoryPage.tsx`
- Modify: `artifacts/cadence/src/pages/projects/ProjectsPage.tsx`
- Modify: `artifacts/cadence/src/pages/settings/MessagingIntegrationsView.tsx`
- Modify: `artifacts/cadence/src/pages/calendar/CalendarPage.tsx`

**Interfaces:**
- Consumes: `useModalFocus(containerRef: RefObject<HTMLElement | null>, open: boolean, options?: { onEscape?: () => void })` from `artifacts/cadence/src/components/shared/useModalFocus.ts` — already used by `CommandPalette.tsx:83`, `QuickCaptureSheet.tsx:1108`, `ProfilePage.tsx:130`
- Produces: 4 overlays gain `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at their existing heading, and a focus trap

- [ ] **Step 1: Write the failing test**

For each of the 4 overlays, assert in its page's test file:

- the overlay container has `role="dialog"` and `aria-modal="true"`,
- `aria-labelledby` resolves to an element that exists in the document,
- pressing `Tab` from the last focusable element wraps to the first (focus does not escape to the page behind),
- pressing `Escape` closes it.

Use `userEvent.tab()` to advance focus and assert `document.activeElement` never leaves the overlay.

Run: `pnpm --filter @workspace/cadence test -- src/pages/memory/ src/pages/projects/ src/pages/settings/ src/pages/calendar/`
Expected: FAIL.

- [ ] **Step 2: Apply the shared hook to all four**

For each overlay:

1. Add a `ref` to the overlay container.
2. Call `useModalFocus(ref, open, { onEscape: closeHandler })`.
3. Add `role="dialog"` and `aria-modal="true"` to the container.
4. Give the existing heading an `id` and point `aria-labelledby` at it.

Sites:

| File | Line | Overlay |
|---|---|---|
| `MemoryPage.tsx` | ~526 | Manual Add Fact |
| `ProjectsPage.tsx` | ~431 | Create/Edit Project |
| `MessagingIntegrationsView.tsx` | ~1031 | Telegram QR pairing |
| `CalendarPage.tsx` | ~666 | Schedule-hour picker |

`CalendarPage` is the sharpest case: its **sibling** modal at lines ~733-746 already declares `role="dialog" aria-modal="true" aria-labelledby="block-picker-heading"`, and the code comment at ~740-742 admits the gap. Match the sibling's pattern exactly.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/cadence test -- src/pages/memory/ src/pages/projects/ src/pages/settings/ src/pages/calendar/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/cadence/src/pages/memory/MemoryPage.tsx artifacts/cadence/src/pages/projects/ProjectsPage.tsx artifacts/cadence/src/pages/settings/MessagingIntegrationsView.tsx artifacts/cadence/src/pages/calendar/CalendarPage.tsx artifacts/cadence/src/pages/
git commit --no-gpg-sign -m "fix(a11y): trap focus in the four hand-rolled modal overlays"
```

---

### Task 7: There is exactly one main landmark

**Files:**
- Modify: `artifacts/cadence/src/pages/not-found.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `not-found.tsx` renders a `<section>`; `AppShell.tsx` remains the sole `<main id="main-content">`

- [ ] **Step 1: Write the failing test**

In `artifacts/cadence/src/App.test.tsx` (or a new `artifacts/cadence/src/pages/not-found.test.tsx`), render the app at an unknown route and assert `document.querySelectorAll('main').length === 1` and `document.querySelectorAll('#main-content').length === 1`.

Run: `pnpm --filter @workspace/cadence test -- src/App.test.tsx`
Expected: FAIL — two `<main>` elements and two `id="main-content"`.

- [ ] **Step 2: Replace the nested landmark**

In `artifacts/cadence/src/pages/not-found.tsx` lines ~4-9, change the wrapper from:

```tsx
<main id="main-content" role="main" className="min-h-[100dvh] w-full flex items-center justify-center …">
```

to a `<section>` with the same layout classes and no `id`/`role`:

```tsx
<section className="min-h-[100dvh] w-full flex items-center justify-center …">
```

Close the matching tag.

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/App.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/cadence/src/pages/not-found.tsx artifacts/cadence/src/App.test.tsx
git commit --no-gpg-sign -m "fix(a11y): remove the duplicate main landmark on the not-found route"
```

---

### Task 8: The 3D canvases stop burning frames when nobody is looking

**Files:**
- Create: `artifacts/cadence/src/hooks/useAnimationGate.ts`
- Modify: `artifacts/cadence/src/pages/landing/components/AmbientCosmicStream3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/ActivityRings3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/ChronoCanvas3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/TelegramPlane3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/TokenLexer3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/TimeGrid3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/DecisionGyro3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/TiltCard3D.tsx`
- Modify: `artifacts/cadence/src/hooks/useReducedMotion.ts`

**Interfaces:**
- Produces:

```ts
// artifacts/cadence/src/hooks/useAnimationGate.ts
export interface AnimationGate {
  /** True when frames should be rendered. False when the tab is hidden or the element is off-screen. */
  active: boolean;
}
export function useAnimationGate(ref: RefObject<Element | null>): AnimationGate;
```

- [ ] **Step 1: Write the failing test**

Create `artifacts/cadence/src/hooks/useAnimationGate.test.ts`. Assert:

- with `document.hidden = true` (dispatch a `visibilitychange` event), `active` becomes `false`;
- when the element is not intersecting (mock `IntersectionObserver` to report `isIntersecting: false`), `active` is `false`;
- when both are healthy, `active` is `true`.

Use `vi.spyOn(document, 'visibilityState', 'get')` to control `document.hidden`.

Run: `pnpm --filter @workspace/cadence test -- src/hooks/useAnimationGate.test.ts`
Expected: FAIL — the hook does not exist.

- [ ] **Step 2: Implement the hook**

`useAnimationGate` combines:

- a `visibilitychange` listener that reads `document.visibilityState !== 'hidden'`,
- an `IntersectionObserver` on the supplied ref that reads `entry.isIntersecting`.

Return `{ active: visible && intersecting }`. Default `active` to `true` before the first observation so the canvas is not blank on first paint.

- [ ] **Step 3: Gate the render loops**

In each of the 8 canvas components:

- Call `useAnimationGate(containerRef)`.
- In the rAF callback, **skip the `requestAnimationFrame` re-schedule and the `renderer.render()` call** when `active` is false — but keep the loop alive (do not cancel it), so resuming is automatic when the tab becomes visible again. This addresses Review Focus #5: a cancelled loop that never restarts leaves a permanently frozen page.
- Keep the existing `prefersReducedMotion` behaviour, but **render once and stop the loop** when reduced motion is on and the transform updates are skipped. Today the reduce branch skips the transform update but still calls `renderer.render()` every frame.

The 8 components and their loop sites:

| Component | Loop |
|---|---|
| `AmbientCosmicStream3D.tsx` | ~190-225 (800 particles) |
| `ActivityRings3D.tsx` | ~213-239 |
| `ChronoCanvas3D.tsx` | ~585-588 (~1,896 points/frame) |
| `TelegramPlane3D.tsx` | ~173 |
| `TokenLexer3D.tsx` | ~142 |
| `TimeGrid3D.tsx` | ~149 |
| `DecisionGyro3D.tsx` | ~184 |
| `TiltCard3D.tsx` | ~108 (one loop **per card**) |

- [ ] **Step 4: Fix the runtime reduced-motion change**

In `artifacts/cadence/src/pages/landing/components/ChronoCanvas3D.tsx` lines ~68-83, `stateRef.current.autoSpin` is seeded once and never updated, so flipping the in-app "reduce motion" setting leaves the hero spinning at full speed. Reset `autoSpin` when `prefersReducedMotion` changes.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/hooks/useAnimationGate.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the landing page still animates**

Run: `pnpm run verify:e2e -- --grep "landing"`
Expected: PASS. If a spec asserts the canvas is animating, it must still pass — the gate must not freeze a visible canvas.

- [ ] **Step 7: Commit**

```bash
git add artifacts/cadence/src/hooks/ artifacts/cadence/src/pages/landing/components/
git commit --no-gpg-sign -m "perf(landing): pause the 3D render loops when hidden or off-screen"
```

---

### Task 9: The interactive canvases are keyboard-operable

**Files:**
- Modify: `artifacts/cadence/src/pages/landing/components/ActivityRings3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/TelegramPlane3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/TokenLexer3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/ChronoCanvas3D.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: each interactive canvas is reachable with `Tab`, has an accessible name, and responds to `Enter`/`Space` with the same action as a click

- [ ] **Step 1: Write the failing test**

Create `artifacts/cadence/src/pages/landing/LandingPage.test.tsx` (created by Plan 1 Task 12) or extend it. Assert:

- the interactive canvas elements are focusable (`tabIndex === 0`),
- they have an accessible name (`getByRole('button', { name: /activity rings/i })`),
- pressing `Enter` on one triggers its rotation (assert the internal state changed — e.g. the rotation angle is no longer 0).

Run: `pnpm --filter @workspace/cadence test -- src/pages/landing/`
Expected: FAIL.

- [ ] **Step 2: Make them operable**

For each of `ActivityRings3D.tsx:259-265`, `TelegramPlane3D.tsx:217-223`, `TokenLexer3D.tsx:177-183`:

- Add `role="button"` and `tabIndex={0}` to the container.
- Add an `onKeyDown` handler that triggers the same action as the click handler on `Enter` and `Space` (and `preventDefault()` on Space so the page does not scroll).
- Give each a meaningful `aria-label` that does not assert live data — e.g. **"Activity rings illustration — activate to rotate"**.

Note: `role="generic"` (the implicit default) does not support naming, which is why the existing `aria-label` on these elements is not announced. `role="button"` fixes that.

For `ChronoCanvas3D.tsx:630-634` (a `<canvas>` with drag-to-spin and no keyboard equivalent), add `tabIndex={0}`, `role="img"` with an `aria-label`, and arrow-key rotation (Left/Right adjust `targetRotY`).

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/pages/landing/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/cadence/src/pages/landing/components/
git commit --no-gpg-sign -m "fix(a11y): make the interactive 3D surfaces keyboard-operable"
```

---

### Task 10: Dark mode follows the OS, and the `dark:` utilities come alive

**Files:**
- Modify: `artifacts/cadence/src/components/chrome/ThemeProvider.tsx`
- Modify: `artifacts/cadence/src/components/ui/field.tsx`
- Modify: `artifacts/cadence/src/components/ui/input-group.tsx`
- Modify: `artifacts/cadence/src/components/ui/alert.tsx`
- Modify: `artifacts/cadence/src/pages/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `useTheme` from `artifacts/cadence/src/components/chrome/ThemeProvider.tsx`
- Produces: `export type Theme = 'light' | 'dark' | 'system'`; `ThemeProvider` applies both `data-theme` on `<html>` **and** the `.dark` class when the resolved theme is dark, and resolves `'system'` from `window.matchMedia('(prefers-color-scheme: dark)')`

- [ ] **Step 1: Write the failing test**

Create `artifacts/cadence/src/components/chrome/ThemeProvider.test.tsx`. Assert:

- with the theme set to `'system'` and `matchMedia` reporting `prefers-color-scheme: dark`, `<html>` has `data-theme="dark"` **and** `classList.contains('dark')`;
- with the theme set to `'light'`, `<html>` has `data-theme="light"` and does **not** have the `dark` class;
- changing the OS preference while on `'system'` re-resolves the theme.

Run: `pnpm --filter @workspace/cadence test -- src/components/chrome/ThemeProvider.test.tsx`
Expected: FAIL — `'system'` is not a valid `Theme` today.

- [ ] **Step 2: Implement `'system'` and the `.dark` class**

In `artifacts/cadence/src/components/chrome/ThemeProvider.tsx`:

- Extend `export type Theme = 'light' | 'dark'` → `export type Theme = 'light' | 'dark' | 'system'`.
- Add a `resolvedTheme: 'light' | 'dark'` value derived from the preference plus `matchMedia`.
- Apply `document.documentElement.dataset.theme = resolvedTheme`.
- Apply `document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')`.
- Subscribe to the `prefers-color-scheme` media query and re-resolve on change (only when the theme is `'system'`).
- Persist the *preference* (`'system'` included) to `localStorage`, and fall back to `'system'` when nothing is stored — an OS-light user should get light, not OLED dark.

`index.css:6` already declares `@custom-variant dark (&:is(.dark *))`, so applying the `.dark` class activates the five currently-inert `dark:` utilities in `components/ui/`. No change is needed to those files' markup — but **verify** by checking that `field.tsx:119`, `input-group.tsx:14,27,136,152` and `alert.tsx:12` now have effect in a dark-theme render.

- [ ] **Step 3: Expose the option in Settings**

In `artifacts/cadence/src/pages/settings/SettingsPage.tsx`, add a third choice to the theme control: **"System"**, placed before Light and Dark. The control currently offers two options — read the file and match its existing structure.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/cadence test -- src/components/chrome/ThemeProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify both themes still pass contrast**

Run: `pnpm run verify:contrast`
Expected: PASS — the new `'system'` resolution must not produce an unmeasured third theme.

- [ ] **Step 6: Commit**

```bash
git add artifacts/cadence/src/components/chrome/ThemeProvider.tsx artifacts/cadence/src/components/ui/ artifacts/cadence/src/pages/settings/SettingsPage.tsx artifacts/cadence/src/components/chrome/ThemeProvider.test.tsx
git commit --no-gpg-sign -m "feat(theme): follow the OS colour scheme and activate the dark: utilities"
```

---

### Task 11: One accent colour, one ellipsis, one scrim, one icon set

**Files:**
- Modify: `artifacts/cadence/src/pages/activity/ActivityPage.tsx`
- Modify: `artifacts/cadence/src/components/shared/ActivityHistoryDrawer.tsx`
- Modify: `artifacts/cadence/src/pages/today/TodayPage.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/LandingHero.tsx`
- Modify: `artifacts/cadence/src/components/shared/StateViews.tsx`
- Modify: `artifacts/cadence/src/components/ui/dialog.tsx`
- Modify: `artifacts/cadence/src/components/ui/sheet.tsx`
- Modify: `artifacts/cadence/src/components/ui/alert-dialog.tsx`
- Modify: `artifacts/cadence/src/components/task/TaskEditor.tsx`
- Modify: `artifacts/cadence/src/components/task/QuickCaptureSheet.tsx`
- Modify: `artifacts/cadence/src/pages/calendar/CalendarPage.tsx`
- Modify: `artifacts/cadence/src/pages/memory/MemoryPage.tsx`
- Modify: `artifacts/cadence/src/components/rituals/RitualDialog.tsx`
- Modify: `artifacts/cadence/src/components/settings/MessagingIntegrationsView.tsx`
- Modify: `artifacts/cadence/src/components/tour/FirstRunTourModal.tsx`

**Interfaces:**
- Consumes: `text-primary-text` (the token `DESIGN.md:118` requires for streak flames, history icons, and primary actions)
- Produces: consistent accent usage, consistent loading copy, consistent scrim token, one icon set

- [ ] **Step 1: Replace `text-accent` on flame and history iconography**

`DESIGN.md:118` states: *"Never use `text-accent` for streak flames, history icons, or primary actions (audited and disambiguated on `TodayPage`, `ReviewPage`, and `ActivityPage`)."* — but `ActivityPage` was not actually fixed. Replace `text-accent` with `text-primary-text` at:

- `artifacts/cadence/src/pages/activity/ActivityPage.tsx:53,54,74,75,260,261,265`
- `artifacts/cadence/src/components/shared/ActivityHistoryDrawer.tsx:48,51,62,65,157`
- `artifacts/cadence/src/pages/today/TodayPage.tsx:113`
- `artifacts/cadence/src/pages/landing/components/LandingHero.tsx:84`

`InboxPage.tsx:281`, `ReviewPage.tsx:472` and `TaskRow.tsx:248` already use `text-primary-text` — match them.

- [ ] **Step 2: Replace the off-system shadow colour**

`shadow-black/80` on 5 modal surfaces is off-system and off-theme:

- `MemoryPage.tsx:527`, `RitualDialog.tsx:164`, `MessagingIntegrationsView.tsx:1033`, `TaskEditor.tsx:182`, `FirstRunTourModal.tsx:113`

Replace with the `shadow-e3` token (or `shadow-2xl`, which the drawer already uses at `AppShell.tsx:810`).

- [ ] **Step 3: Unify the scrims**

Radix overlays use `bg-black/80` (`components/ui/dialog.tsx:21`, `sheet.tsx:23`, `alert-dialog.tsx:18`); hand-rolled overlays use `bg-background/80` (`CalendarPage.tsx:666`, `MemoryPage.tsx:526`, `TaskEditor.tsx:167`, `QuickCaptureSheet.tsx:1127`, `ProjectsPage.tsx:431`). In light theme the hand-rolled scrim is nearly invisible, so the two families look like different products.

**Decision:** use one scrim for both families — `bg-black/80` — so the hand-rolled overlays match the Radix ones. If the design system has a dedicated scrim token, use it instead; check `tokens/tokens.json` before choosing.

- [ ] **Step 4: Unify the loading ellipsis**

Three variants exist: `TodayPage.tsx:231` uses `'...'`, `ProfilePage.tsx:255` uses `'Exporting...'`, `MemoryPage.tsx:617` uses `'Creating…'`. Pick **the typographic ellipsis `…`** (U+2026) for all of them, and keep the sentence form ("Exporting…", "Creating…").

Note: `ProfilePage.tsx` and `MemoryPage.tsx` are also touched by Plan 1 Tasks 3 and 9. **Merge those changes into this task's commit if they overlap**, or sequence the plans so Plan 1 lands first.

- [ ] **Step 5: Replace the literal `×` with the icon**

`MemoryPage.tsx:543` uses `<span aria-hidden="true">×</span>` where the codebase uses lucide icons. Replace with `<X size={15} />` from `lucide-react`, matching every other close button.

- [ ] **Step 6: Stop using a calendar dimension token for generic lists**

`StateViews.tsx:36` (`SkeletonList`) and `:56` (`EmptyState`) both use the `calendar-cell` utility, which is a **212px calendar grid cell** dimension. A generic skeleton list is not a calendar cell. Either add a dedicated `list-skeleton-min-h` `@utility` to `artifacts/cadence/src/index.css` (following the existing pattern at lines 715-763) or use an existing generic utility. Do not reuse a calendar token.

- [ ] **Step 7: Run the ladder**

Run: `pnpm run verify:fast`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add artifacts/cadence/src/
git commit --no-gpg-sign -m "refactor(ui): unify accent colour, scrim, ellipsis, shadow and icon usage"
```

---

### Task 12: Documentation and the append-only records

**Files:**
- Modify: `DESIGN.md`
- Modify: `README.md`
- Modify: `spec/master-verification-matrix.md`
- Modify: `docs/07-module-registry.md`
- Modify: `docs/governance/g4-manual-verification-runbook.md`
- Modify: `spec/design-system.md`
- Modify: `artifacts/cadence/src/lib/version-info.ts`
- Modify: `AUDIT.md` (append only)
- Modify: `CHANGELOG.md` (append only)

**Interfaces:**
- Consumes: every change made in Tasks 1-11
- Produces: no code changes

- [ ] **Step 1: Fix the stale mobile-navigation documentation**

`DESIGN.md:60-63` still documents the **5-slot bottom dock** and the `.pb-dock-clearance` utility. Both are gone: the dock was replaced by a left drawer (owner decision 2026-10-20) and `.pb-dock-clearance` was replaced by `.pb-safe-content` / `.pb-safe-content-with-chip` (`spec/design-system.md:116` was updated; `DESIGN.md` was not).

Rewrite `DESIGN.md` §"Mobile Dock Standard (§P16) & Viewport Clearance" to describe the drawer, its tap-target rule (48px rows), the focus-trap contract, and the current bottom-clearance utilities. Delete the reference to the deleted utility.

Also check `artifacts/cadence/src/lib/version-info.ts` for a shipped changelog entry that still cites `pb-dock-clearance` (around line 202) and correct it — it is user-visible release text describing a utility that no longer exists.

- [ ] **Step 2: Document the new gate capability**

In `DESIGN.md` (or `spec/design-system.md`), document:

- the `--self-test` mode of `scripts/lint-tokens.cjs` and **why** it exists (a rule that matches nothing is worse than no rule),
- the 44px floor and the `tap-target-expand` escape hatch,
- the `dark:` variant's activation contract (`.dark` class is applied alongside `data-theme`).

- [ ] **Step 3: Update the docs-must-move table**

Per `AGENTS.md` §5:

| Because | Update |
|---|---|
| New test files (Tasks 2, 4, 5, 8, 10) | `README.md` (test counts), `spec/master-verification-matrix.md`, `docs/07-module-registry.md`, `docs/governance/g4-manual-verification-runbook.md` |
| User-visible changes (Tasks 3, 10, 11) | `artifacts/cadence/src/lib/version-info.ts` highlights |
| A rule in `scripts/lint-tokens.cjs` changed | `AGENTS.md` §4 |
| A token changed (only if Task 1 Step 7 added one) | `AGENTS.md` §4 |

- [ ] **Step 4: Append to AUDIT.md and CHANGELOG.md**

Append a **new dated entry** to each. Do not edit any existing entry. State which rules were vacuous, how many violations they were hiding, and what was fixed.

- [ ] **Step 5: Run the full ladder**

Run: `pnpm run verify`
Expected: **12/12 gates PASS**.

Run: `git status --porcelain`
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add DESIGN.md README.md spec/ docs/ artifacts/cadence/src/lib/version-info.ts AUDIT.md CHANGELOG.md AGENTS.md
git commit --no-gpg-sign -m "docs: record the gate-integrity work and the drawer navigation standard"
```

---

## Plan Completion Checklist

- [ ] `pnpm run verify` — 12/12 green
- [ ] `node scripts/lint-tokens.cjs --self-test` — every rule fires on its BAD sample and is silent on its GOOD sample
- [ ] `node scripts/lint-tokens.cjs --no-baseline` — 0 errors, 0 warns, no baseline entries
- [ ] `pnpm run verify:e2e` — green
- [ ] `git status --porcelain` — empty
- [ ] Every hand-rolled modal traps focus and declares `role="dialog"`
- [ ] Every label is associated with its control
- [ ] The 3D canvases stop rendering when hidden or off-screen
- [ ] The OS colour scheme is honoured, and the `dark:` utilities are live
- [ ] `DESIGN.md` describes the drawer, not the deleted dock
- [ ] Every doc in the `AGENTS.md` §5 table is updated
- [ ] `AUDIT.md` and `CHANGELOG.md` have new dated entries; no history rewritten
