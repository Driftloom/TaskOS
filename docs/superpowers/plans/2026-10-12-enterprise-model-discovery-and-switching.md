# Enterprise Model Discovery, Dynamic Model Switching & Subsystems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify an enterprise dynamic model discovery and autonomous runtime switching system for Google Gemini, Groq, OpenRouter, and NVIDIA NIM across UI, UX, Backend, and Telegram.

**Architecture:** A native discovery service (`discovery.ts`) queries provider metadata endpoints (`ListModels`) with zero inference token cost to validate API keys and retrieve available models. Credential endpoints (`/agent/credentials`) leverage discovery to auto-select optimal models (`gemini-3.8-flash`) and prevent 404 probe failures. Frontend settings and chat panels render live discovered catalogs with tier badges. The agent engine and Telegram bot support conversational model switching and self-healing fallbacks.

**Tech Stack:** TypeScript, Express 5, React 19, Tailwind v4, TanStack React Query, Drizzle ORM, Vitest, Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-10-12-enterprise-model-discovery-and-switching-design.md`

## Global Constraints
- Every API endpoint requires authentication and tenant isolation (`requireAuth`, `runWithRls`).
- Never store raw unencrypted API keys; use AES-256-GCM encryption (`encryptCredential`).
- Keys are write-only in responses; only return masked `keyHint` and discovered model metadata.
- All 12 verification ladder gates must pass (`pnpm run verify:fast`).
- Code changes must be accompanied by comprehensive Vitest unit and integration tests.

## Review Focus
1. **Invalid API Key Handling:** Google AI Studio keys that are revoked or malformed must return human-friendly 400 errors ("Invalid Google Gemini API key") instead of generic server errors.
2. **Endpoint 404 Resilience:** The system must never guess static deprecated models; it must use discovered models, with `gemini-3.8-flash` as primary workhorse.
3. **Zero-Key Re-Entry Model Switching:** Changing the active model for an already-stored key must never require the user to paste their API key again.
4. **Telegram Conversational Switching:** Telegram bot must support both `/model` command and natural messages ("switch to gemini 3.8 flash") without crashing.
5. **Multi-Tenant Isolation:** One tenant's BYOK credentials and discovered models must never leak to another tenant.

---

### Task 1: Backend Model Discovery Service

**Files:**
- Create: `artifacts/api-server/src/lib/agent/discovery.ts`
- Create: `artifacts/api-server/src/lib/agent/discovery.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DiscoveredModel {
    id: string;
    label: string;
    badge?: string;
    description: string;
    tier: "speed" | "balanced" | "reasoning" | "legacy";
  }

  export async function discoverProviderModels(
    provider: ProviderId,
    apiKey: string,
    baseUrl?: string,
  ): Promise<{ success: boolean; models: DiscoveredModel[]; defaultModel: string; error?: string }>;
  ```

- [ ] **Step 1: Write failing unit test for `discovery.test.ts`**
  Cover Gemini discovery (stripping `models/`, filtering `generateContent`, badge mapping), Groq discovery, and error handling for bad keys.
- [ ] **Step 2: Run test to verify it fails**
  `pnpm --filter @workspace/api-server test -- src/lib/agent/discovery.test.ts`
- [ ] **Step 3: Implement `discovery.ts`**
  Implement Google Gemini discovery via `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, Groq via `https://api.groq.com/openai/v1/models`, and fallback catalogs.
- [ ] **Step 4: Run test to verify it passes**
  `pnpm --filter @workspace/api-server test -- src/lib/agent/discovery.test.ts`
- [ ] **Step 5: Commit**
  `git add artifacts/api-server/src/lib/agent/discovery* && git commit --no-gpg-sign -m "feat(agent): add enterprise provider model discovery service"`

---

### Task 2: Backend Credential Endpoint Discovery & Verification Integration

**Files:**
- Modify: `artifacts/api-server/src/routes/agent.ts`
- Modify: `artifacts/api-server/src/lib/agent/providers.ts`
- Test: `artifacts/api-server/src/lib/agent/providers.test.ts`

**Interfaces:**
- Consumes: `discoverProviderModels` from `discovery.ts`
- Produces: Enriched `PUT /api/agent/credentials/:provider` and `GET /api/agent/credentials` returning `availableModels`

- [ ] **Step 1: Write tests in `providers.test.ts` for modern models and discovery integration**
- [ ] **Step 2: Run test to verify failure**
  `pnpm --filter @workspace/api-server test -- src/lib/agent/providers.test.ts`
- [ ] **Step 3: Update `agent.ts`**
  In `PUT /api/agent/credentials/:provider`, run `discoverProviderModels` before probing. If valid, select optimal default model (`gemini-3.8-flash`), run 1-token test probe, and return available models.
- [ ] **Step 4: Run test to verify passes**
  `pnpm --filter @workspace/api-server test -- src/lib/agent/providers.test.ts`
- [ ] **Step 5: Commit**
  `git add artifacts/api-server/src/routes/agent.ts artifacts/api-server/src/lib/agent/providers* && git commit --no-gpg-sign -m "feat(api): integrate dynamic model discovery into credential verification"`

---

### Task 3: Agent Intent & ReAct Loop Autonomous Model Switching

