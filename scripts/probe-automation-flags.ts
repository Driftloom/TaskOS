// Live probe: confirm the new /api/automation/flags contract against the real DB.
// READ ONLY — performs no writes. Run from the repo root:
//   node --experimental-strip-types scripts/probe-automation-flags.ts
import { Client } from "pg";

const ALLOWED = ["reminders", "reschedule"] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("  SKIPPED: DATABASE_URL is not set");
    return;
  }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  await client.connect();

  const who = await client.query("select current_user as u, current_database() as d");
  console.log("  connected as:", who.rows[0].u, "| db:", who.rows[0].d);

  const rows = await client.query("select key, enabled, updated_at from automation_flags order by key");
  console.log("  automation_flags rows:", rows.rowCount);
  for (const r of rows.rows) {
    console.log(
      `    key=${r.key} enabled=${r.enabled} updated_at=${r.updated_at ? new Date(r.updated_at).toISOString() : "null"}`,
    );
  }

  // Mirrors the GET handler's derived `paused` flag.
  const paused = rows.rows.some((f: { enabled: boolean }) => !f.enabled);
  console.log("  derived paused:", paused);

  const present = rows.rows.map((r: { key: string }) => r.key);
  console.log(
    "  whitelisted keys present :",
    ALLOWED.filter((k) => present.includes(k)).join(", ") || "NONE",
  );
  console.log(
    "  non-whitelisted present  :",
    present.filter((k) => !(ALLOWED as readonly string[]).includes(k)).join(", ") || "none",
  );

  // The write path upserts on (key). Confirm the PK exists.
  const idx = await client.query(`select indexdef from pg_indexes where tablename = 'automation_flags'`);
  console.log("  indexes:", idx.rows.map((r: { indexdef: string }) => r.indexdef.split(" USING ")[0]).join(" | "));

  // Confirm the RLS posture the security note in automation.ts depends on.
  const pol = await client.query(
    `select policyname, cmd, roles::text as roles from pg_policies where tablename = 'automation_flags'`,
  );
  console.log("  RLS policies on automation_flags:");
  if (pol.rowCount === 0) console.log("    (none)");
  for (const p of pol.rows) console.log(`    ${p.policyname} cmd=${p.cmd} roles=${p.roles}`);

  const rls = await client.query(
    `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'automation_flags'`,
  );
  console.log("  RLS enabled:", rls.rows[0]?.relrowsecurity, "| forced:", rls.rows[0]?.relforcerowsecurity);

  await client.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("  PROBE FAILED:", e.message);
    process.exit(1);
  });
