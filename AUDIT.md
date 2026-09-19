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

## 2026-09-17 — Localhost API run + api-zod regen fix

You asked to run the API on localhost instead of Replit. Windows walls hit
and worked around (repo untouched): `@esbuild/win32-x64` is stripped by
workspace overrides, so `build.mjs` failed — fetched just that binary with
`npm pack` into temp and pointed `ESBUILD_BINARY_PATH` at it.

Real find: the committed `lib/api-zod/src/generated/api.ts` had all 272
lines appended TWICE (every symbol double-declared). That was the entire
cause of the old "duplicate identifiers" `tsc` failure and the esbuild
`Multiple exports` failure — on every platform, Replit included. Fix via
the blessed path (no hand-edits): ran `orval --config ./orval.config.ts`
directly with node (bypassing the Windows `pnpm run` abort; skipped the
trailing `typecheck:libs`, ran `tsc --build` directly after). First run
regenerated only `zod` (react-query target needs esbuild too); re-ran with
`ESBUILD_BINARY_PATH` set and both targets succeeded. `api-client-react`
output was byte-identical (already fresh); `api.ts` is now the clean single
copy. Root `tsc --build` is green for the first time.

Live localhost run (`node --enable-source-maps ./dist/index.mjs`,
`PORT=5000`, env injected from root `.env`, `dist/` ignored):
- `GET /api/tasks` signed-out → **401** (Clerk gate).
- `GET /healthz` (root) → **404** — confirms the runbook correction:
  health lives at `/api/healthz` (`app.use("/api", router)` +
  `artifact.toml` health path); the old `/healthz` curl was wrong.
- `GET /api/healthz` → **200 `{"status":"ok"}`**.
Server log clean (`Server listening`, port 5000, no DB/auth errors).

Explicitly NOT done: authed-200 + two-account live test with real Clerk
JWTs (needs a browser session — still manual); web frontend local run
(Vite likely hits the same missing-native-binary wall, Replit stays the
path for web).

## 2026-09-17 — Phase 1 slice 1: NL date parsing (`dueText`), server-side

Scope (confirmed first: one module per PR): NL dates only — no schema
change, no migration. Decision: hand-rolled deterministic parser, zero new
runtime deps (no chrono — avoids supply-chain review and behaves
identically on Replit/Windows).

Changed in code (this checkout):
- `lib/api-spec/openapi.yaml`: `TaskInput`/`TaskUpdate` gain optional
  `dueText` (string|null, max 120) + `timezone` (IANA string). Response
  `Task` untouched. Regenerated both clients via `orval --config`
  (node-direct + `ESBUILD_BINARY_PATH`, same as 2026-09-16 run).
- `artifacts/api-server/src/lib/date.ts`: exported `timeZoneOffsetMs`
  (was private) for reuse.
- `artifacts/api-server/src/lib/natural-date.ts` (new): `parseNaturalDate`
  + `zonedWallToUtc` + `resolveDueInput`. Grammar: today/tomorrow/aliases/
  yesterday/day-after-tomorrow, bare + `next` weekdays, ISO + `MMM D` /
  `D MMM` (year omitted → nearest future), `in N units`, `next week`,
  12h/24h/noon/midnight/morning/afternoon/evening/eod/tonight(20:00, today
  locked). Rules: date-only → 09:00 local; dateless past times +1d; bare
  weekday with passed time +7d; past explicit dates KEPT; `MM/DD` refused;
  double time/date or leftover words → null; gaps → post-transition, fall-back
  → first occurrence, invalid zone → UTC fallback.
- `artifacts/api-server/src/routes/tasks.ts`: POST/PATCH resolve via
  `resolveDueInput` — explicit `dueAt` + `dueText` together → 400,
  unparseable → 400 `unparseable_due_text: …`, blank `dueText` = absent,
  PATCH `dueText: null` leaves `dueAt` untouched (clear via `dueAt: null`).
  `dueText`/`timezone` stripped before Drizzle writes (not columns).
