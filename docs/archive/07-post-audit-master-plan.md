# Post-Audit Master Plan — Cadence

**Built from:** `VERIFICATION_REPORT-2026-09-11.md` (the real audit OpenCode ran) + docs 1, 2, 4.
**What this replaces:** doc 2 §1's phase order — that assumed a blank repo. This plan starts from what's actually there, verified, right now.

---

## 0. The one decision that unblocks almost everything else

The report's single biggest finding: the real stack is **Clerk (auth) + Drizzle (ORM) + Express + Replit's own Postgres** — not the Supabase-based stack docs 1–3 speced. This wasn't a mistake to undo; it's real, working, well-built code (the report confirms: real CRUD, real auth checks, no mocks). But it left three spec-critical pieces with no home: RLS, `pg_cron`, `pgvector`.

**Resolution, checked and confirmed current:** Clerk has an **official, first-class Supabase integration** — Supabase accepts Clerk's session token directly as a third-party auth provider (no custom JWT template needed, this is the currently-recommended path, not a deprecated workaround). That means you don't have to choose between "keep Clerk" and "get Supabase" — you get both:

- **Keep Clerk exactly as built** (auth middleware, sign-in/up UI, protected routes — all verified real, zero rework).
- **Move the database from Replit's Postgres to Supabase's Postgres.** Point Drizzle's `DATABASE_URL` at the new instance, run the existing migrations there (schema doesn't need to change to move).
- **Turn on real RLS**, using the exact pattern Clerk's own docs specify: `user_id text not null default auth.jwt()->>'sub'` + `enable row level security` + policies keyed off that claim. This directly closes the report's #1 security gap (currently app-layer-only scoping, bypassable by anyone holding the raw connection string).
- **Enable `pgvector` and `pg_cron`** in the new Supabase project — both come free once the DB lives there, unblocking Agent+Memory and the reminder/reschedule engine exactly as originally speced.

**Do this first, before any other item below.** It's a database migration + a few hours of RLS policy work, not a rewrite — every route/UI/schema file the report verified as real stays as-is.

---

## 1. How scoring works (so "ready for next phase" isn't a vibe)

Every module gets scored on 5 gates. A module is genuinely done when it hits **5/5**; a phase is safe to build on top of when its modules are all at **4/5 or better** (docs lagging by a day is fine, a missing security or manual-test gate is not).

