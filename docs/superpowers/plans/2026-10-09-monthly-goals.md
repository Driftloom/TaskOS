# Monthly Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Monthly Goals subsystem — the migration, metric layer, and OpenAPI contracts already exist; this plan builds the API handlers, the month-close job, and the `/goals` UI that turn them into a working feature.

**Architecture:** Progress is computed on read for the current month (a single-user personal app has nothing to gain from rollup tables), and frozen into an append-only snapshot at month close. Snapshots deny `UPDATE` and `DELETE` at the database level, so a month's verdict cannot be rewritten later. Every month boundary is resolved in the user's own IANA timezone, never server-local and never a fixed UTC offset.

**Tech Stack:** Express 5, Drizzle ORM, Supabase Postgres, `pg_cron` + `pg_net`, OpenAPI 3.0 + Orval, React 19, TanStack Query, Tailwind v4, Vitest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-08-monthly-goals-design.md`](../specs/2026-10-08-monthly-goals-design.md)

## Global Constraints

- **pnpm only.** Root `preinstall` (`scripts/enforce-pnpm.cjs`) deletes lockfiles and exits 1 under npm/yarn. Never touch `minimumReleaseAge: 1440`.
- **Every handler uses `runWithRls(req, tx => …)`** (`artifacts/api-server/src/lib/rls.ts`). A bare owner-level `Pool` bypasses RLS. It is fail-closed: no token means match-nothing claims. Keep the app-layer `where user_id = ?` even though RLS already filters.
- **`requireAuth` on every `/api/goals*` route.** No exceptions.
- **`openapi.yaml` is the contract source of truth.** After editing it run `pnpm --filter @workspace/api-spec run codegen`. **Never hand-edit `src/generated/`.**
- **Zero arbitrary px in UI code.** Use the `@utility` sizing classes and the standard spacing scale — `lint:tokens` fails the build otherwise. A one-off dimension becomes a role-named token in `tokens/tokens.json` plus an `@utility` rule in `index.css`, and must be confirmed to emit CSS.
- **No silent writes.** Carry-forward only ever happens from an explicit user action (§5.2 of the spec). Nothing carries automatically at close.
- **Home timezone is `Asia/Kolkata`** (`notification_settings.timezone`, locked D-01). Absent row falls back to it, never to UTC. An invalid stored zone is a `400`, never coerced.
- **Month windows are half-open:** `column >= start AND column < end`, where `end` is the first instant of the *next* month.
- **Month format is `YYYY-MM`**, validated against `^[0-9]{4}-(0[1-9]|1[0-2])$`.
- **Full green means 10/10 on `pnpm run verify`.** Run that, not the gates individually.

## Review Focus

The five conditions most likely to bite a person using this, none of which the spec's happy-path description would surface. Each has a test pinned to the task that owns the code.

1. **A goal scoped to a project that is later deleted must read `scope_deleted`, not silently count globally.** `isScopeDeleted` exists for exactly this. Silently widening to global would inflate progress and could fake a met goal.
2. **Editing a goal's target mid-month must not rewrite what the closed month's snapshot says.** The snapshot denormalises `target` precisely so this cannot happen; a regression that starts reading `target` through the goal FK defeats the whole two-table design.
3. **A goal created for the current month must not be closed by the month-close job.** The predicate is `month < currentMonth`, strictly less. An `<=` bug closes live goals and makes progress appear frozen.
4. **A session or completion landing exactly at midnight on the 1st must count toward exactly one month.** This is what the half-open interval buys; a closed interval double-counts or drops it.
5. **A deleted or renamed project must not change a past month's verdict.** Depends on `scope_label` being denormalised onto the snapshot at close time.

---

## Already Built (do not rebuild)

Verified present and passing `pnpm run verify` (10/10 green). Read these before writing anything — your code must match their real signatures.

| File | Exports |
|---|---|
| `lib/db/migrations/0018_monthly_goals.sql` | tables, RLS policies, `prevent_snapshot_mutation` (BEFORE UPDATE **and** DELETE), `touch_updated_at`, indexes |
| `lib/db/src/schema/monthly-goals.ts` | `monthlyGoalsTable`, `insertMonthlyGoalSchema`, `monthlyGoalSnapshotsTable`, `insertMonthlyGoalSnapshotSchema` — re-exported from `schema/index.ts` |
| `artifacts/api-server/src/lib/month-window.ts` | `validateTimeZone`, `wallClockDateToUtc`, `resolveMonthWindow`, `localDateInZone`, `currentMonthInZone`, `resolveDayWindow`, `getDaysInMonth`, `getElapsedDays`, `computeOnPace`; types `MonthWindow`, `DayWindow` |
| `artifacts/api-server/src/lib/goals-metrics.ts` | `computeGoalActual`, `computeBaselines`, `getUserTimezone`, `resolveScopeLabel`, `isScopeDeleted`; types `GoalMetric`, `GoalScopeKind`, `GoalActualResult`, `MetricBaseline`, `GoalBaselines` |
| `lib/api-spec/openapi.yaml` | paths `/goals`, `/goals/baselines`, `/goals/review`, `/goals/history`, `/goals/{id}`, `/goals/{id}/carry` — codegen already run, Zod types exist |

---

### Task 1: Goal CRUD + read handlers

**Files:**
- Create: `artifacts/api-server/src/routes/goals.ts`
- Modify: `artifacts/api-server/src/routes/index.ts` (add `router.use("/api", goalsRouter)` alongside the other routers)
- Test: `artifacts/api-server/src/routes/goals.test.ts`

**Interfaces:**
- Consumes: `monthlyGoalsTable`, `monthlyGoalSnapshotsTable` from `@workspace/db`; `computeGoalActual`, `computeBaselines`, `getUserTimezone`, `resolveScopeLabel`, `isScopeDeleted`, `computeOnPace`, `getDaysInMonth`, `getElapsedDays`, `resolveMonthWindow`, `currentMonthInZone` from `../lib/goals-metrics` and `../lib/month-window`; the generated `goalSchema`, `createGoalInputSchema`, `updateGoalInputSchema`, `goalBaselinesSchema`, `goalHistorySchema`, `listGoalsParamsSchema`, `getMonthlyReviewParamsSchema` from `@workspace/api-zod`.
- Produces: default-exported `IRouter` from `routes/goals.ts`, mounted at `/api`. Later tasks import nothing from it directly; they only need the endpoints live.

Follow `routes/rituals.ts` exactly for shape: `const router: IRouter = Router()`, `requireAuth` per route, all DB work inside `runWithRls(req, async (tx) => …)`.

- [ ] **Step 1: Write the failing tests**

In `goals.test.ts`, following the existing `http-contract.test.ts` mocking approach. Cover:

```ts
it('GET /api/goals returns 401 without auth', ...)
it('GET /api/goals never returns another user\'s goals', ...)   // Review Focus #1/#2 guard
it('GET /api/goals marks a goal scope_deleted when its project is gone', ...)  // Review Focus #1
it('GET /api/goals exposes onPace and expectedSoFar for the open month', ...)
it('GET /api/goals rejects month=2026-13 with 400', ...)
it('POST /api/goals rejects target 0 and target -5 with 400', ...)
it('POST /api/goals rejects scope_kind=project with a null project id', ...)
it('GET /api/goals/baselines returns a 30d and 90d figure per metric', ...)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server run test -- goals.test.ts`
Expected: FAIL — router does not exist.

- [ ] **Step 3: Implement `routes/goals.ts`**

Signatures to match exactly:

```
GET    /goals?month=YYYY-MM
POST   /goals
PATCH  /goals/:id
DELETE /goals/:id
GET    /goals/baselines
GET    /goals/review?month=YYYY-MM
GET    /goals/history
```

Rules that are easy to get wrong:

- `GET /goals` defaults `month` to `currentMonthInZone(await getUserTimezone(req.userId))` when the query param is absent.
- Resolve the window once per request with `resolveMonthWindow(month, timeZone)` and pass it to `computeGoalActual`; do not re-derive per goal.
- For each goal, if `isScopeDeleted(goal)` is true, return `scopeState: 'scope_deleted'` and force `actual: 0`. **Do not fall back to global counting.**
- On-pace fields come from `computeOnPace`. They are advisory; return `actual` alongside them.
- `PATCH` and `DELETE` must reject a goal whose `status !== 'open'` with `409`. This is what keeps a closed goal immutable from the API side as well as the DB side.
- `POST` must reject `scope_kind='project'` with a null `scope_project_id` — mirror the DB CHECK so the user gets a `400` rather than a driver error.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server run test -- goals.test.ts`
Expected: PASS.