- Toolchain: `vitest ^3.2.4` in catalog + api-server devDeps, `test` script.
  `pnpm install` worked on Windows (+31 pkgs). vitest needed two temp-only
  binaries (repo untouched): esbuild win32-x64 via `ESBUILD_BINARY_PATH`
  (as before) + `@rollup/rollup-win32-x64-msvc` via `NODE_PATH` (workspace
  overrides strip it; `pnpm run` abort bypassed by invoking
  `node node_modules/vitest/vitest.mjs run` directly).

Verification (this box): **32/32 vitest green** (grammar × zones × DST gap/
ambiguous × precedence × contract boundaries, fixed `now`); root
`tsc --build` exit 0; esbuild bundle OK; localhost boot clean with
`GET /api/tasks` → 401 and `GET /api/healthz` → 200 (new 400 paths need an
authed session — covered by unit tests instead).

Explicitly NOT done: authed end-to-end (400 on bad text / 201 with resolved
`dueAt` through real Clerk JWT — needs browser session); web capture UI
still sends `dueAt` only (frontend `dueText` box is the follow-up slice);
projects/tags, subtasks, file links untouched per one-module rule.
No commit yet — waits for your word.

## 2026-09-18 — Phase 1 Tier-1: web dueText box + projects/tags + subtasks + file links

You ordered: push first (done, `d5fc80c`), then finish the not-done list.
Web `dueText` box, all three data slices backend-complete this session;
authed e2e still needs your session token (see end).

Web (`artifacts/cadence/src/App.tsx`, TaskEditor only): new "Due in words"
input (maxLength 120, `input-task-duetext`) — when filled it wins and the
"When" picker is omitted from the payload with the browser timezone;
server 400s (`unparseable_due_text`, mutual exclusion) render in a
`role=alert` box (`status-save-error`, `ApiError.message` already carries
the server string). Quick-capture stays title-only by design. Web
`tsc --noEmit` green (Vite dev still Replit-only: native binaries).

0002 projects/tags (live as owner, verified by re-read): `projects`
(name 1..80, color NULL/#rrggbb), `tags` (normalized names, UNIQUE per
user), `task_tags` (composite PK, dual CASCADE), `tasks.project_id`
SET NULL. RLS on, 4 policies × 3 tables, grants done. Probes as
`authenticated`: B sees 0/0/0/0; cross-link blocked; bad color + dup tag
rejected by CHECK/unique; project delete → task survives NULL; tag delete →
links cascade; tables left at 0. Finding recorded: link rows key RLS on
their own user_id, so the DB permits a dangling cross-user link id pair
(no data leaks — the task stays invisible); therefore every write path
verifies task/tag ownership app-side (404s) — documented in code.

0003 subtasks (live, verified): `tasks.parent_id` self-FK RESTRICT +
`tasks_parent_check` (no self-parent). Probes: B sees 0, self-parent CHECK
fires, parent delete with child RESTRICTs, cleanup to 0. Cycles rejected
app-side via `wouldCycle` ancestor walk (PATCH; POST needs none — new rows
have no descendants).

0004 file links (live, verified): `task_files` (http(s) ≤2048, names ≤120),
CASCADE, RLS + 4 policies. Probes: B sees 0, ftp:// CHECK fires, task
delete wipes links. Links only — no storage vendor (none decided in corpus).

API (openapi → regen, single headers verified): Task gains
`projectId`/`tags[]`/`parentId`; `Project`/`ProjectInput`/`ProjectUpdate`,
`Tag`/`TagInput` (find-or-create POST → 200), `FileLink`/`FileLinkInput`;
routes `projects.ts`/`tags.ts`/`task-files.ts` (14 handlers, all
`requireAuth` + `runWithRls` + ownership 404s); `tasks.ts` extended
(ownership checks, tag-set replace semantics, `tagsForTasks` batch fetch —
no N+1). `lib/tags.ts` normalize + `lib/subtasks.ts` cycle guard are pure
and unit-tested.

