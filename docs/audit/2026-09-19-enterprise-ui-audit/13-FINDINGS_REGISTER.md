# Cadence — Master Findings Register

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Enterprise Quality Auditor  
> **Total Verified Findings:** 24  
> **Severity Breakdown:** P0: 2 | P1: 7 | P2: 9 | P3: 5 | P4: 1  

---

## 1. Master Findings Table

| ID | Severity | Category | Page / Surface | Component | Finding | Evidence | Impact | Confidence | Verification |
|---|---|---|---|---|---|---|---|---|---|
| `UI-RNT-001` | **P0** | Runtime Crash | `/today`, `/review` | `RitualDialog.tsx` | `useEffect` is used without import | Line 40 calls `useEffect`, Line 1 only imports `useState` | Throws `ReferenceError` when opening Plan/Close Day | High | Verified |
| `UI-ARC-001` | **P0** | Architecture | `/memory`, `/onboarding` | `MemoryPage`, `OnboardingPage` | Pages write to `localStorage` instead of backend API | `localStorage.setItem` used; zero API mutations called | User onboarding and memory edits lost on device switch | High | Verified |
| `UI-DAT-001` | **P1** | Data Integrity | `/today`, `/inbox` | `TaskEditor.tsx` | Tags typed in editor are omitted from save payload | `handleSubmit` (L93–108) omits `tagsText` from `data` | Users enter tags expecting persistence, but tags are silently dropped | High | Verified |
| `UI-A11Y-001`| **P1** | Accessibility | Global / Shell | `index.css` | Focus ring suppressed globally with `!important` | Lines 143–149: `.border-none:focus-visible { outline: none !important; }` | Keyboard users cannot see focus location in TaskEditor | High | Verified |
| `UI-A11Y-002`| **P1** | Accessibility | Global / Shell | `AppShell.tsx` | Mobile dock packs 8 items below 44px touch target | Line 455: 8 items in 351px width = 43.8px total width before padding | High mis-tap rate on mobile devices | High | Verified |
| `UI-A11Y-003`| **P1** | Accessibility | `/today`, `/calendar` | `TaskRow.tsx` | Checkbox (20px) and buttons (28px) violate Apple HIG | Lines 151, 235: `size-5` checkbox, `size-7` pencil/trash | Frequent mis-taps when completing or editing tasks | High | Verified |
| `UI-RSP-001` | **P1** | Responsive | `/calendar` | `CalendarPage.tsx` | Time block drag-and-drop completely broken on touch | Lines 69–94 rely on desktop HTML5 `onDragOver`/`onDrop` | Time blocking impossible on smartphones and tablets | High | Verified |
| `UI-ERR-001` | **P1** | UI Polish | Fallback 404 | `not-found.tsx` | 404 page renders light-theme with dev message and no exit link | Lines 6–18: `bg-gray-50`, `text-gray-900`, no navigation link | Blinding white flash on OLED; traps user on 404 screen | High | Verified |
| `UI-PRF-001` | **P1** | Performance | HTML / CSS Head | `index.html`, `index.css` | Duplicate font loading + 28 font weights block render | `index.html` link + `index.css` @import fetch identical 5 Google fonts | Adds 300–600ms network delay to First Contentful Paint | High | Verified |
| `UI-CLR-001` | **P2** | Color & Contrast | `/memory`, Global | `index.css`, `AppShell.tsx`| AI Indigo (`#5E5CE6`) fails WCAG AA normal text contrast | Luminance 0.155 on `#000000` = 4.10:1 ratio (fails 4.5:1 AA) | Low legibility for memory facts and AI badges | High | Verified |
| `UI-SEM-001` | **P2** | Consistency | `/inbox` vs `/today` | `InboxPage.tsx` | Priority icon and color semantics reversed | `InboxPage` uses AlertTriangle for High and Flame for Med | Severe cognitive confusion between pages | High | Verified |
| `UI-A11Y-004`| **P2** | Accessibility | `/review` | `ReviewPage.tsx` | Guided ritual cards are non-semantic `div onClick` | Lines 222, 251: `<div onClick={...}>` with no role or tabIndex | Screen reader and keyboard users cannot trigger rituals | High | Verified |
| `UI-A11Y-005`| **P2** | Accessibility | Global / Shell | `AppShell.tsx` | Mute toggle uses color alone to communicate status | Line 395: Renders `<Volume2>` when muted instead of `<VolumeX>` | Violates colorblind accessibility mandate (D-14) | High | Verified |
| `UI-RSP-002` | **P2** | Responsive | Global / Shell | `AppShell.tsx` | Floating dock lacks iOS home indicator safe area inset | Line 455: `bottom-3` without `env(safe-area-inset-bottom)` | Dock overlaps iPhone home gesture swipe bar | High | Verified |
| `UI-DAT-002` | **P2** | Data Integrity | `/today` | `TodayPage.tsx` | NLP preview detects tomorrow but saves task for today | Lines 85–90, 115: Chip says "Detected: tomorrow", saves today | Misleads user about when task is scheduled | High | Verified |
| `UI-RSP-003` | **P2** | Responsive | `/calendar` | `CalendarPage.tsx` | Month view 7-column grid clips on mobile viewports | Lines 335–373: 47px cell width forces "X tasks" text to wrap | Unreadable compressed calendar on 375px screens | High | Verified |
| `UI-PRF-002` | **P2** | Performance | Global Styles | `index.css` | Fixed SVG noise filter triggers GPU compositing lag | Lines 280–288: `.noise::after` with 4-octave `feTurbulence` | Dropped scroll frames on budget mobile devices | High | Verified |
| `UI-A11Y-006`| **P2** | Accessibility | Global Styles | `index.css` | Missing `prefers-reduced-motion` media query | Lines 259–278: Animations run continuously without pause | Distressing for users with vestibular disorders | High | Verified |
| `UI-GEO-001` | **P3** | Design Tokens | Multiple Pages | `StateViews`, `Landing`, etc.| Unsanctioned `rounded-3xl` (24px) violates 12px card radius | 24px radius used on ErrorState, Landing, and Settings cards | Visual geometry discordance with 12px standard | High | Verified |
| `UI-NAV-001` | **P3** | Interaction | Command Palette | `CommandPalette.tsx` | Shortcut hints (`⌘1`) contradict implementation (`1`) | Lines 168–194: Hints show `⌘1..6`, `AppShell` blocks metaKey | Confuses users attempting keyboard navigation | High | Verified |
| `UI-COD-001` | **P3** | Code Quality | Hooks | `use-keyboard-shortcuts.ts` | Complete keyboard hook exists as dead code | Hook is fully implemented but never imported anywhere | Duplicate maintenance burden and confusion | High | Verified |
| `UI-COD-002` | **P3** | Code Quality | UI Library | `src/components/ui/*` | 52 of 55 shadcn UI component files are dead code | Unused files (e.g. `button.tsx`, `dialog.tsx`, `switch.tsx`) | Bloats codebase by ~2,800 lines of dead code | High | Verified |
| `UI-CNT-001` | **P3** | Content & Copy | `/profile` | `ProfilePage.tsx` | Stale documentation citation `spec/01 §8` | Line 403 displays old section number | Minor documentation drift in UI | High | Verified |
| `UI-PRF-003` | **P4** | Performance | Build Tooling | `vite.config.ts` | Lack of vendor code splitting (`manualChunks`) | Single monolithic vendor chunk loaded on every page | Optimization opportunity for faster sub-page loading | Medium | Inferred |

