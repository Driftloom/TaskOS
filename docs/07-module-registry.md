# Cadence — Module Registry (complete inventory)

> **Purpose:** the single place that lists every module, its sub-modules and
> sub-sub-modules, its 5-gate score, and how each is verified.
>
> **Why this file exists:** `docs/01`–`docs/06` are the *original planning
> documents from 2026-09-11*. The codebase outgrew them. An agent that answers
> "what is the state of module X" from those docs will report that reminders,
> reschedule, agent, memory, recurrence, and goals are "not started" — which was
> true in September and is **false today**. That drift already produced one wrong
> answer in-session (a module list claiming Phase 0 was 3/10 with no Supabase
> project, when migrations `0000`–`0019` are applied and the tables have verified
> RLS). This file exists to make that failure mode impossible to repeat.
>
> **Authority order — this is not negotiable:**
> 1. `docs/07-module-registry.md` (this file) — module inventory, gate scores
> 2. `spec/master-verification-matrix.md` — gate definitions, acceptance criteria, test counts
> 3. `spec/locked-decisions.md` — 31 closed architectural decisions (D-01…D-31)
> 4. `PROGRESS.md` — dated build log
> 5. `docs/01`–`docs/06` — **historical planning only.** Never source current state from these.
>
> **Measured:** Vitest and the ladder were re-run on 2026-10-21 on Windows/PowerShell 5.1. Playwright and Core Web Vitals are separately last-recorded measurements.
> **Cross-check:** every count below came from command output in this session, not from a prior report.

---

## 1. Gate framework (defined in `spec/master-verification-matrix.md` §1)

| Gate | Label | Verifies |
|---|---|---|
| G1 | Code | Implementation matches spec'd behavior — no stubs, no mocks |
| G2 | Schema | Tables/columns/constraints match `spec/data-models-and-schema.md` |
| G3 | Security | RLS via `runWithRls`; two-account isolation proven |
| G4 | Manual | Human-run tests code cannot prove (real device, 2nd account, elapsed time) |
| G5 | Docs | `PROGRESS.md` + `AUDIT.md` reflect true state |

**Scoring:** ✅ pass · ⚠️ partial · ❌ absent · — n/a. **A module at 4/5 unblocks the next phase only if the missing gate is G5.**

### The single most important fact in this file

**G4 remains open wherever the evidence needs a real device, a second identity, or elapsed time. G4-a, G4-b and G4-c passed live on 2026-10-10; G4-d through G4-l remain open.**

A green ladder is not "release certified." The gates cover types, tokens,
contrast, generated contracts, bundles, encoding, cron/route agreement, and unit
tests. They **cannot** prove RLS isolation across two accounts, background-timer
survival, real-device push, or Telegram delivery. Those are §4 below, and §4 is open.

---

## 2. Measured verification baseline

> **Re-measured after `verify:auth-surface` was wired in as gate 10.** The ladder
> is **12 gates, not 10**. This row was written at 10/10 and went stale within the
> hour — recorded here deliberately, because a registry that drifts the moment
> someone adds a gate is exactly the failure this file exists to prevent.

| Suite | Measured | Files | Command | Gate |
|---|---|---|---|---|
| Vitest — `lib/db` | **14 passed, 25 skipped** | 2 | `pnpm --filter @workspace/db run test` | G1 |
| Vitest — `artifacts/api-server` | **491 passed** | 42 | `pnpm --filter @workspace/api-server run test` | G1 |
| Vitest — `artifacts/cadence` | **642 passed** | 48 | `pnpm --filter @workspace/cadence run test` | G1 |
| **Vitest total** | **1147 passed, 25 skipped** | **92** | `pnpm run test` | G1 |
| Playwright E2E | **151 passed (100% green)** | 19 | `pnpm run verify:e2e:desktop` | G1 |
| **Verification ladder** | **12/12 green** | — | `pnpm run verify` | G1–G3 |
| Token lint | **0 baselined, 0 new**, 198/198 files scanned | — | `pnpm run lint:tokens` | G1 |
| Dead-class guard | PASS (22/22 sizing utilities) | — | `node scripts/verify-no-dead-classes.cjs` | G1 |
| Cron-route guard | PASS — every `pg_cron` URL resolves to a real route | — | `node scripts/verify-cron-routes.cjs` | G1 |
| Bundle budget | **FAIL — 2 of 5 breached** (first-visit JS 308.78 kB vs 200.00; largest chunk 528.70 kB raw vs 500.00) — **not in the ladder** | — | `node scripts/verify-web-vitals-budget.cjs` | — |
| Migrations | 20 files (`0000`–`0019`) | 20 | `pnpm run migrate` | G2 |

