# Cadence

Cadence is a focused personal task and time OS for fast capture, clear daily planning, and momentum through focused work.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cadence` — React + Vite user-facing app.
- `artifacts/api-server` — Express API for task operations.
- `lib/api-spec/openapi.yaml` — source of truth for API contracts.
- `lib/db/src/schema/tasks.ts` — Drizzle task schema.
- `PROGRESS.md` and `AUDIT.md` — phase status and dated build notes.

## Architecture decisions
 
- The app uses Supabase PostgreSQL and Clerk authentication; task ownership is enforced at the database level via Row Level Security (RLS) policies keyed off `auth.jwt()->>'sub'`, injected per-request by `runWithRls(req, tx)`.
- Task and calendar mutations are exposed through the Express 5 API with generated OpenAPI client and Zod validation.
- All migrations 0001–0008 are applied to Supabase: tasks, focus sessions, projects/tags, subtasks, task files, time blocks, reminders/runs, focus settings, and auto-reschedule proposals/runs/settings.
- The system includes Activity Rings momentum tracking, Telegram webhook bot support, Memory transparency UI, Profile page with 24h rhythm configuration, and Guided Rituals modals.

## Product

The current system supports fast task capture, Today and Inbox views, priorities, due times, task completion, editing, deletion, calendar time-blocking (day grid + week/month ranges), focus sessions with Activity Rings momentum, sound effects cues, reminder dispatch with quiet hours, auto-reschedule engine (proposals/moves/flags), Telegram commands, memory transparency screen ("What Cadence Knows About Me"), profile with 24h work rhythm, and onboarding wizard. Next phases focus on the LiteLLM gateway, nightly batch memory extraction, RRULE recurrence engine, and production deployment hooks.

## User preferences

The product should feel personal and intentional rather than like an admin dashboard. Avoid generic motivational copy; show momentum through real progress and clear actions.

## Gotchas

- Regenerate the API client after changing `lib/api-spec/openapi.yaml`.
- The API workflow expects the development PostgreSQL database to be available through `DATABASE_URL`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
