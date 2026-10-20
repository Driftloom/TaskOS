# API Contract & Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend, the backend, the dev mock, and the E2E mocks agree on one contract — and make the server, not the browser, decide what day it is.

**Architecture:** Three endpoints the frontend calls are absent from `openapi.yaml`, so they have no generated client and no schema. The E2E mock hand-writes a second, divergent copy of the contract — 9 of ~40 shapes differ, and one of them (`/api/agent/models/:provider`) is precisely why a production bug ships green through CI. Separately, the client sends the **browser's** timezone on 40 call sites and the server uses it verbatim, while the cron path uses the user's stored timezone — two halves of the system disagree about what day it is. The fix: contract everything, validate every mock against the generated Zod schemas, and move day-boundary ownership to the server.

**Tech Stack:** TypeScript, Express 5, OpenAPI 3.1 + Orval 8.23 (codegen), Zod, Drizzle ORM, Vitest, Playwright, Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-10-20-frontend-truthfulness-and-design-integrity-design.md`

## Global Constraints

- **pnpm only.** Root `preinstall` blocks npm/yarn.
- **The contract is the authority.** `lib/api-spec/openapi.yaml` is the single source of truth. Edit it, then run `pnpm --filter @workspace/api-spec run codegen`, then commit the regenerated `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` output **in the same change**. Never hand-edit a generated file.
- **Never query the raw `Pool`.** Every backend handler uses `runWithRls(req, tx => ...)` from `artifacts/api-server/src/lib/rls.ts`, with an application-level `where user_id = ?` alongside RLS.
- **Every endpoint except `GET /api/healthz` requires `requireAuth`.** The internal cron endpoints use the `x-dispatch-secret` header; the Telegram webhook uses `X-Telegram-Bot-Api-Secret-Token`. Do not widen any of these.
- **Append-only history.** `AUDIT.md` and `CHANGELOG.md` get new dated entries; never rewrite a past entry.
- **Docs move with the change** (`AGENTS.md` §5). Any test file added or removed → `README.md`, `DESIGN.md`, `spec/master-verification-matrix.md`, `docs/07-module-registry.md`, `docs/governance/g4-manual-verification-runbook.md`, `artifacts/cadence/src/lib/version-info.ts`.
- **Text encoding.** Use the Write/Edit tools, never `Set-Content`/`Out-File`. `node scripts/scan-mojibake.cjs` is the only arbiter.
- **CI fails on a dirty tree.** Every task must end with `git status --porcelain` empty — including the regenerated codegen output.

## Review Focus

These are the failure modes the spec implies that no existing test exercises. Each is pinned to a task below.

1. **A mock that diverges from the contract hides a production bug.** The `/api/agent/models/:provider` mock returns `name`; the server returns `label`; the frontend reads `name`. The mock is the only reason CI is green on a broken dropdown. A mock that is not validated against the contract will hide the next one too. → Task 3
2. **Removing a query parameter breaks every generated client and every call site.** Dropping `timezone` from the contract touches 40 frontend call sites plus the generated React Query hooks. A missed call site is a silent behaviour change, not a compile error, if the param was optional. → Task 6
3. **The server's timezone fallback must be D-01, not UTC.** `normalizeTimeZone` currently falls back to `"UTC"`. If the user lookup misses, a UTC day boundary is exactly the bug being fixed — the fallback must be `Asia/Kolkata`. → Task 6
4. **Cron and API must agree.** The automation path already resolves the user's stored zone. If the API path resolves it differently, reminders fire on one day while the UI shows another — the failure is invisible until a reminder lands at the wrong hour. → Task 6
5. **An unmocked endpoint must fail loudly.** The E2E harness returns `501 {error:'unmocked_endpoint'}` for unknown `/api/*` and `console.spec.ts:88-112` asserts on it. Any new mock must preserve that fail-loud behaviour, and any endpoint added to the app must be mocked or deliberately excluded. → Task 3

---

### Task 1: Contract the two endpoints the frontend calls but the spec omits

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Modify: `artifacts/api-server/src/routes/agent.ts`
- Modify: `artifacts/api-server/src/routes/reschedule.ts`
- Modify: `artifacts/cadence/src/components/agent/AgentPanel.tsx`
- Modify: `artifacts/cadence/src/pages/settings/AgentSettingsView.tsx`
- Modify: `artifacts/cadence/src/components/task/RescheduleProposals.tsx`
- Modify: `artifacts/cadence/src/lib/custom-fetch.ts` (only if the generated hook needs a mutator adjustment)

**Interfaces:**
- Consumes: `artifacts/api-server/src/lib/agent/discovery.ts:9-15` — `DiscoveredModel { id: string; label: string; badge?: string; description: string; tier: string }`
- Produces (contract additions, then codegen):
  - `GET /api/agent/models/{provider}` → `{ provider: string; models: DiscoveredModel[]; defaultModel?: string }`
  - `POST /api/reschedule/check` → the server's actual check result shape (read `routes/reschedule.ts:217` for the exact response before writing the schema)

- [ ] **Step 1: Write the failing test**

In `artifacts/cadence/src/components/agent/AgentActionCard.test.tsx` (or the AgentPanel test file), assert that the generated hook `useListAgentModels` is used and renders a model's `label`. The import will not resolve until codegen runs — that is the failing state.

Run: `pnpm --filter @workspace/cadence test -- src/components/agent/`
Expected: FAIL — module not found.

- [ ] **Step 2: Read the two server handlers**

Open `artifacts/api-server/src/routes/agent.ts` (the `/models/:provider` handler, ~line 379) and `artifacts/api-server/src/routes/reschedule.ts` (the `/check` handler, ~line 217). Record their exact request and response shapes. **The contract must match the server, not the other way round** — unless the server's shape is itself wrong, in which case fix the server first and say so in the commit message.

- [ ] **Step 3: Add both paths to the contract**

In `lib/api-spec/openapi.yaml`:

- Add `/agent/models/{provider}` with a `get` operation, `operationId: listAgentModels`, `tags: [agent]`, `security: [clerkSession: []]`, a `provider` path parameter, and a response referencing a new `DiscoveredModelList` schema.
- Add `RescheduleCheckInput` and `RescheduleCheckResult` component schemas describing the `/reschedule/check` request body and response.
- Add `/reschedule/check` with a `post` operation, `operationId: checkRescheduleSlots`, `tags: [reschedule]`, `security: [clerkSession: []]`.

Match the existing file's conventions exactly: `operationId` casing, `security` placement, `tags`, and the `components/schemas` naming style. Read three neighbouring operations before writing.

- [ ] **Step 4: Regenerate the clients**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: `lib/api-client-react/src/generated/` gains `useListAgentModels` and `useCheckRescheduleSlots`; `lib/api-zod/src/generated/` gains the two new schemas. `git status --porcelain` shows both directories modified.

- [ ] **Step 5: Replace the raw `fetch` calls with the generated hooks**

- `artifacts/cadence/src/components/agent/AgentPanel.tsx:394-396` — replace the `customFetch<...>` call with the generated `useListAgentModels({ provider })` hook.
- `artifacts/cadence/src/pages/settings/AgentSettingsView.tsx:128-132` — same.
- `artifacts/cadence/src/components/task/RescheduleProposals.tsx:132` — replace the raw `fetch` to `POST /api/reschedule/check` with the generated `useCheckRescheduleSlots` mutation.

After this, `grep -rn "fetch(" artifacts/cadence/src --include=*.tsx --include=*.ts` should return **only** `lib/custom-fetch.ts` and `lib/dev-mock.ts`. Verify.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/components/agent/ src/components/task/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated/ lib/api-zod/src/generated/ artifacts/api-server/src/routes/ artifacts/cadence/src/components/ artifacts/cadence/src/pages/settings/AgentSettingsView.tsx
git commit --no-gpg-sign -m "feat(api): contract the agent-models and reschedule-check endpoints"
```

---

### Task 2: Close the remaining contract drift

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Modify: `artifacts/api-server/src/routes/agent.ts`
- Modify: `artifacts/api-server/src/routes/memory.ts`
- Modify: `artifacts/api-server/src/routes/rituals.ts`
- Modify: `artifacts/api-client-react/src/generated/` (regenerated)
- Modify: `lib/api-zod/src/generated/` (regenerated)

**Interfaces:**
- Consumes: the drift table below
- Produces: server responses and contract schemas agree, shape for shape

- [ ] **Step 1: Write the failing backend tests**

In `artifacts/api-server/src/routes/agent.test.ts` (create it if absent), assert that `GET /api/agent/actions?limit=5` returns **at most 5** actions. Currently the server hardcodes `.limit(30)` (`routes/agent.ts:104`) and never reads `req.query.limit`, so the test fails.

In `artifacts/api-server/src/routes/memory.test.ts` (create it if absent), assert that `DELETE /api/memory/facts/:id` returns a body matching the contract — today the server returns `{success: true}` while the contract declares `{ok: boolean}`.

Run: `pnpm --filter @workspace/api-server test -- src/routes/agent src/routes/memory`
Expected: FAIL on both.

- [ ] **Step 2: Fix the four drifts**

| # | Drift | Fix |
|---|---|---|
| a | `GET /api/agent/actions` documents a `limit` param the server ignores (`routes/agent.ts:104` hardcodes 30) | Read `req.query.limit`, clamp it to 1-100, apply it. The contract already documents `default: 20, max: 100` — align the default to 20 |
| b | `DELETE /api/memory/facts/:id` — server `{success:true}`, contract `{ok:boolean}` | Change the **server** to `{ok: true}` (the contract is the authority) and regenerate. The frontend ignores the body, so this is safe |
| c | `POST /api/tasks/recurring` — the server's Zod enum accepts `urgent` (`routes/rituals.ts:28`), the contract allows only `low\|medium\|high` (`openapi.yaml:2980-2983`) | Add `urgent` to the contract enum. The server is the more permissive one and changing it would break an existing caller |
| d | `POST /api/memory/confirmations/:id/decline` returns `{success, fact}` where the contract declares only `{fact}` (`openapi.yaml:1281-1285`) | Remove `success` from the server response so it matches the contract exactly |

- [ ] **Step 3: Regenerate and run the backend tests**

Run: `pnpm --filter @workspace/api-spec run codegen && pnpm --filter @workspace/api-server test -- src/routes/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated/ lib/api-zod/src/generated/ artifacts/api-server/src/routes/
git commit --no-gpg-sign -m "fix(api): align agent-actions limit and memory-fact responses with the contract"
```

---

### Task 3: The E2E mocks are validated against the contract

**Files:**
- Create: `artifacts/cadence/tests/e2e/fixtures.contract.test.ts`
- Modify: `artifacts/cadence/tests/e2e/fixtures.ts`
- Modify: `artifacts/cadence/package.json` (add the `@workspace/api-zod` devDependency)

**Interfaces:**
- Consumes: the generated Zod schemas from `@workspace/api-zod`
- Produces: `artifacts/cadence/tests/e2e/fixtures.ts` exports a pure `MOCK_RESPONSES` map — `{ [pathPattern: string]: unknown }` — that the contract test validates and the `page.route` handler serves

- [ ] **Step 1: Extract the mock responses into a pure map**

In `artifacts/cadence/tests/e2e/fixtures.ts` (~lines 245-810), the handler is a long `if/else` chain over `pathname` that returns inline literals. Extract every **static** response body into an exported, pure object:

```ts
export const MOCK_RESPONSES: Record<string, unknown> = {
  '/api/memory/facts': { facts: [/* … */] },
  '/api/goals': [/* … */],
  // …
};
```

Keep the **stateful** handlers (the task list, the goal list, the focus target) in the route handler — they mutate across requests and cannot be a static map. Keep the fail-loud default (`501 {error:'unmocked_endpoint', path, method}`, lines ~803-806) exactly as it is: Review Focus #5 depends on it.

- [ ] **Step 2: Add the dependency and write the contract test**

Add `"@workspace/api-zod": "workspace:*"` to `artifacts/cadence/package.json` `devDependencies` **if Plan 1 Task 13 has not already added it** (Plan 1 Task 13 adds the same dependency — check the file first and skip if present). Then run `pnpm install` if you added it.

Create `artifacts/cadence/tests/e2e/fixtures.contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ListMemoryFactsResponse, GetAgentUsageResponse, /* … */ } from '@workspace/api-zod';
import { MOCK_RESPONSES } from './fixtures';

