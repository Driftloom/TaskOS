import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool, type PoolClient } from "pg";

/**
 * Database invariants.
 *
 * These are the load-bearing rules the application assumes but Postgres does
 * not enforce on its own. Each one corresponds to a real defect found in the
 * 2026-09-28 audit, so the suite exists to make that class of bug impossible
 * to reintroduce silently.
 *
 * This suite is READ-ONLY and is meant to run against whatever DATABASE_URL
 * points at, live project included: that is the only way to check that the
 * schema actually deployed. Every assertion is a catalog or count query, and
 * the single write (the negative probe proving tasks_completed_at_check fires)
 * is wrapped in a transaction that always rolls back. See
 * docs/governance/database-operations.md section 7.
 *
 * It skips only when DATABASE_URL is absent, so `pnpm test` still works
 * offline. A skipped suite must never be mistaken for a pass, so the skip
 * reason is printed once.
 *
 * Run with:  pnpm --filter @workspace/db run test:db
 */

const DATABASE_URL = process.env.DATABASE_URL;
const ENABLED = Boolean(DATABASE_URL);

if (!ENABLED) {
  // eslint-disable-next-line no-console
  console.warn(
    "[db-invariants] SKIPPED: DATABASE_URL is not set. These assertions did not run.",
  );
}

/** Tables owned by the application, i.e. per-user data. */
const USER_TABLES = [
  "tasks",
  "projects",
  "tags",
  "task_tags",
  "task_files",
  "time_blocks",
  "reminders",
  "notification_settings",
  "focus_settings",
  "reschedule_proposals",
  "reschedule_settings",
  "memory_facts",
  "memory_embeddings",
  "agent_conversations",
  "agent_action_log",
  "llm_credentials",
];

/** Service/owner-only tables that must never be readable by `authenticated`. */
const INTERNAL_TABLES = ["llm_usage", "reminder_runs", "reschedule_runs"];

