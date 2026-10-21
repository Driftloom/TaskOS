# Release Integrity & Truthfulness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the application incapable of telling a user it knows something it does not — no fabricated success states, no false capability claims, no unlabelled sample data.

**Architecture:** Every fix follows one rule: **an input default is allowed; a display fallback is not.** The server stops manufacturing perfect metrics (empty window → `null`, not `1.0`); the client stops rendering saved-state defaults when a query fails; the agent's reply carries its provenance (`provider`, `degraded`) so a deterministic fallback is visible; and the dev mock's fixtures are extracted into a pure module validated against the generated Zod schemas, so drift fails CI instead of a user.

**Tech Stack:** TypeScript, Express 5, React 19, TanStack React Query, Vitest, Playwright, Orval (OpenAPI codegen), Zod.

**Spec:** `docs/superpowers/specs/2026-10-20-frontend-truthfulness-and-design-integrity-design.md`

## Global Constraints

- **pnpm only.** Root `preinstall` blocks npm/yarn. Never run `npm install` or `yarn`.
- **Contract is the authority.** `lib/api-spec/openapi.yaml` is the single source of truth. Any change to it **must** be followed by `pnpm --filter @workspace/api-spec run codegen`, and the regenerated `lib/api-client-react/src/generated/` + `lib/api-zod/src/generated/` output **must** be committed in the same change. Never hand-edit a generated file.
- **Never query the raw `Pool`.** Every backend handler uses `runWithRls(req, tx => ...)` from `artifacts/api-server/src/lib/rls.ts`, and every query carries an application-level `where user_id = ?`.
- **Append-only history.** `AUDIT.md` and `CHANGELOG.md` get **new dated entries**. Never rewrite a past entry.
- **Docs move with the change** (`AGENTS.md` §5). Any test file added or removed → update `README.md`, `DESIGN.md`, `spec/master-verification-matrix.md`, `docs/07-module-registry.md`, `docs/governance/g4-manual-verification-runbook.md`, `artifacts/cadence/src/lib/version-info.ts`. Any user-visible change → update `artifacts/cadence/src/lib/version-info.ts` highlights.
- **Text encoding.** Windows PowerShell 5.1 mangles UTF-8 on write. Use the Write/Edit tools, never `Set-Content`/`Out-File`. `node scripts/scan-mojibake.cjs` is the **only** arbiter — a garbled console is codepage-437 rendering, not a file defect.
- **Every task ends green on `pnpm run verify:fast`** and leaves `git status --porcelain` empty except for the task's own committed changes.
- **Zero trust.** Every claim in a commit message or report must be backed by a command that was actually run in this session.

## Review Focus

These are the failure modes the spec implies that no existing test exercises. Each is pinned to a task below.

1. **Empty database, successful API response.** A signed-in user with 0 tasks must never see "100%", "All queued tasks complete!", "Inbox Zero", or "All tasks completed on schedule". Every one of those is a *success* claim over *no data*. → Task 6
2. **Failed API response.** A 401/500 must never render the user's "saved state" as a default (kill switches ON, focus target 4, reschedule cap 5, goal target 100). The user must see "unknown", not a plausible value. → Tasks 6, 11
3. **Agent with no provider configured (or every provider failing).** The reply must be visibly labelled as a local deterministic fallback. A confident-looking answer with no badge is the single most damaging untruth in the app. → Task 5
4. **Dev mock active.** A developer (and anyone viewing a dev-mode screenshot) must be able to tell, at a glance, that they are looking at sample data. → Task 13
5. **Contract widened to nullable.** `onTimeRate: number → number | null` reaches the Zod client and every consumer. A consumer that renders `null%`, crashes on `.toFixed()`, or falls back to `100` reintroduces the exact bug the change removes. → Task 6

---

### Task 0: Pre-flight — re-establish a clean baseline

**Files:**
- Modify: none (read-only verification)

**Interfaces:**
- Consumes: nothing
- Produces: a verified-clean baseline that every later task's `git status` assertion is measured against

- [ ] **Step 1: Confirm the working tree state**

Run: `git status --porcelain`
Expected: exactly the 9 files staged from the in-flight v0.1.9 drawer refactor (`AppShell.tsx`, `AutomationPausedBanner.tsx`, `index.css`, `version-info.ts`, `fixtures.ts`, `focus-mini-chip.spec.ts`, `pages.spec.ts`, `spec/design-system.md`, `spec/system-requirements.md`) — or a superset that the owner has since added. **Do not proceed if unrelated uncommitted work is present; ask the owner how to handle it.**

- [ ] **Step 2: Establish the pre-change baseline**

Run: `pnpm run verify:fast`
Expected: all 7 fast-ladder gates pass. Record the exact output — this is the "before" for every task's "after".

- [ ] **Step 3: Confirm the audit's key findings still hold in the current tree**

Run:
```
Select-String -Path "artifacts/api-server/src/routes/analytics.ts" -Pattern "1\.0"
Select-String -Path "artifacts/cadence/src/pages/profile/ProfilePage.tsx" -Pattern "NOT IMPLEMENTED"
Select-String -Path "artifacts/cadence/src/components/agent/AgentPanel.tsx" -Pattern "m\.name|tierBadge"
```
Expected: `analytics.ts` shows the `1.0` fallback; `ProfilePage.tsx` shows the `NOT IMPLEMENTED` badge; `AgentPanel.tsx` shows `m.name` / `tierBadge`. If any of these has already been fixed by the owner's in-flight work, **update the plan's task to match reality** and note it in the commit.

---

### Task 1: Version and release-note integrity

**Files:**
- Modify: `artifacts/cadence/package.json`
- Modify: `package.json` (workspace root)
- Modify: `artifacts/cadence/src/lib/version-info.ts`
- Create: `artifacts/cadence/src/lib/version-info.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `APP_VERSION_INFO.version` === the app package's `version`; `APP_VERSION_INFO.highlights` contains no two entries that describe the same navigation change in contradictory terms

- [ ] **Step 1: Write the failing test**

Create `artifacts/cadence/src/lib/version-info.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import pkg from '../../package.json';
import { APP_VERSION_INFO } from './version-info';

describe('APP_VERSION_INFO integrity', () => {
  it('matches the app package version', () => {
    expect(APP_VERSION_INFO.version).toBe(pkg.version);
  });

  it('does not advertise both the bottom dock and the drawer', () => {
    const text = APP_VERSION_INFO.highlights.map((h) => `${h.title} ${h.description}`).join(' ');
    const mentionsDock = /bottom dock|dock unchanged/i.test(text);
    const mentionsDrawer = /drawer/i.test(text);
    expect(mentionsDock && mentionsDrawer).toBe(false);
  });

  it('has a non-empty highlight list', () => {
    expect(APP_VERSION_INFO.highlights.length).toBeGreaterThan(0);
  });
});
```

If `import pkg from '../../package.json'` needs `resolveJsonModule`, add it to `artifacts/cadence/tsconfig.json` under `compilerOptions`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/cadence test -- src/lib/version-info.test.ts`
Expected: FAIL — `APP_VERSION_INFO.version` is `'0.1.9'` but `package.json` says `'0.1.6'`; and the highlights test fails because both a "drawer replaced the dock" and a "dock unchanged" entry are present.

