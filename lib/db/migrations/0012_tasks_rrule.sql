-- 0012_tasks_rrule.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive
-- only. Safe on a database with 0001–0011 applied; fails loudly on re-run.
--
-- Why (verified 2026-09-28, zero-trust audit):
--   POST /api/tasks/recurring accepted an `rrule` and expanded it into real
--   task rows, but the rule itself was thrown away — no column stored it.
--   The nightly sweep POST /internal/recurrence-materialize therefore had no
--   way to know which tasks were recurring, so
--   lib/recurrence.ts materializeAllUsersRecurrence() returned
--   `{ created: 0 }` for every user, forever, while reporting success. That
--   is exactly the "silent fake" this repo's rules forbid: a green nightly job
--   that materializes nothing.
--
-- Semantics (mirrored in lib/db/src/schema/tasks.ts):
--   rrule TEXT NULL, e.g. 'FREQ=DAILY' or 'FREQ=WEEKLY;BYDAY=MO,WE,FR'.
--   NULL means "not recurring" — every ordinary task, and every occurrence
--   already materialized, stays NULL. The sweep reads this column to find
--   templates; generated occurrences are themselves NULL so they do not
--   recursively spawn more occurrences.

ALTER TABLE public.tasks ADD COLUMN rrule TEXT;

-- The sweep's only query: distinct recurring templates across all users.
CREATE INDEX tasks_rrule_idx ON public.tasks (rrule) WHERE rrule IS NOT NULL;

-- The generated instances inherit priority/duration/project from the
-- template, so the sweep can select them without a second lookup.
CREATE INDEX tasks_recurring_template_idx
  ON public.tasks (user_id, title, rrule)
  WHERE rrule IS NOT NULL;

-- No backfill: existing rows predate stored rules and were created by
-- one-shot POST /tasks/recurring calls, which already expanded their window
-- in full. Marking them recurring now would duplicate 60 days of work.
