-- 0005_time_blocks.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive
-- only: creates time_blocks. Safe on a database with 0001–0004 applied;
-- fails loudly on re-run.
--
-- Semantics (mirrored in lib/db/src/schema/time-blocks.ts):
--   a. user_id DEFAULT (auth.jwt()->>'sub'); app code sets it explicitly.
--   b. task_id ON DELETE CASCADE: blocks die with their task, never block it.
--   c. CHECK end_at > start_at. Overlap is rejected app-side (same txn).
--   d. RLS + per-user policies off the Clerk `sub` claim (never auth.uid()).
--   e. Grants for the `authenticated` role.

CREATE TABLE public.time_blocks (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  task_id INTEGER NOT NULL
    CONSTRAINT time_blocks_task_id_tasks_id_fk
    REFERENCES public.tasks (id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT time_blocks_range_check CHECK (end_at > start_at)
);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.time_blocks TO authenticated;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own time blocks select"
  ON public.time_blocks FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own time blocks insert"
  ON public.time_blocks FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own time blocks update"
  ON public.time_blocks FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own time blocks delete"
  ON public.time_blocks FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);
