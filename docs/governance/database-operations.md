# Database Operations Runbook

Canonical instructions for applying and verifying schema changes against
Supabase Postgres. Supersedes `scripts/src/migrate-supabase.ts`, which is
retired.

> **Zero trust:** the only authority on the real schema is the database itself.
> Never infer applied state from a file, a commit message, or this document.
> Run `pnpm run db:status` and `pnpm run test:db` and read the output.

## 1. There is exactly one runner

`lib/db/src/migrate.ts`, exposed as `pnpm run db:migrate`.

It applies each file in its own transaction, records a SHA-256 checksum,
serialises concurrent runs with a Postgres advisory lock, retries the initial
connection, and **refuses to run** if a migration that was already applied has
since been edited.

| Command | Effect |
|---|---|
| `pnpm run db:status` | Reports applied/pending. Writes nothing. |
| `pnpm run db:migrate` | Applies pending migrations, in version order. |
| `pnpm run db:migrate -- --dry-run` | Reports what would apply. Writes nothing. |
| `pnpm run db:migrate -- --adopt` | One-time import of the legacy ledger, then continues. |
| `pnpm run db:migrate -- --baseline-through=N` | Records versions `<= N` as applied **without executing** them. |
| `pnpm run test:db` | Asserts 20 schema invariants against the live database. |

```mermaid
sequenceDiagram
    autonumber
    participant CLI as Developer CLI (pnpm run db:migrate)
    participant Runner as migrate.ts Runner
    participant Lock as Postgres Advisory Lock
    participant Ledger as cadence_schema_migrations Table
    participant DB as Postgres Schema

    CLI->>Runner: Execute Migration Runner
    Runner->>Lock: pg_try_advisory_lock(7429184)
    alt Lock Unavailable
        Lock-->>Runner: Lock Busy
        Runner-->>CLI: Error: Migration currently running concurrently
    else Lock Acquired
        Lock-->>Runner: Lock Granted
        Runner->>Ledger: SELECT version, checksum FROM cadence_schema_migrations
        Ledger-->>Runner: Applied migrations history
        Runner->>Runner: Verify SHA-256 checksums of applied files on disk
        alt Checksum Drift Detected
            Runner-->>CLI: FATAL: Checksum mismatch on applied migration (refusing to run)
        else Checksums Valid
            loop For each pending migration (0000..0015)
                Runner->>DB: BEGIN Transaction
                Runner->>DB: Execute SQL Script
                Runner->>Ledger: INSERT INTO cadence_schema_migrations (version, checksum, ms)
                Runner->>DB: COMMIT Transaction
            end
            Runner->>Lock: pg_advisory_unlock(7429184)
            Runner-->>CLI: Successfully applied all pending migrations
        end
    end
```

Never use `pnpm --filter @workspace/db run push` (`drizzle-kit push`) outside
throwaway local work. It is the dev path, it is not recorded in the ledger, and
it is how the schema and the migration history silently diverged in the first
place.

## 2. Ledger

`public.cadence_schema_migrations(version, name, checksum, applied_at, execution_ms)`.

Created by the runner itself, not by a migration, so it exists before version
`0000` is considered. History is the ledger plus the files, cross-checked by
checksum.

## 3. One-time adoption for the live project

The live database was first migrated by a superseded runner that recorded
versions in `public.schema_migrations(version, filename, applied_at)` with no
checksum. Adopt that history, then baseline the files that predate the ledger:

```powershell
$env:DATABASE_URL = "<pooled or direct connection string>"

# 1. Inspect before writing anything.
pnpm run db:status
pnpm run db:migrate -- --dry-run

# 2. Import the legacy ledger rows (checksums computed from the files on disk).
pnpm run db:migrate -- --adopt

# 3. Record the foundation migration as applied without running it.
#    `tasks` and `focus_sessions` predate the ledger: they were created by
#    `drizzle-kit push`, which is why 0000 exists as a file but must NOT be
#    executed against this database.
pnpm run db:migrate -- --baseline-through=0

# 4. Verify the schema directly, not via the ledger.
pnpm run test:db
```

Step 4 is the one that matters. It checks columns, constraints, RLS coverage
and policy scoping against the database, so a wrong ledger cannot make a broken
schema look healthy.

**Do not apply `0010_supabase_security_advisor_fixes.sql` without explicit owner
sign-off.** It issues `DROP EXTENSION pg_net CASCADE`, which can drop the cron
dispatch jobs that reminder delivery depends on. Apply the rest of `0010` by
hand if the advisor fixes are wanted.

## 4. Adding a migration