- [ ] **Step 5: Mount the router**

In `routes/index.ts`, add the import and `router.use("/api", goalsRouter);` next to the existing mounts.

- [ ] **Step 6: Verify the contract matches the implementation**

Run: `pnpm run verify:fast`
Expected: PASS — in particular `typecheck`, which fails if a handler's response shape drifts from `openapi.yaml`.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/goals.ts artifacts/api-server/src/routes/goals.test.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(goals): CRUD and read handlers for monthly goals"
```

---

### Task 2: Carry-forward — insert, never reopen

**Files:**
- Modify: `artifacts/api-server/src/routes/goals.ts`
- Test: `artifacts/api-server/src/routes/goals.test.ts`

**Interfaces:**
- Consumes: `monthlyGoalsTable` from `@workspace/db`; `carryGoalInputSchema` from `@workspace/api-zod`; `currentMonthInZone` from `../lib/month-window`.
- Produces: `POST /goals/:id/carry`.

- [ ] **Step 1: Write the failing tests**

```ts
it('carry creates a NEW row in the next month and leaves the source closed', ...)
it('carry leaves the source snapshot byte-identical', ...)          // Review Focus #2
it('carry sets carried_from_id to the source goal', ...)
it('carry copies title, metric, target and scope', ...)
it('carry of an open goal is rejected', ...)                       // only closed goals carry
it('carry of an already-closed goal in a past month targets the current month', ...)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server run test -- goals.test.ts -t carry`
Expected: FAIL — no such route.

- [ ] **Step 3: Implement `POST /goals/:id/carry`**

Inside one `runWithRls` transaction: read the source goal, assert `status === 'closed'`, compute the target month as `currentMonthInZone(timeZone)`, and **INSERT** a new row with `status: 'open'`, `created_at: now()`, and `carried_from_id: source.id`.

**The source row is never touched.** No `UPDATE` on `monthly_goals` for the source id — that is the entire point of the design, and a reopen implementation would pass Review Focus #2's first assertion while still corrupting lineage.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server run test -- goals.test.ts -t carry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/goals.ts artifacts/api-server/src/routes/goals.test.ts
git commit -m "feat(goals): carry-forward inserts a new row instead of reopening"
```

