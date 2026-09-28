-- 0011_tasks_completed_at.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive
-- only: a real completion timestamp on tasks. Safe on a database with
-- 0001–0010 applied; fails loudly on re-run.
--
-- Why (verified 2026-09-28, zero-trust audit):
--   Application code has read and written `tasks.completedAt` in three
--   places, but the column was never created by any migration:
--     - artifacts/api-server/src/lib/agent/tools.ts   (complete_task tool)
--     - artifacts/api-server/src/lib/agent/undo.ts    (undo_last_action)
--     - artifacts/api-server/src/routes/rituals.ts    (POST /rituals/close-day)
--   Those writes were silently dropped by Drizzle and those reads threw
--   Postgres 42703. Status alone ('completed') cannot answer "when did this
--   actually finish?", which is what the streaks, the close-day ritual and
--   the memory extractor all need. updated_at cannot substitute: it moves on
--   every edit, including reschedule moves that happen after completion.
--
-- Semantics (mirrored in lib/db/src/schema/tasks.ts):
--   completed_at TIMESTAMPTZ NULL. NULL for anything not completed.
--   Deliberately NOT NULL DEFAULT: there is no safe backfill value, and
--   inventing one would fabricate completion history for existing rows.
--   New completions set it explicitly (see routes/tasks.ts PATCH).
--
--   Invariant enforced here, because Postgres CHECKs cannot reference
--   other rows but CAN enforce column agreement:
--     status = 'completed'  => completed_at IS NOT NULL
--     status <> 'completed' => completed_at IS NULL
--   This makes it impossible for a task to claim completion without a
--   timestamp, or to keep a stale timestamp after being reopened. Any
--   existing row already sitting at status='completed' with no timestamp
--   must be backfilled BEFORE this migration runs; the constraint will
--   reject the ALTER if such rows exist. See the preflight query below.

-- ── Preflight (run first; must return zero rows) ──────────────────────────
-- SELECT id, title FROM public.tasks
--  WHERE status = 'completed' AND completed_at IS NULL;
--
-- If it returns rows, backfill with real timestamps you trust, e.g.:
-- UPDATE public.tasks SET completed_at = updated_at
--  WHERE status = 'completed' AND completed_at IS NULL;
-- (updated_at is the closest honest approximation available; it is better
--  than NULL and better than inventing now().)

ALTER TABLE public.tasks
  ADD COLUMN completed_at TIMESTAMPTZ;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_completed_at_check
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  );

-- Hot path: "what did I finish today/this week", and the streak query.
CREATE INDEX tasks_completed_at_idx ON public.tasks (user_id, completed_at DESC);

-- Backfill is intentionally NOT performed here — see the preflight note.
-- A task that is reopened (status -> 'open') must clear completed_at, and
-- that is enforced by the CHECK above plus the PATCH handler.
