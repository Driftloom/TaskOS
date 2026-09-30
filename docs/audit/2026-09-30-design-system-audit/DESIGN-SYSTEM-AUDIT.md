# Design System Audit — Cadence UI vs `docs/13-master-design-system-prompt.md`

**Date:** 2026-09-30
**Type:** Read-only audit. No product code was modified. (`AGENTS.md §8`: "audit sessions verify and report only")
**Audited against:** `docs/13-master-design-system-prompt.md` §P0–P17 (the sections that exist on disk)
**Evidence script:** `docs/audit/2026-09-30-design-system-audit/verify-contrast.cjs` (run with `node`; output reproduced in §2)
**Not audited:** P18–P32 — those sections do not exist in the source document (see §1).

---

## 0. Headline

The existing UI is **internally consistent and competently built**, but it is **not Cadence's design system** — it predates one. The gap is not "a few hardcoded hexes"; it is that P0–P17 describe a system that does not exist in code, and the code that does exist was built to different rules.

Three findings matter more than the rest:

1. **There is no light theme.** Not "light theme is unfinished" — there is no light theme, no theme switch, and no code path that could produce one. P6 specifies a light column for every semantic color; P23 (theming) is P0. Dark is not the default, it is the only mode.
2. **Tokens are bypassed, not merely incomplete.** 281 hex literals and 265 off-system Tailwind palette classes sit directly in components. The semantic layer exists in `index.css` and is largely unused.
3. **The single most important rule in the document is inverted on the Today page.** P3 "Start-first" and P14.2 put Start as the dominant first element. In the code, Start lives in a 280px `xl:` aside column and, on mobile, renders *below* proposals, capture, and the full task list.

**One important positive:** P6's hand-computed contrast analysis is **sound**. Every ratio quoted in P6 that I could check verified within 0.15, including all the claims that motivated the text-safe variants. That reasoning should not be re-litigated — it is the one part of the design work that is already done properly.

---

## 1. The source document is incomplete (blocking)

`docs/13-master-design-system-prompt.md` is **666 lines and ends mid-§17.3**. The coverage map at the top promises §P18–P32. None are present.

| § | Topic | Tier in doc | Consequence of absence |
|---|---|---|---|
| P18 | Accessibility | P0 baseline | The a11y *baseline* is unspecified. §4 below can only cite P7/P8/P12 rules that happen to touch a11y. |
| P19 | Internationalization | P0 (time/format) | Locale/timezone display rules absent. Relevant: `Asia/Kolkata` is a locked decision. |
| P20 | Content design | P0 | Copy rules absent — including the "blanket streak copy must be neutral" rule that P3 explicitly cross-references. |
| P21 | Patterns | P0 (capture/Today) | Pattern specs absent. |
| P22 | Page architecture | P0 (Today) | Absent; partially inferable from P14.2. |
| P23 | Theming | P0 | **Absent — and the app has no light theme.** |
| P24 | Figma architecture | P2 | Deferred by the doc itself. Low impact. |
| P25 | Frontend arch + token pipeline + `verify-contrast` | P0 | **Absent.** P6.1 hands off verification to a `verify-contrast` script that P25 was supposed to define. I wrote one (§2) because P6 makes it non-optional. |
| P26–P30 | Performance, security/trust UX, governance, anti-patterns, maturity | mixed | Absent. |
| **P31** | **Audit of the existing UI** | **first deliverable** | **Absent.** P0 rule 1 mandates it. This document *is* that deliverable's standard and the standard is missing. |
| P32 | Output format + quality rules | required to run | Absent. |

**Also stale inside the document** (predates the `docs/archive/` restructure):
- "put this file in `spec/` next to docs 01–12" → 01–12 are now in `docs/archive/`. The file sits in `docs/`, which is arguably the right home for a master *prompt* rather than an implementation contract in `spec/`. Recommend updating the sentence either way.
- "refines `spec/03 §2`" → that file is now `docs/archive/03-master-build-prompt-for-replit.md §2`.

**Recommendation:** P31, P25, and P23 are needed before real design-system work starts. P18/P19/P20 can be drafted from the design-system skill references and reviewed.

---

## 2. P6 contrast verification (script output)

`node verify-contrast.cjs` → **45 pairs measured.**

### 2a. P6's own claims — verified

