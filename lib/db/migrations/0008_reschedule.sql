-- 0008_reschedule.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive
-- only: reschedule engine state. Safe on a database with 0001–0007 applied;
-- fails loudly on re-run.
--
-- Semantics (mirrored in lib/db/src/schema/{tasks,reschedule}.ts):
--   a. tasks gains reschedule_count (auto-moves only), needs_attention
--      (the "needs attention" flag), automation (per-task dial override,
--      NULL inherits the user's reschedule_settings.default_mode).
--   b. reschedule_proposals: ask-mode proposals, CASCADE with the task.
--   c. reschedule_runs: watchdog log, RLS enabled with NO policies
--      (owner-only, like reminder_runs).
--   d. reschedule_settings: per-user dial default ('ask') + cap (3).
--   e. Hot-path index tasks(status, due_at) for the sweep query.
--   f. RLS + per-user policies (never auth.uid()); grants for
--      `authenticated` (reschedule_runs: none).

ALTER TABLE public.tasks
  ADD COLUMN reschedule_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN needs_attention BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN automation TEXT;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_automation_check
  CHECK (automation IS NULL OR automation IN ('off', 'ask', 'auto'));

CREATE INDEX tasks_overdue_idx ON public.tasks (status, due_at);

CREATE TABLE public.reschedule_proposals (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  task_id INTEGER NOT NULL
    CONSTRAINT reschedule_proposals_task_id_tasks_id_fk
    REFERENCES public.tasks (id) ON DELETE CASCADE,
  from_due TIMESTAMPTZ,
  to_due TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reschedule_proposals_status_check
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired'))
);

CREATE TABLE public.reschedule_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  checked INTEGER NOT NULL DEFAULT 0,
  moved INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  proposed INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE TABLE public.reschedule_settings (
  user_id TEXT PRIMARY KEY,
  default_mode TEXT NOT NULL DEFAULT 'ask',
  max_moves INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reschedule_settings_mode_check
    CHECK (default_mode IN ('off', 'ask', 'auto')),
  CONSTRAINT reschedule_settings_moves_check
    CHECK (max_moves BETWEEN 1 AND 10)
);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.reschedule_proposals, public.reschedule_settings TO authenticated;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.reschedule_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reschedule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reschedule_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own reschedule proposals select"
  ON public.reschedule_proposals FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own reschedule proposals insert"
  ON public.reschedule_proposals FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own reschedule proposals update"
  ON public.reschedule_proposals FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own reschedule proposals delete"
  ON public.reschedule_proposals FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own reschedule settings select"
  ON public.reschedule_settings FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own reschedule settings insert"
  ON public.reschedule_settings FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own reschedule settings update"
  ON public.reschedule_settings FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own reschedule settings delete"
  ON public.reschedule_settings FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

-- reschedule_runs: intentionally NO policies (owner-only watchdog log).
