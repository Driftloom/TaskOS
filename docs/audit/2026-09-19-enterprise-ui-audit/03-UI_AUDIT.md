# Cadence — Page-by-Page UI & Component Audit

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Enterprise UI Auditor  
> **Methodology:** Direct inspection of rendered structure, component trees, layouts, and interaction patterns.  

---

## 1. App Shell & Navigation Chrome (`AppShell.tsx`, `CommandPalette.tsx`)

### Layout & Visual Structure
- **Desktop Sidebar:** 240px width (`w-60`), fixed position, background `#0E0E10/95` with `backdrop-blur-2xl`. Collapses smoothly on `Cmd+\` or clicking the collapse control.
- **Header:** Sticky top bar (`h-14`), background `#000000/95` with `backdrop-blur-xl`. Clean breadcrumb display with live date indicator (`dateLabel()`).
- **Main Scroll Area:** `max-w-5xl` centered container with responsive padding (`px-4 sm:px-8 lg:px-10`).
- **Mobile Bottom Dock:** Fixed bottom floating glass bar (`glass-chrome`, `rounded-2xl`, `h-16`).

### Verified Findings
1. **[Finding UI-SHELL-001] Mobile Dock Squeezes 8 Navigation Items Below Minimum Hit Target**  
   - **Location:** `AppShell.tsx` Lines 454–481
   - **Evidence:** `navItems.map(...)` renders all 8 items (`/today`, `/inbox`, `/focus`, `/calendar`, `/review`, `/memory`, `/settings`, `/profile`) inside `flex h-16 items-center justify-around`. On a 375px viewport (iPhone SE / 12 mini), `375px - 24px padding = 351px`. Divided across 8 items, each button has a width of only **43.8px**, with internal padding reducing the interactive hit box further.
   - **Expected:** Apple HIG minimum touch target is **44×44px** (`spec/design-system.md §4`).
   - **Impact:** High mis-tap rate on mobile devices; cramped icon and 9px label layout.
2. **[Finding UI-SHELL-002] Color-Alone Status Communication on Header Audio Toggle**  
   - **Location:** `AppShell.tsx` Lines 386–399
   - **Evidence:** Line 16 imports `VolumeX`, but it is never rendered. Line 395 renders `<Volume2 size={14} className={soundEnabled ? 'text-[#30D158]' : 'text-zinc-400'} />`. When audio is muted, the icon remains `<Volume2>` with a grey color.
   - **Expected:** `spec/design-system.md §2` and `spec/locked-decisions.md D-14` state: *"Every status color must pair with a distinct icon/shape — color alone is never sufficient."* When muted, it must swap to `<VolumeX>`.
   - **Impact:** Fails accessibility guidelines for colorblind users; violates Cadence canonical design contract.
3. **[Finding UI-SHELL-003] Shortcut Documentation Contradicts Implementation**  
   - **Location:** `CommandPalette.tsx` Lines 168–194 vs. `AppShell.tsx` Lines 122–154
   - **Evidence:** `CommandPalette.tsx` advertises navigation shortcuts as `⌘1`, `⌘2`, `⌘3`, `⌘4`, `⌘5`, `⌘6`. However, `AppShell.tsx` line 125 explicitly exits if `e.metaKey || e.ctrlKey` is pressed! The actual working shortcuts are bare numbers `1`, `2`, `3`...
   - **Expected:** Consistent shortcut key combinations across display hints and event handlers.
   - **Impact:** Users following command palette hints cannot navigate using `Cmd+1..6`.

---

## 2. Today Page (`TodayPage.tsx`)

### Layout & Visual Structure
- **Two-Column Grid:** On `xl` breakpoints (`xl:grid-cols-[1fr_280px]`), the left column hosts the Quick-Add bar, filter bar, and task list. The right sidebar hosts the "Next Up" hero card and the Activity Rings momentum widget.
- **Natural Language Parsing (NLP) Preview:** Dynamic pill container showing detected priority (`!high`), time (`tomorrow 3pm`), and tags (`#eng`).

