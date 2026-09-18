-- 0004_task_files.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive
-- only: creates task_files (links only — no storage vendor involved).
-- Safe on a database with 0001–0003 applied; fails loudly on re-run.
--
-- Semantics (mirrored in lib/db/src/schema/task-files.ts):
--   a. user_id DEFAULT (auth.jwt()->>'sub'); app code sets it explicitly.
--   b. task_id ON DELETE CASCADE: links die with their task, never block it.
--   c. CHECKs mirror the contract: http(s) URLs up to 2048 chars, optional
--      display names 1..120 chars.
--   d. RLS + per-user policies off the Clerk `sub` claim (never auth.uid()).
--   e. Grants for the `authenticated` role.

CREATE TABLE public.task_files (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  task_id INTEGER NOT NULL
    CONSTRAINT task_files_task_id_tasks_id_fk
    REFERENCES public.tasks (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_files_url_check
    CHECK (url ~ '^https?://' AND char_length(url) BETWEEN 1 AND 2048),
  CONSTRAINT task_files_name_check
    CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 120)
);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.task_files TO authenticated;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own task files select"
  ON public.task_files FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own task files insert"
  ON public.task_files FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own task files update"
  ON public.task_files FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own task files delete"
  ON public.task_files FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);