| Claim in P6 | Measured | Verdict |
|---|---|---|
| orange `#FF9500` on white ≈ 2.2:1 (fails) | **2.20:1** | confirmed, correctly rejected |
| dark `#1D1D1F` on orange ≈ 7.7:1 | **7.65:1** | confirmed |
| green `#34C759` on white ≈ 2.2:1 (fails) | **2.22:1** | confirmed |
| red `#FF3B30` on white ≈ 3.55:1 | **3.55:1** | confirmed (graphics only) |
| blue `#007AFF` on white ≈ 4.0:1 (fails small text) | **4.02:1** | confirmed |
| `#B25000` on white ≈ 5.2:1 (text-safe orange) | **5.20:1** | confirmed, passes |
| `#1E7B34` on white ≈ 5.3:1 (success text) | **5.33:1** | confirmed, passes |
| `#D70015` on white ≈ 5.4:1 (danger text) | **5.38:1** | confirmed, passes |
| `#6E6E73` on `#F5F5F7` ≈ 4.65:1 | **4.66:1** | confirmed |
| `#8E8E93` on white ≈ 3.3:1 | **3.26:1** | confirmed |
| `#5E5CE6` on `#1C1C1E` ≈ 3.4:1 | **3.36:1** | confirmed |
| orange on black ≈ 10:1 | **10.22:1** | drift +0.22, safe direction, no action |
| orange on `#1C1C1E` ≈ 8:1 | **8.28:1** | drift +0.28, safe direction, no action |

**Conclusion: P6's contrast reasoning is correct and should be adopted as-is.** Bonus: the rejected `#007AFF` (4.02:1) vs chosen `#0040DD` (**7.56:1**) is a large real win.

### 2b. What the app actually paints — failures

| Pair | Measured | Problem |
|---|---|---|
| `#5E5CE6` on `#1C1C1E` | **3.36:1** | Fails 4.5:1 for text. Used 56×, of which **19× as `text-[#5E5CE6]`** → real text failures. |
| `#5E5CE6` on `#000000` | 4.15:1 | Still fails 4.5:1. |
| `#0055D6` on `#1C1C1E` | **2.65:1** | FAIL. Off-system 4th blue, 1 occurrence. |
| `#262628` on `#1C1C1E` (border) | **1.13:1** | FAIL 1.4.11 (needs 3:1) |
| `#242428` on `#1C1C1E` (border) | **1.10:1** | FAIL |
| `#2C2C2E` on `#1C1C1E` (border) | **1.22:1** | FAIL |
| `#323236` on `#1C1C1E` (border) | **1.33:1** | FAIL |
| `#3A3A3C` on `#1C1C1E` (border) | **1.50:1** | FAIL |
| `rgba(255,255,255,.08)` on `#1C1C1E` | **1.26:1** | FAIL — this is `--p-border-subtle`, used as a *control* boundary in several places |

**Finding 2b-1 (P0):** P6.1 requires `border.control` ≥3:1 for input/control boundaries and explicitly says a hairline `border.subtle` "is NOT sufficient for inputs." Every border color in the codebase measures 1.10–1.50:1. **No control in the app has a WCAG-conformant boundary.** This is the single most concrete accessibility defect found.

**Finding 2b-2 (P0):** Three indigos coexist — `#5E5CE6` (56×), `#7A78FF` (13×, equals `--p-indigo`), and P6's specified `#7D7AFF` (0×). P6's own analysis says dark-mode indigo *must* be lighter than `#5E5CE6` precisely because `#5E5CE6` is only 3.4:1 on dark surfaces. The app ships the rejected value 56 times and the token value 13 times. Measured: `#7A78FF` 4.83:1 (passes), `#7D7AFF` 4.94:1 (passes), `#5E5CE6` 3.36:1 (fails as text).

### 2c. Not tested
No screenshot, no rendered-DOM check, no device test, no color-blindness simulation was performed. Section 4's typographic and tap-target findings are **static-analysis only**; whether they actually fail on a real screen is unverified.

---

## 3. Token system state (P5)

**There is no `tokens.json`. No token source file of any kind exists in the repo.** (Searched repo-wide excluding `node_modules`/`dist`/`.git`.)

The de facto source is `artifacts/cadence/src/index.css` (323 lines), Tailwind v4 CSS-first (no `tailwind.config.*` exists; `components.json:7` sets `"config": ""`).

