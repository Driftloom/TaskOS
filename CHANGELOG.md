# Changelog

All notable changes to the Cadence (Personal Task & Time OS) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.5] - 2026-10-10

### Added
- **Monthly Goals Subsystem (Step 12)**:
  - Added Migration `0018_monthly_goals.sql` creating `monthly_goals` table with RLS and CHECK constraints, and `monthly_goal_snapshots` immutable ledger protected by PostgreSQL trigger (`prevent_snapshot_mutation`) rejecting all `UPDATE` and `DELETE` queries.
  - Implemented DST-safe half-open month windows `[start, end)` in user IANA timezone (`resolveMonthWindow`, `resolveDayWindow`) in `artifacts/api-server/src/lib/month-window.ts`.
  - Implemented 5 automated telemetry metrics computed purely from actual behavior: `focus_minutes`, `focus_sessions`, `focus_days`, `tasks_completed`, and `tasks_completed_on_time` (`computeGoalActual`, `computeBaselines`).
  - Added trailing 30d/90d baseline telemetry helper (`GET /api/goals/baselines`) grounding goal targets in reality.
  - Added Monthly Review ritual (`GET /api/goals/review`) and non-destructive carry-forward cloning (`POST /api/goals/{id}/carry`).
  - Added service-context cron endpoint `POST /internal/goals/close-month` with idempotency snapshot checks and `DISPATCH_SECRET` authentication.
  - Implemented Express 5 REST API router mounted at `/api/goals` with full `requireAuth` and RLS isolation.
  - Designed and mounted frontend UI: `GoalCard`, `GoalEditor`, `MonthlyReviewDialog`, and `GoalsPage` mounted at `/goals` with `Milestone` icon in `AppShell` and `CommandPalette`.
  - Added Playwright E2E spec (`monthly-goals.spec.ts`) validating end-to-end goal display, review modal, carry-forward, edited-target notices, and goal creation.
- **Dedicated Assistant Co-Pilot Surface (`/agent`) & Mobile Dock Realignment**:
  - Decoupled the conversational `AgentPanel` from the main `/today` page into its own dedicated co-pilot route `/agent` (`AgentPage.tsx`), restoring clean visual hierarchy on `/today` (NextUp hero card → Quick capture → Task rows → Activity Rings momentum).
  - Aligned mobile bottom dock with `docs/13-master-design-system-prompt.md §P16`: 5 slots configured as `Today · Calendar · [＋ Capture] · Agent · More` (resolving the prior temporary deviation where `/focus` occupied Slot 4).
  - Added accessible, token-compliant Assistant entry card and header quick-link on `/today` with tactile audio cues and full keyboard navigation.
  - Added return navigation to `/today` in `AgentPage` header (`link-agent-return-today`).
- **11-Gate Verification Ladder with Cron-Route Integrity**:
  - Added Gate 9 `verify:cron-routes` (`scripts/verify-cron-routes.cjs`) asserting every scheduled `pg_cron` URL maps to an active Express router endpoint.
- **A11y & Contrast Hardening**:
  - Fixed dark-theme `ai.text` on translucent `bg-ai/10` wash to `#9491FF`, resolving WCAG 1.4.3 compliance (4.84:1 contrast).
  - Extended contrast verification script (`scripts/verify-contrast.cjs`) with composited background testing across 99 color pairs (0 failures).

### Verified
- **11/11 Verification Ladder Green**: 11 labeled gates passed in 57.0s (`typecheck`, `tokens`, `lint:tokens`, `contrast`, `codegen`, `build:api`, `build:web`, `verify:no-dead-classes`, `verify:cron-routes`, `encoding`, `test`).
- **826 Vitest Tests Passing Across 59 Test Files**: 390 in api-server (30 files), 422 in cadence (27 files), 14 in db (2 files, 25 skipped local DB tests).
- **131 Playwright E2E Tests**: Across 17 spec files (100% green).
- **19 Applied Migrations**: Migrations `0000` through `0018` with zero checksum drift.

---

## [0.1.4] - 2026-10-09

### Added
- **Full-Text Task Search with GIN Indexing & Relevance Ranking**:
  - Added Migration `0017_tasks_archive_and_search.sql` generating a `tsvector` expression and PostgreSQL GIN index (`idx_tasks_search`) across task `title` and `notes`.
  - Added safe search query sanitation (`formatTsQuery`) stripping control syntax and formatting prefix matching tokens (`'token':* & ...`).
  - Added `search` query parameter support in `GET /tasks` with `to_tsquery` and `ts_rank` descending relevance sorting.
  - Wired live task search into the global `Cmd+K` Command Palette with highlighted result entries and direct navigation/selection.
