# Frontend Truthfulness & Design Integrity — Design

> **Status:** Approved (conversational design review, 2026-10-20)
> **Origin:** End-to-end frontend audit, 2026-10-20 (5 parallel audit agents + direct source verification of every P0/HIGH claim)
> **Scope:** `artifacts/cadence` (web app), `artifacts/api-server` (two contract-affecting routes), `scripts/lint-tokens.cjs`, `lib/api-spec/openapi.yaml`, `tests/e2e/fixtures.ts`

---

## 1. The Problem

The audit asked one question: **is mock or hardcoded data present in the application?**

The literal answer is "yes, in dev only". The useful answer is harder:

> The production bundle contains **no fake records** — `lib/dev-mock.ts` is `import.meta.env.DEV`-gated and statically compiled out. What production *does* contain is a **fabricated-success layer**: server defaults and client fallbacks that convert "I have no data" into "everything is perfect", "you are connected", and "your week was flawless".

Three distinct failure classes, in descending severity:

| Class | Where it lands | Severity |
|---|---|---|
| **C1 — False success claims** reach signed-in users with an empty database | Review, Dashboard, Agent, Profile, Onboarding, Settings, Download | 🔴 P0 |
| **C2 — Unenforced gates** mean every design-system fix is unverified | `scripts/lint-tokens.cjs` (2 vacuous rules) | 🔴 P0 |
| **C3 — Contract drift** means the frontend and the backend disagree silently | `openapi.yaml`, `dev-mock.ts`, `tests/e2e/fixtures.ts` | 🟠 P1 |

A fourth, lower-severity class: **public-surface claims** that are untrue (landing page, download card).

### 1.1 Why this matters for the product

Cadence's positioning is a personal OS that replaces a paper planner. Its credibility rests on the user's trust that what the app says about their day is true. The live database currently holds **0 tasks, 0 goals, 0 memory facts, 0 agent action log rows** (per `AGENTS.md` §7). A user signing in today is told:

- *"100% On-Time Rate — All tasks completed on schedule over the past 7 days. Zero calendar slippage detected."*
- *"All queued tasks complete! You have closed every scheduled item for today."*
- *"Inbox Zero — All raw captures processed and scheduled."*
- *"Zero-data-loss record of every task, focus block, and daily ritual"* (over a `localStorage` array)

This is the opposite of the product's own stated principle. `spec/locked-decisions.md` D-10 requires the agent to *ask* before changing anything on the strength of an inference; the Memory screen has a code comment (`MemoryPage.tsx:90-94`) explicitly refusing to seed a local array "because it would present invented patterns as learned". The rest of the app does not hold that line.

---

## 2. Design Principles

These are the decision rules every task in the three plans is judged against.

### P-1 — "I don't know" must be renderable

A query that fails, a table that is empty, and a computation with no inputs are **three different states** and must render three different things. A fallback value is only legitimate when it is a *default for something the user is creating*, never when it stands in for *something that already exists*.

> **Input defaults are allowed. Display fallbacks are not.**
> A new task may default to a 30-minute duration — the user is about to edit it. A task that *already exists* with `durationMin: null` must render "—" (or the real value), never a fabricated `25 min`.

### P-2 — Provenance is part of the contract

If a value can come from a model, a deterministic engine, a cache, or a fixture, the payload must say which. The agent's reply already knows whether a fallback provider answered (`lib/agent/engine.ts:353-354` tracks `providersTried`); that information is dropped on the floor at `engine.ts:1379-1385`. The same applies to `IntegrationStatus` (live vs. sample) and to any dev fixture.

### P-3 — The gate must be able to fail

A lint rule that matches nothing is worse than no rule, because it converts "not enforced" into "verified". Two rules in `scripts/lint-tokens.cjs` are currently in this state. The remedy is not just to fix them — it is to make the *script itself* assert that each rule fires on a known-bad sample, so a future refactor cannot silently re-vacuum a rule.

### P-4 — Mocks are verified against the contract, not maintained by hand

`lib/dev-mock.ts` (12 shape mismatches) and `tests/e2e/fixtures.ts` (9 mismatches) drifted because both are hand-maintained copies of a contract that lives in a third place. Generating them from the contract is the ideal; where generation is not viable (the dev mock is *stateful* — a POST creates a task that a later GET must return, which stateless MSW mocks cannot express), the next-best answer is to **extract the fixtures into a pure module and validate them against the generated Zod schemas in the Vitest gate**. Drift then fails CI instead of failing a user.

