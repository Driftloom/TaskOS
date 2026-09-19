-- 0009_agent_memory.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive
-- only: agent, memory facts, embeddings, and telemetry tables. Safe on a
-- database with 0001–0008 applied; fails loudly on re-run.
--
-- Semantics (mirrored in lib/db/src/schema/{memory,agent,reschedule}.ts):
--   a. memory_facts: durable structured memory cards (Source A arithmetic +
--      Source B conversational), JSONB value, confidence (0-100), Rule 9
--      duration multiplier, pending_confirmation flag for user-prompted facts.
--   b. memory_embeddings: semantic tier for vector search across transcripts/notes.
--   c. agent_conversations: multi-channel transcript history (app + telegram).
--   d. agent_action_log: reversible mutation snapshots with before/after state
--      and undone flag supporting 1-command undo (Doc 09 Gap #2).
--   e. llm_usage: token & cost tracking per user/model/endpoint with spend ceiling.
--   f. reschedule_settings: updates default max_moves from 3 to 5.
--   g. RLS + per-user policies on all authenticated user tables; llm_usage
--      is owner context only (no authenticated policies).

CREATE TABLE public.memory_facts (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived BOOLEAN NOT NULL DEFAULT false,
  pending_confirmation BOOLEAN NOT NULL DEFAULT false,
  confirmation_prompt TEXT,
  rule9_multiplier REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT memory_facts_source_check
    CHECK (source IN ('behavioral', 'conversational')),
  CONSTRAINT memory_facts_confidence_check
    CHECK (confidence BETWEEN 0 AND 100),
  CONSTRAINT memory_facts_category_check
    CHECK (category IN ('procrastination', 'channel', 'soft_commitment', 'hackathon', 'chronotype', 'custom'))
);

CREATE INDEX memory_facts_user_category_idx ON public.memory_facts (user_id, category);
CREATE INDEX memory_facts_user_key_idx ON public.memory_facts (user_id, key);

CREATE TABLE public.memory_embeddings (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  source_text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX memory_embeddings_user_idx ON public.memory_embeddings (user_id);

CREATE TABLE public.agent_conversations (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  channel TEXT NOT NULL DEFAULT 'app',
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_call_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_conversations_channel_check
    CHECK (channel IN ('app', 'telegram')),
  CONSTRAINT agent_conversations_role_check
    CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);

CREATE INDEX agent_conversations_user_created_idx ON public.agent_conversations (user_id, created_at);

CREATE TABLE public.agent_action_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  before_state JSONB,
  after_state JSONB,
  undone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_action_log_user_undone_idx ON public.agent_action_log (user_id, undone, created_at DESC);

CREATE TABLE public.llm_usage (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_estimate_cents REAL NOT NULL DEFAULT 0,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX llm_usage_user_created_idx ON public.llm_usage (user_id, created_at);

-- Update reschedule_settings max_moves default from 3 to 5
ALTER TABLE public.reschedule_settings
  ALTER COLUMN max_moves SET DEFAULT 5;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.memory_facts, public.memory_embeddings, public.agent_conversations, public.agent_action_log
  TO authenticated;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.memory_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_usage ENABLE ROW LEVEL SECURITY;

-- memory_facts policies
CREATE POLICY "own memory facts select"
  ON public.memory_facts FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own memory facts insert"
  ON public.memory_facts FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own memory facts update"
  ON public.memory_facts FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own memory facts delete"
  ON public.memory_facts FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

-- memory_embeddings policies
CREATE POLICY "own memory embeddings select"
  ON public.memory_embeddings FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own memory embeddings insert"
  ON public.memory_embeddings FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own memory embeddings update"
  ON public.memory_embeddings FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own memory embeddings delete"
  ON public.memory_embeddings FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

-- agent_conversations policies
CREATE POLICY "own agent conversations select"
  ON public.agent_conversations FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own agent conversations insert"
  ON public.agent_conversations FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own agent conversations update"
  ON public.agent_conversations FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own agent conversations delete"
  ON public.agent_conversations FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

-- agent_action_log policies
CREATE POLICY "own agent actions select"
  ON public.agent_action_log FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own agent actions insert"
  ON public.agent_action_log FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own agent actions update"
  ON public.agent_action_log FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own agent actions delete"
  ON public.agent_action_log FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

-- llm_usage: intentionally NO policies for authenticated (owner-only telemetry watchdog log).
