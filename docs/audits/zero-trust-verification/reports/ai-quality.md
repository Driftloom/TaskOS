# Specialized Subsystem Report: AI Quality, Agentic Loop & 3-Tier Memory

> **Zero-Trust AI Subsystem Audit**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Principal AI/Agent Systems Architect  

---

## 1. AI Architecture & Execution Model

The Cadence agent architecture features a dual-execution model designed to balance advanced LLM capability with resilient local fallback:
1. **Cloud LLM Gateway:** An OpenAI-compatible multi-provider router supporting LiteLLM, Gemini, NVIDIA NIM, Groq, and OpenRouter with ReAct function calling.
2. **Local Intent Classification Engine:** When no cloud LLM API key is present or when circuit breakers trip, a deterministic rule-based parser in `artifacts/api-server/src/lib/agent/intent.ts` extracts intents (create task, list schedule, reschedule, undo, help) and executes tools locally.

---

## 2. Model Routing & Fallback Discrepancies

### Provider Resolution Order (`artifacts/api-server/src/lib/agent/providers.ts`)
- Users can supply encrypted BYOK keys in `llm_credentials`.
- If missing, the server falls back to environment variables in this order:
  1. `litellm` (`LITELLM_BASE_URL` + `LITELLM_API_KEY`)
  2. `gemini` (`gemini-3.1-flash-lite`)
  3. `nvidia_nim` (`meta/llama-3.1-70b-instruct`)
  4. `groq` (`llama-3.3-70b-versatile`)
  5. `openrouter` (`google/gemini-2.5-flash`)
- **Specification Discrepancy (D-07):**
  Locked decision D-07 mandates `NVIDIA NIM primary → Groq/OpenRouter fallback → Hugging Face tertiary`. In source code:
  - Hugging Face is completely omitted from `PROVIDER_PRESETS` and database check constraints.
  - Gemini precedes NVIDIA NIM in resolution order, causing environments with multiple keys to default away from NVIDIA NIM.

---

## 3. The 3-Tier Memory Architecture: Reality vs. Gaps

| Tier | Design Contract | Source Code Implementation | Zero-Trust Verification Status |
|---|---|---|---|
| **Tier 1: In-Context (Ephemeral)** | Last N conversational turns injected into dynamic prompt. | `assembleAgentContext` pulls last 6 turns from `agent_conversationsTable`. | **VERIFIED** — Functional in prompt construction. |
| **Tier 2: Semantic Memory** | Embeddings of past notes/chat; top-K cosine similarity retrieval via pgvector. | `memory_embeddingsTable` defined in `lib/db/src/schema/memory.ts`. | **DEAD CODE / UNHOOKED:** Zero code exists to generate embeddings, insert rows, or query pgvector cosine similarity. |
| **Tier 3: Episodic / Structured Facts** | `memory_factsTable` with Source A (behavioral arithmetic) and Source B (conversational LLM). | Source A implemented via `computeSourceAArithmetic`; Source B confirmation routes built. | **PARTIAL:** Source A nightly arithmetic runs; Source B nightly extraction from chat transcripts is **unimplemented**. |

### Memory Confidence Decay Dynamics
The decay formula in `artifacts/api-server/src/lib/memory.ts` applies exponential half-life decay:
$$C_{\text{effective}} = \max(10, \min(100, \text{round}(C \times e^{-0.02 \times \text{daysElapsed}})))$$
- High confidence (≥80%): Directly steers reschedule engine.
- Medium confidence (50–79%): Included in agent system prompt.
- Low confidence (<50%): Tagged for potential archival. Facts below 35% are pruned during nightly sweeps.

---

## 4. Rule 9 Task Duration Multiplier Application

- **Calculation:** Join completed tasks with focus sessions $> 60\text{s}$. If total actual duration vs estimated duration ratio $\ge 1.2$ or $\le 0.8$, emit a `rule9Multiplier`.
- **Application:**
  - Auto-reschedule engine in `routes/internal.ts:516` queries `rule9Multiplier` and scales task placement duration:
    $$\text{effectiveDuration} = \text{round}(\text{durationEstMin} \times \text{rule9Multiplier})$$
  - Prevents chronic underestimation by automatically expanding allocated calendar blocks.

---

## 5. Critical Vulnerabilities & Gaps Identified

### 5.1 The Lifetime vs Monthly Spend Ceiling Bug (D-08 / D-27)
- **Location:** `artifacts/api-server/src/lib/agent/engine.ts:1260`
- **Bug:** `SELECT SUM(cost_estimate_cents) FROM llm_usage WHERE user_id = ?` lacks a month filter (`created_at >= firstDayOfMonth`).
- **Consequence:** Lifetime usage is summed. Once a user consumes \$5.00 cumulatively across all months, `exceededCeiling` is permanently set to `true`, and the UI perpetually displays 100% quota exhausted. Furthermore, reaching the ceiling only sets a JSON flag; it never throttles or blocks requests.

### 5.2 Calendar Time-Block Undo Defect
- **Location:** `artifacts/api-server/src/lib/agent/undo.ts:36-64`
- **Bug:** `undoLastAgentAction` only handles `targetType === "task"`. It has no branch for `targetType === "time_block"`.
- **Consequence:** If the agent creates a calendar time block, calling `POST /agent/undo` fails to delete the block while marking the action log row `undone = true`.

### 5.3 Indirect Prompt Injection via Task Titles
- Task titles are interpolated directly into the system prompt string without XML/bracket isolation:
  `tasks.map(t => - [${t.id}] ${t.title} ...).join('\n')`
- Malicious or adversarial task titles can break out of context and issue conflicting instructions.

---
*Report established under Zero-Trust analysis of AI subsystem source code.*