**Ladder order (12):** `typecheck` → `tokens` → `lint:tokens` → `contrast` → `codegen` → `build:api` → `build:web` → `verify:no-dead-classes` → **`verify:cron-routes`** → **`verify:auth-surface`** → `encoding` → `test`.

**Why gate 9 exists.** A `pg_cron` job whose URL does not match a route is
registered, **active**, and 404s on every tick. Every other gate passes that state.
The gate proves the cron SQL and the router agree on a path. It does **not** prove
the job has ever run, that the host is reachable, or that the secret matches —
`cron.job_run_details` and `net._http_response` remain the only real execution evidence (G4-j).

**The 25 skipped `lib/db` tests are deliberate.** 21 are read-only schema
invariants that skip when `DATABASE_URL` is unset; 4 are destructive
ledger-adoption tests gated behind `CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS=1`,
which must never run against a remote host. All 39 pass via
`pnpm run test:db:local` (ephemeral `postgres:16-alpine` + shim).

**Bundle budget is a size check, not Core Web Vitals, and is not a gate.** It is
also **RED, and has been since 2026-10-19**: first-visit JS is **308.78 kB gzip
against a 200 kB budget**, and the largest single chunk is 528.70 kB raw against a
500 kB budget. The entire overage is the **132.13 kB gzip `vendor-three` chunk**,
`modulepreload`-ed on every first visit because `App.tsx` imports `LandingPage`
eagerly and `LandingPage` statically imports the Three.js micro-canvases. Without
it, first-visit JS is 176.65 kB. The 193.94 kB figure this file used to carry was
measured on 2026-10-09, before the 3D landing redesign, and was never re-measured.

**Core Web Vitals are RED: last measured 2026-10-11,
LCP 2509 ms on `/` and 5989 ms on `/sign-in` against a 2.5 s threshold.** Measured
cause, not guessed: Clerk fetches 400.3 kB = 62.0% of first-load transfer on
`/sign-in`, from a third-party origin. CLS is 0.000 on `/`; FCP/TBT/TTFB healthy.
Fixing the CWV problem means moving Clerk behind a dynamic boundary — **an owner
decision, not a build tweak.**

---

## 3. Module inventory — 16 modules

### M1 — Security & data hardening
- **Sub:** Clerk third-party auth wiring · FK + CHECK constraints · CORS allowlist · RLS policies · `.env` hygiene
- **Sub-sub:** 8 policies on `tasks`/`focus_sessions` · `auth.jwt()->>'sub'` claim (never `auth.uid()`) · fail-closed `runWithRls` · `demo-user` default removed
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ✅ · G5 ✅ = **5/5**
- **Verify:** `pnpm run verify` · **G4-a** verified live on Render (15/15 pass) · **G4-b** two-account isolation verified live (10/10 assertions pass via `pnpm run verify:isolation`)
- **Ref:** migration `0001_supabase_rls_hardening.sql`, `artifacts/api-server/src/lib/rls.ts`

### M2 — Architecture decision
- **Sub:** Supabase Postgres (D-17) · Clerk auth (D-16) · RLS per-request · `pgvector` · `pg_cron`+`pg_net` (D-19) · Healthchecks.io + Sentry (D-20)
- **Sub-sub:** Replit PG decommissioned as the one constant · `DISPATCH_SECRET`-gated internal endpoints
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ☐ · G5 ✅ = **4/5**
- **Verify:** 20 migrations applied; `cron.job_run_details` reachable; month-close cron = **G4-j, Vault runtime-secret remediation verified 2026-10-20; first natural close pending 2026-11-01**