describe('E2E mock responses satisfy the API contract', () => {
  it('/api/memory/facts', () => {
    expect(ListMemoryFactsResponse.safeParse(MOCK_RESPONSES['/api/memory/facts']).success).toBe(true);
  });
  // one case per static mock
});
```

Use the exact schema export names from `lib/api-zod/src/generated/api.ts` — read that file; do not guess them. Add a case for every entry in `MOCK_RESPONSES`, so a new mock cannot be added without a schema check.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @workspace/cadence test -- tests/e2e/fixtures.contract.test.ts`
Expected: FAIL on the 9 known drifts:

| Mock | Mock says | Contract says |
|---|---|---|
| `fixtures.ts:~737` | `spendCeilingCents: 5000` | `500` (server `MONTHLY_SPEND_CEILING_CENTS`) |
| `fixtures.ts:~661` | `telegram.source: 'unset'` | enum `database \| env \| none` |
| `fixtures.ts:~671-679` | `{success, deviceCount}` / `{success, delivered, failed, removed}` | `{ok, id}` / `{ok}` / `{ok, sent, failed}` |
| `fixtures.ts:~761-763` | `{id, name, provider, tier, description}` | `{id, label, badge?, description, tier}` |
| `fixtures.ts:~771-780` | `{success, provider, model}` | `AgentCredentialStatus {provider, configured, keyHint, model, baseUrl, updatedAt}` |
| `fixtures.ts:~107` | `status: 'open' \| 'sealed'` | enum `open \| closed` |
| `fixtures.ts:~580-583` | `DELETE /api/goals/:id` → `{ok:true}` | `{success: boolean}` |
| `fixtures.ts:~343-348` | `summary.open` = `status === 'open'` only | server counts all due rows minus completed |

