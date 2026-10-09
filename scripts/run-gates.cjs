#!/usr/bin/env node
/**
 * run-gates.cjs -- step-labelled verification gate runner for Cadence.
 *
 * WHY THIS EXISTS
 * ---------------
 * AGENTS.md Appendix A ("Verification") defines the full-green standard as
 * EIGHT distinct gates, but the root "verify" script historically ran only
 * FOUR of them. The documented standard and the automated gate disagreed, so
 * a real regression (e.g. a bad workspace-lib import that breaks the Rollup
 * bundle while `tsc` still passes) would have shipped green. This runner makes
 * the automated gate match the documented one.
 *
 * DESIGN CONSTRAINTS (learned the hard way in this repo -- see AGENTS.md):
 *
 *  1. ASCII-ONLY OUTPUT. This machine's console is codepage 437 and renders
 *     UTF-8 as garbage. A previous incident wasted hours chasing "mojibake"
 *     that was only ever the terminal. Every byte printed here is < 0x80.
 *     Never add em-dashes, arrows, checkmarks, or box-drawing to this file.
 *
 *  2. NO SHELL SYNTAX. No `&&`, no `;`, no `VAR=value cmd` prefixes. This
 *     file is invoked by `node`, so it never touches a shell for gating. The
 *     only shell fallback (see resolvePnpm) spawns with a fixed arg array and
 *     never interpolates user input.
 *
 *  3. CROSS-PLATFORM ENV. Vite THROWS at config-load time without PORT and
 *     BASE_PATH (artifacts/cadence/vite.config.ts:10-14 and :24-28). The
 *     primary dev platform is Linux/Replit, Windows is best-effort, so we
 *     inject the env through the child `env` object -- which works identically
 *     on cmd.exe, PowerShell, and sh. We do NOT use `PORT=1 && vite build`,
 *     which works on sh and breaks on Windows.
 *
 *  4. FAIL LOUD, STOP EARLY. Each gate prints its name before running and its
 *     exit code after. The first non-zero exit stops the run and names the
 *     broken gate, so a human never has to guess which step died.
 *
 *  5. NO EXIT-CODE SWALLOWING. `spawnSync` status is checked explicitly; we
 *     never append `|| true` or chain with `;`.
 *
 * GATE ORDER (matches AGENTS.md:152, and satisfies two ordering constraints):
 *   - `codegen` runs BEFORE both builds, so the builds consume freshly
 *     generated Orval clients rather than stale committed output.
 *   - `tokens:check` runs BEFORE the web build, so a stale generated
 *     stylesheet fails the gate instead of silently shipping.
 *
 * MUTATION NOTE: this is a *verification* command, but two gates legitimately
 * write generated artifacts as a side effect:
 *   - `codegen`    rewrites lib/api-zod/src/generated/ and
 *                  lib/api-client-react/src/generated/ (Orval output).
 *   - `tokens:check` in --check mode does NOT write; it only diffs.
 * Both outputs are generated files, so this is expected. Everything else is
 * read-only. `git status` after a green run should be clean; if it is not,
 * that is a finding, not a normal outcome.
 *
 * USAGE
 *   node scripts/run-gates.cjs          # full 7-gate verify
 *   node scripts/run-gates.cjs --fast   # quick subset (no codegen, no builds)
 *   node scripts/run-gates.cjs --list   # print the gate plan and exit
 *   node scripts/run-gates.cjs --from=build:api   # resume at one gate
 *   node scripts/run-gates.cjs --only=tokens,test # run a specific subset
 *
 * --from / --only exist because a stopped gate tells you which one broke,
 * and re-running the whole ladder to re-check one step is wasteful. Note
 * that a subset run is NOT a substitute for a full run: `--from=build:web`
 * skips codegen, so the web bundle is built from whatever generated clients
 * happen to be on disk.
 *
 * E2E: deliberately NOT part of this gate. See the "E2E" note in
 * artifacts/cadence/tests/e2e/ and the report in docs/. Use `pnpm run
 * verify:e2e` instead, which is opt-in because those specs need a live API +
 * database + browser download.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { acquire: acquireBuildLock } = require('./lib/build-lock.cjs');

const ROOT = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ *
 * Gate definitions
 *
 * `env` entries are DEFAULTS ONLY: an already-set value in the caller's
 * environment always wins, so a developer can point the web build at a
 * specific port without editing this file.
 * ------------------------------------------------------------------ */
