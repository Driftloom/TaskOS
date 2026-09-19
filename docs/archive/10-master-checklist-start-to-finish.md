# Master Checklist — Cadence, Start to Finish

**Built from a full pass over all 9 docs + `VERIFICATION_REPORT-2026-09-11.md`.** Nothing here is new invention — every line traces back to a doc/section noted in brackets. Verified twice against the source docs before delivery (see §12 at the bottom for what that check covered). If something you remember from an earlier doc isn't here, flag it — that's a real miss, not an intentional cut.

**Legend:** `[A]` = the coding agent (Replit/OpenCode) does this · `[Y]` = you do this manually · `[B]` = both, agent proposes, you confirm.

---

## 1. Global rules — read this before touching anything else

### Always do
- [ ] `[B]` **Zero trust, permanently.** Every status claim (PROGRESS.md, AUDIT.md, a prior agent's own summary) is unverified until it's independently checked — this isn't a one-time audit posture, it's the standing rule now. `[doc 6, doc 9 §0]`
- [ ] `[A]` **Never move a fixed/immovable calendar event**, under any automation mode. `[doc 1 §9 rule 1]`
- [ ] `[A]` **Never silently reschedule or bulk-edit.** Every automated move or agent bulk-action logs what changed and notifies — no silent diffs, ever. `[doc 1 §9 rule 7, doc 9 #2]`
- [ ] `[A]` **Confirm before any bulk agent action touching more than 10 tasks.** `[doc 9 #2]`
- [ ] `[A]` Log every agent action (create/edit/delete/reschedule) to `agent_action_log` with enough data to reverse it, and expose an "undo last agent action" command in both the chat panel and Telegram. `[doc 9 #2]`
- [ ] `[Y]` Re-run the zero-trust audit (`06-opencode-zero-trust-audit-prompt.md`) **weekly during active build weeks**, not once. `[doc 9 §0]`
- [ ] `[Y]` Keep the parallel-run rule live: paper stays your primary until 2 weeks pass, or 7 consecutive days where every paper item also appears correctly in Cadence — whichever is longer. Any real missed deadline during the trial resets the clock. `[doc 4 §3, doc 8 problem 3]`

### Never do
- [ ] Don't overwrite `AUDIT.md` or `PROGRESS.md` when running an audit — write a new dated report file instead, so before/after is comparable. `[doc 6]`
- [ ] Don't add features or "helpfully" fix things during an audit pass — audit sessions verify and report only. `[doc 6]`
- [ ] Don't build Reminders or the Auto-reschedule engine before timezone + working/quiet hours + the monitoring heartbeat all exist. `[VERIFICATION_REPORT punch list #8, doc 7 step 6]`
- [ ] Don't use Replit's own database — Supabase is the one constant backend across every editor. `[doc 5]`
- [ ] Don't leave a Supabase test/scratch branch running after you're done with it — it bills ~$0.32/day. `[doc 9 #8]`
- [ ] Don't rely on push notifications alone — iOS PWA push is unreliable enough that Telegram stays the primary channel. `[doc 1 §10]`
- [ ] Don't auto-file anything from the paper-photo-import feature — draft tasks always go through a confirm-before-save queue. `[doc 4 §4, doc 8 problem 4]`
- [ ] Don't add these right now — Helicone/LangSmith, a dedicated OCR vendor, Google Calendar sync, any payments/billing integration. Explicitly deferred until the self-built versions actually become a bottleneck. `[doc 8 "What NOT to add"]`
- [ ] Don't let a single missed reminder replay as N separate pings after you've been away a few days — batch into one catch-up summary instead. `[doc 9 #9]`
- [ ] Don't communicate task status through color alone — every status color pairs with an icon/shape too (colorblind-safe). `[doc 9 #3]`
- [ ] Don't treat this checklist itself as gospel forever — it goes stale the same way `PROGRESS.md` did, hence the weekly re-audit rule above.

---

## 2. Pre-flight — accounts & keys (do this before any build work)

- [ ] `[Y]` Supabase account + project created, URL/keys noted
- [ ] `[Y]` Clerk — already live per the audit, nothing new to create
- [ ] `[Y]` GitHub repo connected (already true per your screenshot) + GitHub Actions enabled
- [ ] `[Y]` Telegram bot created via `@BotFather`, token noted; your own Telegram user ID noted via `@userinfobot`
- [ ] `[Y]` VAPID keypair generated for Web Push
- [ ] `[Y]` NVIDIA NIM API key from `build.nvidia.com` (free, no card)
- [ ] `[Y]` Hugging Face access token (free)
- [ ] `[Y]` Groq and/or OpenRouter API key (free tier, fallback in the chain)
- [ ] `[Y]` Resend or SendGrid API key
- [ ] `[Y]` Healthchecks.io account (free tier)
- [ ] `[Y]` Sentry account (free tier)
- [ ] `[Y]` OpenCode installed locally, repo cloned, secrets re-entered there too (they don't travel via git — see doc 5)
- [ ] `[Y]` All of the above kept in one private note outside the repo, not just in your head

---

## 3. THE architecture decision — do this before any new module work

- [ ] `[Y]` Confirm Clerk's official Supabase third-party-auth integration steps (Clerk dashboard → Supabase connector)
- [ ] `[A]` Point Drizzle's `DATABASE_URL` at the new Supabase Postgres instance; run existing migrations there unchanged
- [ ] `[A]` Enable Row Level Security on every table, policy keyed on `auth.jwt()->>'sub'` matching Clerk's user ID
- [ ] `[A]` Enable `pgvector` extension in the Supabase dashboard
- [ ] `[A]` Confirm `pg_cron` + `pg_net` are enabled
- [ ] `[Y]` Write this decision into `AUDIT.md` as a dated entry — this is the fix for the "undocumented stack drift" the audit flagged, don't let it happen silently a second time
- [ ] `[Y]` **This week's actual bar (nothing past this until it's true):** signed-in Today view + typed quick-add + one real Telegram reminder firing for one real deadline you have. Nothing else. `[doc 9 #1]`

---

## 4. Security & data hardening *(the audit's punch-list items 1–5 — highest priority after §3)*

- [ ] `[A]` Remove the `demo-user` default value on the user-id column
- [ ] `[A]` Add the missing foreign key on `focus_sessions.task_id`
- [ ] `[A]` Convert `status`/`priority` from free text to real DB-level enums/constraints
- [ ] `[A]` Tighten CORS from `origin: true` to the actual allowed origin(s)
- [ ] `[A]` Document the auth scheme in `openapi.yaml`
- [ ] `[B]` Explicitly decide and implement the isolation model as RLS (via §3), not app-layer-only scoping
- [ ] `[Y]` **Manual test:** create a second account, confirm it can never read/write the first account's data — do this before trusting any isolation claim again
- [ ] `[Y]` **Manual test:** signed-out request to `/api/tasks` → 401, while `/healthz` stays public
- [ ] `[A]` Correct `PROGRESS.md`'s stale entries — Calendar and Focus Rounds are both *further along* than currently marked, CRUD's "Complete" status needs splitting (core is real, extras like NL parsing/tags/subtasks/links aren't)

---

## 5. Reproducible builds *(audit punch-list item 7)*

- [ ] `[A]` Fix the Windows `preinstall` script (it currently shells out with `sh`, which doesn't exist there) — or explicitly document Linux-only dev and move on
- [ ] `[A]` Set up a GitHub Actions workflow running `pnpm run typecheck` (and future tests) on every push, on Linux, so verification is reproducible somewhere consistent regardless of whose machine is building
- [ ] `[Y]` Re-run typecheck after the fix and keep the actual output as evidence — "should pass" isn't evidence, a logged run is

---

## 6. Onboarding + Settings *(pulled forward — this is a prerequisite for Reminders/Reschedule, not late polish)*

- [ ] `[A]` `users.timezone` (IANA string) column — default **`Asia/Kolkata`**, confirmed
- [ ] `[Y]` **Still open — needs your real numbers:** actual working hours (e.g., "9am–11pm")
- [ ] `[Y]` **Still open — needs your real numbers:** actual quiet hours (e.g., "12am–7am")
- [ ] `[A]` `automation_mode` default = **`auto` on the first miss, auto-downgrades to `ask` if the same task needs a second reschedule** (updated hybrid — see doc 1 §9 rule 6)
- [ ] `[A]` 3-step onboarding flow: working hours/quiet hours → automation default → optional Telegram linking code
- [ ] `[A]` Full Settings screen: the above + notification channel toggles + theme + data export (JSON/CSV)
- [ ] `[Y]` **Manual test:** re-running onboarding from Settings updates the same row, doesn't duplicate it

---

## 7. Task CRUD & quick capture

- [ ] `[A]` Core CRUD — verified real by the audit; re-confirm nothing regressed
- [ ] `[A]` Natural-language quick-add parsing (dates, `#tags`)
- [ ] `[A]` Projects & tags
- [ ] `[A]` Subtasks
- [ ] `[A]` `task_links` table — URL (with title/favicon fetch if easy), file upload via Supabase Storage, freeform note — currently only a plain notes field exists, this was mis-bundled under CRUD's "Complete" claim
- [ ] `[A]` Full-text search using Postgres `tsvector`/`to_tsvector` — no separate search service needed at this scale `[doc 9 #7]`
- [ ] `[A]` Archive: completed tasks past N days get an `archived` flag, drop out of default views, stay fully queryable `[doc 9 #7]`
- [ ] `[Y]` **Manual test:** two-account isolation (cross-reference §4)

---

## 8. Calendar & time blocking

- [ ] `[A]` Month/Week/Day shell — verified real (per-day counts); currently `PROGRESS.md` undersells this as "Planned," correct it
- [ ] `[A]` `time_blocks` table — currently missing entirely
- [ ] `[A]` Drag-and-drop scheduling from an "unscheduled" backlog panel
- [ ] `[A]` Drag-to-resize / drag-to-move on existing blocks
- [ ] `[Y]` **Manual test:** schedule something across a DST boundary if your locale observes one
- [ ] `[Y]` **Manual test:** simulate a timezone change (mid-trip scenario) and confirm working/quiet hours evaluate in the *current* zone correctly `[doc 4 §5b, doc 7 §3]`

---

## 9. Focus Rounds (timers)

- [ ] `[A]` Persisted sessions, start/pause/resume/finish — verified real by the audit, best-built module besides Auth/CRUD
- [ ] `[A]` Daily round target
- [ ] `[A]` Activity Ring stats widget on the Today screen (one ring for tasks done, one for rounds, optional streak ring) `[doc 3 §2]`
- [ ] `[A]` Correct `PROGRESS.md` — currently says "Planned," which undersells what's already real
- [ ] `[Y]` **Manual test:** start a round, background the app, reopen it, confirm timer state survived

---

## 10. Reminders & multi-channel notifications

- [ ] `[A]` `reminders`, `notification_channels`, `notification_log` tables
- [ ] `[A]` `reminder-dispatcher` Edge Function — reads due reminders, checks channel prefs + quiet hours, sends via Web Push / Telegram `sendMessage` / email, logs every attempt
- [ ] `[A]` `pg_cron` schedule for the dispatcher (every 5–10 min)
- [ ] `[A]` **Healthchecks.io ping built into the dispatcher from the very first commit** — not bolted on later. Every successful run pings a unique Healthchecks.io URL; a missed check-in alerts you, ideally straight into the same Telegram bot `[doc 8 problem 2, doc 4 §2]`
- [ ] `[A]` A manual kill switch — `automation_paused` flag checked first by every dispatcher/sweep function, no-ops if set
- [ ] `[A]` Telegram webhook handler — two-way commands: `done`, `snooze 1h`, `list today`
- [ ] `[A]` Escalation tiers (T-1 day → T-1 hour → at-time → overdue nudge) + quiet-hours suppression
- [ ] `[A]` Catch-up batching: if more than N reminders are pending on reopen after an absence, send one summary instead of replaying each individually `[doc 9 #9]`
- [ ] `[Y]` **Still open:** a real task/deadline to wire up as the actual first live reminder test
- [ ] `[Y]` **Manual test:** PWA install + push on a real Android phone
- [ ] `[Y]` **Manual test:** PWA install + push on a real iPhone (installed to home screen) — expect this one to disappoint you, which is exactly why Telegram is primary

---

## 11. Auto-reschedule engine

- [ ] `[A]` Trigger: sweep every 15–30 min via `pg_cron`, plus one end-of-day run, for tasks whose time block passed without completion or a logged focus round
- [ ] `[A]` Rule: never touch fixed/immovable events
- [ ] `[A]` Rule: respect working hours + quiet hours (requires §6 done first)
- [ ] `[A]` Rule: search forward within the task's flexibility window for a matching-duration slot
- [ ] `[A]` Rule: priority-weighted placement
- [ ] `[A]` Rule: cap at 5 auto-moves per task (loosened from an initial 3, per your call), then flag "needs attention" instead of continuing
- [ ] `[A]` Rule: hybrid automation dial — `off` only flags, `ask` proposes-and-waits, `auto` (default) moves on the 1st miss and auto-downgrades to `ask` on a 2nd miss of the same task
- [ ] `[A]` Rule: every move writes to `reschedule_log` and sends one human-readable notification — never silent
- [ ] `[A]` Rule: batched on a fixed cadence, not instant per-miss
- [ ] `[A]` Unit tests for each individual rule above — this module gets real test coverage, not just manual eyeballing `[doc 3 §9]`
- [ ] `[Y]` **Gate:** do not start this module until timezone, working/quiet hours, and the Healthchecks.io heartbeat all exist and are verified

---

## 12. Agent + memory

- [ ] `[A]` LiteLLM gateway configured: **NVIDIA NIM primary** (free, OpenAI-compatible, larger hosted models support real function calling) → **Groq/OpenRouter fallback** → **Hugging Face tertiary**
- [ ] `[A]` `pgvector`-backed `memory_embeddings` for semantic recall of freeform notes/conversation
- [ ] `[A]` `memory_facts` structured table for durable learned patterns (real task durations vs. estimates, actual deep-work hours, recurring commitments) — `value` as `JSONB`, plus `source` [behavioral|conversational], `evidence_count`, `confidence`, `last_reinforced_at`, `archived` `[doc 11 §3]`
- [ ] `[A]` Nightly `pg_cron` extraction job — Source A (behavioral: duration-vs-estimate, day-of-week patterns from real task/focus_session data, no LLM call needed) + Source B (conversational: one batched LLM call over the day's agent conversations) `[doc 11 §2.1–2.2]`
- [ ] `[A]` Four confirmed seed fact categories guaranteed from day one — task-type procrastination, channel responsiveness (Telegram vs push), soft recurring commitments, hackathon-mode shifts (hybrid: explicit trigger + behavioral backup) — **plus an open-ended extraction pass, not capped to this list** `[doc 11 §2.1]`
- [ ] `[A]` Re-confirmation split by source: behavioral facts auto-update, conversational facts prompt you before updating/archiving `[doc 11 §2.5]`
- [ ] `[A]` **"What Cadence knows about me" screen — build in this same pass, not deferred:** list of active facts, source, confidence, manual edit/delete `[doc 11 §4c]`
- [ ] `[A]` **Reschedule-engine rule 9 (new):** before placing/estimating a task, check `memory_facts` for a matching tag/project pattern and adjust the effective duration or flag it back for confirmation `[doc 11 §4a]`
- [ ] `[A]` Retrieval budget: core-profile facts + query-relevant facts + top-K semantic matches, capped, not the whole table dumped into context `[doc 11 §2.4]`
- [ ] `[A]` `agent` Edge Function with tool/function calling mirroring the exact same CRUD operations the UI uses
- [ ] `[A]` In-app chat panel + Telegram wiring, both hitting the same Edge Function
- [ ] `[A]` `agent_action_log` + "undo last agent action" command, both surfaces
- [ ] `[A]` Confirm-gate for any agent action touching >10 tasks at once
- [ ] `[A]` `llm_usage` table logging tokens/estimated cost per call; weekly `pg_cron` job sums trailing 30 days and sends a Telegram alert past a threshold
- [ ] `[Y]` **Still open:** confirm a safety-net alert threshold (proposed ~₹300–500/mo, since the actual goal is $0 via free tiers, not a real budget)
- [ ] `[Y]` **Still open:** confirm the product-metrics list (task completion rate, focus rounds/day, on-time %, streak, reschedule frequency) — proposed in doc 3 §9, never explicitly confirmed
- [ ] `[Y]` **Manual test:** multi-turn conversation, new session days later, confirm it actually recalls something — not just in-context memory within one session
- [ ] `[Y]` **Manual test:** deliberately vague instruction ("clean up my week") — confirm it asks a clarifying question or proposes a plan instead of silently bulk-editing
- [ ] `[Y]` **Manual test:** synthetic pattern check — mark several tasks with a known artificial pattern, run extraction, confirm the resulting fact matches `[doc 11 §6]`
- [ ] `[Y]` **Manual test:** create a task matching a high-confidence fact's pattern, confirm the reschedule engine/agent visibly behaves differently because of it — the real acceptance bar for rule 9 `[doc 11 §6]`

---

## 13. Recurrence, monthly goals & rituals

- [ ] `[A]` RRULE-based recurrence, rolling-window generation (e.g., always the next 60 days materialized, not years up front)
- [ ] `[A]` Monthly goals + rollup from linked task completion
- [ ] `[A]` "Plan my day" (morning) and "close my day" (evening) guided flows
- [ ] `[A]` Weekly view + "plan my week" entry point
- [ ] `[Y]` Track the parallel-run trial (§1) through this module specifically — the evening close ritual is where paper-vs-app comparison actually happens day to day

---

## 14. Paper-photo-import *(low urgency — build whenever, not blocking anything)*

- [ ] `[A]` Photo upload to Supabase Storage
- [ ] `[A]` Vision-capable call through the same LiteLLM chain (confirm which fallback models actually support image input — not all of them will; this needs checking against whatever's live in the chain at build time) to extract draft tasks with a confidence flag per item
- [ ] `[A]` Confirm-before-save queue — **never** auto-file
- [ ] `[Y]` Test it against a real messy page from your own tracker, not a clean typed sample

---

## 15. Analytics & insights

- [ ] `[A]` Completion rate, focus-time trend, current streaks
- [ ] `[A]` "What slipped and why" pulled from `reschedule_log`, grouped by reason
- [ ] ~~Streak-freeze~~ — **decided: no.** Streaks stay strict, a missed day resets it. Nothing to build here.
- [ ] `[Y]` Sanity-check the numbers against a manual count from raw tables for at least one real week before trusting the dashboard

---

## 16. Accessibility & design polish

- [ ] `[A]` Every status color paired with an icon/shape — never color alone (fixes the red/green/orange colorblind gap in the original palette)
- [ ] `[A]` 44×44px minimum tap targets everywhere
- [ ] `[A]` Dark mode as the default, not an afterthought
- [ ] `[A]` Spring-based motion, real completion micro-interaction, no generic motivational copy — momentum communicated through the Activity Rings and real numbers only `[doc 3 §2]`

---

## 17. Offline support *(do this before trusting Cadence at an actual event, not before)*

- [ ] `[A]` Service-worker cache layer for reads
- [ ] `[A]` Background Sync API (or a local-first library like Dexie.js over IndexedDB) to queue writes made offline
- [ ] `[Y]` **Manual test:** actually test this at a venue with bad wifi, not just airplane-mode at home

---

## 18. Backup & disaster recovery

- [ ] `[A]` Weekly GitHub Actions job runs `pg_dump`
- [ ] `[A]` Dump file sent to you as a Telegram document — zero new services, reuses two integrations you already have
- [ ] `[Y]` **Manual test:** actually restore from one of these dumps once, so "we have backups" isn't itself an unverified claim

---

## 19. Repo governance & process

- [ ] `[Y]` `AGENTS.md` kept as the canonical project-instructions file (OpenCode reads it automatically)
- [ ] `[Y]` One line in `README.md` pointing any tool/human at `AGENTS.md`
- [ ] `[Y]` Weekly re-audit scheduled during active build weeks (§1)
- [ ] `[Y]` If you switch editors again (OpenCode ↔ Antigravity ↔ Replit), follow doc 5's step-by-step exactly — secrets and `.replit`/`replit.nix` files don't travel automatically

---

## 20. Full manual QA + parallel-run close-out

- [ ] `[Y]` All manual tests above actually run and checked off (not assumed)
- [ ] `[Y]` Two-week or 7-consecutive-day clean parallel run with paper completed, per §1
- [ ] `[Y]` Only after that closes clean: stop carrying the paper tracker to events

---

## 21. Still-open questions — consolidated, one place

- [ ] Real working hours + quiet hours (numbers, not defaults) — §6
- [ ] A real task/deadline for the first live reminder test — §10
- [ ] Confirm the product-metrics list — §12

*(Resolved since the last pass: reschedule cap → 5, bulk-confirm threshold → 10, streak-freeze → declined, all new accounts → approved for setup.)*

---

## 22. Plan sanity-check

- [ ] Confirm the order in §3–§20 above still makes sense given your actual calendar right now (hackathon season, MLSS) — nothing here should push past the Friday bar in §3 this week
- [ ] Confirm nothing in this checklist contradicts an instruction already baked into `AGENTS.md`/the master prompt — if it does, the newer decision (this doc, and the Sept-13 conversation) wins, update `AGENTS.md` to match
- [ ] This checklist itself goes stale exactly like `PROGRESS.md` did — treat it as a living doc, not a one-time printout

---

**Verification note (the "check twice" pass):** every module in §7–§16 was cross-checked against its corresponding section in docs 1–3 for scope, against doc 7's scorecard for actual current state, and against doc 9 for the newer gap-fills — nothing from those nine docs was intentionally dropped. The one thing this checklist *can't* verify for you is whether the live repo still matches `VERIFICATION_REPORT-2026-09-11.md` — that's what §1's weekly re-audit rule exists to keep current.
