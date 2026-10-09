#!/usr/bin/env node
'use strict';

/**
 * Assert that every `/internal/*` path a cron job CALLS exists as a route.
 *
 * WHY THIS EXISTS
 * ---------------
 * A `pg_cron` job whose URL does not match a route is registered, active, and
 * guaranteed to fail on every tick -- and it is invisible to every check that
 * asks whether the job is scheduled. This repo already contains a live example
 * in its own comments: a previous job targeted
 * `/internal/recurrence-materialization` (a noun) while the route is
 * `/internal/recurrence-materialize` (a verb), so it would 404 nightly and
 * nothing noticed.
 *
 * SCOPE -- why this is narrow, and what it is NOT
 * ----------------------------------------------
 * This reads source files. It proves the cron SQL and the router agree on a
 * path string. It does NOT prove:
 *   - the job has ever executed (confirm in `cron.job_run_details`)
 *   - `app.cadence.api_url` was set, or the host is reachable
 *   - the secret matches
 *   - the handler returns 200
 * A green run here is necessary, not sufficient. It is the cheapest check that
 * catches a whole class of silent failure, so it earns a place -- but a job can
 * pass this gate and still 404 every night, and the output says so.
 *
 * FALSE POSITIVES IT DELIBERATELY AVOIDS
 * ---------------------------------------
 *  1. The cron file also mentions `/internal/recurrence-materialization` in the
 *     STALE-JOB CLEANUP list. That is a job NAME, not a URL; no route is
 *     supposed to match it. Only the `url := %L || '...'` call template counts.
 *  2. `/internal/health` is a watchdog read. It is never scheduled and must not
 *     be, so a served-but-unscheduled route is reported and never failed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CRON_SQL = path.join(ROOT, 'lib', 'db', 'setup_supabase_cron.sql');
const INTERNAL_ROUTES = path.join(ROOT, 'artifacts', 'api-server', 'src', 'routes', 'internal.ts');

/**
 * URLs a scheduled job actually calls: only from a net.http_post call site.
 *
 * The character class is deliberately permissive (`[^']` rather than
 * `[a-z0-9/-]`). A narrower class is a trap: an UPPERCASE typo in a URL
 * (`dispatch-TYPO`) would fail to match, so the URL would silently vanish
 * from the parsed set and the gate would report green on a broken job. A
 * mutation test over both a lower-case typo (`close-mont`) and an upper-case
 * one caught exactly that. Capture everything up to the closing quote so a
 * malformed URL is REPORTED rather than ignored.
 */
function scheduledUrls(sql) {
  const urls = [];
  const callRe = /url\s*:=\s*%L\s*\|\|\s*'([^']+)'/g;
  let m;
  while ((m = callRe.exec(sql)) !== null) {
    const url = m[1].trim();
    // Anything after the mount prefix is treated as a path we must resolve.
    // A path that does not start with /internal cannot match a route and is
    // reported as a failure below, which is the point.
    urls.push(url);
  }
  return [...new Set(urls)].sort();
}

/** Paths the internal router actually serves. */
function servedPaths(ts) {
  const paths = [];
  const routeRe = /router\.(?:post|get)\(\s*"(\/internal[^"]*)"/g;
  let m;
  while ((m = routeRe.exec(ts)) !== null) paths.push(m[1]);
  return [...new Set(paths)].sort();
}

function main() {
  const sql = fs.readFileSync(CRON_SQL, 'utf8');
  const ts = fs.readFileSync(INTERNAL_ROUTES, 'utf8');

  const scheduled = scheduledUrls(sql);
  const served = servedPaths(ts);

  console.log('');
  console.log('Cron route contract  --  every scheduled /internal URL must exist');
  console.log('='.repeat(70));

  let failures = 0;

  console.log('');
  console.log('scheduled job -> served route');
  for (const p of scheduled) {
    const ok = served.includes(p);
    if (!ok) failures++;
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + p);
  }

  if (scheduled.length === 0) {
    console.log('');
    console.log('  FAIL  no scheduled /internal URLs were parsed.');
    console.log('        The matcher stopped recognising the cron template. That is a');
    console.log('        broken gate, not a passing one -- fix it rather than accepting');
    console.log('        a vacuous green that would approve any future typo.');
    failures++;
  }

  const unscheduled = served.filter((p) => !scheduled.includes(p));
  if (unscheduled.length > 0) {
    console.log('');
    console.log('served but not scheduled (expected for watchdogs / manual triggers):');
    for (const p of unscheduled) console.log('  -      ' + p);
  }

  console.log('');
  console.log('='.repeat(70));
  console.log(
    failures === 0
      ? 'PASS  every scheduled job resolves to a real route.'
      : 'FAIL  ' + failures + ' scheduled job(s) target a route that does not exist.',
  );
  console.log('');
  console.log('NOT proven here: that any job has ever run, that the URL host is');
  console.log('reachable, or that the secret matches. A job can pass this gate and');
  console.log('still fail every tick -- confirm via cron.job_run_details (G4-j).');
  console.log('');

  return failures === 0 ? 0 : 1;
}

process.exit(main());