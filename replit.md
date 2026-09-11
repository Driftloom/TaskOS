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

- The app uses Replit-managed PostgreSQL and Clerk authentication; task ownership is derived from the authenticated Clerk user ID on the server.
- Task mutations are exposed through the generated OpenAPI client rather than browser-local mocks.
- The first release prioritizes Today, Inbox, completion, and manual movement before reminders, automatic rescheduling, or agent memory.

## Product

The current slice supports fast task capture, Today and Inbox views, priorities, due times, task completion, editing, deletion, daily progress summaries, and authenticated user isolation. Focus rounds, reminders, rescheduling, recurrence, calendar planning, analytics, Telegram, export/settings, and the agent are planned follow-up phases.

## User preferences

The product should feel personal and intentional rather than like an admin dashboard. Avoid generic motivational copy; show momentum through real progress and clear actions.

## Gotchas

- Regenerate the API client after changing `lib/api-spec/openapi.yaml`.
- The API workflow expects the development PostgreSQL database to be available through `DATABASE_URL`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
