# Cadence — Data Models & Schema

> **Canonical data contract.** Source of truth for all table shapes. Derived from the live Drizzle schema in `lib/db/src/schema/`. Any divergence between this document and the schema files is a bug in this document.  
> **Last verified:** 2026-09-19 against migrations `0001`–`0009`.

---

## 1. Auth & Isolation Architecture

- **Auth provider:** Clerk (native third-party-auth integration with Supabase)
- **Identity claim:** `auth.jwt()->>'sub'` — the Clerk user ID, present in every verified JWT
- **RLS enforcement:** Every request goes through `runWithRls(req, tx => …)` in `artifacts/api-server/src/lib/rls.ts`. This sets the session claim and applies all policies before any query runs. Owner-level `Pool` bypasses RLS alone — `runWithRls` is not optional.
- **Fail-closed:** No token → match-nothing claims → zero rows returned. RLS never degrades to "see all."
- **Every table is `user_id`-scoped.** No exemptions for memory, agent, or any other subsystem.

---

## 2. Full Table Catalogue

### `tasks`
Core task record.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `serial` | PK | — |
| `user_id` | `text` | NOT NULL | Clerk `sub`; RLS scope |
| `title` | `text` | NOT NULL | — |
| `notes` | `text` | nullable | Free-text |
| `project_id` | `integer` | FK → `projects.id` ON DELETE SET NULL | NULL = unfiled task |
| `parent_id` | `integer` | FK → `tasks.id` ON DELETE RESTRICT; self-reference | NULL = top-level; subtask on non-null |
| `reschedule_count` | `integer` | NOT NULL DEFAULT 0 | Auto-moves only; manual edits don't increment |
| `needs_attention` | `boolean` | NOT NULL DEFAULT false | Set when `reschedule_count` reaches cap |
| `automation` | `text` | nullable; CHECK `IN ('off','ask','auto')` | NULL = inherit from `reschedule_settings.default_mode` |
| `due_at` | `timestamp tz` | nullable | — |
| `duration_min` | `integer` | NOT NULL DEFAULT 30 | Estimated duration |
| `priority` | `text` | NOT NULL DEFAULT 'medium'; CHECK `IN ('low','medium','high')` | — |
| `status` | `text` | NOT NULL DEFAULT 'open'; CHECK `IN ('inbox','open','completed')` | — |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() | — |
| `updated_at` | `timestamp tz` | NOT NULL DEFAULT now(), auto-updated | — |

**Indexes:** `tasks_overdue_idx` on `(status, due_at)` — the reschedule sweep's hot path.

---

### `projects`
Project/list groupings.

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `user_id` | `text` | NOT NULL |
| `name` | `text` | NOT NULL |
| `color` | `text` | nullable (hex) |
| `archived` | `boolean` | NOT NULL DEFAULT false |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |
| `updated_at` | `timestamp tz` | NOT NULL DEFAULT now(), auto-updated |

---

### `tags`
User-defined labels for cross-cutting categorization.

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `user_id` | `text` | NOT NULL |
| `name` | `text` | NOT NULL |
| `color` | `text` | nullable |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |

---

### `task_files`
URL and file attachment links on tasks.

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `user_id` | `text` | NOT NULL |
| `task_id` | `integer` | FK → `tasks.id` ON DELETE CASCADE |
| `label` | `text` | nullable |
| `url` | `text` | NOT NULL |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |

---

### `time_blocks`
Scheduled blocks of work on the calendar (drag-drop hour grid).

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `user_id` | `text` | NOT NULL |
| `task_id` | `integer` | FK → `tasks.id` ON DELETE CASCADE |
| `start_at` | `timestamp tz` | NOT NULL |
| `end_at` | `timestamp tz` | NOT NULL |
| `source` | `text` | CHECK `IN ('manual','auto')` |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |
| `updated_at` | `timestamp tz` | NOT NULL DEFAULT now(), auto-updated |

---

### `focus_sessions`
Pomodoro-style work rounds against a task.

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `user_id` | `text` | NOT NULL |
| `task_id` | `integer` | FK → `tasks.id` ON DELETE CASCADE |
| `started_at` | `timestamp tz` | NOT NULL |
| `ended_at` | `timestamp tz` | nullable |
| `duration_min` | `integer` | nullable (actual elapsed) |
| `completed` | `boolean` | NOT NULL DEFAULT false |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |

---

### `focus_settings`
Per-user focus-timer preferences.

| Column | Type | Constraints |
|---|---|---|
| `user_id` | `text` | PK (one row per user) |
| `work_min` | `integer` | NOT NULL DEFAULT 25 |
| `break_min` | `integer` | NOT NULL DEFAULT 5 |
| `long_break_min` | `integer` | NOT NULL DEFAULT 15 |
| `rounds_before_long_break` | `integer` | NOT NULL DEFAULT 4 |
| `daily_target` | `integer` | NOT NULL DEFAULT 8 |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |
| `updated_at` | `timestamp tz` | NOT NULL DEFAULT now(), auto-updated |

---

