# Remediation Log — Round 2 (2026-09-30)

Continues `REMEDIATION-2026-09-30.md` (round 1 = fork a repair + fork b sub-12px text).
This round closes the remaining concrete findings from `DESIGN-SYSTEM-AUDIT.md`.

**Gate for every item below: `tsc --build --force` (exit 0) + `vite build` (exit 0) + full vitest (exit 0, 220 passing).**

---

## R2-1 — Tailwind v4 dropped the `-[--var]` shorthand (24 sites, 9 files) — CONFIRMED FUNCTIONAL BUG

The audit recorded this as "unverified — likely no-ops." It is now **verified, and it is a real bug, not a no-op.**

### Root cause

Tailwind v3 allowed `origin-[--foo]` as shorthand for `var(--foo)`. **Tailwind v4 removed it.** The repo is on `tailwindcss@4.3.3`.

Evidence from the compiled CSS **before** the fix — Tailwind emitted the bare property name, which is invalid CSS that the browser silently discards:

```css
.origin-\[--radix-popover-content-transform-origin\]{transform-origin:--radix-popover-content-transform-origin}
.border-\[--color-border\]{border-color:--color-border}
```

### Blast radius

| File | Sites | Vars |
|---|---|---|
| `ui/calendar.tsx` | 10 | `--cell-size` |
| `ui/chart.tsx` | 2 | `--color-bg`, `--color-border` |
| `ui/context-menu.tsx` | 3 | `--radix-context-menu-content-available-height`, `--radix-context-menu-content-transform-origin` |
| `ui/dropdown-menu.tsx` | 2 | `--radix-dropdown-menu-content-transform-origin` |
| `ui/hover-card.tsx` | 1 | `--radix-hover-card-content-transform-origin` |
| `ui/menubar.tsx` | 2 | `--radix-menubar-content-transform-origin` |
| `ui/popover.tsx` | 1 | `--radix-popover-content-transform-origin` |
| `ui/select.tsx` | 2 | `--radix-select-content-available-height`, `--radix-select-content-transform-origin` |
| `ui/tooltip.tsx` | 1 | `--radix-tooltip-content-transform-origin` |

**User-visible effect:** every Radix overlay (popover, dropdown, context menu, menubar, select, tooltip, hover-card) had **no transform-origin**, so `zoom-in-95` / `fade-in-0` enter animations scaled from the centre of the element instead of the trigger edge. `max-h-[--radix-*-available-height]` on dropdown/context-menu/select was also dropped, so **long menus had no max height and could overflow the viewport**. Chart borders and backgrounds did not render at all. Calendar day cells had no `--cell-size` sizing.

### Fix

All 24 rewritten to the explicit form, e.g. `origin-[var(--radix-popover-content-transform-origin)]`.

`--cell-size`'s *definition* at `calendar.tsx:31` (`[--cell-size:2rem]`) was correctly left untouched — verified.

**After:** `transform-origin:var(--radix-popover-content-transform-origin)` in compiled CSS, and **0** invalid bare-custom-property declarations remain anywhere in the bundle.

---

## R2-2 — `border.control` at ≥3:1 (finding 2b-1) — the most concrete a11y defect, now fixed

Previously **every** border in the app measured 1.10–1.50:1. P6.1 requires ≥3:1 for control boundaries and states that `border.subtle` "is NOT sufficient for inputs."

### Token added

