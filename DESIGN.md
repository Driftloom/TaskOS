# Cadence — Design System & Architecture (DESIGN.md)

> **Orientation summary, not the specification.** The canonical, normative design
> spec is `docs/13-master-design-system-prompt.md` (P0–P32). The canonical *values*
> are `tokens/tokens.json` → `scripts/build-tokens.cjs`. Where this file disagrees
> with either, they win and this file is the bug. See §7.
>
> Follows Apple Human Interface Guidelines (Clarity, Deference, Depth) + Things 3 craft.

---

## 1. Core Design Philosophy

- **Clarity, Deference, Depth:** The interface defers to your time and focus. Content is hero; chrome is quiet.
- **Energy, Not Pretending:** Zero fake motivational platitudes ("You've got this!"). Clean, bold energy accents (`#FF9F0A`) on Start actions and active focus rounds.
- **Calm Urgency:** Alert reds are reserved strictly for overdue deadlines and system faults. The interface never screams or induces artificial anxiety.
- **Multi-Sensory Completion:** Satisfying micro-interactions using synthesized Web Audio chords (`C5-E5-G5`), haptic spring feedback, and synchronized Activity Rings.
- **Zero Color-Alone Communication:** Every status color always pairs with an icon and shape for 100% colorblind accessibility.

---

## 2. Layout & Responsive Architecture

### Docked Canvas System (Zero Dead Side Space)
In enterprise desktop applications with a fixed sidebar (Linear, Slack, macOS Reminders):
- The workspace canvas begins **immediately at the sidebar boundary** (`x = 240px`).
- `<header>` inner container and `<main>` both use `w-full max-w-[1680px] mx-auto` with fluid edge gutters (`px-4 sm:px-6 lg:px-8 xl:px-10`).
- On standard 1920px widescreen monitors (`1920px - 240px = 1680px`), the container spans the entire visible canvas edge-to-edge.
- **Zero Artificial Margins:** Eliminates the 160px–370px empty black voids that plagued centered single-column layouts.
- **Vertical Guide Alignment:** Header breadcrumbs and content headings align on the exact same left vertical guide; header controls and right-side action buttons align on the exact same right vertical guide.

### Fluid Padding Ladder
| Viewport | Range | Horizontal Padding | Rationale |
|---|---|---|---|
| **Mobile** | `< 640px` | `px-4` (16px) | Maximizes usable card width and touch target pitch |
| **Tablet Portrait** | `640px – 768px` | `sm:px-6` (24px) | Comfortable breathing room without shrinking cards |
| **Desktop Standard** | `1024px – 1280px` | `lg:px-8` (32px) | Proportional margin against fixed sidebar |
| **Desktop Widescreen** | `1280px+` | `xl:px-10` (40px) | Expansive enterprise layout |

### Page Layout Contracts
1. **Today (`/today`):** Dual-column command center (`grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_380px]`). On mobile and tablet (<1024px), streamlined single-column hierarchy lets tasks and Next Up cards breathe naturally without horizontal crowding; on desktop (`lg:`+), docked right sidebar anchors Activity Rings momentum.
2. **Inbox (`/inbox`):** 12-column triage dashboard (`lg:grid-cols-12`). Left 8 cols hold captures and triage stream; right 4 cols hold sticky Triage Discipline rules and zero-inbox targets.
3. **Focus (`/focus`):** 12-column immersive cockpit (`lg:grid-cols-12`). Left 7–8 cols hold the grand timer display; right 4–5 cols hold Up Next queue and focus principles.
4. **Calendar (`/calendar`):** Dual-pane desktop cockpit (`lg:grid lg:grid-cols-12 gap-6 xl:gap-8 items-start`). Left 5 cols hold scheduled and unscheduled tasks with quick-schedule drag targets; right 7 cols (with border-border-subtle divider) hold the 24-hour interactive time blocks grid. Stacks naturally on mobile/tablet.
5. **Review (`/review`):** Balanced 2-column top grid (`lg:grid-cols-[0.9fr_1.1fr]`) for Progress Ring, The Ledger, and Guided Rituals.
6. **Settings (`/settings`):** Left-aligned card hierarchy with clean edge padding, eliminating narrow floating islands while keeping controls readable.
7. **Profile (`/profile`):** Account dashboard spanning the workspace width with Hero identity, 24h chronotype rhythm, and privacy ledger.
8. **Memory (`/memory`):** AI transparency banner, confirmation queue, and responsive 1-to-4 column fact grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`).

### Scrollability & Viewport Hygiene
- **Zero Scroll-Lock Rule:** Content containers and page `<main>` tags must never declare unconditional `overflow-hidden` that traps content or breaks native mousewheel/touch scrolling.
- **Natural Fluid Expansion:** Empty states and minimal task lists maintain fluid page document heights, with background cards expanding naturally to fill visible viewport space without artificial scroll truncation.

---

## 3. Color Tokens & Theme Architecture

The default appearance is **Dark Mode (OLED `#000000`)**; Light mode is supported via
`[data-theme="light"]`; a high-contrast theme is available and `prefers-contrast: more`
/ `forced-colors: active` are both mapped.

