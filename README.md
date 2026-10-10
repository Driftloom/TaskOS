# Cadence — Personal Task & Time OS

Personal planner replacement: fast capture, calendar, focus timers, reminders you actually see, auto-reschedule that shows its work, and an agent that learns how you work.

> **Single-user now, multi-user-safe from day one** — every table is `user_id`-scoped with RLS (cheap now, painful to retrofit).

## Current status

Core system is real and verified (no mocks):
- **Live Production Deployment:** Frontend live on Vercel (`https://cadence-task-os.vercel.app`), API live on Render (`https://cadence-task-os.onrender.com`), edge proxy rewrite active (`/api/*` -> Render).
- **Auth & Hardening:** Clerk auth (branded sign-in/up, landing, protected routes), Supabase Postgres target with `runWithRls` JWT claims enforcement (`auth.jwt()->>'sub'`), FK + CHECK constraints, CORS allowlist.
- **Data Engine:** Migrations `0000`–`0018` applied to Supabase (tasks, focus_sessions, projects, tags, subtasks, task_files, time_blocks, reminders, reminder_runs, notification_settings, automation_flags, focus_settings, reschedule_proposals, reschedule_runs, reschedule_settings, memory_facts, memory_semantic, rituals, telegram_pairing, rrule, llm_credentials, task_archive_and_search, monthly_goals). Express 5 API mounts 20 routers and 55+ handlers with RLS isolation. 830 Vitest unit & contract tests pass across 59 files (measured 2026-10-10 via `pnpm run test`); 131 Playwright E2E tests across 17 spec files (`pnpm exec playwright test --list`). 12-gate verification ladder runs on CI (`.github/workflows/ci.yml`).
- **Frontend Core:** Modularized architecture (`components/chrome`, `components/task`, `components/shared`, `pages/today`, `pages/inbox`, `pages/focus`, `pages/calendar`, `pages/review`, `pages/settings`, `pages/activity`, `pages/download`, `pages/onboarding`, `pages/profile`, `pages/memory`). Apple HIG dark mode tokens, Activity Rings momentum, Web Audio cues, global keyboard shortcuts (`N`, `Cmd+K`, `1..6`), PWA shell (manifest, service worker, offline fallback, background update notifier, standalone mode).

- Module scorecard: [`VERIFICATION_REPORT.md`](./VERIFICATION_REPORT.md) (zero-trust baseline)
- Phase progress: [`PROGRESS.md`](./PROGRESS.md) · Build notes: [`AUDIT.md`](./AUDIT.md)
- Full specs: [`docs/`](./docs/) (canonical specs mirrored in [`spec/`](./spec/))

## Stack

React + Vite + Tailwind + shadcn/ui (PWA) · Express 5 (`artifacts/api-server`) · Supabase Postgres + Drizzle ORM (RLS via Clerk JWT) · Clerk Auth · Telegram Bot API (reminders + webhook commands) · LiteLLM gateway (`pgvector` semantic + JSONB facts) · Healthchecks.io monitoring · Infisical SecretOps

See [`AGENTS.md`](./AGENTS.md) §3 for the full stack table and §5 for the design system (Apple HIG, Activity Rings, `#FF9500` energy accent).

## Quick start

```bash
pnpm install --frozen-lockfile   # pnpm only — enforced by preinstall guard
cp .env.example .env             # fill DATABASE_URL + Clerk + Supabase keys
pnpm run typecheck               # full typecheck (libs + artifacts + scripts)
pnpm run build                   # typecheck + build all packages

# dev (needs PORT + BASE_PATH + DATABASE_URL)
pnpm --filter @workspace/api-server run dev   # API on :5000 (requires PORT=5000, BASE_PATH=/, DATABASE_URL)
pnpm --filter @workspace/cadence run dev      # web app
```

After editing the API contract:
```bash
pnpm --filter @workspace/api-spec run codegen  # regenerates api-client-react + api-zod (Linux/Replit)
```

DB schema changes (dev only):
```bash
pnpm --filter @workspace/db run push           # requires DATABASE_URL
```

## Repo layout

```
artifacts/cadence        # React + Vite app (PWA)
artifacts/api-server     # Express API (esbuild bundle)
artifacts/mockup-sandbox # throwaway previews — don't import from it
lib/api-spec/openapi.yaml # source of truth for API contracts
lib/db/src/schema/       # Drizzle schema (tasks, focus_sessions, memory, etc.)
docs/                    # canonical documentation and specs
```

## Docs & Architecture

- **Documentation Hub:** [`docs/README.md`](./docs/README.md)
- **User Manual & Mobile Guide:** [`docs/cadence-user-manual-and-mobile-guide.md`](./docs/cadence-user-manual-and-mobile-guide.md) (iPhone PWA, Android PWA, APK setup, capture, focus, 9-rule reschedule dials, rituals, Telegram bot, memory)
- **End-to-End System & Architecture Guide:** [`docs/cadence-end-to-end-architecture-and-developer-guide.md`](./docs/cadence-end-to-end-architecture-and-developer-guide.md) (Diataxis architecture reference, RLS isolation, ER diagram, Express routers, 12-gate ladder, CLI deployment)
- **Current Architecture Snapshot:** [`docs/architecture/current-state.md`](./docs/architecture/current-state.md) (Evidence-backed `ln-22` architecture state)
- **Release, Infisical & CLI Deployment Guide:** [`docs/governance/release-and-secrets-operations.md`](./docs/governance/release-and-secrets-operations.md)
- **Changelog & Releases:** [`CHANGELOG.md`](./CHANGELOG.md) (v0.1.4 release notes & changelog history)


## For AI agents

Agent instructions live in [`AGENTS.md`](./AGENTS.md) — canonical for OpenCode (auto-read every session). Replit/Antigravity sessions should be pointed there manually. Don't duplicate that file's content here.

## License

MIT
