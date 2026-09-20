# Cadence — Responsive Design & Viewport Audit

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Responsive Design Specialist  
> **Target Viewports Tested:** Mobile (375px, 390px), Tablet (768px), Laptop (1024px), Large Desktop (1440px)  

---

## 1. Viewport Matrix & Breakpoint Audit

| Viewport Category | Width | Layout Reflow Behavior | Status | Critical Findings |
|---|---|---|---|---|
| **Compact Mobile (iPhone SE)** | `375px` | Sidebar hidden, bottom dock active, single-column main content | **Finding** | Dock items crowded (<42px wide); Month view grid cells squeezed to 47px |
| **Standard Mobile (iPhone 14/15)**| `390px` | Sidebar hidden, bottom dock active, single-column main content | **Finding** | Bottom dock lacks `env(safe-area-inset-bottom)` |
| **Tablet Portrait (iPad)** | `768px` | Sidebar hidden, bottom dock active, 2-column grids uncollapse | **Pass** | Clean card reflow |
| **Laptop / Desktop** | `1024px+` | Desktop sidebar (`w-60`) active, bottom dock hidden (`lg:hidden`) | **Pass** | Header breadcrumbs visible, smooth sidebar collapse |
| **Large Desktop (Studio Display)**| `1440px+` | Centered container (`max-w-5xl`), right-hand aside on Today page | **Pass** | Proportional margins, zero horizontal overflow |

---

## 2. Critical Responsive Findings

### [Finding UI-RSP-001] Missing iOS Safe Area Padding on Mobile Floating Dock
- **Location:** `artifacts/cadence/src/components/chrome/AppShell.tsx` Line 455
- **Evidence:**
  ```tsx
  <nav className="fixed inset-x-3 bottom-3 z-30 flex h-16 items-center justify-around rounded-2xl glass-chrome shadow-2xl p-1.5 lg:hidden">
  ```
- **Why it matters:** On modern bezel-less iPhones (iPhone X through iPhone 16), iOS renders a native home gesture indicator bar at the very bottom of the screen. A `bottom-3` (12px) offset causes the dock to overlap the home indicator bar. Users attempting to tap dock items frequently trigger app switching or home minimize gestures.
- **Remediation:** Apply dynamic safe-area insets: `bottom-[calc(0.75rem+env(safe-area-inset-bottom))]` or `pb-safe`.

### [Finding UI-RSP-002] Mobile Touch Breakdown on Calendar Drag-and-Drop
- **Location:** `artifacts/cadence/src/pages/calendar/CalendarPage.tsx` Lines 69–94
- **Evidence:** Time block placement is implemented via desktop HTML5 Drag-and-Drop:
  `<div onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropOnHour(hour, e)} ...>`
- **Why it matters:** Touch events (`touchstart`, `touchmove`, `touchend`) are not bound to these handlers. A mobile or tablet user cannot drag a task row into an hourly slot.
- **Remediation:** Provide a tap-to-schedule modal on mobile devices where tapping an hour slot opens an action sheet: *"Schedule task into [HH:00]"*.

### [Finding UI-RSP-003] Calendar Month View Compression on Small Viewports
- **Location:** `artifacts/cadence/src/pages/calendar/CalendarPage.tsx` Lines 335–373
- **Evidence:** In Month view, `<div className="grid grid-cols-7 gap-2">` forces 7 columns on all screen widths. On a 375px screen: `375px - 32px padding = 343px`. `343px - 12px gaps = 331px / 7 = 47.2px` per day cell.
- **Why it matters:** Inside each 47px cell, the UI renders the date number plus text `X tasks`. On 375px screens, "1 task" or "2 tasks" clips or wraps across 3 lines, breaking vertical row alignment.
- **Remediation:** On mobile viewports (`<sm`), render dot badges (e.g. 1–3 colored dots) instead of the text string `"X tasks"`.

### [Finding UI-RSP-004] Virtual Keyboard Collision in `TaskEditor.tsx` Bottom Sheet
- **Location:** `artifacts/cadence/src/components/task/TaskEditor.tsx` Line 147
- **Evidence:** `className="w-full sm:max-w-[540px] max-h-[92dvh] ..."`
- **Why it matters:** On mobile devices, opening the on-screen keyboard shrinks the visible viewport height by ~40–50% (~350px). With a fixed 5-row property grid and modal header, the action buttons ("Cancel", "Add to today") are pushed below the fold and obscured behind the keyboard without auto-scrolling to the active input.
- **Remediation:** Ensure `interactive-widget=resizes-content` is configured in `index.html` viewport meta, and give the inputs auto-scroll-into-view triggers when focused.
