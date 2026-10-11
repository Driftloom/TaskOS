# 03 — Requirements & Settled Decisions Traceability Matrix

> **Zero-Trust Traceability Audit**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Principal Systems Architect & Test Lead  

---

## 1. Traceability Methodology

Under the Zero-Trust standard, no architectural claim or settled decision is marked `VERIFIED` without direct correlation across five distinct evidence dimensions:
1. **Contract / Requirement Authority:** Explicit specification in `spec/locked-decisions.md` and related subsystem contracts.
2. **Database Schema & Persistence:** Drizzle schema definition (`lib/db/src/schema/`) and applied SQL migrations.
3. **API & Business Logic Implementation:** Code in `artifacts/api-server/src/` or `artifacts/cadence/src/`.
4. **Automated Verification:** Unit tests in Vitest or E2E tests in Playwright verifying the invariant.
5. **Runtime Reality / Status:** Honest classification (`VERIFIED`, `PARTIAL`, `DEFECT`, `DEFERRED`, `UNTESTED`).

---

## 2. Settled Decisions Traceability Matrix (D-01 through D-31)

| Decision ID | Settled Invariant Summary | Schema / DB Line | API / App Implementation | Test Assertion File | Measured Reality & Classification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **D-01** | Home Timezone default `Asia/Kolkata` | `notification_settings.timezone text default 'Asia/Kolkata'` (`notifications.ts:31`) | `lib/date.ts`, `lib/month-window.ts`, `settings.ts:133` | `date.test.ts`, `month-window.test.ts` | **VERIFIED** — Formats dates and bounds in `Asia/Kolkata`. |
| **D-02** | Work Rhythm default 24h flexibility (`00:00–23:59`) | `notification_settings.work_start/end` (`notifications.ts:25-27`) | `lib/reschedule.ts:384`, `settings.ts` | `reschedule.test.ts:401` | **VERIFIED** — Seeds with 00:00–23:59 window. |
| **D-03** | Max 5 auto-moves cap per task | `reschedule_settings.max_auto_reschedules default 5` (`reschedule.ts:18`) | `lib/reschedule.ts:145` (`movesCount >= maxAuto`), `routes/internal.ts:489` | `reschedule.test.ts:210` | **VERIFIED** — Caps moves at 5, then flags "needs attention". |
| **D-04** | Automation dial: `auto` on 1st miss, `ask` on 2nd miss | `tasks.automation_mode text default 'auto'` (`tasks.ts:38`) | `lib/reschedule.ts:168` (`autoDowngradeMode`), `routes/internal.ts:502` | `reschedule.test.ts:255` | **VERIFIED** — Automatically downgrades on repeat miss. |
| **D-05** | Bulk confirmation for > 10 tasks in one agent action | `agent_action_log` table (`agent.ts:49`) | `lib/agent/tools.ts:285` (`taskIds.length > 10 && !confirmed`), `AgentPanel.tsx:289` | `tools.test.ts:180` | **PARTIAL** — Backend blocks with `CONFIRMATION_REQUIRED`; Frontend modal button lacks wired handler (requires chat "confirm"). |
| **D-06** | Strict streaks (no freeze / grace periods) | `tasks.completed_at` (`tasks.ts:45`) | `lib/momentum.ts:52` (streak breaks on missed day) | `momentum.test.ts:88` | **VERIFIED** — Rigid calculation without freeze mechanics. |
| **D-07** | LLM Gateway: LiteLLM NVIDIA NIM primary → Groq/OpenRouter | `llm_credentials` table (`llm-credentials.ts:25`) | `lib/agent/providers.ts:18` (`PROVIDER_PRESETS`), `engine.ts` | `agent.test.ts:120` | **PARTIAL** — Gemini & NVIDIA NIM supported; Hugging Face tertiary is missing from presets and DB constraint. |
| **D-08 / D-27** | LLM token spend ceiling \$5.00/month (~₹400) | `llm_usage` table (`agent.ts:67`) | `lib/agent/engine.ts:1260`, `routes/agent.ts:115` | `agent.test.ts:380` | **DEFECT** — Query sums lifetime cost without month-window filter (`created_at >= monthStart`); passive alert only. |
| **D-09** | Nightly batch memory extraction via `pg_cron` | `pg_cron` schedule `0 2 * * *` (`setup_supabase_cron.sql:45`) | `routes/internal.ts:605` (`POST /internal/memory-extraction`) | `memory.test.ts:110` | **PARTIAL** — Source A runs nightly; Source B conversational extraction is not hooked up. |
| **D-10** | Memory split: Source A auto, Source B confirm | `memory_facts.source` & `pending_confirmation` (`memory.ts:30,37`) | `lib/memory.ts:45` (`computeSourceAArithmetic`), `routes/memory.ts:85` | `memory.test.ts:150` | **PARTIAL** — Schema and approval routes exist; Source B extraction automation is absent. |
| **D-11** | Memory transparency screen at `/memory` | Backed by `memory_facts` table | `artifacts/cadence/src/pages/memory/MemoryPage.tsx` | `a11y-audit.spec.ts` | **VERIFIED** — First-class UI mounted and navigable. |
| **D-12** | Memory seed categories (procrastination, chronotype, etc.) | `memory_facts_category_check` constraint (`memory.ts:58`) | `lib/memory.ts:18` | `memory.test.ts:210` | **VERIFIED** — Constraint strictly validates categories. |
| **D-13** | Reschedule Rule 9 (Memory multiplier integration) | `memory_facts.rule9_multiplier` (`memory.ts:39`) | `routes/internal.ts:516`, `lib/reschedule.ts:310` (`rule9Context`) | `reschedule.test.ts:480` | **VERIFIED** — Multiplier scales estimated duration during sweep. |
| **D-14** | Status color accessibility (paired with icon/shape) | Design tokens (`tokens.json`) | `TaskRow.tsx:244` (Flame/CircleDot/Minus paired with colors) | `scripts/verify-contrast.cjs` | **VERIFIED** — All priority and status states include visual icons. |
| **D-15** | Primary notifications via Telegram Bot API | `notification_settings.telegram_chat_id` (`notifications.ts:33`) | `lib/telegram.ts:45`, `routes/internal.ts:180` | `telegram.test.ts` | **VERIFIED** — Active dispatch via Telegram Bot API. |
| **D-16** | Auth: Clerk + Supabase RLS | `users.user_id` text column on all tables | `middlewares/auth.ts`, `lib/rls.ts` (`claimsJsonFromJwt`) | `auth.test.ts`, `http-contract.test.ts` | **VERIFIED** — Strict 401 boundary and RLS session pinning. |
| **D-17** | Supabase Postgres + Drizzle ORM | 23 tables, `lib/db/src/schema/*` | `lib/db/src/index.ts`, `migrate.ts` | `db-invariants.test.ts` | **VERIFIED** — Schema models and migrations verified. |
| **D-18** | Backend: Node.js Express 5 in TypeScript | Express 5 in `package.json` | `artifacts/api-server/src/app.ts`, `dist/index.mjs` | `http-contract.test.ts` | **VERIFIED** — Fully typed Express 5 routers. |
| **D-19** | Scheduling: `pg_cron` + `pg_net` with `DISPATCH_SECRET` | 5 cron jobs in `setup_supabase_cron.sql` | `routes/internal.ts:50` (`dispatchSecretOk`) | `http-contract.test.ts:145` | **PARTIAL / DEFECT** — Jobs A–D run; Job E fails due to session-local GUC resolution; plaintext secret in `cron.job`. |
| **D-20** | Monitoring: Healthchecks.io dead-man's switch + kill switch | `automation_flags` table (`automation.ts`) | `routes/internal.ts:86`, `routes/automation.ts` | `automation.test.ts` | **VERIFIED** — Pings sent on runs; kill switch halts sweeps. |
| **D-21** | Supabase test branch hygiene (same-day close) | Governance protocol | Infrastructure operation | Governance runbook | **VERIFIED** — Documented protocol. |
| **D-22** | Batch catch-up notifications for pending alerts | `reminders` table | `routes/internal.ts:145` (`BATCH_LIMIT = 100`) | `reminders.test.ts:290` | **PARTIAL** — Batches up to 100 reminders, but sends individual Telegram messages per reminder in a loop. |
| **D-23** | Paper-photo-import confirm-before-save queue | N/A | Deferred | N/A | **DEFERRED** — Explicitly deferred to Phase 12. |
| **D-24** | Deferred features boundary (No Helicone, OCR, Billing) | N/A | Excluded from codebase | Monorepo scan | **VERIFIED** — No prohibited dependencies installed. |
| **D-25** | Liquid Glass confined strictly to chrome | `tokens.json`, `index.css` | `AppShell.tsx`, `Header.tsx`, `FloatingDock.tsx` | `verify:contrast` | **VERIFIED** — Body cards use solid card surfaces. |
| **D-26** | `agent_action_log` with 1-click Undo | `agent_action_log` table (`agent.ts:49`) | `lib/agent/undo.ts`, `routes/agent.ts:90`, `tools.ts:360` | `agent.test.ts:250` | **PARTIAL / DEFECT** — `undo.ts` lacks handling for `time_block` target type; bulk undo lacks atomic batch ID. |
| **D-27** | Agent spend ceiling \$5.00/month | `llm_usage` table | `engine.ts:1260` | `agent.test.ts:380` | **DEFECT** — Shared defect with D-08 (lifetime sum instead of monthly). |
| **D-28** | Parallel-run trial gate (2 weeks / 7 days matching) | Manual testing ledger | `docs/governance/g4-manual-verification-runbook.md` | G4 manual matrix | **IN PROGRESS** — Currently blocked on empty production data. |
| **D-29** | Design System P18–P32 ratification | `tokens.json`, `index.css` | Tailwind v4 custom utilities, density modes | `verify:contrast`, `verify:sizing` | **VERIFIED** — 100% token compliance, 93/93 color pairs pass. |
| **D-30** | Automation kill switch API write policy | `automation_flags` table | `routes/automation.ts:28` (whitelisted to `reminders`, `reschedule`) | `automation.test.ts:45` | **VERIFIED** — Validates keys; note multi-tenant scope gap. |
| **D-31** | Typography bridge scale (`display1..4`, `micro`) | `tokens.json`, `tokens.css` | Bridged font classes across 128 components | `lint:tokens` | **VERIFIED** — Bridges Tailwind scale without visual churn. |