const FAST_FLAG = '--fast';
const LIST_FLAG = '--list';
const NO_LOCK_WAIT_FLAG = '--no-lock-wait';

const GATES = [
  {
    id: 'typecheck',
    title: 'TypeScript project build + per-package typecheck',
    // AGENTS.md:151 -- on Windows the shim `tsc` is unreliable; the
    // documented invocation is `node node_modules/typescript/bin/tsc`.
    // typecheck:full already encapsulates that, so we just call the script.
    args: ['run', 'typecheck:full'],
  },
  {
    id: 'tokens',
    title: 'Generated design tokens are not stale (tokens:check)',
    args: ['run', 'tokens:check'],
  },
  {
    id: 'lint:tokens',
    title: 'Design-token lint vs baselined legacy debt (lint:tokens)',
    args: ['run', 'lint:tokens'],
  },
  {
    id: 'contrast',
    title: 'WCAG contrast of the token palette (4.5:1 text, 3:1 controls)',
    // Runs AFTER tokens so it reads the freshly generated palette, and BEFORE
    // the web build so an illegible palette fails here rather than shipping.
    // Before this gate existed, light-mode accent text sat at 3.44:1 and the
    // light control border at 2.99:1 -- both under WCAG 1.4.3 / 1.4.11 -- and
    // nothing in the repo noticed, because no test asserted on contrast.
    args: ['run', 'contrast:check'],
  },
  {
    id: 'codegen',
    title: 'OpenAPI Orval codegen (fresh generated API clients)',
    args: ['--filter', '@workspace/api-spec', 'run', 'codegen'],
    // Printed ONLY when this gate fails. Deliberately not a retry: principle 4
    // is FAIL LOUD and principle 5 is NO EXIT-CODE SWALLOWING, so quietly
    // re-running would hide a real failure behind a green.
    //
    // This gate USED TO carry a "possibly transient, re-run once" hint, because
    // `tsc --build` keeps unlocked incremental state in tsconfig.tsbuildinfo and
    // two builds in one tree interleave into half-written state. That hint was
    // removed once the ladder took an exclusive lock (scripts/lib/build-lock.cjs),
    // which removes the cause. The hint was also harmful independent of the fix:
    // a gate that warns "this might not be real" is a gate people stop reading.
    //
    // So: a red codegen gate here is real. Read the tsc output.
    failureHint:
      'This gate runs `tsc --build` against the generated clients. The ladder holds ' +
      'an exclusive build lock, so a concurrent build is no longer able to corrupt ' +
      'tsconfig.tsbuildinfo mid-run -- treat this failure as real and read the tsc ' +
      'output above. If a build IS running outside this ladder, stop it and re-run.',
  },
  {
    id: 'build:api',
    title: 'API server production build (esbuild bundle)',
    args: ['--filter', '@workspace/api-server', 'run', 'build'],
  },
  {
    id: 'build:web',
    title: 'Web app production build (Vite/Rollup bundle)',
    args: ['--filter', '@workspace/cadence', 'run', 'build'],
    // Vite throws at config load without these. See vite.config.ts:10-14,24-28.
    env: { PORT: '5173', BASE_PATH: '/' },
  },
  {
    // Runs immediately after build:web because it inspects the emitted CSS, and
    // it exists because of a failure mode that every OTHER gate passes: a Tailwind
    // class in source that emits no rule at all. Tailwind v4 resolves
    // min-h-*/max-w-*/min-w-* from the --spacing namespace only, so renaming a
    // literal to a custom token class (`min-h-[40px]` -> `min-h-size-control-md`)
    // silently produces a dead class -- present in markup, doing nothing, letting
    // the property fall back to its default. That shipped across 47 sites before
    // it was caught by grepping the bundle.
    //
    // typecheck cannot see it, lint sees valid syntax, tokens:check only compares
    // generated files, and the build SUCCEEDS. Only the compiled output can tell
    // "class resolves" from "class silently absent".
    id: 'verify:no-dead-classes',
    title: 'No Tailwind class in source emits zero CSS (silent-regression guard)',
    args: ['run', 'verify:no-dead-classes'],
  },
  {
    // Every /internal URL a pg_cron job calls must resolve to a route.
    //
    // This class of failure is silent in the worst way: the job is registered,
    // the row is active, and `SELECT * FROM cron.job WHERE active` reports it
    // healthy, while it 404s on every single tick. This repo already contained a
    // live instance of exactly that in its own comments -- a job targeting
    // `/internal/recurrence-materialization` (a noun) while the route is
    // `/internal/recurrence-materialize` (a verb).
    //
    // `cadence-goals-close-month` was added on 2026-10-09 and had never been
    // observed running, so nothing would have caught a wrong path in it.
    id: 'verify:cron-routes',
    title: 'Every scheduled pg_cron /internal URL resolves to a route',
    args: ['run', 'verify:cron-routes'],
  },
  {
    id: 'encoding',
    title: 'No UTF-8 corruption in tracked source (scan-mojibake)',
    // This is a gate rather than a courtesy because the corruption it detects is
    // invisible to review: PowerShell 5.1 Get-Content/Set-Content default to
    // Windows-1252, so a single round-trip silently rewrites every non-ASCII byte
    // in a BOM-less UTF-8 file. The console on this machine is codepage 437, so
    // `git diff` renders both the clean and the corrupt text as garbage and a
    // reviewer cannot tell them apart by eye. The byte-level check is the only
    // thing that can.
    args: ['run', 'encoding:check'],
  },
  {
    id: 'test',
    title: 'Vitest suites across all workspace packages',
    // Root `test` is `pnpm -r --if-present run test`, so a package without a
    // test script is skipped instead of failing the gate. This is also how
    // the web app gets picked up automatically: once
    // artifacts/cadence/package.json gains a "test" script it is included with
    // no change here. Do NOT replace this with a hard-coded
    // `--filter @workspace/cadence`, which would break that.
    args: ['run', 'test'],
  },
];