**What exists:**
- `LAYER 1: PRIMITIVE` — 13 raw hex vars (`--p-*`), `index.css:36-50`
- `LAYER 2: SEMANTIC` — 17 HSL triples, `index.css:53-69`
- `@theme inline` — 18 bindings, `index.css:12-32`
- `LAYER 3: COMPONENT` — hand-written CSS classes, not tokens: `.glass-chrome`, `.card-hig`, `.tap-target-44`, `.btn-primary`, `.btn-secondary`, `.card-enterprise`, `.interactive-press`, animations (`index.css:147-323`)

**Token categories P5.2 requires that are entirely absent:**
spacing · type scale · radius scale · elevation · motion (duration/easing) · z-index · density · **data-viz (`viz.*`)** · interaction-state tints as tokens · high-contrast/forced-colors layer · border-color roles beyond two

**Finding 3-1 (P0):** Spacing, radius, and typography are **stock Tailwind defaults**, not P8/P7 scales. P8.1 mandates an 8px base with a defined scale; P7 mandates a 10-step type scale with specific tracking. Neither is expressed anywhere. There is no way to audit conformance because the scale does not exist as an artifact.

---

## 4. P5.3 violations — hardcoded values in components

P5.3: "**Forbidden:** arbitrary Tailwind values (`bg-[#…]`, `p-[13px]`, `rounded-[7px]`); hex/rgb in component files… Enforce with a lint rule or a CI grep — **a failing check, not a guideline**."

| Measure | Count |
|---|---|
| Hex literals in `.tsx`/`.ts` | **281** across 25 files |
| Distinct hex values | **27** |
| Off-system Tailwind palette classes (`zinc-*`, `emerald-*`, `amber-*`, …) | **265** across 25 distinct |
| Arbitrary Tailwind bracket values | 113 distinct |

Worst files by hex count: `OnboardingPage.tsx` 33 · `MemoryPage.tsx` 33 · `ProfilePage.tsx` 23 · `MessagingIntegrationsView.tsx` 22 · `App.tsx` 21 · `AppShell.tsx` 18 · `ReviewPage.tsx` 15

**Finding 4-1 (P0) — semantic exclusivity is broken (P6.3).** `text-emerald-400` (15×), `bg-emerald-500` (12×), `border-emerald-500` (3×), `bg-emerald-400` (5×) put a **second green** next to `#30D158`. P6.3: "green = completed/success only" and "never repurpose a semantic color." There are now two greens and no rule for which is which. `bg-amber-400` (4×) and `text-amber-400` (3×) do the same to yellow/caution.

**Finding 4-2 (P0) — eight colors exist in neither the token file nor P6:**
`#18181B` (24×) · `#262628` (23×) · `#141416` (11×) · `#111113` (6×) · `#242428` (4×) · `#323236` (2×) · `#151518` (2×) · `#0E0E10` (1×)
These are undocumented surface values invented during implementation. P6.3: "No arbitrary colors. If a screen 'needs' a color that isn't in the system, that's a system decision to propose, not a local hex."

**Finding 4-3 — palette drift beyond indigo.** A 4th orange `#FF8500` (3×, gradient `to-[#FF8500]`) and a 4th blue `#0055D6` (1×) sit alongside `#FF9F0A` and `#0A84FF`.

**Finding 4-4 — malformed Tailwind arbitrary values (likely no-ops).** `bg-[--color-bg]`, `border-[--color-border]`, `w-[--cell-size]`, `h-[--cell-size]`, `ring-[3px]` — the CSS-variable form is missing its `var()` wrapper. **Unverified whether these silently do nothing**; needs a rendered-DOM check.

**Finding 4-5 (P0) — typography floor violated 171 times.** P7 sets `type.caption` at **12px** as the smallest token and states dense areas use "never below 12px." P8.4 repeats it: density "never reduces text below 12px."

| Size | Instances |
|---|---|
| `text-[9px]` | **13** |
| `text-[10px]` | **104** |
| `text-[11px]` | **54** |

Worst: `MessagingIntegrationsView.tsx` 30 · `ProfilePage.tsx` 26 · `CommandPalette.tsx` 13 · `TodayPage.tsx` 12 · `AppShell.tsx` 11 · `CalendarPage.tsx` 11

9px text is not a density choice, it is illegible on a phone at arm's length — the primary persona's context.

**Finding 4-6 (P0) — 44 tap targets below the 44px floor.** P8.1: "minimum **44×44px** for every touch-interactive element (stricter than WCAG 2.2's 24px minimum — deliberate)."

