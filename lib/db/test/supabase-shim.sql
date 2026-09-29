-- supabase-shim.sql  (LOCAL TEST ONLY — never apply to a real project)
--
-- The migrations in this repo are Supabase-specific: they reference
-- `auth.jwt()`, and grant/revoke privileges on the `anon`, `authenticated` and
-- `service_role` roles that Supabase provisions. That makes them impossible to
-- run against a vanilla Postgres for local verification.
--
-- This file provides the minimum Supabase surface so `pnpm db:migrate` can be
-- exercised end to end on a throwaway database (CI, a new machine, or a
-- developer without the cloud project). It creates no real security: every
-- role is granted membership only, and `auth.jwt()` returns whatever the
-- session set via `request.jwt.claims`, exactly like Supabase does.
--
-- Usage:
--   docker run -d --name cadence-mig-test -e POSTGRES_PASSWORD=testpw -p 55432:5432 postgres:16-alpine
--   psql "postgresql://postgres:testpw@127.0.0.1:55432/postgres" -f supabase-shim.sql
--   DATABASE_URL=... pnpm db:migrate
--   DATABASE_URL=... pnpm test:db
--   docker rm -f cadence-mig-test

-- Roles Supabase provisions. Created only if missing so this file is re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

-- Supabase exposes the caller's claims through auth.jwt(). The real function
-- reads the `request.jwt.claims` GUC that the app sets inside runWithRls.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'sub');
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;
