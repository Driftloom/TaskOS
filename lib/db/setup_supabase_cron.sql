-- setup_supabase_cron.sql
--
-- Cadence Task & Time OS — Supabase Extensions & pg_cron Setup
-- Run as database owner (e.g. via Supabase SQL Editor).
--
-- Prerequisites:
--   1. Replace <APP_URL> with your deployed API URL (e.g. https://api.cadence.yourdomain.com or Replit URL)
--   2. Replace <DISPATCH_SECRET> with the value from your server environment / .env DISPATCH_SECRET
--
-- Extensions:
--   - pg_cron: in-database cron job scheduler
--   - pg_net: asynchronous HTTP requests from Postgres
--   - vector: pgvector semantic vector search extension
-- ---------------------------------------------------------------------------

-- 1. Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Clean up any previous versions of Cadence jobs (idempotent setup)
DO $$
BEGIN
  PERFORM cron.unschedule('cadence-reminder-dispatch') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cadence-reminder-dispatch'
  );
  PERFORM cron.unschedule('cadence-reschedule-sweep') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cadence-reschedule-sweep'
  );
  PERFORM cron.unschedule('cadence-memory-extraction') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cadence-memory-extraction'
  );
END $$;

-- ---------------------------------------------------------------------------
-- 3. Schedule cron jobs
-- ---------------------------------------------------------------------------

-- Job A: Reminder Dispatch (every 5 minutes)
-- Claims due reminder rows atomically (FOR UPDATE SKIP LOCKED),
-- checks quiet hours / kill switch, sends Telegram messages, logs to reminder_runs.
SELECT cron.schedule(
  'cadence-reminder-dispatch',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := '<APP_URL>/internal/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', '<DISPATCH_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Job B: Auto-Reschedule Sweep (hourly at :00)
-- Sweeps overdue tasks, applies +24h moves, proposes ask-mode updates,
-- applies Rule 9 duration multipliers, flags tasks hitting the 5-move cap.
SELECT cron.schedule(
  'cadence-reschedule-sweep',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := '<APP_URL>/internal/reschedule',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', '<DISPATCH_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Job C: Nightly Source A Memory Extraction (nightly at 02:00 UTC)
-- Runs pure SQL behavioral arithmetic comparing duration estimates vs actual
-- logged focus time; creates and reinforces memory facts with Rule 9 multipliers.
SELECT cron.schedule(
  'cadence-memory-extraction',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := '<APP_URL>/internal/memory-extraction',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', '<DISPATCH_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ---------------------------------------------------------------------------
-- 4. Verification & Diagnostic Queries
-- ---------------------------------------------------------------------------

-- View active scheduled jobs:
-- SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;

-- View recent execution history:
-- SELECT jobid, runid, job_pid, status, return_message, start_time, end_time
-- FROM cron.job_run_details
-- ORDER BY start_time DESC LIMIT 20;

-- Check reminder runs watchdog recency:
-- SELECT id, started_at, finished_at, claimed, sent, failed, note
-- FROM public.reminder_runs
-- ORDER BY started_at DESC LIMIT 10;

-- Check reschedule runs history:
-- SELECT id, started_at, finished_at, checked, moved, flagged, proposed, note
-- FROM public.reschedule_runs
-- ORDER BY started_at DESC LIMIT 10;
