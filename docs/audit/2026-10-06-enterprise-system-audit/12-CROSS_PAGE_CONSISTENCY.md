# Cadence — Enterprise UI & Frontend Audit: Cross-Page Consistency

> **Audit Date:** 2026-10-06T23:40:00+05:30  
> **Source Verification:** `artifacts/cadence/src/pages/` (All 12 route implementations)  
> **Audit Standard:** `docs/13-master-design-system-prompt.md` §P2, §P14, §P17  

---

## 1. Header & Navigation Consistency

Across all 12 page views, Cadence enforces a uniform top-level header structure:
- **Mobile Header:** Height pinned to 56px (`h-14`), with brand mark, active route title, and quick-action icon (`+` capture).
- **Desktop Sidebar:** Collapsible 240px navigation column with icon + label pairings, keyboard shortcut badges (`1` for Today, `2` for Inbox, etc.), and active route highlights (`bg-card`, `text-primary-text`).
- **Global Command Bar:** `Cmd+K` / `Ctrl+K` launches `CommandPalette` uniformly from any surface.
- **Global Quick Capture:** Pressing `N` triggers `QuickCaptureSheet` uniformly from any view.

---

## 2. Card Radii & Surface Depth Hierarchy

| Visual Role | Token / Utility | Target Surface | Consistency Evaluation |
|---|---|---|---|
| Level 1: Canvas | `bg-background` (`#000000` / `#F5F5F7`) | Entire viewport canvas | 100% consistent across all pages |
| Level 2: Primary Card | `bg-card` (`#1C1C1E` / `#FFFFFF`), `rounded-2xl` | Today cards, TaskRow, Settings sections | 100% consistent; legacy `rounded-3xl` retired |
| Level 3: Elevated Modal | `bg-elevated` (`#2C2C2E` / `#F2F2F7`), `rounded-2xl` | Quick capture, ritual dialogs, sheets | 100% consistent |
| Control Boundary | `border-border-control` (`#6E6E73`) | All inputs, checkboxes, and interactive edges | 100% consistent (WCAG 1.4.11 compliant) |

---

## 3. Empty & Error States Alignment (P17.2 & P17.3)

All 12 pages implement genuine, contextual state handling via `StateViews.tsx`:
1. **Today Page:** Displays "Nothing scheduled today" with two distinct actions ("Pick from backlog" or "Quick capture") rather than generic empty banners.
2. **Inbox Page:** Displays "All caught up" with zero motivational fluff (abiding by the energy-not-pretending rule).
3. **Calendar Page:** Displays hour slots cleanly when empty, inviting single-click time block creation.
4. **Memory Page:** Discloses "Nothing learned yet. Patterns appear after about two weeks of focus sessions."
5. **Error States:** Every query failure provides an inline retry trigger and preserves user inputs without wiping form state.
