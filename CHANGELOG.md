# Changelog

All notable changes to the Cadence (Personal Task & Time OS) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