### P-5 — Copy is part of the interface

A stale "NOT IMPLEMENTED" badge, a contradictory release note, a version string that disagrees with the artifact it describes, and an unlabelled sample-data region are all *interface bugs*. They are fixed in the same commits as the code they describe, never deferred to "copy pass".

### P-6 — Docs move with the change

`AGENTS.md` §5 rule 6 and its "Docs that must move with the change" table are binding. Every task below names the docs it must update.

---

## 3. Decisions

### D-1 — The server stops fabricating a perfect on-time rate

`routes/analytics.ts:212-215` returns `onTimeRate: 1.0` when `completedInWindow === 0`. The frontend's guard (`onTimeRate != null`) therefore passes and Review renders "100%".

**Decision:** the server returns `null`; the contract widens to `onTimeRate: number | null`; Review renders `—` with the copy *"No completed tasks in this window."*

Rejected: keeping the server as-is and patching only the page — the next consumer re-introduces the bug, and the page cannot distinguish "no data" from "100%" without a magic sentinel.

### D-2 — The agent reply carries its provenance

**Decision:** `AgentChatOutput` gains two optional fields:

```ts
provider?: string;   // 'nvidia-nim' | 'groq' | 'openrouter' | 'huggingface' | 'local-fallback'
degraded?: boolean;  // true when the deterministic local engine answered
```

The engine sets `degraded: true` (and `provider: 'local-fallback'`) on the `runLocalAgentResolution` path. The Agent panel renders a visible "Local fallback — no model configured" badge when `degraded` is true.

Rejected: inferring degradation client-side from "no credentials configured" — the user may have credentials configured but every provider failing. The server knows; the client does not.

### D-3 — The agent model dropdown reads the server's field names

`lib/agent/discovery.ts:11-12` defines `DiscoveredModel { id, label, badge?, description, tier }`. The frontend reads `m.name` and `m.tierBadge` (`AgentPanel.tsx:394,402-408`, `AgentSettingsView.tsx:129-147`) and the server's badge strings are capitalised while the client compares lowercase.

**Decision:** the server shape is canonical; the frontend is changed to read `label` and `badge`, and the badge comparison is case-insensitive. The E2E fixture is corrected to the same shape (it currently supplies `name`, which is exactly why CI cannot see this bug).

### D-4 — Spend is filtered to the month the UI claims

`GET /api/agent/usage` is documented as *"Month-to-date LLM usage and spend"* and rendered against a **monthly** $5.00 ceiling (D-08/D-27), but `routes/agent.ts:120-128` filters on `user_id` only — no date predicate. The number is all-time presented as monthly.

**Decision:** the server filters `created_at >= date_trunc('month', now())`; the client stops carrying a `?? 500` ceiling literal and reads `spendCeilingCents` from the response.

### D-5 — The user's authored memory facts say so

`MemoryPage.tsx:247-249` writes `source: 'conversational', confidence: 100, value: { createdByUser: true }`. `MemoryFactCard.tsx:160-168,460-470` then renders *"Inferred from chat"* and *"Cadence always asks before it changes anything"* — for a fact the user just typed. `createdByUser` is written but **read nowhere in the repo**.

**Decision:** the card reads `value.createdByUser` and renders *"Added by you"*; the confidence meter is not shown for user-authored facts (there is no measured confidence); the "Confirm before use" affordance is hidden because the fact never enters the confirmation queue.

Separately, `routes/memory.ts:197` overwrites `confidence` with the constant `85` on approval. **Decision:** approval preserves the confidence the extraction produced rather than minting a constant.

### D-6 — The Activity page is labelled for what it is

`pages/activity/ActivityPage.tsx` makes zero API calls; everything is `localStorage` (`cadence_activity_history_v1`). Its subtitle claims *"Zero-data-loss record of every task, focus block, and daily ritual"* and its "Agent" filter can never match (nothing writes an `agent_action` activity type).

**Decision:** relabel the page as **device-local**, correct the subtitle, correct the empty state ("Nothing has been recorded on this device yet"), and remove the dead "Agent" filter chip. The server-backed agent action log stays on `/agent`, where it already lives.

Rejected: rewiring the page to `GET /api/agent/actions`. That table holds *agent* actions only — it has no rows for focus sessions or UI task completions — so it would still not be the "unified activity log" the copy promises. Building that unified log is a feature, not a fix, and is out of scope.