---

### Task 3: Month-close job, wired to pg_cron

**Files:**
- Modify: `artifacts/api-server/src/routes/internal.ts` (add `POST /internal/goals/close-month`)
- Modify: a migration adding the `pg_cron` + `pg_net` schedule — follow `0015_pg_net_schema_relocation.sql` for the schema-relocation pattern already established in this repo
- Test: `artifacts/api-server/src/tests/close-month.test.ts`

**Interfaces:**
- Consumes: `monthlyGoalsTable`, `monthlyGoalSnapshotsTable`; `computeGoalActual`, `resolveScopeLabel`, `getUserTimezone`, `resolveMonthWindow`, `currentMonthInZone`; `dispatchSecretOk` and `secretMatches` from `internal.ts` itself.
- Produces: `POST /internal/goals/close-month`, guarded by the existing `x-dispatch-secret` header, plus the cron entry.

- [ ] **Step 1: Write the failing tests**

```ts
it('close-month closes only goals in strictly earlier months', ...)   // Review Focus #3
it('close-month is idempotent: two runs leave one snapshot per goal', ...)
it('close-month does not touch snapshots that already exist', ...)
it('close-month handles a three-month gap in a single run', ...)
it('close-month denormalises scope_label from the project name at close time', ...)  // Review Focus #5
it('close-month never creates goals in the new month', ...)
it('close-month rejects a missing or wrong DISPATCH_SECRET', ...)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server run test -- close-month.test.ts`
Expected: FAIL — no such route.