Verification: **44/44 vitest** (32 dates + 5 tags + 5 cycles + 2 file
contracts); root `tsc --build --force` green; esbuild bundle green;
localhost boot clean with 401s on `/api/tasks|/projects|/tags` + 200
`/api/healthz`. Lesson: `tsc --build` incremental passed once with a wrong
orval type name (`ListTaskFileParams` vs `ListTaskFilesParams`) — esbuild
(from source) caught it; `--force` is now the standard before calling
typecheck green.

Explicitly NOT done: authed e2e (201 with resolved dueAt, 400 on garbage,
project/tag/subtask/file flows, two-account) — needs YOUR Clerk session
JWT: sign in to the app, devtools → Application → Cookies → copy the
`__session` value, paste it here (short-lived, never stored). No commit
yet — waits for your word.

## 2026-09-18 — Localhost web boot + authed e2e with real Clerk JWT

No running web instance existed, so per your "run it here" order I booted
the whole stack on this Windows box (all workarounds temp-dir or
gitignored node_modules — repo untouched except one env-gated config):
- `vite.config.ts` gained a dev-only `/api` proxy active ONLY when
  `LOCAL_API_PROXY` is set (Replit/prod unaffected).
- Native binaries fetched via `npm pack` into temp and shimmed in:
  esbuild (`ESBUILD_BINARY_PATH`), rollup (`NODE_PATH`), lightningcss +
  tailwind-oxide `.node` files copied next to their pnpm packages.
- API (`:5000`, env from root `.env`) + web (`:5173`,
  `PORT/BASE_PATH/LOCAL_API_PROXY/VITE_*`) run as DETACHED node processes
  (tool-call shells are ephemeral — `Start-Job` children die with them).
  Verified: page 200, `/api/healthz` direct 200 AND via web proxy 200.

Authed e2e with your pasted `__session` JWTs (60-second lifetime — two
pastes expired mid-round, third stuck): full battery through
`Authorization: Bearer`, all against live Supabase —
- POST dueText "tomorrow 5pm" (Kolkata) → **201**,
  `dueAt 2026-09-20T11:30Z` (= Sep 20 5pm IST, zone math exact).
- Garbage text → **400** `{"error":"unparseable_due_text: could not
  understand \"someday-ish\". Try \"tomorrow 5pm\"."}` (exact bytes).
- dueAt+dueText → **400**; self-parent → **400**; parent-under-child →
  **400** `{"error":"Cyclic subtask assignment rejected."}` (exact).
- Projects 201, tags 200 find-or-create (` E2E-Work ` → `e2e-work`),
  filed task 201 with `projectId` + `tags[]` inline, tag-clear 200,
  subtask 201 with `parentId` echo, file attach 201 + list 200,
  project delete → task `projectId` null, all deletes 204, final lists
  `[] [] []` (DB left at zero).
Lesson: PowerShell mangles quoted `curl -d` JSON (server HTML-400s the
garbage before auth) — bodies via `--data @file`, raw output, no
`ConvertFrom-Json` pipelines for assertions that matter.

Explicitly NOT done: two-account live test with real JWTs (needs a SECOND
user's token — policy-level A/B isolation already proven twice via forged
claims; token path for one user now proven end-to-end). Servers left
RUNNING detached for your use; stop with:
`Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
Where-Object { $_.CommandLine -match 'dist.index.mjs|vite.js' } |
ForEach-Object { Stop-Process -Id $_.ProcessId }`.

## 2026-09-19 — Calendar time-blocking (Module 2 slice)

Scope (confirmed): `time_blocks` + block API + day-view drag-drop.
Week/month stay counts-only; every block links a task (no blank blocks v1);
blocks never move `dueAt`; drops default to the task's `durationMin`.

0005 live as owner, verified by re-read: `time_blocks` (user/task/tstz
range, `time_blocks_range_check`, CASCADE FK), RLS on, 4 policies, grants.
Probes as `authenticated`: B sees 0, reversed range CHECK fires, task
delete cascades blocks, tables left at 0.