The last one is a semantic difference, not a shape difference — the contract allows both, but the E2E mock should match the server's definition so the tests exercise production behaviour.

- [ ] **Step 4: Fix every drift**

Correct each mock to satisfy its schema, using the server's implementation as the reference for semantics. Re-read the server route for each one — do not infer from the contract alone.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- tests/e2e/fixtures.contract.test.ts`
Expected: PASS for every mock.

- [ ] **Step 6: Run the E2E suite**

Run: `pnpm run verify:e2e`
Expected: PASS. Some specs may assert on the old mock values (e.g. an assertion on "$50.00" from the 5000-cent ceiling) — update those assertions to the corrected values.

- [ ] **Step 7: Commit**

```bash
git add artifacts/cadence/tests/e2e/ artifacts/cadence/package.json pnpm-lock.yaml
git commit --no-gpg-sign -m "test(e2e): validate every mock response against the API contract"
```

---

### Task 4: Cover the routes that have no E2E test

**Files:**
- Modify: `artifacts/cadence/tests/e2e/fixtures.ts` (the `APP_ROUTES` list, lines ~939-949)
- Create: `artifacts/cadence/tests/e2e/pages-uncovered.spec.ts`
- Modify: `artifacts/cadence/tests/e2e/pages.spec.ts` (if the shared helpers live there)

