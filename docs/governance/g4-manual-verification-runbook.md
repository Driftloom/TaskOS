# G4 Manual Verification & Production Certification Runbook

> **File provenance:** Synthesized 2026-10-10 to provide deterministic, reproducible procedures for all 12 manual items in the G4 checklist (`docs/07-module-registry.md §4`, `spec/master-verification-matrix.md §3`).
> **Core Principle:** The 12 automated verification gates prove internal code consistency; G4 proves the system functions reliably in the physical world across networks, OS boundaries, hardware clocks, and real user identities.

---

## 1. The 5-Gate Framework & Why G4 Matters

| Gate | Scope | Automated? | Proof Mechanism |
|---|---|:---:|---|
| **G1** | Code Quality | ✅ Yes | 830 Vitest tests passing, 0 stubs, 0 mocks in production code |
| **G2** | Schema Integrity | ✅ Yes | Migrations `0000`–`0018` applied with matching column types & check constraints |
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
| **G4-c** | M6, M8 | PWA install & Push on real iPhone/Android | Real mobile device + APNs/Telegram fallback | ☐ Open |
| **G4-d** | M7 (Focus) | Timer survives OS app backgrounding for 3+ minutes | Mobile browser / PWA + Stopwatch | ☐ Open |
| **G4-e** | M8, M10 | Real Telegram reminder delivered within 2 minutes | Live Telegram bot link + scheduled task | ☐ Open |
| **G4-f** | M9 (Reschedule) | Past-due task triggers proposal / reschedule notification | Manual trigger of `/internal/reschedule` | ☐ Open |
| **G4-g** | M11 (Agent) | Conversational agent action and "Undo last" transaction | Web `/agent` chat panel + database audit | ☐ Open |
| **G4-h** | M11 (Agent) | Bulk safety gate: commands touching >10 tasks ask first | Web `/agent` chat panel with 11+ tasks | ☐ Open |
| **G4-i** | M11 (Memory) | Rule 9 memory multiplier generated from 5+ tasks | `/internal/memory-extraction` sweep | ☐ Open |
| **G4-j** | M12 (Goals) | `cadence-goals-close-month` verified in `cron.job_run_details` | Supabase SQL Editor query | ☐ Open |
| **G4-k** | M12 (Goals) | Carry-forward end-to-end creates new row and seals snapshot | Monthly review modal in `/goals` | ☐ Open |
| **G4-l** | M3 (Build/CI) | Performance: Lighthouse mobile LCP evaluation & Clerk bundle | `node scripts/verify-core-web-vitals.cjs` | Measured (5.9s) |

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
  6. Trigger a test notification. On iOS, if Web Push is suspended or denied, verify that the Telegram fallback toggle is suggested.

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
- **SQL Diagnostic Query (Run in Supabase SQL Editor):**
  ```sql
  SELECT
    jobid,
    runid,
    job_pid,
    status,
    return_message,
    start_time,
    end_time
  FROM cron.job_run_details
  ORDER BY start_time DESC
  LIMIT 25;
  ```
- **What to look for:**
  - Status must be `succeeded`.
  - `return_message` must reflect successful HTTP response from `net.http_post`.
  - Confirm `cadence-goals-close-month` appears in the schedule with valid target URL.

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
- **Trade-off Analysis:**
  - Current LCP: $\sim 5.9\text{s}$ (budget 2.5s).
  - Cause: Clerk third-party authentication bundle (359.3 kB / 55.8% of first visit).
  - Strategy: Moving Clerk behind a dynamic boundary improves landing page LCP to $<2.0\text{s}$, but delays auth resolution on private routes.
  - Owner Decision: Defer dynamic boundary to post-v0.2 release so e2e test suite stability is maintained.

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