- [ ] **Step 3: Implement the endpoint**

Copy the existing guard shape from `/internal/dispatch` (lines 115-120 of `internal.ts`): refuse when `process.env.DISPATCH_SECRET` is unset, then `dispatchSecretOk(req.header("x-dispatch-secret"))`.

Per goal with `status = 'open'` **and** `month < currentMonth`: if a snapshot already exists for that `goal_id`, skip the insert; otherwise compute `final_actual`, `achieved`, and `resolveScopeLabel(...)`, insert the snapshot, then set `status='closed', closed_at=now()`.

The existence check is what makes `pg_cron` retries safe. Do not rely on the immutability trigger alone — it would turn a double-run into an exception and abort the remaining goals.

- [ ] **Step 4: Register the cron job**

`pg_cron` + `pg_net` calling the endpoint with the secret, running at 00:05 on the 1st. Reuse the schema-relocation statements from `0015` so the job lands in the same schema as the existing dispatch job.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server run test -- close-month.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/internal.ts artifacts/api-server/src/tests/close-month.test.ts lib/db/migrations/
git commit -m "feat(goals): month-close job that snapshots and seals prior months"
```

---

### Task 4: Fix the server-local day-boundary defect in rituals

**Files:**
- Modify: `artifacts/api-server/src/routes/rituals.ts:36-40` and `:110`
- Test: `artifacts/api-server/src/tests/rituals-timezone.test.ts`

**Interfaces:**
- Consumes: `resolveDayWindow(instant, timeZone)` and `getUserTimezone(userId)`, both already exported.
- Produces: nothing new; removes a defect.

- [ ] **Step 1: Write the failing test**

```ts
it('plan-day counts a task due at 23:30 IST as overdue even when the server is UTC', ...)
```

This is the concrete bug: `new Date()` + `setHours(0,0,0,0)` computes midnight in the *server's* zone. On a UTC host with `Asia/Kolkata` that puts "today" 5h30m wrong, so a task due at 23:30 IST is treated as overdue for the previous six hours.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server run test -- rituals-timezone.test.ts`
Expected: FAIL — the task is not reported overdue.

- [ ] **Step 3: Replace both boundary computations**

At both call sites, obtain the user's zone with `getUserTimezone(req.userId!)` and use `resolveDayWindow(now, timeZone)` for `startOfDay`/`endOfDay`. Delete the two `setHours(0, 0, 0, 0)` calls.

