# Cadence — Master Verification Matrix

> **5-Gate Quality Framework.** A module is genuinely done when all 5 gates pass. A phase is safe to build on when all its modules are at 4/5+. This is not aspirational — it is the checkable gate that prevents `PROGRESS.md` drift.  
> **Last verified:** 2026-09-19 (documentation restructuring audit).

---

## 1. The 5-Gate Framework

| Gate | Label | What it verifies |
|---|---|---|
| G1 | Code | Implementation matches spec'd behavior — no stubs, no mocks |
| G2 | Schema | DB tables, columns, constraints match `spec/data-models-and-schema.md` |
| G3 | Security | RLS via `runWithRls` verified; two-account isolation test run and passing |
| G4 | Manual Test | Human-run tests (things code alone can't prove) — checked off per-module |
| G5 | Docs | `PROGRESS.md` and `AUDIT.md` reflect true state (not aspirational) |

**Scoring:** ✅ pass · ⚠️ partial · ❌ fail/absent · — not applicable

A module at 4/5 can unblock the next phase only if the missing gate is G5 (docs lag). Missing G1–G4 blocks the next phase.

---

## 2. Module Scorecard (as of 2026-09-19)

| Module | G1 Code | G2 Schema | G3 Security | G4 Manual | G5 Docs | Score | Status |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| **Security/data hardening** | ✅ | ✅ | ✅ | ☐ | ✅ | **4/5** | Done — pending two-account RLS manual test (G4-b) |
| **Architecture decision** (Supabase + Clerk + RLS + `pgvector` + `pg_cron`) | ✅ | ✅ | ✅ | ☐ | ✅ | **4/5** | Done & verified |
| **Reproducible builds** (Vitest, cross-platform `preinstall`, Playwright) | ✅ | — | — | ☐ | ✅ | **3/5** | Done; G4 = run full typecheck on Linux/Replit and record |
| **Auth & Onboarding** (`users.timezone`, working/quiet hours, automation defaults, Telegram wizard) | ⚠️ | ⚠️ | ✅ | ☐ | ⚠️ | **2/5** | **Current step** — onboarding flow in progress |
| **Task CRUD & quick capture** (core) | ✅ | ✅ | ⚠️ | ☐ | ⚠️ | **3/5** | Core CRUD done; NL date parsing, full RLS isolation test pending |
| **Calendar & time blocking** (`time_blocks`, drag-drop hour grid) | ✅ | ✅ | ✅ | ☐ | ✅ | **4/5** | Done & verified — G4-c (real device drag-drop) pending |
| **Focus Rounds** (timer, sessions, Activity Ring) | ✅ | ✅ | — | ☐ | ✅ | **4/5** | G4-d (background timer survival) pending |
| **Reminders + heartbeat monitoring** (dispatcher, Healthchecks.io, kill switch) | ✅ | ✅ | — | ☐ | ✅ | **4/5** | Backend done; G4 = confirm real Telegram delivery |
| **Auto-reschedule engine** (9 rules, proposals, Rule 9 memory) | ✅ | ✅ | — | ☐ | ✅ | **4/5** | Backend done; G4 = end-to-end proposal accept flow |
| **Telegram bot wiring** (two-way: `done`, `snooze 1h`, `list today`) | ✅ | — | — | ☐ | ✅ | **3/5** | Backend done; G4 = live webhook test |
| **Agent + memory** (LiteLLM, `memory_facts`, transparency `/memory`) | ⚠️ | ⚠️ | — | ☐ | ✅ | **2/5** | **Current step** — migration `0009` pending owner execution |
| **Recurrence + monthly goals + rituals** ("Plan My Day" / "Close My Day") | ❌ | ❌ | — | ☐ | ✅ | **1/5** | **Current step** — not started |
| **Task links & attachments + search & archive** (`task_links`, `tsvector`) | ❌ | ❌ | — | ☐ | ❌ | **0/5** | Not started |
| **Paper-photo-import** (Claude Vision → draft queue) | ❌ | ❌ | — | ☐ | ❌ | **0/5** | Not started; gated behind Tier 1 completion |
| **Analytics & export polish** | ⚠️ | — | — | ☐ | ✅ | **2/5** | Basic summary endpoint exists; trends/streaks not built |
| **Settings & personalization** | ⚠️ | ⚠️ | — | ☐ | ✅ | **2/5** | Partial; notification_settings table exists, full UI pending |

---

## 3. Manual Test Backlog (G4 Checklist)

These tests require a human running the live app — code review cannot substitute.

- [ ] **(G4-a)** Signed-out request to `GET /api/tasks` returns `401`; `GET /healthz` returns `200` — 5 minutes, do first
- [ ] **(G4-b)** Two-account RLS isolation: create a second Clerk account, confirm it cannot read, write, or modify the first account's tasks, time blocks, or memory facts
- [ ] **(G4-c)** PWA install + push on real iPhone (home-screen installed) and real Android; confirm iOS Telegram fallback works when push fails
- [ ] **(G4-d)** Focus timer: start a round → background the app → wait 3 minutes → reopen; confirm timer state survived (time elapsed, round number)
- [ ] **(G4-e)** Telegram reminder delivery: create a task due in 2 minutes with a linked Telegram chat; confirm reminder arrives
- [ ] **(G4-f)** Reschedule sweep: mark a task due in the past → trigger sweep manually → confirm `reschedule_proposals` row created (ask mode) or `tasks.due_at` updated (auto mode) and notification sent
- [ ] **(G4-g)** Agent undo: have agent create a task → issue "undo last agent action" → confirm task is deleted and `agent_action_log.undone = true`
- [ ] **(G4-h)** Bulk gate: issue an agent command that would touch > 10 tasks → confirm agent requests confirmation before executing
- [ ] **(G4-i)** Memory Rule 9: mark 5+ tasks with a known tag at 2× their estimate → run nightly extraction → confirm `memory_facts` row created with matching `rule9_multiplier`

---

## 4. Automated Test Suite

| Suite | Count | Command | Gate |
|---|---|---|---|
| Vitest unit + integration | **183 tests** across 13 files | `pnpm run test` | G1 |
| Playwright E2E | **15 scenarios** | `pnpm --filter @workspace/cadence run test:e2e` | G1 |
| TypeScript typechecks | — | `pnpm run typecheck` (Linux/Replit) or `node node_modules/typescript/bin/tsc --build --force` (Windows) | G1 |

Full green = all Vitest pass + all Playwright pass + `tsc --build --force` exits 0.

> **Windows note:** `pnpm run typecheck` requires Linux shell for the `preinstall` guard. On Windows, run TypeScript checks via the `node` invocation above.

---

## 5. Acceptance Criteria by Module

### Auth & Onboarding
- Unauthenticated request to any `/api/*` endpoint (except `/api/healthz`) returns `401`
- New user sign-up flow ends with `notification_settings` row auto-created with correct timezone (Asia/Kolkata default)
- Telegram wizard successfully links `telegram_chat_id` in `notification_settings`
- Working hours + quiet hours persisted and respected by reminder dispatcher

### Reminders
- Reminder fires within 60 seconds of scheduled `remind_at`
- Quiet hours are respected — reminders past `quiet_start` queue until `quiet_end`
- Single catch-up summary if > N reminders were pending while user was away
- `reminder_runs` row written after each dispatcher execution
- Healthchecks.io ping received within 2 minutes of cron schedule

### Auto-Reschedule Engine
- Rule 1: task with `automation = 'off'` is flagged overdue, never moved
- Rule 5: after 5 auto-moves, `needs_attention = true` and no further auto-moves
- Rule 6: `auto` first miss → move; second miss → downgrade to `ask` and create proposal
- Rule 7: every move writes `reschedule_runs` row and sends user notification
- Rule 9: task with matching high-confidence `memory_facts.rule9_multiplier` is scheduled at adjusted duration

### Agent + Memory
- Agent tool call writes to `agent_action_log` with `before_state` + `after_state`
- "Undo last agent action" correctly reverses the most recent non-undone action
- Bulk gate fires (confirmation required) when agent would touch > 10 tasks
- Source A extraction produces correct `memory_facts` row from synthetic test data
- Source B fact with `pending_confirmation = true` surfaces in `/memory` review queue
- Rule 9 multiplier visibly changes reschedule engine's slot selection

---

## 6. Parallel-Run Trial Gate

Before calling Cadence a daily-reliance replacement for paper:

- **Duration:** 2 weeks minimum, or 7 consecutive days where every paper item also appears correctly in Cadence — whichever is longer
- **Reset condition:** any real missed deadline during the trial resets the clock
- **Concurrent manual QA:** all G4 checklist items above must be checked off before or during the parallel run
- **Go/No-Go:** paper planner stays primary until this gate passes

See `spec/locked-decisions.md D-28`.
