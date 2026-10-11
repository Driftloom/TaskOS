# 04 — Master Module, Router & Surface Inventory

> **Zero-Trust Inventory & Classification Audit**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Principal Architect & Test Lead  

---

## 1. Classification Taxonomy

Every module, route, and capability is classified under strict Zero-Trust definitions:
- **`REAL`:** Fully implemented in source code with persistent database storage, business logic, and test coverage.
- **`MOCKED` / `STUBBED`:** Returns hardcoded fixtures, placeholder responses, or mock delegates.
- **`PARTIAL`:** Core logic exists but critical edge cases, background pipelines, or secondary invariants are missing.
- **`UI_ONLY`:** Interface components rendered without persistent API integration or with volatile local storage only.
- **`BACKEND_ONLY`:** API endpoints or background jobs functional without user-facing interface representation.
- **`UNIMPLEMENTED`:** Specified in architectural contracts or design prompts but absent from source code.
- **`DEFERRED`:** Explicitly postponed by architectural decision (e.g. D-24).

---

## 2. API Server Express 5 Router Inventory (19 Routers / 84+ Endpoints)

| # | Router Module | Path Prefix | Handled Operations & Endpoints | Auth & Isolation Policy | Zero-Trust Status |
|---|---|---|---|---|---|
| **01** | `health.ts` | `/api/healthz` | `GET /healthz` (checks Postgres `SELECT 1`, returns uptime) | Public (No Auth) | **REAL** |
| **02** | `tasks.ts` | `/api/tasks` | `GET /tasks`, `POST /tasks`, `GET /tasks/summary`, `GET /tasks/:id`, `PATCH /tasks/:id`, `DELETE /tasks/:id`, `POST /tasks/:id/complete`, `POST /tasks/:id/uncomplete` | `requireAuth` + `runWithRls` | **REAL** |
| **03** | `focus-sessions.ts` | `/api/focus-sessions` | `GET /focus-sessions`, `POST /focus-sessions`, `GET /focus-sessions/today` | `requireAuth` + `runWithRls` | **REAL** |
| **04** | `projects.ts` | `/api/projects` | `GET /projects`, `POST /projects`, `PATCH /projects/:id`, `DELETE /projects/:id` | `requireAuth` + `runWithRls` | **REAL** |
| **05** | `tags.ts` | `/api/tags` | `GET /tags`, `POST /tags`, `PATCH /tags/:id`, `DELETE /tags/:id` | `requireAuth` + `runWithRls` | **REAL** |
| **06** | `task-files.ts` | `/api/tasks/:taskId/files` | `GET /tasks/:taskId/files`, `POST /tasks/:taskId/files`, `DELETE /tasks/:taskId/files/:fileId` | `requireAuth` + `runWithRls` | **REAL** |
| **07** | `blocks.ts` | `/api/blocks` | `GET /blocks`, `POST /blocks`, `PATCH /blocks/:id`, `DELETE /blocks/:id` | `requireAuth` + `runWithRls` | **REAL** |
| **08** | `reminders.ts` | `/api/reminders` | `GET /reminders`, `POST /reminders`, `PATCH /reminders/:id`, `DELETE /reminders/:id` | `requireAuth` + `runWithRls` | **REAL** |
| **09** | `settings.ts` | `/api/settings` | `GET /settings/notifications`, `PUT /settings/notifications`, `GET /settings/focus`, `PUT /settings/focus`, `GET /settings/reschedule`, `PUT /settings/reschedule` | `requireAuth` + `runWithRls` | **REAL** |
| **10** | `internal.ts` | `/api/internal` | `POST /internal/dispatch`, `POST /internal/reschedule`, `POST /internal/memory-extraction`, `POST /internal/recurrence-materialize`, `POST /internal/goals/close-month` | `x-dispatch-secret` Guard | **PARTIAL** (Defect in Job E & Plaintext Secret) |
| **11** | `telegram.ts` | `/api/telegram` | `POST /telegram/webhook`, `POST /telegram/pairing/generate`, `GET /telegram/pairing/status` | `TELEGRAM_WEBHOOK_SECRET` | **PARTIAL** (Freeform chat dropped; token leak fallback) |
| **12** | `momentum.ts` | `/api/momentum` | `GET /momentum` (calculates streak, today completions, 7d activity) | `requireAuth` + `runWithRls` | **REAL** |
| **13** | `reschedule.ts` | `/api/reschedule` | `GET /reschedule/proposals`, `POST /reschedule/proposals/:id/accept`, `POST /reschedule/proposals/:id/defer`, `POST /reschedule/proposals/:id/edit`, `GET /reschedule/runs` | `requireAuth` + `runWithRls` | **REAL** |
| **14** | `memory.ts` | `/api/memory` | `GET /memory/facts`, `POST /memory/facts`, `PATCH /memory/facts/:id`, `DELETE /memory/facts/:id`, `GET /memory/confirmations`, `POST /memory/confirmations/:id/approve`, `POST /memory/confirmations/:id/decline` | `requireAuth` + `runWithRls` | **PARTIAL** (Source B conversational extraction unautomated) |
| **15** | `agent.ts` | `/api/agent` | `POST /agent/chat`, `GET /agent/messages`, `DELETE /agent/messages`, `POST /agent/undo`, `GET /agent/actions`, `GET /agent/usage`, `GET /agent/credentials`, `PUT /agent/credentials/:provider`, `DELETE /agent/credentials/:provider` | `requireAuth` + `runWithRls` | **PARTIAL** (Undo missing time_block; spend ceiling lifetime bug) |
| **16** | `rituals.ts` | `/api/rituals` | `GET /rituals/plan-day`, `POST /rituals/plan-day/complete`, `GET /rituals/close-day`, `POST /rituals/close-day/complete` | `requireAuth` + `runWithRls` | **REAL** |
| **17** | `automation.ts` | `/api/automation` | `GET /automation/flags`, `PUT /automation/flags/:key` | `requireAuth` (Raw `db` Pool) | **PARTIAL** (BOLA: global kill switch lacks tenant scoping) |
| **18** | `integrations.ts` | `/api/integrations` | `GET /integrations/status`, `POST /integrations/telegram/test`, `POST /integrations/url-metadata` | `requireAuth` + `runWithRls` | **PARTIAL** (SSRF vulnerability in URL metadata resolver) |
| **19** | `goals.ts` | `/api/goals` | `GET /goals`, `POST /goals`, `PATCH /goals/:id`, `DELETE /goals/:id`, `POST /goals/close-month`, `GET /goals/history` | `requireAuth` + `runWithRls` | **REAL** |