| Box | Sites |
|---|---|
| 12px | 3 |
| 16px | 1 |
| 28px | 14 |
| 32px | 16 |
| 36px | 7 |
| 40px | 3 |

Verified examples in `AppShell.tsx`: collapse sidebar `size-7` = 28px (`:188`) · command palette `size-8` = 32px (`:382`) · **mobile quick-capture `size-8` = 32px** (`:396`) · profile `size-8` = 32px (`:409`) · audio toggle `h-8` = 32px (`:358`). The mobile capture button is the app's most important affordance (P16: "capture in one tap from every screen is a rule, not a preference") and it is 32px.

*Positive note:* the icon-only header controls **do** carry `aria-label` + `title` (`AppShell.tsx:190, 363-364, 383-384, 397, 414-415`). Accessible naming there is fine. (An earlier regex pass suggested 96 unlabeled buttons; that heuristic was wrong and is retracted — the controls were checked by hand.)

---

## 5. Component library (P11) and states (P12)

**Finding 5-1 (P0) — 54 of 55 shadcn/ui primitives are dead code.** Exactly one is mounted: `Toaster` (`App.tsx:8, 239`). The other 22 import sites are intra-`ui/` references. P11.2: "Base = shadcn/Radix unless stated." All domain UI is hand-rolled with raw Tailwind.

**Finding 5-2 — the dead primitives are also broken.** They reference tokens that `index.css` does **not** define: `--color-secondary*`, `--color-popover*`, `--color-sidebar*`, `--color-chart-1..5`, `--radius-sm/md/lg/xl`, the `--text-*` scale, `--button-outline`, `--badge-outline`, `--elevate-1/2`, and the `hover-elevate` / `active-elevate-2` utilities used by `ui/button.tsx:8` and `ui/badge.tsx:9`. *(Those tokens are defined in `artifacts/mockup-sandbox/src/index.css` — the throwaway preview app that must never be imported from.)* Mounting any of them today would render unstyled or broken. This needs deciding before any component work: fix the tokens, or delete the unused primitives.

**Finding 5-3 (P0) — domain component coverage: 3 of 28 exist.**

| Exists | Missing |
|---|---|
| `TaskRow` (`task/TaskRow.tsx:34`) | **NextUpCard** · **QuickCaptureSheet** · **FocusTimer** · **UndoBar** · **SystemStatusBanner** · **AITag** · **AutomationBadge** · **StatusIndicator** · **PriorityMark** · **SettingsRow** · **TimeRangeControl** · **ChannelStatus** · **OnboardingStepper** · TimeBlock · Calendar · ProposalCard · RescheduleLogItem · TimezoneChangeNotice · AgentMessage · AgentActionCard · ActionPreview · MemoryFactCard · ConfirmationPrompt · ImportDraftRow · ImportQueue |
| `ActivityRings` (`shared/ActivityRings.tsx:12`) | |
| `EmptyState` (`shared/StateViews.tsx:47`) | |

Every "missing" one currently exists as **inline JSX inside a page**, which is exactly the anti-duplication P4 forbids ("A page may not define its own button, card, chip, or sheet").

Two P0 components are missing in a way that has a functional consequence, not just an architectural one:
- **`UndoBar` is missing and the kill switch has no surface.** P1 locks `automation_paused` as the manual safety control, and P17.1 requires a non-dismissible critical banner "Automation paused — reminders and auto-reschedule are off" with a **Resume** action. There is **no banner component and no automation-paused state anywhere in the client.** A user who pauses automation has no in-app way to see or undo it.
- **`SystemStatusBanner` is missing, and P17.1's offline state is unverified.** Network state exists only as a sidebar "LIVE/OFFLINE" dot (`AppShell.tsx:173-182`) — a 6px color dot with text, not the persistent "Offline — n changes queued" banner P17.1 requires.

Also missing entirely: **`TimezoneChangeNotice`**. P19 is absent from the document, but P1 locks `Asia/Kolkata` as home timezone and P11.1 requires this component with the rule "**Never silently changes working hours.**" Grep for any timezone-change notice returns zero matches.

**Finding 5-4 — no `/__design` page exists.** P2 makes the living style page a P0 deliverable and P12 requires states be "demonstrated on `/__design`." It does not exist, so no state in P12's matrix is currently *demonstrated* anywhere.

---