**Interfaces:**
- Consumes: the `gotoRoute` helper and `installMockApi` from `fixtures.ts`
- Produces: `APP_ROUTES` includes every registered protected route; a new spec file covers the uncovered ones

- [ ] **Step 1: Write the failing test**

Create `artifacts/cadence/tests/e2e/pages-uncovered.spec.ts` with one test per uncovered route:

| Route | Assert |
|---|---|
| `/projects` | the page heading renders; creating a project via the UI calls `POST /api/projects` and the new project appears |
| `/activity` | the page renders; its empty state is the device-local copy (Plan 1 Task 10) |
| `/dashboard` | the page renders; the API-failure path shows an `ErrorState`, not the "all complete" copy (Plan 1 Task 6) |
| `/download` | the page renders; it shows the APK's version, not the web app's (Plan 1 Task 2) |
| `/agent` (direct navigation) | `page.goto('/agent?test_auth=true')` mounts the Agent panel — today no spec navigates here directly, and `/agent` is excluded from `APP_ROUTES` |

Run: `pnpm run verify:e2e -- --grep "pages-uncovered"`
Expected: FAIL on the assertions that depend on Plan 1's changes landing first. **Sequence this task after Plan 1 is merged.**

- [ ] **Step 2: Add the routes to `APP_ROUTES`**

In `artifacts/cadence/tests/e2e/fixtures.ts`, add `/projects`, `/dashboard`, `/agent`, and `/activity` to the `APP_ROUTES` array. `/activity` is a public route? No — check `App.tsx:613`; it is inside the protected shell, so include it.

Adding them to `APP_ROUTES` means the shared "the shell actually mounted" assertion now covers them — which is the point.

- [ ] **Step 3: Run the spec to verify it passes**

Run: `pnpm run verify:e2e -- --grep "pages-uncovered"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/cadence/tests/e2e/
git commit --no-gpg-sign -m "test(e2e): cover the projects, activity, dashboard, download and agent routes"
```

---

### Task 5: Triage the five orphan endpoints

