# AGENTS.md — Cadence (Personal Task & Time OS)

> **File provenance (read this first, 2026-09-15):** built from the actual corpus in this repo — `docs/` + `spec/` 01–04 (verified byte-identical content; only line endings differ), `docs/05` (portability), `docs/06` (zero-trust audit), `VERIFICATION_REPORT.md` (2026-09-11), `AUDIT.md` batches (2026-09-12), plus verified repo mechanics carried over from the prior `AGENTS.md` (see Appendix A). **Docs 07–11 cited in the drafting brief do not exist in this repo** (no `spec/07-post-audit-master-plan.md`, no `spec/09/10/11`) — every section below says what was used instead, and **Unreconciled** at the end lists each brief claim dropped or contradicted, with evidence. Nothing below is invented to fill those gaps.
> **Freshness:** real-state claims last verified 2026-09-11/12. If more than ~a week has passed since then, re-run the `docs/06` zero-trust audit before trusting §2.

## 1. What this is

**Cadence** (working title, owner: Rohit) — a personal task + time-management app that replaces a paper planner: fast mobile capture, a real calendar, focus timers, reminders over a channel actually seen, a visibly self-fixing reschedule engine, and a conversational agent with memory that learns real work patterns (`docs/01 §1–2`, `docs/03 §1`). **Single user for now, built multi-user-safe from day one** — every table gets `user_id`-scoped RLS; nearly free now, painful to retrofit (`docs/01 §8`, `docs/03 §1`).

## 2. Current real state (last verified 2026-09-11/12 — 4 days old, not re-audited today)

- **Built and verified real (no mocks):** app shell + Clerk auth (branded sign-in/up, landing, protected routes, sign-out), DB-backed task CRUD scoped per user, Today + Inbox views, Calendar Day/Week/Month shell (counts only), persisted Focus timer + sessions, PWA shell (manifest, icons, offline page, shell-only SW). Full detail: `VERIFICATION_REPORT.md` §2 table.
- **Genuinely absent:** reminders, auto-reschedule, agent/memory, recurrence, Telegram, settings/export, analytics beyond daily counts. Only **2 of 16** spec'd tables exist (`tasks`, `focus_sessions`).
- **Adapted stack is blessed** (`AUDIT.md` 2026-09-12): Clerk (native third-party-auth) + Drizzle + Express + Supabase Postgres — replaces doc 01/02's Supabase-Auth assumption with zero route/UI rework. Batch-1 hardening is **in the working tree, partly uncommitted**: RLS migration + `runWithRls`, FK + CHECKs, CORS allowlist, `demo-user` default removed, cross-platform preinstall, PWA shell, `.env.example`.
- **Still manual / pending:** Supabase project + Clerk third-party-auth + `pgvector`/`pg_cron`/`pg_net` + owner-run `0001` migration + cutover test (two-account isolation, signed-out 401), secrets fill, VAPID + Gemini keys, device tests. `git status` currently shows uncommitted work (`AUDIT.md`, PWA files, `.env.example`) — check before assuming HEAD is whole.
- Scorecard: `VERIFICATION_REPORT.md` §2 (module table), §3 (five doc-04 risks), §4 (punch list). Status: `PROGRESS.md`. Notes: `AUDIT.md`, newest first.

## 3. Tech stack, as it actually stands