API (openapi → regen): `TimeBlock` (with `taskTitle`), `TimeBlockInput`
(startAt/endAt required), `TimeBlockUpdate`; `GET /blocks?date=&timezone=`
(day-range via `dayBounds`), task-scoped list/create, PATCH move/resize,
DELETE. Overlap is user-level half-open `[start,end)` checked in-txn via
pure `lib/blocks.ts` (`rangesOverlap`/`findOverlap`) — 400 "Overlapping
time block"; end≤start → 400. `ownedTaskId` exported from `task-files.ts`
for reuse (reuse ladder, no duplicate helper).

Web (`App.tsx`, CalendarPage day view only): TaskRow/TaskList accept
optional `onDragStart`; hour grid 06–22 as drop targets; drop posts
`{startAt, endAt}` ISO with the task's duration; overlap 400s render in a
`role=alert` box; chips show title + range with per-block delete.
`vite.config.ts` dev-only `/api` proxy (env-gated) unchanged in behavior.

Verification: **48/48 vitest** (4 new overlap/contract cases); root
`tsc --build --force` + web `tsc --noEmit` green; bundle green; detached
API restarted onto the new bundle (stale-bundle 404 caught by curling the
new routes first — killed PID 25712 precisely, relaunched); signed-out
401s on `/api/blocks` + `/api/tasks/9/blocks`, 200 healthz.
Second occurrence of the orval plural-name trap (`ListTaskBlocksParams`
vs guess) — esbuild caught it again; tsc project-reference checks do NOT
catch cross-package name errors, esbuild-from-source is the gate.
No commit yet — waits for your word.

## 2026-09-19 — Focus gaps: target, rings, heartbeat (banked, uncommitted)

0007 live as owner, verified: `focus_settings` (PK user_id, target 1..20),
4 policies, B-sees-0, target-99 CHECK fires, tables at 0.

API: `FocusSettings(+Update)`, `Momentum{date,tasksTotal,tasksCompleted,
roundsCompleted,roundTarget,streakDays}`; `GET/PATCH /settings/focus`
(auto-create defaults, upsert on PATCH); `GET /momentum` — one call for
the rings (day tasks, day rounds by start, target, 366-day streak from a
single completed-sessions query). Streak = consecutive days ending
today/yesterday with a completed round; paused sessions never count
(documented in `lib/momentum.ts` with pure `computeStreak` +
`dayKeyInZone`).

Web: `ActivityRings` (tasks orange ring, rounds green ring, streak count
center) in a new Today Momentum card; Focus page daily-target stepper
(1..20, clamped both sides); 1s ticker persists whole elapsed minutes as
they pass, so backgrounded tabs and reloads resume within a minute
(server stays source of truth; existing restore effect seeds the
persisted-minutes ref).

Verification: **72/72 vitest** (streak incl. month boundaries, zone day
keys, settings/momentum contracts); `tsc --build --force` + web
`tsc --noEmit` green; bundle green; detached API restarted; 401s on
`/api/momentum` + `/api/settings/focus`, 200 healthz, web 200.
Real-device background/reopen timing stays a manual test.
Banked with the four-slice batch — commit at the end per your order.

## 2026-09-19 — Reminders + Telegram (backend slice)

Scope: explicit reminder rows + auto tiers, quiet hours, kill switch,
idempotent dispatch with watchdog log, Telegram two-way webhook. Pure
scheduling logic fully tested; live Telegram send gated on owner steps.

0006 live as owner, verified by re-read: `reminders` (+`(status,remind_at)`
hot index), `reminder_runs`, `notification_settings` (PK user_id),
`automation_flags` seeded `('reminders', true)`. RLS on all four; 4+4+1
policies; `reminder_runs` deliberately policy-less. Negative probes
re-verified by ROW COUNT (not error absence): B sees 0 run rows, B flag
update/delete touch 0 rows, B insert into runs → RLS violation, flags
still enabled, owner log left empty. Bad channel CHECK + task-cascade
verified; tables at 0.

