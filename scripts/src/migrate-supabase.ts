/**
 * RETIRED — do not use.
 *
 * This was a second migration runner tracking applied versions in
 * `public.schema_migrations(version, filename, applied_at)` with NO checksum.
 * Two runners with independent ledgers against one database is a real hazard:
 * the second cannot see what the first applied, so it either re-runs
 * migrations or silently loses history. It was applied to the live Supabase
 * project once, which is why the replacement has an `--adopt` path.
 *
 * The single runner is now `lib/db/src/migrate.ts`:
 *
 *   pnpm run db:status          report applied/pending
 *   pnpm run db:migrate         apply pending (transactional, checksummed, locked)
 *   pnpm run db:migrate -- --dry-run
 *   pnpm run db:migrate -- --adopt   one-time import of the legacy ledger
 *   pnpm run db:migrate -- --baseline-through=N
 *
 * It records checksums, so editing an already-applied migration is detected
 * rather than silently diverging environments. That is strictly stronger than
 * what this file did.
 *
 * The RLS audit and index verification this file also performed are now
 * asserted continuously by `lib/db/tests/db-invariants.test.ts`
 * (`pnpm run test:db`), which checks the live schema on every run instead of
 * only when someone remembers to invoke it.
 *
 * This file is retained as a tombstone so the history stays greppable. It is
 * not wired into any npm script and no longer compiles against the schema.
 */

throw new Error(
  "scripts/src/migrate-supabase.ts is retired. Use `pnpm run db:migrate` " +
    "(lib/db/src/migrate.ts). See the comment at the top of this file.",
);