**Files:**
- Modify: `artifacts/cadence/src/components/chrome/SystemStatusBanner.tsx`
- Modify: `artifacts/cadence/src/components/agent/AgentPanel.tsx`
- Modify: `lib/api-client-react/src/generated/` (regenerated — a hook is removed)
- Modify: `lib/api-spec/openapi.yaml` (only if a path is removed)

**Interfaces:**
- Consumes: `GET /api/healthz` → `HealthStatus`; `GET /api/agent/messages` → the server-side conversation transcript
- Produces: `SystemStatusBanner` renders a real health signal; `AgentPanel` persists its transcript on the server instead of `localStorage`

- [ ] **Step 1: Write the failing test**

In `artifacts/cadence/src/components/agent/AgentActionCard.test.tsx` (or the AgentPanel test file), assert that after a chat turn, the transcript is retrievable from `GET /api/agent/messages` — i.e. the panel **loads** the server transcript on mount, and does not read `localStorage['cadence_agent_turns_v1']`.

Run: `pnpm --filter @workspace/cadence test -- src/components/agent/`
Expected: FAIL.

- [ ] **Step 2: Move the agent transcript to the server**

In `artifacts/cadence/src/components/agent/AgentPanel.tsx`:

- Lines ~344-354: seed `turns` from `GET /api/agent/messages` (the endpoint exists at `routes/agent.ts:56` and is **absent from `openapi.yaml`**) instead of from `localStorage`.
- Lines ~356-363: stop writing the transcript to `localStorage`. The server already writes `agent_conversations`; add the missing path to the contract so the client can read it.
- Line ~941: `DELETE /api/agent/messages` (the route exists at `routes/agent.ts:72`) instead of clearing the `localStorage` key.
- Add `/agent/messages` (GET and DELETE) to `lib/api-spec/openapi.yaml`, then run `pnpm --filter @workspace/api-spec run codegen`.

Note the consequence: a dev-mode canned reply no longer survives in `localStorage` and replays after the backend becomes real, and an Undo in the server no longer leaves a stale "Done" bubble in a browser-local transcript.

- [ ] **Step 3: Wire the health check into the status banner**

`artifacts/cadence/src/components/chrome/SystemStatusBanner.tsx` documents the gap at lines ~17-21 (*"the `automation paused` instance … is NOT wired"*). The generated `useHealthCheck` hook exists (`lib/api-client-react/src/generated/api.ts:209`) but is imported nowhere.

Wire `useHealthCheck` into `SystemStatusBanner` so the banner can report a real backend health signal. The banner is presentational today — read it and decide whether to add a data prop or call the hook directly; prefer a data prop so the component stays presentational and testable.

- [ ] **Step 4: Remove the dead generated hook**

`GET /api/tasks/:id/blocks` has a generated hook (`useListTaskBlocks`, `generated/api.ts:1771`) that nothing imports. The Calendar page uses the day-range query and is sufficient.

**Decision:** remove the path from `lib/api-spec/openapi.yaml` and regenerate, so the generated client stops advertising a capability that does not exist in the UI. If removing a path from the contract is judged too aggressive for this change, the alternative is to keep it and add a comment — but the contract must not advertise an endpoint with no caller and no UI.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/cadence test -- src/components/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated/ lib/api-zod/src/generated/ artifacts/cadence/src/components/
git commit --no-gpg-sign -m "feat(agent): persist the chat transcript on the server and wire the health check"
```

---

### Task 6: The server owns the day boundary

**Files:**
- Create: `artifacts/api-server/src/lib/user-timezone.ts`
- Create: `artifacts/api-server/src/lib/user-timezone.test.ts`
- Modify: `artifacts/api-server/src/routes/tasks.ts`
- Modify: `artifacts/api-server/src/routes/momentum.ts`
- Modify: `artifacts/api-server/src/routes/analytics.ts`
- Modify: `artifacts/api-server/src/routes/focus-sessions.ts`
- Modify: `artifacts/api-server/src/routes/rituals.ts`
- Modify: `artifacts/api-server/src/routes/agent.ts`
- Modify: `artifacts/api-server/src/lib/date.ts`
- Modify: `lib/api-spec/openapi.yaml`
- Modify: `artifacts/cadence/src/lib/date-utils.ts`
- Create: `artifacts/cadence/src/hooks/useUserTimezone.ts`
- Modify: the 15 frontend files that pass `timezone: timezone()`
- Modify: `lib/api-client-react/src/generated/`, `lib/api-zod/src/generated/` (regenerated)

**Interfaces:**
- Consumes: `notification_settings.timezone` and `users.timezone`; D-01's `Asia/Kolkata`
- Produces (backend):

```ts
// artifacts/api-server/src/lib/date.ts  (pure module — no db import)
export const DEFAULT_USER_TIMEZONE = "Asia/Kolkata";