- **G1 — Code implements the spec'd behavior**, not a stub/mock (verified by the report's mock/stub search where available)
- **G2 — DB schema matches the spec** (tables, columns, constraints — not just "a table exists")
- **G3 — Security/isolation verified** (real RLS or an explicitly documented equivalent, plus a live test — not just "the code looks scoped")
- **G4 — Manual test(s) actually run and passed** (the things code alone can't prove — see §3)
- **G5 — `PROGRESS.md`/`AUDIT.md` say the true thing**, not a stale or aspirational status

G1–G3 below are filled in from the verification report's evidence. **G4 boxes are unchecked on purpose — that column is yours to fill in as you actually run each manual test.**

---

## 2. Module-by-module scorecard

| Module (spec §) | G1 Code | G2 Schema | G3 Security | G4 Manual test (you) | G5 Docs | Score | Verified state, one line | Expected output when actually done |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|---|
| **0 — Security/data hardening** *(new — surfaced by audit, wasn't its own module before)* | ✅ | ❌ | ❌ | ☐ | ❌ | **1/5** | `demo-user` default present, no FK on `focus_sessions.task_id`, status/priority are unconstrained text, CORS wide open, isolation model undecided | Punch-list items 1–4 fixed; isolation model chosen (RLS, via §0 above) and documented |
| **Phase 0 — Environment (§2)** | ✅ | — | ⚠️ | ☐ | ❌ | **2/5** | Real stack, but it's the adapted one (Clerk/Drizzle/Express), undocumented as a decision | §0 above executed and written up in `AUDIT.md` as a decision, not left implicit |
| **Auth & onboarding (§3)** | ⚠️ | ❌ | ✅ | ☐ | ⚠️ | **3/5** | Auth is real and correctly enforced (401s verified route-by-route). Onboarding (working hours, quiet hours, automation defaults) doesn't exist | Onboarding flow seeding `users.timezone`/`working_hours`/`quiet_hours`/automation default — this is a prerequisite for reminders, not just a nice screen |
| **Task CRUD & quick capture (§4)** | ⚠️ | ⚠️ | ❌ | ☐ | ❌ | **2/5** | Core CRUD real end-to-end, no mocks. NL date parsing, projects/tags, subtasks, file links all missing. "RLS-tested" claim has no test behind it | NL quick-add parsing at minimum; two-account isolation test run and passing; `PROGRESS.md` corrected to "core complete, extras pending" |
| **Calendar & time blocking (§5)** | ⚠️ | ❌ | — | ☐ | ❌ | **2/5** | Month/Week/Day shell is real (counts per day). No drag-drop, no `time_blocks` table, no backlog scheduling. `PROGRESS.md` says "Planned" — wrong, it undersells what exists | `time_blocks` table + drag-to-schedule from backlog; `PROGRESS.md` corrected to reflect the shell that already exists |
| **Focus Rounds (§6)** | ✅ | ✅ | — | ☐ | ❌ | **3/5** | Best-built module besides Auth/CRUD — persisted sessions, start/pause/resume/finish all real. No daily round target/Activity Ring yet. `PROGRESS.md` says "Planned" — also wrong, undersells it | Background/reopen manual test passed; Activity Ring stats widget; `PROGRESS.md` corrected |
| **Reminders & notifications (§7)** | ❌ | ❌ | — | ☐ | ✅ | **1/5** | Verified not started, correctly reported | Built *with* heartbeat monitoring + kill switch from the first commit (see File 2 for the monitoring tool) — not bolted on after |
| **Auto-reschedule engine (§8)** | ❌ | ❌ | — | ☐ | ✅ | **1/5** | Verified not started, all 8 rules absent, correctly reported | Do not start until Auth §3's onboarding (timezone/working hours) and §7's heartbeat exist — the report says this explicitly |
| **Agent + memory (§9)** | ❌ | ❌ | — | ☐ | ✅ | **1/5** | Verified not started, correctly reported | Unblocked once §0 gives you `pgvector`; build spend-tracking in the same PR (doc-4 §5a) |
| **Monthly planning/recurrence/rituals (§10)** | ⚠️ | ❌ | — | ☐ | ⚠️ | **1/5** | Only a Review-ledger shell exists (today's counts). No recurrence, goals, or plan/close-day rituals | RRULE support + plan-my-day/close-my-day flows |
| **Task links & attachments (§11)** | ❌ | ❌ | — | ☐ | ❌ | **1/5** | Only a plain `notes` text field — incorrectly bundled under CRUD's "Complete" status | Split out of the CRUD status claim; `task_links` table + URL/file support |
| **Settings & personalization (§12)** | ❌ | ❌ | — | ☐ | ✅ | **1/5** | Verified not started, correctly reported | Pull this **forward** in priority — it's a prerequisite for §7/§8, not late polish |
| **Analytics & insights (§13)** | ⚠️ | — | — | ☐ | ✅ | **2/5** | `/tasks/summary` gives real counts + focus minutes for one day. No trends/streaks — correctly not over-claimed | Fine to leave last; nothing else depends on it |
| **Reproducible builds (new)** | ❌ | — | — | ☐ | — | **0/5** | `pnpm run typecheck` couldn't run on Windows (`preinstall` needs `sh`); "Tested: full typecheck" in `PROGRESS.md` has no reproducible evidence | Fix `preinstall` for Windows or document Linux-only dev; re-run and record output |

Legend: ✅ pass · ⚠️ partial · ❌ fail/absent · — not applicable to this module

---

## 3. Your manual-test backlog (the report's punch-list item 9, turned into a checklist)

Code review can't confirm these — only you, running the app, can. Check each off in the G4 column above as you go:

- [ ] **(a)** Signed-out request to `/api/tasks` returns 401 while `/healthz` stays public — 5 minutes, do this first
- [ ] **(b)** Two-account isolation, live: create a second account, confirm it can never read/write the first account's tasks — do this **before** trusting any RLS/isolation claim again
- [ ] **(c)** PWA install + push check on a real iPhone (installed to home screen) and a real Android phone — expect iOS limits per doc 1 §10, which is exactly why Telegram is the primary channel once §7 exists
- [ ] **(d)** Focus timer: start a round, background the app, reopen it, confirm the timer state survived
- [ ] **(e)** One real week of daily use with the morning-plan/evening-close ritual done on **paper**, in parallel — this doubles as the parallel-run trial doc 4 §3 called for

---

## 4. The revised build order (supersedes doc 2 §1 — this is where you actually are)

1. **Architecture decision (§0 above)** — migrate DB to Supabase, keep Clerk, turn on RLS, enable `pgvector` + `pg_cron`. Write it into `AUDIT.md` as a dated decision.
2. **Security/data hardening (punch-list 1–5):** remove `demo-user` default, add the missing FK + DB-level constraints, tighten CORS, document the auth scheme in `openapi.yaml`, correct `PROGRESS.md`'s stale entries (Calendar, Focus, CRUD).
3. **Fix reproducible builds** (Windows `preinstall`, or document Linux-only dev) — cheap, and you can't trust future "tested" claims without it.
4. **Onboarding + Settings, merged**: `users.timezone` (IANA) + `working_hours`/`quiet_hours` + automation-mode default. This single step closes doc-4 §5b (the live timezone bug) and unblocks everything below it.
5. **Reminders + heartbeat monitoring, built together** (not sequentially) — the dispatcher and its dead-man's-switch/kill-switch ship in the same PR (see File 2 for the specific tool).
6. **Auto-reschedule engine** — now safe to build, all 3 prerequisites (timezone, working hours, heartbeat) exist.
7. **Calendar time-blocking** (`time_blocks`, drag-drop) — can run in parallel with 5–6, it's UI-side.
8. **Telegram bot wiring** — extends the reminders channel built in step 5.
9. **Agent + memory** — `pgvector` already live from step 1; build the spend-tracking log in the same PR.
10. **Recurrence, monthly goals, plan/close-day rituals.**
11. **Task links/attachments; remaining Tier-1 CRUD extras** (NL parsing, projects/tags, subtasks).
12. **Paper-photo-import feature** (doc-4 §4) — low urgency per the report, but worth having on the list; see File 2 for the actual approach.
13. **Analytics/export polish.**
14. **Full manual QA pass + the week-long parallel-run trial** (§3 above) before calling this a daily-reliance replacement for paper.

Don't start a step until the previous one's modules are at 4/5+ in the scorecard above — that's the literal, checkable version of "score how much is needed to go to next phase."

---

*File 2 (`08-integrations-and-solutions-research.md`) covers the actual tool/service choice for every integration this plan now depends on — monitoring, the DB move, messaging, LLM, and everything else — plus the researched solution for each of doc 4's five problems.*