> **Values below are `global.color.*` primitives, not what the UI renders.** Semantic
> roles are stored as Tailwind v4 HSL triples (`H S% L%`) and are theme-scoped, so a
> role can differ per theme. The authoritative values are `tokens/tokens.json` →
> `scripts/build-tokens.cjs`. Use this table for orientation, the tokens for truth.

| Role | Dark | Light | Use For | Icon/Shape Pair |
|---|---|---|---|---|
| **Background** | `#000000` | `#F5F5F7` | OLED deep black background | — |
| **Surface / Card** | `#1C1C1E` | `#FFFFFF` | Primary cards, panels, list items | — |
| **Elevated Surface** | `#2C2C2E` | `#F2F2F7` | Modals, sheets, popovers | — |
| **Control Border** | `#84848E` | `#84848E` | Interactive inputs, card borders (WCAG 1.4.11) | — |
| **Text Primary** | `#F5F5F7` | `#1D1D1F` | Headlines, task titles, body | — |
| **Text Muted** | `#98989D` | `#6E6E73` | Captions, metadata, shortcuts | — |
| **Accent — Energy** | `#FF9F0A` | `#FF9500` | Primary CTAs, Start button, streaks | Flame (`Flame`) |
| **Status Success** | `#30D158` | `#34C759` | Completions, healthy status | Check Circle (`CheckCircle2`) |
| **Status Urgent** | `#FF453A` | `#FF3B30` | Overdue deadlines, at-risk tasks | Alert Triangle (`AlertTriangle`) |
| **Status Scheduled** | `#0A84FF` | `#007AFF` | Calendar blocks, links | Clock (`Clock`) |
| **AI / Memory (fill)** | `#7D7AFF` | `#5E5CE6` | Memory facts, agent recommendations | Sparkles (`Sparkles`) |
| **AI / Memory (text)** | `#7D7AFF` | `#3634A3` | AI text on page/card | Sparkles (`Sparkles`) |

> **A saturated fill is not a text colour.** `ai.fill` and `ai.text` are separate
> tokens, as are `primary`/`primaryText` and `status.*Fill`/`status.*Text`. The dark
> AI value is `#7D7AFF`, **not** `#5E5CE6`: `#5E5CE6` measures 3.36:1 on dark surfaces
> and fails WCAG 1.4.3 as text. Text uses the member of the same hue family that
> clears 4.5:1; the saturated fill stays behind a contrasting label. Mixing them in
> one component is the defect, not the token.

---

## 4. Typography & Numbers

