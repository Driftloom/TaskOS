-- 0016_llm_credentials.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive only:
-- per-user LLM provider credentials for in-app BYOK (Bring Your Own Key).
-- Safe on a database with 0000..0015 applied; fails loudly on re-run.
--
-- WHY A NEW TABLE AND NOT memory_facts:
--   memory_facts.value is JSONB and doubles as user-facing content -- it backs
--   the "What Cadence Knows About Me" screen. Integration credentials were being
--   smuggled into it as category='channel' rows (telegram_config), and because
--   GET /memory/facts selected whole rows, that token was returned to the client
--   in plaintext. A paid provider API key has no business being a memory fact,
--   so credentials get their own table with no read path that projects `value`.
--
-- Semantics (mirrored in lib/db/src/schema/llm-credentials.ts):
--   a. ciphertext holds AES-256-GCM output as base64 "v1:iv:tag:payload".
--      Encrypted at rest because the row is readable by anything holding the
--      database URL, and unlike the Telegram token there is no safe "revoke by
--      re-paste" story if it leaks.
--   b. key_hint is the last 4 characters, for the Settings UI to tell two
--      providers apart. Never the full key.
--   c. base_url is only meaningful for provider='custom', for any other
--      OpenAI-compatible endpoint.
--   d. UNIQUE (user_id, provider) -- one active key per provider per user, so
--      "which key is live" is unambiguous.
--   e. No FK on user_id, matching every other table: there is no users table in
--      this schema, and Clerk subjects arrive as auth.jwt()->>'sub' TEXT.

CREATE TABLE public.llm_credentials (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  provider TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  base_url TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT llm_credentials_provider_check
    CHECK (provider IN ('gemini', 'nvidia_nim', 'groq', 'openrouter', 'custom')),

  -- A hint is a hint: 4 chars, and never a full-length key.
  CONSTRAINT llm_credentials_key_hint_check
    CHECK (char_length(key_hint) <= 8),

  -- base_url is only meaningful for a custom endpoint.
  CONSTRAINT llm_credentials_base_url_check
    CHECK (provider = 'custom' OR base_url IS NULL),

  CONSTRAINT llm_credentials_user_provider_key UNIQUE (user_id, provider)
);

CREATE INDEX llm_credentials_user_idx ON public.llm_credentials (user_id);

-- ---------------------------------------------------------------------------
-- RLS: own-rows only, same shape as 0009's per-user policies.
-- No SELECT policy is omitted here the way llm_usage omits one -- unlike
-- telemetry, a credential row is exactly what the owning user must read.
-- ---------------------------------------------------------------------------

ALTER TABLE public.llm_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY llm_credentials_own_select ON public.llm_credentials
  FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY llm_credentials_own_insert ON public.llm_credentials
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY llm_credentials_own_update ON public.llm_credentials
  FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY llm_credentials_own_delete ON public.llm_credentials
  FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

REVOKE ALL ON public.llm_credentials FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.llm_credentials TO authenticated;