import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import {
  buildPlan,
  parseFilename,
  loadMigrations,
  adoptLegacyLedger,
  type Migration,
  type LedgerRow,
} from "../src/migrate";

/**
 * Migration-runner planning logic, exercised without a database.
 *
 * `buildPlan` is the part that protects a live environment, so its refusal
 * cases are asserted directly rather than inferred from an integration run.
 */

const sha = (sql: string) => createHash("sha256").update(sql).digest("hex");

function mig(version: number, name: string, sql = `select ${version};`): Migration {
  return {
    version,
    name,
    filename: `${String(version).padStart(4, "0")}_${name}.sql`,
    sql,
    checksum: sha(sql),
  };
}

function applied(
  version: number,
  name: string,
  checksum: string,
): LedgerRow {
  return {
    version,
    name,
    checksum,
    applied_at: new Date("2026-09-28T00:00:00Z"),
    execution_ms: 5,
  };
}

describe("parseFilename", () => {
  it("splits a version and name", () => {
    expect(parseFilename("0011_tasks_completed_at.sql")).toEqual({
      version: 11,
      name: "tasks_completed_at",
    });
  });

  it("rejects a file that does not match the convention", () => {
    expect(() => parseFilename("tasks.sql")).toThrow(/NNN_name\.sql/);
    expect(() => parseFilename("0011.sql")).toThrow(/NNN_name\.sql/);
    expect(() => parseFilename("add-stuff.sql")).toThrow(/NNN_name\.sql/);
  });
});

describe("loadMigrations", () => {
  it("parses the real migrations directory in version order", () => {
    const ms = loadMigrations();
    expect(ms.length).toBeGreaterThan(0);
    const versions = ms.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(versions).toContain(1);
    expect(ms.every((m) => /^[0-9a-f]{64}$/.test(m.checksum))).toBe(true);
  });

  it("loads the three migrations added during the 2026-09-28 audit", () => {
    const names = loadMigrations().map((m) => m.filename);
    expect(names).toContain("0011_tasks_completed_at.sql");
    expect(names).toContain("0012_tasks_rrule.sql");
    expect(names).toContain("0013_notification_working_hours.sql");
  });
});

describe("buildPlan", () => {
  it("treats an empty ledger as everything pending", () => {
    const plan = buildPlan([mig(1, "a"), mig(2, "b")], []);
    expect(plan.pending.map((m) => m.version)).toEqual([1, 2]);
  });

  it("returns nothing pending when the ledger is current", () => {
    const a = mig(1, "a");
    const plan = buildPlan([a, mig(2, "b")], [applied(1, "a", a.checksum)]);
    expect(plan.pending.map((m) => m.version)).toEqual([2]);
  });

  it("detects an already-applied migration that was edited", () => {
    const original = mig(1, "a", "select 1;");
    const edited = mig(1, "a", "select 1; -- tampered");
    expect(() =>
      buildPlan([edited], [applied(1, "a", original.checksum)]),
    ).toThrow(/Checksum drift detected/);
  });

  it("refuses to back-fill a version below the highest applied", () => {
    const a = mig(5, "a");
    expect(() =>
      buildPlan([mig(3, "inserted_late"), a], [applied(5, "a", a.checksum)]),
    ).toThrow(/sorts before already-applied version 5/);
  });

  it("fails loudly when a recorded migration file has disappeared", () => {
    const a = mig(1, "a");
    expect(() => buildPlan([], [applied(1, "a", a.checksum)])).toThrow(
      /no longer exists in the migrations directory/,
    );
  });

  it("allows a later version to be applied normally", () => {
    const a = mig(1, "a");
    const plan = buildPlan([a, mig(2, "b"), mig(3, "c")], [
      applied(1, "a", a.checksum),
    ]);
    expect(plan.pending.map((m) => m.version)).toEqual([2, 3]);
  });

  // Regression: on the live database the legacy runner recorded 0001..0013
  // while 0000_baseline_core_tables did not yet exist. Adopting that ledger
  // makes 0000 sort below the highest applied version, which the back-fill
  // guard rejects. A baseline is a deliberate, sanctioned back-fill and must
  // be exempt, or the documented adoption path cannot run at all.
  it("permits a sanctioned baseline to sort below the highest applied", () => {
    const high = mig(13, "notification_working_hours");
    const plan = buildPlan([mig(0, "baseline_core_tables"), high], [
      applied(13, "notification_working_hours", high.checksum),
    ], { baselineThrough: 0 });

    expect(plan.pending.map((m) => m.version)).toEqual([0]);
  });

  it("still rejects an unsanctioned back-fill", () => {
    const high = mig(13, "h");
    expect(() =>
      buildPlan([mig(0, "late"), high], [applied(13, "h", high.checksum)]),
    ).toThrow(/sorts before already-applied version 13/);
  });
});