- [ ] **Step 3: Sync the package versions**

Set `"version": "0.1.9"` in both `artifacts/cadence/package.json` and the workspace root `package.json`. Do not change `versionCode` (`10`) — that is the Android build number and is owned by Task 2's contract.

- [ ] **Step 4: Remove the contradictory highlight**

In `artifacts/cadence/src/lib/version-info.ts`, delete the `highlights` entry titled **"Mobile Bottom-Only Chrome"** (it describes the five-slot dock that the v0.1.9 drawer refactor replaced). Keep the "Mobile Drawer Navigation" entry. Do not touch `changelogHistory` — it is a historical record and the v0.1.9 entry already describes the drawer correctly.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/lib/version-info.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add artifacts/cadence/package.json package.json artifacts/cadence/src/lib/version-info.ts artifacts/cadence/src/lib/version-info.test.ts
git commit --no-gpg-sign -m "fix(release): sync package version to v0.1.9 and drop the contradictory dock highlight"
```

---

### Task 2: The Android download card tells the truth about the APK

**Files:**
- Modify: `artifacts/cadence/src/lib/version-info.ts`
- Modify: `artifacts/cadence/src/pages/download/DownloadPage.tsx`
- Modify: `artifacts/cadence/src/lib/version-info.test.ts`

**Interfaces:**
- Produces: `export const ANDROID_BUILD_INFO: { versionName: string; versionCode: number; sizeBytes: number }` exported from `artifacts/cadence/src/lib/version-info.ts`, describing the APK at `artifacts/cadence/public/cadence.apk`
- Consumes: nothing

- [ ] **Step 1: Read the APK's real manifest values**

Run:
```
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path "artifacts/cadence/public/cadence.apk"))
$entry = $zip.Entries | Where-Object { $_.FullName -eq "AndroidManifest.xml" }
$bytes = New-Object byte[] $entry.Length
$stream = $entry.Open(); $stream.Read($bytes, 0, $bytes.Length) | Out-Null; $stream.Close()
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$zip.Dispose()
[regex]::Matches($text, 'versionCode|versionName|1\.0\.0\.0') | Select-Object -First 5 -ExpandProperty Value
(Get-Item "artifacts/cadence/public/cadence.apk").Length
```
Expected: `versionName` = `"1.0.0.0"`, `versionCode` = `1`, and the file size in bytes. **If the extracted values differ from `1.0.0.0` / `1`, use the extracted values — the manifest is the authority.**

- [ ] **Step 2: Write the failing test**

Add to `artifacts/cadence/src/lib/version-info.test.ts`:

```ts
import { ANDROID_BUILD_INFO } from './version-info';