1. Create `lib/db/migrations/NNNN_name.sql`, next free number, never re-using
   or renumbering an applied one.
2. Make it additive and idempotent-safe (`IF NOT EXISTS` on creates, guarded
   `IF EXISTS` on alters of possibly-missing objects).
3. Do not edit an already-applied file. The runner will refuse to start, and it
   is right to.
4. Update `lib/db/src/schema/*.ts` in the same change, and the OpenAPI contract
   in `lib/api-spec/openapi.yaml` if the change is visible to clients.
5. Verify:

```powershell
pnpm run db:migrate -- --dry-run   # shows exactly what will run
pnpm run db:migrate                # apply
pnpm run test:db                   # invariants hold
pnpm run verify                    # typecheck + all tests
```

## 5. Local verification without touching the cloud project

The migrations depend on Supabase's `auth` schema and roles, so they cannot run
on a vanilla Postgres unmodified. `lib/db/test/supabase-shim.sql` provides that
surface for a throwaway database:

```powershell
docker run -d --rm --name cadence-mig-test `
  -e POSTGRES_PASSWORD=testpw -p 55432:5432 postgres:16-alpine

# apply the shim, then:
$env:DATABASE_URL = "postgresql://postgres:testpw@127.0.0.1:55432/postgres"
pnpm run db:migrate
pnpm run test:db

docker rm -f cadence-mig-test
```

This is the only supported way to prove a migration chain applies from empty.
It caught the fact that `tasks` and `focus_sessions` were never created by any
migration file.

All of the above is automated — prefer it over the manual sequence:

```powershell
pnpm run test:db:local
```

The manual form stays documented because it is occasionally useful for
debugging, but note that the repo-root `.env` points at **live Supabase**:
setting `DATABASE_URL` by hand is exactly the step most likely to point a
destructive run at production.

## 6. New environment from scratch

```powershell
$env:DATABASE_URL = "<new project's connection string>"
pnpm run db:migrate     # applies 0000..NNNN in order, on an empty database
pnpm run test:db
```

No `drizzle-kit push` step. That is the entire point of the baseline migration.

## 7. Invariants asserted by `pnpm run test:db`

- the ledger exists and holds no malformed checksums
- `tasks.completed_at` exists, its CHECK constraint is present **and enforced**,
  no completed row lacks a timestamp, no open row carries one
- `tasks.rrule` exists and no materialised occurrence is itself a template
- working-hours columns exist and stay within 0–23
- RLS is enabled on every user table, each has at least one `authenticated`
  policy, and every such policy is scoped to the caller's own rows — reading
  INSERT scoping from `with_check` and everything else from `qual`
- `llm_usage`, `reminder_runs` and `reschedule_runs` are unreachable by
  `authenticated`
- the `reminders` and `reschedule` automation kill-switch flags exist, because
  both sweeps fail closed when a flag row is missing

`pnpm run test:db` is **read-only**. Every assertion is a catalog or count query.
The one negative write — proving `tasks_completed_at_check` actually fires
rather than merely existing — runs inside a transaction that always rolls back.
That matters because the suite connects as the table owner, so RLS does not
protect it; without the rollback an unguarded insert would commit a real row
precisely when the test was reporting that the constraint was missing.

## 8. Destructive tests (read this before running them)

`lib/db/tests/migrate.test.ts` contains a suite that **drops and recreates
`public.schema_migrations`** in the target database, in order to reproduce a
real legacy-ledger adoption faithfully. Against a production project that
would destroy the actual legacy ledger and leave fabricated rows behind.

It therefore runs only when **both** hold:

- `DATABASE_URL` points at localhost/127.0.0.1, and
- `CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS=1` is set.

Otherwise those three cases are skipped with a visible warning. The remaining 32
assertions still run normally.

**The one combination that must fail loudly** is opt-in *plus* a remote host:
that is the setting that would destroy production, so it fails the run (exit 1)
with an explanatory message rather than skipping. Skipping would be
indistinguishable from "the tests ran and found nothing", which is the wrong
signal to hand someone who believes they just validated production.

`tests/db-target.ts` owns this decision and parses the hostname out of the URL
rather than grepping the string, because a substring test also matches a
password containing `localhost`. An unparseable URL is treated as remote.

Rather than wiring that up by hand, just run:

```powershell
pnpm run test:db:local
```

which starts a throwaway `postgres:16-alpine` on port 55432 with a generated
password, applies `lib/db/test/supabase-shim.sql`, migrates from empty, runs the
suite, and removes the container. The connection string stays in memory and is
never written to a file. See `lib/db/README.md`.

