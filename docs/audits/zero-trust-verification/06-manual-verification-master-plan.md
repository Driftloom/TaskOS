# 06 — Manual Verification Master Plan (Phases A through J)

> **Zero-Trust Step-by-Step Manual Test Protocol**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Executor:** Human Product Owner / Test Lead (Rohit)  
> **Rule:** Every test below is practical, explicit, ordered, reproducible, and marked `NOT RUN — MANUAL EXECUTION REQUIRED`. Do not fabricate actual results.  

---

## Phase A: Environment Pre-Flight & Health Readiness

### TC-A01: Public Liveness Probe Response
- **Preconditions:** Express API server running on port 5000 (`pnpm --filter @workspace/api-server run dev`).
- **Steps:**
  1. Open terminal or browser to `http://localhost:5000/api/healthz`.
  2. Inspect HTTP response status code and JSON body.
- **Expected Result:** HTTP 200 OK. JSON payload: `{"status":"ok","database":"up","uptimeSeconds":<number>}`.
- **Evidence to Capture:** cURL response header + body.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

### TC-A02: Protected Route Unauthenticated 401 Rejection
- **Preconditions:** API server running; no `Authorization` header provided.
- **Steps:**
  1. Execute `curl -i http://localhost:5000/api/tasks`.
  2. Execute `curl -i http://localhost:5000/api/settings/notifications`.
  3. Execute `curl -i http://localhost:5000/api/goals`.
- **Expected Result:** HTTP 401 Unauthorized across all endpoints. JSON payload: `{"error":"Unauthorized"}`.
- **Evidence to Capture:** Terminal cURL output showing 401 status.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

---

## Phase B: Authentication, Identity & Onboarding

### TC-B01: Clerk Authentication & Token Bridge Handshake
- **Preconditions:** Web frontend running on `http://localhost:5173`.
- **Steps:**
  1. Navigate to `http://localhost:5173/sign-in`.
  2. Complete Google OAuth or email sign-in.
  3. Open DevTools Network tab. Filter by `Fetch/XHR`.
  4. Inspect the first request sent to `/api/tasks`.
- **Expected Result:** Request header contains `Authorization: Bearer <clerk_session_jwt>`. Response is HTTP 200 JSON.
- **Evidence to Capture:** DevTools Request Headers showing Bearer token.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

### TC-B02: Cross-Tenant RLS Claim Resolution
- **Preconditions:** Two distinct Clerk accounts (User A and User B).
- **Steps:**
  1. Sign in as User A. Create task "User A Private Objective". Record task ID (e.g. 101).
  2. Sign out. Sign in as User B.
  3. In DevTools Console, execute:
     `fetch('/api/tasks/101', { headers: { Authorization: 'Bearer ' + (await window.Clerk.session.getToken()) } })`.
- **Expected Result:** HTTP 404 Not Found (RLS and app-level filter deny row access). User A's task title is never returned.
- **Evidence to Capture:** Console response object showing 404 status.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

---

## Phase C: Fast Task Capture & Outbox Offline Resiliency

### TC-C01: Natural Language Quick Capture Parsing
- **Preconditions:** User signed in on `/today`.
- **Steps:**
  1. Press keyboard shortcut `N` to open `QuickCaptureSheet`.
  2. Type: `Prepare Q4 Board presentation tomorrow 4pm !high #finance 45m`.
  3. Inspect parsed entity chips rendered below input.
- **Expected Result:**
  - Date chip: Tomorrow's date at 16:00.
  - Priority chip: High (Flames icon).
  - Tag chip: `#finance`.
  - Duration chip: `45m`.
  - Title stripped cleanly to: `Prepare Q4 Board presentation`.
- **Evidence to Capture:** Screenshot of QuickCaptureSheet with parsed chips.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

### TC-C02: Offline Capture Outbox Queuing & Auto-Replay
- **Preconditions:** QuickCaptureSheet open.
- **Steps:**
  1. In DevTools Network tab, set Throttling to "Offline".
  2. Input task `Review offline sync protocols` and press Enter.
  3. Check `localStorage.getItem('cadence.capture.outbox.v1')`.
  4. Switch Network Throttling back to "No throttling" (Online).
- **Expected Result:**
  - While offline, task queues in localStorage without error toast.
  - Upon reconnection, `window.online` listener triggers auto-replay.
  - Outbox drains to empty array `[]`.
  - Task appears in today's task list.
- **Evidence to Capture:** localStorage inspection before and after online transition.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

---

## Phase D: Task Lifecycle, Subtasks & Hierarchy

### TC-D01: Subtask Cyclic Dependency Rejection
- **Preconditions:** Task A exists.
- **Steps:**
  1. Create Task B with parent set to Task A.
  2. Attempt to update Task A's parent to Task B via `PATCH /api/tasks/:idA` with `{ "parentId": idB }`.
- **Expected Result:** HTTP 400 Bad Request. JSON payload: `{"error":"Cannot set parent task: cycle detected"}`.
- **Evidence to Capture:** Network tab PATCH response payload.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

### TC-D02: Parent Task Deletion Constraint Enforcement
- **Preconditions:** Task A has child Task B.
- **Steps:**
  1. Click delete on Task A in the task list.
  2. Confirm deletion dialog.
- **Expected Result:** Operation fails or UI alerts user that subtasks must be reparented/deleted first (`ON DELETE RESTRICT` foreign key constraint prevents silent subtask orphaned deletion).
- **Evidence to Capture:** Toast error message or server response.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

---

## Phase E: Calendar Time-Blocking & Collision Detection