- **Font Family:** Apple System Font Stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, system-ui, sans-serif`).
- **Numbers / Metrics:** Always `font-mono tabular-nums` for timers, clock readouts, streak counters, and ring percentages to prevent horizontal character jank.
- **Hierarchy:**
  - `font-display text-title1 font-bold` (Page Headings, e.g. "Make room for the day.")
  - `text-headline font-bold` (Card titles, section headings)
  - `text-body` (Task row titles, standard text)
  - `text-footnote font-medium text-muted-foreground` (Secondary metadata, duration)
  - `text-caption font-mono uppercase tracking-wider` (Category pills, status chips)

---

## 5. Touch Targets & Accessibility

- **44×44px Minimum:** Every interactive button, toggle, and icon has an effective hit target of at least 44×44px (WCAG 2.5.5 / Apple HIG).
- **Hit Area Overlap Prevention:** Tight clusters (such as Calendar Prev/Today/Next) expand their physical box dimensions rather than relying on overlapping pseudo-element hit areas. Use `.tap-target-expand` when the visual box must stay small, and check the centres are ≥44px apart first — two expanded hit areas can overlap.
- **Contrast Guarantee:** All text elements meet or exceed WCAG AA 4.5:1 contrast ratio against their respective surfaces; control borders and meaningful graphics meet 3:1 (WCAG 1.4.11). Enforced by `node scripts/verify-contrast.cjs` (run via `pnpm run contrast:check`, and as the `contrast` gate in `pnpm run verify`) — currently 93 pairs across 3 themes, including high-contrast.

---

## 6. Scale Adoption Status (measured 2026-10-07)

The **pipeline** is enforced: `tokens/tokens.json` → `build-tokens.cjs` → generated CSS,
with `tokens:check`, `lint:tokens`, `contrast` and `encoding` gates. `lint:tokens` scans
**147/147** source files (the former `components/ui/**` exemption is removed).

The **adoption** is not complete. Measured, not estimated:

| Scale | Status | Detail |
|---|---|---|
| Color / semantic | **Enforced** | 0 raw hex, 0 arbitrary colour values in app source; 93/93 contrast pairs pass |
| Radius (P8) | **Adopted, pixel-verified** | `--radius-*` emits the spec scale (6/10/14/20/28px). 83 off-spec `rounded-2xl` (16px) remapped to `rounded-lg` so nothing sits below `lg`. Headless-Chromium computed values confirm **14 / 20 / 28 / 9999px**. |
| Typography (P7) | **Adopted, 0 backlog** | Scale **extended 11 → 17 steps** with `micro`/`macro`/`display1–4` at *exactly* the values the Tailwind utilities already rendered, so **696 migrations were pure renames with zero rendered change**. |
| Spacing (P8) | **Already coupled — false alarm** | A lint rule claimed 1085 offenses. Disproved by probe: `global.space."3"` 0.75→0.83rem moved the compiled `.p-3`. `@theme inline` substitutes at build time, so the "literal" IS the token. **Rule deleted.** |
| Breakpoints | **Corrected + emitted** | `global.breakpoint.sm` said 30rem while every `sm:` renders at 40rem. Corrected; `--breakpoint-*` now emits. Bundle still resolves 40/48/64/80/96rem — no restyle. |
| Arbitrary px (P5.3) | **Warn backlog, 56** | The canonical spec's own table admitted *"no rule exists; nothing checks it"*. Now enforced at `warn` across 28 files. |
| Motion (P10) | **Adopted, 0 backlog** | 19 raw durations moved onto `--duration-*`. Three carried a documented ±20ms trade on 100–500ms transitions (below the perception threshold); `duration-200 → duration-base` was exact. |

Backlog items reached **0**, so the type-size and duration rules were promoted from `warn` to
`error`. They are now regression guards, not a to-do list: a new `text-sm` or
`duration-200` fails CI. Verified by injecting one and confirming the gate exits 1 — and it
has already caught one real regression (a new `AgentSettingsView.tsx` using `text-sm`).

## 7. Catalog Gating

`/__design` is a **dev/test-only** route. `import.meta.env.DEV` wraps the `lazy()` import
itself, so the production bundle does not emit the chunk at all. `/` and `/download`
remain public by design. Assert with `node scripts/verify-design-catalog-gated.cjs`
against `vite preview` — it checks rendered content, because the SPA fallback returns
HTTP 200 for every path and a status-code check would pass while the catalog still
rendered.

## 8. Scope of This Document

This file is a **short orientation summary**, not the specification. It was historically
titled "Canonical design reference", which overstated it: the canonical, normative
specification is **`docs/13-master-design-system-prompt.md`** (~1,100 lines, sections
P0–P32). Where the two disagree, that document wins and this one is the bug.

The full layer contract is `tokens/tokens.json`, whose token values carry inline
`_comment` fields documenting the reasoning, the spec clause, and — where relevant —
the measured failure that motivated the token.