| Layer | Stands at | Source |
|---|---|---|
| Frontend | React + Vite + Tailwind + shadcn/ui, PWA (manifest + SW). Taste: personal/intentional, momentum via real progress — never generic motivational copy | `replit.md`, §5 below |
| API | Express 5 (`artifacts/api-server`), esbuild CJS→ESM bundle | Appendix A |
| DB/ORM | Supabase Postgres (target; Replit PG kept as rollback until cutover verified) + Drizzle; RLS enforced per-request via `runWithRls` + Clerk JWT (`auth.jwt()->>'sub'`, never `auth.uid()`) | `AUDIT.md` 2026-09-12 |
| Auth | Clerk native (third-party-auth integration), `requireAuth` on everything except `GET /healthz` | `VERIFICATION_REPORT.md` §2 |
| Scheduling | `pg_cron` + `pg_net` calling job functions — **not** Replit Scheduled Deployments (wrong billing shape for 5–10 min jobs) | `docs/01 §4–5` |
| Reminders | Telegram bot **primary** (free, two-way `done`/`snooze 1h`/`list today`), Web Push/VAPID secondary (iOS 16.4+ only if installed; unreliable after restarts), email digest fallback | `docs/01 §10` |
| Agent/memory | Not built. Design: one agent, two front doors (in-app chat + Telegram), tool surface mirroring UI CRUD; memory tiers in-context / semantic (`pgvector`) / structured (`memory_facts`); `pgvector`-first, Mem0 only if outgrown | `docs/01 §11`, `docs/03 §7` |
| LLM | **Open:** Claude / OpenAI / Gemini — `docs/01 §12` Q3 explicitly undecided. No gateway decision exists in the corpus (see Unreconciled) | `docs/01 §12` |

Full reasoning: `docs/01 §4–5`. Original "start at Phase 0" framing in docs 02/03 is stale only in that Phases 0–1 core already exists — their stack, rules, and checklists below remain authoritative.

## 4. Global rules — do and don't (no `spec/10` exists; these are the highest-value rules grounded in the real corpus)

- **Zero trust is the default posture** (`docs/06`): treat `PROGRESS.md`, `AUDIT.md`, and any prior agent summary as unverified hypotheses. Evidence = you opened the file, read the logic, checked the schema, or ran the command. Can't produce evidence → claim is **unverified**, say so plainly, don't round up.
- **Verification-only means verification-only** (`docs/06`): when auditing, do not add features, refactor, or "helpfully" fix. Produce the report (`VERIFICATION_REPORT.md`, separate file — never overwrite `AUDIT.md`/`PROGRESS.md`) and stop.
- **Confirm scope before each phase; completion report after** (`docs/03 §9`): 2–3 sentence pre-statement with assumptions; post-report covering built / actually-tested / explicitly-not-done / deviations. Then stop for confirmation before the next phase.
- **Maintain `PROGRESS.md` + `AUDIT.md` after every phase** (`docs/03 §9`): statuses only Not started / In progress / Done / Blocked. `AUDIT.md` is a dated log — what changed, why, schema migrations, manual steps owed. Never silently overwrite either.
- **Ask, don't guess** (`docs/03 §9`): any genuinely ambiguous or hard-to-reverse decision — schema changes, anything that could delete real data or send real notifications while testing.
- **Never mark Done without listing what you actually tested** (`docs/03 §9`); never move silently — every automated change logs + notifies with one-tap undo (`docs/01 §9` rule 7, §7 principle 3).
- **Secrets live in env/Secrets, never code or repo** (`docs/03 §3`, `docs/02 §16`): Supabase/Telegram/VAPID/LLM/email keys; server-only keys never `VITE_`-prefixed. `.gitignore` blocks `.env*` except `.env.example`.
- **One module per agent conversation/PR** — never prompt three modules at once (`docs/02 §17`). Build strictly in order; each phase usable alone (`docs/02 §1`).

## 5. Design system essentials (`docs/03 §2` is authoritative; this is the dense version)

Apple HIG — **Clarity, Deference, Depth**. Quality bar: Things 3 + Apple Reminders/Clock/Timer; "Apple-like" = actual HIG + Liquid Glass restraint, not "clean and white."

