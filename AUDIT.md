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

## 2026-09-12 — M0 code part (PWA shell): manifest + SW + icons

Changed in code (this checkout, no dashboard touched):
- `artifacts/cadence/public/manifest.webmanifest` (new): name/short_name,
  `start_url:/`, `display:standalone`, `background:#F5F5F7`,
  `theme:#FF9500`, icons 192 + 512 + maskable 512.
- `artifacts/cadence/public/icon-192.png`, `icon-512.png`,
  `maskable-512.png`, `apple-touch-icon.png` (new): Pillow-generated from
  System-Orange + dark mark matching `public/logo.svg`; sizes verified
  192/512/512/180.
- `artifacts/cadence/public/sw.js` (new): shell-only skeleton. Pre-caches
  `/`, `/index.html`, `/offline.html`, manifest + icons. Navigations are
  network-first with `/offline.html` fallback; static GETs are
  stale-while-revalidate; `/api/*` is never cached.
- `artifacts/cadence/public/offline.html` (new): minimal offline fallback.
- `artifacts/cadence/index.html`: manifest link, `theme-color`,
  `apple-touch-icon`, mobile-web-app-capable tags; description updated.
- `artifacts/cadence/src/main.tsx`: SW registration on window load with
  failure catch (no push wiring — reminders module owns VAPID).

Verification (this box, zero-trust — claims backed by runs above):
- `manifest.webmanifest` parses as JSON; has name/icons/start_url/display;
  192 + 512 sizes present — PASS.
- Pillow dimension check: 192x192, 512x512, 512x512, 180x180 — PASS.
- `index.html` contains manifest link + theme-color + apple-touch-icon — PASS.
- `sw.js` contains fetch listener + `/api/` bypass — PASS.
- `main.tsx` contains serviceWorker registration — PASS.
- `tsc -p artifacts/cadence/tsconfig.json --noEmit`: exit 0 — PASS.
- Secret grep over `artifacts/cadence/public` (BOT_TOKEN/supabase.co/ghp_/
  AKIA/AIza/sk-ant-/xox): zero hits — PASS.

Explicitly NOT done (your manual steps, in order):
1. Supabase single prod project + Clerk third-party auth + enable
   `pgvector`/`pg_cron`/`pg_net` + run `0001` migration + cutover test.
2. Replit Secrets entry for all keys.
3. BotFather bot + numeric user ID (webhook curl deferred to Module 7).
4. `npx web-push generate-vapid-keys --json` + store as secrets.
5. Gemini free-tier key (`GEMINI_API_KEY`) via AI Studio or connector.
6. `git push origin main` + Replit Git-pane pull verify.
7. Real-device tests: Android Add-to-Home-Screen, iPhone Share Add-to-Home,
   DevTools Manifest green Installable, session-persist reload.
No commit made by this batch — 2 modified + 7 new files left in tree.

## 2026-09-12 — M0 batch 2 (env template + sync check)

Changed in code:
- `.env.example` (new): documents every M0 secret with EMPTY values —
  DATABASE_URL, SUPABASE_URL/ANON/SERVICE_ROLE, CLERK_*, VITE_CLERK_*,
  CORS_ORIGINS, TELEGRAM_BOT_TOKEN/USER_ID, VAPID_*, GEMINI_API_KEY,
  LLM_FALLBACK_KEY. Only non-secret defaults filled: CORS_ORIGINS
  (localhost:5173), LOG_LEVEL (info). Server-only keys flagged in header
  comment (never VITE_-prefixed, never browser-shipped).

Verification (zero-trust):
- Coverage script over all `process.env.*` + `import.meta.env.VITE_*` in
  lib + artifacts: every code var present in `.env.example` — PASS
  (missing list empty; runtime-provided PORT/BASE_PATH/NODE_ENV/REPL_ID
  intentionally commented, not required).
- Non-empty values scan: only `LOG_LEVEL=info` (+ CORS default) — PASS,
  no secret-shaped values.
- Secret-pattern grep (postgres://, supabase.co, AKIA, ghp_, AIza,
  sk-ant-, xox, JWT-shaped, bot-token-shaped): zero hits — PASS.
- `git status --short` shows `.env.example` as `??` untracked (committable,
  negation `!.env.example` honored) — PASS.
- `git ls-remote origin main` = `60abbb8` = local HEAD — remote in sync,
  nothing to pull; the 10 uncommitted files (PWA batch + this file + AUDIT)
  are the full delta awaiting your commit+push.

Explicitly NOT done (still your manual steps): Supabase prod, Replit
Secrets fill, BotFather, VAPID gen, Gemini key, commit+push, device tests.
No commit made by this batch — per rule, commit/push waits for your word.

## 2026-09-15 — AGENTS.md upgrade from spec corpus (OpenCode session)

Replaced the prior compact `AGENTS.md` (operational mechanics only) with the
11-section canonical file per your create/upgrade brief. Per the brief's Step 1,
here is the kept/changed/removed log — nothing silently overwritten:

Kept (from prior AGENTS.md, re-verified true today): pnpm-only guard +
`minimumReleaseAge` rule; full command set (typecheck/build/filter/codegen/
push, `PORT`+`BASE_PATH` requirement); workspace layout incl.
mockup-sandbox quarantine; openapi-as-source-of-truth + Orval Zod-v3 pin;
`runWithRls` isolation model + CORS allowlist; env/secret rules; Windows
best-effort notes; zero-`*.test.*`/no-CI verification path. All preserved
verbatim in substance as Appendix A.