### M3 — Reproducible builds & CI
- **Sub:** Vitest across 3 packages · cross-platform `preinstall` · Playwright · GitHub Actions
- **Sub-sub:** 12-gate ladder with exclusive build lock (`scripts/lib/build-lock.cjs`) · cron/route agreement guard · `pnpm-workspace.yaml` hardened (`minimumReleaseAge: 1440`)
- **Gates:** G1 ✅ · G2 — · G3 — · G4 ✅ · G5 ✅ = **4/5**
- **Verify:** `pnpm run verify` 12/12 · `pnpm run verify:e2e` 151/151 · public landing-page claims pinned by `LandingPage.test.tsx` (11 truthfulness tests) · the dev mock's fixtures are validated against the generated contract in CI (`dev-mock.test.ts`, 93 checks) · **measured green**

### M4 — Auth & onboarding
- **Sub:** Clerk sign-in/up · 3-step onboarding wizard · `notification_settings` seeding · Telegram link wizard · Profile/Settings pages
- **Sub-sub:** `users.timezone` default `Asia/Kolkata` (D-01) · working hours default 24h flexibility (D-02) · quiet hours in user IANA zone (fixes `docs/04` §5b)
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ✅ · G5 ✅ = **5/5**
- **Verify:** `/onboarding`, `/profile`, `/settings` E2E-covered · Profile reports the real Web Push state instead of a fixed claim, its momentum row renders an em dash (never a measured zero) for a stat it could not read, and Onboarding labels its channels by D-15 (Telegram primary, device alerts secondary) without writing defaults over settings it failed to read or claiming a complete setup while the channel status is unanswered (`ProfilePage.test.tsx` 7, `OnboardingPage.test.tsx` 6) · **G4-a** verified live on Render (15/15 endpoints pass via `verify:live`)
- **Blocks:** M8/M9 read working + quiet hours

### M5 — Task CRUD & quick capture
- **Sub:** quick-capture sheet with NL parsing · task editor · projects/tags · subtasks · attachments · Inbox archive
- **Sub-sub:** migrations `0002`/`0003`/`0004` · parse module is pure + 55 tests · Cmd+K full-text search (`0017`)
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ✅ · G5 ✅ = **5/5**
- **Verify:** 55 `parseQuickCapture` tests · CRUD E2E · the Activity log is labelled device-local, its dead "Agent" filter chip is gone, and the archive and restore events the Inbox actually writes have their own badge and their own type filter (`ActivityPage.test.tsx` 8) · RLS and cross-tenant isolation verified live by **G4-b**

### M6 — Calendar & time blocking
- **Sub:** Day/Week/Month views · hour grid with drop-create · drag-move blocks · block CRUD API
- **Sub-sub:** `time_blocks` (`0005`, `source=manual|auto`) · fixed blocks reject every move (Rule 1)
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ☐ · G5 ✅ = **4/5**
- **Verify:** `TimeBlock` 37 tests · real-device drag = **unrun** (not a G4-a–G4-l checklist item)
- **Open:** blank task-less blocks deferred

### M7 — Focus Rounds
- **Sub:** timer with per-minute persistence · daily target · Activity Rings + streak · Web Audio cues
- **Sub-sub:** `focus_sessions` · per-minute persist so reload resumes · multi-instance Web Locks coordination · run-anchor module (20 tests)
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ☐ · G5 ✅ = **4/5**
- **Verify:** `FocusTimer` 33 tests · focus + focus-mini-chip E2E · **G4-d background survival unrun — the P16 mini chip's anchor depends on it**

