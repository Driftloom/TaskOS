# G4 Manual Verification & Production Certification Runbook

> **File provenance:** Synthesized 2026-10-10 to provide deterministic, reproducible procedures for all 12 manual items in the G4 checklist (`docs/07-module-registry.md §4`, `spec/master-verification-matrix.md §3`).
> **Core Principle:** The 12 automated verification gates prove internal code consistency; G4 proves the system functions reliably in the physical world across networks, OS boundaries, hardware clocks, and real user identities.

---

## 1. The 5-Gate Framework & Why G4 Matters

| Gate | Scope | Automated? | Proof Mechanism |
|---|---|:---:|---|
| **G1** | Code Quality | ✅ Yes | 896 Vitest tests passing across 70 files, 144 Playwright E2E tests (100% green), 0 stubs, 0 mocks in production code |
| **G2** | Schema Integrity | ✅ Yes | Migrations `0000`–`0019` applied with matching column types & check constraints |
| **G3** | Security Boundary | ⚠️ Partly | Drizzle `runWithRls` JWT claims forwarding; proven by 2-account live probe |
| **G4** | Manual / Real-World | ❌ No | "Things code alone cannot prove": real devices, background timers, APNs/Telegram, cron run details |
| **G5** | Docs & Audit Truth | ✅ Yes | `AUDIT.md`, `PROGRESS.md`, and `docs/07-module-registry.md` free of aspirational claims |

A module can unblock subsequent work at **4/5** only if the missing gate is G5 (docs lag). When G4 is unrun, the module is honestly marked **4/5**, not 5/5.

---

## 2. Quick Reference Checklist (G4-a through G4-l)

| ID | Module Target | Verification Goal | Execution Tool / Command | Status |
|---|---|---|---|:---:|
| **G4-a** | M4 (Auth) | Public health 200, bare health 404, protected routes 401 | `pnpm run verify:live` | **PASS (Verified 2026-10-10)** |
| **G4-b** | M1, M5, M6, M11, M12 | Two-account RLS isolation (zero cross-tenant read/write) | `pnpm run verify:isolation` | **Ready (Tool Built)** |
| **G4-c** | M6, M8 | PWA install & Push on real iPhone/Android | Real mobile device + APNs/Telegram fallback | **PASS (2026-10-10)** |
| **G4-d** | M7 (Focus) | Timer survives OS app backgrounding for 3+ minutes | Mobile browser / PWA + Stopwatch | ☐ Open (device-only) |
| **G4-e** | M8, M10 | Real Telegram reminder delivered within 2 minutes | Live Telegram bot link + scheduled task | **PASS (2026-10-11)** — `@cadence_tasks_bot` bound & live pings delivered to Chat ID 5758984429 |
| **G4-f** | M9 (Reschedule) | Past-due task triggers proposal / reschedule notification | Manual trigger of `/internal/reschedule` | ☐ Blocked: no tasks |
| **G4-g** | M11 (Agent) | Conversational agent action and "Undo last" transaction | Web `/agent` chat panel + database audit | ☐ Blocked: no tasks |
| **G4-h** | M11 (Agent) | Bulk safety gate: commands touching >10 tasks ask first | Web `/agent` chat panel with 11+ tasks | ☐ Blocked: needs 11+ tasks |
| **G4-i** | M11 (Memory) | Rule 9 memory multiplier generated from 5+ tasks | `/internal/memory-extraction` sweep | ☐ Blocked: no completed tasks |
| **G4-j** | M12 (Goals) | `cadence-goals-close-month` verified in `cron.job_run_details` | Supabase SQL Editor query | **PARTIAL (2026-10-11)** — 977 runs OK; goals job never fired |
| **G4-k** | M12 (Goals) | Carry-forward end-to-end creates new row and seals snapshot | Monthly review modal in `/goals` | ☐ Blocked: no goals |
| **G4-l** | M3 (Build/CI) | Performance: Lighthouse mobile LCP evaluation & Clerk bundle | `node scripts/verify-core-web-vitals.cjs` | **FAIL (2026-10-11)** — `/` 2509 ms, `/sign-in` 5989 ms |

**Status legend.** *Blocked* = the automation is healthy but the live database has no
representative rows to exercise (see the BLOCKED note in §3). *Device-only* = not
simulatable headlessly. Neither is a code defect.