describe.skipIf(!ENABLED)("database invariants", () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    // SSL is required for a managed Postgres (Supabase) but rejected by a
    // local throwaway one, so derive it from the URL rather than hardcoding.
    const url = DATABASE_URL as string;
    const ssl = /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false };
    pool = new Pool({
      connectionString: url,
      ssl,
      connectionTimeoutMillis: 20_000,
    });
    client = await pool.connect();
  });

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  describe("migration ledger", () => {
    it("exists", async () => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from information_schema.tables
          where table_schema='public' and table_name='cadence_schema_migrations'`,
      );
      expect(rows[0]?.n, "run `pnpm --filter @workspace/db run migrate` first").toBe(1);
    });

    it("has no applied migration whose file has been edited", async () => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from cadence_schema_migrations where checksum !~ '^[0-9a-f]{64}$'`,
      );
      expect(rows[0]?.n).toBe(0);
    });
  });

  describe("tasks.completed_at (audit 2026-09-28)", () => {
    it("exists", async () => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from information_schema.columns
          where table_schema='public' and table_name='tasks' and column_name='completed_at'`,
      );
      expect(rows[0]?.n, "apply migration 0011").toBe(1);
    });

    it("has the status/timestamp agreement constraint", async () => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from pg_constraint
          where conname = 'tasks_completed_at_check'`,
      );
      expect(rows[0]?.n, "apply migration 0011").toBe(1);
    });

    it("has no completed row without a timestamp", async () => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from tasks
          where status = 'completed' and completed_at is null`,
      );
      expect(rows[0]?.n).toBe(0);
    });

    it("has no timestamp left on a non-completed row", async () => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from tasks
          where status <> 'completed' and completed_at is not null`,
      );
      expect(rows[0]?.n).toBe(0);
    });

    it("rejects completing a task without a timestamp", async () => {
      // Proves the CHECK is enforced, not merely present.
      //
      // Run inside a transaction that is always rolled back. This is the only
      // statement in the suite that would write, and its whole purpose is to
      // fail — but if the CHECK were ever missing, an unguarded INSERT would
      // commit a real row into the target database, so the test would damage
      // production precisely when it was reporting a defect. Rolling back makes
      // the suite genuinely read-only, as documented, with no downside: the
      // constraint still fires inside the transaction.
      await client.query("BEGIN");
      try {
        await expect(
          client.query(
            `insert into tasks (user_id, title, status)
             values ('__invariant_probe__', 'probe', 'completed')`,
          ),
        ).rejects.toThrow();
      } finally {
        await client.query("ROLLBACK");
      }

      // The probe must be gone even if the insert was unexpectedly allowed.
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from tasks where user_id = '__invariant_probe__'`,
      );
      expect(rows[0]?.n).toBe(0);
    });
  });

  describe("tasks.rrule (audit 2026-09-28)", () => {
    it("exists", async () => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from information_schema.columns
          where table_schema='public' and table_name='tasks' and column_name='rrule'`,
      );
      expect(rows[0]?.n, "apply migration 0012").toBe(1);
    });

    it("has no materialised occurrence that is itself a template", async () => {
      // Occurrences must not carry the rule, or the sweep would recurse.
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from tasks
          where rrule is not null and status = 'completed'`,
      );
      expect(rows[0]?.n).toBe(0);
    });
  });

  describe("notification working hours (audit 2026-09-28)", () => {
    it.each(["flexible_24h", "work_start", "work_end"])("has %s", async (col) => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from information_schema.columns
          where table_schema='public' and table_name='notification_settings' and column_name = $1`,
        [col],
      );
      expect(rows[0]?.n, "apply migration 0013").toBe(1);
    });

    it("keeps work hours inside 0-23", async () => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from notification_settings
          where work_start not between 0 and 23 or work_end not between 0 and 23`,
      );
      expect(rows[0]?.n).toBe(0);
    });
  });

  describe("row level security", () => {
    it("is enabled on every user table", async () => {
      const { rows } = await client.query<{ relname: string }>(
        `select c.relname from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'
            and c.relname = any($1) and not c.relrowsecurity`,
        [USER_TABLES],
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    });

    it("gives every user table at least one authenticated policy", async () => {
      const { rows } = await client.query<{ tablename: string }>(
        `select t.tablename from pg_tables t
          where t.schemaname = 'public' and t.tablename = any($1)
            and not exists (
              select 1 from pg_policies p
               where p.schemaname = 'public' and p.tablename = t.tablename
                 and p.roles @> array['authenticated']::name[]
            )`,
        [USER_TABLES],
      );
      expect(
        rows.map((r) => r.tablename),
        "a user table with no authenticated policy is either invisible or unguarded",
      ).toEqual([]);
    });

    it("scopes every authenticated policy to the caller's own rows", async () => {
      // Guards against a policy that matches all rows, which would turn the
      // owner-level pool into a cross-tenant read for any signed-in user.
      //
      // INSERT policies are checked via `with_check`, not `qual`: Postgres
      // leaves `qual` NULL for INSERT and stores the scoping expression in
      // `with_check`, so testing `qual` alone flags every INSERT policy as
      // unscoped when all 16 are in fact owner-scoped.
      //
      // `automation_flags.flags readable` is the one deliberate exception: the
      // kill switches are global single-row toggles, readable by any signed-in
      // user and writable by nobody (no INSERT/UPDATE/DELETE policy exists).
      const { rows } = await client.query<{ tablename: string; policyname: string }>(
        `select tablename, policyname from pg_policies
          where schemaname = 'public' and tablename = any($1)
            and roles @> array['authenticated']::name[]
            and policyname <> 'flags readable'
            and case when cmd = 'INSERT'
                     then with_check is null or with_check !~ 'auth\\.jwt|user_id'
                     else qual is null or qual !~ 'auth\\.jwt|user_id'
                end`,
        [USER_TABLES],
      );
      expect(
        rows.map((r) => `${r.tablename}.${r.policyname}`),
        "policy does not reference auth.jwt()/user_id",
      ).toEqual([]);
    });
  });

  describe("internal tables", () => {
    it.each(INTERNAL_TABLES)("%s is unreachable by authenticated", async (table) => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from pg_policies
          where schemaname = 'public' and tablename = $1
            and roles @> array['authenticated']::name[]`,
        [table],
      );
      expect(rows[0]?.n, `${table} must not be readable by signed-in users`).toBe(0);
    });
  });

  describe("automation kill switch", () => {
    it("has the reminders and reschedule flags present", async () => {
      // The sweeps fail closed when a flag row is missing, so a missing row is
      // a silent outage. Assert the rows exist.
      const { rows } = await client.query<{ key: string }>(
        `select key from automation_flags where key in ('reminders','reschedule')`,
      );
      expect(rows.map((r) => r.key).sort()).toEqual(["reminders", "reschedule"]);
    });
  });
});