### `reminders`
Scheduled reminder records, consumed by the dispatcher job.

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `user_id` | `text` | NOT NULL |
| `task_id` | `integer` | FK → `tasks.id` ON DELETE CASCADE |
| `remind_at` | `timestamp tz` | NOT NULL |
| `channel` | `text` | NOT NULL DEFAULT 'telegram'; CHECK `IN ('telegram')` |
| `status` | `text` | NOT NULL DEFAULT 'pending'; CHECK `IN ('pending','sending','sent','failed','canceled')` |
| `attempts` | `integer` | NOT NULL DEFAULT 0 |
| `last_error` | `text` | nullable |
| `sent_at` | `timestamp tz` | nullable |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |
| `updated_at` | `timestamp tz` | NOT NULL DEFAULT now(), auto-updated |

**Indexes:** `reminders_due_idx` on `(status, remind_at)`.

---

### `reminder_runs`
Audit log of each dispatcher cron execution.

| Column | Type |
|---|---|
| `id` | `serial` PK |
| `started_at` | `timestamp tz` NOT NULL DEFAULT now() |
| `finished_at` | `timestamp tz` nullable |
| `checked` | `integer` NOT NULL DEFAULT 0 |
| `sent` | `integer` NOT NULL DEFAULT 0 |
| `failed` | `integer` NOT NULL DEFAULT 0 |
| `skipped` | `integer` NOT NULL DEFAULT 0 |
| `note` | `text` nullable |

---

### `notification_settings`
Per-user notification preferences (one row per user, PK on `user_id`).

| Column | Type | Constraints |
|---|---|---|
| `user_id` | `text` | PK |
| `telegram_chat_id` | `text` | nullable; regex `^-?[0-9]{1,19}$` |
| `quiet_start` | `integer` | NOT NULL DEFAULT 22; CHECK 0–23 |
| `quiet_end` | `integer` | NOT NULL DEFAULT 7; CHECK 0–23 |
| `timezone` | `text` | NOT NULL DEFAULT 'UTC' |
| `reminders_enabled` | `boolean` | NOT NULL DEFAULT true |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |
| `updated_at` | `timestamp tz` | NOT NULL DEFAULT now(), auto-updated |

---

### `automation_flags`
Global kill switches for the reminder dispatcher and reschedule engine.

| Column | Type | Notes |
|---|---|---|
| `key` | `text` | PK |
| `enabled` | `boolean` | NOT NULL DEFAULT true |
| `updated_at` | `timestamp tz` | auto-updated |

> **Write policy:** Selectable by authenticated users; writable **only** by the DB owner via Supabase dashboard or SQL editor. No API write path. Known keys: `reminders_enabled`, `reschedule_enabled`.

---

### `reschedule_proposals`
Ask-mode proposals — written by the sweep when `automation = 'ask'`; accepted/declined by the user.

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `user_id` | `text` | NOT NULL |
| `task_id` | `integer` | FK → `tasks.id` ON DELETE CASCADE |
| `from_due` | `timestamp tz` | nullable (original due) |
| `to_due` | `timestamp tz` | NOT NULL (proposed new due) |
| `status` | `text` | NOT NULL DEFAULT 'pending'; CHECK `IN ('pending','accepted','declined','expired')` |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |
| `updated_at` | `timestamp tz` | NOT NULL DEFAULT now(), auto-updated |

One pending proposal per task — the sweep never duplicates.

---

### `reschedule_runs`
Audit log of each reschedule sweep execution.

| Column | Type |
|---|---|
| `id` | `serial` PK |
| `started_at` | `timestamp tz` |
| `finished_at` | `timestamp tz` nullable |
| `checked` | `integer` |
| `moved` | `integer` |
| `flagged` | `integer` |
| `proposed` | `integer` |
| `note` | `text` nullable |

---

### `reschedule_settings`
Per-user automation dial and cap (one row per user, PK on `user_id`).

| Column | Type | Constraints |
|---|---|---|
| `user_id` | `text` | PK |
| `default_mode` | `text` | NOT NULL DEFAULT 'ask'; CHECK `IN ('off','ask','auto')` |
| `max_moves` | `integer` | NOT NULL DEFAULT 5; CHECK 1–10 |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |
| `updated_at` | `timestamp tz` | NOT NULL DEFAULT now(), auto-updated |

---

### `memory_facts`
Tier 3 structured episodic memory — durable learned patterns that alter system behavior.

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `user_id` | `text` | NOT NULL |
| `key` | `text` | NOT NULL (free-text — not a fixed enum) |
| `title` | `text` | NOT NULL (human-readable label) |
| `category` | `text` | NOT NULL DEFAULT 'custom'; CHECK `IN ('procrastination','channel','soft_commitment','hackathon','chronotype','custom')` |
| `value` | `jsonb` | NOT NULL DEFAULT `'{}'::jsonb` — arbitrary-shaped fact card |
| `source` | `text` | NOT NULL; CHECK `IN ('behavioral','conversational')` |
| `confidence` | `integer` | NOT NULL; CHECK 0–100 |
| `evidence_count` | `integer` | NOT NULL DEFAULT 1 |
| `last_reinforced_at` | `timestamp tz` | NOT NULL DEFAULT now() |
| `archived` | `boolean` | NOT NULL DEFAULT false (archive, never delete) |
| `pending_confirmation` | `boolean` | NOT NULL DEFAULT false (Source B confirmation queue) |
| `confirmation_prompt` | `text` | nullable — shown in `/memory` screen for user to approve |
| `rule9_multiplier` | `real` | nullable — duration factor used by reschedule Rule 9 |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |
| `updated_at` | `timestamp tz` | NOT NULL DEFAULT now(), auto-updated |