### D-7 — The dev mock is verified, not trusted

**Decision:** extract the response fixtures from `lib/dev-mock.ts` into `artifacts/cadence/src/lib/dev-mock-fixtures.ts` as a pure, exported module; add `artifacts/cadence/src/lib/dev-mock.test.ts` that validates each fixture against the corresponding generated Zod schema from `@workspace/api-zod`; fix the 12 mismatches; correct the wrong intercepted path (`/api/reschedule/settings` → `/api/settings/rescheduling`); and render a persistent **"Sample data — not your account"** banner whenever the mock is active.

### D-8 — The lint rules are made able to fail, then the backlog is cleared

**Decision, in this order (the order is load-bearing):**

1. Add a `--self-test` mode to `scripts/lint-tokens.cjs` that runs every rule against a known-bad sample and exits non-zero if any rule fails to fire. This is what prevents the class from recurring.
2. Fix `no-raw-rgb-in-component`: drop the `\b` from `/\brgba?\(\s*\d/` (the word boundary fails against the `_` that precedes `rgba(` inside a Tailwind arbitrary value) → `/rgba?\(\s*\d/`.
3. Fix `no-undersized-tap-target`: it requires `<button` and the size class on the *same physical line*, which never happens in multi-line JSX. The rule engine evaluates per-line (`lint-tokens.cjs:404-405`), so the rule needs file-level context. **Decision:** add an optional `testFile(code, rel)` to the rule interface, evaluated once per file in the existing loop, and implement the rule against `<button …>` opening tags.
4. Clear the newly-surfaced backlog: 4 `rgba()` shadows (→ the existing `shadow-e3` token, or a new `--glow-*` token) and 41 sub-44px buttons (→ raise the box, or add the existing `tap-target-expand` utility, which keeps a small visual box at a 44px hit area).

The order matters: until step 2 and 3 exist, every other design-system fix in this plan is unverifiable.

### D-9 — The drawer gets its bottom safe-area inset back

`AppShell.tsx:804-811` applies `paddingTop: env(safe-area-inset-top)` only. The focus chip at `:748` correctly does `bottom: calc(1rem + env(safe-area-inset-bottom, 0px))`. The last quick-settings row (`min-h-12`) therefore sits under the iPhone home indicator.

**Decision:** add `paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))'` to the drawer. The committed More sheet this replaced already had it (`git show 8cfabb3`).

### D-10 — `dark:` utilities are made live, not deleted

`index.css:6` declares `@custom-variant dark (&:is(.dark *))` but `ThemeProvider.tsx:30-38` sets `data-theme` and never applies `.dark`. Five `dark:` utilities in `components/ui/` are inert. There is also no `prefers-color-scheme` support and no `'system'` theme option.

**Decision:** add a `'system'` theme option; `ThemeProvider` applies both `data-theme` **and** the `.dark` class when the resolved theme is dark, and follows the OS when set to `'system'`. This makes the existing `dark:` utilities live and gives OS-theme users a correct default.

### D-11 — Every uncontracted endpoint is either contracted or deleted

`GET /api/agent/models/:provider` and `POST /api/reschedule/check` are called by the frontend but absent from `openapi.yaml`, so neither has a generated client or a schema. Five backend endpoints have no frontend caller at all.

**Decision:** contract the two called endpoints (→ Orval codegen → replace the raw `fetch` call sites with generated hooks). For the five orphans: wire `GET /api/healthz` into `SystemStatusBanner` (it already documents the gap), wire `GET /api/agent/messages` into `AgentPanel` to replace the `localStorage` transcript, and **remove the unused generated hooks** for `GET /api/tasks/:id/blocks` rather than shipping a hook nobody calls.

`POST /api/tasks/recurring` and `GET /api/goals/history` are *features whose UI was never built* (a user cannot create a recurring task). Building them is out of scope — they get a spec of their own.

### D-12 — The server owns day boundaries; the client's timezone param is a bug

The audit initially reported this as a minor client/server split. Direct verification of `artifacts/api-server/src/lib/date.ts` and a repo-wide grep shows it is **worse, and it is a split-brain**:

- `lib/date-utils.ts:3-5` resolves the zone from the **browser**.
- The client sends it explicitly — 40 call sites across 15 files use the shape `{ date: today(), timezone: timezone() }` (`TodayPage.tsx:44,51,56`, `AppShell.tsx:150`, `ReviewPage.tsx:44,52,57`, `FocusPage.tsx:62,219`, `DashboardPage.tsx:34`, `ProfilePage.tsx:50,53,190`, `InboxPage.tsx:86,107`, `AgentPanel.tsx:380`, `AgentPage.tsx:23`, `RitualDialog.tsx:46`, `RescheduleProposals.tsx:189`, `QuickCaptureSheet.tsx:366,369`, `TaskEditor.tsx:145`, `TaskRow.tsx:64,90,146`, `WorkspacePanel.tsx:46`, `ActivityHistoryDrawer.tsx:243`, `ActivityPage.tsx:388`, `CalendarPage.tsx:36,262,273,296,298,299,306,310,311,315,370,619`).
- The server uses that value **verbatim**: `dayBounds(date, timezone)` → `normalizeTimeZone(timeZone)` (`artifacts/api-server/src/lib/date.ts:55-63, 89-90`). `normalizeTimeZone` falls back to **`"UTC"`**, not `Asia/Kolkata`.
- **No server code reads the user's stored timezone.** A grep for `users.timezone`, `notification_settings.timezone`, and any user-timezone resolver across `artifacts/api-server/src` returns **zero** reads of a timezone column.
- Meanwhile the **cron path does use it**: `routes/internal.ts:64-71` resolves the quiet window from `notification_settings` with an explicit `Asia/Kolkata` fallback.

So the two halves of the system disagree:

| Path | Timezone source | D-01 honoured? |
|---|---|---|
| Automation (pg_cron → `/api/internal/*` → Telegram) | the user's stored `notification_settings.timezone` | ✅ |
| API / UI (`/api/tasks?date=…&timezone=…`) | the **browser's** zone, sent by the client | ❌ |

The user cannot change their timezone in Settings and have the API honour it — the browser's zone always wins. For the owner (device and configured zone both `Asia/Kolkata`) the two agree, which is exactly why this has never surfaced.

**This also means the `AGENTS.md` §1 claim — *"Server-side day-boundary math resolves each user's IANA timezone with the D-01 `Asia/Kolkata` fallback"* — is not supported by the code on the API path.** That sentence must be corrected, not just the code.

**Decision:**

1. The server gains `resolveUserTimezone(tx, userId)` — reads `notification_settings.timezone`, falls back to `users.timezone`, falls back to **`Asia/Kolkata`** (D-01, never `UTC`).
2. The `timezone` **query parameter is removed from the contract** on the day-bounded endpoints. The client can no longer dictate the server's day boundary.
3. The server computes "today" itself when `date` is omitted; `date` remains for explicit-date queries (the Calendar).
4. The client renders in the user's zone, sourced from `GET /api/settings/notifications` via a new `useUserTimezone()` hook. The browser zone is a fallback used only until that query resolves.
5. `date-utils` gains an explicit `timeZone` parameter on the date-arithmetic helpers (`parseDateKey`, `shiftDate`, `monthStart`, `monthEnd`, `startOfWeek`), which currently reach the browser zone implicitly through `dateKey`.

---

## 4. Scope

### In scope

- `artifacts/cadence/src/**` — all pages and components
- `artifacts/api-server/src/routes/{analytics,agent,memory}.ts` and `src/lib/agent/{engine,discovery}.ts` — the contract-affecting routes
- `lib/api-spec/openapi.yaml` → Orval codegen → `lib/api-client-react`, `lib/api-zod`
- `scripts/lint-tokens.cjs`
- `artifacts/cadence/tests/e2e/**`
- Docs: `AGENTS.md` (where its measurements change), `DESIGN.md`, `README.md`, `spec/master-verification-matrix.md`, `docs/07-module-registry.md`, `docs/governance/g4-manual-verification-runbook.md`, `artifacts/cadence/src/lib/version-info.ts`
- Append-only: `AUDIT.md`, `CHANGELOG.md`

### Out of scope (recorded, not silently dropped)