// artifacts/api-server/src/lib/user-timezone.ts
export async function resolveUserTimezone(
  tx: DbTransaction,
  userId: string,
): Promise<string>;
```

`DbTransaction` is exported from `@workspace/db` (`artifacts/api-server/src/lib/rls.ts:3` imports it under that name — follow that import path exactly).

Reads `notification_settings.timezone`, falls back to `users.timezone`, falls back to `DEFAULT_USER_TIMEZONE`. Never returns `"UTC"` and never returns an invalid zone.

- Produces (frontend):

```ts
// artifacts/cadence/src/hooks/useUserTimezone.ts
export function useUserTimezone(): string;
```

Returns the user's configured zone from `GET /api/settings/notifications`, falling back to the browser zone until that query resolves.

- [ ] **Step 1: Write the failing backend test**

Create `artifacts/api-server/src/lib/user-timezone.test.ts`:

- A user with `notification_settings.timezone = 'America/New_York'` resolves to `'America/New_York'`.
- A user with no `notification_settings` row but `users.timezone = 'Europe/London'` resolves to `'Europe/London'`.
- A user with neither resolves to `'Asia/Kolkata'` — **not** `'UTC'`.
- An invalid stored zone (`'Not/AZone'`) resolves to `'Asia/Kolkata'`, never to `'UTC'` and never to the invalid string.

Run: `pnpm --filter @workspace/api-server test -- src/lib/user-timezone.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 2: Implement `resolveUserTimezone`**

Create `artifacts/api-server/src/lib/user-timezone.ts`. Import `DEFAULT_USER_TIMEZONE` from `artifacts/api-server/src/lib/date.ts` — keep the constant in the **pure** date module so `date.ts` never gains a `@workspace/db` dependency.

Read the schema for `notification_settings` and `users` in `lib/db/src/schema/` before writing the queries — the column names are `timezone` on `users` and on `notification_settings` (verify; the audit found `notification_settings` referenced in `routes/internal.ts` but not the column read).

The query must run inside the caller's `runWithRls` transaction. Accept the `tx: DbTransaction` as the first argument; do not open a new connection.

- [ ] **Step 3: Change `normalizeTimeZone`'s fallback**

In `artifacts/api-server/src/lib/date.ts` lines ~55-63, `normalizeTimeZone` falls back to `"UTC"`. Change the fallback to `DEFAULT_USER_TIMEZONE` (`"Asia/Kolkata"`).

**This is the D-01 guarantee.** A caller that forgets to resolve the user's zone must land on the owner's wall clock, not on UTC.

- [ ] **Step 4: Make the routes use the user's zone**

In each of `tasks.ts`, `momentum.ts`, `analytics.ts`, `focus-sessions.ts`, `rituals.ts`, `agent.ts`:

- Replace `dayBounds(date, timezone)` with `dayBounds(date, await resolveUserTimezone(tx, userId))`.
- Remove the `timezone` query/body parameter from the request parsing.

`routes/tasks.ts` has three sites (lines ~86-87, ~157, ~275-279, ~469). Find them all with a grep for `timezone` in that file — there are more than the four listed.

- [ ] **Step 5: Remove `timezone` from the contract and regenerate**

In `lib/api-spec/openapi.yaml`, remove the `timezone` query parameter from every endpoint that declares it (tasks, summary, momentum, blocks, focus, agent, analytics, rituals). Match the server's parsing change exactly — an endpoint that still parses `timezone` must not have it removed from the contract, and vice versa.

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: the generated hooks lose their `timezone` field.

- [ ] **Step 6: Run the backend tests to verify they pass**

Run: `pnpm --filter @workspace/api-server test -- src/lib/user-timezone.test.ts src/routes/`
Expected: PASS.

- [ ] **Step 7: Update the client**

- `artifacts/cadence/src/lib/date-utils.ts` — add an explicit `timeZone` parameter to `parseDateKey`, `shiftDate`, `monthStart`, `monthEnd`, `startOfWeek` (all currently reach the browser zone implicitly through `dateKey`). Keep the existing default of `timezone()` so nothing breaks at this step.
- Create `artifacts/cadence/src/hooks/useUserTimezone.ts`.
- Migrate the 40 call sites that send `timezone: timezone()`:

