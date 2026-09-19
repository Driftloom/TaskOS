# Cadence — Agent & Memory Subsystem

> **Canonical contract for the agent + memory module.** Describes the 3-tier memory architecture, dual-source extraction pipeline, context retrieval algorithm, ReAct agent engine, tool contracts, and integration points.  
> **Last verified:** 2026-09-19. Source: `docs/archive/11-memory-management-deep-dive.md` + `lib/db/src/schema/agent.ts` + `lib/db/src/schema/memory.ts`.

---

## 1. Architecture Overview

Two front doors, one agent backend:
- **In-app chat panel** (`/agent` route)
- **Telegram bot** (webhook at `/telegram/webhook`)

Both hit the same Express handler. The agent can only invoke tool calls that mirror existing UI API operations — it cannot take actions the app itself cannot perform or display.

**LLM gateway:** LiteLLM proxy in front of a free-tier-first fallback chain:
1. **NVIDIA NIM** (primary — free, OpenAI-compatible function calling, Llama 3.1 70B+ / Nemotron)
2. **Groq / OpenRouter** (fallback)
3. **Hugging Face** (tertiary)

LiteLLM handles automatic failover when a free tier rate-limits. Tool-calling requires OpenAI-format function calling — all models in the chain must support it.

**Token spend ceiling:** \$5.00/month (~₹400). Every LLM call writes to `llm_usage` with token counts and a cost estimate. A monitoring job alerts when the running monthly total approaches the ceiling.

---

## 2. Memory Architecture — 3 Tiers

### Tier 1 — In-Context (ephemeral)
The current conversation message buffer. Not persisted. Ends when the session ends.

### Tier 2 — Semantic (persistent, freeform)
Embeddings of conversation turns and freeform notes, stored in `memory_embeddings` (pgvector).

- Retrieved by cosine similarity to the current message
- Use case: *"What did I say about the hackathon deadline last week?"*
- Never loaded exhaustively — only top-K matches per query

### Tier 3 — Episodic / Structured (persistent, behavior-altering)
Named patterns the system has **learned about the user**, stored in `memory_facts` as JSONB value cards.

**The one rule that makes this worth building:** a fact only earns a place in `memory_facts` if it is intended to **change system behavior** — primarily the reschedule engine's duration/placement logic (Rule 9) and the agent's suggestions. Facts that can't plausibly alter behavior are conversational trivia and belong in Tier 2 at most.

---

## 3. Memory Extraction Pipeline

### 3.1 Two Sources

**Source A — Behavioral/Statistical (authoritative):**
- A nightly `pg_cron` job runs pure arithmetic on real data
- Compares `tasks.duration_min` (estimate) against actual elapsed time from `focus_sessions`
- Groups by tag, project, and category
- Example output: *"tasks tagged `#hackathon` take ~2.3× their estimate, based on 14 completed tasks"*
- Produces a `rule9_multiplier` for the reschedule engine
- No LLM call — no hallucination risk
- **Automatically updates existing facts without user confirmation**

**Source B — Conversational/LLM (noisier):**
- After each day's agent conversations, a single batched LLM call reviews the transcript
- Looks for explicitly stated preferences or behavioral patterns
- Lower starting confidence than Source A (LLM interpretation vs. measurement)
- **Always prompts the user before updating or archiving** — uses the `pending_confirmation` + `confirmation_prompt` columns

Prompt template for Source B extraction (batched, cheap model tier):
```
You are reviewing conversation transcripts to identify durable behavioral facts about this user.
A fact qualifies only if it:
1. Describes a stable pattern (not a one-off statement)
2. Would change how the scheduling engine or agent suggestions should behave
3. Is specific enough to produce a `key` and a structured `value`

Return a JSON array of candidate facts, each with: key, title, category, value, confidence (0-100).
If no qualifying facts are found, return an empty array.
```

### 3.2 Write Cadence
Extraction runs **once nightly** per user via `pg_cron`. Not per-message. Exception: explicit direct settings updates (e.g., "set my quiet hours to 11pm") write immediately through the normal Settings API — that's a setting, not a learned fact.

### 3.3 Four Confirmed Seed Categories
The extraction pipeline actively looks for these from day one:

| Seed | Key | Source | Detection method |
|---|---|---|---|
| Task-type procrastination | `procrastination` | A | `reschedule_log` + completion timestamps, grouped by tag |
| Channel responsiveness | `channel` | A | `notification_log` timestamps vs. actual reply/completion timestamps per channel |
| Soft recurring commitments | `soft_commitment` | A | Clustering in `reschedule_log` (e.g., "Tuesday evenings always miss") |
| Hackathon-mode shifts | `hackathon` | A + B | Source A detects `#hackathon` clusters; Source B watches for explicit announcements; the two reinforce each other |