| Item | Why | Where it goes |
|---|---|---|
| `POST /api/tasks/recurring` UI | A feature, not a fix. A user currently cannot create a recurring task. | Own spec |
| `GET /api/goals/history` UI | A feature, not a fix. | Own spec |
| Unified server-backed activity log | Would need a new table + write path for every mutation. | Own spec |
| `GET /api/tasks/:id/blocks` UI | The Calendar page uses the day-range query and is sufficient. | Hook removed |
| Regenerating the dev mock from the contract via Orval/MSW | The mock is *stateful*; stateless MSW mocks cannot express "POST creates a task a later GET returns". | D-7 (verify instead) |
| Physical-device G4-d…G4-l manual QA | Requires hardware. | Existing runbook, unchanged |
| Rebuilding the Android APK | No Android toolchain in this environment. | The download card is made truthful about the *current* APK instead |

---

## 5. Plan Decomposition

Three subsystems, three plans. Each plan produces working, testable software on its own and can be reviewed, merged, and shipped independently.

| Plan | Subsystem | Ships |
|---|---|---|
| **1 — Release Integrity & Truthfulness** | C1 + public-surface claims | The app stops telling users it knows things it does not |
| **2 — Design-System Gate Integrity** | C2 | The gates can fail, then the design-system backlog clears |
| **3 — API Contract & Coverage** | C3 | The frontend, the backend, the dev mock, and the E2E mocks agree |

**Plan 2's Task 1 must land before any other Plan 2 task** — every design-system fix is unverifiable until the two vacuous rules can fire.

---

## 6. Verification Strategy

The repo's 12-gate ladder (`pnpm run verify`) is the sole arbiter. **No plan is complete until the ladder is green AND `git status --porcelain` is empty** — CI fails the build on a dirty tree, and codegen rewrites `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` by design.

| Change class | Gate that proves it |
|---|---|
| Contract change (`openapi.yaml`) | `codegen` gate + a clean tree (regenerated output is committed) |
| Backend behaviour change | `test` gate (Vitest) + `verify:cron-routes` if a cron route is touched |
| Frontend behaviour change | `test` gate + `verify:e2e` |
| Design-system change | `lint:tokens` gate (after Plan 2 Task 1) + `contrast` + `verify:sizing` |
| Token change | `tokens:build` → `styles/tokens.css` regenerated, then `lint:tokens` |
| Text encoding | `encoding` gate (`scripts/scan-mojibake.cjs`) is the **only** arbiter — never a terminal read |

### New permanent gates introduced by this work

1. **`scripts/lint-tokens.cjs --self-test`** — every rule must fire on a known-bad sample. Wired into the `lint:tokens` gate.
2. **`artifacts/cadence/src/lib/dev-mock.test.ts`** — every dev-mock fixture must satisfy its generated Zod schema.
3. **`artifacts/cadence/tests/e2e/fixtures.contract.test.ts`** — every E2E mock response must satisfy its generated Zod schema.
4. **`artifacts/cadence/src/lib/version-info.test.ts`** — `APP_VERSION_INFO.version` must equal `package.json`'s, and the highlights list must not contain contradictory entries.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| The `onTimeRate: number → number \| null` contract change ripples into the Zod client and every consumer | The change is one optional widening; `ReviewPage` is the only consumer (verified by grep) |
| The lint rule fix surfaces 45 new violations and the ladder goes red | Planned and budgeted in Plan 2 Tasks 3-4; the ladder returns green in the same plan |
| `date-utils` timezone migration touches many pages | Staged: additive variants first, page migrations second, browser fallback retained until the user's zone is known |
| The working tree already carries an uncommitted v0.1.9 drawer refactor | Plan 2 Task 5 lands on top of it; the plan assumes the **current** working tree, and Task 0 re-verifies the tree is clean before any contract codegen |
| The dev-mock extraction touches a 789-line file | Extract verbatim first (pure move), fix shapes second — the diff stays reviewable |

---

## 8. Definition of Done

- [ ] `pnpm run verify` — 12/12 green
- [ ] `pnpm run verify:e2e` — all tests pass, with new coverage for `/projects`, `/activity`, `/dashboard`, `/download` and a direct `/agent` navigation
- [ ] `git status --porcelain` — empty
- [ ] No signed-in surface renders a success claim over empty data (verified by a new E2E assertion per affected page)
- [ ] `scripts/lint-tokens.cjs --self-test` passes; `lint:tokens` reports 0 errors / 0 warns with **no** baseline entries
- [ ] Every doc in the `AGENTS.md` §5 "Docs that must move with the change" table is updated in the same commit as its change
- [ ] `AUDIT.md` and `CHANGELOG.md` have **new dated entries** — no history rewritten