### TC-E01: Time-Block Placement & Boundary Validation
- **Preconditions:** Navigate to `/calendar` day view.
- **Steps:**
  1. Click and drag on the 10:00 AM slot to 11:30 AM to schedule Task A.
  2. Inspect network request to `POST /api/blocks`.
  3. Verify `end_at > start_at` constraint.
- **Expected Result:** HTTP 201 Created. Time block renders in 10:00–11:30 slot with duration "1h 30m".
- **Evidence to Capture:** DevTools POST payload and rendered calendar block.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

---

## Phase F: Focus Timer, Wall-Clock Anchor & Web Locks Audio

### TC-F01: Focus Timer Background Suspension Survival (G4-d)
- **Preconditions:** Open `/focus` on a physical mobile device or browser tab.
- **Steps:**
  1. Select Task A and press "Start Focus" (25-minute Pomodoro).
  2. Confirm timer digits begin counting down (`24:59...`).
  3. Lock the mobile device screen or switch to a background app for exactly 3 minutes.
  4. Unlock phone and bring Cadence back to the foreground.
- **Expected Result:** Timer displays `21:59` (or elapsed wall-clock time derived from `runAnchor`), NOT `24:58` (frozen) and NOT resetting to `25:00`.
- **Evidence to Capture:** Physical photo/screenshot with external clock comparison.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

### TC-F02: Multi-Window Audio Master Lock Election
- **Preconditions:** Open Cadence in Tab A and Tab B simultaneously.
- **Steps:**
  1. In Tab A, start a focus timer with 5 seconds remaining.
  2. Switch focus to Tab B.
  3. Wait for timer countdown to reach 00:00.
- **Expected Result:** Web Locks API elects Tab A as master. Completion chime rings **exactly ONCE** through speakers, not doubled or echoing across tabs.
- **Evidence to Capture:** Audio output observation + DevTools console Web Locks log.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

---

## Phase G: Auto-Reschedule Engine & Sweep Verification

### TC-G01: Past-Due Task Auto-Reschedule (Rule 1–6)
- **Preconditions:** Seed past-due task due yesterday with `automationMode: 'auto'`.
- **Steps:**
  1. Trigger manual sweep via `POST /api/internal/reschedule` with `x-dispatch-secret`.
  2. Inspect `reschedule_runs` row created.
  3. Query `GET /api/tasks/:id`.
- **Expected Result:** Task `dueAt` updated to today; `rescheduleCount` incremented from 0 to 1; move logged in audit trail.
- **Evidence to Capture:** SQL query comparing `due_at` before and after sweep.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

### TC-G02: Auto-Reschedule Cap & Downgrade to Ask (Rule D-03 & D-04)
- **Preconditions:** Seed task with `rescheduleCount: 5`.
- **Steps:**
  1. Trigger `POST /api/internal/reschedule`.
  2. Query `GET /api/tasks/:id` and `GET /api/reschedule/proposals`.
- **Expected Result:** Task `dueAt` is **NOT MOVED**. Task is flagged "needs attention"; a candidate proposal is inserted into `reschedule_proposals` awaiting manual approval.
- **Evidence to Capture:** `reschedule_proposals` table row for task ID.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

---

## Phase H: Telegram Bot Two-Way Integration

### TC-H01: Inbound Webhook Two-Way Command Verification
- **Preconditions:** Telegram bot paired with User's `telegramChatId`.
- **Steps:**
  1. In Telegram, send message: `list today`.
  2. Inspect Telegram bot reply.
  3. Send message: `done <taskId>`.
- **Expected Result:** Bot replies with formatted list of today's tasks. Sending `done <taskId>` marks task complete in Cadence web app within 2 seconds.
- **Evidence to Capture:** Telegram chat screenshot + web app task list auto-refresh.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

---

## Phase I: AI Agent, Tool Confirmation & Memory UI

### TC-I01: Bulk Reschedule >10 Task Confirmation Safety Gate (D-05)
- **Preconditions:** User has 12 open tasks. Open `/agent`.
- **Steps:**
  1. Type message: `Reschedule all my open tasks to next week`.
  2. Inspect Agent response.
- **Expected Result:** Agent does **NOT** immediately mutate all 12 tasks. It returns a confirmation prompt / surfaces `ActionPreview` modal specifying 12 tasks to be moved.
- **Evidence to Capture:** Screenshot of agent chat showing confirmation gate.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

### TC-I02: Memory Transparency & Decay Status (`/memory`)
- **Preconditions:** Navigate to `/memory`.
- **Steps:**
  1. Inspect displayed fact cards.
  2. Check confidence badge and source indicator (Behavioral vs Conversational).
- **Expected Result:** Facts render with category badges, evidence counts, and calculated decay percentages.
- **Evidence to Capture:** Screenshot of `/memory` page cards.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

---

## Phase J: Monthly Goals & Month-Close Ritual Immutability

### TC-J01: Goal Snapshot Immutability Trigger
- **Preconditions:** Complete month-close ritual generating a row in `monthly_goal_snapshots`.
- **Steps:**
  1. Open Supabase SQL Editor.
  2. Attempt `UPDATE public.monthly_goal_snapshots SET final_actual = 9999 WHERE id = 1;`.
  3. Attempt `DELETE FROM public.monthly_goal_snapshots WHERE id = 1;`.
- **Expected Result:** Database raises exception: `monthly_goal_snapshots rows are immutable and cannot be UPDATE/DELETE`.
- **Evidence to Capture:** PostgreSQL error console output.
- **Actual Result:** `NOT RUN — MANUAL EXECUTION REQUIRED`

---
*Manual verification master plan established. Execution reserved for product owner.*