| Role | Light | Dark | Use for |
|---|---|---|---|
| Background | `#F5F5F7` | `#000000` | App background |
| Surface / card | `#FFFFFF` | `#1C1C1E` | Cards, panels |
| Primary text | `#1D1D1F` | `#F5F5F7` | Headlines, body |
| Secondary text | `#6E6E73` | `#98989D` | Captions, metadata |
| **Accent — energy** | `#FF9500` | `#FF9F0A` | **Primary CTAs, Start buttons, active timers, streaks** (Apple's Clock/Timer color — the "give me energy to start" color) |
| Success | `#34C759` | `#30D158` | Completions — always with a real animation (dopamine hit) |
| Urgent / overdue | `#FF3B30` | `#FF453A` | **Overdue/at-risk only** — overuse makes the app feel anxious |
| Links / secondary | `#007AFF` | `#0A84FF` | Secondary buttons, links |
| AI / agent content | `#5E5CE6` | `#5E5CE6` | Indigo tag on anything the agent did — always tellable apart from user actions |

(Hexes are close community-standard approximations of Apple's adaptive tokens, not literal Apple source.) Type: `-apple-system, SF Pro Display/Text` on Apple, **Inter** elsewhere; 17px body / 34px page titles / ~22px sections / ~13px captions. 8px grid everywhere; 44×44px minimum tap targets; concentric-feel radii (larger on cards/sheets, smaller on buttons/chips). **Dark mode is the default**, first-class, not an afterthought. Glass (`backdrop-blur` + 1px border + soft shadow) for chrome (nav, modals, capture sheet) only — never body content. **Signature element: Activity Rings** (tasks done / rounds done / streak) on Today — momentum via rings + real numbers, never filler copy. Motion: spring-based, completion micro-interaction (checkbox fills, checkmark draws, rings update live), smooth sheet transitions. **Energy-not-pretending rule:** the most prominent Today element is always a one-tap **Start** on what's next; no "You've got this!" copy anywhere.

## 6. Locked decisions (only what the corpus actually settles — open questions marked OPEN)

| Decision | Settled value | Source |
|---|---|---|
| Reschedule cap | **3** auto-moves per task, then flag "needs attention" | `docs/01 §9`, `docs/03 §6` |
| Automation dial | Off / Ask / Auto, per-task or global; off = flag only, ask = propose + confirm, auto = move + notify | `docs/01 §7,§9` |
| Dial default for new tasks | **OPEN** (`ask` vs `auto` — `docs/01 §12` Q6) | — |
| Timezone storage | UTC instant + **separate IANA identifier**; wall-clock rules evaluated in that zone; never raw offsets. Add a mid-trip zone-change test (DST test alone doesn't cover it) | `docs/04 §5b` |
| Default timezone value | **OPEN** (`Asia/Kolkata` appears only as an *example* in `docs/04 §5b`, never a decision; `docs/01 §12` Q5 open) | — |
| LLM choice / gateway | **OPEN** (`docs/01 §12` Q3); spend ceiling **OPEN** (`docs/01 §12` Q7 — only hard numbers in corpus: Supabase free 500MB + 7-day-idle pause, paid from $25/mo, `docs/04 §5a`) | — |
| Reschedule cadence | Sweep every 15–30 min + end-of-day run; batch, never thrash per-miss | `docs/01 §9`, `docs/03 §6` |
| Reminder tiers | T-1 day → T-1 hour → at-time → capped overdue nudges; quiet hours always respected | `docs/01 §10` |
| Memory approach | `pgvector` in existing Postgres; Mem0-class hosted only if outgrown; agent tools mirror UI CRUD exactly | `docs/01 §11`, `docs/03 §7` |
| Backend rule | Supabase for DB/Auth/cron/`pgvector` regardless of editor; code moves, Supabase doesn't | `docs/01 §4`, `docs/05` |
| RLS everywhere | `user_id`-scoped from day one even though single-user | `docs/01 §8`, `docs/03 §1` |
| Build discipline | Strict phase order; one module per conversation; 2 real weeks of use before anything beyond Tier 3 | `docs/02 §1,§17,§18` |
| App name | "Cadence" is a **placeholder** — rename freely | `docs/01` header, `§12` |

## 7. Build order (docs 02 §1 + 03 §8 — they agree; no revised order exists in-repo)

0. Environment (Supabase, auth, PWA shell) → 1. Task/project/tag CRUD + quick capture + Inbox/Today → 2. Calendar + drag-drop time blocking → 3. Focus Rounds + Ring stats → 4. Reminders tables + dispatcher + `pg_cron` + Telegram bot/webhook → 5. Reschedule engine + sweep → 6. Agent + memory → 7. Recurrence, goals, plan/close-day rituals → 8. Settings, analytics, export → 9. Full manual QA. Paste-ready prompt sequence: `docs/02 §17`. **Current:** step 0–1 core done (adapted stack); Batch-1 hardening + cutover checks are the immediate next; Phase-1 gaps after that: NL date parsing, projects/tags, subtasks, file links (`PROGRESS.md`).

## 8. Operating protocol

§4's rules, plus: **metrics proposal before Phase 3, not assumed** (`docs/03 §9`) — product (completion rate, rounds/day, on-time %, streak, reschedule frequency) and build (endpoints/functions added, reschedule-engine unit tests per rule — that module gets real test coverage, each §6 rule a test case — outstanding manual QA). **First scheduled job ships with its watchdog**: run-log table, missed-tick alert, global automation kill switch (`docs/04` Problem 2 — heartbeat/dead-man's-switch, cheap, currently absent). **No big-bang cutover**: paper + Cadence run in parallel under explicit criteria with a fallback trigger before daily reliance (`docs/04` Problem 3). **Re-audit cadence is unset in-corpus** — weekly re-audits during active build weeks are suggested practice only; `docs/06` is the procedure whenever one runs. Keep dev/prod Supabase projects separate while hacking the engine (`docs/02 §15`).

## 9. Manual-test backlog

Not duplicated — lives in `docs/02 §14` (full QA + security checklists) and `docs/02 §16` (all manual steps). Distrust-most-first: real-iPhone installed-PWA push, Telegram link → reminder → `done` reply, two-account RLS, sweep idempotency (run twice, expect no-op), backgrounded Focus timer, DST + mid-trip zone change, one full week of morning-plan/evening-close use.

## 10. Explicitly deferred — don't build without being asked

Hosted memory product (Mem0-class, `docs/01 §11`); Lovable hop (skipped deliberately, `docs/01 §4`); Google AI Studio as primary builder (rejected except single-feature prototypes, `docs/01 §4`); custom domain (optional, `docs/02 §16`). Paper-photo import is **not deferred — it's an open gap with no agreed approach** (`docs/04` Problem 4: classic OCR ~50% on real handwriting; vision-model + human-confirm draft queue is the realistic bar, undecided). No payments/billing, calendar-sync, or observability-vendor decisions exist anywhere in the corpus — raising them is fine, claiming they're "deferred" would be invented.

## 11. Repo governance

This file is canonical for OpenCode (auto-read every session). Replit and Antigravity do **not** auto-read it — point those sessions here manually (`docs/05`, and `docs/05`'s editor-swap rules: code moves via GitHub, Supabase stays, secrets re-entered by hand every move). `docs/` is canonical prose; `spec/` mirrors 01–04 for audit-prompt paths (`docs/06` requires `spec/` paths — keep both in sync). `AUDIT.md` append-only dated log, oldest-first, never silently overwrite (`docs/06`, §4). `README.md` is the human entry point (what/why/how to run); this file is the agent entry point — `README.md` links here, don't duplicate it. `replit.md` is legacy run notes.

## Unreconciled — brief claims dropped or contradicted (do not re-add without sources)

1. **`spec/07` revised build order** — file absent; §§2–3/7 fall back to docs 02/03. If 07 appears, §7 must be rewritten from its §4.
2. **`spec/10 §1` global rules verbatim** — file absent; §4 substitutes corpus-grounded rules. If 10 appears, §4 must be replaced, not merged blindly.
3. **Reschedule cap `5`** — contradicts corpus twice (`docs/01 §9`, `docs/03 §6`: default **3**). Corpus wins.
4. **LiteLLM gateway / NVIDIA NIM → Groq/OpenRouter → HF fallback** — zero corpus hits (case-insensitive grep over all of `docs/` + `spec/`). §3 records the real open state instead.
5. **`Asia/Kolkata` default, dial-default `auto→ask`, streak-freeze declined, re-confirmation split, transparency-screen timing, nightly extraction, spend `₹300–500`, memory seed categories, bulk-confirm `10`** — all zero hits; several contradict `docs/01 §12` open questions. §6 marks them OPEN.
6. **`spec/07 §3` test backlog / doc-9 "Later" tier / Helicone-LangSmith / OCR vendor / GCal sync / billing** — absent; §9–10 point at what really exists.
7. **No `VERIFICATION_REPORT-2026-09-11.md` in `spec/`** — the report lives at repo root as `VERIFICATION_REPORT.md`; §2 links there.

## Appendix A — Repo mechanics (preserved from prior AGENTS.md, re-verified true 2026-09-15)

- **pnpm only.** Root `preinstall` (`scripts/enforce-pnpm.cjs`) deletes `package-lock.json`/`yarn.lock`, exits 1 under npm/yarn. Install: `pnpm install --frozen-lockfile`. Never touch `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` (supply-chain buffer; allowlist + remove after window).
- **Commands.** `pnpm run typecheck` = `tsc --build` (libs `@workspace/db`, `@workspace/api-client-react`, `@workspace/api-zod`) then per-package `typecheck` in `artifacts/**` + `scripts`. `pnpm run build` = typecheck first, then `pnpm -r --if-present run build`. Single package: `pnpm --filter <name> run <script>`. API: `pnpm --filter @workspace/api-server run dev` (port 5000, esbuild bundle + `node --enable-source-maps ./dist/index.mjs`, needs `DATABASE_URL`). Web: `pnpm --filter @workspace/cadence run dev` — Vite **throws without `PORT` + `BASE_PATH`**.
- **Layout.** `artifacts/cadence` (React+Vite app) · `artifacts/api-server` (Express 5, `build.mjs`) · `artifacts/mockup-sandbox` (throwaway previews — never import from it) · `lib/api-spec/openapi.yaml` (**contract source of truth**; `lib/api-client-react` = react-query `baseUrl: /api` + `customFetch` mutator, `lib/api-zod` = Orval output — never hand-edit `src/generated/`) · `lib/db/src/schema/` (`tasks.ts`, `focus-sessions.ts`) · `lib/db/migrations/0001_supabase_rls_hardening.sql` (**owner-run in Supabase dashboard**, not via drizzle-kit).
- **Codegen/DB order.** After `openapi.yaml` edits, regenerate on Linux/Replit: `pnpm --filter @workspace/api-spec run codegen` (also runs `typecheck:libs`). Orval pins Zod v3 (`orval.config.ts`) though catalog resolves zod v4 — do not "fix." Schema changes (dev only): `pnpm --filter @workspace/db run push` (both it and `lib/db/src/index.ts` throw without `DATABASE_URL`).
- **Isolation (load-bearing).** New task/focus handlers **must** use `runWithRls(req, tx => …)` (`artifacts/api-server/src/lib/rls.ts`) — owner-level `Pool` bypasses RLS alone; fail-closed (no token → match-nothing claims). Keep app-layer `where user_id = ?`. `GET /healthz` public, rest behind `requireAuth`. CORS allowlist from `CORS_ORIGINS` (default `http://localhost:5173`) — never `origin: true`.
- **Platform.** Primary dev Replit/Linux; workspace strips non-linux esbuild/rollup/lightningcss/tailwind-oxide binaries — Windows best-effort. On Windows `pnpm run` may abort (`ERR_PNPM_IGNORED_BUILDS`); verify via `node node_modules/typescript/bin/tsc`, and run `pnpm approve-builds` only on Replit/Linux.
- **Verification.** Zero `*.test.*`, no lint/CI. Green = `pnpm run typecheck` on Linux/Replit + live checks (signed-out `/api/tasks` → 401 with `/healthz` public; two-account isolation).
