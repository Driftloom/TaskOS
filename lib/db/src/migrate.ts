import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

/**
 * Migration runner.
 *
 * Why this exists (verified 2026-09-28): `lib/db/migrations/` held 13 hand-run
 * `.sql` files with no ledger, no runner, and no drift detection. Two real
 * defects came out of that: `tasks.completed_at` was read and written by
 * application code for several sessions but was never created by any
 * migration, and nothing recorded which migrations had actually been applied.
 * `drizzle-kit push` is the dev path only; it cannot express ordered,
 * checksummed, production-safe application of ordered SQL.
 *
 * Guarantees:
 *  - Each migration runs inside its own transaction, so a failure leaves the
 *    database on the last good version rather than half-applied.
 *  - A Postgres session advisory lock serialises concurrent runners, so two
 *    instances (or a deploy racing a cron job) cannot both apply 0011.
 *  - Every applied migration is recorded with a SHA-256 checksum. Re-running
 *    fails loudly if a file that was already applied has since been edited,
 *    which is how silent drift gets caught.
 *  - Out-of-order detection: a migration file may not be inserted *before* an
 *    already-applied version.
 *  - Retries the initial connection, because the Supabase pooler drops idle
 *    connections routinely.
 *
 * Usage:
 *   pnpm --filter @workspace/db run migrate            # apply pending
 *   pnpm --filter @workspace/db run migrate -- --status
 *   pnpm --filter @workspace/db run migrate -- --dry-run
 */

const ADVISORY_LOCK_KEY = 8_675_309; // arbitrary but stable, see docs
const LEDGER = "cadence_schema_migrations";
const MIGRATIONS_DIR = join(process.cwd(), "migrations");

export interface Migration {
  version: number;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}

export interface LedgerRow {
  version: number;
  name: string;
  checksum: string;
  applied_at: Date;
  execution_ms: number;
}

export interface Plan {
  applied: LedgerRow[];
  pending: Migration[];
  drifted: Array<{ migration: Migration; recorded: string }>;
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

/** `0011_tasks_completed_at.sql` -> { version: 11, name: 'tasks_completed_at' } */
export function parseFilename(filename: string): { version: number; name: string } {
  const m = /^(\d+)_(.+)\.sql$/.exec(filename);
  if (!m) {
    throw new Error(
      `Migration "${filename}" does not match the required NNN_name.sql format.`,
    );
  }
  return { version: Number(m[1]), name: m[2] };
}

export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => parseFilename(a).version - parseFilename(b).version);

  const seen = new Map<number, string>();
  const out: Migration[] = [];
  for (const filename of files) {
    const { version, name } = parseFilename(filename);
    const clash = seen.get(version);
    if (clash) {
      throw new Error(
        `Duplicate migration version ${version}: "${clash}" and "${filename}".`,
      );
    }
    seen.set(version, filename);
    const sql = readFileSync(join(dir, filename), "utf8");
    out.push({ version, name, filename, sql, checksum: checksum(sql) });
  }
  return out;
}