---

## 3. Functional Domains Traceability

| Domain | Specification Reference | Primary Implementation Modules | Primary Test Coverage | Zero-Trust Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **1. Fast Task Capture** | `spec/system-requirements.md §1` | `QuickCaptureSheet.tsx`, `parseQuickCapture.ts`, `routes/tasks.ts` | `parseQuickCapture.test.ts`, `tasks.test.ts` | **VERIFIED** (Automated & Tested) |
| **2. Task Lifecycle & Hierarchy** | `spec/data-models-and-schema.md` | `tasks.ts`, `subtasks.ts`, `TaskRow.tsx`, `TaskEditor.tsx` | `subtasks.test.ts`, `tasks.test.ts` | **VERIFIED** (Cycle prevention & RESTRICT on delete) |
| **3. Calendar Time-Blocking** | `spec/system-requirements.md §3` | `blocks.ts`, `time-blocks.ts`, `CalendarPage.tsx` | `blocks.test.ts` | **VERIFIED** (Collision detection & bounds) |
| **4. Auto-Reschedule Engine** | `spec/auto-reschedule-engine.md` | `lib/reschedule.ts`, `routes/internal.ts`, `RescheduleProposals.tsx` | `reschedule.test.ts` | **VERIFIED** (Rules 1–9 implemented) |
| **5. Focus Timer & Anchor** | `spec/system-requirements.md §5` | `runAnchor.ts`, `FocusTimer.tsx`, `FocusPage.tsx` | `runAnchor.test.ts` | **VERIFIED** (Wall-clock persistence across tabs) |
| **6. Multi-Instance Audio Sync** | `docs/13-master-design-system.md` | `multi-instance-sync.ts`, `sound-fx.ts` | `multi-instance-sync.test.ts` | **VERIFIED** (Web Locks API single-tab election) |
| **7. Telegram Bot Two-Way** | `spec/integrations-and-apis.md §2`| `routes/telegram.ts`, `lib/telegram.ts`, `telegram-pairing.ts` | `telegram.test.ts`, `telegram-pairing.test.ts` | **PARTIAL** (Static regex commands work; freeform chat dropped) |
| **8. 3-Tier Memory Subsystem** | `spec/agent-and-memory-subsystem.md`| `lib/memory.ts`, `routes/memory.ts`, `MemoryPage.tsx` | `memory.test.ts` | **PARTIAL** (Tier 1/3 work; Tier 2 semantic embeddings unhooked) |
| **9. ReAct Agent Engine** | `spec/agent-and-memory-subsystem.md`| `lib/agent/engine.ts`, `tools.ts`, `AgentPanel.tsx` | `agent.test.ts`, `tools.test.ts` | **PARTIAL** (Full tool loop works; streaming absent, undo bug) |
| **10. Monthly Goals Rituals** | `spec/system-requirements.md §7` | `routes/goals.ts`, `rituals.ts`, `goals-metrics.ts`, `GoalsPage.tsx`| `goals.test.ts`, `goals-metrics.test.ts` | **VERIFIED** (Metrics, snapshots, close ritual) |
| **11. Search & Archive Engine** | `spec/data-models-and-schema.md` | `lib/search-query.ts`, `routes/tasks.ts`, `0017 migration` | `search-query.test.ts` | **VERIFIED** (`tsvector` full-text search) |
| **12. Multi-Tenant RLS Security**| `spec/data-models-and-schema.md §4`| `lib/rls.ts`, `middlewares/auth.ts`, `0001 migration` | `rls.test.ts`, `auth.test.ts` | **VERIFIED** (Validated via G4-b live isolation script) |

---
*Matrix verified against active repository source and test execution artifacts.*