Changed/added (new, grounded in corpus): §§1–3 (one-liner, real state as of
2026-09-11/12 with freshness warning, adapted Clerk+Drizzle+Express stack);
§4 (global rules — substituted from docs/03 §9 + docs/06, see below); §5
(design system + full color table from docs/03 §2); §6 (locked-decisions
table, OPEN-marked); §7 (build order from docs 02 §1 + 03 §8); §§8–11
(protocol, test-backlog pointer, deferred list, governance).

Removed: nothing of verified value. Two of my own first-draft overstatements
were caught in the sanity re-read and fixed before finishing: (a) "weekly
re-audit" as a rule — no cadence exists in-corpus, now labeled suggested
practice; (b) "AUDIT.md newest-first" — this file is oldest-first
(chronological append), corrected in §11.

Corpus facts established by direct reads + grep (not assumed): `spec/` 01–04
are byte-identical to `docs/` 01–04 (line endings only); **docs 07–11 do not
exist** (no `spec/07`, no `spec/09/10/11`); the verification report lives at
repo root (`VERIFICATION_REPORT.md`, 2026-09-11), not in `spec/`. All brief
claims with zero corpus hits are listed in AGENTS.md "Unreconciled" instead
of being written in as fact — notably reschedule cap stays **3** (docs/01 §9,
03 §6 contradict the brief's 5), and no LiteLLM/NIM/Groq/OpenRouter/HF,
`Asia/Kolkata`-default, `₹300–500`, or memory-seed-category content was
adopted. No commit made — commit/push waits for your word.

## 2026-09-16 — Batch-1 cutover: fresh-start build + policy-level verification

You confirmed: fresh start (no Replit data to migrate), and authorized
owner-level schema writes on the empty project. Supabase project
`rjfbyayvuzxvliasbqwr` was reachable but **empty** — `public` had 0 tables,
only default extensions (`pg_stat_statements`, `pgcrypto`, `plpgsql`,
`supabase_vault`, `uuid-ossp`; no `vector`/`pg_cron`/`pg_net`).

Changed live (Supabase, as `postgres` owner — verified, not assumed):
- Created base `tasks` + `focus_sessions` in the exact pre-hardening shape
  (serial PKs, no FK/CHECKs, no `user_id` default — mirroring a Replit
  `pg_dump` restore so `0001` stays the single hardening source).
- Ran `lib/db/migrations/0001_supabase_rls_hardening.sql` verbatim: OK.
- Live re-read after: RLS `true` on both tables; all 8 policies present
  (`own tasks/focus sessions × select/insert/update/delete`); constraints
  `tasks_pkey`, `tasks_priority_check`, `tasks_status_check`,
  `focus_sessions_pkey`, `focus_sessions_status_check`,
  `focus_sessions_task_id_tasks_id_fk`; `tasks.user_id` default is
  `(auth.jwt() ->> 'sub'::text)`.

Isolation probed as `authenticated` with forged `request.jwt.claims`
(same mechanism `runWithRls` uses): A inserts + reads own row (count 1);
B selects 0 rows; B cross-insert fails `new row violates row-level
security policy`; B `DELETE` touches 0 rows and A's row survives;
tables left at 0 rows (probes rolled back / cleaned).

Code wiring re-read (no edits): 8/8 handlers (5 tasks + 3 focus-sessions)
behind `requireAuth` + `runWithRls` with app-layer `user_id` filters kept;
`GET /healthz` public; CORS is an allowlist from `CORS_ORIGINS`.
Typecheck green on Windows via direct tsc: `tsc --build lib/db --force`
exit 0, `tsc -p artifacts/api-server --noEmit` exit 0. (Root `tsc --build`
generated-code duplicates + `pnpm run` Windows abort are pre-existing,
unchanged.)

Nit recorded, not fixed (verification posture): `rls.ts` header comment
says the JWT signature "is verified by Postgres/Supabase against the Clerk
JWKS" — actually Clerk's `getAuth` verifies the session first and Postgres
trusts the forwarded claims. No vuln (`requireAuth` 401s before `runWithRls`),
but the comment should be corrected in a code pass.

Explicitly NOT done (your manual steps — live HTTP tests are blocked on them):
1. Fill Clerk keys in `.env` (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` /
   `VITE_CLERK_PUBLISHABLE_KEY` — all empty) before the API can run authed
   routes at all.
2. Re-copy Supabase keys via Copy-all: `SUPABASE_ANON_KEY` (46 chars) and
   `SUPABASE_SERVICE_ROLE_KEY` (41 chars) have right prefixes but look short
   vs full `sb_publishable_`/`sb_secret_` values.
3. Dashboard: enable `pgvector` (+ `pg_cron`/`pg_net`), activate Clerk
   Supabase integration + paste Clerk domain under Auth → Third-Party Auth.
4. After 1–3: signed-out `/api/tasks` → 401 with `/healthz` public, and the
   two-account live test with real Clerk JWTs (policy-level isolation is
   already proven; this tests the token path end to end).
No push — commit only, per scope.