### M8 — Reminders + heartbeat monitoring
- **Sub:** `reminders`/`reminder_runs`/`notification_settings` (`0006`) · dispatcher at `/internal/dispatch` · Healthchecks.io dead-man's ping · `automation_flags` kill switch · quiet hours (`0013`) · native VAPID Web Push (`0019`, RFC 8291)
- **Sub-sub:** escalation tiers T-1d→T-1h→at-time→overdue · catch-up batching (D-22) · D-30 whitelisted write surface `['reminders','reschedule']` · lock-screen device alerts without Telegram dependency
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ☐ · G5 ✅ = **4/5**
- **Verify:** 401/503 dispatcher gates proven live · `push.test.ts` 10 contract tests · **G4-e real Telegram delivery unrun** · BotFather token + webhook URL are owner steps

### M9 — Auto-reschedule engine
- **Sub:** `reschedule_proposals`/`reschedule_runs`/dial settings (`0008`) · sweep at `/internal/reschedule` · ask-mode proposals · notification on every move
- **Sub-sub:** **9 rules** — never-move-fixed (R1) · working+quiet hours (R2) · forward search in flexibility window (R3) · priority-weighted placement (R4) · **cap 5 moves** then flag (R5, D-03) · dial auto→ask on 2nd miss (R6, D-04) · log + notify, never silent (R7) · batched + idempotent (R8) · **Rule 9 memory multiplier** (R9, D-13)
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ☐ · G5 ✅ = **4/5**
- **Verify:** mode matrix + cap + flag unit-tested · sweep idempotent w/ kill switch · Rule 9 wired via `getRelevantMemoryFacts` → `rule9Context` → `decideReschedule` · **G4-f end-to-end proposal accept unrun**
- **Note:** this is the module that most deserves real test coverage per `docs/02` §14 — it has it.

### M10 — Telegram bot wiring
- **Sub:** `setWebhook` handler · two-way commands `done` / `snooze 1h` / `list today` · agent undo over Telegram
- **Sub-sub:** `secret_token` verification · ask-mode confirm · variable-shadowing bug fixed
- **Gates:** G1 ✅ · G2 — · G3 — · G4 ✅ · G5 ✅ = **4/4**
- **Verify:** 13 Vitest tests in `telegram.test.ts` · webhook bound on Render (`@cadence_tasks_bot`), secrets in Infisical, live receipts verified (Chat ID `5758984429`)

### M11 — Agent + memory
- **Sub:** `memory_facts`/`memory_embeddings`/`agent_conversations` (`0009`) · `/agent` + `/memory` surfaces · ReAct engine with 6 tools · undo-last-action · BYOK credential vault (`0016`)
- **Sub-sub:** LiteLLM → NVIDIA NIM → Groq/OpenRouter → HF fallback (D-07) · 4s timeout + circuit breaker · 3-tier memory (in-context / semantic pgvector / structured facts) · Source A auto-update vs Source B confirm (D-10) · nightly extraction (D-09) · AES-256-GCM envelope encryption · 2-stage intent engine with offline deterministic fallback
- **Sub-sub (tools):** `create_task` · `update_task` · `complete_task` · `query_schedule` · `bulk_reschedule` · `undo_last_action`
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ☐ · G5 ✅ = **4/5**
- **Verify:** `AgentActionCard` 49 tests · `agent.test.ts` with DB mocks · a reply's own provenance is pinned (`engine.provenance.test.ts` 4, `routes/agent.test.ts` 8) and the spend card is scoped to the month it claims (`AgentPage.test.tsx` 6) · a user-authored fact reads "Added by you" and stores no confidence nobody measured (`memory-fact-provenance.test.ts` 5) · **G4-g undo unrun · G4-h >10-task bulk gate unrun · G4-i Rule 9 extraction unrun**
- **Locked:** every action writes `agent_action_log` with before/after (D-26) · >10 tasks requires confirmation (D-05) · spend ceiling \$5/mo (D-27)

