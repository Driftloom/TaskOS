# Cadence build audit

## 2026-09-09

- Created the Cadence web artifact and kept the first slice intentionally narrow: task capture, Today, Inbox, completion, editing, deletion, and progress summary.
- Added the first OpenAPI contract and regenerated the typed client and validation schemas.
- Provisioned managed Clerk authentication and replaced the demo user scope with the authenticated Clerk user ID on every task route.
- Added branded sign-in/sign-up routes, a signed-out landing page, protected workspace routing, and a sign-out control.
- Added API routes backed by the Replit-managed PostgreSQL database.
- Seeded three starter tasks for the initial preview.
- Verified signed-out task access returns 401 while health remains public.
- The remaining product modules are still separate work: timezone-aware scheduling, focus sessions, calendar, reminders, rescheduling, recurrence, analytics, Telegram, export/settings, and the agent.

## 2026-09-12 — Batch 1 (build steps 1–3): Supabase decision + hardening + preinstall

Architecture decision (closes verification-report Phase-0 drift): **the adapted
stack is blessed — Clerk (auth) + Drizzle (ORM) + Express + Supabase Postgres.**
Supabase becomes the primary DB (Replit PG kept as rollback until cutover is
verified); Clerk stays exactly as built via its native third-party-auth
integration (Clerk domain pasted into Supabase Auth; no JWT template). This
unblocks RLS + `pgvector` + `pg_cron` with zero route/UI rework.

Critical nuance recorded: pointing `DATABASE_URL` at Supabase alone does NOT
enable RLS — the shared owner-level Pool bypasses it. Enforcement is per-request:
`requireAuth` captures the Clerk session JWT (`getAuth(req).getToken()`), and
every task/focus query runs inside `runWithRls` (`src/lib/rls.ts`), which pins
`request.jwt.claims` and drops to `SET LOCAL ROLE authenticated` per transaction.
Fail-closed: no token => authenticated role with a match-nothing claims payload.
App-layer `where user_id = ?` clauses kept as defense-in-depth. Policies key off
`auth.jwt()->>'sub'` (never `auth.uid()` — no Supabase auth.users rows exist).

Changed in code (this checkout, no live DB touched):
- `lib/db/src/schema/tasks.ts`: removed `DEFAULT 'demo-user'`; added
  `tasks_priority_check` / `tasks_status_check` CHECKs mirroring Zod/OpenAPI enums.
- `lib/db/src/schema/focus-sessions.ts`: added FK
  `task_id -> tasks.id` (NO ACTION: delete-with-history fails loudly) + status CHECK.
- `lib/db/src/index.ts`: exported `Db` / `DbTransaction` types for the helper.
- `lib/db/migrations/0001_supabase_rls_hardening.sql`: owner-run migration for the
  Supabase project (default swap, FK, CHECKs, grants, RLS + 8 policies).
- `artifacts/api-server/src/lib/rls.ts` (new): `runWithRls` helper.
- `middlewares/auth.ts`: async `requireAuth` now also captures `req.authToken`.
- `routes/tasks.ts`, `routes/focus-sessions.ts`: all 9 handlers via `runWithRls`.
- `app.ts`: CORS `origin:true` replaced by `CORS_ORIGINS` allowlist
  (default `http://localhost:5173`).
- `lib/api-spec/openapi.yaml`: added `clerkSession` bearer securityScheme,
  global `security`, public override on `GET /healthz`. Regenerate clients on
  Linux via `pnpm --filter @workspace/api-spec run codegen` (not run here).
- Root `preinstall`: `sh -c '...'` replaced by cross-platform
  `scripts/enforce-pnpm.cjs` (verified: rejects non-pnpm with exit 1, accepts
  pnpm user-agent with exit 0). Primary dev remains Replit/Linux (workspace
  strips win32 binaries); Windows is best-effort after this fix.
- `PROGRESS.md`: corrected stale Calendar/Focus/CRUD rows (dated 2026-09-12).

YOUR manual steps before batch 1 is done (need Supabase dashboard + secrets):
1. Create Supabase project; activate Clerk Supabase integration; add Clerk domain
   under Auth -> Third-Party Auth; enable `pgvector` (+ `pg_cron`/`pg_net`).
2. `pg_dump` Replit PG, restore to Supabase, run the `0001` SQL file as owner.
3. Point `DATABASE_URL` (+ `CORS_ORIGINS`) at Supabase; run (a) signed-out
   `/api/tasks` -> 401 with `/healthz` public, and (b) the two-account isolation
   live test (B must never read/write A's rows, including direct selects as
   `authenticated` with B's token). Only then decommission Replit PG.

## 2026-09-12 — Batch 1 verification output (Windows checkout, direct tsc)

- `node scripts/enforce-pnpm.cjs`: exit 1 without pnpm user-agent, exit 0 with
  `pnpm/10.0.0` — new preinstall guard works on Windows (old `sh` form is gone).
- `tsc --build lib/db --force`: **exit 0** (schema + index changes clean).
- `tsc -p artifacts/api-server/tsconfig.json --noEmit`: **exit 0** (rls helper,
  async requireAuth, all 9 rewired handlers, CORS allowlist clean).
- Root `tsc --build` still fails, but ONLY in pre-existing generated code:
  `lib/api-zod/src/generated/api.ts` duplicate identifiers — `src/index.ts`
  re-exports both `./generated/api` and `./generated/types`, which define the
  same names. That file is committed Orval output, untouched by this batch;
  fix = re-run `pnpm --filter @workspace/api-spec run codegen` on Linux (also
  picks up the new `clerkSession` securityScheme) and rebuild there. "Full
  typecheck green" therefore still requires a Linux/Replit run — not claimed here.
- Note: `pnpm run <script>` on this Windows checkout aborts in pnpm's own
  install check (`ERR_PNPM_IGNORED_BUILDS` for @clerk/shared/esbuild postinstall
  scripts) before any script executes — environment quirk, unrelated to the
  changes above. Direct `node node_modules/typescript/bin/tsc` bypasses it.
  Side effect found and reverted: that blocked `pnpm run` auto-appended an
  `allowBuilds:` stub with placeholder strings to `pnpm-workspace.yaml`; it was
  reverted to committed state because (a) the placeholders are not valid config
  and (b) esbuild has no win32 binary in this workspace by design (overrides
  strip it — verified: esbuild binary missing here), so approving builds cannot
  fix Windows anyway. Set real `allowBuilds` values via `pnpm approve-builds`
  on Replit/Linux, not from this box.