# `@workspace/db`

Drizzle schema (`src/schema/`), the SQL migration runner (`src/migrate.ts`),
and the database-backed test suites (`tests/`).

The full operator runbook — adoption, ledger semantics, invariants, rollback —
lives in [`docs/governance/database-operations.md`](../../docs/governance/database-operations.md).
This file is the short version for working on the schema and the suites.

## Commands

| Command | Effect |
|---|---|
| `pnpm run db:migrate` | Apply pending migrations in version order, each in its own transaction |
| `pnpm run db:status` | Report applied/pending. Writes nothing |
| `pnpm run db:migrate -- --dry-run` | Report what would apply. Writes nothing |
| `pnpm run db:migrate -- --adopt` | One-time import of the legacy `schema_migrations` ledger |
| `pnpm --filter @workspace/db run test` | 12 pure-logic tests, always; DB tests when `DATABASE_URL` is set |
| `pnpm run test:db:local` | **Stand up a throwaway Postgres and run everything, including destructive** |

`drizzle-kit push` exists but is dev-only. It is not recorded in the ledger, and
it is how the schema and the migration history silently diverged in the first
place. Do not use it outside throwaway local work.

## Running the destructive suite

`tests/migrate.test.ts` contains a suite that **drops and recreates
`public.schema_migrations`** to reproduce a real legacy-ledger adoption faithfully.
Against a production project that would destroy the real ledger and leave
fabricated rows behind.

It runs only when **both** hold:

- `DATABASE_URL` resolves to loopback (`localhost`, `127.0.0.1`, `::1`), and
- `CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS=1` is set.

One command does all of it — start the container, apply the shim, migrate from
empty, run the suite, tear it down:

```powershell
pnpm run test:db:local
```

Requires a running Docker daemon. It uses `postgres:16-alpine` on port `55432`,
generates a throwaway password per run, and keeps the connection string in
memory only — it is never written to a file and never printed. Override with
`CADENCE_DB_PORT`, `CADENCE_DB_IMAGE`, or `CADENCE_DB_CONTAINER`; pass `--keep`
to leave the container up for poking at (note the password is then
unrecoverable, which is intentional).

## The safety gate

`tests/db-target.ts` decides what this run is pointed at, by parsing the
hostname out of `DATABASE_URL` rather than grepping the string — a substring test
would also match a password containing `localhost`. Anything unparseable is
treated as remote (fail closed).

| `DATABASE_URL` | opt-in flag | Result |
|---|---|---|
| unset | — | 12 logic tests pass, 24 skipped with a printed reason |
| loopback | unset | 32 pass, 3 destructive **skipped** (CI is never surprised) |
| loopback | `=1` | 35 pass — full suite including destructive |
| **remote** | `=1` | **FAILS loudly, exit 1** |
| remote | unset | 32 pass; destructive skipped with a warning |

The remote+opt-in row is deliberate. A silent skip there would be
indistinguishable from "the tests ran and found nothing" — the wrong signal to
hand someone who believes they just validated production. It is a test failure
with an explanatory message, not a skip and not a no-op.

## Invariants and the Supabase shim

`tests/db-invariants.test.ts` asserts 20 schema invariants against whatever
`DATABASE_URL` points at, live project included — that is the only way to check
the schema actually deployed. It is genuinely read-only: every assertion is a
catalog or count query, and the single negative write (proving
`tasks_completed_at_check` actually fires) runs inside a transaction that always
rolls back. It is also owner-level, so RLS does not protect it — that rollback is
what makes the read-only claim true.

The migrations are Supabase-specific: they reference `auth.jwt()` and grant to the
`anon` / `authenticated` / `service_role` roles that Supabase provisions.
`test/supabase-shim.sql` supplies that surface on a vanilla Postgres. It creates
no real security — every role is membership-only, and `auth.jwt()` just reads the
`request.jwt.claims` GUC the app sets in `runWithRls`.

## Adding a migration

1. Create `migrations/NNNN_name.sql`, next free number. Never renumber or edit an
   applied one — the runner checks SHA-256 checksums and will refuse to start.
2. Additive and idempotent-safe: `IF NOT EXISTS` on creates, guarded `IF EXISTS`
   on alters of possibly-missing objects.
3. Update `src/schema/*.ts` in the same change, and `lib/api-spec/openapi.yaml`
   if the change is client-visible.
4. Prove it: `pnpm run test:db:local`. A migration that cannot apply from empty
   is not done.