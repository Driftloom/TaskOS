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
  -- No `notes` column. One was specified and never given a purpose; an
  -- undefined column is a trap for the next reader, and nothing in the approved
  -- design calls for reflection notes.

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
--
-- The original spec blocked only UPDATE. That is not enough for an audit ledger:
-- a row that can be silently deleted has no audit trail, and the guarantee this
-- table exists to provide is that a month's verdict survives whatever happens to
-- the parent goal, the project, or the tag afterwards. ON DELETE SET NULL on
-- goal_id above already keeps the snapshot alive when the goal is removed, so
-- refusing the DELETE is the only way that promise actually holds.
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
-- Without this the column is written once at INSERT and never again, so it
-- silently reports creation time on every row while the API exposes PATCH. A
-- stale timestamp that nobody notices is worse than no column.
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
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(isoMonth)) {
    throw new Error(`Invalid month format "${isoMonth}". Expected "YYYY-MM".`);
  }
  const [yearStr, monthStr] = isoMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12

  // Validate the IANA zone. `Intl.DateTimeFormat` throws a RangeError on an
  // unknown zone, which is the cheapest available proof the identifier is real.
  // Without this check a bad value would surface much later as a confusing
  // `formatToParts` failure deep inside the offset computation.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new Error(`Invalid IANA timeZone "${timeZone}".`);
  }

  // Compute the UTC instant of local wall-clock midnight on a given calendar
  // day in a given IANA zone.
  //
  // This CANNOT be done with a fixed UTC offset. `Asia/Kolkata` is a constant
  // +05:30 and would let you do the arithmetic by hand; `America/New_York` is
  // -05:00 in January and -04:00 in July, so any hardcoded offset silently
  // mis-bounds every window for half the year. The offset has to be read from
  // the zone's rules for the specific instant being converted.
  const wallClockStartInUtc = (y: number, m: number, day: number): Date => {
    // Step 1: assume the wall-clock time is UTC, then find what that instant
    // actually looks like in the target zone.
    const naive = Date.UTC(y, m - 1, day, 0, 0, 0, 0);
    const offsetAt = (instant: Date): number => {
      // Format the instant in the target zone, then re-read the wall-clock
      // fields. `asUTC` is what makes the arithmetic below exact.
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }).formatToParts(instant);
      const get = (t: string): number => Number(parts.find((p) => p.type === t)!.value);
      const asUtc = Date.UTC(
        get('year'), get('month') - 1, get('day'),
        get('hour') === 24 ? 0 : get('hour'), get('minute'), get('second'),
      );
      // offset = (wall clock as if UTC) - (the real instant)
      return asUtc - instant.getTime();
    };
    // One correction pass is sufficient for real IANA zones, but two are done
    // because a zone changing offset exactly at the boundary (a DST jump at
    // midnight, which occurs in e.g. America/Santiago) would otherwise be
    // off by the shift amount.
    let instant = new Date(naive);
    for (let i = 0; i < 2; i++) {
      const off = offsetAt(instant);
      const next = new Date(naive - off);
      if (next.getTime() === instant.getTime()) break;
      instant = next;
    }
    return instant;
  };

  const start = wallClockStartInUtc(year, month, 1);
  // `end` is the START of the next month, never "last day 23:59:59.999".
  // A half-open interval [start, end) cannot double-count or skip a row that
  // lands exactly on the boundary, which a closed interval can.
  const end = month === 12
    ? wallClockStartInUtc(year + 1, 1, 1)
    : wallClockStartInUtc(year, month + 1, 1);

  return { start, end };
}

/** Local calendar day for an instant, used by the `focus_days` metric. */
export function localDateInZone(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which sorts and compares correctly as a string.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant);
}