| File | Lines |
|---|---|
| `components/chrome/AppShell.tsx` | 150 |
| `pages/today/TodayPage.tsx` | 44, 51, 56 |
| `pages/profile/ProfilePage.tsx` | 50, 53, 190 |
| `pages/review/ReviewPage.tsx` | 44, 52, 57 |
| `pages/inbox/InboxPage.tsx` | 86, 107 |
| `components/agent/AgentPanel.tsx` | 380 |
| `components/rituals/RitualDialog.tsx` | 46 |
| `pages/focus/FocusPage.tsx` | 62, 219 |
| `pages/dashboard/DashboardPage.tsx` | 34 |
| `pages/calendar/CalendarPage.tsx` | 36, 262, 273, 296, 298, 299, 306, 310, 311, 315, 370, 619 |
| `pages/agent/AgentPage.tsx` | 23 |
| `components/task/RescheduleProposals.tsx` | 189 |
| `components/task/QuickCaptureSheet.tsx` | 366, 369 |
| `components/task/TaskEditor.tsx` | 145 |
| `components/task/TaskRow.tsx` | 64, 90, 146 |
| `components/task/WorkspacePanel.tsx` | 46 |
| `components/shared/ActivityHistoryDrawer.tsx` | 243 |
| `pages/activity/ActivityPage.tsx` | 388 |

For each: drop the `timezone` key from the query/mutation parameters (the generated type no longer accepts it) and pass the user's zone into the local date helpers:

```ts
const userTz = useUserTimezone();
const params = useMemo(() => ({ date: today(userTz) }), [userTz]);
```

`CalendarPage` also needs `userTz` threaded into `shiftDate`, `startOfWeek`, `monthStart`, `monthEnd`, and `parseDateKey`.

- [ ] **Step 8: Run the frontend tests to verify they pass**

Run: `pnpm --filter @workspace/cadence test`
Expected: PASS. `date-utils.test.ts` already exercises `today('Asia/Kolkata')` etc. — extend it with a case for the newly-parameterised helpers.

- [ ] **Step 9: Verify the two halves now agree**

Write a test that seeds a user with `notification_settings.timezone = 'America/New_York'`, seeds a task due at a New-York-morning instant, and asserts that `GET /api/tasks?scope=today` returns it — while the same request with the browser zone set to `Asia/Kolkata` would not. This is the regression test for the split-brain.

- [ ] **Step 10: Commit**

```bash
git add artifacts/api-server/src/ lib/api-spec/openapi.yaml lib/api-client-react/src/generated/ lib/api-zod/src/generated/ artifacts/cadence/src/
git commit --no-gpg-sign -m "fix(timezone): let the server own day boundaries using the user's stored zone"
```

---

### Task 7: Fill the page-level unit test gaps

**Files:**
- Create: `artifacts/cadence/src/pages/today/TodayPage.test.tsx`
- Create: `artifacts/cadence/src/pages/calendar/CalendarPage.test.tsx`
- Create: `artifacts/cadence/src/pages/memory/MemoryPage.test.tsx`
- Create: `artifacts/cadence/src/pages/focus/FocusPage.test.tsx`
- Create: `artifacts/cadence/src/pages/onboarding/OnboardingPage.test.tsx`
- Modify: `artifacts/cadence/src/pages/activity/ActivityPage.test.tsx` (created by Plan 1 Task 10)
- Modify: `artifacts/cadence/src/pages/settings/SettingsPage.test.tsx` (created by Plan 1 Task 11)

**Interfaces:**
- Consumes: the mocking style used by `artifacts/cadence/src/pages/agent/AgentPage.test.tsx` — read it first and copy it
- Produces: one page-level test file per page that currently has none

- [ ] **Step 1: Write the tests**

These six pages currently have **no page-level unit test**. Create one per page asserting the page's core behaviour:

| Page | Assert |
|---|---|
| `TodayPage` | renders the task list from the mocked API; renders the empty state when the list is empty; renders the error state when the query rejects |
| `CalendarPage` | renders the hour grid; selecting a day shows that day's tasks; a block query failure shows an error, not an empty grid |
| `MemoryPage` | renders facts from the mocked response; **"Nothing learned yet"** when the response has no facts (the contract wrapper is `{facts:[]}` — a bare-array response must not crash it) |
| `FocusPage` | renders the timer; starting a session calls `POST /api/focus-sessions` |
| `OnboardingPage` | the wizard's steps render; completing it PATCHes only the settings whose prefetch succeeded (Plan 1 Task 11) |
| `ActivityPage` | already covered by Plan 1 Task 10 — extend with the filter behaviour |

