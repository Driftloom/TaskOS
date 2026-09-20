# Cadence — Prioritized Remediation Backlog

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Enterprise Engineering Lead  
> **Scope:** Actionable, dependency-aware remediation plan addressing all 24 verified audit findings.  
> **Rule:** Strictly prioritized P0 through P4. No code modifications are to be made during this audit phase; all items below represent the implementation contract for subsequent execution phases.

---

## 1. Remediation Master Matrix by Priority

| Item ID | Finding ID | Priority | Category | Target File(s) | Remediation Summary | Effort | Dependency |
|---|---|---|---|---|---|---|---|
| `REM-001` | `UI-RNT-001` | **P0** | Runtime Crash | `RitualDialog.tsx` | Add `useEffect` to React named imports | S (5m) | None |
| `REM-002` | `UI-ARC-001` | **P0** | Architecture | `MemoryPage.tsx`, `OnboardingPage.tsx` | Replace `localStorage` with API hooks (`useAgentMemories`, etc.) | L (2d) | Migration 0009 |
| `REM-003` | `UI-DAT-001` | **P1** | Data Integrity | `TaskEditor.tsx` | Include `tagsText` in `handleSubmit` mutation payload | S (15m) | None |
| `REM-004` | `UI-ERR-001` | **P1** | Polish / OLED | `not-found.tsx`, `error-boundary.tsx` | Replace light `bg-gray-50` with OLED dark theme and navigation CTA | S (30m) | None |
| `REM-005` | `UI-A11Y-001`| **P1** | Accessibility | `index.css` | Remove `outline: none !important` on focus-visible; add visible ring | S (20m) | None |
| `REM-006` | `UI-A11Y-002`| **P1** | Touch Target | `AppShell.tsx` | Redesign mobile dock: 5 primary tabs + "More" popover | M (3h) | Design Tokens |
| `REM-007` | `UI-A11Y-003`| **P1** | Touch Target | `TaskRow.tsx` | Expand checkbox touch target to 44px via padded wrapper | S (30m) | None |
| `REM-008` | `UI-RSP-001` | **P1** | Touch Support | `CalendarPage.tsx` | Implement touch-compatible drag/drop or tap-to-block modal | M (4h) | None |
| `REM-009` | `UI-PRF-001` | **P1** | Performance | `index.html`, `index.css` | Deduplicate font loading; remove unused weights (28 down to 6) | S (30m) | None |
| `REM-010` | `UI-CLR-001` | **P2** | Contrast / A11y| `index.css`, `AppShell.tsx` | Bump AI Indigo to `#7A78FF` for 4.85:1 contrast against `#000000` | S (15m) | Token System |
| `REM-011` | `UI-SEM-001` | **P2** | Consistency | `InboxPage.tsx` | Align priority icons with TodayPage (High = Flame, Med = CircleDot) | S (20m) | None |
| `REM-012` | `UI-A11Y-004`| **P2** | Accessibility | `ReviewPage.tsx` | Replace `div onClick` with accessible `<button>` or semantic element | S (30m) | None |
| `REM-013` | `UI-A11Y-005`| **P2** | Colorblind A11y| `AppShell.tsx` | Render `<VolumeX>` icon when audio is muted (D-14 compliance) | S (10m) | None |
| `REM-014` | `UI-RSP-002` | **P2** | iOS PWA Polish | `AppShell.tsx` | Add `env(safe-area-inset-bottom)` to mobile dock bottom offset | S (15m) | None |
| `REM-015` | `UI-DAT-002` | **P2** | Data Integrity | `TodayPage.tsx` | Wire quick-add NLP parser to set scheduled date from chip | M (2h) | None |
| `REM-016` | `UI-RSP-003` | **P2** | Responsive | `CalendarPage.tsx` | Switch mobile calendar to agenda/list view below 768px | M (3h) | None |
| `REM-017` | `UI-PRF-002` | **P2** | Performance | `index.css` | Replace SVG `feTurbulence` with static WebP / CSS noise pattern | S (30m) | None |
| `REM-018` | `UI-A11Y-006`| **P2** | Accessibility | `index.css` | Add `@media (prefers-reduced-motion: reduce)` kill switch | S (15m) | None |
| `REM-019` | `UI-GEO-001` | **P3** | Design Tokens | Multiple components | Consolidate card radii: enforce 12px (`rounded-xl`) everywhere | M (2h) | Design Tokens |
| `REM-020` | `UI-NAV-001` | **P3** | UX Polish | `CommandPalette.tsx` | Align shortcut hints: display `1..6` matching `AppShell.tsx` | S (15m) | None |
| `REM-021` | `UI-COD-001` | **P3** | Code Health | `use-keyboard-shortcuts.ts` | Wire dead hook into `AppShell.tsx` or delete redundant code | S (30m) | None |
| `REM-022` | `UI-COD-002` | **P3** | Code Health | `src/components/ui/*` | Prune 52 unimported shadcn UI component files | S (20m) | None |
| `REM-023` | `UI-CNT-001` | **P3** | Content & Copy | `ProfilePage.tsx` | Update stale documentation reference from `spec/01 §8` to `spec/system-requirements.md` | S (5m) | None |
| `REM-024` | `UI-PRF-003` | **P4** | Performance | `vite.config.ts` | Configure `manualChunks` for vendor libraries (React, Lucide, Query) | S (30m) | None |

