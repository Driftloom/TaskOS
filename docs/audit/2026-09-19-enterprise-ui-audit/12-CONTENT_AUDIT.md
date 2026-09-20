# Cadence — Content, Copy, & Terminology Consistency Audit

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal UX Writer & Enterprise Content Auditor  
> **Guiding Principle:** Energy-not-pretending rule (`spec/design-system.md §1`: No "You've got this!" copy; calm, clear, actionable truth).  

---

## 1. Terminology Consistency Matrix

| Concept | Primary Term | Alternate Observed Terms | File Locations | Verdict |
|---|---|---|---|---|
| **Unscheduled Item** | **Capture** | "Task", "Loose thread", "Unscheduled capture", "Item" | `TodayPage.tsx`, `InboxPage.tsx`, `StateViews.tsx` | **Inconsistent:** Both "Capture" and "Task" used interchangeably |
| **Active Focus Period**| **Focus Round** | "Round", "Session", "Focus block", "Timer" | `FocusPage.tsx`, `ActivityRings.tsx`, `SettingsPage.tsx` | **Minor Inconsistency:** Standardize on "Focus Round" |
| **Priority Level** | **High / Med / Low**| "high / med / low", "High / Medium / Low", "urgent" | `TaskRow.tsx`, `TaskEditor.tsx`, `InboxPage.tsx` | **Inconsistent:** Abbreviation vs full word vs urgent flag |
| **Duration Metric** | **min** | "min", "m", "mins", "minutes" | `TaskRow.tsx`, `FocusPage.tsx`, `ReviewPage.tsx` | **Inconsistent:** `TaskRow` uses "min", `ReviewPage` uses "m" |
| **Daily Shutdown** | **Close My Day** | "Close My Day", "Close Day", "Evening Ritual", "Review" | `ReviewPage.tsx`, `RitualDialog.tsx`, `AppShell.tsx` | **Minor Inconsistency:** Clarify ritual name vs page title |

---

## 2. Copy Tone & The Energy-Not-Pretending Rule

`spec/design-system.md §1` establishes the strict product copy rule:
> *"Every 'motivational' nudge must give the user real, actionable information or disappear. No 'You've got this!' copy. Prominent Start CTA on Next Up. Streaks show a count, not praise."*

### Tone Verification Across Screens

| Screen | Copy Observed | Evaluation | Status |
|---|---|---|---|
| **Today (Header)** | *"Make room for the day."* | Calm, direct, non-preachy | **Compliant** |
| **Today (Empty)** | *"Capture one deliberate thing to give the day a clear direction."* | Actionable, grounded | **Compliant** |
| **Today (Next Up)**| *"Start focus"* (Orange CTA button) | Energy-focused action | **Compliant** |
| **Inbox (Header)** | *"Give it a place."* / *"Unscheduled captures waiting for a deliberate decision."* | Respectful of user agency | **Compliant** |
| **Focus (Header)** | *"Your attention, here."* / *"Commit to one deliberate round. Real progress replaces anxious multitasking."*| Calm, direct truth | **Compliant** |
| **Review (Summary)**| *"You moved X tasks forward today. Real focus creates durable momentum."* | Verges slightly on motivational praise, but stays grounded in real metrics | **Acceptable** |
| **Review (Empty)** | *"Completed tasks will settle here as you finish them."* | Calm, non-judgmental | **Compliant** |
| **Profile (Streak)**| *"Strict, no freeze"* | Reinforces locked decision D-06 | **Compliant** |

---

## 3. Critical Content & Microcopy Defects

### [Defect CNT-001] Developer Error Message Exposed to End Users in 404
- **Location:** `artifacts/cadence/src/pages/not-found.tsx` Line 17
- **Observed Copy:** `"Did you forget to add the page to the router?"`
- **Expected Copy:** `"Page Not Found. The screen you are looking for does not exist or has moved."` with a primary button linking to `Return to Today`.
- **Impact:** Breaks user immersion; presents internal developer scaffolding in production.

### [Defect CNT-002] Developer Stack Information in Error Boundary
- **Location:** `artifacts/cadence/src/components/error-boundary.tsx` Lines 46–48
- **Observed Copy:** `"This part of the app hit an error. The rest of the app is still running."` with raw error preformatted block.
- **Expected Copy:** Standard user-friendly error copy: `"The workspace encountered an unexpected issue. Your data is safely saved in Supabase."` with a `Try again` button.

### [Defect CNT-003] False Promise in Quick-Capture NLP Chips
- **Location:** `artifacts/cadence/src/pages/today/TodayPage.tsx` Lines 217–225
- **Observed Copy:** Displays `"Detected: tomorrow 3pm"` in a blue tag, but the task is saved for today immediately.
- **Impact:** Destroys user trust when the user checks tomorrow's agenda and finds the task was logged under today instead.

### [Defect CNT-004] Stale Specification Reference in Profile Screen
- **Location:** `artifacts/cadence/src/pages/profile/ProfilePage.tsx` Line 403
- **Observed Copy:** `"(spec/01 §8)"`
- **Correction:** Reference canonical documentation `spec/system-requirements.md §4`.