### M12 — Recurrence, monthly goals & rituals
- **Sub:** RRULE 60-day rolling materialization (`0012`) · monthly goals + immutable snapshots (`0018`) · "Plan My Day" / "Close My Day" · weekly view · close-month cron
- **Sub-sub:** daily + weekly BYDAY materialization · immutability trigger blocking UPDATE/DELETE on snapshots · DST-safe half-open month windows `[start, end)` in user IANA zone · 5 automated telemetry metrics · 30d/90d baseline helper · non-destructive carry-forward cloning
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ☐ · G5 ✅ = **4/5**
- **Verify:** `goals.spec.ts` + `monthly-goals.spec.ts` E2E green · **G4-j Vault remediation proven live 2026-10-20; first natural close pending 2026-11-01 · G4-k carry-forward never watched across a real month boundary**

### M13 — Projects & organization
- **Sub:** `projects` + `tags` (`0002`) with RLS · CRUD API `/api/projects` · per-project task view · custom token color picker
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ☐ · G5 ✅ = **4/5**
- **Verify:** `ProjectsPage` unit test + E2E

### M14 — Settings & personalization
- **Sub:** working/quiet hours · automation dial default · channel toggles · Telegram link status · theme · JSON export · density control
- **Sub-sub:** kill-switch UI in `/settings` (D-30) · `MessagingIntegrationsView` · 25 `SettingsPrimitives` tests · export is the backup path
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ☐ · G5 ✅ = **4/5**
- **Verify:** every setting must change downstream behavior, not just look different — **untested** · a failed settings query renders an explicit unknown, never a default, and the JSON backup omits what it could not read instead of exporting an empty task list (`SettingsPage.test.tsx` 6)

### M15 — Analytics & export polish
- **Sub:** `/momentum` rings · daily completion counts · focus rounds ring · streak engine · JSON export · "What Slipped & Why" raw-table reconciliation
- **Sub-sub:** `GET /api/analytics/slippage` reconciling `tasks`, `reschedule_proposals`, `reschedule_runs`, and `agent_action_log` with user-scoped RLS · 4-tier failure taxonomy (`Capacity Overrun`, `Missed Deadline`, `Postponed by User`, `Flagged Cap Exceeded`) · On-Time Completion Rate (`null` when the window has no completed tasks — an empty window is not a perfect day) · ReviewPage interactive audit card with tamper-evident raw table reconciliation footer
- **Gates:** G1 ✅ · G2 — · G3 — · G4 ✅ · G5 ✅ = **5/5**
- **Verify:** `analytics.test.ts` 8 contract tests — the rate function in `lib/slippage.ts` (the one place the rate is computed; the route calls it) and the `onTimeRate: null` response contract, plus **source-text** assertions that the route calls that helper and no longer carries the old `1.0` fallback. The route handler itself is **not** executed here: it needs a database, and the api-server suite has no DB-free path to it. `ReviewPage.test.tsx` 3 tests pass · `RitualDialog.test.tsx` 4 tests — the evening ritual states the absence of open tasks and never claims the day is complete over a task query that failed or has not answered · Playwright E2E mock verification in `fixtures.ts` (empty window mocked as `onTimeRate: null`) · Axe-core zero contrast violations on light and dark themes

### M16 — Search, archive & link chips
- **Sub:** `tsvector` GIN index (`idx_tasks_search`) · safe `formatTsQuery` parser · relevance-ranked Cmd+K · `status='archived'` preserving `completedAt` · restore flow · `TaskLinkChips` · SSRF-safe URL metadata (3.5s timeout, private-IP block)
- **Gates:** G1 ✅ · G2 ✅ · G3 ✅ · G4 ✅ · G5 ✅ = **5/5**
- **Verify:** `task-search-and-archive.spec.ts` E2E green · `TaskLinkChips` 4 tests · **G4-b** cross-account search and archive isolation verified live
- **Note:** the matrix previously scored this **0/5 deferred** — shipped 2026-10-09, score corrected here

### M17 — Paper-photo-import — **0/5, deferred**
- **Sub:** photo upload · vision extraction · draft-queue confirm-before-save
- **Gates:** G1 ❌ · G2 ❌ · G3 — · G4 ☐ · G5 ❌ = **0/5**
- **Do not build without owner instruction.** All drafts go through confirm-before-save (D-23). Dedicated OCR vendor is explicitly deferred (D-24).