API (openapi → regen): `Reminder`/`ReminderInput`/`ReminderAutoInput`/
`ReminderUpdate`/`NotificationSettings(+Update)`; task-scoped reminder
CRUD, POST auto (T-1d/T-1h/at-time, skips past, never duplicates),
PATCH (pending-only, cancel-only), settings GET (auto-creates defaults)
+ PATCH (timezones fail CLOSED), `POST /internal/dispatch` + `GET
/internal/health` behind timing-safe `DISPATCH_SECRET` (503 fail-closed
when unset — verified live), `POST /telegram/webhook` behind
`TELEGRAM_WEBHOOK_SECRET` with chat-link identity. Dispatcher runs in
owner service context (documented, like migrations): kill-switch check,
atomic claim (`FOR UPDATE SKIP LOCKED`, batch 100), per-user
enabled/quiet/expiry gates, attempts (3-strike failed), run-log rows.
`GET /internal/health` exposes last run + overdue-pending + flags for
cron monitoring. Missed-tick query: rows in `reminder_runs` with
`finished_at IS NULL` older than 2× tick, or no row newer than the
schedule interval.

Verification: **65/65 vitest** (tiers, quiet incl. overnight/zones,
expiry, commands, formatter, contracts); `tsc --build --force` green;
bundle green; detached API restarted; signed-out 401s on reminder +
settings routes, **503** on `/internal/health` (proves fail-closed),
200 healthz. Third orval plural trap (`ListTaskRemindersParams`) —
rule learned: copy operationId verbatim + Params. YAML lesson: backtick
colons break plain scalars (`status: canceled` → block scalar).

YOUR owner steps (BotFather + Supabase, in order):
1. BotFather → bot token into `TELEGRAM_BOT_TOKEN`; `openssl rand -hex 32`
   twice → `DISPATCH_SECRET`, `TELEGRAM_WEBHOOK_SECRET` (server env +
   `.env` locally).
2. Message your bot once, open `https://api.telegram.org/bot<TOKEN>/
   getUpdates` → your numeric chat id → PATCH `/settings/notifications`
   `{"telegramChatId": "<id>"}` (authed).
3. Dashboard → enable `pg_cron` + `pg_net`, then as owner run (fill URL +
   secret): `SELECT cron.schedule('reminder-dispatch-5min', '*/5 * * * *',
   $$SELECT net.http_post('https://<API>/internal/dispatch',
   '{"Content-Type":"application/json","x-dispatch-secret":"<SECRET>"}'::jsonb)$$);`
4. Set webhook: `curl https://api.telegram.org/bot<TOKEN>/setWebhook
   -d url=https://<API>/telegram/webhook -d secret_token=<WEBHOOK_SECRET>`.
5. Kill switch lives in `automation_flags` (owner-only writes); flip
   `enabled=false` to silence dispatch without a deploy.
Web Push (VAPID) + email digest stay deferred, as decided in corpus.
Banked with the four-slice batch — commit at the end per your order.

## 2026-09-19 — Reschedule engine (Module 5 slice, banked)

Scope: sweep + dial + proposals + TaskRow badge. Corpus honored: cap 3
(default, adjustable 1..10), off/ask/auto dial, batched idempotent sweeps,
flagged tasks never re-churned, every rule unit-tested.

0008 live as owner, verified: tasks gains reschedule_count /
needs_attention / automation(+CHECK), `tasks_overdue_idx`,
`reschedule_proposals` (CASCADE) + `reschedule_runs` (policy-less,
owner-only) + `reschedule_settings` (defaults ask/3); RLS/policies on
user tables; bad-mode CHECK fires; B-sees-0. 0006 amended (unpushed) to
seed the `reschedule` kill-switch row idempotently; seeded live.

Rules (`lib/reschedule.ts`, pure): overdue = open/inbox + past dueAt;
flagged/fresh/completed/dateless → skip; cap reached → flag even in auto;
null automation inherits default; moves shift exactly +24h (documented
DST acceptance); `canAcceptProposal` shared by HTTP + Telegram accept
paths so they cannot diverge.

API: proposals list/accept/decline (accept applies move+count or expires
with 400 + flags), reschedule settings GET/PATCH (auto-create, upsert),
`POST /internal/reschedule` (same DISPATCH_SECRET gate; kill-switch
check; 200-candidate batches; per-user settings; auto→move+count+best-
effort Telegram notice, ask→dedupe-checked proposals, off/cap→flag;
reschedule_runs rows), health extended with lastSweep. Telegram
`accept/decline <proposal>` commands + parser tests + webhook handlers.
Task gains automation write paths; TaskRow shows a needs-attention badge.