Beyond these four seeds, the nightly extraction pass is explicitly open-ended — it surfaces any behavior-relevant pattern, not just those on the list.

### 3.4 Confidence, Decay & Conflict Resolution

Every fact in `memory_facts` has:
- `confidence` (0–100): recalculated at write time; **decayed at read time** based on recency
- `evidence_count`: increments as new supporting observations arrive
- `last_reinforced_at`: timestamp of last confirming evidence

**Decay formula (applied at read time, not stored):**
```
effective_confidence = confidence × e^(-0.02 × days_since_reinforced)
```

A fact about "unreliable Mondays" from 4 months ago counts for much less than one reinforced last week.

**Update rule:** new evidence updates (not overwrites) — increments `evidence_count`, recomputes confidence, bumps `last_reinforced_at`. Contradicting evidence pulls confidence down rather than silently flipping or deleting the fact.

**Archive, don't delete:** facts whose effective confidence drops below a floor are set `archived = true`. They are preserved forever — consistent with the reschedule log and agent action log ("never silently lose history").

---

## 4. Context Retrieval Algorithm

On each agent call, the following layers are assembled under a **fixed token budget** (priority order when budget is tight):

1. **Core profile set** — the handful of highest-confidence, most-general facts (chronotype, most-unreliable day) — always included, capped to ~5 facts
2. **Query-relevant structured facts** — filtered by `key`/`category` matching the current message topic (e.g., a question about a `#hackathon` task pulls in the hackathon multiplier fact)
3. **Top-K semantic matches** — cosine similarity search against `memory_embeddings`
4. **Current conversation history** — last N turns from `agent_conversations`

When budget is exceeded: structured facts (Layer 2) win over semantic matches (Layer 3), since they're the ones meant to directly change behavior.

---

## 5. Agent Tool Contracts

The agent has access to exactly 5 tool categories, each mirroring an existing UI API operation:

| Tool | Description | Destructive? |
|---|---|---|
| `query_tasks` | Read tasks (by status, date, tag, project) | No |
| `create_task` | Create a new task | Yes — logged |
| `update_task` | Update task fields (title, due_at, status, priority, automation) | Yes — logged |
| `reschedule_task` | Move a task's due_at to a new time | Yes — logged (goes through Rule 6/Rule 5 checks) |
| `query_schedule` | Read today's time blocks and calendar | No |

**Inviolable bulk gate:** any tool call that would touch **> 10 tasks** at once requires explicit user confirmation before executing. The agent must surface a summary of what it plans to do and wait for a "yes" / "confirm" reply.

**Every destructive tool call writes to `agent_action_log`** with `before_state` and `after_state` snapshots sufficient to reverse the action.

**"Undo last agent action"** is a first-class command in both the chat panel and Telegram. It reads the most recent non-undone `agent_action_log` row for the user and reverses it.

---

## 6. ReAct Loop

The agent uses a ReAct (Reason + Act) loop:

```
1. Receive user message
2. Assemble context (§4 retrieval algorithm)
3. LLM call with assembled context + tool definitions
4. If LLM returns tool_calls:
   a. Validate: check bulk gate (> 10 tasks → request confirmation)
   b. Execute tool(s) — write agent_action_log for each destructive call
   c. Append tool results to message buffer
   d. Return to step 3 (max 5 iterations per turn to prevent infinite loops)
5. If LLM returns final text response → send to user + persist to agent_conversations
6. Write llm_usage row(s) for all LLM calls in this turn
```

---

## 7. Memory Transparency Screen (`/memory`)

Shipped with the memory module — **not deferred**. See `spec/system-requirements.md §3`.

The `/memory` page surfaces:
- All active `memory_facts` rows for the user (not archived)
- For each fact: `title`, `category`, `source` label (Behavioral / Learned), `confidence` (decayed effective value), `evidence_count`, `last_reinforced_at`
- Actions: **Edit**, **Delete** (sets `archived = true`)
- **Confirmation queue:** all facts with `pending_confirmation = true` (Source B candidates) shown as "Review & Approve" cards with the `confirmation_prompt` text

This screen is the natural home for the Source B re-confirmation flow — build it early, not after the pipeline is running without oversight.

---

## 8. Rescue Integration Points

| Where memory is used | How |
|---|---|
| Reschedule engine — Rule 9 | `memory_facts.rule9_multiplier` adjusts effective task duration before slot-finding |
| Agent chat / Telegram | Context retrieval (§4) shapes the LLM's scheduling suggestions |
| `/memory` screen | Direct user visibility and control over all learned facts |
| Source B confirmation | `pending_confirmation` facts surface as review cards on `/memory` |

A memory system that is written but never read from by anything except chat is decoration. Rule 9 is the critical behavioral hook that makes the memory subsystem functional rather than cosmetic.
