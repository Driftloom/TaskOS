#!/usr/bin/env node
/**
 * CLI for the migration runner.
 *
 *   node --experimental-strip-types src/migrate-cli.ts            apply pending
 *   node --experimental-strip-types src/migrate-cli.ts --status    show plan
 *   node --experimental-strip-types src/migrate-cli.ts --dry-run   show plan, write nothing
 */
import { runMigrations, status, adoptLegacyLedger } from "./migrate.ts";

const REQUIRED_ENV = ["DATABASE_URL"] as const;

function fail(message: string): never {
  process.stderr.write(`migrate: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const statusOnly = args.includes("--status");
  const adopt = args.includes("--adopt");
  const baselineArg = args.find((a) => a.startsWith("--baseline-through="));
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    process.stdout.write(
      [
        "Usage: migrate [--status] [--dry-run] [--adopt] [--baseline-through=N]",
        "",
        "  (no flags)          apply all pending migrations in order, each in its own transaction",
        "  --status            report applied/pending without writing anything",
        "  --dry-run           report what would be applied, write nothing",
        "  --adopt             import a legacy public.schema_migrations ledger, then continue",
        "  --baseline-through=N  record versions <= N as already applied, WITHOUT executing them",
        "",
        "  Use --baseline-through when the schema predates the ledger (for example a database",
        "  whose root tables were created by `drizzle-kit push`). Those migrations are recorded",
        "  as applied and never re-run.",
        "",
        "Requires DATABASE_URL. Refuses to run if an already-applied migration was edited.",
        "",
      ].join("\n"),
    );
    return;
  }

  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      fail(
        `${key} is not set. Point it at your Supabase connection string, e.g.\n` +
          `  $env:DATABASE_URL = "postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres"\n` +
          `  $env:DATABASE_URL = "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"`,
      );
    }
  }

  const url = process.env.DATABASE_URL as string;

  if (statusOnly) {
    const plan = await status(url);
    process.stdout.write(`applied: ${plan.applied.length}\n`);
    for (const row of plan.applied) {
      process.stdout.write(
        `  ${String(row.version).padStart(4, "0")}_${row.name}  (${row.applied_at.toISOString()})\n`,
      );
    }
    process.stdout.write(`pending: ${plan.pending.length}\n`);
    for (const m of plan.pending) {
      process.stdout.write(`  ${String(m.version).padStart(4, "0")}_${m.name}\n`);
    }
    return;
  }

  let baselineThrough: number | undefined;
  if (baselineArg) {
    const raw = baselineArg.slice("--baseline-through=".length);
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      fail(`--baseline-through expects a non-negative integer, got "${raw}".`);
    }
    baselineThrough = n;
  }

  if (adopt) {
    const { adopted, unknown } = await adoptLegacyLedger(url);
    process.stdout.write(`adopted: ${adopted.length}\n`);

    // Fail closed. A legacy row with no matching file was NOT adopted, so the
    // runner still sees that version as pending and would try to execute it
    // against a database that already has it. Stopping here is the only safe
    // outcome: reconcile the file list or the legacy ledger first.
    if (unknown.length > 0) {
      fail(
        `adoption found ${unknown.length} recorded migration(s) with no matching file: ` +
          `${unknown.join(", ")}.\n` +
          `  Nothing further was applied.\n` +
          `  These versions would be treated as pending and re-executed, which is\n` +
          `  unsafe against a database that already contains them. Reconcile the\n` +
          `  migration files and the legacy ledger, then re-run.`,
      );
    }
  }

  await runMigrations(url, { dryRun, baselineThrough });
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
