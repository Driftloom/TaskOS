# Cadence — Personal Task & Time OS

Personal planner replacement: fast capture, calendar, focus timers, reminders you actually see, auto-reschedule that shows its work, and an agent that learns how you work.

> **Single-user now, multi-user-safe from day one** — every table is `user_id`-scoped with RLS (cheap now, painful to retrofit).

## Current status

Core slice is real (no mocks): auth + task CRUD + Today/Inbox + Calendar shell + Focus timer + PWA shell. Reminders, reschedule engine, agent/memory, Telegram, and analytics are not built yet.

- Module scorecard: [`VERIFICATION_REPORT.md`](./VERIFICATION_REPORT.md) (2026-09-11/12, zero-trust)
- Phase progress: [`PROGRESS.md`](./PROGRESS.md) · Build notes: [`AUDIT.md`](./AUDIT.md)
- Full spec: [`docs/`](./docs/) (01–04 + 05 portability + 06 audit prompt) — `spec/` mirrors 01–04 for audit tooling

## Stack

React + Vite + Tailwind + shadcn/ui (PWA) · Express 5 · Supabase Postgres + Drizzle (RLS via Clerk JWT) · Clerk auth · `pg_cron`/`pgvector` planned · Telegram bot for reminders

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
