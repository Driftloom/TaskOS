# AGENTS.md — Cadence (Personal Task & Time OS)

> **Canonical agent instruction file for Cadence.**
> **Scope & Provenance:** Synthesized from `spec/` (authoritative contracts), `docs/` (architecture & governance), and live code verification.
> **Freshness:** Re-measured and verified **2026-10-10**. Re-run `docs/governance/zero-trust-audit-prompt.md` weekly during active build weeks.

---

## 1. System Overview

**Cadence** is a personal task and time-management OS replacing paper planners: fast mobile capture, calendar time-blocking, focus timers, Telegram reminders, auto-reschedule engine, and an agent with 3-tier memory (`spec/system-requirements.md`).
- **Owner:** Rohit. Timezone: `Asia/Kolkata` (default). Work rhythm: 24h flexibility (`00:00–23:59`).
- **Multi-tenant safety invariant:** Single user currently, but strictly multi-user-safe from day one. Every table has `user_id`-scoped Row Level Security (RLS) via Supabase Postgres + Clerk auth (`spec/data-models-and-schema.md §4`).

### Measured System State (Verified 2026-10-10)
- **Database:** 19 migrations (`0000`–`0018`) applied with zero checksum drift.
- **API Server:** Express 5, 20 routers / 55+ handlers with `runWithRls` JWT claims enforcement.
- **Unit & Contract Tests:** **830 Vitest tests pass across 59 files** (25 skipped offline: 21 schema invariants without `DATABASE_URL`, 3 destructive legacy-ledger tests, 1 safety gate). All 39 `lib/db` tests pass in local container (`pnpm run test:db:local`).
- **E2E Tests:** **131 Playwright tests pass across 17 spec files** (`pnpm run verify:e2e:list`).
- **Verification Ladder:** **12 labelled gates (12/12 PASS)** via `pnpm run verify`. Token-lint baseline is empty (0 debt, 151/151 files scanned).

---

## 2. Essential Developer Commands

Run these from workspace root using `pnpm` (pnpm is strictly required):

### Verification & Testing
```bash
pnpm run verify            # Run full 12-gate verification ladder (typecheck, tokens, lint, contrast, codegen, build:api, build:web, dead-classes, cron-routes, auth-surface, encoding, test)
pnpm run verify:fast       # Fast 7-gate ladder (drops codegen, both builds, AND verify:no-dead-classes)
pnpm run test              # Run all Vitest suites across packages
pnpm run typecheck         # Full typecheck across libs, artifacts, and scripts
pnpm run typecheck:full    # Windows fallback (node tsc --build --force)
pnpm run verify:e2e        # Run Playwright E2E suite (self-mocks API, dev server required)
pnpm run verify:e2e:list   # List all 131 Playwright E2E tests
pnpm run verify:live       # Verify live deployment health & 401 boundaries (15 endpoints)
pnpm run verify:isolation  # Test two-account cross-tenant RLS isolation against backend
```

### Running a Single Test or Package
```bash
# Single test file
pnpm --filter @workspace/api-server test -- src/routes/tasks.test.ts
pnpm --filter @workspace/cadence test -- src/components/task/TaskRow.test.tsx

# Single package script
pnpm --filter @workspace/cadence run build
pnpm --filter @workspace/api-server run test
```

### Development Servers & Quirks
```bash
# API Server (port 5000, requires DATABASE_URL)
pnpm --filter @workspace/api-server run dev

# Web Frontend (Vite throws if PORT and BASE_PATH are unset)
pnpm --filter @workspace/cadence run dev
```

### Verification That Needs a Running Server or Browser
```bash
# verify:sizing drives a real browser against a PREVIEW SERVER on :4173.
# Without one it dies with ERR_CONNECTION_REFUSED, not a helpful message.
pnpm --filter @workspace/cadence run serve   # terminal 1 (needs PORT + BASE_PATH set)
pnpm run verify:sizing                       # terminal 2 -> asserts 22/22 utilities resolve

pnpm run verify:install                      # one-time: playwright chromium for :4173 probe
pnpm run verify:e2e                          # Playwright; installs its own browser in CI
```