### Verified Findings
1. **[Finding UI-TODAY-001] NLP Time Detection Inconsistency (False Promise)**  
   - **Location:** `TodayPage.tsx` Lines 85–90, 115
   - **Evidence:** The real-time NLP preview extracts `timeMatch` (e.g. "tomorrow 3pm") and renders a blue chip *"Detected: tomorrow 3pm"*. However, in `submitCapture`, line 115 hardcodes `dueAt: new Date().toISOString()`! The detected time string is completely ignored.
   - **Expected:** When a user types a date/time in quick capture, either the detected date is parsed into `dueAt`/`dueText`, or the preview should not claim it was detected.
   - **Impact:** Misleads the user into believing an item was scheduled for tomorrow when it was actually scheduled for right now.
2. **[Finding UI-TODAY-002] Missing Evening Ritual Trigger on Today Page**  
   - **Location:** `TodayPage.tsx` Lines 155–165
   - **Evidence:** Today page header only exposes `<Sun className="size-3.5 text-primary" /> Plan Day` which sets `ritualType = 'morning'`. There is no button to initiate the "Close Day" evening ritual from Today.
   - **Expected:** Both daily rituals ("Plan My Day" and "Close My Day", `spec/system-requirements.md §2`) should be accessible from the daily view.
   - **Impact:** Asymmetric ritual access; users must navigate to `/review` to close their day.
3. **[Finding UI-TODAY-003] Arbitrary Filter Visibility Threshold**  
   - **Location:** `TodayPage.tsx` Line 239
   - **Evidence:** `{taskList.length > 2 && (` hides the search filter when the user has 1 or 2 tasks.
   - **Expected:** Consistent filter control or explicit documentation.

---

## 3. Inbox Page (`InboxPage.tsx`)

### Layout & Visual Structure
- **Single-Column Max-Width Container:** `max-w-3xl`, clean cards with duration pills, tags, relative capture dates, and a "Schedule for today" direct CTA.

### Verified Findings
1. **[Finding UI-INBOX-001] Priority Semantics Collision Between Inbox and Today**  
   - **Location:** `InboxPage.tsx` Lines 166–172 vs `TaskRow.tsx` Lines 191–207
   - **Evidence:**
     - In `TaskRow.tsx`: High priority is **Flame + `#FF9F0A` (Orange)**; Medium is **CircleDot + `#0A84FF` (Blue)**; Low is **Minus + `zinc-500`**.
     - In `InboxPage.tsx`: High priority is **AlertTriangle + `#FF453A` (Red)**; Medium is **Flame + `#FF9F0A` (Orange)**; Low is **Circle + `zinc-600`**.
   - **Expected:** Design system adherence (`spec/design-system.md §2`): Flame is exclusively Energy Orange (`--accent-energy`), while `AlertTriangle` is reserved for genuinely overdue or at-risk tasks (`--urgent`). Medium priority must not use the Flame icon.
   - **Impact:** High cognitive friction. A task marked Medium in Inbox appears as Orange Flame, which means High priority in Today and TaskEditor.
2. **[Finding UI-INBOX-002] Non-Standard CSS Classes (`py-0.2`)**  
   - **Location:** `InboxPage.tsx` Lines 184, 193
   - **Evidence:** `className="... px-1.5 py-0.2 rounded ..."`
   - **Expected:** Valid Tailwind spacing utilities (e.g. `py-0.5` or `py-[1px]`).
   - **Impact:** `py-0.2` is an unrecognized utility in Tailwind CSS and does not apply any vertical padding.

---

## 4. Focus Page (`FocusPage.tsx`)

### Layout & Visual Structure
- **Centered Focus Container:** `max-w-2xl` card with ambient radial gradient, large monospace timer readout (`formatTimer(elapsedSeconds)`), progress bar, and play/pause/finish action buttons.

### Verified Findings
1. **[Finding UI-FOCUS-001] Missing Full-Screen Mode & Round Progress Indicators**  
   - **Location:** `FocusPage.tsx` Lines 167–280
   - **Evidence:** The focus timer is rendered in a normal card inside the standard `AppShell` with headers and sidebar.
   - **Expected:** `spec/design-system.md §9` specifies: *"Focus Timer Display: Full-screen during active round. Shows: task title, elapsed/remaining time, round number, daily count."*
   - **Impact:** Peripheral visual distractions remain visible during deep focus rounds; missing round counter ("Round X of Y").