**Files:**
- Modify: `artifacts/api-server/src/lib/agent/intent.ts`
- Modify: `artifacts/api-server/src/lib/agent/tools.ts`
- Modify: `artifacts/api-server/src/lib/agent/engine.ts`
- Test: `artifacts/api-server/src/lib/agent/intent.test.ts`
- Test: `artifacts/api-server/src/lib/agent/tools.test.ts`

**Interfaces:**
- Consumes: Discovered models from `discovery.ts`
- Produces: Natural language intent classification for Gemini 3.8 Flash, 3.8 Flash Lite, 3.1 Pro; autonomous fallback in `callProviderChat`.

- [ ] **Step 1: Write test cases in `intent.test.ts` and `tools.test.ts`**
  Add test assertions for "switch to gemini 3.8 flash", "use flash lite", "switch to gemini 3.1 pro", "which model are you using?".
- [ ] **Step 2: Run tests to verify failures**
  `pnpm --filter @workspace/api-server test -- src/lib/agent/intent.test.ts src/lib/agent/tools.test.ts`
- [ ] **Step 3: Implement intent classification and tools update**
  Update `intent.ts` to recognize modern models; update `tools.ts` `switch_model` to handle dynamic model validation; update `engine.ts` candidate fallbacks.
- [ ] **Step 4: Run tests to verify all pass**
  `pnpm --filter @workspace/api-server test -- src/lib/agent/intent.test.ts src/lib/agent/tools.test.ts`
- [ ] **Step 5: Commit**
  `git add artifacts/api-server/src/lib/agent/intent* artifacts/api-server/src/lib/agent/tools* artifacts/api-server/src/lib/agent/engine* && git commit --no-gpg-sign -m "feat(agent): enhance intent parsing and engine fallback for modern models"`

---

### Task 4: Telegram Bot `/model` Command & Conversational Switching

**Files:**
- Modify: `artifacts/api-server/src/routes/telegram.ts`
- Modify: `artifacts/api-server/src/lib/telegram.ts`
- Test: `artifacts/api-server/src/lib/telegram.test.ts`

**Interfaces:**
- Produces: `/model` command handler in `telegram.ts` and `parseTelegramCommand`

- [ ] **Step 1: Write test for `/model` command parsing in `telegram.test.ts`**
- [ ] **Step 2: Run test to verify failure**
  `pnpm --filter @workspace/api-server test -- src/lib/telegram.test.ts`
- [ ] **Step 3: Implement `/model` command in `telegram.ts` and `telegram.ts`**
  Support `/model`, `/model <id>`, and conversational model switching with interactive response.
- [ ] **Step 4: Run test to verify passes**
  `pnpm --filter @workspace/api-server test -- src/lib/telegram.test.ts`
- [ ] **Step 5: Commit**
  `git add artifacts/api-server/src/routes/telegram.ts artifacts/api-server/src/lib/telegram* && git commit --no-gpg-sign -m "feat(telegram): add /model command and conversational model switching"`

---

### Task 5: Frontend UI/UX Live Model Discovery & Seamless Switching

**Files:**
- Modify: `artifacts/cadence/src/pages/settings/AgentSettingsView.tsx`
- Modify: `artifacts/cadence/src/components/agent/AgentPanel.tsx`
- Test: `artifacts/cadence/src/components/agent/AgentPanel.test.tsx`

**Interfaces:**
- Consumes: Credential endpoints with discovered models
- Produces: Dynamic model dropdown with tier badges (⚡ Recommended, 💸 Cheapest, 🧠 Deep Reasoning); active model status chip in header; zero-key re-entry switching.

- [ ] **Step 1: Write/update tests in `AgentPanel.test.tsx`**
- [ ] **Step 2: Update `AgentSettingsView.tsx`**
  Display modern curated & discovered models, live model selection without re-entering keys, and actionable error messages.
- [ ] **Step 3: Update `AgentPanel.tsx`**
  Add active model status chip in header, dynamic model switch dropdown, and model change toast.
- [ ] **Step 4: Run frontend tests**
  `pnpm --filter @workspace/cadence test -- src/components/agent/AgentPanel.test.tsx`
- [ ] **Step 5: Commit**
  `git add artifacts/cadence/src/pages/settings/AgentSettingsView.tsx artifacts/cadence/src/components/agent/AgentPanel* && git commit --no-gpg-sign -m "feat(cadence): add dynamic model discovery and model switching UI"`

---

### Task 6: End-to-End Verification Ladder & QA Gates

**Files:**
- Run full 7-gate ladder (`pnpm run verify:fast`).
- Rebuild API server (`artifacts/api-server/dist/index.mjs`) and Cadence web app.
- Update `CHANGELOG.md` and `AUDIT.md` (append-only).
- Update release highlights in `version-info.ts`.

- [ ] **Step 1: Run all unit and integration test suites**
  `pnpm run test`
- [ ] **Step 2: Run fast verification ladder**
  `pnpm run verify:fast`
- [ ] **Step 3: Rebuild API server and web app**
  `pnpm --filter @workspace/api-server run build`
  `pnpm --filter @workspace/cadence run build`
- [ ] **Step 4: Restart API daemon and verify `/api/healthz`**
- [ ] **Step 5: Update documentation (`CHANGELOG.md`, `AUDIT.md`, `version-info.ts`)**
- [ ] **Step 6: Final commit and push**