### CI (`.github/workflows/ci.yml`)
Two jobs on push/PR to `main`: the ladder, then a separate Playwright job. Node 22, pnpm 11.20.0.

⚠️ **CI fails the build if the working tree is dirty after `pnpm run verify`** — it runs `git status --porcelain` and exits 1 on any output. Codegen rewrites `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` by design, so if you edited `openapi.yaml` without running `codegen`, or hand-touched a generated file, CI breaks even though every gate passed locally.

### Codegen & Database Migrations
```bash
# Contract codegen (MUST run after editing lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-spec run codegen   # Regenerates api-client-react and api-zod

# Database schema & migrations
pnpm --filter @workspace/db run push            # Dev only: push schema changes to DB
pnpm run db:migrate                             # Run pending Drizzle migrations
pnpm run test:db:local                          # Run all 39 DB tests in ephemeral Docker container
```

---

## 3. Architecture & Monorepo Boundaries

```
├── artifacts/
│   ├── cadence/           # React 19 + Vite + Tailwind v4 + shadcn/ui (PWA web app)
│   ├── api-server/        # Express 5 API (bundled with esbuild to dist/index.mjs)
│   └── mockup-sandbox/    # Throwaway component sandbox — NEVER import into app code!
├── lib/
│   ├── api-spec/          # openapi.yaml is the single SOURCE OF TRUTH for API contracts
│   ├── api-client-react/  # Generated TanStack React Query client (Orval output)
│   ├── api-zod/           # Generated Zod schemas (Orval output)
│   └── db/                # Drizzle schema (src/schema/) & migrations (migrations/)
├── tokens/tokens.json     # Single source of truth for design tokens
├── scripts/               # Build tokens, run 12 gates, verify contrast/utilities/cron
└── spec/                  # Authoritative architectural and subsystem specifications
```

---

## 4. Critical Engineering Invariants & Gotchas

### 1. Database & RLS Isolation (Load-Bearing)
- **Every API handler** must use `runWithRls(req, tx => ...)` from `artifacts/api-server/src/lib/rls.ts`. Direct queries to the raw `Pool` bypass RLS!
- `runWithRls` extracts Clerk `auth.jwt()->>'sub'` and sets PostgreSQL local config `request.jwt.claims`. If missing, it fails closed.
- Always include application-level `where user_id = ?` filters in Drizzle queries alongside RLS.
- Only `GET /api/healthz` is public. (Note: bare `/healthz` does **not** exist). All other routes require Clerk authentication (`requireAuth`).

### 2. Codegen Ordering & Generated Files
- `lib/api-spec/openapi.yaml` is the contract authority. Never hand-edit files in `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/`.
- Run `pnpm --filter @workspace/api-spec run codegen` on Linux/Replit after changing `openapi.yaml`.

### 3. Design Tokens & Tailwind v4 Custom Sizing Utilities
- **Tokens are generated:** `tokens/tokens.json` -> run `pnpm run tokens:build` to emit `artifacts/cadence/src/styles/tokens.css`. Never edit CSS token variables by hand.
- **Tailwind v4 `@utility` naming gotcha:** Tailwind v4 resolves `min-h-*`, `max-w-*`, `w-*` from `--spacing` *only*. Custom token namespaces (`--component-dimension-*`, `--size-*`) emit **zero CSS rules** if written as arbitrary Tailwind classes like `w-auth-card-w` or `min-h-size-control-md`.
- To consume custom dimensions, explicit `@utility` classes exist in `artifacts/cadence/src/styles/index.css` (e.g. `calendar-cell`, `auth-card-w`, `task-editor-max-w`, `timezone-menu-min-w`, `control-md-h`, `tap-target-h`).
- **Always use the exact utility class name in markup** (`className="auth-card-w"`, NOT `className="w-auth-card-w"`). Check validity with `pnpm run verify:sizing` — but it needs `vite preview` running on :4173 first, and Playwright chromium installed (`pnpm run verify:install`), or it dies with `ERR_CONNECTION_REFUSED`.
- **Enforced scale rules:** Raw font sizes (`text-xs`, `text-sm`) and durations (`duration-200`) fail `pnpm run lint:tokens`. Use token classes: `text-caption`, `text-callout`, `text-macro`, `text-display1..4`, `duration-base`, etc.

