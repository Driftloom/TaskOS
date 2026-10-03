# Cadence — Design System & Architecture (DESIGN.md)

> Canonical design reference for Cadence (Personal Task & Time OS).
> Follows Apple Human Interface Guidelines (Clarity, Deference, Depth) + Things 3 craft.
> Single source of truth for tokens: `tokens/tokens.json` -> `scripts/build-tokens.cjs`.

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

The default appearance is **Dark Mode (OLED `#000000`)**; Light mode is supported via `[data-theme="light"]`.

| Role | Dark Token | Light Token | Use For | Icon/Shape Pair |
|---|---|---|---|---|
| **Background** | `#000000` | `#F5F5F7` | OLED deep black background | — |
| **Surface / Card** | `#1C1C1E` | `#FFFFFF` | Primary cards, panels, list items | — |
| **Elevated Surface** | `#2C2C2E` | `#F2F2F7` | Modals, sheets, popovers | — |
| **Control Border** | `#3A3A3C` | `#D1D1D6` | Interactive inputs, card borders | — |
| **Text Primary** | `#F5F5F7` | `#1D1D1F` | Headlines, task titles, body | — |
| **Text Muted** | `#98989D` | `#6E6E73` | Captions, metadata, shortcuts | — |
| **Accent — Energy** | `#FF9F0A` | `#FF9500` | Primary CTAs, Start button, streaks | Flame (`Flame`) |
| **Status Success** | `#30D158` | `#34C759` | Completions, healthy status | Check Circle (`CheckCircle2`) |
| **Status Urgent** | `#FF453A` | `#FF3B30` | Overdue deadlines, at-risk tasks | Alert Triangle (`AlertTriangle`) |
| **Status Scheduled** | `#0A84FF` | `#007AFF` | Calendar blocks, links | Clock (`Clock`) |
| **AI / Memory** | `#5E5CE6` | `#5E5CE6` | Memory facts, agent recommendations | Sparkles (`Sparkles`) |

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
- **Hit Area Overlap Prevention:** Tight clusters (such as Calendar Prev/Today/Next) expand their physical box dimensions rather than relying on overlapping pseudo-element hit areas.
- **Contrast Guarantee:** All text elements meet or exceed WCAG AA 4.5:1 contrast ratio against their respective surfaces. Validated via `scripts/check-contrast.cjs`.
