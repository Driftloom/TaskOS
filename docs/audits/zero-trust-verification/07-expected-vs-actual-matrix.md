# 07 — Expected vs. Actual Result Matrix

> **Zero-Trust Results Matrix**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Zero-Trust Test Lead  
> **Invariant:** Actual results are categorized strictly as observed. Manual tests are marked `NOT RUN — MANUAL EXECUTION REQUIRED`. No fabricated execution evidence.  

---

## 1. Automated Verification Gates (Observed Execution)

| Test ID | Gate / Action | Target Scope | Expected Result | Measured Actual Result | Evidence Source |
|---|---|---|---|---|---|
| **GATE-01** | `pnpm run typecheck` | Monorepo TS | Zero type errors across packages | **PASS** — Zero errors | `scripts/run-gates.cjs` (Gate 1) |
| **GATE-02** | `pnpm run lint:tokens` | Design tokens | 0 baseline debt, 151 files scanned | **PASS** — 151/151 files compliant | `scripts/lint-tokens.cjs` (Gate 2) |
| **GATE-03** | `pnpm run lint` | ESLint | Zero linting errors | **PASS** — Clean run | `scripts/run-gates.cjs` (Gate 3) |
| **GATE-04** | `pnpm run verify:contrast` | Tokens JSON | 93 color pairs pass WCAG AA | **PASS** — 93/93 pairs compliant | `scripts/verify-contrast.cjs` (Gate 4) |
| **GATE-05** | `pnpm run codegen:check` | OpenAPI Spec | Zero checksum drift in generated files | **PASS** — 0 diffs against generated | `scripts/run-gates.cjs` (Gate 5) |
| **GATE-06** | `pnpm run build:api` | api-server | Bundles to `dist/index.mjs` cleanly | **PASS** — Esbuild bundle succeeded | `scripts/run-gates.cjs` (Gate 6) |
| **GATE-07** | `pnpm run build:web` | cadence app | Vite production build succeeds | **PASS** — Vite build succeeded | `scripts/run-gates.cjs` (Gate 7) |
| **GATE-08** | `pnpm run verify:no-dead-classes` | CSS classes | No unreferenced custom utility classes | **PASS** — Zero dead classes | `scripts/run-gates.cjs` (Gate 8) |
| **GATE-09** | `pnpm run verify:cron-routes` | Cron routes | Cron triggers match Express routers | **PASS** — 5 routes matched | `scripts/verify-cron-routes.cjs` (Gate 9) |
| **GATE-10** | `pnpm run verify:encoding` | UTF-8 scan | Zero CP1252 mojibake characters | **PASS** — 0 corrupted characters | `scripts/scan-mojibake.cjs` (Gate 10) |
| **GATE-11** | `pnpm run verify:auth-surface` | Auth styling | Contrast passes WCAG AA | **PASS (8 WARNs)**: CTA fill vs card 2.14:1 | `scripts/verify-auth-surface.cjs` (Gate 11) |
| **GATE-12** | `pnpm run test` | Vitest suites | 856 tests pass across 63 files | **PASS** — 856 passed (407 api, 439 web, 10 spec) | `vitest run` (Gate 12) |

---

## 2. Manual & Runtime Verification Program (Awaiting Owner Execution)

| Test ID | Domain & Action | Step / Input | Expected Result | Zero-Trust Actual Result | Required Evidence to Capture |
|---|---|---|---|---|---|
| **TC-A01** | Liveness Probe | `GET /api/healthz` | HTTP 200 `{"status":"ok","database":"up"}` | `NOT RUN — MANUAL EXECUTION REQUIRED` | cURL response header + JSON body |
| **TC-A02** | 401 Boundary | `GET /api/tasks` (No Auth) | HTTP 401 `{"error":"Unauthorized"}` | `NOT RUN — MANUAL EXECUTION REQUIRED` | HTTP response status code |
| **TC-B01** | Clerk Sign-In | Login via Google OAuth on `/sign-in` | Session established, Bearer token passed | `NOT RUN — MANUAL EXECUTION REQUIRED` | DevTools Network Authorization header |
| **TC-B02** | RLS Cross-Tenant | User B fetches User A's task ID | HTTP 404 Not Found (Zero leakage) | `NOT RUN — MANUAL EXECUTION REQUIRED` | DevTools Network 404 response |
| **TC-C01** | Quick Capture | Input NL string with date, tag, priority | Chips parsed; clean title extracted | `NOT RUN — MANUAL EXECUTION REQUIRED` | Screenshot of QuickCaptureSheet chips |
| **TC-C02** | Offline Outbox | Create task in DevTools "Offline" mode | Draft queues in localStorage, auto-replays on reconnect | `NOT RUN — MANUAL EXECUTION REQUIRED` | localStorage key inspection + task row |
| **TC-D01** | Subtask Cycle | Set Task A parent to Child Task B | HTTP 400 "Cannot set parent task: cycle detected" | `NOT RUN — MANUAL EXECUTION REQUIRED` | DevTools PATCH response body |
| **TC-D02** | Subtask Delete | Delete parent task with existing subtasks | Operation blocked by `ON DELETE RESTRICT` constraint | `NOT RUN — MANUAL EXECUTION REQUIRED` | Error dialog or toast notification |
| **TC-E01** | Calendar Block | Drag 10:00–11:30 block on `/calendar` | HTTP 201; block renders with 1h 30m label | `NOT RUN — MANUAL EXECUTION REQUIRED` | Rendered calendar block screenshot |
| **TC-F01** | Focus Timer (G4-d)| 25m focus round; phone locked 3 minutes | Wall-clock elapsed time displays 21:59 upon resume | `NOT RUN — MANUAL EXECUTION REQUIRED` | Physical phone photo comparing elapsed time |
| **TC-F02** | Multi-Tab Audio | Timer elapses with 2 open tabs | Completion chime sounds on master tab only | `NOT RUN — MANUAL EXECUTION REQUIRED` | Web Locks console log + single chime |
| **TC-G01** | Auto-Reschedule | Sweep past-due task due yesterday | Task `due_at` moved to today; rescheduleCount = 1 | `NOT RUN — MANUAL EXECUTION REQUIRED` | SQL query of tasks row before/after |
| **TC-G02** | Reschedule Cap | Sweep task with rescheduleCount = 5 | Task not moved; proposal inserted in proposals | `NOT RUN — MANUAL EXECUTION REQUIRED` | `reschedule_proposals` table row |
| **TC-H01** | Telegram Bot | Send `done <taskId>` via Telegram | Task completes in web app within 2 seconds | `NOT RUN — MANUAL EXECUTION REQUIRED` | Telegram screenshot + app UI refresh |
| **TC-I01** | Agent Bulk Gate | Request agent move 12 open tasks | Agent halts mutations; surfaces confirmation | `NOT RUN — MANUAL EXECUTION REQUIRED` | Chat screenshot of ActionPreview modal |
| **TC-I02** | Memory UI | Inspect cards on `/memory` | Shows confidence, evidence count, decay | `NOT RUN — MANUAL EXECUTION REQUIRED` | Screenshot of `/memory` fact cards |
| **TC-J01** | Goal Immutability | SQL UPDATE on `monthly_goal_snapshots` | PostgreSQL trigger raises exception | `NOT RUN — MANUAL EXECUTION REQUIRED` | PostgreSQL exception console output |

---
*Matrix generated under zero-trust discipline. All manual rows pending live owner execution.*
