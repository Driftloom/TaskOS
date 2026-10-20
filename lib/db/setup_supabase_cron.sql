-- setup_supabase_cron.sql
--
-- Cadence Task & Time OS — Supabase Extensions & pg_cron Setup
-- Run as database owner (e.g. via Supabase SQL Editor), whole file in ONE session.
--
-- ---------------------------------------------------------------------------
-- DESIGN NOTE: WHERE THE SECRET AND THE URL LIVE
-- ---------------------------------------------------------------------------
-- Three generations ago the file inlined '<APP_URL>' and the dispatch secret
-- as placeholders. Two failure modes followed: jobs could be scheduled
-- unsubstituted (silently 404 deadline after deadline), and the secret ended
-- up in plaintext inside cron.job.command — readable by anyone with SELECT on
-- cron.job and unrotatable without unscheduling everything.
--
-- Two generations ago the secret became a runtime `current_setting` lookup
-- inside job commands. That looked right and was wrong for job E: a plain SET
-- is session-local, so the cron worker's session resolves the GUC to NULL,
-- every tick sends no secret, and every tick 401s while cron happily reports
-- the tick as succeeded. That is the G4-j defect that left the monthly close
-- job never delivering.
--
-- THIS generation fixes both, differently:
--
--   * Secret -> Supabase Vault. `vault.create_secret` runs at setup time with
--     the value read from the session GUC (validated, never persisted to
--     pg_settings, never dumped). Job commands then resolve the secret at
--     JOB TIME from `vault.decrypted_secrets` — the view resolves fine inside
--     the worker session. cron.job.command contains only the secret NAME.
--     Rotation: vault.remove_secret + create_secret under the same name, plus
--     a matching DISPATCH_SECRET update in the app env. No rescheduling.
--
--   * URL -> schedule-time literal. The URL is not secret but it IS
--     configuration; the origin literal appears in section 2 (validation) and
--     five times in section 5 (one per job) and is interpolated into job
--     commands at SCHEDULE time via format(). Runtime GUC lookups for the URL
--     would hit the same NULL-worker-session trap the secret had — the
--     prove-it-twice trap to never rebuild.
--
-- ---------------------------------------------------------------------------
-- HOW TO RUN IT
-- ---------------------------------------------------------------------------
-- 1. Requires `supabase_vault` (plus pg_cron/pg_net, enabled below).
-- 2. If the deployment origin changed, replace the origin literal in section
--    2 AND the fourth format() argument under each Job A–E block in section 5.
-- 3. In the same session, before running the file:
--      SET app.cadence.dispatch_secret = '<same value as DISPATCH_SECRET env>';
-- 4. Run the whole file. Reruns are idempotent; an already-seeded vault secret
--    is left untouched and jobs are re-registered with identical commands.
--
-- Verify afterwards with the diagnostic queries in section 6.
-- ---------------------------------------------------------------------------

-- 1. Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 2. Validate configuration BEFORE unscheduling anything. Order matters:
--    a validation failure must abort while the existing schedule is intact.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_url    text := 'https://cadence-task-os.onrender.com/api';
  v_guc    text := current_setting('app.cadence.dispatch_secret', true);
  v_seed_ok boolean := EXISTS (SELECT 1 FROM vault.vault WHERE name = 'cadence_dispatch_secret');