---

## 2. Detailed Findings Register (Full Schema)

### Finding ID: `UI-RNT-001`
- **Category:** Runtime Crash
- **Severity:** P0 — Critical
- **Location:** Route: `/today` and `/review` | File: `artifacts/cadence/src/components/rituals/RitualDialog.tsx` Line 40
- **Evidence:** Line 1 imports only `useState` from `'react'`. Line 40 invokes `useEffect(() => { ... })`.
- **Expected:** `import { useState, useEffect } from 'react';`
- **Gap:** Identifier `useEffect` is undeclared in module scope.
- **Impact:** Any user clicking "Plan Day" or "Close Day" will crash the component tree with `ReferenceError: useEffect is not defined`.
- **Confidence:** High
- **Verification Status:** Verified

### Finding ID: `UI-ARC-001`
- **Category:** Frontend Architecture
- **Severity:** P0 — Critical
- **Location:** Routes: `/memory` and `/onboarding` | Files: `MemoryPage.tsx` L142–154, `OnboardingPage.tsx` L56–78
- **Evidence:** Both pages read and write state strictly to browser `localStorage` (`'cadence_memory_facts'` and `'cadence_user_onboarding'`). Neither page invokes API clients (`useUpdateNotificationSettings`, etc.).
- **Expected:** User onboarding choices and memory facts must be persisted to the Supabase Postgres database.
- **Gap:** Complete decoupling from the database layer.
- **Impact:** System automation, reschedule engines, and multi-device sessions remain unconfigured.
- **Confidence:** High
- **Verification Status:** Verified

### Finding ID: `UI-DAT-001`
- **Category:** Data Integrity
- **Severity:** P1 — High
- **Location:** Routes: `/today`, `/inbox`, `/calendar` | File: `artifacts/cadence/src/components/task/TaskEditor.tsx` Lines 93–108
- **Evidence:** Input maintains `tagsText` state (Line 62). However, in `handleSubmit` (Lines 93–108), the mutation payload omits any tag field.
- **Expected:** Tags should be split, matched against project tags, and passed in `tagIds` or `tags` payload.
- **Gap:** User tags typed into the editor are silently dropped.
- **Impact:** Silent data loss; users organize tasks by tags only to find them gone after saving.
- **Confidence:** High
- **Verification Status:** Verified

### Finding ID: `UI-A11Y-001`
- **Category:** Accessibility
- **Severity:** P1 — High
- **Location:** Global CSS | File: `artifacts/cadence/src/index.css` Lines 143–149
- **Evidence:** `input.border-none:focus-visible, .border-none:focus-visible { outline: none !important; box-shadow: none !important; }`
- **Expected:** Visible focus indicators on all interactive inputs (WCAG 2.4.7).
- **Gap:** Focus rings are actively suppressed with `!important`.
- **Impact:** Keyboard users navigating the Task Editor cannot identify the active input.
- **Confidence:** High
- **Verification Status:** Verified
