# Cadence — Master Verification Matrix

> **5-Gate Quality Framework.** A module is genuinely done when all 5 gates pass. A phase is safe to build on when all its modules are at 4/5+. This is not aspirational — it is the checkable gate that prevents `PROGRESS.md` drift.  
> **Last verified:** 2026-09-19 (documentation restructuring audit). **§4 test counts re-measured 2026-09-30** — the previous §4 figures (183 tests / 13 files, 15 Playwright scenarios) were false and have been replaced with measured values. §1–§3 and §5–§6 are unchanged from the 2026-09-19 audit and are **not** re-verified by that pass.

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

> **Measured 2026-09-30** by running the suites, not by reading a previous
> report. Every number below is copied from the run output.

| Suite | Measured count | Files | Command | Gate |
|---|---|---|---|---|
| Vitest — `lib/db` | **12 passed, 23 skipped** | 2 | `pnpm --filter @workspace/db run test` | G1 |
| Vitest — `artifacts/api-server` | **215 passed** | 17 | `pnpm --filter @workspace/api-server run test` | G1 |
| Vitest — `artifacts/cadence` (web) | **356 passed** | 11 | `pnpm --filter @workspace/cadence run test` | G1 |
| **Vitest total** | **583 passed, 23 skipped** | **30** | `pnpm run test` | G1 |
| Playwright E2E | **4 spec files, 9 `test()` calls — did not execute** | 4 | `pnpm run verify:e2e` | G1 |
| TypeScript typechecks | exit 0 | — | `pnpm run typecheck` | G1 |

**The web suite is new.** `artifacts/cadence` had no `test` script and no test
files before 2026-09-30; the 356 tests across 11 files are all new. Any count
predating it omitted them entirely.

**The 23 skipped `lib/db` tests are deliberate, not broken.** They are the
destructive-ledger suite: it needs a local database and
`CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS=1`, and it must never be run against a
remote host. `db-invariants.test.ts` additionally skips itself when
`DATABASE_URL` is unset. Root `test` is `pnpm -r --if-present run test`, so
these skips do not fail the gate.

### E2E did not run — and could not have

`artifacts/cadence/tests/e2e/` holds 4 spec files with 9 `test()` calls
(`focus` 1, `memory-and-rituals` 2, `navigation` 3, `tasks` 3). As of
2026-09-30 they had **never executed**:

- `@playwright/test` is not installed (`node_modules/@playwright/test` does not
  exist), so there is no runner.
- `artifacts/cadence/package.json` has no `test:e2e` script, so the command
  this table used to name did not exist either.

`artifacts/cadence/playwright.config.ts` is present but inert without the
package. An earlier revision of this section claimed "15 scenarios"; that
number was never produced by a run, and no pass count may be claimed for these
specs until `pnpm run verify:e2e` has actually been executed. Repair of the e2e
layer was in progress at the time of this measurement.

### Full green

Full green = the 8-gate runner green. `pnpm run verify` is
`node scripts/run-gates.cjs` and runs, in order: `typecheck`, `tokens`,
`lint:tokens`, `codegen`, `build:api`, `build:web`, `encoding`, `test`. E2E is
deliberately **not** in that ladder (it needs a live API, a database and a
browser download) and stays opt-in via `pnpm run verify:e2e`.

> **Windows note (corrected 2026-09-30):** the previous claim that
> `pnpm run typecheck` "requires Linux shell for the `preinstall` guard" is
> obsolete and was not reproducible — `preinstall` is
> `node scripts/enforce-pnpm.cjs`, which is cross-platform. `pnpm run
> typecheck` was run natively on Windows/PowerShell 5.1 on 2026-09-30 and
> exited 0. `node node_modules/typescript/bin/tsc --build --force` remains the
> documented Linux/Replit equivalent.

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
