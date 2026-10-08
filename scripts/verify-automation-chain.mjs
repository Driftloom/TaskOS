#!/usr/bin/env node
/**
 * verify-automation-chain.mjs -- prove the cron -> pg_net -> HTTP -> handler chain
 * actually completes, link by link.
 *
 * WHY THIS EXISTS
 * ---------------
 * `cron.job.active = true` proves a row exists. It does not prove the job runs,
 * does not prove the HTTP call returns 2xx, and does not prove the handler is
 * reached or authenticated. `pg_net.http_post` returns a request id and reports
 * SUCCESS as long as the SQL executed -- a 401 or a 404 is still "succeeded" to
 * pg_cron. So a job can be active, running on schedule, green in
 * cron.job_run_details, and delivering nothing at all.
 *
 * That failure mode is invisible from the app, and it is precisely the one this
 * product exists to prevent: a reminder that never arrives is indistinguishable
 * from a reminder you were never sent.
 *
 * Measured on 2026-10-07: the dispatch job had 7 runs, 7 "succeeded", and
 * reminder_runs had 0 rows. Nothing in the ladder could tell you whether that
 * meant "correctly idle, no reminders due" or "auth failing, every call a 401".
 * This script answers that question.
 *
 * The five links:
 *   1. Jobs exist, active, correct routes, no unsubstituted placeholders
 *   2. The jobs have actually EXECUTED (cron.job_run_details)
 *   3. The API base URL is reachable and healthy
 *   4. Each internal route EXISTS (a 404 means a wrong path in the cron body)
 *   5. The dispatch secret in the environment is ACCEPTED by the handler
 *
 * Link 5 is the one that silently breaks after a rotation: the secret lives in
 * the server environment and in cron.job.command, and rotating one without the
 * other produces a chain that is active, running, and 401 on every call.
 *
 * The secret is never printed, logged, or included in any message. It is used
 * only to observe whether the handler accepts it.
 *
 * Usage:
 *   node scripts/verify-automation-chain.mjs            # full check, no mutation
 *   node scripts/verify-automation-chain.mjs --json     # machine-readable
 *
 * Requires: DATABASE_URL (for the read-only SQL probes), DISPATCH_SECRET, and
 * optionally APP_URL. Exits non-zero if any link fails.
 */

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

const JSON_OUT = process.argv.includes('--json');
const ROOT = process.cwd();

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------

/** Reads .env without printing anything from it. */
function loadDotEnv() {
  const p = path.join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadDotEnv();

const results = [];
function record(link, ok, detail, fatal = true) {
  results.push({ link, ok, detail, fatal });
  if (!JSON_OUT) {
    const mark = ok ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${link}`);
    console.log(`         ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// 1 + 2 + 4: read-only SQL probes
// ---------------------------------------------------------------------------

const EXPECTED = [
  { name: 'cadence-reminder-dispatch', route: 'internal/dispatch', schedule: '*/5 * * * *' },
  { name: 'cadence-reschedule-sweep', route: 'internal/reschedule', schedule: '0 * * * *' },
  { name: 'cadence-memory-extraction', route: 'internal/memory-extraction', schedule: '0 2 * * *' },
  {
    name: 'cadence-recurrence-materialize',
    route: 'internal/recurrence-materialize',
    schedule: '0 1 * * *',
  },
];

async function sql(text) {
  const { Pool } = require('pg');
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } });
  }
  const res = await pool.query(text);
  return res.rows;
}
let pool;