### 4. Clerk UI Cascade Specificity Trap
- Clerk's client components inject unlayered runtime styles (`.cl-formButtonPrimary`, `.cl-socialButtonsBlockButton`, etc.) that override standard Tailwind utility classes.
- When styling Clerk auth screens, standard classes like `bg-accent` can result in transparent CTAs, 0px borders, or low contrast.
- Customise Clerk styling via its `appearance` prop with explicit CSS properties or use high-specificity selectors (`[data-variant]`, scoped CSS classes) that match Cadence contrast tokens.

### 5. Supply-Chain & Package Manager Discipline
- **pnpm only:** Root `preinstall` (`scripts/enforce-pnpm.cjs`) automatically blocks npm/yarn and removes spurious lockfiles.
- **Supply-chain delay:** `minimumReleaseAge: 1440` (24 hours) is active in `pnpm-workspace.yaml`. Never disable this setting.
- **Two catalog pins are load-bearing** — a blanket `pnpm update` breaks both: `react`/`react-dom` pinned to exactly `19.1.0` (expo requires it), and `jsdom` held below `30` (jsdom 30 removed the `ResourceLoader` export that vitest's jsdom environment destructures on setup).

### 6. Text Encoding on Windows
- **PowerShell 5.1 mangles UTF-8 on write** (it re-encodes through CP1252). It then *looks* mangled in the console, because this console is codepage 437 and renders valid UTF-8 as garbage too. The file and the display can both be wrong, so a terminal read cannot be evidence either way.
- `scripts/scan-mojibake.cjs` (gate 10) is the only arbiter. Its output is ASCII-only by contract. If it fails, restore clean bytes from git and re-run the transform — do not re-encode by hand, and do not "fix" a file the gate calls clean.
- Prefer a proper editor or the Write tool over `Set-Content`/`Out-File` for any file under `artifacts/`, `lib/`, `scripts/`, `docs/`, `spec/`, or `tokens/`.

---

## 5. Global Product Rules (Do and Don't)

### Always Do
1. **Zero trust, permanently:** Every status claim or prior agent statement is unverified until independently verified against code or test execution.
2. **Never move a fixed/immovable calendar event** under any auto-reschedule mode (`spec/auto-reschedule-engine.md Rule 1`).
3. **Never silently reschedule or bulk-edit:** Every automated change or agent bulk-action must log what changed and notify the user.
4. **Confirm bulk actions touching > 10 tasks:** Require explicit user confirmation before executing.
5. **Log all agent actions to `agent_action_log`:** Provide enough state to reverse changes and expose a 1-click "Undo" command in UI and Telegram.
6. **Always update and create required documentation with code changes:** Code changes without matching documentation violate zero trust. When introducing or updating features, APIs, schemas, or tokens, immediately update `spec/`, governance docs, or module registries, and create new docs where missing.
7. **Strict streaks (no freeze):** Streaks reset on a missed day; no grace periods or freeze mechanics (`spec/locked-decisions.md D-06`).
8. **Primary reminder channel is Telegram Bot API:** iOS PWA Web Push is secondary due to OS delivery unreliability (`spec/locked-decisions.md D-15`).
9. **Batch catch-up notifications:** If > N reminders are pending after user absence, send one batched summary instead of N separate alerts (`spec/locked-decisions.md D-22`).
10. **Color accessibility:** Never communicate status with color alone. Every status color must pair with a distinct icon/shape (`spec/design-system.md §2`).

### Docs that must move with the change
Rule 6 above is generic on purpose. This is the concrete map — a change is not done until every file it touches is updated in the same commit.

| If you change | Also update |
|---|---|
| the gate list in `scripts/run-gates.cjs` | AGENTS.md §2 + §4, `README.md`, the job name in `.github/workflows/ci.yml` |
| any Vitest test file (added/removed) | `README.md`, `DESIGN.md`, `spec/master-verification-matrix.md`, `docs/07-module-registry.md`, `docs/governance/g4-manual-verification-runbook.md`, `artifacts/cadence/src/lib/version-info.ts` |
| any Playwright spec (added/removed) | `README.md`, `spec/master-verification-matrix.md`, `artifacts/cadence/src/lib/version-info.ts` |
| a migration in `lib/db/migrations/` | AGENTS.md §1, `README.md` |
| a rule in `scripts/lint-tokens.cjs` or `tokens/tokens.json` | AGENTS.md §4 |
| anything user-visible | `artifacts/cadence/src/lib/version-info.ts` highlights |
| a subsystem with no home yet | create the doc, then link it from here |

⚠️ `AUDIT.md` and `CHANGELOG.md` are **append-only**. Never rewrite a past entry to match the present — add a new dated entry. Rewriting history destroys the before/after comparison, which is also why `docs/archive/13-master-design-system-prompt.md` is deliberately a stale snapshot.

### Never Do
1. **Never overwrite historical audit logs:** Append new dated entries; never overwrite `AUDIT.md` or `PROGRESS.md`.
2. **Never build Reminders or Auto-reschedule before prerequisites:** Timezone (`users.timezone`), working hours, and monitoring heartbeat must exist first.
3. **Never use Replit's local DB:** Supabase Postgres is the single source of truth across all environments.
4. **Never auto-file paper-photo imports:** Draft tasks from photos must always route through a confirm-before-save queue (`spec/locked-decisions.md D-23`).
5. **Never build deferred features without explicit instruction:** Helicone/LangSmith, dedicated OCR vendors, Google Calendar sync, payments/billing are explicitly deferred (`spec/locked-decisions.md D-24`).

---

## 6. Settled Decisions Summary (D-01 through D-31)

Full reference in [`spec/locked-decisions.md`](spec/locked-decisions.md). Summary of key decisions:

| ID | Topic | Settled Decision |
|---|---|---|
| **D-01** | Home Timezone | `Asia/Kolkata` (IANA string in `users.timezone` / `notification_settings.timezone`) |
| **D-02** | Work Rhythm | Defaults to 24-hour flexibility (`00:00–23:59`) |
| **D-03** | Reschedule Cap | **5 auto-moves maximum per task**, then flags "needs attention" |
| **D-04** | Automation Dial | `auto` on 1st miss; auto-downgrades to `ask` on 2nd miss of same task |
| **D-05** | Bulk Confirmation | **> 10 tasks** in one agent action requires explicit user confirmation |
| **D-06** | Streak Mechanics | Strict streaks only. No freeze / grace periods |
| **D-07** | LLM Chain | LiteLLM: NVIDIA NIM primary → Groq/OpenRouter fallback → Hugging Face |
| **D-08 / D-27** | LLM Spend Ceiling | \$5.00/month (~₹400) alert threshold tracked in `llm_usage` |
| **D-09** | Memory Extraction | Nightly batch job via `pg_cron` (not per message) |
| **D-10** | Memory Confirmation | Source A (behavioral) auto-updates; Source B (conversational) prompts user |
| **D-11** | Memory Screen | First-class transparency screen mounted at `/memory` |
| **D-13** | Reschedule Rule 9 | Engine checks `memory_facts` for task duration multiplier before placement |
| **D-14** | Colorblind Safety | Status colors paired with icons (CheckCircle, AlertTriangle, Clock, Sparkles) |
| **D-15** | Notifications | **Telegram Bot API is primary**; Web Push is secondary; Email is fallback |
| **D-16 / D-17** | Stack | Clerk Auth + Supabase Postgres with `runWithRls` JWT claims enforcement |
| **D-18** | API Backend | Node.js Express 5 in TypeScript (never Python/FastAPI) |
| **D-19** | Job Scheduling | `pg_cron` + `pg_net` calling `/internal/dispatch` and `/internal/reschedule` |
| **D-20** | Monitoring | Healthchecks.io dead-man's switch ping + Sentry + `automation_flags` kill switch |
| **D-22** | Catch-Up Alerts | Batch pending alerts into a single summary ping |
| **D-23** | Paper Import | Photo import drafts route to confirmation queue, never auto-saved |
| **D-24** | Deferred Features | Deferred: Helicone, dedicated OCR, Google Calendar sync, billing |
| **D-25** | Liquid Glass | `backdrop-blur-xl` + 1px border restricted to chrome (dock, headers, sidebar) |
| **D-26** | Agent Action Log | All agent writes logged to `agent_action_log` with 1-click undo |
| **D-28** | Parallel-Run Trial | Paper planner stays primary until 2 weeks or 7 consecutive matching days |
| **D-29** | Design Tokens P18–P32 | Ratified standard (contrast, 44px hit areas, vestibular safety, floor ≥ 12px) |
| **D-30** | Automation Kill Switch | `PUT /api/automation/flags/:key` authenticated & whitelisted (`reminders`, `reschedule`) |
| **D-31** | Typography Bridge | Extended 17-step scale (`display1..4`, `micro`) bridges Tailwind sizes without churn |

---

## 7. Build Order & Verification Ladder Status

### Implementation Roadmap Progress
1. Architecture decision (Supabase + Clerk + RLS + pgvector + pg_cron) — **Done & verified (5/5)**
2. Security & hardening (no demo-user, FK/CHECK constraints, CORS allowlist) — **Done & verified (5/5)**
3. Reproducible builds & tooling (Vitest, Playwright, 12-gate ladder) — **Done & verified (5/5)**
4. Onboarding & Settings (`users.timezone`, work rhythm, kill switch UI) — **Done & verified (5/5)**
5. Reminders & heartbeat (dispatcher, Healthchecks ping, kill switch) — **Built & connected (4/5)**
6. Auto-reschedule engine (sweep, proposals, Rule 9 memory integration) — **Built & connected (4/5)**
7. Calendar time-blocking (`time_blocks`, hour grid) — **Done & verified (5/5)**
8. Telegram bot wiring (two-way webhook `done`, `snooze 1h`, `list today`) — **Backend built (4/5)**
9. Agent & memory (LiteLLM, `memory_facts`, `/memory` screen) — **Built & verified (4/5)**
10. Recurrence & monthly goals (rrule, `monthly_goals`, guided rituals) — **Built & verified (4/5)**
11. Task links, search & archive (`task_links`, `tsvector`, archive filter) — **Done & verified (5/5)**
12. Paper-photo-import (Claude vision to draft confirmation queue) — **Deferred / pending**
13. Analytics & export polish — **Pending**
14. Full manual QA & 2-week parallel-run trial — **ACTIVE TARGET / IN PROGRESS**

### Manual Testing Backlog (G4 Matrix)
- **Verified PASS (Live 2026-10-10):**
  - **G4-a:** Signed-out request returns `401` across protected endpoints (`GET /api/healthz` returns `200`).
  - **G4-b:** Two-account cross-tenant RLS isolation verified with zero leakage across 10 steps.
  - **G4-c:** PWA real-device install & mobile standalone launch verified.
- **Active Remediation Items (Tested live 2026-10-10 on physical devices):** procedures in `docs/governance/g4-manual-verification-runbook.md`
  - **G4-d:** Focus timer background survival & empty-queue fallback state.
  - **G4-e:** Telegram reminder delivery & bot token environment variable configuration.
  - **G4-f:** Reschedule sweep proposal rendering & empty-state UX.
  - **G4-g:** Agent natural language task creation regex & action undo log recovery.
  - **G4-h:** Agent bulk confirmation API route & UI action confirmation wiring.
  - **G4-i:** Rule 9 memory multiplier extraction integration.
  - **G4-j / G4-k:** Monthly goal close cron execution observation & carry-forward immutability check.
  - **G4-l:** First-load performance (LCP over budget due to render-blocking Clerk auth bundle).
- **Open design decision — NOT a defect, do not "fix" it silently:** `verify:auth-surface` reports **8 WARN** lines, all `F3 CTA fill vs card — 2.14:1` against the WCAG 1.4.11 floor of 3:1. Clerk draws the CTA's ring in the button's **own fill**, so the measured ratio is really brand-orange-on-light-card. The gate deliberately reports this as a WARN and deliberately does **not** assert it: closing it means changing the light-theme `--primary` fill, which is a visual design decision, not a defect fix. It is listed here so it is not rediscovered from CI logs. A `PASS` from this gate means "no measured defect" — it does **not** mean the 8 warns are resolved, and the gate's own output says so.