---

## 2. Frontend Surface & Page Route Inventory (`artifacts/cadence/src/pages/`)

| # | Route | Page Component | Functional Capabilities | State & Cache Binding | Zero-Trust Status |
|---|---|---|---|---|---|
| **01** | `/` | `LandingPage.tsx` | Marketing landing, hero CTAs, auth entry doors | Static / Clerk Session Hook | **REAL** |
| **02** | `/today` | `TodayPage.tsx` | NextUp hero card, today list, inline capture, daily progress | TanStack Query (`useTasks`) | **REAL** |
| **03** | `/inbox` | `InboxPage.tsx` | Unsorted task triage, quick file to project/date | TanStack Query (`scope=inbox`) | **REAL** |
| **04** | `/calendar`| `CalendarPage.tsx` | Day/Week/Month grid, time-block dragging, conflict display | TanStack Query (`useBlocks`) | **REAL** |
| **05** | `/focus` | `FocusPage.tsx` | Full-screen Pomodoro, runAnchor timer, ambient sound | Local Storage + Audio Synth | **REAL** |
| **06** | `/projects`| `ProjectsPage.tsx` | Project grouping, task count, color picker | TanStack Query (`useProjects`)| **REAL** |
| **07** | `/goals` | `GoalsPage.tsx` | Monthly intentions, metrics progress, historical review | TanStack Query (`useGoals`) | **REAL** |
| **08** | `/agent` | `AgentPage.tsx` | Chat drawer, multi-turn dialogue, tool call preview | TanStack Query (`/agent/chat`) | **PARTIAL** (Confirm button lacks wired handler) |
| **09** | `/memory` | `MemoryPage.tsx` | "What Cadence Knows About Me", fact review & decay status | TanStack Query (`useMemory`) | **REAL** |
| **10** | `/review` | `ReviewPage.tsx` | Guided weekly/monthly review, carried tasks triage | TanStack Query + Rituals API | **REAL** |
| **11** | `/settings`| `SettingsPage.tsx` | Timezone, working hours, Telegram pair, BYOK keys, density | TanStack Query (`useSettings`)| **REAL** |
| **12** | `/sign-in` | `SignInPage.tsx` | Clerk Auth login, Google OAuth, theme toggle | Clerk SDK Components | **REAL** (2.14:1 CTA Warning) |
| **13** | `/sign-up` | `SignUpPage.tsx` | Clerk Auth registration, Google OAuth, theme toggle | Clerk SDK Components | **REAL** |
| **14** | `*` | `NotFound.tsx` | Universal 404 handler, redirect back to `/today` | Static React | **REAL** |
| **15** | `/catalog` | `DesignCatalogPage.tsx` | Design system component token catalog (`DEV` only) | Gated to `import.meta.env.DEV` | **REAL** |
| **16** | N/A (Sheet) | `QuickCaptureSheet.tsx`| Global modal capture (`N`/`Ctrl+\`), natural language parse | LocalStorage Outbox + Mutation | **REAL** |

---

## 3. Background Services & Scheduled Jobs Inventory

| Job Name | Schedule | Target Endpoint | Mechanism | Failure Mode & Current Reality |
|---|---|---|---|---|
| **`cadence-reminder-dispatch`** | `*/5 * * * *` | `/api/internal/dispatch` | `pg_cron` + `pg_net` with `x-dispatch-secret` | **REAL** — 897 successful runs recorded. Batches up to 100 rows using `FOR UPDATE SKIP LOCKED`. |
| **`cadence-reschedule-sweep`** | `0 * * * *` | `/api/internal/reschedule` | `pg_cron` + `pg_net` with `x-dispatch-secret` | **REAL** — 74 successful runs recorded. Sweeps past-due tasks and applies Rules 1–9. |
| **`cadence-memory-extraction`** | `0 2 * * *` | `/api/internal/memory-extraction` | `pg_cron` + `pg_net` with `x-dispatch-secret` | **PARTIAL** — 3 runs recorded. Runs Source A focus ratio arithmetic; Source B conversational extraction missing. |
| **`cadence-recurrence-materialize`**| `0 1 * * *` | `/api/internal/recurrence-materialize` | `pg_cron` + `pg_net` with `x-dispatch-secret` | **REAL** — 3 runs recorded. Materializes future tasks from `rrule` patterns. |
| **`cadence-goals-close-month`** | `5 0 1 * *` | `/api/internal/goals/close-month` | `pg_cron` + `pg_net` with runtime GUC | **DEFECT** — **0 runs recorded**. Evaluates session-local GUC in cron worker, resulting in NULL secret and 401s. Plaintext secret in jobs A–D. |

---

## 4. Shared Monorepo Packages Inventory

| Package Directory | Package Name | Role & Architecture | Upstream Dependencies | Zero-Trust Verification |
|---|---|---|---|---|
| `lib/api-spec/` | `@workspace/api-spec` | Contract Authority: `openapi.yaml` | None (Specification Root) | **VERIFIED** — 55 paths / 74 operations defined. |
| `lib/api-zod/` | `@workspace/api-zod` | Orval-generated Zod request/response schemas | `lib/api-spec` | **VERIFIED** — Codegen check passes (Gate 5). |
| `lib/api-client-react/`| `@workspace/api-client-react`| Orval-generated TanStack Query hooks | `lib/api-spec`, `@tanstack/react-query`| **VERIFIED** — Codegen check passes (Gate 5). |
| `lib/db/` | `@workspace/db` | Drizzle Schema definitions, 19 SQL migrations | `pg`, `drizzle-orm` | **VERIFIED** — 39 DB invariant tests pass. |
| `tokens/` | N/A (Root) | `tokens.json` single source of truth for design | Custom node build script | **VERIFIED** — 93 contrast pairs pass (Gate 4). |

---
*Inventory cross-referenced with live file systems and database schemas.*
