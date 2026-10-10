#!/usr/bin/env node
'use strict';

/**
 * verify-live-deployment.cjs -- Live deployment boundary & public/protected endpoint probe.
 *
 * WHAT THIS PROVES (G4-a verification):
 * -------------------------------------
 * AGENTS.md §2, docs/07-module-registry.md §4, and spec/master-verification-matrix.md §3:
 *   - Signed-out request to GET /api/tasks returns 401 Unauthorized.
 *   - Public health check GET /api/healthz returns 200 OK with {"status":"ok","database":"up"}.
 *   - Bare GET /healthz returns 404 (proving only /api/healthz is mounted).
 *   - Every protected API route returns 401 when accessed without Clerk authentication.
 *   - Frontend production deployment returns 200 with valid shell HTML.
 *
 * USAGE:
 *   node scripts/verify-live-deployment.cjs
 *   node scripts/verify-live-deployment.cjs --api-url=http://localhost:5000 --web-url=http://localhost:5173
 */

const DEFAULT_API_URL = process.env.CADENCE_API_URL || 'https://cadence-task-os.onrender.com';
const DEFAULT_WEB_URL = process.env.CADENCE_WEB_URL || 'https://cadence-task-os.vercel.app';

function parseArgs() {
  const args = process.argv.slice(2);
  let apiUrl = DEFAULT_API_URL;
  let webUrl = DEFAULT_WEB_URL;

  for (const arg of args) {
    if (arg.startsWith('--api-url=')) {
      apiUrl = arg.slice('--api-url='.length).replace(/\/$/, '');
    } else if (arg.startsWith('--web-url=')) {
      webUrl = arg.slice('--web-url='.length).replace(/\/$/, '');
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/verify-live-deployment.cjs [--api-url=URL] [--web-url=URL]');
      process.exit(0);
    }
  }

  return { apiUrl, webUrl };
}

async function probeEndpoint(baseUrl, path, expectedStatus, validator = null) {
  const url = `${baseUrl}${path}`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/html, */*',
        'User-Agent': 'Cadence-Live-Verification/1.0',
      },
    });
    const elapsed = Date.now() - start;
    const status = res.status;
    let bodyText = '';
    let bodyJson = null;

    try {
      bodyText = await res.text();
      bodyJson = JSON.parse(bodyText);
    } catch {
      // Body may be HTML or empty
    }

    const statusMatch = status === expectedStatus;
    let contentMatch = true;
    let detail = '';

    if (validator) {
      try {
        const valRes = validator(bodyJson, bodyText);
        if (typeof valRes === 'boolean') {
          contentMatch = valRes;
        } else if (typeof valRes === 'string') {
          contentMatch = false;
          detail = valRes;
        }
      } catch (err) {
        contentMatch = false;
        detail = err.message;
      }
    }

    const pass = statusMatch && contentMatch;
    return {
      path,
      url,
      expectedStatus,
      status,
      elapsed,
      pass,
      detail: detail || (statusMatch ? 'OK' : `Expected HTTP ${expectedStatus}, got ${status}`),
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      path,
      url,
      expectedStatus,
      status: 'ERR',
      elapsed,
      pass: false,
      detail: `Network error: ${err.message}`,
    };
  }
}

async function main() {
  const { apiUrl, webUrl } = parseArgs();

  console.log('');
  console.log('======================================================================');
  console.log('Cadence Live Deployment Verification (G4-a)');
  console.log('======================================================================');
  console.log(`Target API: ${apiUrl}`);
  console.log(`Target Web: ${webUrl}`);
  console.log('----------------------------------------------------------------------');

  const checks = [
    // Health & routing boundaries
    {
      target: 'api',
      path: '/api/healthz',
      status: 200,
      name: 'Public healthz endpoint',
      validator: (json) => {
        if (!json || json.status !== 'ok') return 'Expected {status: "ok"}';
        if (json.database !== 'up') return 'Expected {database: "up"}';
        return true;
      },
    },
    {
      target: 'api',
      path: '/healthz',
      status: 404,
      name: 'Bare /healthz returns 404 (no un-prefixed route)',
      validator: null,
    },
    // Authentication boundaries (all protected routes must fail closed with 401)
    {
      target: 'api',
      path: '/api/tasks',
      status: 401,
      name: 'GET /api/tasks signed-out (G4-a canonical)',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    {
      target: 'api',
      path: '/api/projects',
      status: 401,
      name: 'GET /api/projects signed-out',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    {
      target: 'api',
      path: '/api/goals',
      status: 401,
      name: 'GET /api/goals signed-out',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    {
      target: 'api',
      path: '/api/blocks',
      status: 401,
      name: 'GET /api/blocks signed-out',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    {
      target: 'api',
      path: '/api/focus-sessions',
      status: 401,
      name: 'GET /api/focus-sessions signed-out',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    {
      target: 'api',
      path: '/api/momentum',
      status: 401,
      name: 'GET /api/momentum signed-out',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    {
      target: 'api',
      path: '/api/memory/facts',
      status: 401,
      name: 'GET /api/memory/facts signed-out',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    {
      target: 'api',
      path: '/api/settings/notifications',
      status: 401,
      name: 'GET /api/settings/notifications signed-out',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    {
      target: 'api',
      path: '/api/settings/focus',
      status: 401,
      name: 'GET /api/settings/focus signed-out',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    {
      target: 'api',
      path: '/api/agent/messages',
      status: 401,
      name: 'GET /api/agent/messages signed-out',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    {
      target: 'api',
      path: '/api/tags',
      status: 401,
      name: 'GET /api/tags signed-out',
      validator: (json) => json && json.error === 'Unauthorized',
    },
    // Frontend shell
    {
      target: 'web',
      path: '/',
      status: 200,
      name: 'Frontend landing / shell',
      validator: (_, text) => {
        if (!text || !text.includes('<!DOCTYPE html>')) return 'Missing HTML doctype';
        return true;
      },
    },
    {
      target: 'web',
      path: '/sign-in',
      status: 200,
      name: 'Frontend /sign-in route',
      validator: (_, text) => {
        if (!text || !text.includes('<!DOCTYPE html>')) return 'Missing HTML doctype';
        return true;
      },
    },
  ];

  let failures = 0;

  for (const c of checks) {
    const baseUrl = c.target === 'api' ? apiUrl : webUrl;
    const res = await probeEndpoint(baseUrl, c.path, c.status, c.validator);

    const mark = res.pass ? 'PASS' : 'FAIL';
    const timing = `(${res.elapsed}ms)`;
    console.log(`  ${mark}  [HTTP ${res.status}] ${c.name.padEnd(42)} ${timing}`);
    if (!res.pass) {
      failures++;
      console.log(`        Error: ${res.detail} (URL: ${res.url})`);
    }
  }

  console.log('======================================================================');
  if (failures === 0) {
    console.log('VERIFICATION PASSED: All live deployment and auth boundaries intact.');
    console.log('G4-a is officially SATISFIED on live infrastructure.');
    console.log('======================================================================');
    process.exit(0);
  } else {
    console.error(`VERIFICATION FAILED: ${failures} check(s) did not match specification.`);
    console.log('======================================================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error running live verification:', err);
  process.exit(1);
});
