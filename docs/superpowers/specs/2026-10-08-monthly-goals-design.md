# Spec: Monthly Goals Subsystem (Step 12)

> **Status:** Approved & Ready for Implementation  
> **Date:** 2026-10-08  
> **Target Release:** v0.1.5  
> **Target Migration:** `0018_monthly_goals.sql`  
> **Authoritative Baseline:** 10/10 Verification Gates Green, RLS isolated per user (`auth.jwt()->>'sub'`).

---

## 1. Executive Summary & Philosophy

Cadence is a personal task & time management operating system designed to replace physical paper planners. Monthly Goals provides intentional direction for personal work without introducing cumbersome daily habit logs.

### Core Philosophy
1. **Zero New Data Entry:** Goals are evaluated strictly against operational telemetry already captured by Cadence (`focus_sessions`, `tasks`). Users only input an intention title, select a metric, and set a numeric target.
2. **Immutable Historical Ledgers:** Past reviews and evaluations cannot be rewritten or modified. A target reached in February remains achieved forever, even if the underlying project is completed, renamed, or deleted in July.
3. **Reality-Grounded Target Setting:** The goal creation interface inspects the user's actual trailing performance (30/90-day baselines) so targets are ambitious yet feasible, avoiding burnout and nag fatigue.
4. **Strict User Timezone Awareness:** Month boundaries (`YYYY-MM`) strictly evaluate in the user's configured IANA timezone (`Asia/Kolkata`, etc.), converting to precise UTC timestamp intervals.

---

## 2. Key Architecture Decisions & Approval

### Decision 1: Two Tables vs. One Table (APPROVED: Two Tables)
* **Approved Architecture:** Two distinct tables: `monthly_goals` (mutable during active month) and `monthly_goal_snapshots` (append-only ledger).
* **Rationale:**
  * In a personal operating system, auditability is paramount. If a single table held both active goals and historical status, retroactive target edits, project deletions (`ON DELETE SET NULL`), or accidental updates would corrupt past monthly reviews.
  * `monthly_goal_snapshots` denormalizes `title`, `metric`, `target`, `scope_label`, and `final_actual`. This decouples historical success records from future schema mutations or deleted entities.

### Decision 2: Metric Picker with Baseline Telemetry (APPROVED: Real Baselines)
* **Approved Architecture:** `GET /api/goals/baselines` provides rolling 30-day and 90-day monthly averages for each metric.
* **Rationale:**
  * Proposing abstract numbers (e.g. "1,000 focus minutes") without historical context leads to irrational target setting.
  * In a single-user system with multi-user RLS, computing small aggregates over indexed timestamps takes < 3ms in Postgres and provides immediate grounded feedback in the UI.

---

## 3. Data Models & Database Schema (Migration `0018`)

### 3.1 Migration File: `lib/db/migrations/0018_monthly_goals.sql`

```sql
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
  -- Scope must be internally consistent. NOTE: this constraint previously read
  -- `(scope_project_id IS NOT NULL OR scope_project_id IS NULL)`, which is a
  -- tautology -- `A OR NOT A` is always true -- so it enforced nothing and let a
  -- `scope_kind = 'project'` row be inserted with a NULL project id. That is not
  -- a harmless hole: such a goal has no scope to count against, which is the
  -- same broken state §7.1 goes to some length to prevent after a deletion.
  -- Each disjunct below therefore requires its matching id to be PRESENT and the
  -- other to be ABSENT. Do not "simplify" this back into a tautology.
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
  notes TEXT,

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

-- Prevent updates on snapshots (immutable audit record)
CREATE OR REPLACE FUNCTION public.prevent_snapshot_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'monthly_goal_snapshots rows are immutable and cannot be updated.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_goal_snapshot_update ON public.monthly_goal_snapshots;
CREATE TRIGGER trg_prevent_goal_snapshot_update
  BEFORE UPDATE ON public.monthly_goal_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_snapshot_update();

-- 4. Indexes
CREATE INDEX IF NOT EXISTS monthly_goals_user_month_idx ON public.monthly_goals(user_id, month, status);
CREATE INDEX IF NOT EXISTS monthly_goal_snapshots_user_month_idx ON public.monthly_goal_snapshots(user_id, month);
```

### 3.2 Metrics & Query Definitions

| Metric | Source Calculation | Scoping Join |
|---|---|---|
| `focus_minutes` | `SUM(focus_sessions.elapsed_minutes)` WHERE `status = 'completed'` AND `started_at >= :start AND started_at < :end` | `focus_sessions.task_id = tasks.id` |
| `focus_sessions` | `COUNT(focus_sessions.id)` WHERE `status = 'completed'` AND `started_at >= :start AND started_at < :end` | `focus_sessions.task_id = tasks.id` |
| `focus_days` | `COUNT(DISTINCT (focus_sessions.started_at AT TIME ZONE :userTz)::date)` WHERE `status = 'completed'` | `focus_sessions.task_id = tasks.id` |
| `tasks_completed` | `COUNT(tasks.id)` WHERE `completed_at >= :start AND completed_at < :end` AND `status = 'completed'` | `tasks.project_id` or `task_tags.tag_id` |
| `tasks_completed_on_time` | `COUNT(tasks.id)` WHERE `completed_at >= :start AND completed_at < :end` AND `status = 'completed'` AND `due_at IS NOT NULL AND completed_at <= due_at` | `tasks.project_id` or `task_tags.tag_id` |