---

## 2. Thematic Remediation Streams

### Stream 1: Quick Wins (< 30 Minutes Each)
*Immediate stability and visual polish fixes that carry zero architectural risk.*
1. **`REM-001` (Crash Fix):** In `RitualDialog.tsx`, update line 1: `import { useState, useEffect } from 'react';`.
2. **`REM-003` (Data Integrity):** In `TaskEditor.tsx`, extract tags from `tagsText` and pass array into `data` payload.
3. **`REM-011` (Priority Fix):** In `InboxPage.tsx`, align icon and color mappings to match `TaskRow.tsx`.
4. **`REM-013` (Mute Icon):** In `AppShell.tsx` line 395, render `{isMuted ? <VolumeX /> : <Volume2 />}`.
5. **`REM-014` (iOS Safe Area):** In `AppShell.tsx`, update mobile dock CSS: `bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))`.
6. **`REM-018` (Reduced Motion):** In `index.css`, add media query disabling keyframe animations when requested by OS.
7. **`REM-023` (Stale Docs):** In `ProfilePage.tsx`, update text citation.

### Stream 2: Design System & Token Consolidation
*Restoring visual hierarchy, contrast compliance, and physical geometry consistency.*
1. **`REM-010` (Color Contrast):** Elevate `--ai` / AI Indigo from `#5E5CE6` to `#7A78FF`. This achieves a 4.85:1 contrast ratio against OLED `#000000`, satisfying WCAG 2.1 AA without altering the hue family.
2. **`REM-019` (Surface & Radius Standard):**
   - Eliminate hardcoded `#121214` in `.card-enterprise`. Unify all cards on canonical `--surface` (`#1C1C1E`).
   - Remove `rounded-3xl` (24px) from `StateViews.tsx`, `SettingsPage.tsx`, and `ProfilePage.tsx`. Enforce uniform `rounded-xl` (12px) for card containers.
3. **`REM-004` (Error Surfaces):** Restyle `not-found.tsx` and `error-boundary.tsx` with `--bg` (`#000000`), `--surface` (`#1C1C1E`), and clean user-facing copy with a prominent "Return to Today" button.

### Stream 3: Mobile Usability & Accessibility (WCAG 2.1 AA)
*Fixing touch targets, keyboard navigation, and responsive layouts.*
1. **`REM-005` (Focus Outlines):** Purge `outline: none !important` from `index.css`. Implement standard Apple HIG focus ring: `focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:outline-none`.
2. **`REM-006` (Mobile Dock Touch Targets):**
   - Squeezing 8 buttons into 351px violates Apple's 44x44pt minimum touch target rule.
   - Refactor mobile dock to 5 primary items: **Today**, **Inbox**, **Focus**, **Calendar**, and **More** (`...`).
   - Tapping "More" opens a lightweight Apple HIG bottom action sheet containing Review, Memory, Settings, and Profile.