2. **[Finding UI-FOCUS-002] Target Stepper Buttons Violate Touch Targets**  
   - **Location:** `FocusPage.tsx` Lines 298, 314
   - **Evidence:** Daily target `-` and `+` buttons have `className="grid size-7 place-items-center..."` (28×28px).
   - **Expected:** Minimum 44×44px touch targets for mobile accessibility.
   - **Impact:** Hard to tap accurately on mobile touchscreens.

---

## 5. Calendar Page (`CalendarPage.tsx`)

### Layout & Visual Structure
- **Multi-View Engine:** Day, Week, and Month view toggle. Day view features hourly slots (6:00 to 22:00) with drag-and-drop targets for tasks.

### Verified Findings
1. **[Finding UI-CAL-001] HTML5 Drag-and-Drop Inoperable on Touch Devices**  
   - **Location:** `CalendarPage.tsx` Lines 69–94, 254–256
   - **Evidence:** Scheduling time blocks relies purely on HTML5 `onDragOver` and `onDrop`. Mobile browsers (iOS Mobile Safari, Android Chrome) do not trigger these desktop events on touch interaction.
   - **Expected:** Either touch drag polyfill or a fallback tap-to-schedule modal for touch viewports.
   - **Impact:** Time-blocking is completely impossible on mobile devices and tablets.
2. **[Finding UI-CAL-002] 24-Hour Working Rhythm Truncated in Calendar View**  
   - **Location:** `CalendarPage.tsx` Line 251
   - **Evidence:** `{Array.from({ length: 17 }, (_, index) => index + 6).map((hour) => (` hardcodes hours from 6:00 AM to 10:00 PM (17 hours).
   - **Expected:** `spec/locked-decisions.md D-02` settles 24-hour flexible rhythm (`00:00–23:59`).
   - **Impact:** Night owls or flexible schedules cannot place time blocks between 11:00 PM and 5:00 AM.
3. **[Finding UI-CAL-003] Block Delete Button Hit Target (`size-4`)**  
   - **Location:** `CalendarPage.tsx` Line 278
   - **Evidence:** Time block delete button `X` is `size-4` (16×16px).
   - **Expected:** Minimum 44×44px hit bounds.
   - **Impact:** Severe mis-tap hazard when attempting to delete time blocks.

---

## 6. Review Page (`ReviewPage.tsx`)

### Layout & Visual Structure
- **Ledger & Progress Overview:** Displays circular progress ring, total focus minutes, and completed tasks list. Below are two interactive guided ritual cards for Morning and Evening rituals.

### Verified Findings
1. **[Finding UI-REV-001] Non-Semantic Interactive Cards for Guided Rituals**  
   - **Location:** `ReviewPage.tsx` Lines 222–248, 251–280
   - **Evidence:** Morning Ritual and Evening Ritual cards are `<div onClick={...}>` elements with `cursor-pointer`.
   - **Expected:** Interactive cards must be semantic `<button>` elements or include `role="button"`, `tabIndex={0}`, and `onKeyDown` listeners for Enter/Space activation.
   - **Impact:** Completely inaccessible to screen reader and keyboard-only users.
2. **[Finding UI-REV-002] Archive Tab Does Not Request Date Range**  
   - **Location:** `ReviewPage.tsx` Lines 39–46
   - **Evidence:** When `viewScope === 'archive'`, `listParams` still passes `date: today()`, omitting any 7-day range parameters.
   - **Expected:** Archival views should pass a multi-day date range to fetch historical tasks.
   - **Impact:** Archive tab displays the same tasks as the Today tab.

---

## 7. Memory Page (`MemoryPage.tsx`)

### Layout & Visual Structure
- **Transparency Engine:** Divided into active memory facts, confidence badges, source tags (Behavioral vs Conversational), category filters, and a pending confirmation queue.

### Verified Findings
1. **[Finding UI-MEM-001] Memory Page Disconnected From Backend (Client Mock)**  
   - **Location:** `MemoryPage.tsx` Lines 46–113, 142–154, 180–191
   - **Evidence:** Hardcoded `INITIAL_FACTS` and `INITIAL_CONFIRMATIONS` are stored and modified strictly in `localStorage` under `'cadence_memory_facts'`. No API queries or mutations are invoked.
   - **Expected:** Integration with `/api/memory/facts` backed by Postgres `memory_facts` table (`spec/system-requirements.md §6 step 9`).
   - **Impact:** User edits, approvals, and deletions do not persist to the database or sync across devices.

