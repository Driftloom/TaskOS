# Changelog

All notable changes to the Cadence (Personal Task & Time OS) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.2] - 2026-10-07

### Added
- **Dynamic Clerk Boundary & Cold Load Optimization**:
  - Moved Clerk authentication behind an optimistic public router boundary; public routes (`/`, `/download`, `/__design`) render instantly without loading Clerk on first visit.
  - Successfully met all 5 Web Vitals bundle budgets (0 breaching) with first-visit JS at 199.99 kB gzip.
- **Session Persistence & Route Resumption Architecture**:
  - Eliminated auth hydration race in `HomeRedirect` with an explicit loading screen gate.
  - Added route resumption (`cadence_last_path`) that automatically restores the user's active page on app reopen.
  - Documented Clerk production custom domain CNAME strategy in Chapter 18 of the User Manual to ensure first-party cookie survival across mobile process terminations.
- **Safe Area Insets & Responsive Viewports**:
  - Added hardware notch clearance (`pt-safe`) to the sticky header.
  - Added dynamic floating dock clearance (`.pb-dock-clearance` and `.pb-dock-clearance-with-chip`) with desktop media query reset.
  - Removed redundant nested padding across `ActivityPage`, `ProfilePage`, `SettingsPage`, and `MemoryPage`.
  - Added narrow-viewport (320px) calendar navigation wrap and accessible search clear controls in Inbox.
- **Design System Catalog (`/__design`) & Zero-Baseline Token Hygiene**:
  - Mounted standalone Design System Catalog showcasing color palette, typography hierarchy, Activity Rings, density controls, and 44px tap target verification.
  - Eliminated all legacy token infractions; `lint-tokens.cjs --no-baseline` reports 0 violations.
- **Zero-Data-Loss Activity Command Center (`/activity`)**:
  - Dual-tier durable activity logging with offline queuing, multi-type filtering, and JSON/CSV export.
- **Enterprise Product Tour & Notification Primacy**:
  - First-run interactive product tour (`FirstRunTourModal`) with value-first notification primer and in-context permission reminders.

### Verified
- **9/9 Verification Gates Green**: `pnpm run verify` passing across all packages.
- **100/100 Playwright E2E Tests Green**: Desktop Chromium passing all automated accessibility, keyboard, navigation, tap-target, and task lifecycle suites.
- **641 Vitest Tests Passing**: 414 in cadence, 215 in api-server, 12 in db.

## [0.1.1] - 2026-10-04

### Added
- **First-Class Assistant / Agent Surface (`/agent`)**:
  - Implemented dedicated conversational interface (`AgentPage.tsx`) mounting `AgentPanel` with active task context.
  - Added real-time LLM telemetry cards (trust boundary statement, monthly token ceiling quota meter, single-tap reversibility guarantee).
- **First-Class Projects & Lists Management (`/projects`)**:
  - Implemented full project management interface (`ProjectsPage.tsx`) with color accents and per-project task view.
  - Project CRUD (create, edit, delete with confirmation) and per-project task filtering (open, completed, all).
- **Navigation & Routing Integration**:
  - Mounted `/agent` and `/projects` in `App.tsx` with code-split lazy loading.
  - Added direct navigation links in `AppShell.tsx` (secondary navigation & mobile More bottom sheet) and `CommandPalette.tsx`.
- **Master Verification Matrix**:
  - Aligned Module Scorecard in `spec/master-verification-matrix.md` to reflect audited code status (Auth & Onboarding 4/5, Agent & Memory 4/5, Recurrence & Rituals 4/5, Projects 4/5, Settings 4/5).
  - Measured 609 passing Vitest tests across 36 files.

## [0.1.0] - 2026-10-03

### Initial Production Baseline Release (M0)

#### Added
- **Authentication & Multi-Tenant Isolation**:
  - Managed Clerk authentication integration with branded sign-in, sign-up, and landing routes.
  - Per-request database security via `runWithRls` transaction wrapper pinning Clerk JWT claims (`auth.jwt()->>'sub'`).
  - Strict Foreign Key (FK) constraints, CHECK constraints, and CORS allowlist enforcement.
- **Data Engine & Migrations**:
  - Migrations `0000` through `0015` fully applied with zero checksum drift.
  - Complete schema for tasks, focus sessions, projects, tags, subtasks, task files, time blocks, reminders, reminder runs, notification settings, automation flags, focus settings, reschedule proposals, reschedule runs, reschedule settings, agent memory, and recurrence rules (RRULE).
  - 32 database invariant tests passing with 20 schema invariants green.
- **Frontend Core & Design System**:
  - Modularized component architecture (`components/chrome`, `components/task`, `components/shared`, `pages/today`, `pages/inbox`, `pages/focus`, `pages/calendar`, `pages/review`, `pages/settings`, `pages/onboarding`, `pages/profile`, `pages/memory`).
  - Apple Human Interface Guidelines (HIG) aesthetic with OLED `#000000` dark mode tokens and Activity Rings momentum tracker.
  - Web Audio synthesizer cue chimes (`C5-E5-G5`), focus bell, and tactile clicks.
  - Global keyboard shortcuts (`N`, `Cmd+K`, `1`..`6`).
  - Full-screen PWA shell (`manifest.webmanifest`, service worker, offline fallback, maskable icons) with automatic in-app update notification toasts (`PwaUpdateNotifier`) and mobile push event handlers.
- **Background Automation & Scheduling**:
  - `pg_cron` jobs wired for reminder dispatch (every 5m), auto-reschedule sweep (hourly), nightly memory extraction, and recurrence materialization.
  - Rule 9 duration multiplier integration with memory facts before rescheduling.
- **SecretOps & Deployment**:
  - Infisical Secret Manager integration for zero-trust secret management without commiting credentials to Git.
  - Direct CLI deployment workflow for Vercel (`vercel deploy --prod`) and Render (Deploy Hooks) with zero GitHub push dependency.
  - Standalone PWA installation and native Android APK generation via PWABuilder.
  - Long-lived persistent session configuration preventing logout when closing the mobile app.
