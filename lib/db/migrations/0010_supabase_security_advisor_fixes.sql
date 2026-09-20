-- 0010_supabase_security_advisor_fixes.sql
--
-- Run in Supabase SQL Editor as postgres/owner.
-- Resolves all 4 Warnings and 4 Info suggestions flagged by Supabase Security Advisor:
--
-- 1. WARNINGS FIXED:
--    - Extension in Public: moves 'vector' and 'pg_net' from 'public' to 'extensions' schema.
--    - SECURITY DEFINER Execution: revokes public/authenticated execution on 'rls_auto_enable()'.
--
-- 2. INFO SUGGESTIONS FIXED (RLS Enabled No Policy):
--    - Creates explicit 'service_role' policies on internal audit/migration tables:
--      (llm_usage, reminder_runs, reschedule_runs, schema_migrations).
--      This marks them compliant in the linter while keeping them 100% blocked from
--      anon and authenticated (Clerk JWT) users.

-- ---------------------------------------------------------------------------
-- 1. Move extensions to the dedicated 'extensions' schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;

-- (a) vector supports direct SET SCHEMA
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'vector' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  END IF;
END $$;

-- (b) pg_net has relocatable=false in Postgres, so drop & recreate in 'extensions'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'pg_net' AND n.nspname = 'public'
  ) THEN
    DROP EXTENSION pg_net CASCADE;
    CREATE EXTENSION pg_net WITH SCHEMA extensions;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Revoke execute privileges on SECURITY DEFINER function rls_auto_enable()
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN
    SELECT p.oid::regprocedure AS func_sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || func_record.func_sig || ' FROM PUBLIC;';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || func_record.func_sig || ' FROM anon;';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || func_record.func_sig || ' FROM authenticated;';
    EXECUTE 'ALTER FUNCTION ' || func_record.func_sig || ' SET search_path = pg_catalog, public;';
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Resolve 'RLS Enabled No Policy' warnings by adding explicit service_role policies
--    (Keeps tables 100% inaccessible to Clerk JWT authenticated/anon users)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- public.llm_usage
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'llm_usage') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'llm_usage' AND policyname = 'service_role_llm_usage'
    ) THEN
      CREATE POLICY "service_role_llm_usage" ON public.llm_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;

  -- public.reminder_runs
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reminder_runs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reminder_runs' AND policyname = 'service_role_reminder_runs'
    ) THEN
      CREATE POLICY "service_role_reminder_runs" ON public.reminder_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;

  -- public.reschedule_runs
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reschedule_runs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reschedule_runs' AND policyname = 'service_role_reschedule_runs'
    ) THEN
      CREATE POLICY "service_role_reschedule_runs" ON public.reschedule_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;

  -- public.schema_migrations
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_migrations') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'schema_migrations' AND policyname = 'service_role_schema_migrations'
    ) THEN
      CREATE POLICY "service_role_schema_migrations" ON public.schema_migrations FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