- `--border-control: 240 2% 44%` in `:root` (= P6.1's `#6E6E73`)
- `--color-border-control: hsl(var(--border-control))` in `@theme inline`

### Value selection was measured, not guessed

I first tried to find a *less* visible gray that still passed, to avoid making every input heavy. Searching hue-240 neutrals, the lightest value hitting 3:1 on the actual input background `#18181B` is `#646468` — but that is **2.89:1 on `#1C1C1E`**, i.e. it would **fail on any control sitting on a card**. P6.1's `#6E6E73` is therefore correct and is close to the true minimum:

| surface | `#6E6E73` | `#646468` (rejected) |
|---|---|---|
| `#18181B` (input bg) | **3.49:1** ✓ | 3.01:1 |
| `#1C1C1E` (card) | **3.36:1** ✓ | **2.89:1** ✗ |
| `#141416` | **3.63:1** ✓ | — |
| `#000000` (canvas) | **4.14:1** ✓ | — |

### Applied

| Target | Count |
|---|---|
| Form controls on `border-white/[0.08]` → `border-border-control` | 16 |
| Inputs + icon buttons + button variants on `border-white/[0.1]` → `border-border-control` | 18 |
| **Total** | **34** |
| Controls left on the failing hairline | **0** |
| Decorative `border-white/[0.08]` deliberately **preserved** (cards, dividers) | 89 |

**Deliberate broadening, flagged:** the 18 include icon buttons (`grid size-10`) and button variants, not only inputs. Justification: WCAG 1.4.11 covers "UI components," and a button is one. **This does make those controls visibly heavier and needs a visual confirmation.**

### Not changed, flagged

- `TaskEditor.tsx:397` — `border-transparent` inline bare input (`h-5 flex-1`). Likely sits inside a bordered wrapper providing the boundary. Left alone rather than guess; needs a look.
- 18 controls reported as "no border in window" were **false positives** of the 7-line scan window (className sits further down for inputs with many props). Spot-checked 3 by hand; not defects.

---

## R2-3 — Tap targets (finding 4-6) — 47 of 53 remediated, 6 deliberately deferred

The app already defined `.tap-target-44` but used it **zero** times — which is exactly why 53 interactive elements sat under the floor.

### New foundation primitive

`@utility tap-target-expand` — expands the touchable region to ≥44×44 via a `::after` pseudo-element, **without changing layout**. The visual box stays as authored. This is the right tool for controls living in tight rows, where growing the box would break the grid.

```css
.tap-target-expand{position:relative}
.tap-target-expand:after{content:"";position:absolute;top:50%;left:50%;translate:-50% -50%;width:max(100%,44px);height:max(100%,44px)}
```

### Applied to 47 sites across 16 files

`AppShell` · `TodayPage` · `TaskRow` · `TaskEditor` · `TaskAttachments` · `ProfilePage` · `SettingsPage` · `OnboardingPage` · `ReviewPage` · `StateViews` · `error-boundary` · `RitualDialog` · `AgentPanel` · `MemoryPage` · `WorkspacePanel` · `InboxPage` · `FocusPage`

Sizes covered: 16px · 28px (×16) · 32px (×26) · 36px (×5) · 40px (×5)

### 6 sites in `CalendarPage.tsx` deliberately NOT patched

Lines 160, 178, 185, 194, 297, 442. Line 297 is a **16px time-block chip** inside the day grid. These are dense-grid controls; two of them sit 28px apart, so blanket 44px hit areas would **overlap and steal each other's taps**, and enlarging the 16px block would destroy the grid.

**These need a layout decision, not a patch:** either enlarge the calendar's row/column pitch, or accept a documented smaller target with the non-drag alternative P11.1 already mandates for `TimeBlock` (tap → time picker, arrow keys).

### Known residual risk

Where two controls' centres are <44px apart, expanded hit areas overlap. I did not map every adjacency. **Needs a real-device tap test.**

---

## R2-4 — PWA manifest color mismatch (finding 7-2)

`public/manifest.webmanifest` declared `background_color: #F5F5F7` (light) and `theme_color: #FF9500` (light-mode orange) against a pure-black OLED app — installed-PWA splash flashed light on a black app.

Both set to `#000000`, matching `index.html`'s `<meta name="theme-color" content="#000000">` and `index.css`'s `--background: 0 0% 0%`.

*Note: I first set `theme_color` to `#FF9F0A` and immediately corrected it — the manifest must agree with the `meta` tag, and the meta is correctly black.*

---

## R2-5 — `AGENTS.md` stale test count

Both claims said **183/183 across 13 files**. Measured actual: **220 passing across 18 test files** (208 api-server / 16 files + 12 db / 1 passed + 1 skipped), 23 DB tests skipped for lack of `DATABASE_URL`.

Updated at `AGENTS.md:14` and `AGENTS.md:143`.

---

## Gates

| Gate | Result |
|---|---|
| `node node_modules/typescript/bin/tsc --build --force` | **exit 0** |
| `pnpm --filter @workspace/cadence run build` (Vite 7.3.6) | **exit 0**, 1878 modules |
| `pnpm run test` | **exit 0** — 208 + 12 = **220 passing**, 23 skipped |
| `verify-contrast.cjs` | re-run, 51 pairs; `border-control` ≥3:1 on all four surfaces |
| Compiled CSS: invalid bare-property declarations | **0** |
| Line-ending / BOM damage | none — all diffs surgical (`git diff --numstat` equal insert/delete) |
| Duplicate utility application | 0 |

---

## Still open — deliberately not done

These need a decision or a section of the spec document that does not exist yet. None are safe to improvise.

| Item | Why not done |
|---|---|
| **No light theme** (finding 7-1) | P0 and foundational, but retrofitting it touches every component. Needs `tokens.json` + codegen first. Also the defining content of the missing §P23. |
| `tokens.json` → CSS/Tailwind/TS pipeline (finding 3-1) | Architectural. Also the defining content of the missing §P25. |
| 25 missing P0/P1 domain components (finding 5-3) | Large. Requires the §P11.3 per-component specs, which need §P18–P22. |
| **`automation_paused` banner + `SystemStatusBanner`** (finding 5-3) | The one *safety-relevant* gap: a user who pauses automation currently has no in-app way to see or undo it. Small to build — say the word and it is a short task. |
| Today hierarchy reorder (findings 6-1/6-2/6-3) | Product-visible. Needs §P22, which is missing. |
| `--cad-` token prefix (§P5.1) | Partially **impossible**: shadcn forces unprefixed names (`--sidebar-width`, `--button-outline`, `--badge-outline`, `--spacing-4`, all `--radix-*`). Must be a codegen-time decision, not a hand rename. |
| 8 undefined surface colors (finding 4-2) | `#18181B` etc. Need to be either promoted to tokens or replaced. Currently still hardcoded. |
| 3 coexisting indigos (finding 2b-2) | `#5E5CE6` (56×, fails as text) vs `#7A78FF` (13×) vs P6's `#7D7AFF`. Needs a single decision, then a sweep. |
| 265 off-system Tailwind palette classes (finding 4-1) | Includes a **second green** (`emerald-400/500`) beside `#30D158`, breaking P6.3 semantic exclusivity. Large mechanical sweep after tokens exist. |
| Remaining P5.3 arbitrary values | e.g. `text-[0.8rem]`, `shadow-[0_0_8px_rgba(52,199,89,0.8)]`, and the off-system `#FF8500` in `.btn-primary`. Needs the token layer first. |

## Not verified

No browser, no rendered-DOM inspection, no screenshot, no device test. **Unverified:**
- whether the 47 expanded hit areas overlap anywhere in practice
- whether `border-border-control` at 3.36–4.14:1 looks acceptable, or too heavy
- whether the 12px text raise (round 1) clips in any fixed-height container
- whether restored `transform-origin` / `max-h` change overlay behaviour in a way that needs tuning

**One visual pass on a real phone is now the highest-value next step** — four separate changes landed blind.