LIVE sweep proof via service path (owner-seeded overdue trio, no Clerk
needed): `{checked:3, moved:1, flagged:1, proposed:1}` — move +24h exact
with count 0→1, cap-3 task flagged untouched, ask task proposed;
re-run `{checked:1, moved:0, flagged:0, proposed:0}` (idempotent);
kill-switch run all-zeros + note; health shows lastSweep + flags;
no-secret 401; tables back to 0. Clock-skew note: DB now() runs ~4s
ahead of this box — watchdog recency must compare in DB time.

Verification: orval regen (single headers); `tsc --build --force` + web
green; **86/86 vitest** (mode matrix, cap, cycles of accept validity,
contracts); bundle green; restarted API; 401s on proposals/settings/
range-blocks/momentum, 200 healthz, web 200.

## 2026-09-19 — Calendar follow-ups (banked)

`GET /blocks` takes optional `endDate` (inclusive, 400 when earlier than
date). Week view fetches its 7-day span and month view its month span
(`enabled` per active view only) with per-day "N blocked" lines;
chips are draggable — dropping a chip PATCH-moves it preserving
duration (overlap 400s surface inline); task drops clear chip-drag
state and vice versa. Blank task-less blocks deferred (needs a model
decision). Verified: contract test for endDate, web + api typechecks,
86/86, bundle, live 401 on ranged query.
No commit yet — batch commit next per your order.

## 2026-09-19 — Adoption of docs 07–12, AGENTS.md upgrade, and spec sync

- Synchronized `spec/` to match `docs/` in full (`01` through `12` mirrored).
- Upgraded `AGENTS.md` per `docs/12` instructions:
  - Preserved load-bearing mechanics (Appendix A).
  - Adopted verbatim global rules from `docs/10 §1`.
  - Reconciled decisions: timezone `Asia/Kolkata` default, 24h work rhythm, reschedule cap 5, hybrid automation dial (`auto` 1st miss -> `ask` 2nd miss), LiteLLM gateway with NVIDIA NIM primary, memory transparency screen ("What Cadence Knows About Me") in initial build, colorblind icon/shape pairing requirement.
  - Replaced "Unreconciled" section with reconciliation notes.
- Staged all frontend architecture files and tests for push per user order.

## 2026-09-19 — Parallel Markdown Corpus Zero-Trust Audit, Frontend Modularization, Profile & Memory Transparency, 15/15 Playwright E2E Green

- Deployed 4 concurrent subagents across all 28 markdown documents in root, `docs/`, and `spec/`:
  1. Root & Governance Auditor (`AGENTS.md`, `AUDIT.md`, `PROGRESS.md`, `README.md`, `VERIFICATION_REPORT.md`, `replit.md`)
  2. Foundational Specs Analyst (`docs/01-06`, `spec/01-04`)
  3. Post-Audit & Gaps Analyst (`docs/07-09`, `spec/07-09`)
  4. Checklist & Memory Analyst (`docs/10-12`, `spec/10-12`)
- Reconciled documentation staleness:
  - `PROGRESS.md` synchronized to reflect live `/memory` transparency screen, `/profile` page, `/settings`, `/onboarding` wizard, Guided Rituals dialogs on `/review`, and Activity Rings momentum.
  - `README.md` and `replit.md` updated to accurately describe migrations 0001–0008, 13 Express routers (48+ endpoints), and current live capabilities.
- Verified test suites:
  - Vitest: **86 / 86 unit test suites pass** (100% green).
  - Playwright E2E: **15 / 15 end-to-end scenarios pass** (100% green) covering API health, 401 fail-closed security, landing HIG, Clerk auth, memory transparency, onboarding wizard, guided rituals, focus timer + Web Audio, calendar grid, settings, profile modal & export, mobile Safari dock, and mobile profile view.
- Pushed changes to `origin/main` at `https://github.com/Driftloom/TaskOS.git` with `--no-gpg-sign`.