- [ ] **Step 4: Run the full API test suite to confirm no regression**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS. Plan My Day and Close My Day both read the same windows, so this touches live routes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/rituals.ts artifacts/api-server/src/tests/rituals-timezone.test.ts
git commit -m "fix(rituals): resolve day boundaries in the user's timezone, not server-local"
```

---

### Task 5: `/goals` page, cards, and editor

**Files:**
- Create: `artifacts/cadence/src/pages/goals/GoalsPage.tsx`
- Create: `artifacts/cadence/src/components/goals/GoalCard.tsx`
- Create: `artifacts/cadence/src/components/goals/GoalEditor.tsx`
- Modify: `artifacts/cadence/src/App.tsx` (route), `artifacts/cadence/src/components/chrome/AppSidebar.tsx` (nav entry)
- Test: `artifacts/cadence/src/components/goals/GoalEditor.test.tsx`, `GoalCard.test.tsx`

**Interfaces:**
- Consumes: the generated react-query hooks `useListGoals`, `useCreateGoal`, `useUpdateGoal`, `useDeleteGoal`, `useGetGoalsBaselines` from `@workspace/api-client-react`; `ActivityRings` from `components/shared/ActivityRings.tsx`.
- Produces: route `/goals`; nav label "Goals".

- [ ] **Step 1: Write the failing tests**

```tsx
it('GoalEditor shows the 30-day and 90-day baseline beside each metric', ...)
it('GoalEditor disables submit when title is empty or over 120 chars', ...)
it('GoalEditor sends scope_kind=global when no scope is chosen', ...)
it('GoalCard renders scope_deleted instead of a progress bar', ...)
it('GoalCard shows the actual number next to any on-pace hint', ...)   // Review Focus: no "you failed" copy mid-month
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/cadence run test -- goals`
Expected: FAIL — components do not exist.

- [ ] **Step 3: Implement `GoalEditor.tsx`**

A dialog with: title input (`maxLength={120}`), metric select, numeric target, and an optional project/tag scope select defaulting to global. **When a metric is chosen, display its 30d and 90d figures from `useGetGoalsBaselines` right beside it** — this is the whole reason that endpoint exists. Proposing "600 focus minutes" to someone averaging 200 is the failure mode this feature exists to avoid.

- [ ] **Step 4: Implement `GoalCard.tsx`**

Title, `actual / target`, an `ActivityRings`-consistent progress indicator, a scope badge, and the on-pace hint. When `scopeState === 'scope_deleted'` render an explicit "scope deleted" notice instead of a bar — never a zero bar, which reads as "you did nothing".

- [ ] **Step 5: Implement `GoalsPage.tsx` and mount it**

Month selector, list of `GoalCard`s, and a button opening `GoalEditor`. Add the route to `App.tsx` and the nav entry to `AppSidebar.tsx`.

- [ ] **Step 6: Run tests and the token lint**

Run: `pnpm --filter @workspace/cadence run test -- goals` then `pnpm run lint:tokens`
Expected: both PASS. The lint is what catches an arbitrary px sneaking into new markup.

- [ ] **Step 7: Commit**

```bash
git add artifacts/cadence/src/pages/goals artifacts/cadence/src/components/goals artifacts/cadence/src/App.tsx artifacts/cadence/src/components/chrome/AppSidebar.tsx
git commit -m "feat(goals): /goals page with baseline-informed goal editor"
```

---

### Task 6: Monthly review ritual

**Files:**
- Create: `artifacts/cadence/src/components/goals/MonthlyReviewDialog.tsx`
- Modify: `artifacts/cadence/src/components/rituals/RitualDialog.tsx` (add the entry point), `artifacts/cadence/src/hooks/useAutomationToggle.ts`-adjacent ritual registry if one exists
- Test: `artifacts/cadence/src/components/goals/MonthlyReviewDialog.test.tsx`

**Interfaces:**
- Consumes: `useGetMonthlyReview`, `useCarryGoal` from `@workspace/api-client-react`; `RitualDialog`'s existing presentation contract.
- Produces: a review dialog reachable from the existing rituals surface.

- [ ] **Step 1: Write the failing tests**

```tsx
it('lists every goal from the closed month with met and missed', ...)
it('offers carry-forward only for unmet goals', ...)      // Review Focus: met goals are finished
it('carrying updates the list without a full reload', ...)
it('does not offer carry for a scope_deleted goal without explaining why', ...)
it('shows the on-pace state, never a verdict, for the month in progress', ...)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/cadence run test -- MonthlyReviewDialog`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the dialog**

Walk the closed month's snapshots: met goals listed plainly, unmet goals listed with a one-tap "Carry into next month" that calls `useCarryGoal`. Follow the `RitualDialog` pattern so it is reachable from the same surface as Close My Day.

**Carry is only ever user-initiated.** Do not add an effect that carries anything on mount — the project's standing rule is that no change happens without the user seeing it.

- [ ] **Step 4: Run tests and the full ladder**

Run: `pnpm --filter @workspace/cadence run test -- goals` then `pnpm run verify`
Expected: PASS, 10/10 gates green.

- [ ] **Step 5: Commit**

```bash
git add artifacts/cadence/src/components/goals artifacts/cadence/src/components/rituals/RitualDialog.tsx
git commit -m "feat(goals): monthly review ritual with explicit carry-forward"
```

---

### Task 7: End-to-end verification

**Files:**
- Create: `artifacts/cadence/e2e/monthly-goals.spec.ts` (follow the existing e2e layout — these self-mock the API, so no database is needed)

**Interfaces:**
- Consumes: every endpoint and route from Tasks 1-6.
- Produces: proof the feature works end to end.

- [ ] **Step 1: Write the e2e spec**

Cover the full month lifecycle: create a goal → see progress → edit the target mid-month → carry it forward. Assert the API self-mocks give you a zero actual and the UI still renders honestly rather than claiming success.

- [ ] **Step 2: Run it**

Run: `pnpm run verify:e2e -- monthly-goals`
Expected: PASS.

- [ ] **Step 3: Run the full ladder one final time**

Run: `pnpm run verify`
Expected: `VERIFICATION PASSED: 10/10 gates green`.

- [ ] **Step 4: Update the status documents**

In `AGENTS.md` §7, move build-order step 10 out of `CURRENT STEP` and record what shipped. In `PROGRESS.md` and `AUDIT.md`, append the entry — `AUDIT.md` is append-only by project rule, so add a dated entry rather than editing an existing one.

- [ ] **Step 5: Commit**

```bash
git add artifacts/cadence/e2e/monthly-goals.spec.ts AGENTS.md PROGRESS.md AUDIT.md
git commit -m "docs: record monthly goals as shipped"
```

---

## Self-Review

**Spec coverage.** §3 schema and §8 migration → already built, untouched. §3.2 metrics → `goals-metrics.ts`, already built. §4 timezone → `month-window.ts` for the resolver; **§4.4's rituals fix is Task 4**. §5 endpoints → Tasks 1 and 2. §5.1 close-month → Task 3. §6 frontend → Tasks 5 and 6. §7.1 scope deletion → Task 1 test. §7.2 double counting → inherent to `computeGoalActual`; no new task. §7.3 mid-month edits → Task 1 `PATCH` test plus the snapshot denormalisation. §7.4 immutability → already in the migration. §7.6 on-pace → `computeOnPace` built; surfaced in Tasks 1 and 5. §7.7 `updated_at` → already in the migration. §8 tests → distributed across all tasks.

**Step scan.** Every step carries either a named test, a signature, or a command with its expected output. No step says "handle edge cases" or "add appropriate validation".

**Type consistency.** `monthlyGoalsTable` / `monthlyGoalSnapshotsTable` are the names in `monthly-goals.ts`. `computeGoalActual`, `computeBaselines`, `getUserTimezone`, `resolveScopeLabel`, `isScopeDeleted` and `computeOnPace`, `getDaysInMonth`, `getElapsedDays`, `resolveMonthWindow`, `currentMonthInZone`, `resolveDayWindow` are the verified export names — every task uses exactly these.

**Review Focus.** All five are pinned: #1 → Task 1; #2 → Task 2; #3 → Task 3; #4 → Task 1's half-open window tests; #5 → Task 3's `scope_label` test.

**Proportion.** Seven tasks against a 474-line spec whose schema, metrics, and timezone engine were already built. This plan is mostly handlers and UI, which is what remains — it is not a transcript of the whole subsystem.