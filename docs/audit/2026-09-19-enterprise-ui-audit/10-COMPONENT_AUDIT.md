# Cadence — Reusable Component Quality & Inventory Audit

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Component Engineer  
> **Methodology:** AST analysis of component imports, reuse counts, and prop interfaces.  

---

## 1. Custom Core Component Inventory

| Component Name | File Path | Primary Purpose | Props Interface | Reuse Count | Accessibility State | Status |
|---|---|---|---|---|---|---|
| **`AppShell`** | `components/chrome/AppShell.tsx` | Global layout shell, sidebar, header, mobile dock | `{ children: ReactNode }` | 1 (Root layout) | Finding (<44px dock hit targets, Volume icon) | **Pass with Findings** |
| **`CommandPalette`**| `components/chrome/CommandPalette.tsx` | Quick action and page navigation modal | `CommandPaletteProps` (7 callbacks) | 1 (Mounted in AppShell) | Pass (Full keyboard support via cmdk) | **Pass** |
| **`TaskRow`** | `components/task/TaskRow.tsx` | Interactive task row with Things 3 check, drag grip, priority badges | `TaskRowProps` (task, onEdit, onRefresh, onDragStart) | 2 (TodayPage, CalendarPage) | Finding (Check target 20px, action buttons 28px) | **Pass with Findings** |
| **`TaskEditor`** | `components/task/TaskEditor.tsx` | Full modal/sheet for task creation and editing | `TaskEditorProps` (task, defaultDate, onClose, onSaved) | 3 (Today, Inbox, Calendar) | **P1 Defect** (Ommits tags from payload; strips focus outline) | **Defect** |
| **`ActivityRings`** | `components/shared/ActivityRings.tsx` | Apple Fitness inspired momentum indicator | `ActivityRingsProps` (5 metrics + size) | 1 (TodayPage) | Pass (role="img", complete aria-label) | **Pass** |
| **`ProgressRing`** | `components/shared/ActivityRings.tsx` | Single circular progress ring | `ProgressRingProps` (completed, total) | 1 (ReviewPage) | Pass (role="img", complete aria-label) | **Pass** |
| **`SectionHeading`**| `components/shared/StateViews.tsx` | Consistent page title, eyebrow, detail, action container | `{ eyebrow, title, detail, action }` | 6 (Today, Inbox, Focus, Calendar, Review, Profile) | Pass (Semantic h1, clear hierarchy) | **Pass** |
| **`SkeletonList`** | `components/shared/StateViews.tsx` | Loading state placeholder | None | 3 (Today, Inbox, Calendar) | Pass (data-testid="loading-tasks") | **Pass** |
| **`EmptyState`** | `components/shared/StateViews.tsx` | Zero-task illustration and call to action | `{ inbox?: boolean, onAction?: () => void }` | 2 (Today, Inbox) | Pass (Clear iconography and copy) | **Pass** |
| **`ErrorState`** | `components/shared/StateViews.tsx` | API error message and retry button | `{ onRetry: () => void }` | 3 (Today, Inbox, Calendar) | Pass (data-testid="status-error") | **Pass** |
| **`RitualDialog`** | `components/rituals/RitualDialog.tsx` | Guided modal for Plan Day & Close Day | `RitualDialogProps` (type, tasks, callbacks) | 2 (TodayPage, ReviewPage) | **P0 Defect** (`useEffect` undeclared in import) | **Critical Defect** |

---

## 2. Shadcn / Radix UI Library Inventory & Dead Code Audit

The directory `artifacts/cadence/src/components/ui` contains **55 files**. An automated import scan reveals extreme component deadweight:

### Utilized Components (3 Files)
1. `sonner.tsx` — Used in `App.tsx` Line 8 (`<Toaster />`).
2. `tooltip.tsx` — Used in `App.tsx` Line 9 (`<TooltipProvider />`).
3. `card.tsx` — Used exclusively in `not-found.tsx` (`<Card>`, `<CardContent>`).

### Completely Unused Components (52 Dead Files)
The following 52 files are **never imported** anywhere in `src/pages` or `src/components`:
- `accordion.tsx`
- `alert-dialog.tsx`
- `alert.tsx`
- `aspect-ratio.tsx`
- `avatar.tsx`
- `badge.tsx`
- `breadcrumb.tsx`
- `button-group.tsx`
- `button.tsx` *(Dead: pages write custom buttons)*
- `calendar.tsx` *(Dead: CalendarPage writes custom date logic)*
- `carousel.tsx`
- `chart.tsx`
- `checkbox.tsx` *(Dead: TaskRow implements custom SVG check)*
- `collapsible.tsx`
- `command.tsx` *(Partially shadowed by cmdk)*
- `context-menu.tsx`
- `dialog.tsx` *(Dead: TaskEditor and RitualDialog use custom modals)*
- `drawer.tsx`
- `dropdown-menu.tsx`
- `empty.tsx` *(Dead: StateViews implements EmptyState)*
- `field.tsx`
- `form.tsx`
- `hover-card.tsx`
- `input-group.tsx`
- `input-otp.tsx`
- `input.tsx` *(Dead: all pages write raw `<input>`)*
- `item.tsx`
- `kbd.tsx` *(Dead: all pages write raw `<kbd>`)*
- `label.tsx` *(Dead: all pages write raw `<label>`)*
- `menubar.tsx`
- `navigation-menu.tsx`
- `pagination.tsx`
- `popover.tsx`
- `progress.tsx` *(Dead: FocusPage implements custom progress bar)*
- `radio-group.tsx`
- `resizable.tsx`
- `scroll-area.tsx`
- `select.tsx` *(Dead: Onboarding writes raw `<select>`)*
- `separator.tsx`
- `sheet.tsx`
- `sidebar.tsx` *(Dead: AppShell implements custom sidebar)*
- `skeleton.tsx` *(Dead: StateViews implements custom skeletons)*
- `slider.tsx`
- `spinner.tsx`
- `switch.tsx` *(Dead: pages write `<input type="checkbox">`)*
- `table.tsx`
- `tabs.tsx` *(Dead: Review/Calendar write custom pill tabs)*
- `textarea.tsx` *(Dead: TaskEditor writes raw `<textarea>`)*
- `toast.tsx` *(Dead: sonner is used)*
- `toaster.tsx` *(Dead: sonner is used)*
- `toggle-group.tsx`
- `toggle.tsx`

### Architectural Assessment
Maintaining 52 dead component files (totalling ~2,800 lines of unexercised code) creates:
1. Significant noise during code navigation and codebase indexing.
2. The false impression that a unified component system exists, when in reality pages duplicate raw primitives.
3. Divergent styling where one developer edits `src/components/ui/button.tsx` expecting it to affect buttons on Today or Focus, when those pages actually use `.btn-primary` or custom Tailwind classes.