async function ensureLedger(client: PoolClient): Promise<void> {
  // Created by the runner, not by a migration, so the ledger is guaranteed to
  // exist before version 0001 is considered. Namespaced to avoid colliding
  // with the bare `schema_migrations` that migration 0010 guards on.
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.${LEDGER} (
      version      INTEGER PRIMARY KEY,
      name         TEXT        NOT NULL,
      checksum     TEXT        NOT NULL,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      execution_ms INTEGER     NOT NULL DEFAULT 0
    )
  `);
}

async function readLedger(client: PoolClient): Promise<LedgerRow[]> {
  const res = await client.query<LedgerRow>(
    `SELECT version, name, checksum, applied_at, execution_ms
       FROM public.${LEDGER}
      ORDER BY version`,
  );
  return res.rows;
}

export function buildPlan(migrations: Migration[], applied: LedgerRow[]): Plan {
  const byVersion = new Map(migrations.map((m) => [m.version, m]));
  const drifted: Plan["drifted"] = [];

  for (const row of applied) {
    const m = byVersion.get(row.version);
    if (!m) {
      // Recorded locally as applied but the file is gone. Not fatal on its
      // own (files get archived), but it must not be silently ignored.
      throw new Error(
        `Migration ${String(row.version).padStart(4, "0")} is recorded as applied in ` +
          `${LEDGER} but "${row.name}" no longer exists in the migrations directory. ` +
          `Restore the file or remove the ledger row deliberately.`,
      );
    }
    if (m.checksum !== row.checksum) {
      drifted.push({ migration: m, recorded: row.checksum });
    }
  }

  if (drifted.length > 0) {
    const detail = drifted
      .map(
        (d) =>
          `  ${String(d.migration.version).padStart(4, "0")}_${d.migration.name}\n` +
          `    on disk:   ${d.migration.checksum}\n` +
          `    recorded:  ${d.recorded}`,
      )
      .join("\n");
    throw new Error(
      `Checksum drift detected. A migration that was already applied has been edited:\n${detail}\n` +
        `Editing applied migrations silently diverges environments. Add a new migration instead.`,
    );
  }

  const appliedVersions = new Set(applied.map((r) => r.version));
  const pending = migrations.filter((m) => !appliedVersions.has(m.version));

  const highestApplied = applied.reduce((max, r) => Math.max(max, r.version), -1);
  for (const m of pending) {
    if (m.version < highestApplied) {
      throw new Error(
        `Migration ${String(m.version).padStart(4, "0")}_${m.name} sorts before already-applied ` +
          `version ${highestApplied}. Back-filling an earlier version reorders history; ` +
          `renumber it above ${highestApplied} instead.`,
      );
    }
  }

  return { applied, pending, drifted };
}

async function connect(databaseUrl: string, attempts = 3): Promise<Pool> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl:
        databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
          ? undefined
          : { rejectUnauthorized: false },
      connectionTimeoutMillis: 20_000,
      max: 1,
    });
    try {
      const client = await pool.connect();
      client.release();
      return pool;
    } catch (err) {
      lastError = err;
      await pool.end().catch(() => {});
      if (i < attempts) {
        const wait = 1000 * i;
        process.stderr.write(
          `  connect attempt ${i} failed (${(err as Error).message}); retrying in ${wait}ms\n`,
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(`Could not connect to the database: ${(lastError as Error).message}`);
}

export interface RunOptions {
  dryRun?: boolean;
  logger?: (msg: string) => void;
}

export async function runMigrations(
  databaseUrl: string,
  opts: RunOptions = {},
): Promise<{ applied: number[]; skipped: number[] }> {
  const log = opts.logger ?? ((m: string) => process.stdout.write(`${m}\n`));

  const migrations = loadMigrations();
  const pool = await connect(databaseUrl);
  const client = await pool.connect();
  const appliedNow: number[] = [];
  const skipped: number[] = [];

  try {
    // Session-scoped: released automatically if this process dies mid-run.
    await client.query(`SELECT pg_advisory_lock(${ADVISORY_LOCK_KEY})`);

    await ensureLedger(client);
    const ledger = await readLedger(client);
    const plan = buildPlan(migrations, ledger);

    log(
      `migrations: ${plan.applied.length} applied, ${plan.pending.length} pending ` +
        `(${migrations.length} on disk)`,
    );

    if (plan.pending.length === 0) {
      log("nothing to do; schema is up to date");
      return { applied: [], skipped: [] };
    }

    for (const m of plan.pending) {
      const label = `${String(m.version).padStart(4, "0")}_${m.name}`;
      if (opts.dryRun) {
        log(`  would apply ${label}`);
        continue;
      }
      const started = Date.now();
      try {
        await client.query("BEGIN");
        // Each file is a single logical unit: all of it, or none of it.
        await client.query(m.sql);
        await client.query(
          `INSERT INTO public.${LEDGER} (version, name, checksum, execution_ms)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (version) DO UPDATE
             SET name = EXCLUDED.name,
                 checksum = EXCLUDED.checksum,
                 applied_at = now(),
                 execution_ms = EXCLUDED.execution_ms`,
          [m.version, m.name, m.checksum, Date.now() - started],
        );
        await client.query("COMMIT");
        appliedNow.push(m.version);
        log(`  applied ${label}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        log(`  FAILED  ${label}: ${(err as Error).message}`);
        throw new Error(
          `Migration ${label} failed and was rolled back. The database is still at the ` +
            `last good version (${plan.applied.length} applied). Fix the migration and re-run.\n` +
            `  cause: ${(err as Error).message}`,
        );
      }
    }

    if (opts.dryRun) {
      log("dry run: nothing was written");
    } else {
      log(`done. ${appliedNow.length} migration(s) applied.`);
    }
    return { applied: appliedNow, skipped };
  } finally {
    await client.query(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`).catch(() => {});
    client.release();
    await pool.end().catch(() => {});
  }
}

export async function status(databaseUrl: string): Promise<Plan> {
  const pool = await connect(databaseUrl);
  const client = await pool.connect();
  try {
    await ensureLedger(client);
    return buildPlan(loadMigrations(), await readLedger(client));
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}