// Subset used by `verify:fast`: everything except the three expensive gates
// (codegen + two production bundles). Keeps the old `verify` behaviour.
const FAST_GATE_IDS = [
  'typecheck',
  'tokens',
  'lint:tokens',
  'contrast',
  'verify:cron-routes',
  'encoding',
  'test',
];

/* ------------------------------------------------------------------ *
 * Output helpers -- ASCII ONLY, by contract. See constraint (1).
 * ------------------------------------------------------------------ */
const LINE = '='.repeat(72);
const THIN = '-'.repeat(72);

function out(msg) {
  process.stdout.write(msg + '\n');
}

function fail(msg) {
  process.stderr.write(msg + '\n');
}

/* Greedy word wrap, so a gate's failureHint reads as prose in a terminal rather
 * than as one 400-column line. No em-dashes or box drawing here, per this file's
 * own rule 1. */
function wrap(text, width) {
  const lines = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/* ------------------------------------------------------------------ *
 * pnpm resolution
 *
 * We prefer invoking pnpm's JS entrypoint with the current node binary:
 * that avoids Windows' inability to spawn a bare `.cmd` without a shell,
 * and it is identical on Linux/macOS. Falls back to a PATH scan, then to a
 * plain `pnpm` spawn via the system shell (which is what every package
 * script runner does anyway).
 * ------------------------------------------------------------------ */
function resolvePnpm() {
  // 1. Set by pnpm itself when this file runs via `pnpm run ...`.
  const execPath = process.env.npm_execpath;
  if (execPath && /\.(c|m)?js$/i.test(execPath) && fs.existsSync(execPath)) {
    return { cmd: process.execPath, prefix: [execPath], via: 'npm_execpath' };
  }

  // 2. Scan PATH plus the standard global-install roots.
  const candidates = [];
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    candidates.push(path.join(dir, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'));
    candidates.push(path.join(dir, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'));
  }
  if (process.env.APPDATA) {
    candidates.push(
      path.join(process.env.APPDATA, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'),
    );
  }
  if (process.env.PNPM_HOME) {
    candidates.push(
      path.join(process.env.PNPM_HOME, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'),
    );
  }
  if (process.env.HOME) {
    candidates.push(
      path.join(process.env.HOME, '.local', 'share', 'pnpm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'),
    );
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { cmd: process.execPath, prefix: [candidate], via: 'path-scan' };
    }
  }

  // 3. Last resort: let the system shell resolve `pnpm`. Fixed arg array,
  //    no interpolation, so this is not an injection surface.
  return { cmd: 'pnpm', prefix: [], via: 'shell' };
}

const pnpm = resolvePnpm();

function runGate(gate, index, total) {
  const label = '[' + index + '/' + total + '] ' + gate.id;
  const pad = Math.max(0, 26 - label.length);
  out(LINE);
  out(label + ' '.repeat(pad) + gate.title);
  out('  $ pnpm ' + gate.args.join(' '));
  if (gate.env) {
    const shown = Object.keys(gate.env)
      .map(function (k) { return k + '=' + gate.env[k]; })
      .join(' ');
    out('  env (defaults only, pre-set values win): ' + shown);
  }
  out(THIN);

  const env = Object.assign({}, process.env);
  if (gate.env) {
    for (const key of Object.keys(gate.env)) {
      if (!env[key]) env[key] = gate.env[key];
    }
  }

  const started = Date.now();
  const result = spawnSync(pnpm.cmd, pnpm.prefix.concat(gate.args), {
    cwd: ROOT,
    env: env,
    stdio: 'inherit',
    shell: pnpm.via === 'shell',
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  // A signal death (e.g. SIGINT) reports status === null. Treat that as a
  // failure rather than silently continuing -- swallowing it would let a
  // half-run gate masquerade as a pass.
  if (result.error) {
    out(THIN);
    fail('  GATE FAILED: ' + gate.id);
    fail('  spawn error: ' + result.error.message);
    fail('  (pnpm resolved via: ' + pnpm.via + ')');
    return { code: 1 };
  }
  if (result.signal) {
    out(THIN);
    fail('  GATE FAILED: ' + gate.id + ' (killed by signal ' + result.signal + ')');
    return { code: 1 };
  }

  const code = typeof result.status === 'number' ? result.status : 1;
  out(THIN);
  if (code === 0) {
    out('  PASS  ' + gate.id + '  exit=' + code + '  (' + elapsed + 's)');
  } else {
    fail('  FAIL  ' + gate.id + '  exit=' + code + '  (' + elapsed + 's)');
  }
  return { code: code };
}

function parseFlagValue(argv, name) {
  const hit = argv.filter(function (a) { return a.indexOf(name + '=') === 0; })[0];
  return hit ? hit.slice(name.length + 1) : null;
}

function main() {
  const argv = process.argv.slice(2);
  const fast = argv.indexOf(FAST_FLAG) !== -1;
  const from = parseFlagValue(argv, '--from');
  const only = parseFlagValue(argv, '--only');

  if (argv.indexOf(LIST_FLAG) !== -1) {
    out('Gates in order:');
    for (const gate of GATES) {
      out('  ' + gate.id.padEnd(12) + gate.title);
      out('  ' + ' '.repeat(12) + 'pnpm ' + gate.args.join(' '));
    }
    out('');
    out('verify       = all ' + GATES.length + ' gates');
    out('verify:fast  = ' + FAST_GATE_IDS.length + ' gates: ' + FAST_GATE_IDS.join(', '));
    return 0;
  }

  let gates = fast ? GATES.filter(function (g) { return FAST_GATE_IDS.indexOf(g.id) !== -1; }) : GATES;

  if (only) {
    const wanted = only.split(',').map(function (s) { return s.trim(); });
    const unknown = wanted.filter(function (id) {
      return !GATES.some(function (g) { return g.id === id; });
    });
    if (unknown.length) {
      fail('Unknown gate id(s): ' + unknown.join(', '));
      fail('Valid ids: ' + GATES.map(function (g) { return g.id; }).join(', '));
      return 2;
    }
    gates = GATES.filter(function (g) { return wanted.indexOf(g.id) !== -1; });
  }

  if (from) {
    const idx = GATES.findIndex(function (g) { return g.id === from; });
    if (idx === -1) {
      fail('Unknown gate id: ' + from);
      fail('Valid ids: ' + GATES.map(function (g) { return g.id; }).join(', '));
      return 2;
    }
    gates = gates.filter(function (g) { return GATES.indexOf(g) >= idx; });
  }

  const mode = only ? ('ONLY [' + only + ']') : (from ? ('FROM ' + from) : (fast ? 'FAST' : 'FULL'));
  const subset = gates.length !== GATES.length;

  out(LINE);
  out('Cadence verification gate runner');
  out('mode: ' + mode + '   gates: ' + gates.length + ' of ' + GATES.length);
  if (subset) {
    out('NOTE: this is a SUBSET run and does not satisfy the full-green');
    out('      standard in AGENTS.md. Use it to triage, not to sign off.');
  }
  out('node: ' + process.version + '   platform: ' + process.platform);
  out('pnpm resolved via: ' + pnpm.via);
  out('root: ' + ROOT);

  const startedAt = Date.now();
  const results = [];

  // Serialise against a concurrent ladder BEFORE any gate runs.
  //
  // Two ladders in one tree produce FALSE results, not merely slow ones:
  // `typecheck` and `codegen` both run `tsc --build`, which keeps unlocked
  // incremental state in tsconfig.tsbuildinfo, and `verify:no-dead-classes`
  // reads dist/ while `build:web` may still be writing it. Both gates have been
  // observed red-then-green on a provably unchanged tree. See
  // scripts/lib/build-lock.cjs for the full failure analysis.
  //
  // This replaces the old mitigation, which was a `failureHint` telling the user
  // to re-run before believing a red gate. Documenting the flakiness did not fix
  // it, and it trained the expectation that this ladder is allowed to lie.
  let releaseBuildLock;
  try {
    releaseBuildLock = acquireBuildLock({
      root: ROOT,
      name: 'verify-ladder',
      noWait: argv.indexOf(NO_LOCK_WAIT_FLAG) !== -1,
      onWait: function (msg) {
        out('lock: ' + msg);
      },
    });
  } catch (lockErr) {
    fail('');
    fail('Could not acquire the verification build lock:');
    fail('  ' + lockErr.message);
    fail(LINE);
    return 3;
  }

  try {
    // Iterate the SUBSET, and index against its own length. The original loop
    // walked GATES.length while reading gates[i], so `--fast` (6 of 9) ran off the
    // end of the array, got undefined, and died with "Cannot read properties of
    // undefined (reading 'id')" AFTER reporting every gate as PASS. A crashing
    // runner is the worst possible failure mode for a gate: it hides the pass/fail
    // distinction and, worse, the crash happened on the success path.
    for (let i = 0; i < gates.length; i++) {
      const gate = gates[i];
      const res = runGate(gate, i + 1, gates.length);
      results.push({ id: gate.id, code: res.code });
      if (res.code !== 0) {
        out(LINE);
        fail('');
        fail('VERIFICATION FAILED at gate: ' + gate.id + '  (exit ' + res.code + ')');
        fail('Gates completed before the failure:');
        for (let j = 0; j < results.length; j++) {
          const mark = results[j].code === 0 ? 'pass' : 'FAIL';
          fail('  ' + mark + '  ' + results[j].id);
        }
        fail('Gates NOT reached:');
        for (let j = results.length; j < gates.length; j++) {
          fail('  skip  ' + gates[j].id);
        }
        fail('');
        fail('See the output above the "FAIL" line for the underlying error.');
        if (gate.failureHint) {
          fail('');
          for (const hintLine of wrap(gate.failureHint, 72)) fail('  ' + hintLine);
        }
        fail(LINE);
        return res.code;
      }
    }
  } finally {
    // Release on every exit path, including the early `return res.code` above.
    // A ladder that fails while holding the lock would otherwise block every
    // later run in this tree for the full stale timeout.
    releaseBuildLock();
  }

  const total = ((Date.now() - startedAt) / 1000).toFixed(1);
  out(LINE);
  out(
    'VERIFICATION PASSED: ' +
      gates.length +
      '/' +
      GATES.length +
      ' gates green in ' +
      total +
      's',
  );
  for (let i = 0; i < results.length; i++) {
    out('  pass  ' + results[i].id);
  }
  out('');
  out('Note: codegen rewrites generated Orval output by design. If');
  out('`git status` is dirty afterwards, that is a real finding.');
  out(LINE);
  return 0;
}

process.exit(main());