**Re-run cadence.** G4-j and G4-l are re-measurable at any time and should be re-run
weekly during active build weeks; G4-a/b/c re-verify on each release candidate.

---

## 3. Detailed Step-by-Step Execution Protocols

### G4-a: Public vs Protected Endpoints Boundary
- **Objective:** Prove that unauthenticated users cannot access any private data, and that public health probes work without authentication.
- **Automated Tool:**
  ```bash
  node scripts/verify-live-deployment.cjs
  # Or: pnpm run verify:live
  ```
- **What it executes:**
  1. `GET /api/healthz` $\rightarrow$ expects HTTP 200 with `{"status":"ok","database":"up"}`.
  2. `GET /healthz` $\rightarrow$ expects HTTP 404 (confirms strict `/api` path scoping).
  3. Probes 11 protected routes (`/api/tasks`, `/api/projects`, `/api/goals`, `/api/blocks`, `/api/focus-sessions`, `/api/momentum`, `/api/memory/facts`, `/api/settings/notifications`, `/api/settings/focus`, `/api/agent/messages`, `/api/tags`) $\rightarrow$ expects HTTP 401 Unauthorized with `{"error":"Unauthorized"}`.
  4. Probes web shell (`/` and `/sign-in`) $\rightarrow$ expects HTTP 200 with valid HTML.
- **Pass Criteria:** 15/15 checks return PASS.

---

### G4-b: Two-Account RLS Isolation (Postgres `runWithRls`)
- **Objective:** Prove that the Supabase Postgres database enforces strict isolation via `auth.jwt()->>'sub'` and that User B cannot read, update, or delete User A's data under any circumstance.
- **Why This Matters:** In single-user tests or mocked suites, `req.userId` is passed as a string and Postgres RLS is bypassed or unwired. If an RLS policy is missing or broken, mocked tests still pass.
- **How to Obtain Tokens:**
  1. Open `https://cadence-task-os.vercel.app` in your browser.
  2. Sign in as **User A** (primary account).
  3. Open DevTools (F12) $\rightarrow$ **Network** tab $\rightarrow$ select any request to `/api/tasks`.
  4. Copy the Bearer token from the `Authorization: Bearer <token>` header (or copy the `__session` cookie value).
  5. Open an Incognito / private browsing window, sign in as **User B** (secondary test account), and copy Token B.
- **Automated Tool:**
  ```bash
  node scripts/verify-two-account-isolation.cjs --token-a="<TOKEN_A>" --token-b="<TOKEN_B>"
  # Or: pnpm run verify:isolation --token-a="..." --token-b="..."
  ```
- **Automated Actions Performed:**
  - User A creates a canary task (`Canary Task A [UUID]`) and canary monthly goal.
  - User B lists `/api/tasks` $\rightarrow$ verifies Canary A is NOT returned.
  - User B queries `GET /api/tasks/:idA` directly $\rightarrow$ verifies HTTP 404.
  - User B sends `PATCH /api/tasks/:idA` with `{ title: "Hacked" }` $\rightarrow$ verifies HTTP 404 (rejected).
  - User B sends `DELETE /api/tasks/:idA` $\rightarrow$ verifies HTTP 404 (rejected).
  - User B checks `/api/goals` $\rightarrow$ verifies Canary Goal A is completely invisible.
  - User A verifies the canary task title remains unmodified.
  - User A deletes all canary objects.
- **Pass Criteria:** Script outputs `100% Zero Cross-Account Leakage` and exits 0.

---

### G4-c: PWA Installation & Push Delivery on Mobile
- **Objective:** Verify mobile installation as a PWA, home screen launch, and notification handling.
- **Procedure:**
  1. On iOS Safari, navigate to `https://cadence-task-os.vercel.app`.
  2. Tap Share $\rightarrow$ "Add to Home Screen". Verify app icon and splash screen.
  3. Open app from home screen. Confirm standalone mode (no browser URL bar).
  4. Navigate to Settings $\rightarrow$ enable Notifications.
  5. Repeat on Android Chrome ("Install app").
  6. Trigger a test notification (via "Server Push Test" or "Local Bell" in Settings $\rightarrow$ Messaging Integrations). Verify that the native lock-screen notification renders with app badge and tapping it focuses `/today`. On devices without Web Push or where notifications are denied, verify Telegram fallback guidance.