---

## 8. Onboarding Page (`OnboardingPage.tsx`)

### Layout & Visual Structure
- **3-Step Stepper Flow:** Step 1 (Timezone & 24h Rhythm), Step 2 (Automation Dial & Cap), Step 3 (Telegram & Channels).

### Verified Findings
1. **[Finding UI-ONB-001] Onboarding Flow Disconnected From Backend (Client Mock)**  
   - **Location:** `OnboardingPage.tsx` Lines 56–78
   - **Evidence:** `handleComplete` bundles user choices into a plain JSON object and writes strictly to `localStorage.setItem('cadence_user_onboarding', ...)`. No API mutation is sent to `notification_settings` or `reschedule_settings`.
   - **Expected:** Calling backend settings endpoints so timezone, quiet hours, and Telegram ID are active in the database.
   - **Impact:** System cron jobs and dispatchers continue to use default unconfigured settings.

---

## 9. Profile Page (`ProfilePage.tsx`)

### Layout & Visual Structure
- **Identity & Ledger Hub:** Hero card with initials avatar and Clerk user ID, live IST clock, chronotype summary, lifetime stats, and JSON backup export button.

### Verified Findings
1. **[Finding UI-PROF-001] Hardcoded Active Channel Badges**  
   - **Location:** `ProfilePage.tsx` Lines 347–350, 367–369
   - **Evidence:** The Telegram card displays `<span className="size-1.5 rounded-full bg-[#30D158]" /> PRIMARY CHANNEL ACTIVE` unconditionally, even if the user has never paired Telegram.
   - **Expected:** Badge reflects real connection status from `/api/integrations/status`.
   - **Impact:** Misleading status representation.
2. **[Finding UI-PROF-002] Obsolete Specification Section Citation**  
   - **Location:** `ProfilePage.tsx` Line 403
   - **Evidence:** Text displays `"Built multi-user-safe from day one (spec/01 §8)"`.
   - **Expected:** References canonical specification filename `spec/system-requirements.md §4`.
   - **Impact:** Documentation drift in user-facing UI.

---

## 10. Settings Page & Messaging Integrations (`SettingsPage.tsx`, `MessagingIntegrationsView.tsx`)

### Layout & Visual Structure
- **Settings Dashboard:** Quick links to Memory and Onboarding, 24-hour rhythm toggle, focus target stepper, timezone text field, tactile audio toggle, and `MessagingIntegrationsView`.

### Verified Findings
1. **[Finding UI-SET-001] Timezone Input Field Has No Save Mechanism**  
   - **Location:** `SettingsPage.tsx` Lines 249–256
   - **Evidence:** An `<input value={localTz} onChange={...} />` is rendered with no save button, onBlur handler, or mutation trigger.
   - **Expected:** Explicit Save CTA or auto-saving mutation on blur.
   - **Impact:** Changing the timezone string in the input field does not persist anywhere.
2. **[Finding UI-SET-002] Extreme Component Monolith in `MessagingIntegrationsView.tsx`**  
   - **Location:** `MessagingIntegrationsView.tsx` (926 lines)
   - **Evidence:** Single component managing Telegram pairing, QR code polling, test nudges, Healthchecks ping tests, Web Push, and email fallback.
   - **Expected:** Modular separation into subcomponents (`TelegramSettingsCard`, `HealthchecksCard`, `QrPairingModal`).
   - **Impact:** High cognitive complexity and high regression risk during edits.

---

## 11. 404 & Error Fallback Pages (`not-found.tsx`, `error-boundary.tsx`)

### Verified Findings
1. **[Finding UI-ERR-001] Unstyled Light-Mode Leakage and Missing Escape Nav**  
   - **Location:** `not-found.tsx` Lines 6–18, `error-boundary.tsx` Lines 40–63
   - **Evidence:** Both files use `bg-gray-50`, `text-gray-900`, `text-gray-600`, and `text-red-500`.
   - **Expected:** Adherence to Cadence dark mode (`bg-background` `#000000`, `text-foreground` `#F5F5F7`).
   - **Impact:** Blinding white flash on OLED displays upon 404 or runtime error; exposes developer-facing text (`"Did you forget to add the page to the router?"`).