BEGIN
  IF v_url IS NULL OR btrim(v_url) = '' THEN
    RAISE EXCEPTION 'CadenceAppUrl constant is empty.';
  END IF;

  IF v_url LIKE '%<%' OR v_url LIKE '%>%' THEN
    RAISE EXCEPTION 'CadenceAppUrl still contains an angle-bracket placeholder: %', v_url;
  END IF;

  IF v_url !~ '^https?://' THEN
    RAISE EXCEPTION 'CadenceAppUrl must start with http:// or https://, got: %', v_url;
  END IF;

  -- The app mounts its Express router at /api. Without the prefix every job
  -- 404s while still reporting as an active, healthy-looking cron row.
  IF v_url !~ '/api/?$' THEN
    RAISE EXCEPTION
      'CadenceAppUrl must end with the /api path prefix, got: %. The server mounts its router at /api, so a bare origin 404s on every call.', v_url;
  END IF;

  IF NOT v_seed_ok THEN
    IF v_guc IS NULL OR btrim(v_guc) = '' THEN
      RAISE EXCEPTION
        'No vault secret named cadence_dispatch_secret and no app.cadence.dispatch_secret to seed it. Run: SET app.cadence.dispatch_secret = ''<DISPATCH_SECRET value>''; in this session and re-run this file. Nothing has been changed.';
    END IF;

    IF v_guc LIKE '%<%' OR v_guc LIKE '%>%' THEN
      RAISE EXCEPTION 'app.cadence.dispatch_secret still contains an angle-bracket placeholder.';
    END IF;

    IF length(v_guc) < 32 THEN
      RAISE EXCEPTION 'app.cadence.dispatch_secret is only % chars long; too short to be the generated secret (truncated paste?).', length(v_guc);
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Seed the dispatch secret in Supabase Vault (idempotent).
--
-- If a secret with the stable name already exists this block does NOTHING.
-- Rotation must stay a deliberate, separate operation: deleting blind here
-- could orphan every job's auth at once.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_guc text := current_setting('app.cadence.dispatch_secret', true);
BEGIN
  IF EXISTS (SELECT 1 FROM vault.vault WHERE name = 'cadence_dispatch_secret') THEN
    RAISE NOTICE 'vault secret already seeded under cadence_dispatch_secret; leaving it untouched';
  ELSE
    PERFORM vault.create_secret(v_guc, 'cadence_dispatch_secret');
    RAISE NOTICE 'seeded vault secret cadence_dispatch_secret';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Clean up previous versions of Cadence jobs (idempotent setup).
--
-- Every job this file owns is named, plus anything else calling cadence's
-- internal routes, so a rename cannot orphan a stale active job.
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

  FOR j IN SELECT jobname FROM cron.job WHERE jobname LIKE 'cadence-%' LOOP
    PERFORM cron.unschedule(j);
    RAISE NOTICE 'unscheduled unrecognised cadence job: %', j;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Schedule the five jobs.
--
-- Shape contract with scripts/verify-cron-routes.cjs (gate 9): every
-- net.http_post call is written as a format() template whose url clause is a
-- percent-quote placeholder followed by a single-quoted path (the shape the
-- gate's parser regexes on). Keep that shape when editing — a template that
-- hides the path from the parser reverts the gate to a vacuous pass. Do not
-- write the canonical shape in a comment, either: the parser reads
-- comments too.
--
-- URL: interpolated at SCHEDULE time from the origin literal below (a
-- concrete string in the command afterwards; runtime GUC lookups would NULL
-- out in the worker session). Secret: resolved at JOB TIME from the vault by
-- NAME — nothing sensitive lands in cron.job.command.
-- ---------------------------------------------------------------------------

-- Job A: Reminder Dispatch (every 5 minutes)
-- Claims due reminder rows atomically (FOR UPDATE SKIP LOCKED), checks quiet
-- hours / kill switch, sends Telegram messages, logs to reminder_runs.
SELECT cron.schedule(
  'cadence-reminder-dispatch',
  '*/5 * * * *',
  format(
    $job$SELECT net.http_post(
      url := %L || '/internal/dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cadence_dispatch_secret' LIMIT 1)),
      body := '{}'::jsonb
    )$job$,
    'https://cadence-task-os.onrender.com/api'
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
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cadence_dispatch_secret' LIMIT 1)),
      body := '{}'::jsonb
    )$job$,
    'https://cadence-task-os.onrender.com/api'
  )
);

-- Job C: Nightly Source A Memory Extraction (nightly at 02:00 UTC)
-- Pure SQL behavioral arithmetic comparing duration estimates vs actual logged
-- focus time; creates and reinforces memory facts with Rule 9 multipliers.
SELECT cron.schedule(
  'cadence-memory-extraction',
  '0 2 * * *',
  format(
    $job$SELECT net.http_post(
      url := %L || '/internal/memory-extraction',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cadence_dispatch_secret' LIMIT 1)),
      body := '{}'::jsonb
    )$job$,
    'https://cadence-task-os.onrender.com/api'
  )
);