## 6. Navigation (P16) and Today hierarchy (P14.2)

**Finding 6-1 (P0) — the mobile dock does not match P16, on the point P16 calls a rule.**
P16 specifies 5 slots: `Today · Calendar · [＋ Capture] · Agent · More`, with capture as the **center, accent** button.
Actual (`AppShell.tsx:429-486`): `Today · Inbox · Focus · Calendar · More`. Capture is **not in the dock at all** — it is a 32px `+` in the header (`:390-400`). The rationale P16 gives is that "capture and Start are the two actions that matter"; the dock currently surfaces neither.

**Finding 6-2 (P0) — no running-timer mini chip exists.** P16 requires the running timer to appear as a persistent chip above the tab bar, on every screen. `AppShell.tsx` never reads focus-session state. The only running-timer indicator in the entire app is inline on the Focus page (`FocusPage.tsx:175-182`). A user cannot tell from Today/Inbox/Calendar that a round is running.

**Finding 6-3 (P0) — Start is not the dominant element on Today.** P14.2 orders Today: (1) NextUpCard/Start dominant, (2) ActivityRings, (3) Timeline, (4) Attention capped at 3, (5) quiet footer. P3: "The single most prominent element on Today is always Start."

Actual DOM order (`TodayPage.tsx:173-467`):
1. `SectionHeading` + "Plan Day" / "Add task" (`:175-204`)
2. `RescheduleProposals` (`:211`)
3. **Quick-capture form** (`:213-263`)
4. Search & filter (`:266-285`)
5. **Full task list** (`:303-330`)
6. `AgentPanel` (`:335`)
7. — `xl:` aside — **NextUp "Start focus"** (`:341-390`)
8. — `xl:` aside — Momentum / `ActivityRings` (`:393-439`)