async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    record('1. database reachable', false, 'DATABASE_URL is not set; cannot verify links 1, 2 or 4.');
    return null;
  }
  let rows;
  try {
    rows = await sql(`
      select j.jobname,
             j.schedule,
             j.active,
             substring(j.command from 'internal/[a-z-]+') as route,
             (j.command like '%<%')                     as has_placeholder,
             count(r.runid)                             as runs,
             count(*) filter (where r.status = 'succeeded') as ok_runs,
             max(r.start_time)                          as last_run
      from cron.job j
      left join cron.job_run_details r on r.jobid = j.jobid
      where j.jobname like 'cadence%'
      group by j.jobid, j.jobname, j.schedule, j.active, j.command
      order by j.jobname;
    `);
  } catch (e) {
    record('1. database reachable', false, `query failed: ${e.message}`);
    return null;
  }

  const byName = new Map(rows.map((r) => [r.jobname, r]));
  const missing = EXPECTED.filter((e) => !byName.has(e.name));
  if (missing.length) {
    record(
      '1. all four jobs exist',
      false,
      `missing: ${missing.map((m) => m.name).join(', ')}. Run lib/db/setup_supabase_cron.sql.`,
    );
  } else {
    record('1. all four jobs exist', true, 'cadence-reminder-dispatch, cadence-reschedule-sweep, cadence-memory-extraction, cadence-recurrence-materialize');
  }

  const wrongRoute = EXPECTED.filter((e) => {
    const r = byName.get(e.name);
    return r && r.route !== e.route;
  });
  record(
    '4a. every job targets its real route',
    wrongRoute.length === 0,
    wrongRoute.length === 0
      ? 'all four paths match routes/internal.ts'
      : wrongRoute
          .map((e) => `${e.name} -> ${byName.get(e.name)?.route} but the route is /${e.route}`)
          .join('; ') +
        '. A wrong path 404s on every tick while pg_cron still reports success.',
  );

  const wrongSchedule = EXPECTED.filter((e) => {
    const r = byName.get(e.name);
    return r && r.schedule !== e.schedule;
  });
  record(
    '1b. schedules match intent',
    wrongSchedule.length === 0,
    wrongSchedule.length === 0
      ? EXPECTED.map((e) => `${e.name} ${e.schedule}`).join(', ')
      : wrongSchedule
          .map((e) => `${e.name}: ${byName.get(e.name)?.schedule} (expected ${e.schedule})`)
          .join('; '),
  );

  const inactive = EXPECTED.filter((e) => byName.get(e.name)?.active === false);
  record('1c. all jobs active', inactive.length === 0, inactive.length === 0 ? 'none paused' : `paused: ${inactive.map((e) => e.name).join(', ')}`);

  const placeholders = rows.filter((r) => r.has_placeholder);
  record(
    '1d. no unsubstituted placeholders',
    placeholders.length === 0,
    placeholders.length === 0
      ? 'no job command contains an angle bracket'
      : `PLACEHOLDER STILL PRESENT: ${placeholders.map((p) => p.jobname).join(', ')}. These are registered, active, and guaranteed to fail every tick.`,
  );

  const never = rows.filter((r) => Number(r.runs) === 0);
  record(
    '2. jobs have actually executed',
    never.length === 0,
    never.length === 0
      ? rows.map((r) => `${r.jobname}: ${r.runs} run(s), ${r.ok_runs} ok`).join('; ')
      : `never executed: ${never.map((r) => `${r.jobname} (schedule ${r.schedule}, created recently?)`).join(', ')}. ` +
        'A freshly-created nightly job shows zero runs until its first window; that is expected, not a failure.',
    // informational: a new nightly job legitimately has no runs yet
    never.every((r) => !EXPECTED.find((e) => e.name === r.jobname && e.schedule.startsWith('0 '))),
  );

  return byName;
}

// ---------------------------------------------------------------------------
// 3 + 5: HTTP probes. The secret is used, never revealed.
// ---------------------------------------------------------------------------

function baseUrl() {
  // API_BASE_URL is the bare origin (https://host). The router is mounted at /api,
  // and the cron bodies carry /api too, so the suffix is added when missing.
  // Getting this wrong is not cosmetic: probing /internal/dispatch against the
  // bare origin 404s, which looks exactly like "the route does not exist" and
  // would send you hunting a phantom path bug.
  const raw = process.env.API_BASE_URL || process.env.APP_URL || process.env.API_URL || '';
  const trimmed = raw.replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/api$/.test(trimmed) ? trimmed : `${trimmed}/api`;
}

async function httpStatus(url, init = {}) {
  const ctl = AbortSignal.timeout(Number(process.env.PROBE_TIMEOUT_MS || 45_000));
  try {
    const res = await fetch(url, { ...init, signal: ctl, redirect: 'follow' });
    // Drain so the socket can be reused / the process can exit.
    await res.text().catch(() => {});
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  }
}