-- Job D: Nightly Recurrence Materialisation (nightly at 01:00 UTC)
-- Route is /internal/recurrence-materialize (a verb). A previous generation
-- targeted /internal/recurrence-materialization, which does not exist.
SELECT cron.schedule(
  'cadence-recurrence-materialize',
  '0 1 * * *',
  format(
    $job$SELECT net.http_post(
      url := %L || '/internal/recurrence-materialize',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cadence_dispatch_secret' LIMIT 1)),
      body := '{}'::jsonb
    )$job$,
    'https://cadence-task-os.onrender.com/api'
  )
);

-- Job E: Monthly Goals Close (1st of month, 00:05 UTC)
-- Seals the elapsed month: computes each goal's final actual, inserts an
-- immutable monthly_goal_snapshots row, marks the goal closed. Idempotent
-- (skips goals that already have a snapshot), so a pg_cron retry cannot
-- duplicate a sealed month. Scheduled in UTC; the handler resolves month
-- boundaries in each user's own timezone.
SELECT cron.schedule(
  'cadence-goals-close-month',
  '5 0 1 * *',
  format(
    $job$SELECT net.http_post(
      url := %L || '/internal/goals/close-month',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cadence_dispatch_secret' LIMIT 1)),
      body := '{}'::jsonb
    )$job$,
    'https://cadence-task-os.onrender.com/api'
  )
);

-- ---------------------------------------------------------------------------
-- 6. Verification & Diagnostic Queries (read-only; safe to paste individually)
-- ---------------------------------------------------------------------------

-- 6a. Active jobs. Expect exactly five rows, all active:
-- SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
--
-- 6b. THE CHECK THAT MATTERS. Any row here is a broken or leaking job:
--     (a) `current_setting` inside a command = the NULL-lookup failure mode;
--     (b) a 64-char hex run = plaintext secret baked back in;
--     (c) an angle bracket = unsubstituted placeholder;
--     (d) no vault lookup = the command cannot authenticate at all.
-- SELECT jobname FROM cron.job
--  WHERE command LIKE '%current_setting%'
--     OR command ~ '[0-9a-f]{64}'
--     OR command LIKE '%<%'
--     OR command NOT LIKE '%cadence_dispatch_secret%';
--
-- 6c. The vault secret exists and resolves (single row expected):
-- SELECT name, length(decrypted_secret) AS secret_len
--   FROM vault.decrypted_secrets WHERE name = 'cadence_dispatch_secret';
--
-- 6d. Do the scheduled paths actually exist as routes? Compare against
--     routes/internal.ts; a mismatch here is a permanent 404.
-- SELECT jobname, schedule, substring(command from '/internal/[a-z/-]+') AS path
--   FROM cron.job WHERE jobname LIKE 'cadence-%';
--
-- 6e. Recent execution history. status is what actually proves a job ran;
--     a job that has never run shows no rows here rather than an error.
-- SELECT jobid, runid, status, return_message, start_time, end_time
-- FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
-- 6f. The HTTP proof. cron's return_message is just pg_net's queue state
--     ("1 row"); the status code and body live in net._http_response. A 200
--     with the endpoint's real JSON is the only acceptable evidence.
-- SELECT id, status_code, created, substring(content from 1 for 120) AS body
-- FROM net._http_response ORDER BY id DESC LIMIT 10;
--
-- 6g. Reminder runs watchdog recency. If this table's newest row is old, the
--     dispatch job is not delivering even though it is active.
-- SELECT id, started_at, finished_at, claimed, sent, failed, note
-- FROM public.reminder_runs ORDER BY started_at DESC LIMIT 10;
--
-- 6h. Reschedule runs history:
-- SELECT id, started_at, finished_at, checked, moved, flagged, proposed, note
-- FROM public.reschedule_runs ORDER BY started_at DESC LIMIT 10;
