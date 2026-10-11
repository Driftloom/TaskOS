# Enterprise Model Discovery, Runtime Model Switching & Subsystems Design

**Status:** Approved by Rohit (Option A)  
**Date:** 2026-10-12  
**Scope:** UI / UX, Backend API, Agent Engine (ReAct), Integrations (Telegram / BYOK)  

---

## 1. Problem Statement

Google AI Studio and frontier LLM providers frequently evolve, version, and deprecate models (e.g. retiring older 1.5 checkpoints on specific endpoints, releasing Gemini 3.8 Flash, 3.8 Flash Lite, 3.1 Pro). Cadence had three systemic gaps:
1. **Model 404 on Key Probe:** Probing with a hardcoded guessed model string against Google's OpenAI-compatible endpoint failed with `404: models/gemini-1.5-flash is not found for API version v1main...`, falsely rejecting valid keys as invalid.
2. **Hardcoded Frontend Catalog:** `AgentSettingsView.tsx` and `AgentPanel.tsx` hardcoded static lists. Discovered or custom models were either invisible or collapsed to an uninformative generic `default` label.
3. **No Dynamic Discovery or Autonomous Fallback:** The agent could not dynamically inspect available models for that tenant's key, had brittle intent matching for model switching, and lacked self-healing fallback when a model hit a rate limit (429) or alias deprecation (404).

---

## 2. Architecture & Design Decisions

### 2.1 Backend Discovery Service (`artifacts/api-server/src/lib/agent/discovery.ts`)
- Provider-specific discovery handlers:
  - **Google Gemini:** Calls `GET https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`.
    - 0 tokens burned; immediately validates the key.
    - Rejects invalid keys (`400/403 API_KEY_INVALID`) with clear, human-friendly error messages.
    - Filters models supporting `"generateContent"`.
    - Normalizes IDs by stripping `models/` prefix.
    - Assigns intelligent tier badges:
      - `gemini-3.8-flash`: Recommended workhorse for speed, coding, and tool calling.
      - `gemini-3.8-flash-lite`: Cheapest / fastest, minimal token cost.
      - `gemini-3.1-pro`: Deep multi-step reasoning and complex tradeoffs.
      - `gemini-2.5-flash`: Frontier multimodal generation.
      - `gemini-2.0-flash`: Fast, stable generation.
  - **Groq:** Calls `GET https://api.groq.com/openai/v1/models` (Bearer auth) and formats Llama models.
  - **OpenRouter:** Calls `GET https://openrouter.ai/api/v1/models` (Bearer auth).
  - **NVIDIA NIM:** Queries `/v1/models` or formats curated hosted NIM models.
  - **Custom:** Probes `${baseUrl}/models` or returns the user's configured model.

### 2.2 Backend Credential Validation & Storage (`routes/agent.ts`)
- In `PUT /api/agent/credentials/:provider`:
  1. Call `discoverProviderModels(provider, apiKey, baseUrl)`.
  2. If the user provided no model, select the optimal default (e.g. `gemini-3.8-flash`).
  3. Run a 1-token test ping to verify chat/completions functionality with the chosen model.
  4. Encrypt the key with AES-256-GCM.
  5. Store the credential with the resolved model in `llm_credentials`.
  6. Return `{ provider, configured: true, keyHint, model, baseUrl, availableModels }`.

### 2.3 Frontend UI/UX Polish (`AgentSettingsView.tsx` & `AgentPanel.tsx`)
- In `AgentSettingsView.tsx`:
  - Show real discovered models from the provider.
  - Provide a "Validate & Discover Models" button during key entry.
  - Show clear tier badges for each model (Recommended, Ultra Fast, Deep Reasoning).
  - Allow 1-click model switching on configured providers with **zero key re-entry**.
  - Distinct, humanized error diagnostics (Invalid Key vs Quota Exhausted vs Network Error).
- In `AgentPanel.tsx`:
  - Display active model status chip in header (`[⚡ Gemini 3.8 Flash]`).
  - Dropdown populated with the tenant's real available models.
  - Clear feedback upon model switch.

### 2.4 Agent Engine, Intent & ReAct Loop (`engine.ts`, `tools.ts`, `intent.ts`)
- In `intent.ts`:
  - Classify natural language model switching:
    - `"switch to gemini 3.8 flash"`, `"switch to gemini 3.8"`, `"use gemini 3.8 flash"` -> `gemini-3.8-flash`
    - `"use flash lite"`, `"use cheapest model"`, `"switch to gemini 3.8 flash lite"` -> `gemini-3.8-flash-lite`
    - `"switch to gemini 3.1 pro"`, `"use reasoning model"`, `"switch to gemini pro"` -> `gemini-3.1-pro`
    - `"what model are you using?"`, `"which model is active?"` -> queries active model.
- In `tools.ts`:
  - `switch_model` updates the database credential, logs to `agent_action_log` for 1-click Undo, and returns confirmation.
- In `engine.ts`:
  - Dynamic fallback: if a model encounters 404 or 429, retry with the next best candidate in the provider's verified list.

### 2.5 Telegram Integration (`telegram.ts`)
- Add dedicated `/model` command:
  - Reports current model and provider.
  - Lists quick commands (`/model gemini-3.8-flash`, `/model gemini-3.8-flash-lite`, `/model gemini-3.1-pro`).
- Handle conversational model switching via Telegram with clear confirmation.
- Provide actionable error messages on provider failures.
