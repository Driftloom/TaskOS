-- 0014_security_advisor_safe_fixes.sql
--
-- Safe subset of the original 0010 security-advisor fixes.
-- Everything here is non-destructive (no DROP ... CASCADE).
--
-- Covers:
--   1. Move 'vector' extension from 'public' to 'extensions' schema.
--   2. Revoke public/authenticated execute on the SECURITY DEFINER
--      function rls_auto_enable() and harden its search_path.
--   3. Add explicit service_role policies on internal audit/migration
--      tables that have RLS enabled but no policy
--      (llm_usage, reminder_runs, reschedule_runs, schema_migrations).
--
-- NOT included here: pg_net schema relocation (requires DROP ... CASCADE,
-- see 0015_pg_net_schema_relocation.sql — apply only after verifying no
-- active pg_cron jobs will be silently dropped).

-- ---------------------------------------------------------------------------
-- 1. Ensure the 'extensions' schema exists
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;

-- ---------------------------------------------------------------------------
-- 2. Relocate 'vector' extension to 'extensions' schema
--    (vector supports direct SET SCHEMA; no drop needed)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Revoke execute privileges on the SECURITY DEFINER function
--    rls_auto_enable() — callable by all roles by default, unsafe
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
-- 4. service_role policies on internal tables
--    (RLS enabled, no existing policy → flagged by security advisor)
--    Keeps these 100% inaccessible to Clerk JWT authenticated/anon users.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- public.llm_usage
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'llm_usage') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'llm_usage'
        AND policyname = 'service_role_llm_usage'
    ) THEN
      CREATE POLICY "service_role_llm_usage"
        ON public.llm_usage FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    END IF;
  END IF;

  -- public.reminder_runs
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reminder_runs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'reminder_runs'
        AND policyname = 'service_role_reminder_runs'
    ) THEN
      CREATE POLICY "service_role_reminder_runs"
        ON public.reminder_runs FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    END IF;
  END IF;

  -- public.reschedule_runs
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reschedule_runs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'reschedule_runs'
        AND policyname = 'service_role_reschedule_runs'
    ) THEN
      CREATE POLICY "service_role_reschedule_runs"
        ON public.reschedule_runs FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    END IF;
  END IF;

  -- public.schema_migrations (legacy ledger table)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_migrations') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'schema_migrations'
        AND policyname = 'service_role_schema_migrations'
    ) THEN
      CREATE POLICY "service_role_schema_migrations"
        ON public.schema_migrations FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
