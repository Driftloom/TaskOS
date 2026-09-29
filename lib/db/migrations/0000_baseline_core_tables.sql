-- 0000_baseline_core_tables.sql
--
-- Run ONCE against the Supabase project, as the database owner.
--
-- WHY THIS FILE EXISTS (verified 2026-09-28, zero-trust audit):
--   The migration history had a hole at its foundation. `lib/db/migrations/`
--   held 0001..0013, and every table in the schema was created by one of them
--   EXCEPT `tasks` and `focus_sessions`:
--     - 0001 does `ALTER TABLE public.tasks ...` and
--       `ALTER TABLE public.focus_sessions ...`
--     - but nothing in 0001..0013 ever ran `CREATE TABLE` for either one.
--   Those two tables had only ever been created out-of-band by
--   `drizzle-kit push`, which AGENTS.md itself documents as the dev-only path.
--
--   Consequences, all verified by running the runner against an empty database:
--     1. A fresh database could never be bootstrapped. `pnpm db:migrate` failed
--        at 0001 with `relation "public.tasks" does not exist`, rolled back,
--        and left nothing behind.
--     2. No new environment was reproducible: CI, a new machine, or disaster
--        recovery all depended on someone re-running drizzle-kit push by hand.
--     3. The applied-history of the live database was unverifiable, because the
--        only record of how the schema got there was a dev-only tool.
--
--   This file closes the hole. It creates the two base tables with exactly the
--   columns and constraints that 0001 expects to find, so 0001 and every later
--   migration then apply cleanly, in order, on an empty database.
--
-- Column provenance (each later column is added by its own migration, so this
-- baseline stays minimal and 0001+ remain meaningful):
--   created here:        id, user_id, title, notes, due_at, duration_min,
--                        priority, status, created_at, updated_at
--   added by 0002:       tasks.project_id
--   added by 0003:       tasks.parent_id
--   added by 0008:       tasks.reschedule_count, needs_attention, automation
--   added by 0011:       tasks.completed_at
--   added by 0012:       tasks.rrule
--   focus_sessions is complete here; no later migration alters its columns.
--
-- NOT user_id DEFAULT: 0001 sets `DEFAULT ((auth.jwt() ->> 'sub'))` itself.
-- This baseline deliberately leaves user_id without a default so the value must
-- be supplied explicitly on insert, matching the Drizzle schema comment in
-- lib/db/src/schema/tasks.ts.

CREATE TABLE public.tasks (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMPTZ,
  duration_min INTEGER NOT NULL DEFAULT 30,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.focus_sessions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id INTEGER NOT NULL,
  planned_minutes INTEGER NOT NULL DEFAULT 25,
  elapsed_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tasks_created_at_idx ON public.tasks (created_at DESC);
CREATE INDEX focus_sessions_task_idx ON public.focus_sessions (task_id);