**Every existing page test mocks the API entirely** — e.g. `DashboardPage.test.tsx:9-120` replaces every hook with fixtures including `streakDays: 14`. That is correct for unit tests, but it means no unit test can catch a mock-data regression or a broken endpoint. These tests are therefore **not** a substitute for Plan 3 Task 4's E2E coverage — they pin component behaviour, not wiring.

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter @workspace/cadence test -- src/pages/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/cadence/src/pages/
git commit --no-gpg-sign -m "test(web): add page-level unit tests for today, calendar, memory, focus and onboarding"
```

---

### Task 8: Documentation and the append-only records

**Files:**
- Modify: `AGENTS.md` (the timezone claim in §1, and any changed counts)
- Modify: `README.md`
- Modify: `spec/master-verification-matrix.md`
- Modify: `spec/system-requirements.md`
- Modify: `docs/07-module-registry.md`
- Modify: `docs/governance/g4-manual-verification-runbook.md`
- Modify: `artifacts/cadence/src/lib/version-info.ts`
- Modify: `AUDIT.md` (append only)
- Modify: `CHANGELOG.md` (append only)

**Interfaces:**
- Consumes: every change made in Tasks 1-7
- Produces: no code changes

- [ ] **Step 1: Correct the timezone claim in AGENTS.md**

`AGENTS.md` §1 currently states: *"Server-side day-boundary math (recurrence sweep, agent `query_schedule`, notification defaults) resolves each user's IANA timezone with the D-01 `Asia/Kolkata` fallback."*

Before this plan's Task 6, that was **not true on the API path** — the client's browser zone was used verbatim, and `normalizeTimeZone` fell back to `UTC`. After Task 6 it becomes true. Rewrite the sentence to describe the actual mechanism (`resolveUserTimezone`, `notification_settings.timezone` → `users.timezone` → `Asia/Kolkata`), and note that the client no longer sends a `timezone` param.

Also check `AGENTS.md` §7's G4 notes for any statement about timezones that depended on the old behaviour.

- [ ] **Step 2: Update the docs-must-move table**

| Because | Update |
|---|---|
| New test files (Tasks 3, 4, 7) | `README.md` (test counts), `spec/master-verification-matrix.md`, `docs/07-module-registry.md`, `docs/governance/g4-manual-verification-runbook.md` |
| Contract change (Tasks 1, 2, 5, 6) | `spec/system-requirements.md` if it documents the affected response shapes or the timezone behaviour |
| User-visible change (Task 5 — the agent transcript now syncs across devices) | `artifacts/cadence/src/lib/version-info.ts` highlights |
| A route was removed from the contract (Task 5) | `AGENTS.md` §1 if it counts endpoints |

- [ ] **Step 3: Append to AUDIT.md and CHANGELOG.md**

Append a **new dated entry** to each. Do not edit any existing entry. The entry must record the timezone split-brain explicitly — it is a correction to a previously documented claim, and the before/after comparison is the point of keeping the log append-only.

- [ ] **Step 4: Run the full ladder**

Run: `pnpm run verify`
Expected: **12/12 gates PASS**.

Run: `pnpm run verify:e2e`
Expected: PASS.

Run: `git status --porcelain`
Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md spec/ docs/ artifacts/cadence/src/lib/version-info.ts AUDIT.md CHANGELOG.md
git commit --no-gpg-sign -m "docs: record the contract reconciliation and the timezone ownership fix"
```

---

## Plan Completion Checklist

- [ ] `pnpm run verify` — 12/12 green
- [ ] `pnpm run verify:e2e` — green, including the new `pages-uncovered` spec
- [ ] `git status --porcelain` — empty
- [ ] `grep -rn "fetch(" artifacts/cadence/src` returns only `lib/custom-fetch.ts` and `lib/dev-mock.ts`
- [ ] Every E2E mock response satisfies its generated Zod schema
- [ ] Every frontend endpoint is present in `openapi.yaml`
- [ ] The server resolves the user's timezone; the client no longer sends one
- [ ] The server's timezone fallback is `Asia/Kolkata`, never `UTC`
- [ ] `AGENTS.md`'s timezone claim matches the code
- [ ] Every doc in the `AGENTS.md` §5 table is updated
- [ ] `AUDIT.md` and `CHANGELOG.md` have new dated entries; no history rewritten
