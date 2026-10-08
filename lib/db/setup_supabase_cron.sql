-- setup_supabase_cron.sql
--
-- Cadence Task & Time OS — Supabase Extensions & pg_cron Setup
-- Run as database owner (e.g. via Supabase SQL Editor).
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE NO LONGER CONTAINS A URL OR A SECRET
-- ---------------------------------------------------------------------------
-- It used to hardcode `url := '<APP_URL>/internal/dispatch'` and
-- `'x-dispatch-secret', '<DISPATCH_SECRET>'` and rely on the operator to
-- substitute both by hand before running it. Two failure modes followed:
--
--   1. It could run unsubstituted. `cron.schedule` accepts any string as a URL,
--      so a job pointing at a literal `<APP_URL>` schedules successfully, goes
--      active, and fails on every single tick. Nothing in the ladder notices,
--      because a cron job that is registered is indistinguishable from one that
--      is working until you read cron.job_run_details.
--
--   2. The secret was pasted into a tracked file, and then into cron.job.command
--      in plaintext — readable by anyone with SELECT on cron.job. A secret that
--      lives in job definitions cannot be rotated without unscheduling and
--      recreating every job.
--
-- So configuration now lives in Postgres settings, which are set once in the
-- same session, and this file reads them. The validation block below REFUSES to
-- schedule anything if either value is missing or still looks like a
-- placeholder. A loud failure at setup time is the point: it is strictly better
-- than four active jobs that silently never deliver.
--
-- ---------------------------------------------------------------------------
-- HOW TO RUN IT
-- ---------------------------------------------------------------------------
-- Replace the two `SET` lines below with real values and run the whole file in
-- ONE session. `set_config(..., false)` means session-local, so the secret does
-- not persist into pg_settings and will not be dumped by a later pg_dump.
--
--   SET app.cadence.api_url         = 'https://your-api.example.com/api';
--   SET app.cadence.dispatch_secret = '<the same value as DISPATCH_SECRET in .env>';
--
-- Note `api_url` must include the `/api` path prefix: the app mounts its router
-- at /api, so a bare origin yields 404 on every call. The validation block
-- checks for this.
--
-- Verify afterwards with the diagnostic queries in section 5. Section 5 also
-- contains a query that specifically hunts for surviving placeholder jobs, which
-- is the check that would have caught failure mode 1.
-- ---------------------------------------------------------------------------

-- 1. Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 2. Validate configuration BEFORE unscheduling anything.
--
-- Order matters. The previous version unscheduled first and scheduled second, so
-- a validation failure halfway through left the database with fewer jobs than
-- it started with. This validates up front and aborts while the existing
-- schedule is still intact.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_url    text := current_setting('app.cadence.api_url', true);
  v_secret text := current_setting('app.cadence.dispatch_secret', true);
  v_problem text;
BEGIN
  IF v_url IS NULL OR btrim(v_url) = '' THEN
    RAISE EXCEPTION
      'app.cadence.api_url is not set. Run: SET app.cadence.api_url = ''https://your-api.example.com/api''; in this same session before running this file. Nothing has been changed.';
  END IF;

  IF v_url LIKE '%<%' OR v_url LIKE '%>%' THEN
    RAISE EXCEPTION
      'app.cadence.api_url still contains an angle-bracket placeholder: %', v_url;
  END IF;

  IF v_url !~ '^https?://' THEN
    RAISE EXCEPTION
      'app.cadence.api_url must start with http:// or https://, got: %', v_url;
  END IF;

  -- The app mounts its Express router at /api. Without the prefix every job
  -- 404s while still reporting as an active, healthy-looking cron row.
  IF v_url !~ '/api/?$' THEN
    RAISE EXCEPTION
      'app.cadence.api_url must end with the /api path prefix, got: %. The server mounts its router at /api, so a bare origin 404s on every call.', v_url;
  END IF;

  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
    RAISE EXCEPTION
      'app.cadence.dispatch_secret is not set. Run: SET app.cadence.dispatch_secret = ''...''; in this same session before running this file. Nothing has been changed.';
  END IF;

  IF v_secret LIKE '%<%' OR v_secret LIKE '%>%' THEN
    RAISE EXCEPTION
      'app.cadence.dispatch_secret still contains an angle-bracket placeholder.';
  END IF;

  -- A 64-char hex secret is what the app generates. Anything dramatically
  -- shorter is almost certainly a truncated paste.
  IF length(v_secret) < 32 THEN
    RAISE EXCEPTION
      'app.cadence.dispatch_secret is only % chars long. This is too short to be the generated secret; check for a truncated paste.', length(v_secret);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Clean up previous versions of Cadence jobs (idempotent setup).
--
-- Every job this file owns is named, including ones it no longer schedules, so a
-- rename cannot leave an orphan behind pointing at a route that no longer
-- exists. An orphaned active job is invisible from the app.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  j text;
  known text[] := ARRAY[
    'cadence-reminder-dispatch',
    'cadence-reschedule-sweep',
    'cadence-memory-extraction',
    'cadence-recurrence-materialize',
    'cadence-goals-close-month',
    'cadence-memory-extraction',      -- legacy name, unscheduled by the block below
    'recurrence-materialize',
    'cadence-recurrence-materialization'
  ];
BEGIN
  FOREACH j IN ARRAY known LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
      RAISE NOTICE 'unscheduled stale job: %', j;
    END IF;
  END LOOP;

  -- Anything else calling cadence's internal routes, e.g. an older
  -- "cadence-*" job created by hand in the SQL editor.
  FOR j IN SELECT jobname FROM cron.job WHERE jobname LIKE 'cadence-%' LOOP
    PERFORM cron.unschedule(j);
    RAISE NOTICE 'unscheduled unrecognised cadence job: %', j;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Schedule cron jobs.