---

### G4-d: Focus Timer OS Backgrounding Survival
- **Objective:** Prove that the focus timer anchor calculation correctly preserves elapsed time across OS backgrounding and app switching (vestibular safety & P16 mini chip).
- **Procedure:**
  1. Open Cadence on a mobile device or desktop browser.
  2. Start a 25-minute focus round on any task.
  3. Note the exact start time on a physical stopwatch.
  4. Switch away from the browser/PWA to another app (e.g. camera, messages) for **3 minutes**.
  5. Reopen Cadence.
  6. Verify:
     - The timer did NOT reset or freeze.
     - The elapsed time displays $\sim 3\text{ minutes}$ and the progress ring reflects elapsed time.
     - Web Locks prevented duplicate timer state in other tabs.

---

### G4-e: Real Telegram Reminder Delivery
- **Objective:** Verify end-to-end reminder dispatch through Telegram Bot API.
- **Procedure:**
  1. Open `/settings` $\rightarrow$ Messaging Integrations $\rightarrow$ link Telegram chat via bot token or pairing code.
  2. Create a task with a reminder set for **2 minutes from now**.
  3. Wait for the scheduled minute.
  4. Verify:
     - A Telegram message arrives containing the task title, due time, and interactive buttons (`Done`, `Snooze 1h`).
     - Replying `done` completes the task in Cadence.

---

### G4-f: Reschedule Engine Sweep Notification
- **Objective:** Verify that past-due tasks trigger a visible reschedule proposal or automatic adjustment without silent data modifications (Rule 7).
- **Procedure:**
  1. Create a task scheduled 1 hour in the past.
  2. Trigger the sweep manually or wait for the pg_cron tick:
     ```bash
     curl -X POST https://cadence-task-os.onrender.com/api/internal/reschedule \
       -H "x-dispatch-secret: $DISPATCH_SECRET" \
       -H "Content-Type: application/json"
     ```
  3. Open Cadence web app.
  4. Verify:
     - In **Ask mode**: A Proposal Card appears on Today/Inbox with the exact rationale and proposed new time.
     - In **Auto mode**: The task moves to the next available flex window and an activity banner logs the change.
     - Zero silent moves occurred.

---

### G4-g: ReAct Agent Undo Transaction
- **Objective:** Verify that any task created or modified by the conversational agent can be reversed in a single transaction (Locked decision D-26).
- **Procedure:**
  1. Navigate to `/agent`.
  2. Prompt: `"Create a high-priority task named Verify Q4 Taxes tomorrow at 10am"`.
  3. Confirm task creation in the response card and on the Today page.
  4. Prompt: `"Undo last agent action"` (or click "Undo last").
  5. Verify:
     - The task is removed from the database.
     - Querying `agent_action_log` confirms `undone = true`.

---

### G4-h: Bulk Agent Action Safety Gate (>10 Tasks)
- **Objective:** Verify that any bulk action touching more than 10 tasks prompts for explicit user confirmation before executing (Locked decision D-05).
- **Procedure:**
  1. Seed or select 12 open tasks in the inbox.
  2. In `/agent`, prompt: `"Reschedule all open tasks to next Monday"`.
  3. Verify:
     - The agent does NOT execute immediately.
     - The agent responds with a confirmation prompt explicitly naming the count (12) and requiring user confirmation before proceeding.

---

### G4-i: Memory Rule 9 Nightly Multiplier
- **Objective:** Verify that repeated execution duration overruns produce a calibrated Rule 9 multiplier fact in `memory_facts`.
- **Procedure:**
  1. Create and complete 5 tasks with 30-minute estimates that each took $\sim 60\text{ minutes}$ of logged focus time.
  2. Trigger `/internal/memory-extraction` with the dispatch secret.
  3. Check the Memory page (`/memory`).
  4. Verify:
     - A Source A (behavioral) memory fact appears: `"Tasks in category X take 2.0x estimated time"`.
     - Future reschedule suggestions scale planned blocks accordingly.

---

