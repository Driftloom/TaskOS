# Cadence — Cross-Page UI Consistency Matrix

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Enterprise Design Auditor  
> **Scope:** Cross-application consistency evaluation across all 11 core frontend screens.  

---

## 1. Master Cross-Page UI Consistency Matrix

| Dimension | Today (`/today`) | Inbox (`/inbox`) | Focus (`/focus`) | Calendar (`/calendar`) | Review (`/review`) | Memory (`/memory`) | Onboarding (`/onboarding`) | Profile (`/profile`) | Settings (`/settings`) | Landing (`/`) | 404 (`*`) | Consistency Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Header / Eyebrow** | `SectionHeading` (No eyebrow) | `SectionHeading` (`Inbox · loose threads`) | `SectionHeading` (`Focus`) | `SectionHeading` (`Calendar`) | `SectionHeading` (`Review`) | Custom inline header | Step counter (`Step X of 3`) | `SectionHeading` (`Profile · account & rhythm`) | `SectionHeading` (`Preferences · your rules`) | Custom hero mark | Custom unstyled card | **Partial** (7 pages use SectionHeading, Memory/Onboarding deviate) |
| **Card Surface** | `.card-enterprise` (`#121214`) | `.card-enterprise` (`#121214`) | `.card-enterprise` (`#121214`) | `.card-enterprise` (`#121214`) | `.card-enterprise` (`#121214`) | `.card-enterprise` + custom cards | `#1C1C1E` (OLED Card) | `.card-hig` (`#1C1C1E`) | `#1C1C1E` (OLED Card) | `#1C1C1E` (OLED Card) | `Card` (White `#FFF`) | **Fragmented** (`#121214` vs `#1C1C1E` vs white 404) |
| **Card Corner Radius**| `rounded-xl` (12px) | `rounded-xl` (12px) | `rounded-2xl` (16px) | `rounded-xl` (12px) | `rounded-xl` (12px) | `rounded-xl` (12px) | `rounded-3xl` (24px) | `rounded-3xl` + `rounded-xl` | `rounded-3xl` (24px) | `rounded-3xl` (24px) | `rounded-xl` (12px) | **Inconsistent** (12px vs 16px vs 24px) |
| **Primary CTA Accent**| Energy Orange (`#FF9F0A`) | Energy Orange (`#FF9F0A`) | Energy Orange (`#FF9F0A`) | Scheduled Blue (`#0A84FF`) | Scheduled Blue & Green | AI Indigo (`#5E5CE6`) | Blue (`#0A84FF`) & Green | Energy Orange (`#FF9F0A`) | Energy Orange (`#FF9F0A`) | Energy Orange (`#FF9F0A`) | Red (`text-red-500`) | **Fragmented** (Orange vs Blue vs Green CTAs) |
| **High Priority Icon**| Flame 🔥 (`#FF9F0A`) | AlertTriangle ⚠️ (`#FF453A`) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | **CONFLICT** (Flame on Today, AlertTriangle on Inbox) |
| **Med Priority Icon** | CircleDot ⊙ (`#0A84FF`)| Flame 🔥 (`#FF9F0A`) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | **CONFLICT** (CircleDot on Today, Flame on Inbox) |
| **Low Priority Icon** | Minus − (`zinc-500`) | Circle ○ (`zinc-600`) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | **Inconsistent** (Minus vs Circle) |
| **Loading State** | `SkeletonList` | `SkeletonList` | Skeleton pulse div | `SkeletonList` | Dual card skeletons | None (instant local state) | None (instant local state) | None | Skeleton query | None | None | **Inconsistent** (4 pages use SkeletonList, others pulse or none) |
| **Empty State** | `EmptyState` | `EmptyState` (inbox) | CheckCircle2 icon box | Empty month cells | Dashed border card | Empty search box | N/A | N/A | N/A | N/A | N/A | **Inconsistent** (Dashed card vs StateViews) |
| **Error State** | `ErrorState` (Retry) | `ErrorState` (Retry) | Silent / inline | `ErrorState` (Retry) | `ErrorState` (Retry) | None | None | None | None | None | Raw error pre | **Partial** (Today/Inbox/Calendar/Review implement ErrorState) |
| **Duration Units** | `X min` | `X min` | `X min planned` | `X min` | `Xm` | N/A | N/A | `Xm` | N/A | N/A | N/A | **Inconsistent** ("min" vs "m") |
| **Button Geometry** | `rounded-lg` (8px) | `rounded-lg` (8px) | `rounded-lg` (8px) | `rounded-lg` (8px) | `rounded-lg` (8px) | `rounded-lg` (8px) | `rounded-xl` (12px) | `rounded-xl` (12px) | `rounded-xl` (12px) | `rounded-xl` (12px) | `rounded` (4px) | **Inconsistent** (8px on core vs 12px on settings) |

---

## 2. Inconsistency Analysis & Systemic Fractures

### Fracture 1: Card Surface Color Divergence (`#121214` vs `#1C1C1E`)
- In `TodayPage`, `InboxPage`, `FocusPage`, `CalendarPage`, and `ReviewPage`, cards use `.card-enterprise`, which hardcodes `background-color: #121214`.
- In `OnboardingPage`, `ProfilePage`, `SettingsPage`, and `LandingPage`, cards use `.card-hig` or `bg-[#1C1C1E]`.
- **Verdict:** Two distinct card background shades exist across the app without semantic distinction. `spec/design-system.md §2` specifies `#1C1C1E` as the single canonical dark-mode surface token (`--surface`).

### Fracture 2: Priority Semantics Inversion Between Today and Inbox
- On `TodayPage` (and `TaskRow`), High priority is Orange Flame (`#FF9F0A`) and Medium is Blue CircleDot (`#0A84FF`).
- On `InboxPage`, High priority is Red AlertTriangle (`#FF453A`) and Medium is Orange Flame (`#FF9F0A`).
- **Verdict:** Severe mental model collision. The user perceives an orange flame in Inbox as "Medium", but upon moving the task to Today, the exact same orange flame indicates "High" priority.

### Fracture 3: Primary Call-to-Action Color Disarray
- `spec/design-system.md §2` explicitly designates Energy Orange (`--accent-energy`: `#FF9F0A`) as the sole color for *"Primary CTAs, Start buttons, active timers, streaks"*.
- In `CalendarPage` and `OnboardingPage`, primary advance buttons use Blue (`#0A84FF`), which is reserved for `--scheduled` time blocks.
- In `OnboardingPage` Step 3 and `ReviewPage` Close Day, the primary completion button uses Green (`#30D158`), which is reserved for completions (`--success`).
- In `MemoryPage`, action buttons use Indigo (`#5E5CE6`), which is reserved for AI markers.
- **Verdict:** Primary button colors are chosen arbitrarily by page theme rather than maintaining uniform visual hierarchy across the application.