it('describes the shipped APK, not the web app', () => {
  expect(ANDROID_BUILD_INFO.versionName).not.toBe(APP_VERSION_INFO.version);
  expect(ANDROID_BUILD_INFO.versionCode).toBeGreaterThan(0);
  expect(ANDROID_BUILD_INFO.sizeBytes).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @workspace/cadence test -- src/lib/version-info.test.ts`
Expected: FAIL — `ANDROID_BUILD_INFO` does not exist.

- [ ] **Step 4: Add `ANDROID_BUILD_INFO`**

In `artifacts/cadence/src/lib/version-info.ts`, export:

```ts
/**
 * Describes artifacts/cadence/public/cadence.apk, NOT the web app.
 *
 * The APK is built by a separate Android toolchain and carries its own
 * versionCode/versionName. The web app's version is a different number and
 * must never be printed as though it were the APK's -- an installer reads
 * the APK's manifest in Android App info and sees a different value.
 *
 * Bump these when the APK is rebuilt. Verify against the manifest, not from
 * memory: see docs/superpowers/plans/2026-10-20-release-integrity-and-truthfulness.md
 * Task 2 Step 1.
 */
export const ANDROID_BUILD_INFO = {
  versionName: '<from Step 1>',
  versionCode: <from Step 1>,
  sizeBytes: <from Step 1>,
} as const;
```

- [ ] **Step 5: Render it on the download page**

In `artifacts/cadence/src/pages/download/DownloadPage.tsx`, replace the line that prints `APP_VERSION_INFO.version`/`versionCode` (line ~90) so the card shows:

- **"Android app version: `<versionName>` (Build `<versionCode>`)"** — from `ANDROID_BUILD_INFO`
- **"Web app version: `v<APP_VERSION_INFO.version>`"** — from `APP_VERSION_INFO`
- The file size in MB computed from `ANDROID_BUILD_INFO.sizeBytes` (keep the existing "1.21 MB" format: `(bytes / 1024 / 1024).toFixed(2)`)
- The `v{APP_VERSION_INFO.version}` badge at line ~43 keeps using the web app version — that is correct for a web-app download link

Import `ANDROID_BUILD_INFO` alongside `APP_VERSION_INFO`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/lib/version-info.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add artifacts/cadence/src/lib/version-info.ts artifacts/cadence/src/lib/version-info.test.ts artifacts/cadence/src/pages/download/DownloadPage.tsx
git commit --no-gpg-sign -m "fix(download): show the APK's real version instead of the web app's"
```

---

### Task 3: Remove false capability claims (Web Push, channel priority)

**Files:**
- Modify: `artifacts/cadence/src/pages/profile/ProfilePage.tsx`
- Modify: `artifacts/cadence/src/pages/onboarding/OnboardingPage.tsx`
- Modify: `artifacts/cadence/src/pages/profile/ProfilePage.tsx` (test file — create if absent)

**Interfaces:**
- Consumes: `status?.push?.enabled`, `status?.push?.deviceCount` from `GET /api/integrations/status` (already fetched by `ProfilePage.tsx:58`)
- Produces: no new exports

- [ ] **Step 1: Write the failing test**

Create `artifacts/cadence/src/pages/profile/ProfilePage.test.tsx` (this page currently has **no** unit test). Assert that the rendered page does **not** contain the strings `"NOT IMPLEMENTED"` and `"no web-push delivery"`, and that it does contain a web-push status derived from the mocked `GET /api/integrations/status` response (`{ push: { enabled: true, deviceCount: 2 } }`).

Mock the API with the same `customFetch`/hook-mocking pattern used by `artifacts/cadence/src/pages/agent/AgentPage.test.tsx` — read that file first and copy its mocking style.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/cadence test -- src/pages/profile/ProfilePage.test.tsx`
Expected: FAIL — the page renders "NOT IMPLEMENTED".

- [ ] **Step 3: Replace the false card with the real status**

In `artifacts/cadence/src/pages/profile/ProfilePage.tsx` (around lines 510-516), replace the "not available / NOT IMPLEMENTED" Web Push card with a card that reads the real `status.push`:

- `status?.push?.enabled` → **"Active — N device(s) subscribed"** (use `deviceCount`, defaulting the count to `0`, not to a "configured" state)
- `status?.push?.enabled === false` → **"Not subscribed"** with a link to `/settings`

Do not print a third state for "unknown" — if `status` is undefined, render the card's empty/unknown variant from `components/shared/StateViews.tsx` rather than an assertion.

- [ ] **Step 4: Fix the Onboarding Web Push card and the channel hierarchy**

In `artifacts/cadence/src/pages/onboarding/OnboardingPage.tsx`:

- Line ~596-603: remove the *"Not available in this build. Telegram is the delivery channel."* copy and the `UNAVAILABLE` badge. Replace with the real push state from `status?.push?.enabled`, or drop the card if the push flow has no onboarding step.
- Line ~494: change **"Device Notifications (Primary Channel)"** → **"Device Notifications (Secondary)"**. This aligns Onboarding with **D-15** (Telegram Bot API primary, Web Push secondary) and with the Settings page, which already labels Telegram `Primary` (`MessagingIntegrationsView.tsx:485-487`) and Device Alerts `Secondary` (`:458-460`).
- Leave Telegram labelled `Optional` in the body but ensure the section header does not contradict the primary/secondary ordering.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/pages/profile/ProfilePage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Update the docs this change moves**

- `spec/locked-decisions.md` — no change (D-15 already says Telegram primary; the code was wrong, not the decision). Confirm by reading it.
- `docs/cadence-user-manual-and-mobile-guide.md` — update the onboarding/setup-wizard channel description if it names the old priority.

- [ ] **Step 7: Commit**

```bash
git add artifacts/cadence/src/pages/profile/ artifacts/cadence/src/pages/onboarding/ docs/cadence-user-manual-and-mobile-guide.md
git commit --no-gpg-sign -m "fix(ui): report the real web-push state and align onboarding with D-15 channel priority"
```

---

### Task 4: The agent model dropdown reads the server's field names

**Files:**
- Modify: `artifacts/cadence/src/components/agent/AgentPanel.tsx`
- Modify: `artifacts/cadence/src/pages/settings/AgentSettingsView.tsx`
- Modify: `artifacts/cadence/tests/e2e/fixtures.ts`
- Modify: `artifacts/cadence/src/components/agent/AgentActionCard.test.tsx` (add coverage)

**Interfaces:**
- Consumes: the server's `DiscoveredModel` shape from `artifacts/api-server/src/lib/agent/discovery.ts:9-15` — `{ id: string; label: string; badge?: string; description: string; tier: string }`
- Produces: the local type `interface DiscoveredModelResponse { id: string; label: string; badge?: string; description: string; tier: string }` — declared **once** in `artifacts/cadence/src/lib/discovered-model.ts` (a small shared module) and **imported** by both `AgentPanel.tsx` and `AgentSettingsView.tsx` (they previously declared the shape separately and differently).

  > **Corrected 2026-10-20 during implementation.** The original text put the declaration in `AgentPanel.tsx`. The task review found that this made `AgentSettingsView.tsx` — a lazily-loaded route — statically import the whole 1,416-line panel component, hoisting it into a chunk both routes load and breaking the repo's cold-load JS budget. The shared module keeps the "declared once" rule while restoring the chunk boundary; the build was measured to confirm the fix (a 45,321-byte shared panel chunk disappears, replaced by a 247-byte `discovered-model` chunk).

- [ ] **Step 1: Write the failing test**

In `artifacts/cadence/src/components/agent/AgentActionCard.test.tsx` (or a new `artifacts/cadence/src/components/agent/AgentModelList.test.tsx` if that file's setup does not fit), assert that a model list shaped `{ id, label: 'Gemini 3.8 Flash', badge: 'Recommended', description, tier }` renders the label text `"Gemini 3.8 Flash"` and a badge containing `"Recommended"`.

This test must fail against the current code, which reads `m.name`/`m.tierBadge`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/cadence test -- src/components/agent/`
Expected: FAIL — the label renders empty.

- [ ] **Step 3: Fix the frontend to the canonical shape**

In `artifacts/cadence/src/components/agent/AgentPanel.tsx` around lines 394-411:

- Change the inline generic from `Array<{ id: string; name: string; tierBadge?: string }>` to the shared `DiscoveredModelResponse` type.
- Change `label: m.name` → `label: m.label`.
- Replace the three-way badge comparison against `'recommended' | 'cheapest' | 'reasoning'` with a case-insensitive comparison against the server's actual badge strings (`'Recommended'`, `'Cheapest'`, `'Ultra Fast'`, `'Fast'` — see `discovery.ts:36,56,62`). Normalise with `.toLowerCase()` on both sides.
- Note that line ~431-434 already reads `m.badge` correctly — do not change it.

In `artifacts/cadence/src/pages/settings/AgentSettingsView.tsx` around lines 129-147, make the same three changes and import the shared type.

- [ ] **Step 4: Correct the E2E fixture that hid this bug**

In `artifacts/cadence/tests/e2e/fixtures.ts` around line 761-763, change the `/api/agent/models/:provider` mock from `{ id, name, provider, tier, description }` to the server's shape `{ id, label, badge?, description, tier }`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/components/agent/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/cadence/src/components/agent/ artifacts/cadence/src/pages/settings/AgentSettingsView.tsx artifacts/cadence/tests/e2e/fixtures.ts
git commit --no-gpg-sign -m "fix(agent): read discovered models from the server's label/badge fields"
```

---

### Task 5: The agent's reply carries its provenance

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Modify: `artifacts/api-server/src/lib/agent/engine.ts`
- Modify: `artifacts/api-server/src/routes/agent.ts`
- Modify: `artifacts/cadence/src/components/agent/AgentPanel.tsx`
- Create: `artifacts/api-server/src/lib/agent/engine.provenance.test.ts`
- Modify: `artifacts/cadence/src/components/agent/AgentActionCard.test.tsx` (add coverage)

**Interfaces:**
- Consumes: `providersTried` already tracked at `artifacts/api-server/src/lib/agent/engine.ts:353-354`; the local fallback path at `engine.ts:1319-1341`
- Produces (contract change, then codegen):

```ts
// added to AgentChatOutput in lib/api-spec/openapi.yaml
provider?: string;   // 'nvidia-nim' | 'groq' | 'openrouter' | 'huggingface' | 'local-fallback'
degraded?: boolean;  // true when the deterministic local engine produced the reply
```

- [ ] **Step 1: Write the failing backend test**

Create `artifacts/api-server/src/lib/agent/engine.provenance.test.ts`. Assert that when no provider is configured, `runAgentConversation` (or whatever the exported entry point is — read `engine.ts` for the actual export name) returns a result whose `degraded` is `true` and whose `provider` is `'local-fallback'`; and that a successful provider call returns `degraded` falsy and `provider` equal to the provider id.

Run: `pnpm --filter @workspace/api-server test -- src/lib/agent/engine.provenance.test.ts`
Expected: FAIL — the fields do not exist on the returned type.

- [ ] **Step 2: Change the contract**

In `lib/api-spec/openapi.yaml`, locate the `AgentChatOutput` schema (~lines 3031-3060) and add two optional properties:

```yaml
provider:
  type: string
  description: Identifier of the model provider that produced the reply. 'local-fallback' means the deterministic local engine answered.
degraded:
  type: boolean
  description: True when the deterministic local engine produced the reply because no model provider was configured or available.
```

- [ ] **Step 3: Regenerate the clients**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` are rewritten and now contain `provider`/`degraded`. `git status --porcelain` shows changes under both `generated/` directories — **these must be committed with the contract change.**

- [ ] **Step 4: Propagate the provenance from the engine**

In `artifacts/api-server/src/lib/agent/engine.ts`:

- Where the local deterministic engine produces its reply (~lines 1319-1341), set `provider: 'local-fallback'` and `degraded: true` on the result.
- Where a real provider answers, set `provider` to the provider id that succeeded and `degraded: false` (or leave it undefined — the frontend treats `degraded !== true` as healthy).
- Extend the return object at ~lines 1379-1385 to carry both fields.

In `artifacts/api-server/src/routes/agent.ts` (the `/chat` handler, ~lines 37-51), pass both fields through to the response.

- [ ] **Step 5: Run the backend test to verify it passes**

Run: `pnpm --filter @workspace/api-server test -- src/lib/agent/engine.provenance.test.ts`
Expected: PASS.

- [ ] **Step 6: Render the degraded state in the UI**

In `artifacts/cadence/src/components/agent/AgentPanel.tsx`:

- When `res.degraded === true`, render a visible badge on the assistant bubble reading **"Local fallback — no model provider configured"** (icon: `Info` from lucide, matching the existing `CloudOff`/`Info` states at ~lines 979-995).
- Do **not** render the badge when `degraded` is absent or false — an absent field must not be treated as degraded, and a healthy provider must not be labelled.

Add coverage to `artifacts/cadence/src/components/agent/AgentActionCard.test.tsx` (or the AgentPanel test file): a response with `degraded: true` renders the badge; a response with `degraded: false` does not.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/cadence test -- src/components/agent/ && pnpm --filter @workspace/api-server test -- src/lib/agent/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated/ lib/api-zod/src/generated/ artifacts/api-server/src/lib/agent/ artifacts/api-server/src/routes/agent.ts artifacts/cadence/src/components/agent/
git commit --no-gpg-sign -m "feat(agent): carry provider provenance and degraded flag on agent replies"
```

---

### Task 6: Empty is not success — stop fabricating a perfect day

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Modify: `artifacts/api-server/src/routes/analytics.ts`
- Modify: `artifacts/cadence/src/pages/review/ReviewPage.tsx`
- Modify: `artifacts/cadence/src/pages/dashboard/DashboardPage.tsx`
- Modify: `artifacts/cadence/src/pages/dashboard/components/NextUpFocusHero.tsx`
- Modify: `artifacts/cadence/src/pages/dashboard/components/InboxTriageCard.tsx`
- Modify: `artifacts/cadence/src/pages/dashboard/components/ScheduleSnapshotCard.tsx`
- Modify: `artifacts/cadence/src/pages/review/ReviewPage.test.tsx`
- Modify: `artifacts/cadence/src/pages/dashboard/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/analytics/slippage` → `onTimeRate: number | null` (widened); `ErrorState` from `artifacts/cadence/src/components/shared/StateViews.tsx`
- Produces: `slippage.onTimeRate` is `null` when the window contains no completed tasks

- [ ] **Step 1: Write the failing backend test**

In the existing analytics route test file (find it under `artifacts/api-server/src/routes/` — if none exists, create `analytics.test.ts`), assert that `GET /api/analytics/slippage` returns `onTimeRate: null` (not `1.0`) when no tasks completed in the window.

Run: `pnpm --filter @workspace/api-server test -- src/routes/analytics`
Expected: FAIL — the route returns `1.0`.

- [ ] **Step 2: Change the route**

In `artifacts/api-server/src/routes/analytics.ts` lines 212-215:

```ts
const onTimeRate =
  completedInWindow > 0 ? Number((completedOnTime / completedInWindow).toFixed(2)) : null;
```

- [ ] **Step 3: Widen the contract and regenerate**

In `lib/api-spec/openapi.yaml`, locate the `SlippageReport` schema (~lines 3563-3663) and change `onTimeRate` to:

```yaml
onTimeRate:
  type: number
  nullable: true
  description: Fraction of completed tasks that completed on time, or null when no tasks completed in the window.
```

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: generated output updated; commit it with the contract change.

- [ ] **Step 4: Run the backend test to verify it passes**

Run: `pnpm --filter @workspace/api-server test -- src/routes/analytics`
Expected: PASS.

- [ ] **Step 5: Write the failing frontend test**

In `artifacts/cadence/src/pages/review/ReviewPage.test.tsx`, add a case where the slippage mock returns `onTimeRate: null` and assert:

- the page does **not** contain the string `"100%"`,
- the page does **not** contain `"All tasks completed on schedule"`,
- the page **does** contain `"No completed tasks in this window"`.

Run: `pnpm --filter @workspace/cadence test -- src/pages/review/ReviewPage.test.tsx`
Expected: FAIL.

- [ ] **Step 6: Fix the Review page**

In `artifacts/cadence/src/pages/review/ReviewPage.tsx`:

- Line ~286: change the guard from `slippage?.onTimeRate != null` to a null-aware branch that renders `—` when `onTimeRate === null`, and `Math.round(onTimeRate * 100)%` only when it is a number.
- Line ~395: replace the copy *"All tasks completed on schedule over the past 7 days. Zero calendar slippage detected across raw tables."* with a branch:
  - `onTimeRate === null` → **"No completed tasks in this window."**
  - otherwise → the existing sentence.
- Line ~408's **"Rule 1 & Rule 7 Verified"** badge must not render when the window has no data. Gate it on the window having at least one completed task.

- [ ] **Step 7: Give the Dashboard real error states**

In `artifacts/cadence/src/pages/dashboard/DashboardPage.tsx`:

- Destructure `isError` from every one of the 7 queries (today tasks, inbox tasks, summary, momentum, blocks, goals, proposals).
- Import `ErrorState` from `components/shared/StateViews.tsx`.
- When any query has `isError`, render an `ErrorState` for that card instead of the card's "empty" copy.

Then, in the card components, make the empty copy state the *absence of data*, not *the completion of everything*:

- `NextUpFocusHero.tsx` line ~75: *"All queued tasks complete! You have closed every scheduled item for today."* → **"No open tasks scheduled for today."**
- `InboxTriageCard.tsx` line ~55: *"Inbox Zero — All raw captures processed and scheduled."* → **"Your inbox is empty."**
- `ScheduleSnapshotCard.tsx` line ~59: *"Open Schedule — No scheduled time blocks placed for today."* → **"No time blocks scheduled for today."**

Rationale: "you have closed everything" is a success claim that is indistinguishable from a broken query. "There is nothing here" is true in both cases.

- [ ] **Step 8: Run the frontend tests to verify they pass**

Run: `pnpm --filter @workspace/cadence test -- src/pages/review/ReviewPage.test.tsx src/pages/dashboard/DashboardPage.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated/ lib/api-zod/src/generated/ artifacts/api-server/src/routes/analytics.ts artifacts/cadence/src/pages/review/ artifacts/cadence/src/pages/dashboard/
git commit --no-gpg-sign -m "fix(analytics): report no on-time rate instead of a perfect 100% over an empty window"
```

---

### Task 7: The LLM spend ceiling is filtered to the month it claims

**Files:**
- Modify: `artifacts/api-server/src/routes/agent.ts`
- Modify: `artifacts/api-server/src/lib/agent/engine.ts`
- Modify: `artifacts/cadence/src/pages/agent/AgentPage.tsx`
- Modify: `artifacts/cadence/src/pages/agent/AgentPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/agent/usage` → `{ usage: { totalTokensIn, totalTokensOut, totalCostEstimateCents, totalCalls, spendCeilingCents } }` (already the contract shape)
- Produces: `usage.usage.spendCeilingCents` is read by the client (no client-side ceiling literal)

- [ ] **Step 1: Write the failing backend test**

In the existing agent route test (find it under `artifacts/api-server/src/routes/`; create `agent.test.ts` if absent), seed two `llm_usage` rows for the user — one dated in the current month, one dated 60 days ago — and assert that `GET /api/agent/usage` reports `totalCalls: 1` (only the current-month row) and that `totalCostEstimateCents` excludes the old row.

Run: `pnpm --filter @workspace/api-server test -- src/routes/agent`
Expected: FAIL — the current query filters on `user_id` only.

- [ ] **Step 2: Add the month filter**

In `artifacts/api-server/src/routes/agent.ts` lines ~120-128, add to the `llm_usage` query:

```
created_at >= date_trunc('month', now())
```

Use the same predicate in the `spendAlert.totalMonthCostCents` computation in `artifacts/api-server/src/lib/agent/engine.ts` (lines ~1366-1377), which has the same unfiltered bug.

- [ ] **Step 3: Run the backend test to verify it passes**

Run: `pnpm --filter @workspace/api-server test -- src/routes/agent`
Expected: PASS.

- [ ] **Step 4: Remove the client-side ceiling literal**

In `artifacts/cadence/src/pages/agent/AgentPage.tsx` lines ~33-35, stop defaulting the ceiling to `500`:

```ts
const spendCents = usage?.usage.totalCostEstimateCents ?? 0;
const ceilingCents = usage?.usage.spendCeilingCents ?? 0;
const spendPercent = ceilingCents > 0 ? Math.min(100, Math.round((spendCents / ceilingCents) * 100)) : 0;
```

When `ceilingCents === 0` (the usage query failed), render the card's **unknown** state — not "$0.00 / $0.00 · 0% used", which reads as a measured zero.

- [ ] **Step 5: Run the frontend test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/pages/agent/AgentPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/agent.ts artifacts/api-server/src/lib/agent/engine.ts artifacts/cadence/src/pages/agent/
git commit --no-gpg-sign -m "fix(agent): scope LLM spend to the current month and read the ceiling from the API"
```

---

### Task 8: The agent does not announce success before it happens

**Files:**
- Modify: `artifacts/cadence/src/components/agent/AgentPanel.tsx`
- Modify: `artifacts/cadence/src/components/agent/AgentActionCard.test.tsx`

**Interfaces:**
- Consumes: the `POST /api/agent/chat` mutation's `onSuccess` callback
- Produces: the success toast fires only after the server confirms

- [ ] **Step 1: Write the failing test**

In the agent test file, mock `POST /api/agent/chat` to **reject** (or return a response with `requiresConfirmation: true` and no executed changes), send a bulk-approval message, and assert that **no success toast** containing `"moved"` appears.

Run: `pnpm --filter @workspace/cadence test -- src/components/agent/`
Expected: FAIL — the toast fires synchronously at `AgentPanel.tsx:827-842`.

- [ ] **Step 2: Move the toast into the mutation's success path**

In `artifacts/cadence/src/components/agent/AgentPanel.tsx`:

- Remove the synchronous `toast.success(...)` at lines ~827-842.
- Fire it inside the `/api/agent/chat` mutation's `onSuccess`, using the **server's** reported change count (from `toolCallsExecuted` / the response payload), not the locally-computed `changes.length`.
- On `onError`, show an error toast instead.

Rationale (AGENTS.md §5 rule 3): the user must never be told an automated change happened before it is logged and confirmed.

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/components/agent/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/cadence/src/components/agent/
git commit --no-gpg-sign -m "fix(agent): announce bulk changes only after the server confirms them"
```

---

### Task 9: Memory facts say who wrote them

**Files:**
- Modify: `artifacts/cadence/src/pages/memory/MemoryPage.tsx`
- Modify: `artifacts/cadence/src/components/memory/MemoryFactCard.tsx`
- Modify: `artifacts/api-server/src/routes/memory.ts`
- Modify: `artifacts/cadence/src/components/memory/MemoryFactCard.test.tsx`
- Create: `artifacts/cadence/src/pages/memory/MemoryPage.test.tsx`

**Interfaces:**
- Consumes: `value.createdByUser` (already written by `MemoryPage.tsx:249`, currently read nowhere)
- Produces: `MemoryFactCard` renders an **"Added by you"** state for user-authored facts and omits the AI-inference copy for them

- [ ] **Step 1: Write the failing tests**

In `artifacts/cadence/src/components/memory/MemoryFactCard.test.tsx`, add a case with a fact whose `value` contains `createdByUser: true` and assert:

- the card renders **"Added by you"**,
- the card does **not** render **"Inferred from chat"**,
- the card does **not** render **"Cadence always asks before it changes anything"**,
- the card does **not** render a **"Confirm before use"** chip,
- the card does **not** render a confidence percentage.

In the new `artifacts/cadence/src/pages/memory/MemoryPage.test.tsx`, assert that creating a fact sends `confidence` **not** equal to `100`.

Run: `pnpm --filter @workspace/cadence test -- src/components/memory/ src/pages/memory/`
Expected: FAIL.

- [ ] **Step 2: Fix the create mutation**

In `artifacts/cadence/src/pages/memory/MemoryPage.tsx` lines ~241-250:

- Stop sending `confidence: 100`. Send the contract's lower bound or omit it — a user-authored statement has **no measured confidence**.
- Keep `source: 'conversational'` and keep `value.createdByUser: true`.

- [ ] **Step 3: Fix the card**

In `artifacts/cadence/src/components/memory/MemoryFactCard.tsx`:

- Read `fact.value?.createdByUser === true` (the `value` field is a free-form object in the contract — confirm the exact accessor against the generated type before coding).
- When `createdByUser` is true: render **"Added by you"** in place of "Inferred from chat"; omit the confidence meter; omit the "Cadence always asks…" sentence; omit the "Confirm before use" chip.
- When `createdByUser` is false/absent: keep the existing behaviour unchanged.

- [ ] **Step 4: Stop minting a constant confidence on approval**

In `artifacts/api-server/src/routes/memory.ts` line ~197, the approve handler sets `confidence: 85`. **Decision:** preserve the fact's existing inferred confidence instead of overwriting it with a constant.

Run: `pnpm --filter @workspace/api-server test -- src/routes/memory` (create the test file if absent — this route has no unit test today).
Expected: PASS.

- [ ] **Step 5: Run the frontend tests to verify they pass**

Run: `pnpm --filter @workspace/cadence test -- src/components/memory/ src/pages/memory/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/cadence/src/pages/memory/ artifacts/cadence/src/components/memory/ artifacts/api-server/src/routes/memory.ts
git commit --no-gpg-sign -m "fix(memory): label user-authored facts as added-by-you and stop minting constant confidence"
```

---

### Task 10: The Activity page is labelled for what it actually is

**Files:**
- Modify: `artifacts/cadence/src/pages/activity/ActivityPage.tsx`
- Create: `artifacts/cadence/src/pages/activity/ActivityPage.test.tsx`

**Interfaces:**
- Consumes: `useActivityHistory` from `artifacts/cadence/src/lib/activity-history.ts` (unchanged)
- Produces: the page's copy states it is device-local; the dead "Agent" filter chip is removed

- [ ] **Step 1: Write the failing test**

Create `artifacts/cadence/src/pages/activity/ActivityPage.test.tsx`. Assert:

- the page does **not** contain "Zero-data-loss record",
- the page **does** contain a device-local marker (e.g. "This device"),
- the page's empty state contains **"Nothing has been recorded on this device yet"**,
- the "Agent" filter chip is **not** rendered.

Run: `pnpm --filter @workspace/cadence test -- src/pages/activity/ActivityPage.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Fix the copy and remove the dead filter**

In `artifacts/cadence/src/pages/activity/ActivityPage.tsx`:

- Replace the subtitle *"Zero-data-loss record of every task, focus block, and daily ritual."* with **"Activity recorded on this device. Not synced to your account."**
- Replace the empty state (lines ~376-386) — currently *"No matching activity found — Try adjusting your search query, date filter, or action type category to broaden your view."* — with **"Nothing has been recorded on this device yet."** plus a secondary line *"Adjust your filters"* only when filters are active.
- Remove the "Agent" filter chip and its badge-map entries (lines ~65-71, ~86-92). `recordActivity` is called only from `InboxPage`, `TaskRow`, `TaskEditor`, `QuickCaptureSheet`, `RitualDialog`, and `FocusPage` — nothing writes an `agent_action` or `task_rescheduled` type, so the chip can never match. (Verified by grep in the audit; re-verify before deleting.)
- Add a heading marker so the page reads as device-local, e.g. a small caption **"This device"** above the filter row.

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/pages/activity/ActivityPage.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/cadence/src/pages/activity/
git commit --no-gpg-sign -m "fix(activity): label the activity log as device-local and drop the dead agent filter"
```

---

### Task 11: Settings and Onboarding stop writing defaults over real state

**Files:**
- Modify: `artifacts/cadence/src/pages/settings/SettingsPage.tsx`
- Modify: `artifacts/cadence/src/pages/onboarding/OnboardingPage.tsx`
- Create: `artifacts/cadence/src/pages/settings/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/automation/flags`, `GET /api/settings/focus`, `GET /api/settings/notifications`, `GET /api/settings/rescheduling`
- Produces: each settings row renders an explicit **unknown** state when its query failed, distinct from a saved `on`/`off`/value

- [ ] **Step 1: Write the failing test**

Create `artifacts/cadence/src/pages/settings/SettingsPage.test.tsx`:

- Mock `GET /api/automation/flags` to reject. Assert the kill-switch rows render an unknown/unavailable state and **not** an enabled switch in the on position.
- Mock `GET /api/settings/focus` to reject. Assert the daily-target row does **not** render `"4"`.

Run: `pnpm --filter @workspace/cadence test -- src/pages/settings/SettingsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Fix the Settings fallbacks**

In `artifacts/cadence/src/pages/settings/SettingsPage.tsx`:

- Lines ~78-79: stop defaulting both kill switches to `true`. Track the query's `isError` and render the unknown state when it failed. `AutomationPausedBanner.tsx:58` already fails safe — follow its pattern.
- Line ~85: stop defaulting the focus target to `4`. Render `—` when the query failed. **Note:** a *new* focus target the user is about to save may still default to `4`; the defect is displaying `4` as the user's saved value before the fetch resolves.
- Lines ~215-226 (the exported JSON backup): do not write `workStart: 0` / `workEnd: 0` when the settings query failed. Omit those keys instead, so the exported backup does not claim a 0-0 workday.

- [ ] **Step 3: Fix the Onboarding overwrite hazard**

In `artifacts/cadence/src/pages/onboarding/OnboardingPage.tsx` lines ~62-140:

- The wizard seeds local defaults (timezone, `workStart '09:00'`, `workEnd '18:00'`, `quietStart '00:00'`, `quietEnd '07:00'`, `automationMode 'auto'`, `rescheduleCap 5`) and PATCHes them on "Complete Setup". If the prefetch GETs failed, those defaults overwrite the user's real configuration.
- **Decision:** track whether each prefetch succeeded. On "Complete Setup", only PATCH the fields whose prefetch succeeded; leave the rest untouched. If a prefetch failed, show a warning in the wizard rather than silently writing defaults.
- The file's own comment at lines ~78-79 already names this hazard — the fix makes the code match it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/pages/settings/SettingsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/cadence/src/pages/settings/ artifacts/cadence/src/pages/onboarding/
git commit --no-gpg-sign -m "fix(settings): render unknown instead of defaults when a settings query fails"
```

---

### Task 12: The public landing page claims only what is true

**Files:**
- Modify: `artifacts/cadence/src/pages/landing/components/LandingBentoGrid.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/LandingPhilosophy.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/InteractiveCaptureSandbox.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/ActivityRings3D.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/LandingHero.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/LandingHeader.tsx`
- Modify: `artifacts/cadence/src/pages/landing/components/LandingFooter.tsx`

**Interfaces:**
- Consumes: nothing (the landing page makes zero API calls)
- Produces: every illustrative region on the public page is covered by a disclosure, and no string asserts a system behaviour that does not occur

- [ ] **Step 1: Write the failing test**

The landing page has **no** unit test. Create `artifacts/cadence/src/pages/landing/LandingPage.test.tsx` asserting:

- the rendered page contains **"Streak: 12 days strict"** → must NOT contain it
- the rendered page contains **"Action logged to agent_action_log"** → must NOT contain it
- the rendered page contains `"LIVE DEMO"` → must NOT contain it
- the rendered page contains **"Parsed & time-blocked!"** → must NOT contain it
- the rendered page contains `v0.1.6` → must NOT contain it (the current version is `0.1.9`)
- the rendered page contains `href="https://github.com"` exactly → must NOT contain it (the project repo is `https://github.com/Driftloom/TaskOS.git`)

Run: `pnpm --filter @workspace/cadence test -- src/pages/landing/LandingPage.test.tsx`
Expected: FAIL on all six assertions.

- [ ] **Step 2: Remove the false system claims**

- `LandingBentoGrid.tsx` line ~88: delete the Telegram reply string *"Streak: 12 days strict 🔥"*. Replace with a reply that makes no streak claim, e.g. *"✅ Marked \"Deep work on architecture\" complete."*
- `LandingBentoGrid.tsx` line ~459: delete the span **"Action logged to agent_action_log"**. The demo writes nothing. Replace with **"In the live app this is written to the action log, with one-tap undo."**
- `LandingBentoGrid.tsx` line ~474: **"Auto-move cap: 2 / 5 max"** → **"Auto-move cap: 5 max"** (D-03's real cap is 5; "2/5" is fake state).
- `LandingBentoGrid.tsx` line ~185-187 + `ActivityRings3D.tsx` line ~264: the `aria-label` **"Activity rings: Focus 75%, Tasks 80%, Streak 90%"** announces a fake streak to screen readers. Change the aria-label to describe the illustration without asserting live values, e.g. **"Animated illustration of three activity rings"**, and keep the percentages as `aria-hidden` decoration.
- `LandingPhilosophy.tsx` lines ~79-85: this section sits **below** the bento grid and is therefore **not** covered by its sample-data disclosure. Add the same disclosure chip to this section's header, or add a leading line **"Illustrative examples of the alerts Cadence sends."** directly above the alert samples.
- `InteractiveCaptureSandbox.tsx` line ~96: change the badge **"LIVE DEMO"** → **"INTERACTIVE PREVIEW"**.
- `InteractiveCaptureSandbox.tsx` line ~190: change **"Parsed & time-blocked! Audio chime played."** → **"Preview only — nothing was saved. In the app this creates the task and adds it to your calendar."**
- `LandingHero.tsx` line ~22: remove the pulsing status dot, or give it an accessible label that does not imply a live service (e.g. `aria-hidden="true"` plus no animation). The bento's equivalent pulse was already removed by commit `d5acc52` for exactly this reason.

- [ ] **Step 3: Fix the stale version badges and the dead link**

- `LandingHeader.tsx` line ~33 and `LandingFooter.tsx` line ~122: replace the hardcoded `v0.1.6` with `` `v${APP_VERSION_INFO.version}` `` and import `APP_VERSION_INFO` from `@/lib/version-info`. This removes the drift class entirely.
- `LandingFooter.tsx` line ~115: change `href="https://github.com"` to `href="https://github.com/Driftloom/TaskOS.git"`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/pages/landing/LandingPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/cadence/src/pages/landing/
git commit --no-gpg-sign -m "fix(landing): remove false system claims and version drift from the public page"
```

---

### Task 13: The dev mock is verified against the contract, and labelled

**Files:**
- Create: `artifacts/cadence/src/lib/dev-mock-fixtures.ts`
- Modify: `artifacts/cadence/src/lib/dev-mock.ts`
- Create: `artifacts/cadence/src/lib/dev-mock.test.ts`
- Modify: `artifacts/cadence/src/components/chrome/AppShell.tsx`
- Modify: `artifacts/cadence/package.json` (add the `@workspace/api-zod` devDependency)

**Interfaces:**
- Consumes: the generated Zod schemas from `@workspace/api-zod` (e.g. `ListMemoryFactsResponse`, `GetAgentUsageResponse`, `TaskSummary`, `Momentum`, `DayPlan`, `DayCloseSummary`, `GetTimeBlocksResponse`)
- Produces: `artifacts/cadence/src/lib/dev-mock-fixtures.ts` exporting pure fixture builders, e.g.

```ts
export function createMockMemoryFacts(): ListMemoryFactsResponse;
export function createMockAgentUsage(): GetAgentUsageResponse;
export function createMockGoals(): Goal[];
export function createMockTimeBlocks(): TimeBlock[];
```

- [ ] **Step 1: Extract the fixtures (a pure move)**

Create `artifacts/cadence/src/lib/dev-mock-fixtures.ts` and move the fixture **data** out of `artifacts/cadence/src/lib/dev-mock.ts` into it, unchanged. The fixtures module must be **pure** — no `window`, no `Date.now()` at module scope (pass `now: Date` in as a parameter instead). Export one builder per mocked endpoint.

Then rewrite `dev-mock.ts` to import from `dev-mock-fixtures.ts` and keep only the `window.fetch` interception logic.

Do **not** change any fixture's shape in this step. The extraction must be a reviewable move.

- [ ] **Step 2: Add the contract test**

Add `"@workspace/api-zod": "workspace:*"` to `artifacts/cadence/package.json` `devDependencies`, then run `pnpm install`.

Create `artifacts/cadence/src/lib/dev-mock.test.ts`. For each mocked endpoint, assert the fixture satisfies the corresponding generated Zod schema:

```ts
import { describe, it, expect } from 'vitest';
import { ListMemoryFactsResponse } from '@workspace/api-zod';
import { createMockMemoryFacts } from './dev-mock-fixtures';

describe('dev-mock fixtures satisfy the API contract', () => {
  it('/api/memory/facts', () => {
    expect(ListMemoryFactsResponse.safeParse(createMockMemoryFacts()).success).toBe(true);
  });
});
```

Repeat for every mocked endpoint. Use the schema names from `lib/api-zod/src/generated/api.ts` — read that file to get the exact export names; do not guess them.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @workspace/cadence test -- src/lib/dev-mock.test.ts`
Expected: FAIL on at least the 12 known mismatches:

| Fixture | Current | Contract |
|---|---|---|
| `/api/memory/facts` | bare array | `{ facts: [...] }` |
| memory fact rows | `confidence: 0.92`, `source: 'A'` | `confidence` int 0-100, `source: 'behavioral' \| 'conversational'` |
| `/api/memory/confirmations` | bare array | `{ confirmations: [...] }` |
| `/api/goals` | `progress: 0.6` | `progress` 0-100 |
| `/api/goals/review` | `completionRate` fraction | percentage |
| `/api/agent/usage` | `{currentMonthSpendUsd,…}` | `{usage:{totalCostEstimateCents,…}}` |
| `/api/rituals/plan-day` | `{date,focusMinutesPlanned,…}` | `{date,overdueTasks,todayTasks,todayBlocks,dailyFocusTarget}` |
| `/api/rituals/close-day` | `{success,closedAt}` | `{completedCount,focusRoundsCompleted,focusMinutesTotal,movedToTomorrowCount,targetDate}` |
| `/api/settings/rescheduling` | **not intercepted** (the file intercepts `/api/reschedule/settings`, a path that does not exist) | `/api/settings/rescheduling` |
| `/api/settings/focus` | missing `createdAt`/`updatedAt` | both required |
| `/api/blocks` | missing `taskTitle` | required |
| `/api/momentum` | missing `date` | required |

- [ ] **Step 4: Fix every mismatch**

Work through the table above. For each, correct the fixture to satisfy the schema. When the schema itself is ambiguous (for example `progress` has no documented range), read `artifacts/api-server/src/lib/month-window.ts:187-188` to confirm the server's semantics and match them.

Also fix these two status-code mismatches while you are in the file:
- `DELETE /api/tasks/:id` returns `{success:true}` with 200; the contract says **204 no body**.
- `DELETE /api/goals/:id` returns 204; the contract says **200 `{success: boolean}`**.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/cadence test -- src/lib/dev-mock.test.ts`
Expected: PASS for every endpoint.

- [ ] **Step 6: Add the sample-data banner**

In `artifacts/cadence/src/lib/dev-mock.ts`, export a module-level flag that is set to `true` when the mock first serves a response:

```ts
export let devMockActive = false;
```

Export a React hook `useDevMockActive()` from a new file `artifacts/cadence/src/lib/useDevMockActive.ts` that subscribes to that flag (a `useSyncExternalStore` over a tiny emitter is sufficient).

In `artifacts/cadence/src/components/chrome/AppShell.tsx`, render a persistent banner when the flag is true: **"Sample data — this is a local preview, not your account."** with `role="status"`. Style it with existing tokens (`bg-warning`/`text-warning-foreground` or whatever the warning token is — check `tokens/tokens.json` for the exact name; do not invent one).

The banner must be visible on **every** page, since `AppShell` wraps them.

- [ ] **Step 7: Run the full web test suite**

Run: `pnpm --filter @workspace/cadence test`
Expected: PASS — no snapshot or count assertions broke.

- [ ] **Step 8: Commit**

```bash
git add artifacts/cadence/src/lib/dev-mock-fixtures.ts artifacts/cadence/src/lib/dev-mock.ts artifacts/cadence/src/lib/dev-mock.test.ts artifacts/cadence/src/lib/useDevMockActive.ts artifacts/cadence/src/components/chrome/AppShell.tsx artifacts/cadence/package.json pnpm-lock.yaml
git commit --no-gpg-sign -m "fix(dev): extract dev-mock fixtures and validate them against the API contract"
```

---

### Task 14: Documentation and the append-only records

**Files:**
- Modify: `README.md`
- Modify: `DESIGN.md`
- Modify: `spec/master-verification-matrix.md`
- Modify: `docs/07-module-registry.md`
- Modify: `docs/governance/g4-manual-verification-runbook.md`
- Modify: `artifacts/cadence/src/lib/version-info.ts` (highlights)
- Modify: `AUDIT.md` (append only)
- Modify: `CHANGELOG.md` (append only)
- Modify: `AGENTS.md` (where its measured counts change)

**Interfaces:**
- Consumes: every change made in Tasks 1-13
- Produces: no code changes

- [ ] **Step 1: Update the release highlights**

In `artifacts/cadence/src/lib/version-info.ts`, add a highlight describing this work: the app no longer reports success it cannot substantiate. Do not remove the existing drawer highlight.

- [ ] **Step 2: Update the docs-must-move table**

Per `AGENTS.md` §5, the following were touched and **must** be updated in the same commit as their change — verify each is now accurate:

| Because | Update |
|---|---|
| New test files added (Task 1, 3, 9, 10, 11, 12, 13) | `README.md` (test counts), `spec/master-verification-matrix.md`, `docs/07-module-registry.md`, `docs/governance/g4-manual-verification-runbook.md` |
| User-visible changes (Tasks 2, 3, 5, 6, 9, 10, 11, 12) | `artifacts/cadence/src/lib/version-info.ts` highlights |
| Contract change (Tasks 5, 6) | `spec/system-requirements.md` if it documents the affected response shape — check whether it describes `onTimeRate` or `AgentChatOutput` |
| Design-system rule affected | `DESIGN.md` — the "Zero-data-loss" / activity-log claim and any copy guidance the new behaviour contradicts |

- [ ] **Step 3: Append to AUDIT.md and CHANGELOG.md**

Append a **new dated entry** to each. Do not edit any existing entry. The entry states what was found, what was fixed, and what was deliberately deferred.

- [ ] **Step 4: Update AGENTS.md where measurements changed**

If the audit changed the number of test files, endpoints, or pages, correct the counts in `AGENTS.md` §1. If it did not, leave `AGENTS.md` alone.

- [ ] **Step 5: Run the full ladder**

Run: `pnpm run verify`
Expected: **12/12 gates PASS**.

Run: `git status --porcelain`
Expected: empty (all generated output committed, all changes committed).

- [ ] **Step 6: Commit**

```bash
git add README.md DESIGN.md spec/ docs/ artifacts/cadence/src/lib/version-info.ts AUDIT.md CHANGELOG.md AGENTS.md
git commit --no-gpg-sign -m "docs: record the truthfulness remediation and its deferred scope"
```

---

## Plan Completion Checklist

- [ ] `pnpm run verify` — 12/12 green
- [ ] `pnpm run verify:e2e` — green
- [ ] `git status --porcelain` — empty
- [ ] A signed-in user with an empty database sees **no** success claim on any page
- [ ] A signed-in user with a **failing** API sees an explicit unknown state, not a default
- [ ] The agent page visibly labels a deterministic-fallback reply
- [ ] The dev mock's fixtures are validated against the contract in CI
- [ ] Every doc in the `AGENTS.md` §5 table is updated
- [ ] `AUDIT.md` and `CHANGELOG.md` have new dated entries; no history rewritten
