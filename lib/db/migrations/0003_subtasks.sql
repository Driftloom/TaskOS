-- 0003_subtasks.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive
-- only: adds tasks.parent_id (self-reference). Safe on a database with
-- 0001 + 0002 applied; fails loudly if the column already exists.
--
-- Semantics (mirrored in lib/db/src/schema/tasks.ts):
--   a. parent_id NULL = top-level task.
--   b. ON DELETE RESTRICT: deleting a task with subtasks fails instead of
--      wiping them (same fail-loud philosophy as focus_sessions NO ACTION).
--      Clients delete or reparent children first.
--   c. CHECK forbids self-parenting. Deeper cycles are rejected app-side
--      (ancestor walk in PATCH /tasks/:id); RLS needs no change — subtasks
--      carry their own user_id under the existing 8 tasks policies.

ALTER TABLE public.tasks
  ADD COLUMN parent_id INTEGER
  CONSTRAINT tasks_parent_id_tasks_id_fk
  REFERENCES public.tasks (id) ON DELETE RESTRICT;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_parent_check
  CHECK (parent_id IS NULL OR parent_id != id);