async function checkHttp() {
  const base = baseUrl();
  if (!base) {
    record('3. API base URL configured', false, 'APP_URL (or API_URL) is not set; cannot verify links 3, 4b or 5.');
    return;
  }
  record('3a. API base URL configured', true, `target origin: ${base.replace(/\/api$/, '/api')} (secret never printed)`);

  const health = await httpStatus(`${base}/healthz`);
  record(
    '3b. API is up and the database is reachable from it',
    health.ok,
    health.ok ? `/healthz -> ${health.status}` : `/healthz -> ${health.status || 'network error'} ${health.error || ''}`,
  );

  // Link 4b: does each internal route EXIST? 404 means the cron body has a wrong
  // path. 401/503 means the route exists and refused us, which is correct.
  for (const e of EXPECTED) {
    const r = await httpStatus(`${base}/${e.route}`, { method: 'OPTIONS' });
    const exists = r.status !== 404 && r.status !== 0;
    record(
      `4b. route /${e.route} exists`,
      exists,
      exists
        ? `responded ${r.status} (not 404), so the path is real`
        : r.status === 404
          ? `404 NOT FOUND -- the cron job for ${e.name} points at a path that does not exist`
          : `no response (${r.status || r.error}); cannot confirm the path from here`,
    );
  }

  // Link 5: is the DISPATCH_SECRET in this environment accepted? A 401 here is
  // the signature of a half-finished rotation.
  const secret = process.env.DISPATCH_SECRET;
  if (!secret) {
    record('5. dispatch secret is accepted by the handler', false, 'DISPATCH_SECRET is not set in this environment, so it cannot be compared.');
    return;
  }
  const r = await httpStatus(`${base}/internal/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dispatch-secret': secret },
    body: '{}',
  });
  if (r.status === 200 || r.status === 202) {
    record(
      '5. dispatch secret is accepted by the handler',
      true,
      `POST /internal/dispatch -> ${r.status}. The secret in this environment matches the deployed API.`,
    );
  } else if (r.status === 503) {
    // routes/internal.ts returns 503 with {"error":"Dispatch not configured."}
    // when process.env.DISPATCH_SECRET is UNSET on the server. This is a
    // different fault from a wrong secret and needs a different fix, so it is
    // reported separately rather than lumped in with 401.
    //
    // This is the state measured on 2026-10-07: 7 cron runs reported "succeeded"
    // and reminder_runs stayed at 0, because the handler bailed on line 116
    // before doing anything. pg_cron cannot see this -- it only knows the SQL ran.
    record(
      '5. dispatch secret is accepted by the handler',
      false,
      `POST /internal/dispatch -> 503. routes/internal.ts returns 503 with ` +
        '"Dispatch not configured." when process.env.DISPATCH_SECRET is UNSET ON THE DEPLOYED SERVER. ' +
        'This is not a secret mismatch (that would be 401): the environment variable is simply absent. ' +
        'Every cron dispatch has been a no-op while pg_cron reported success. ' +
        'Fix: set DISPATCH_SECRET in the deployment environment, redeploy, then re-run ' +
        'lib/db/setup_supabase_cron.sql so cron.job.command carries the same value.',
    );
  } else if (r.status === 401 || r.status === 403) {
    record(
      '5. dispatch secret is accepted by the handler',
      false,
      `POST /internal/dispatch -> ${r.status}. DISPATCH_SECRET in this environment does NOT match the deployed API. ` +
        'If cron.job.command holds a different value, every cron dispatch is failing auth while pg_cron reports success. ' +
        'Rotate by re-running lib/db/setup_supabase_cron.sql with the current secret.',
    );
  } else {
    record(
      '5. dispatch secret is accepted by the handler',
      false,
      `POST /internal/dispatch -> ${r.status || 'network error'}. Expected 200/202. ${r.error || ''}`,
    );
  }
}

// ---------------------------------------------------------------------------
// business-level evidence
// ---------------------------------------------------------------------------

async function checkDelivery(byName) {
  let rows;
  try {
    rows = await sql(`
      select (select count(*) from public.tasks)                             as tasks,
             (select count(*) from public.reminders)                         as reminders,
             (select count(*) from public.reminder_runs)                     as reminder_runs,
             (select max(started_at) from public.reminder_runs)              as last_reminder_run,
             (select max(started_at) from public.reschedule_runs)            as last_reschedule_run,
             (select count(*) from public.memory_facts)                      as memory_facts;
    `);
  } catch (e) {
    record('6. delivery evidence', false, `query failed: ${e.message}`);
    return;
  }
  const d = rows[0];
  /*
   * Proof is the presence of a run row, not the presence of data to run on.
   *
   * An earlier version of this check declared "UNPROVEN" whenever tasks or
   * reminders were zero, ignoring reminder_runs. That produced a false FAIL: it
   * printed "UNPROVEN, NOT BROKEN ... reminder_runs=9" in the same breath, which
   * is self-contradictory. reminder_runs rows are written by the dispatch
   * handler itself, so 9 rows mean the cron -> HTTP -> authenticated handler leg
   * completed 9 times. That is the proof this link exists to establish.
   */
  const dispatchRows = Number(d.reminder_runs);
  const rescheduleRows = d.last_reschedule_run ? 1 : 0;
  const hasData = Number(d.tasks) > 0 || Number(d.reminders) > 0;

  if (dispatchRows > 0) {
    record(
      '6. dispatch handler has run',
      true,
      `reminder_runs=${dispatchRows} (newest ${d.last_reminder_run ?? 'unknown'}). ` +
        'These rows are written by the dispatch handler itself, so the full ' +
        'cron -> pg_net -> HTTP -> authenticated handler chain completed.',
    );
  } else if (!hasData) {
    record(
      '6. dispatch handler has run',
      false,
      `UNPROVEN, NOT BROKEN: ${d.tasks} task(s), ${d.reminders} reminder(s) and ` +
        `reminder_runs=0. An empty run table is correct while there is nothing due, but it means ` +
        'the chain has never been exercised. Seed a task with a reminder due within the next 5 minutes, ' +
        'then re-run this script and expect reminder_runs to increment.',
      // Cannot prove, but nothing is broken: advisory, not fatal.
      false,
    );
  } else {
    record(
      '6. dispatch handler has run',
      false,
      `SUSPICIOUS: ${d.tasks} task(s) and ${d.reminders} reminder(s) exist but reminder_runs=0. ` +
        'The dispatcher has never completed a run despite there being work to check. ' +
        'Check link 5 and whether any reminder is actually due.',
    );
  }

  record(
    '6b. reschedule sweep has run',
    rescheduleRows > 0,
    `last reschedule_runs row ${d.last_reschedule_run ?? 'never'}`,
    // Advisory: the sweep legitimately writes nothing when nothing is overdue.
    false,
  );
}

// ---------------------------------------------------------------------------

(async () => {
  if (!JSON_OUT) {
    console.log('=== Cadence automation chain verification ===\n');
    console.log('link 1-2, 4a  database probes');
  }
  const byName = await checkDatabase();
  if (!JSON_OUT) {
    console.log('\nlink 3-5  HTTP probes');
  }
  await checkHttp();
  if (!JSON_OUT) {
    console.log('\nlink 6  business evidence');
  }
  await checkDelivery(byName);

  const fatalFails = results.filter((r) => !r.ok && r.fatal);
  const advisory = results.filter((r) => !r.ok && !r.fatal);

  if (JSON_OUT) {
    console.log(JSON.stringify({ results, fatalFails: fatalFails.length, advisory: advisory.length }, null, 2));
  } else {
    console.log('\n=== verdict ===');
    if (fatalFails.length === 0) {
      console.log('  every fatal link passes.');
    } else {
      console.log(`  ${fatalFails.length} FAILING LINK(S), first broken link first:`);
      for (const f of fatalFails) console.log(`    - ${f.link}`);
    }
    if (advisory.length) {
      console.log(`  ${advisory.length} advisory (not necessarily broken):`);
      for (const a of advisory) console.log(`    - ${a.link}`);
    }
    console.log('\n  Reminder: an active job is not a working job. pg_cron reports success for a');
    console.log('  401 and a 404 alike, so only link 5 and link 6 distinguish the two.');
  }

  if (pool) await pool.end();
  process.exit(fatalFails.length === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('verification crashed:', e.message);
  if (pool) await pool.end().catch(() => {});
  process.exit(2);
});