- **Task Archival Lifecycle & `completed_at` Preservation**:
  - Expanded `TaskStatus` and `TaskUpdateStatus` schemas to include `'archived'`.
  - Added `scope=archived` filter support to `GET /tasks` ordered by update timestamp.
  - Implemented non-destructive task archival preserving existing completion metadata (`completed_at`).
  - Added dedicated Archived view in `InboxPage` with instant task restoration actions and confirmation flows in `TaskEditor`.
  - Tracked `task_archived` and `task_restored` in local activity history.
- **Rich Task Link Chips & SSRF-Safe URL Metadata Extraction**:
  - Implemented `TaskLinkChips` rendering interactive badges for URL and file attachments without intercepting row selection.
  - Added `POST /integrations/url-metadata` endpoint with strict SSRF filtering (`isPrivateOrForbiddenHost`), 3.5s timeout aborts, and 64KB body chunk limits.
  - Added automated title extraction supporting Open Graph (`og:title`) and HTML `<title>` tags with entity decoding.
- **End-to-End Test Suite Expansion**:
  - Added Playwright test suite (`task-search-and-archive.spec.ts`) validating search filtering, archival, restoration, and link chip workflows.

### Verified
- **10/10 Verification Gates Green**: `node scripts/run-gates.cjs` passing across all packages.
- **801 Vitest Unit & Contract Tests Passing**: 369 in api-server (27 files), 419 in cadence (26 files), 13 in db (2 files passed, 25 local destructive tests skipped).
- **118 Playwright E2E Tests**: Across 14 spec files (100% green).
- **18 Applied Migrations**: Migrations `0000` through `0017` with zero checksum drift.

---

## [0.1.3] - 2026-10-08

### Added
- **Security & SecretOps Isolation**:
  - Isolated Telegram bot credentials into a dedicated module (`telegram-credentials.ts`) preventing cross-service credential leakage.
  - Added secret sanitization (`sanitizeMemoryFacts`) on all memory endpoints with an automated regression barrier (`memory-leak.test.ts`).
  - Implemented in-app BYOK (Bring Your Own Key) credential storage with AES-256-GCM authenticated envelope encryption (`credential-crypto.ts`) and database migration `0016_llm_credentials.sql`.
  - Added robust multi-provider resolver (`providers.ts`) supporting Gemini, NVIDIA NIM, Groq, OpenRouter, LiteLLM gateway, and custom endpoints with whitespace/absent validation.
- **Dynamic Conversational Agent & Intent Engine**:
  - Implemented real-time dynamic context grounding (`engine.ts`) passing active tasks, time blocks, and user facts into LLM prompt contexts.
  - Built two-stage intent engine (`intent.ts`) with deterministic fallback ensuring task creation, queries, and conversational actions work reliably even when remote LLM APIs are offline.
  - Added disambiguation inquiry flow for minimal or underspecified user prompts.
- **Design System, Verification Ladder & Build Concurrency Lock**:
  - Enforced 10-gate verification ladder (`.github/workflows/ci.yml`, `scripts/run-gates.cjs`) including `verify:no-dead-classes`.
  - Implemented exclusive cross-process build lock (`scripts/lib/build-lock.cjs`) eliminating false failures from concurrent builds competing on `tsconfig.tsbuildinfo` and `dist/`.
  - Enforced full design-token scale emission testing in `build-tokens.cjs` (spacing, duration, easing, z-index).
  - Eliminated blanket `components/ui/**` lint exemptions in `lint-tokens.cjs`, achieving 0 debt across all 147 source files.
  - Fixed WCAG 2.2 SC 1.4.3/1.4.11 contrast failures in destructive toast notifications and calendar components.
  - Added mobile notch and keyboard insets across Settings, Profile, and Integrations views.
- **Production Automation Unblocked**:
  - Activated Infisical Secret Sync to Render (`cadence-render`), provisioning `DISPATCH_SECRET` on deployed API endpoints (`POST /api/internal/dispatch` returning HTTP 200).
  - Ratified decisions D-29 (P18-P32 design spec), D-30 (authenticated kill switch PUT endpoint), and D-31 (display1..4 bridge scale).

### Verified
- **10/10 Verification Gates Green**: `node scripts/run-gates.cjs` passing across all packages.
- **784 Vitest Unit & Contract Tests Passing**: 358 in api-server (25 files), 414 in cadence (23 files), 12 in db (2 files passed, 25 local destructive tests skipped).
- **116 Playwright E2E Tests**: Across 13 spec files (100% green).
- **Live Automation Heartbeat**: All 6 links of `verify-automation-chain.mjs` passing with `reminder_runs` incrementing live.

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
