-- 0007_focus_settings.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive
-- only: focus_settings (per-user daily round target). Safe on a database
-- with 0001–0006 applied; fails loudly on re-run.
--
-- Semantics (mirrored in lib/db/src/schema/focus-settings.ts):
--   a. One row per user (PK on user_id); target 1..20, default 4.
--   b. RLS + the standard 4 per-user policies off the Clerk `sub` claim.
--   c. Grants for the `authenticated` role (+ sequences, harmless).

CREATE TABLE public.focus_settings (
  user_id TEXT PRIMARY KEY,
  daily_target INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT focus_settings_target_check CHECK (daily_target BETWEEN 1 AND 20)
);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.focus_settings TO authenticated;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.focus_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own focus settings select"
  ON public.focus_settings FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own focus settings insert"
  ON public.focus_settings FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own focus settings update"
  ON public.focus_settings FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own focus settings delete"
  ON public.focus_settings FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);
