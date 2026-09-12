-- 0001_supabase_rls_hardening.sql
--
-- Run ONCE against the Supabase project, as the database owner
-- (Supabase SQL editor uses owner rights by default). Do NOT run with the
-- anon/authenticated keys -- enabling RLS and creating policies requires
-- owner privileges.
--
-- Preconditions (dashboard, before running this file):
--   1. Clerk Dashboard -> Supabase integration -> Activated; Clerk domain
--      copied into Supabase Auth -> Third-Party Auth -> Clerk provider.
--   2. Extensions enabled: pgvector (+ pg_cron/pg_net via dashboard).
--
-- What this does:
--   a. Replaces the legacy user_id DEFAULT 'demo-user' with
--      (auth.jwt()->>'sub') so owner-context inserts still scope correctly.
--   b. Adds the missing FK focus_sessions.task_id -> tasks.id (NO ACTION:
--      deleting a task with logged focus fails loudly, no silent wipe).
--   c. Adds DB-level CHECKs mirroring the Zod/OpenAPI enums.
--   d. Enables RLS + per-user policies keyed off the Clerk `sub` claim.
--   e. Grants the `authenticated` role exactly the privileges it needs
--      (without these, RLS passes but every query gets permission denied).
--
-- Rollback: keep the Replit PG dump taken at cutover; decommission only
-- after the two-account live test passes on Supabase (see AUDIT.md).

-- ---------------------------------------------------------------------------
-- 0. Pre-flight: these must return zero rows before sections (b)/(c) run.
-- ---------------------------------------------------------------------------
-- Orphan focus sessions with no parent task:
--   SELECT fs.id, fs.task_id FROM focus_sessions fs
--   LEFT JOIN tasks t ON t.id = fs.task_id WHERE t.id IS NULL;
-- Out-of-enum values:
--   SELECT id, priority, status FROM tasks
--   WHERE priority NOT IN ('low','medium','high')
--      OR status NOT IN ('inbox','open','completed');
--   SELECT id, status FROM focus_sessions
--   WHERE status NOT IN ('active','paused','completed','canceled');

-- ---------------------------------------------------------------------------
-- (a) user_id default -> Clerk sub claim
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks
  ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE public.tasks
  ALTER COLUMN user_id SET DEFAULT ((auth.jwt() ->> 'sub'));

-- ---------------------------------------------------------------------------
-- (b) FK + CHECK constraints (names match the Drizzle schema definitions)
-- ---------------------------------------------------------------------------
ALTER TABLE public.focus_sessions
  ADD CONSTRAINT focus_sessions_task_id_tasks_id_fk
  FOREIGN KEY (task_id) REFERENCES public.tasks (id);

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('low', 'medium', 'high')),
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('inbox', 'open', 'completed'));

ALTER TABLE public.focus_sessions
  ADD CONSTRAINT focus_sessions_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'canceled'));

-- ---------------------------------------------------------------------------
-- (c) Grants for the authenticated role (Clerk users land here via the
--     native third-party-auth integration, which stamps role=authenticated)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.tasks, public.focus_sessions TO authenticated;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- (d) RLS + policies (Clerk user id = auth.jwt()->>'sub'; there is no
--     Supabase auth.users row, so auth.uid() must NOT be used here)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own tasks select"
  ON public.tasks FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own tasks insert"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own tasks update"
  ON public.tasks FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own tasks delete"
  ON public.tasks FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own focus sessions select"
  ON public.focus_sessions FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own focus sessions insert"
  ON public.focus_sessions FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own focus sessions update"
  ON public.focus_sessions FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own focus sessions delete"
  ON public.focus_sessions FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);