> **GIN index** on `value` for JSONB query operators.

---

### `memory_embeddings`
Tier 2 semantic memory — embeddings of freeform notes and conversation turns.

| Column | Type |
|---|---|
| `id` | `serial` PK |
| `user_id` | `text` NOT NULL |
| `source_text` | `text` NOT NULL |
| `metadata` | `jsonb` NOT NULL DEFAULT `'{}'::jsonb` |
| `embedding` | `text` NOT NULL (pgvector `vector` column in migration) |
| `created_at` | `timestamp tz` NOT NULL DEFAULT now() |

---

### `agent_conversations`
Multi-channel transcript history (in-app chat drawer + Telegram bot).

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `user_id` | `text` | NOT NULL |
| `channel` | `text` | NOT NULL DEFAULT 'app'; CHECK `IN ('app','telegram')` |
| `role` | `text` | NOT NULL; CHECK `IN ('user','assistant','system','tool')` |
| `content` | `text` | NOT NULL |
| `tool_calls` | `jsonb` | nullable |
| `tool_call_id` | `text` | nullable |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |

---

### `agent_action_log`
Reversible audit log for every agent mutation — supports "undo last action."

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` | PK |
| `user_id` | `text` | NOT NULL |
| `action` | `text` | NOT NULL (e.g. `create_task`, `reschedule`, `bulk_update`) |
| `target_type` | `text` | NOT NULL (e.g. `task`, `time_block`) |
| `target_id` | `integer` | nullable |
| `before_state` | `jsonb` | nullable — full row snapshot before mutation |
| `after_state` | `jsonb` | nullable — full row snapshot after mutation |
| `undone` | `boolean` | NOT NULL DEFAULT false |
| `created_at` | `timestamp tz` | NOT NULL DEFAULT now() |

---

### `llm_usage`
Token telemetry and spend ceiling tracker per LLM call.

| Column | Type |
|---|---|
| `id` | `serial` PK |
| `user_id` | `text` NOT NULL |
| `model` | `text` NOT NULL |
| `tokens_in` | `integer` NOT NULL DEFAULT 0 |
| `tokens_out` | `integer` NOT NULL DEFAULT 0 |
| `cost_estimate_cents` | `real` NOT NULL DEFAULT 0 |
| `endpoint` | `text` NOT NULL (e.g. `agent_chat`, `memory_extraction`) |
| `created_at` | `timestamp tz` NOT NULL DEFAULT now() |

---

## 3. Table Summary (20 tables)

| # | Table | Schema file |
|---|---|---|
| 1 | `tasks` | `tasks.ts` |
| 2 | `projects` | `projects.ts` |
| 3 | `tags` | `tags.ts` |
| 4 | `task_files` | `task-files.ts` |
| 5 | `time_blocks` | `time-blocks.ts` |
| 6 | `focus_sessions` | `focus-sessions.ts` |
| 7 | `focus_settings` | `focus-settings.ts` |
| 8 | `reminders` | `reminders.ts` |
| 9 | `reminder_runs` | `reminders.ts` |
| 10 | `notification_settings` | `notifications.ts` |
| 11 | `automation_flags` | `notifications.ts` |
| 12 | `reschedule_proposals` | `reschedule.ts` |
| 13 | `reschedule_runs` | `reschedule.ts` |
| 14 | `reschedule_settings` | `reschedule.ts` |
| 15 | `memory_facts` | `memory.ts` |
| 16 | `memory_embeddings` | `memory.ts` |
| 17 | `agent_conversations` | `agent.ts` |
| 18 | `agent_action_log` | `agent.ts` |
| 19 | `llm_usage` | `agent.ts` |
| 20 | *(subtasks are modeled as `tasks.parent_id` self-reference — no separate table)* | `tasks.ts` |

> **Migration status:** `0001`–`0008` applied to Supabase. `0009_agent_memory.sql` written and schema-verified; pending owner execution in Supabase SQL editor.

---

## 4. Security Invariants

- All 20 tables are RLS-enabled in Supabase.
- Every query runs through `runWithRls` — no handler may use the owner-level pool directly for user-facing data.
- `automation_flags` is the exception: readable by authenticated role, writable only by the DB owner.
- `memory_facts.archived = true` rows are preserved forever — never hard-deleted.
- `agent_action_log` rows are never hard-deleted — the `undone` flag marks reversed actions.