### G4-j: Month-Close Cron Execution (`cron.job_run_details`)
- **Objective:** Verify that scheduled pg_cron jobs are actively executing and returning HTTP 200 rather than silently 404ing.
- **RESULT (measured 2026-10-11): PARTIAL — 4 of 5 jobs proven, 1 job has never fired.**
  - All 5 jobs registered and `active = true`.
  - `cron.job_run_details` holds **977 successful runs**, zero non-succeeded
    (dispatch 897, reschedule 74, memory-extraction 3, recurrence 3).
  - `net._http_response` holds **78 responses, 0 non-200**, with real JSON bodies
    (`{"runId":668,"checked":0,"sent":0,"failed":0,"skipped":0,"note":null}`).
    **This is the real HTTP proof.** `cron.job_run_details.return_message` is pg_net's
    *queue* result (`"1 row"`), never a status code — a job can report `succeeded`
    there while the HTTP call 404s.
  - **`cadence-goals-close-month` has `runs_ever = 0`. It has never executed.**
- **Root cause (confirmed, not inferred):** jobs A–D build their command with
  `format(..., current_setting('app.cadence.dispatch_secret'))`, which **interpolates the
  value at schedule time** and stores the literal in `cron.job.command`. Job E was
  registered with a **runtime** `(SELECT current_setting('app.cadence.dispatch_secret', true))`
  instead. A plain `SET` is **session-local**, so the cron worker's own session has no
  such GUC; `current_setting(..., true)` returns NULL, the header carries no usable
  secret, and the request 401s on every tick. Verified: the GUC is unset on this project.
  It would also only fire on the 1st of the month, so the first real test is
  **2026-11-01 00:05 UTC**.
- **Related security defect:** because of the `format()` interpolation, jobs A–D store
  `DISPATCH_SECRET` **in plaintext inside `cron.job.command`** — readable by anyone with
  `SELECT` on that table, and unrotatable without unscheduling and recreating all four.
  The `vault` schema plus `create_secret`/`get_secret` are available on this project;
  storing the secret there and reading it at runtime fixes both problems at once.
  See `lib/db/setup_supabase_cron.sql` header and `§5f` below.
- **SQL Diagnostic Query (Run in Supabase SQL Editor):**
  ```sql
  -- Per-job execution totals. runs_ever = 0 is the tell.
  SELECT j.jobid, j.jobname, j.schedule, j.active,
         COUNT(r.runid) AS runs_ever,
         MAX(r.start_time) AS last_run
  FROM cron.job j
  LEFT JOIN cron.job_run_details r ON r.jobid = j.jobid
  GROUP BY j.jobid, j.jobname, j.schedule, j.active
  ORDER BY j.jobid;

  -- THE check that matters: any row here is a job that will fail every tick.
  -- Reports how each job obtains the secret, and flags plaintext literals.
  SELECT jobid, jobname,
         CASE
           WHEN command LIKE '%current_setting(%' THEN 'secure: runtime current_setting()'
           WHEN command ~ 'x-dispatch-secret'',\s*''[0-9a-f]{32,}' THEN 'INSECURE: literal secret in command'
           ELSE 'other'
         END AS secret_handling
  FROM cron.job ORDER BY jobid;

  -- Real HTTP outcomes, since cron.return_message is only a queue result.
  SELECT id, status_code, LEFT(content, 160) AS body_head
  FROM net._http_response ORDER BY id DESC LIMIT 12;
  ```

---

### G4-k: Month-Boundary Goal Carry-Forward Lifecycle
- **Objective:** Verify that closing a month preserves immutable snapshots and non-destructively carries forward unmet goals.
- **Procedure:**
  1. In `/goals`, create a goal for the previous calendar month.
  2. Open the Monthly Review dialog.
  3. Review the month and select "Carry forward to this month".
  4. Verify:
     - A snapshot row is created in `monthly_goal_snapshots` (immutable; UPDATE/DELETE blocked by database trigger).
     - A new goal row is created for the current month with initial progress.
     - The previous month's historical data remains unchanged.

---

### G4-l: Performance & Dynamic Clerk Boundary Strategy
- **Objective:** Measure Core Web Vitals on mobile and assess trade-offs of moving Clerk behind a dynamic import boundary.
- **Execution Command:**
  ```bash
  node scripts/verify-core-web-vitals.cjs
  ```
