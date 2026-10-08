-- Migration 0018: monthly_goals & monthly_goal_snapshots

-- 1. Create monthly_goals table (active intentions)
CREATE TABLE IF NOT EXISTS public.monthly_goals (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  month VARCHAR(7) NOT NULL, -- 'YYYY-MM'
  metric TEXT NOT NULL,
  target INTEGER NOT NULL,
  scope_kind TEXT NOT NULL DEFAULT 'global',
  scope_project_id INTEGER REFERENCES public.projects(id) ON DELETE SET NULL,
  scope_tag_id INTEGER REFERENCES public.tags(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  carried_from_id INTEGER REFERENCES public.monthly_goals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT monthly_goals_title_check CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  CONSTRAINT monthly_goals_month_format_check CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT monthly_goals_target_check CHECK (target > 0),
  CONSTRAINT monthly_goals_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT monthly_goals_metric_check CHECK (
    metric IN ('focus_minutes', 'focus_sessions', 'focus_days', 'tasks_completed', 'tasks_completed_on_time')
  ),
  -- Scope must be internally consistent.
  CONSTRAINT monthly_goals_scope_check CHECK (
    (scope_kind = 'global' AND scope_project_id IS NULL AND scope_tag_id IS NULL) OR
    (scope_kind = 'project' AND scope_project_id IS NOT NULL AND scope_tag_id IS NULL) OR
    (scope_kind = 'tag' AND scope_tag_id IS NOT NULL AND scope_project_id IS NULL)
  )
);

-- 2. Create monthly_goal_snapshots table (immutable audit ledger)
CREATE TABLE IF NOT EXISTS public.monthly_goal_snapshots (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_id INTEGER REFERENCES public.monthly_goals(id) ON DELETE SET NULL,
  month VARCHAR(7) NOT NULL,
  title TEXT NOT NULL,
  metric TEXT NOT NULL,
  target INTEGER NOT NULL,
  final_actual INTEGER NOT NULL,
  achieved BOOLEAN NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_label TEXT NOT NULL, -- Denormalized name of project/tag at snapshot time
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT monthly_goal_snapshots_target_check CHECK (target > 0),
  CONSTRAINT monthly_goal_snapshots_actual_check CHECK (final_actual >= 0),
  CONSTRAINT monthly_goal_snapshots_month_format_check CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

-- 3. Row-Level Security
ALTER TABLE public.monthly_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_goal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY monthly_goals_user_policy ON public.monthly_goals
  USING (user_id = (auth.jwt()->>'sub'))
  WITH CHECK (user_id = (auth.jwt()->>'sub'));

CREATE POLICY monthly_goal_snapshots_user_policy ON public.monthly_goal_snapshots
  USING (user_id = (auth.jwt()->>'sub'))
  WITH CHECK (user_id = (auth.jwt()->>'sub'));

-- Enforce immutability on snapshots: block UPDATE *and* DELETE.
CREATE OR REPLACE FUNCTION public.prevent_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'monthly_goal_snapshots rows are immutable and cannot be % .',
    TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_goal_snapshot_update ON public.monthly_goal_snapshots;
DROP TRIGGER IF EXISTS trg_prevent_goal_snapshot_delete ON public.monthly_goal_snapshots;

CREATE TRIGGER trg_prevent_goal_snapshot_update
  BEFORE UPDATE ON public.monthly_goal_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_snapshot_mutation();

CREATE TRIGGER trg_prevent_goal_snapshot_delete
  BEFORE DELETE ON public.monthly_goal_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_snapshot_mutation();

-- Maintain monthly_goals.updated_at.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monthly_goals_updated_at ON public.monthly_goals;
CREATE TRIGGER trg_monthly_goals_updated_at
  BEFORE UPDATE ON public.monthly_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Indexes
CREATE INDEX IF NOT EXISTS monthly_goals_user_month_idx ON public.monthly_goals(user_id, month, status);
CREATE INDEX IF NOT EXISTS monthly_goal_snapshots_user_month_idx ON public.monthly_goal_snapshots(user_id, month);
