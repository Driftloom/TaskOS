# Cadence — Personal Task & Time OS

Personal planner replacement: fast capture, calendar, focus timers, reminders you actually see, auto-reschedule that shows its work, and an agent that learns how you work.

> **Single-user now, multi-user-safe from day one** — every table is `user_id`-scoped with RLS (cheap now, painful to retrofit).

## Current status

Core system is real and verified (no mocks):
- **Auth & Hardening:** Clerk auth (branded sign-in/up, landing, protected routes), Supabase Postgres target with `runWithRls` JWT claims enforcement (`auth.jwt()->>'sub'`), FK + CHECK constraints, CORS allowlist.
- **Data Engine:** Migrations `0001`–`0008` applied to Supabase (tasks, focus_sessions, projects, tags, subtasks, task_files, time_blocks, reminders, reminder_runs, notification_settings, automation_flags, focus_settings, reschedule_proposals, reschedule_runs, reschedule_settings). Express 5 API mounts 13 routers and 48+ handlers with RLS isolation. 86/86 Vitest suites pass.
- **Frontend Core:** Modularized architecture (`components/chrome`, `components/task`, `components/shared`, `pages/today`, `pages/inbox`, `pages/focus`, `pages/calendar`, `pages/review`, `pages/settings`, `pages/onboarding`, `pages/profile`, `pages/memory`). Apple HIG dark mode tokens, Activity Rings momentum, Web Audio cues, global keyboard shortcuts, PWA shell (manifest, service worker, offline fallback). 15/15 Playwright E2E tests pass (100% green).
- **Next build steps:** LiteLLM gateway with NVIDIA NIM primary, nightly batch memory extraction, RRULE recurrence engine, and production deployment hooks.

- Module scorecard: [`VERIFICATION_REPORT.md`](./VERIFICATION_REPORT.md) (zero-trust baseline)
- Phase progress: [`PROGRESS.md`](./PROGRESS.md) · Build notes: [`AUDIT.md`](./AUDIT.md)
- Full specs: [`docs/`](./docs/) (01–12 canonical specs mirrored in [`spec/`](./spec/))

## Stack

React + Vite + Tailwind + shadcn/ui (PWA) · Express 5 (`artifacts/api-server`) · Supabase Postgres + Drizzle ORM (RLS via Clerk JWT) · Clerk Auth · Telegram Bot API (reminders + webhook commands) · LiteLLM gateway (`pgvector` semantic + JSONB facts) · Healthchecks.io monitoring

See [`AGENTS.md`](./AGENTS.md) §3 for the full stack table and §5 for the design system (Apple HIG, Activity Rings, `#FF9500` energy accent).

## Quick start

```bash
pnpm install --frozen-lockfile   # pnpm only — enforced by preinstall guard
cp .env.example .env             # fill DATABASE_URL + Clerk + Supabase keys
pnpm run typecheck               # full typecheck (libs + artifacts + scripts)
pnpm run build                   # typecheck + build all packages

# dev (needs PORT + BASE_PATH + DATABASE_URL)
pnpm --filter @workspace/api-server run dev   # API on :5000
pnpm --filter @workspace/cadence run dev      # web app
```

After editing the API contract:
```bash
pnpm --filter @workspace/api-spec run codegen  # regenerates api-client-react + api-zod (Linux/Replit)
```

DB schema changes (dev only):
```bash
pnpm --filter @workspace/db run push           # requires DATABASE_URL
# 0001_supabase_rls_hardening.sql is owner-run in Supabase dashboard, not via drizzle-kit
```

## Repo layout

```
artifacts/cadence        # React + Vite app
artifacts/api-server     # Express API (esbuild bundle)
artifacts/mockup-sandbox # throwaway previews — don't import from it
lib/api-spec/openapi.yaml # source of truth for API contracts
lib/db/src/schema/       # Drizzle schema (tasks, focus_sessions)
docs/                    # canonical spec prose  ·  spec/ mirrors 01–04
```

## Docs & design

- Product/spec: `docs/01-idea-research-and-spec.md`
- Build plan: `docs/02-implementation-plan.md`
- Replit ↔ OpenCode portability: `docs/05-replit-opencode-antigravity-migration-guide.md`
- Design system: `docs/03-master-build-prompt-for-replit.md` §2 (Apple HIG — Clarity/Deference/Depth, dark-mode-default, 8px grid, 44px tap targets)

## For AI agents

Agent instructions live in [`AGENTS.md`](./AGENTS.md) — canonical for OpenCode (auto-read every session). Replit/Antigravity sessions should be pointed there manually. Don't duplicate that file's content here.

## License

MIT