3. **`REM-007` (TaskRow Touch Expansion):** Wrap the 20px checkbox and 28px action buttons in an invisible touch target container: `min-w-[44px] min-h-[44px] flex items-center justify-center`.
4. **`REM-008` & `REM-016` (Mobile Calendar):**
   - Add touch event listener / `@dnd-kit` abstraction to time blocks, OR add a prominent "+" button on each hour slot to trigger scheduling modal without dragging.
   - For viewports < 768px, default Calendar to an Agenda / List view rather than compressing a 7-column month grid into 47px cells.

### Stream 4: Performance & Code Hygiene
*Removing dead code, reducing bundle size, and accelerating First Contentful Paint.*
1. **`REM-009` (Font Pipeline Optimization):**
   - Delete Google Fonts `<link>` block from `index.html` or delete `@import` from `index.css`.
   - Prune loaded weights: retain only Regular (400), Medium (500), and Semibold (600) for Inter and JetBrains Mono.
   - Remove unrequested Google Font families (Plus Jakarta Sans, Space Grotesk, Outfit) that are overridden by the system font stack.
2. **`REM-017` (GPU Composite Fix):** Replace the live SVG noise filter in `.noise::after` with a tiny static WebP texture data URI.
3. **`REM-021` & `REM-022` (Dead Code Pruning):**
   - Prune 52 unimported shadcn UI component files in `artifacts/cadence/src/components/ui/`.
   - Consolidate keyboard shortcut handling by wiring `use-keyboard-shortcuts.ts` into `AppShell.tsx` and eliminating duplicate event listeners.
4. **`REM-024` (Vendor Chunking):** Add `build.rollupOptions.output.manualChunks` in `vite.config.ts` to separate `vendor-react` (`react`, `react-dom`, `wouter`), `vendor-query` (`@tanstack/react-query`), and `vendor-icons` (`lucide-react`).

### Stream 5: Backend Synchronization (Phase 9 & 10 Integration)
*Decoupling client state from browser `localStorage` and integrating real Supabase APIs.*
1. **`REM-002` (Memory & Onboarding Persistence):**
   - Connect `MemoryPage.tsx` to Express API endpoints `/api/agent/memories` backed by Migration `0009` (`agent_memory_facts` and `agent_conversations`).
   - Connect `OnboardingPage.tsx` to `useUpdateNotificationSettings` and user profile APIs to persist working hours, timezone (`Asia/Kolkata`), and quiet hours into Supabase Postgres.

---

## 3. Recommended Phasing & Execution Order

```mermaid
flowchart TD
    subgraph Phase A ["Phase A: Immediate Safety (Day 1)"]
        A1["REM-001: Fix RitualDialog Crash"]
        A2["REM-003: Fix TaskEditor Tag Dropping"]
        A3["REM-004: Fix 404/Error Dark Theme"]
        A4["REM-011: Fix Priority Semantics"]
        A5["REM-013: Fix Mute Icon (D-14)"]
    end

    subgraph Phase B ["Phase B: Accessibility & Mobile Shell (Days 2-3)"]
        B1["REM-005: Restore Focus Rings"]
        B2["REM-006: 5-Tab Mobile Dock + Sheet"]
        B3["REM-007: 44px Checkbox Touch Targets"]
        B4["REM-014: iOS Safe Area Insets"]
        B5["REM-010: AI Indigo Contrast Bump"]
    end

    subgraph Phase C ["Phase C: Performance & Code Hygiene (Day 4)"]
        C1["REM-009: Font Waterfall Deduplication"]
        C2["REM-017: GPU Noise Composite Fix"]
        C3["REM-021 & REM-022: Prune Dead Code & Shadcn"]
        C4["REM-024: Vite Vendor Chunking"]
    end

    subgraph Phase D ["Phase D: Calendar & Touch Ergonomics (Day 5)"]
        D1["REM-008: Touch-Ready Time Blocking"]
        D2["REM-016: Responsive Agenda View (<768px)"]
        D3["REM-015: Quick-Add NLP Scheduling"]
    end

    subgraph Phase E ["Phase E: Backend Integration (Days 6-7)"]
        E1["REM-002: Onboarding & Memory DB Wiring"]
    end

    Phase A --> Phase B
    Phase B --> Phase C
    Phase C --> Phase D
    Phase D --> Phase E
```