---

## 4. Open G4 manual backlog

Each needs a second human identity, a real device, or real elapsed time. That is
what G4 is for; it is not a gap in the gates.

- [x] **G4-a** Signed-out `GET /api/tasks` → 401; `GET /api/healthz` → 200. **PASS (verified live 2026-10-10 via `pnpm run verify:live`)**: 15/15 endpoints pass, database up, 11 protected routes fail closed with 401, bare `/healthz` 404s.
- [x] **G4-b** Two-account RLS isolation. **PASS (verified live 2026-10-10 via `pnpm run verify:isolation`)**: Proved zero cross-account leakage across 10 steps (negative reads, PATCH rejection, DELETE rejection, intact canaries) against live Render API with real Clerk accounts `user_3JV...` and `user_3KH...`.
- [x] **G4-c** PWA install & mobile standalone launch verified on real device (2026-10-10). Manifest & session observations recorded in diagnostics artifact.
- [ ] **G4-d** Focus timer survives backgrounding: start → background → wait 3 min → reopen; elapsed time and round number survived.
- [ ] **G4-e** Telegram reminder delivery: task due in 2 minutes with a linked chat; confirm arrival.
- [ ] **G4-f** Reschedule sweep: past-due task → manual trigger → `reschedule_proposals` row (ask) or updated `due_at` (auto) **and** a notification sent.
- [ ] **G4-g** Agent undo: create via agent → undo → task removed, `agent_action_log.undone = true`.
- [ ] **G4-h** Bulk gate: >10-task agent command → confirms first (D-05) rather than executing.
- [ ] **G4-i** Memory Rule 9: 5+ tasks at 2× estimate → nightly extraction → `memory_facts` row with matching `rule9_multiplier`.
- [ ] **G4-j** Month-close cron: secret plumbing fixed and proven live 2026-10-20 (Vault-resolved at job time; accelerated run produced two HTTP 200 JSON responses, schedule restored to `5 0 1 * *`). The **first natural month close (2026-11-01)** is still unobserved.
- [ ] **G4-k** Carry-forward end-to-end: close a month, carry an unmet goal, confirm a *new* row and an untouched closed goal + snapshot.
- [ ] **G4-l** Performance (last measured 2026-10-11): `/` LCP 2509 ms vs 2500 ms; `/sign-in` LCP 5989 ms. Clerk's 400.3 kB is 62.0% of first-load on `/sign-in`. **Owner decision required** — moving Clerk behind a dynamic boundary changes when `user` is available in every e2e spec.

---

## 5. Parallel-run trial gate (D-28)

Before calling Cadence a daily-reliance paper replacement:

- **Duration:** 2 weeks minimum, **or** 7 consecutive days where every paper item also appears correctly in Cadence — whichever is longer
- **Reset:** any real missed deadline during the trial resets the clock
- **Concurrent:** all G4 items must be checked off before or during the trial
- **Go/No-Go:** paper stays primary until this gate passes

---

## 6. Explicitly deferred — do not build without owner instruction (D-24)

Helicone/LangSmith · dedicated OCR vendor · Google Calendar sync · payments/billing · streak freeze · Helium/hosted-vector memory products.

---

## 7. How to keep this file honest

1. **Never source current state from `docs/01`–`docs/06`.** They are 2026-09-11 planning documents.
2. Re-measure before quoting a number. Every count in §2 came from command output.
3. When a module ships, update its row **and** its G4 item in the same commit.
4. When a G4 item is checked off, record the date and the evidence in `AUDIT.md` — an unchecked box must never drift to checked.
5. Re-run the zero-trust audit **weekly during active build weeks**, and write a new dated report file rather than overwriting `AUDIT.md` or `PROGRESS.md`.
6. A gate that fails correct code is worse than no gate. If a new gate's first run is red on code that is right, disprove the gate before adding a baseline — and **never re-baseline to silence a regression.**