--
-- The URL and secret are interpolated at schedule time from the session
-- settings validated in section 2, so the literal values are still stored in
-- cron.job.command -- pg_cron has no secret indirection. That is a property of
-- pg_cron, not something this file can fix. Treat SELECT on cron.job as
-- privileged, and rotate the secret by re-running this file with a new value.
-- ---------------------------------------------------------------------------

-- Job A: Reminder Dispatch (every 5 minutes)
-- Claims due reminder rows atomically (FOR UPDATE SKIP LOCKED), checks quiet
-- hours / kill switch, sends Telegram messages, logs to reminder_runs.
-- Path must be /internal/dispatch -- matches router.post in routes/internal.ts.
SELECT cron.schedule(
  'cadence-reminder-dispatch',
  '*/5 * * * *',
  format(
    $job$SELECT net.http_post(
    url := %L || '/internal/dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', %L),
    body := '{}'::jsonb
  );$job$,
    current_setting('app.cadence.api_url'),
    current_setting('app.cadence.dispatch_secret')
  )
);

-- Job B: Auto-Reschedule Sweep (hourly at :00)
-- Sweeps overdue tasks, applies +24h moves, proposes ask-mode updates, applies
-- Rule 9 duration multipliers, flags tasks hitting the 5-move cap.
SELECT cron.schedule(
  'cadence-reschedule-sweep',
  '0 * * * *',
  format(
    $job$SELECT net.http_post(
    url := %L || '/internal/reschedule',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', %L),
    body := '{}'::jsonb
  );$job$,
    current_setting('app.cadence.api_url'),
    current_setting('app.cadence.dispatch_secret')
  )
);

-- Job C: Nightly Source A Memory Extraction (nightly at 02:00 UTC)
-- Pure SQL behavioral arithmetic comparing duration estimates vs actual logged
-- focus time; creates and reinforces memory facts with Rule 9 multipliers.
-- This job was previously documented only in a comment in routes/internal.ts
-- and was never scheduled, so memory extraction has never run.
SELECT cron.schedule(
  'cadence-memory-extraction',
  '0 2 * * *',
  format(
    $job$SELECT net.http_post(
    url := %L || '/internal/memory-extraction',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', %L),
    body := '{}'::jsonb
  );$job$,
    current_setting('app.cadence.api_url'),
    current_setting('app.cadence.dispatch_secret')
  )
);

-- Job D: Nightly Recurrence Materialisation (nightly at 01:00 UTC)
-- Expands recurring tasks into concrete instances.
-- The route is /internal/recurrence-materialize (a verb). A previous job
-- targeted /internal/recurrence-materialization, which does not exist and would
-- have 404'd on every nightly tick.
SELECT cron.schedule(
  'cadence-recurrence-materialize',
  '0 1 * * *',
  format(
    $job$SELECT net.http_post(
    url := %L || '/internal/recurrence-materialize',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', %L),
    body := '{}'::jsonb
  );$job$,
    current_setting('app.cadence.api_url'),
    current_setting('app.cadence.dispatch_secret')
  )
);

-- Job E: Monthly Goals Close (1st of month, 00:05 UTC)
-- Seals the elapsed month: computes each goal's final actual, inserts an
-- immutable monthly_goal_snapshots row, and marks the goal closed. It NEVER
-- creates next-month goals -- carry-forward is user-initiated in the review
-- dialog, because nothing moves without the user seeing it.
-- The handler is idempotent (it skips goals that already have a snapshot), so
-- a pg_cron retry cannot duplicate or corrupt a sealed month.
--
-- Scheduled just after midnight UTC rather than in the user's local timezone
-- because pg_cron runs in UTC and cannot express per-user zones. The handler
-- resolves "strictly earlier than the current month" in each user's own zone,
-- so a user in Asia/Kolkata still gets the correct boundary.
SELECT cron.schedule(
  'cadence-goals-close-month',
  '5 0 1 * *',
  format(
    $job$SELECT net.http_post(
    url := %L || '/internal/goals/close-month',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', %L),
    body := '{}'::jsonb
  );$job$,
    current_setting('app.cadence.api_url'),
    current_setting('app.cadence.dispatch_secret')
  )
);

-- ---------------------------------------------------------------------------
-- 5. Verification & Diagnostic Queries (read-only; safe to paste individually)
-- ---------------------------------------------------------------------------

-- 5a. Active jobs. Expect exactly five rows, all active, all with a real URL:
-- SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
--
-- 5b. THE CHECK THAT MATTERS. Any row returned here is a broken job: registered,
--     active, and guaranteed to fail on every tick. This is precisely the state
--     that a `SELECT ... FROM cron.job WHERE active` check reports as healthy.
-- SELECT jobname FROM cron.job WHERE command LIKE '%<%';
--
-- 5c. Do the scheduled paths actually exist as routes? Compare against
--     routes/internal.ts; a mismatch here is a permanent 404.
-- SELECT jobname, substring(command from '(/internal/[a-z-]+)') AS path FROM cron.job
--  WHERE jobname LIKE 'cadence-%';
--
-- 5d. Recent execution history. status is what actually proves a job works;
--     a job that has never run shows no rows here rather than an error.
-- SELECT jobid, runid, job_pid, status, return_message, start_time, end_time
-- FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
-- 5e. Reminder runs watchdog recency. If this table's newest row is old, the
--     dispatch job is not delivering even though it is active.
-- SELECT id, started_at, finished_at, claimed, sent, failed, note
-- FROM public.reminder_runs ORDER BY started_at DESC LIMIT 10;
--
-- 5f. Reschedule runs history:
-- SELECT id, started_at, finished_at, checked, moved, flagged, proposed, note
-- FROM public.reschedule_runs ORDER BY started_at DESC LIMIT 10;