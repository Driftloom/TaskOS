-- 0015_pg_net_schema_relocation.sql
--
-- !! APPLY WITH EXPLICIT OWNER SIGN-OFF ONLY !!
--
-- Moves 'pg_net' from 'public' to 'extensions' schema.
-- pg_net has relocatable=false in Postgres, so the only way to move it is:
--   DROP EXTENSION pg_net CASCADE  →  recreate in target schema
--
-- THE CASCADE drops any objects that depend on pg_net functions, which
-- includes any pg_cron jobs wired to net.http_post() / net.http_get().
-- This will silently remove your reminder-dispatch and reschedule-sweep
-- cron jobs if they reference pg_net directly.
--
-- Pre-apply checklist (complete before running):
--   1. Open Supabase Dashboard → Database → Cron Jobs.
--   2. Note down every job definition (schedule, command, http endpoint).
--   3. Confirm net.http_post / net.http_get are used and document the calls.
--   4. After applying, recreate the cron jobs via the dashboard or via SQL:
--        SELECT cron.schedule('<name>', '<cron expr>', $$SELECT net.http_post(...)$$);
--   5. Run `pnpm run test:db` to confirm schema invariants still hold.
--
-- This migration is intentionally held unapplied (0015) so the runner
-- can apply 0014 first and leave this one pending until the checklist above
-- is completed.

-- ---------------------------------------------------------------------------
-- Ensure the 'extensions' schema exists (0014 creates it; guard for safety)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;

-- ---------------------------------------------------------------------------
-- Relocate pg_net: DROP CASCADE + recreate in 'extensions'
-- ---------------------------------------------------------------------------
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