Two distinct violations:
- **Desktop (`xl:`):** Start is inside a `280px` right-hand column (`grid xl:grid-cols-[1fr_280px]`, `:206`). It is the *narrowest* thing on the page, not the most prominent.
- **Mobile (<768, the primary persona's context):** the aside stacks *below* the main column, so Start renders **after** proposals, the capture form, the filter bar, and the entire task list — i.e. effectively below the fold. The one action P3 calls the product's core is the last thing on the screen.

Also: there is **no Timeline section** on Today (P14.2 §3) and **no "attention items capped at 3 with See all"** treatment (P14.2 §4) — proposals render unbounded at the top instead.

---

## 7. Theming (P23, inferred from P6.1)

**Finding 7-1 (P0) — there is no light theme and no mechanism to add one.**
- `@custom-variant dark (&:is(.dark *))` is declared (`index.css:6`) but **`.dark` is never applied** — grep for `classList`/`documentElement` across `artifacts/cadence/src` returns **0 matches**. `index.html:2` is `<html lang="en">` with no class.
- There is exactly **one** token scope: `:root` (`index.css:34`). No `.dark {}` block, no light block, no `prefers-color-scheme` query (the only media query in the file is `prefers-reduced-motion` at `:314`).
- `dark:` utility variants appear **only inside unmounted `ui/` primitives** (`alert.tsx:12`, `field.tsx:119`, `input-group.tsx:14,27,136,152`, `kbd.tsx:10`).
- **No `ThemeProvider`.** `next-themes` is imported once, in `ui/sonner.tsx:3`, with no provider mounted — so `useTheme()` is undefined there.

P6.1 specifies light and dark columns for ~25 semantic colors. **The light column does not exist in any form.** P2 lists theming as P0.

**Finding 7-2 (P1) — PWA manifest contradicts the app.**
`public/manifest.webmanifest:9-10` declares `background_color: "#F5F5F7"` (light) and `theme_color: "#FF9500"`. The app's actual background is `#000000` (`index.css:34`, `index.html:9`) and its primary is `#FF9F0A`. Installed-PWA splash will flash light on a black app.

---

## 8. What's genuinely good (do not regress)

Not everything here is a rewrite. These pass audit and should be preserved deliberately:

- **Header control accessible naming** — `aria-label` + `title` on all icon-only header controls (`AppShell.tsx:190, 363, 383, 397, 414`).
- **Keyboard shortcuts** — `⌘K`, `⌘\`, `Esc`, `1..6`, `N`, `[`, with input-field exclusion (`hooks/use-keyboard-shortcuts.ts`), wired at `AppShell.tsx:115-130`. Exceeds P11.2's P1 tier already.
- **`prefers-reduced-motion` block** — present at `index.css:314-323`. P10 requires this; it exists.
- **Error / skeleton / empty state primitives** — `ErrorState` (`StateViews.tsx:88`), `SkeletonList` (`:34`), `EmptyState` (`:47`). P12 prefers skeleton over spinner and P17.2 requires contextual empty states; the primitives are in place.
- **`ErrorBoundary`** with `resetKey={location}` (`error-boundary.tsx:68`, `App.tsx:163`) — matches P17.3's "say what happened + retry."
- **Tablet-nums / timer digits** — used in the focus timer, matching P7's numeric rule.
- **Vault of stateful primitives** — TaskEditor, TaskAttachments, WorkspacePanel, RitualDialog, CommandPalette are all real, and they're the raw material for extracting the missing P11 components.
- **Routing + auth gate** — 9 protected routes, all with matching nav entries; `requireAuth`-equivalent gate at `App.tsx:159-160`.

---

## 9. Suggested sequence (for approval — not started)

P2's hard rule applies: **none of this may block the Friday slice** (signed-in Today + typed quick-add + one real Telegram reminder). Nothing below has been started.

| # | Work | Why this order |
|---|---|---|
| 0 | **Get P31, P25, P23 written** | P31 is the mandated first deliverable and doesn't exist; P25 defines the token pipeline; P23 defines theming. Doing DS work without them repeats this audit's guessing. |
| 1 | `tokens/tokens.json` + build script → CSS vars + Tailwind theme + TS types | P5.4. Single source, mirroring the existing OpenAPI→Orval pattern. Nothing else is safe to automate before this exists. |
| 2 | Extend `verify-contrast.cjs` into the P25 CI check; fix the two P6 claim numbers (10.22, 8.28) | Cheap, and the check is worthless without a token source. |
| 3 | Add the **light theme** as a second token scope | P23 is P0 and is a *foundational* gap — retrofitting it after components are built means touching every component twice. |
| 4 | `border.control` token ≥3:1 + fix the 5 failing border colors | Finding 2b-1: the most concrete accessibility defect, and a token-only fix. |
| 5 | Lint rule failing on hex-in-component + arbitrary values | P5.3 demands "a failing check, not a guideline." Without this, every later step regresses. |
| 6 | Decide: repair the 54 dead shadcn primitives, or delete them | Finding 5-2. Blocks any component work. Cheap either way, but it is a real fork. |
| 7 | Raise `text-[9px]`/`[10px]`/`[11px]` → 12px floor; raise the 44px tap targets | Findings 4-5, 4-6. Mechanical, high user impact, no architecture dependency. |
| 8 | Extract P0 domain components from the inline JSX, Today first | Finding 5-3. P2: migrate screen by screen, Today first. |
| 9 | Reorder Today to P14.2; add center-＋ dock + timer mini chip | Findings 6-1/6-2/6-3. Needs step 8. |
| 10 | `automation_paused` banner + `SystemStatusBanner` + `TimezoneChangeNotice` | Findings 5-3, and the only *safety-relevant* UI gap found. Arguably belongs before step 9. |

**Two forks I need a decision on before step 6:**
- (a) Repair the 54 dead shadcn primitives (add the missing tokens they reference) or delete them and keep the hand-rolled layer? P11.2 says shadcn is the default base; the hand-rolled layer is more consistent with what's actually built.
- (b) Is the 9px/10px/11px text a deliberate density choice I should preserve via tokens, or a defect to raise to 12px? I read it as a defect (P7 sets 12px as the floor and never authorizes 9px), but 171 instances across 6+ files is a real change and you may have tuned some of it deliberately.

---

## 10. Verification status of this report

| Claim type | How verified |
|---|---|
| File/line references | Read from source |
| Counts (hex, arbitrary values, sub-12px, tap targets, off-system classes) | Scripted greps over `artifacts/cadence/src`; counts reproducible |
| Contrast ratios | `verify-contrast.cjs`, WCAG 2.2 relative-luminance formula, 45 pairs |
| P6 claim accuracy | Compared script output to the document's stated numbers |
| **Rendered appearance, actual legibility, color-blindness, screen-reader behavior, device testing** | **NOT VERIFIED — no browser, no device, no screenshot was used** |

Per P0 rule 2, anything not backed by the above is reported as unverified rather than asserted.
