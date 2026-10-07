# Audit Report: Conversational Agent Minimal Prompt & Intent Handling

**Date:** 2026-10-07  
**Scope:** `artifacts/api-server/src/lib/agent/` (`engine.ts`, `tools.ts`), `AgentPanel.tsx`  
**Trigger:** Live user test on mobile where `"Broh create shedule from tomorrow 9 to 5"` returned static canned fallback text: *"I'm Cadence, your task co-pilot..."* with 0 tasks and 0 schedules created.

## 1. Root Causes Verified

1. **Deterministic Intent Matcher Fragility (`engine.ts:79`):**
   - Matches are rigid `.startsWith("add task ")`, `.startsWith("create task ")`.
   - Colloquial prefix `"Broh "` immediately broke pattern matching.
   - Spelling typo `"shedule"` broke `.includes("schedule")`.
   - The `.includes("schedule")` branch only called `query_schedule`, never created or planned schedules.

2. **LLM Gateway Disconnect & Silent Fallback (`engine.ts:131`):**
   - Fallback relies solely on `LITELLM_BASE_URL` or `NVIDIA_NIM_API_KEY`.
   - `.env.example` configures `GEMINI_API_KEY`.
   - Missing/unreachable gateway resulted in unhandled circuit-breaker fallback directly emitting the static greeting string.

3. **Missing Conversational Clarification on Underspecified Prompts:**
   - A minimal prompt specifying only a window (e.g. `tomorrow 9 to 5`) lacks:
     - **What:** Which tasks to place or create?
     - **Why:** What priority or theme (Deep work, admin, project sprint)?
     - **How:** How to structure breaks (90-min sprints, Pomodoro, lunch break)?
   - `timeBlocksTable` in DB requires non-null `task_id` (calendar blocks cannot be empty).
   - The engine lacked a disambiguation state machine to ask these questions or present structured options.

4. **Missing Tool Capability:**
   - Agent tool definitions lacked `create_time_block` / `schedule_work_block` to write calendar placements to `time_blocksTable`.

## 2. Remediation Plan

1. Implement robust normalization in `engine.ts` (strip greetings, fuzzy match typos for `schedule`, `tomorrow`).
2. Add time-window and natural date entity extraction.
3. Build proactive clarification generator (What, Why, How questions + 1-tap proposals).
4. Add `create_time_block` tool to `tools.ts`.
5. Support multi-provider LLM gateways (`GEMINI_API_KEY`, etc.).
6. Write comprehensive real-world test suite in `agent.test.ts`.