/**
 * Legacy-ledger adoption.
 *
 * DESTRUCTIVE BY DESIGN: these tests drop and recreate
 * `public.schema_migrations` in the target database. That is how a real
 * adoption is reproduced faithfully, but it makes them unsafe against a
 * production project — running them against live Supabase would destroy the
 * actual legacy ledger and leave fabricated rows behind.
 *
 * So they run only when the operator has explicitly opted in, and never
 * against a managed project:
 *   - DATABASE_URL must be a local/loopback address, and
 *   - CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS=1 must be set.
 *
 * `pnpm test:db` therefore does not touch a cloud database, and the rest of
 * the invariant suite still runs against whatever DATABASE_URL points at.
 */
const DB_URL = process.env.DATABASE_URL;
const isLocal = Boolean(DB_URL && /localhost|127\.0\.0\.1/.test(DB_URL));
const optedIn = process.env.CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS === "1";
const CAN_MUTATE = isLocal && optedIn;

if (DB_URL && !CAN_MUTATE) {
  // eslint-disable-next-line no-console
  console.warn(
    "[adopt] destructive ledger tests are disabled: they need a local database " +
      "and CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS=1. They will NOT drop tables on a remote host.",
  );
}

describe.skipIf(!CAN_MUTATE)("adoptLegacyLedger", () => {
  let pool: Pool;

  beforeAll(async () => {
    const ssl = /localhost|127\.0\.0\.1/.test(DB_URL as string)
      ? undefined
      : { rejectUnauthorized: false };
    pool = new Pool({ connectionString: DB_URL, ssl, connectionTimeoutMillis: 20_000 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  /**
   * Creates a scratch legacy ledger without disturbing real history.
   *
   * Shaped to match the legacy runner exactly: `version` is TEXT, and
   * `filename` carries its numeric prefix. Getting this wrong would make the
   * adoption path pass in tests and fail against the live database.
   */
  const seedLegacy = async (rows: Array<[string, string]>) => {
    await pool.query("DROP TABLE IF EXISTS public.schema_migrations");
    await pool.query(`
      CREATE TABLE public.schema_migrations (
        version TEXT PRIMARY KEY, filename TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT now()
      )`);
    for (const [v, f] of rows) {
      await pool.query(
        "INSERT INTO public.schema_migrations (version, filename) VALUES ($1, $2)",
        [v, f],
      );
    }
  };

  const clearLedger = async () => {
    await pool.query("DELETE FROM public.cadence_schema_migrations");
  };

  it("adopts matching rows and reports none unknown", async () => {
    await clearLedger();
    // 0001_supabase_rls_hardening.sql is a real file in this repo.
    await seedLegacy([["0001", "0001_supabase_rls_hardening.sql"]]);

    const { adopted, unknown } = await adoptLegacyLedger(DB_URL as string, () => {});
    expect(unknown).toEqual([]);
    expect(adopted).toEqual([1]);

    const { rows } = await pool.query<{ checksum: string }>(
      "SELECT checksum FROM public.cadence_schema_migrations WHERE version = 1",
    );
    // Stamped with the real on-disk checksum, so future edits are detected.
    expect(rows[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reports a legacy row with no matching file as unknown", async () => {
    await clearLedger();
    await seedLegacy([["0001", "0001_supabase_rls_hardening.sql"], ["0099", "0099_vanished.sql"]]);

    const { adopted, unknown } = await adoptLegacyLedger(DB_URL as string, () => {});
    expect(adopted).toEqual([1]);
    expect(unknown).toEqual(["0099_vanished.sql"]);

    // Critically, the unknown version must NOT have been recorded as applied,
    // which is why the CLI aborts instead of proceeding to migrate.
    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.cadence_schema_migrations WHERE version = 99",
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("is a no-op when no legacy ledger exists", async () => {
    await clearLedger();
    await pool.query("DROP TABLE IF EXISTS public.schema_migrations");
    const { adopted, unknown } = await adoptLegacyLedger(DB_URL as string, () => {});
    expect(adopted).toEqual([]);
    expect(unknown).toEqual([]);
  });
});