/** Current month as YYYY-MM in the user's zone (NOT server-local). */
export function currentMonthInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit',
  }).format(now).slice(0, 7);
}
```

### 4.2 Where the timezone comes from (pinned)

The zone is read from **`notification_settings.timezone`** — the column already
established as the home timezone in `spec/locked-decisions.md` D-01 (default
`Asia/Kolkata`). This was previously unspecified, leaving an implementer to
guess whether it came from the JWT, the request, or a client header.

**If the row is absent:** fall back to `Asia/Kolkata`, which is the locked
default, and **not** to UTC. Falling back to UTC is the one option that produces
silently wrong numbers for the primary user; the locked default is a known-good
value for that exact reason.

**If the stored value is not a valid IANA zone:** return `400`, per the error
behaviour below. Do not coerce.

### 4.3 Why half-open intervals

All window comparisons are `column >= start AND column < end`. Every aggregate in
§3.2 already uses this shape. `end` is the first instant of the *next* month, not
the last millisecond of this one, so a `focus_session` or task completion landing
exactly at midnight on the 1st belongs to exactly one month rather than
potentially two.

### 4.4 Error behavior & the rituals fix

* **Error behavior:** if `timeZone` is missing or invalid, the API responds
  `400 Bad Request` explaining the issue. **Never fall back silently to UTC** —
  a silent fallback returns confidently wrong numbers instead of an error.
* **Fixing the rituals defect:** the server-local `new Date().setHours(0,0,0,0)`
  in `rituals.ts:36-40` is replaced with a `resolveDayWindow(now, timeZone)`
  built on the same offset-reading engine as `resolveMonthWindow`. On a UTC host
  that code puts "today" up to 5h30m wrong for `Asia/Kolkata`, which is the
  locked default for the primary user.

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

### 5.1 `POST /internal/goals/close-month`

Previously a bare endpoint line with no defined behaviour. Now specified:

* **Authentication:** `DISPATCH_SECRET` header, matching the existing
  `/internal/dispatch` and `/internal/reschedule` contract. Not `requireAuth` —
  it is a cron path, not a user path.
* **Selection:** every `monthly_goals` row with `status = 'open'` whose `month`
  is **strictly less than** the caller's current month in that user's timezone.
  Strictly less, not equal — a goal for the current month is still accruing.
* **Gap handling:** because the predicate is "any earlier month", an app that
  went unused for three months closes three months of goals in one run. It does
  **not** skip or fast-forward anything.
* **Per goal:** compute `final_actual` for its own month window, `INSERT` a
  snapshot, then `UPDATE ... SET status = 'closed', closed_at = NOW()`.
* **Idempotency — required, because pg_cron retries.** A snapshot is inserted
  only when no snapshot exists for that `goal_id`; otherwise the goal is marked
  closed and the existing snapshot is left untouched. Since the snapshot table
  also refuses `UPDATE` and `DELETE`, a double-run cannot corrupt it — but
  without the existence check the run would attempt an insert on every retry,
  so the check is what makes re-running safe rather than merely survivable.
* **It never creates next-month goals.** Carry-forward is user-initiated via
  `POST /api/goals/:id/carry`, per §7.5.

### 5.2 Carry-forward semantics (previously unstated)

This was the most dangerous gap in the original spec: the column, the endpoint,
and the UI button were all specified, but the rule was not, so an implementer
could reasonably have built carry-forward as a *reopen* — which would violate
the immutability guarantee the whole subsystem rests on.

**Carry-forward creates a NEW row. It never mutates, reopens, or un-closes the
source goal.**

* The new row gets the next month, `status = 'open'`, `carried_from_id` pointing
  at the source goal, and a fresh `created_at`.
* The source goal keeps `status = 'closed'`. Its snapshot is never touched.
* Only `month` and `carried_from_id` differ by default. Title, metric, target,
  and scope are copied, and the UI may pre-edit them in the same dialog.
* **Carry is always explicit.** It happens only when the user acts in
  `MonthlyReviewDialog`. Nothing carries automatically at month close. This is
  required by the standing project rule that no change happens without the user
  seeing it.
* A met goal is never offered as a carry candidate — it is finished.
* Carrying is not transitive-blocking: carrying a carried goal forwards
  `carried_from_id` to the original, so the lineage stays inspectable.

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
   Database triggers `trg_prevent_goal_snapshot_update` and
   `trg_prevent_goal_snapshot_delete` actively reject any `UPDATE` **or**
   `DELETE` against `monthly_goal_snapshots`. A row that can be deleted has no
   audit trail, so DELETE is blocked alongside UPDATE.
5. **Carry-Forward Never Reopens:** covered in §5.2. Carry inserts a new row and
   leaves the closed goal and its snapshot untouched.
6. **On-Pace Projection:**
   `onPace` and `expectedSoFar` are advisory only:

   ```
   expectedSoFar = round(target * (elapsedDays / daysInMonth))
   onPace        = actual >= expectedSoFar
   ```

   `elapsedDays` counts calendar days in the user's zone, `daysInMonth` is the
   real length of that month (28–31). On the final day `expectedSoFar` equals
   `target`, so on-pace and the final verdict cannot disagree.

   **This is guidance, never a verdict.** It is derived from elapsed time, not
   from behaviour, so a user who front-loads their month sees `onPace: false`
   while already having beaten the target. The UI must show the actual number
   beside it, and no copy may describe a goal as missed while the month is still
   running — that would be the "nag" this design exists to avoid.
7. **`updated_at` Integrity:** maintained by `trg_monthly_goals_updated_at` so a
   `PATCH`-ed goal reports its last edit rather than its creation time.
8. **Scope Integrity at Write Time:** the `monthly_goals_scope_check` constraint
   rejects a `project`- or `tag`-scoped row whose scope id is NULL. Combined with
   §7.1, that means "scope missing" can only arise from a genuine deletion, never
   from a malformed insert.

---

## 8. Verification & Test Plan

1. **Timezone Math:**
   * The `resolveMonthWindow` implementation in §4.1 was executed against these
     vectors before being committed to this spec, and returns them exactly. Use
     them as regression fixtures rather than re-deriving expected values by hand:
     * `2026-01 Asia/Kolkata` → start `2025-12-31T18:30:00Z` (fixed +05:30)
     * `2026-01 America/New_York` → start `2026-01-01T05:00:00Z` (EST −05:00)
     * `2026-07 America/New_York` → start `2026-07-01T04:00:00Z` (EDT −04:00)
     * `2026-12 America/New_York` → end `2027-01-01T05:00:00Z` (year rollover)
     * `2026-01 Australia/Sydney` → start `2025-12-31T13:00:00Z` (AEDT +11:00)
     * `2026-01 Pacific/Chatham` → start `2025-12-31T10:15:00Z` (+13:45)
     * `2026-07 Pacific/Chatham` → start `2026-06-30T11:15:00Z` (+12:45 standard)
     * The New_York and Chatham pairs are the ones that matter: each pair differs
       only by DST, so a hardcoded UTC offset passes one and fails the other.
   * Unit test `resolveMonthWindow` across non-DST zones (`Asia/Kolkata`) and DST
     transition boundaries (`America/New_York` spring/fall).
   * Assert the returned `start`/`end` are **contiguous**: `window(N).end ===
     window(N+1).start`, for every adjacent pair across several zones. This
     catches off-by-one-month bugs that a single-window assertion cannot see.
   * Assert month lengths are exactly 28/29/30/31 as appropriate (include a leap
     February), which catches arithmetic that assumes a 30-day month.
   * Assert `resolveMonthWindow` rejects an invalid IANA zone and an invalid
     `YYYY-MM`, rather than returning a plausible-looking wrong window.
2. **Database & RLS:**
   * Assert user A cannot query or mutate user B's goals or snapshots.
   * Assert `prevent_snapshot_mutation` raises on `UPDATE` **and on `DELETE`**.
   * Assert `monthly_goals_scope_check` rejects `scope_kind='project'` with a
     NULL `scope_project_id` — the tautology regression guard.
   * Assert `close-month` is idempotent: run twice, assert exactly one snapshot
     per goal and identical `final_actual`.
   * Assert `close-month` handles a multi-month gap in a single run.
3. **API Contract:**
   * Verify OpenAPI schemas in `lib/api-spec/openapi.yaml` and generated Orval hooks.
   * Regenerate with `pnpm --filter @workspace/api-spec run codegen` after the
     spec edit — never hand-edit `src/generated/`.
4. **Gates:**
   * All 10 verification gates (`node scripts/run-gates.cjs`) must pass with code 0.
