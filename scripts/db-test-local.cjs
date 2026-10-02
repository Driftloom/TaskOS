// Bring up a throwaway Postgres and run the destructive database suite for real.
//
// Why this exists: `lib/db/tests/migrate.test.ts` has a suite that DROPs and
// RECREATEs `public.schema_migrations` to reproduce a real legacy-ledger
// adoption. It is the only way to prove the migration chain and the ledger
// adoption still work, and it had never been executed because standing one up
// by hand is six steps and easy to get wrong. Worst of all, the six steps
// include setting DATABASE_URL -- and the repo-root `.env` points at LIVE
// Supabase, so a mistyped variable means running table drops against production.
//
// So this script generates a throwaway password, keeps the URL entirely in
// memory (never written to a file, never printed), applies the Supabase shim,
// migrates, runs the suite, and tears the container down.
//
// Runs on plain Node with no dependencies so it works on every OS.
// Full documentation: docs/governance/database-operations.md
"use strict";

const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const CONTAINER = process.env.CADENCE_DB_CONTAINER ?? "cadence-mig-test";
const PORT = Number(process.env.CADENCE_DB_PORT ?? 55432);
const IMAGE = process.env.CADENCE_DB_IMAGE ?? "postgres:16-alpine";
const KEEP = process.argv.includes("--keep");

/** Loopback only. A non-loopback host is refused before anything is created. */
const LOCAL_URL = `postgresql://postgres:${"@placeholder"}@127.0.0.1:${PORT}/postgres`;

/**
 * Fails closed if this script is ever pointed somewhere that is not loopback.
 * The host is a literal here, so this is a tripwire against someone editing the
 * URL template above to target a real project.
 */
function assertLoopback(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error(`refusing: could not parse the target URL (host unresolved).`);
    process.exit(1);
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error(`refusing: target host "${host}" is not loopback.`);
    process.exit(1);
  }
}

/**
 * pnpm is a shell shim: PowerShell resolves `pnpm.ps1`, but a spawned process
 * cannot execute that. On Windows the real entry point is `pnpm.cmd`, which in
 * turn needs a shell (Node refuses to spawn .cmd/.bat without one).
 */
const PNPM = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function pnpmRun(args, env) {
  sh(PNPM, args, {
    env,
    cwd: root,
    shell: process.platform === "win32",
  });
}

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", ...opts });

const capture = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function dockerAvailable() {
  try {
    capture("docker", ["info", "--format", "{{.ServerVersion}}"]);
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (!dockerAvailable()) {
    console.error(
      "Docker is not running. Start Docker Desktop (or your Docker daemon) and retry.",
    );
    process.exit(1);
  }

  // Generated per run so a stale container password can never be reused.
  const password = crypto.randomBytes(18).toString("base64url");
  const url = LOCAL_URL.replace("@placeholder", password);
  assertLoopback(url);

  // Never print the URL. Report only that it is loopback.
  console.log(`image:  ${IMAGE}`);
  console.log(`target: 127.0.0.1:${PORT} (loopback, throwaway)`);

  // Remove any leftover container from an interrupted run.
  try {
    capture("docker", ["rm", "-f", CONTAINER]);
  } catch {
    // Nothing to remove.
  }

  sh("docker", [
    "run", "-d", "--rm", "--name", CONTAINER,
    "-e", `POSTGRES_PASSWORD=${password}`,
    "-e", "POSTGRES_DB=postgres",
    "-p", `${PORT}:5432`,
    IMAGE,
  ]);

  let exitCode = 0;
  try {
    // Readiness: pg_isready succeeds before the server accepts real connections.
    process.stdout.write("waiting for postgres");
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        capture("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"]);
        break;
      } catch {
        if (Date.now() > deadline) {
          throw new Error("postgres did not become ready within 60s");
        }
        process.stdout.write(".");
        sleepMs(1000);
      }
    }
    process.stdout.write(" ready\n");

    console.log(`\nversion: ${capture("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-tAc", "select version();"]).trim()}\n`);

    // The migrations are Supabase-specific (auth.jwt(), anon/authenticated/
    // service_role roles), so the shim supplies that surface first.
    console.log("applying lib/db/test/supabase-shim.sql ...");
    sh("docker", ["cp", path.join(root, "lib", "db", "test", "supabase-shim.sql"), `${CONTAINER}:/tmp/supabase-shim.sql`]);
    sh("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "/tmp/supabase-shim.sql"]);

    const env = { ...process.env, DATABASE_URL: url, CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS: "1" };

    console.log("\napplying all migrations from empty ...");
    pnpmRun(["--filter", "@workspace/db", "run", "migrate"], env);

    console.log("\nrunning the destructive suite ...");
    pnpmRun(["--filter", "@workspace/db", "run", "test"], env);
  } catch (err) {
    console.error(`\nFAILED: ${err.message}`);
    exitCode = 1;
  } finally {
    if (KEEP) {
      console.log(`\ncontainer kept: ${CONTAINER} (DATABASE_URL is intentionally not recoverable)`);
    } else {
      try {
        capture("docker", ["rm", "-f", CONTAINER]);
        console.log("\ncontainer removed");
      } catch {
        console.log(`\ncould not remove container ${CONTAINER}; remove it manually.`);
      }
    }
  }

  process.exit(exitCode);
}

/**
 * Blocking sleep without pulling in a dependency or burning CPU.
 * Atomics.wait parks the thread instead of spinning.
 */
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

main();