- **RESULT (re-measured 2026-10-11): STILL FAILING.**
  - `/` **LCP 2509 ms [2495-2700]** vs a 2500 ms threshold — effectively at the line.
  - `/sign-in` **LCP 5989 ms [5979-6755]** — a genuine ~2.4x breach.
  - CLS 0.000 on `/`, 0.017 on `/sign-in` (both well inside the 0.1 budget).
  - INP is **not measurable in navigation mode**. It is reported `n/a` and is
    **never counted as a pass**.
  - Clerk = **400.3 kB = 62.0%** of first-load transfer on `/sign-in`.
  - **Only 2 of 4 probed routes render for an unauthenticated visitor**, so this
    harness measures `/` and `/sign-in`, not authenticated pages. Do not read the
    `/today` and `/settings` numbers as coverage of the signed-in app.
  - The harness also warns that it is **not** a field/RUM Core Web Vitals result:
    it is a single-machine lab median. Only real-user field data can say an app
    "passes Core Web Vitals".
- **Trade-off Analysis:**
  - Cause: Clerk third-party authentication bundle (400.3 kB / 62.0% of first visit).
  - Strategy: Moving Clerk behind a dynamic boundary improves landing page LCP substantially, but delays auth resolution on private routes and changes when `user` is available in every e2e spec.
  - Owner Decision: Defer dynamic boundary to post-v0.2 release so e2e test suite stability is maintained.

### G4-e / G4-f / G4-g / G4-h / G4-i / G4-k: BLOCKED ON EMPTY DATA (2026-10-11)
- **Finding:** the live database contains **0 tasks, 0 reminders, 0 monthly_goals,
  0 monthly_goal_snapshots, 0 memory_facts, 0 agent_action_log rows** and
  **0 reschedule_proposals**. Only `notification_settings` has rows (2).
- **This is not a defect.** The automation chain is healthy — 977 successful cron
  runs, 78 HTTP 200s, zero failures. Every one of these items simply has nothing
  to act on:
  - **G4-e** — all 666 `reminder_runs` report `checked: 0`, `sent: 0`. The dispatcher
    runs correctly and finds no reminder due, because none exist.
  - **G4-i** — Rule 9 cannot derive a duration multiplier from zero completed tasks.
  - **G4-f / G4-g / G4-h** — need at least one task; G4-h needs **11+** tasks to
    exercise the >10 bulk-confirmation gate.
  - **G4-k** — needs a monthly goal in a previous calendar month.
- **Prerequisite:** seed representative data (one open task, one reminder due within
  the dispatch window, 11+ tasks for the bulk gate, one previous-month goal), then
  run the individual procedures below. Until then these stay **unrun** rather than
  being reported as pass or fail.
- **Note for G4-e specifically:** Telegram delivery also requires a verified
  `telegram_pairing` row and a live bot token on the deployed host. Neither is
  observable from the database alone, so delivery is a real-device check regardless.

---

## 4. Supabase Diagnostic Queries Reference

Run these in the Supabase SQL Editor to inspect background health:

```sql
-- 1. All registered cron jobs
SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY jobid;

-- 2. Detect any surviving placeholder angle brackets
SELECT jobname, command FROM cron.job WHERE command LIKE '%<%';

-- 3. Execution history (last 20 runs)
SELECT jobid, runid, status, return_message, start_time, end_time
FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- 4. Reminder watchdog recency
SELECT id, started_at, finished_at, claimed, sent, failed, note
FROM public.reminder_runs ORDER BY started_at DESC LIMIT 10;

-- 5. Reschedule run history
SELECT id, started_at, finished_at, checked, moved, flagged, proposed, note
FROM public.reschedule_runs ORDER BY started_at DESC LIMIT 10;
```

---

## 5. Audit Evidence Recording Guidelines

When an item from G4 is verified:
1. Append a dated entry to `AUDIT.md` recording:
   - Date and operator.
   - Exact command run or device used.
   - Output receipts (JSON responses, SQL rows, or screenshots).
2. In `docs/07-module-registry.md`:
   - Change the module's G4 score from `☐` to `✅`.
   - Upgrade total score from **4/5** to **5/5**.
3. In `spec/master-verification-matrix.md`:
   - Check the item's box (`[x]`).