---

## 4. Timezone & Month Window Resolution

### 4.1 Window Resolver Contract
Located in `lib/shared/time.ts` (or `artifacts/api-server/src/lib/time.ts`):
```typescript
export interface MonthWindow {
  start: Date; // UTC instant corresponding to 00:00:00.000 on the 1st in userTz
  end: Date;   // UTC instant corresponding to 00:00:00.000 on the 1st of next month in userTz
}

export function resolveMonthWindow(isoMonth: string, timeZone: string): MonthWindow {
  // Validate format YYYY-MM
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(isoMonth)) {
    throw new Error(`Invalid month format "${isoMonth}". Expected "YYYY-MM".`);
  }
  // Validate IANA timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
  } catch {
    throw new Error(`Invalid IANA timeZone "${timeZone}".`);
  }

  // Parse YYYY and MM
  const [yearStr, monthStr] = isoMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // Compute UTC instants with boundary safety
  // Calculates exact wall-clock start and rollover into next calendar month
  ...
}
```
* **Error Behavior:** If `timeZone` is missing or invalid, API responds with `400 Bad Request` explaining the issue. Never fall back silently to UTC.
* **Fixing Rituals Defect:** The server-local `new Date().setHours(0,0,0,0)` in `rituals.ts:36-40` is replaced with `resolveDayWindow(now, timeZone)` sharing this exact timezone resolution engine.

---

## 5. API Endpoints (`artifacts/api-server`)

All endpoints require `requireAuth` and execute within `runWithRls(req, tx)`.

```
GET    /api/goals?month=YYYY-MM         List goals for the month with live computed progress & actuals
POST   /api/goals                       Create goal (open status)
PATCH  /api/goals/:id                   Edit title, target (only if status = 'open')
DELETE /api/goals/:id                   Delete goal (only if status = 'open')
POST   /api/goals/:id/carry             Create new month goal cloned from this one
GET    /api/goals/baselines             Retrieve 30-day and 90-day averages across all 5 metrics
GET    /api/goals/review?month=YYYY-MM  Get full monthly review payload (goals, actuals, completion %)
GET    /api/goals/history               List all snapshots (immutable), grouped by month DESC
POST   /internal/goals/close-month      Internal pg_cron trigger (DISPATCH_SECRET secured)
```

---

## 6. Frontend Architecture (`artifacts/cadence`)

### 6.1 Route & Components
* **Route:** `/goals` mounted in `artifacts/cadence/src/App.tsx` and sidebar navigation (`AppSidebar.tsx`).
* **Components:**
  * `pages/goals/GoalsPage.tsx`: Primary view with current month selector, metric progress cards, and Activity Rings.
  * `components/goals/GoalCard.tsx`: Displays goal title, target, current actual progress bar/ring, and scope indicator badge.
  * `components/goals/GoalEditor.tsx`: Dialog for creating/editing goals. Shows real 30-day trailing baseline helper when selecting a metric.
  * `components/goals/MonthlyReviewDialog.tsx`: End-of-month review ritual displaying achieved vs missed goals with one-click "Carry over to next month" actions.

### 6.2 Design System Adherence
* Employs standard Apple HIG OLED dark mode tokens from `tokens/tokens.json`.
* Reuses `ActivityRings` component (`components/shared/ActivityRings.tsx`) for momentum visualization.
* Zero arbitrary pixel CSS values; strictly uses `@utility` sizing classes and standard spacing scale.

---

## 7. Edge Cases & Safety Invariants

1. **Scope Deletion Handling:**
   If a scoped project or tag is deleted after goal creation (`scope_project_id` becomes `NULL`), the progress calculation identifies that `scope_kind = 'project'` and flags the goal as `"scope_deleted"` with progress zero. It **never** falls back to global counting.
2. **Double Counting Semantics:**
   If a task matches two separate project or tag goals, it contributes to each matching goal legitimately.
3. **Mid-Month Target Edits:**
   Users may adjust targets while a goal is `open`. Snapshots freeze the target value at closing time.
4. **Append-Only Immutability:**
   Database trigger `trg_prevent_goal_snapshot_update` actively rejects any `UPDATE` statements on `monthly_goal_snapshots`.

---

## 8. Verification & Test Plan

1. **Timezone Math:**
   * Unit test `resolveMonthWindow` across non-DST zones (`Asia/Kolkata`) and DST transition boundaries (`America/New_York` spring/fall).
2. **Database & RLS:**
   * Assert user A cannot query or mutate user B's goals or snapshots.
   * Assert `prevent_snapshot_update` trigger raises an exception on `UPDATE`.
3. **API Contract:**
   * Verify OpenAPI schemas in `lib/api-spec/openapi.yaml` and generated Orval hooks.
4. **Gates:**
   * All 10 verification gates (`node scripts/run-gates.cjs`) must pass with code 0.
