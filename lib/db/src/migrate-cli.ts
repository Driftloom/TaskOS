#!/usr/bin/env node
/**
 * CLI for the migration runner.
 *
 *   node --experimental-strip-types src/migrate-cli.ts            apply pending
 *   node --experimental-strip-types src/migrate-cli.ts --status    show plan
 *   node --experimental-strip-types src/migrate-cli.ts --dry-run   show plan, write nothing
 */
import { runMigrations, status } from "./migrate.ts";

const REQUIRED_ENV = ["DATABASE_URL"] as const;

function fail(message: string): never {
  process.stderr.write(`migrate: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const statusOnly = args.includes("--status");
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    process.stdout.write(
      [
        "Usage: migrate [--status] [--dry-run]",
        "",
        "  (no flags)  apply all pending migrations in order, each in its own transaction",
        "  --status    report applied/pending without connecting to write anything",
        "  --dry-run   report what would be applied, write nothing",
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

  await runMigrations(url, { dryRun });
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
