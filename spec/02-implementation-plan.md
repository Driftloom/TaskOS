# End-to-End Implementation Plan — Cadence (Personal Task & Time OS)

**Pairs with:** `01-idea-research-and-spec.md` (read that first — this doc assumes its decisions)
**Format:** phased roadmap → per-module (Research recap → Plan → Build → Manual steps → Testing) → cross-cutting concerns → master checklists

---

## 1. Phased roadmap

| Phase | Goal | Key deliverable |
|---|---|---|
| 0 | Environment & accounts | Supabase project, Replit project, Telegram bot, keys all live |
| 1 | MVP capture + tasks + calendar | You can replace paper for daily capture |
| 2 | Timers/Rounds + multi-channel reminders | You get nudged reliably, not just in-app |
| 3 | Auto-reschedule engine | Missed tasks fix themselves, visibly |
| 4 | Agent + memory | You can talk to it, it remembers patterns |
| 5 | Monthly planning + rituals + analytics | Long-horizon planning + review habit |
| 6 | Hardening + real-device testing | Trustworthy enough for daily reliance |

Build strictly in this order. Each phase should be *usable* on its own — don't start Phase 2 until Phase 1 is something you'd actually use for a week.

---

## 2. Phase 0 — Environment & Accounts

**Research recap:** See §4 (updated) of the research doc — **Replit as the coding environment, Supabase as the backend** (Postgres/Auth/`pg_cron`/`pgvector`), Telegram as the reminder channel. Reschedule/reminder cron jobs run in Supabase's `pg_cron`, not Replit's Scheduled Deployments — cheaper and always-on for frequent jobs.

**Manual steps (must be done by you, not the AI builder):**
1. Create a **Supabase** account + new project. Note the project URL and anon/service keys.
2. Create a **Replit** account, start a new project (React template), and store the Supabase URL + anon key as Replit Secrets — don't hardcode them.
3. Create a **Telegram bot** via `@BotFather` in Telegram → get the bot token. Note your own Telegram numeric user ID (via `@userinfobot`) for later linking.
4. Generate **VAPID keys** for Web Push (any `web-push` CLI tool or Supabase's own guide does this in one command).
5. Pick an LLM provider for the agent (Anthropic/OpenAI/Gemini) and get an API key.
6. (Optional but recommended) Create a **GitHub** repo and connect Replit's Git pane to it — do this now, not after things get messy.
7. (Optional) Buy/point a custom domain if you want one; otherwise Replit's default deployment URL is fine to start.

**Build (first Replit Agent prompt):**
> "Create a new React + Tailwind + shadcn/ui project connected to Supabase (use the URL/anon key from Secrets). Set up email/password and Google auth via Supabase Auth. Create a PWA manifest and service worker skeleton so the app is installable on mobile."

**Testing:** Sign up, log in, log out, reload the page and confirm the session persists. Confirm the app can be "Added to Home Screen" on an Android phone and an iPhone.

---

## 3. Module: Auth & onboarding

**Plan:** Email/Google login (Supabase Auth handles both natively). A short onboarding flow that seeds `users.working_hours`, `quiet_hours`, and default `automation_mode` — don't skip this, it feeds directly into the reschedule engine and reminders from day one.

**Build prompt:**
> "Add a 3-step onboarding flow after signup: (1) set typical working hours and quiet hours, (2) set a default automation mode for auto-reschedule [off/ask/auto], (3) optionally link a Telegram account by generating a one-time linking code the user pastes into the bot."

**Manual steps:** None beyond what's in Phase 0.

**Testing:**
- New user signup → onboarding shows → values save to `users` table correctly.
- Skipping onboarding falls back to sane defaults (don't block the user from using the app).
- Re-running onboarding from Settings updates the same row, doesn't create duplicates.

---

## 4. Module: Quick capture & task CRUD

**Research recap:** This is the single most important screen — see §7 principle 1 in the research doc. Todoist's natural-language parsing is the bar to clear.

**Plan:** One always-visible quick-add input. Parse free text for date/time/recurrence/tags on the fly (e.g., "submit PS1 fri 6pm #hackathon"). Full task detail view for everything else (links, subtasks, project, priority, duration estimate, automation mode).

**Build prompts (sequence):**
1. "Create a `tasks` table in Supabase matching this schema: [paste schema from research doc §8]. Enable Row Level Security scoped to `user_id`."
2. "Build a quick-add bar, always visible at the top of the Today screen, that parses natural language for due date, time, and hashtag-style tags, and creates a task on Enter."
3. "Build a task detail drawer: title, notes, due date/time, duration estimate, priority, project picker, tag picker, subtasks, and a links section supporting URL, file upload (Supabase Storage), and freeform notes."
4. "Build Inbox, Today, and Projects list views. Support complete/snooze/delete swipe actions on mobile."

**Manual steps:** None.

**Testing:**
- Quick-add correctly parses at least: "tomorrow", "fri 6pm", "every monday", "#tag".
- Task detail edits persist and reflect immediately in Today/Inbox/Project views.
- File-link upload works and the file is retrievable later.
- RLS actually blocks cross-user reads (test with two accounts).

---

## 5. Module: Calendar & month view / time blocking

**Plan:** Month / Week / Day views sharing one component, tasks with a `time_blocks` row appear on the calendar, unscheduled tasks live in a side "backlog" panel, drag from backlog onto the calendar to schedule.

**Build prompts:**
1. "Build a calendar view with Month/Week/Day toggle. Pull events from `time_blocks` joined to `tasks`. Support drag-and-drop from an 'unscheduled' side panel onto a time slot, writing a new `time_blocks` row with `source = 'manual'`."
2. "Add drag-to-resize on time blocks to adjust duration, and drag-to-move to reschedule manually."

**Manual steps:** None.

**Testing:**
- Dragging a backlog task onto a slot creates the correct `time_blocks` row.
- Resizing/moving updates `start_at`/`end_at` correctly, including across midnight and across DST boundaries — **explicitly test a date that crosses a daylight-saving change** if your locale observes it.
- Month view correctly rolls up multi-day/recurring items without duplicating.

---

## 6. Module: Focus Rounds (timers)

**Plan:** A round timer attachable to any task: configurable work/break length, a running round counter for the day, and a `focus_sessions` log for stats.

**Build prompts:**
1. "Add a `focus_sessions` table [see schema]. Build a Focus screen with a Pomodoro-style timer: configurable work/break minutes, start/pause/reset, and a running count of completed rounds today. Starting a round from a task's detail view links the session to that task."
2. "On round completion, mark it in `focus_sessions` and surface a small daily focus-stats widget (rounds completed, total focus minutes) on the Today screen."

**Manual steps:** None.

**Testing:**
- Timer keeps running correctly if the app is backgrounded and reopened (don't let it silently reset).
- Completed rounds correctly cancel any pending "task missed" reschedule trigger for that task's current time block (a round in progress = not missed).
- Stats widget totals match the raw `focus_sessions` rows.

---

## 7. Module: Reminders & multi-channel notifications

**Research recap:** §10 of the research doc — Telegram as primary message channel, push as secondary, email as fallback, all dispatched by a `pg_cron`-triggered Edge Function.

**Manual steps (do these before building):**
1. Confirm the Telegram bot token from Phase 0 is stored as a Supabase secret (not hardcoded).
2. Set up the Telegram webhook to point at your Edge Function URL (`setWebhook` API call — one-time, can be done via `curl`).
3. Store VAPID keys as Supabase secrets.
4. Create an email-sending account (Resend or SendGrid), store its API key as a secret.

**Build prompts:**
1. "Create a `reminders`, `notification_channels`, and `notification_log` table [see schema]. When a task is created or its due time changes, generate reminder rows at T-1 day, T-1 hour, and at-time."
2. "Create a Supabase Edge Function `reminder-dispatcher` that: reads reminders due in the next window, checks the user's channel preferences and quiet hours, and sends via Web Push / Telegram `sendMessage` / email accordingly, logging each attempt to `notification_log`."
3. "Schedule `reminder-dispatcher` with `pg_cron` to run every 5–10 minutes."
4. "Add a Telegram webhook handler Edge Function that parses simple commands from replies: `done`, `snooze 1h`, `list today` — and updates the relevant task/reminder rows."
5. "In Settings, let the user set channel preferences, quiet hours, and reminder lead times per task or globally."

**Testing:**
- Create a task due in 2 minutes, confirm you receive the reminder on every enabled channel.
- Reply "done" in Telegram and confirm the task actually completes in the app.
- Set quiet hours covering "now" and confirm nothing fires until they end.
- Kill and reopen the PWA on an actual iPhone (installed to home screen) and confirm push still arrives — **this is the one to distrust most; verify on a real device, not just a simulator.**
- Confirm `notification_log` has an accurate record of every send attempt and its status (for debugging later).

---

## 8. Module: Auto-reschedule engine

**Research recap:** §9 of the research doc has the full rule set — read it again before building this; it's the most failure-prone module if built loosely.

**Build prompts:**
1. "Create a `reschedule_log` table [see schema] and add `flexibility_days`, `automation_mode`, and `reschedule_count` columns to `tasks` if not already present."
2. "Create an Edge Function `reschedule-sweep` implementing this algorithm: [paste §9 rules verbatim from the research doc]. It should run as a `pg_cron` job every 15–30 minutes plus one end-of-day run."
3. "For `automation_mode = 'ask'` tasks, instead of moving the task, create a pending proposal the user must confirm in-app or by replying to the Telegram notification."
4. "For every actual move, write a human-readable message to the notification pipeline (module 7) — never move silently."

**Manual steps:** None beyond ensuring `pg_cron` is enabled on the Supabase project (it is by default, but confirm in the dashboard).

**Testing — this module needs the heaviest manual QA:**
- Create a task with a fixed time block in the past, don't complete it, wait for the sweep (or trigger it manually) — confirm it moves to a valid future slot within working hours.
- Confirm a task explicitly marked "fixed" is never touched by the sweep even if missed.
- Confirm a high-priority task gets a better slot than a low-priority one competing for the same window.
- Confirm the `reschedule_count` cap actually stops auto-moves after the configured limit and flags the task instead.
- Confirm `ask` mode never silently moves anything — only proposes.
- Confirm quiet hours and working hours are never violated by a proposed slot.
- Run the sweep twice in a row without any new misses and confirm it's a no-op (idempotent) — this catches "silent cascading reschedule" bugs early.

---

## 9. Module: Agent + memory system

**Research recap:** §11 of the research doc — tiered memory (in-context / semantic / episodic-structured), one agent behind two front doors (in-app chat + Telegram).

**Manual steps:**
1. Enable the `pgvector` extension in the Supabase dashboard.
2. Confirm your chosen LLM's API key is stored as a Supabase secret.

**Build prompts:**
1. "Enable `pgvector`. Create `memory_facts` and `memory_embeddings` tables [see schema] and an `agent_conversations` log table."
2. "Create an Edge Function `agent` that accepts a user message (from either the in-app chat or the Telegram webhook), retrieves relevant `memory_facts` and top-k similar `memory_embeddings`, and calls [chosen LLM] with tool/function definitions mirroring the task CRUD API: `create_task`, `update_task`, `complete_task`, `query_schedule`, `bulk_reschedule`."
3. "After each conversation, run a lightweight extraction step that looks for durable facts (e.g., recurring commitments, actual-vs-estimated task duration patterns) and upserts them into `memory_facts` rather than re-writing the whole memory each time."
4. "Build an in-app chat panel calling the `agent` function. Point the Telegram webhook's free-text (non-command) messages at the same function."

**Testing:**
- Ask the agent "what's overdue?" and "what's on today?" — verify answers match what the UI itself shows (single source of truth check).
- Ask it to create a task with a link and a due date via natural language, confirm it appears correctly in the UI.
- Have a multi-turn conversation, then start a new session later and ask it to recall something from days ago — confirm memory retrieval actually works, not just in-context recall within one session.
- Deliberately give it a vague/ambiguous instruction ("clean up my week") and confirm it asks a clarifying question or proposes a plan rather than silently bulk-editing everything.
- Watch your LLM API cost for a few days of normal use before assuming the cost model is fine.

---

## 10. Module: Monthly planning, recurrence & review rituals

**Plan:** RRULE-based recurring tasks, a monthly goals view, and two guided flows — morning "plan my day" and evening "close my day" (Sunsama pattern) — plus a weekly planning view.

**Build prompts:**
1. "Add `recurrence_rules` support (RRULE format) to tasks. Generate future task instances on a rolling window (e.g., always have the next 60 days materialized) via a scheduled function rather than generating years of rows up front."
2. "Build a Monthly Goals view: user sets a handful of goals per month, tasks can be linked to a goal, progress rolls up automatically from linked task completion."
3. "Build a 'Plan my day' flow (morning): shows yesterday's leftovers, today's fixed events, and lets the user pick/reorder what to actually work on. Build a 'Close my day' flow (evening): shows what's done vs. not, and offers one-tap 'push to tomorrow' for anything unfinished."
4. "Build a Weekly view summarizing the week ahead and a one-tap 'plan my week' entry point."

**Manual steps:** None.

**Testing:**
- A weekly recurring task correctly generates future instances without duplicating on repeated app opens.
- Monthly goal progress accurately reflects linked-task completion, including tasks completed via the agent or Telegram, not just the UI.
- "Close my day" pushing a task to tomorrow correctly creates a new `time_blocks` entry rather than orphaning the old one.

---

## 11. Module: Task links & attachments

**Plan:** Already scoped inside `task_links` (module 4) — this section is the polish pass.

**Build prompts:**
> "On the task detail view, let a task carry multiple links: paste-a-URL (auto-fetch a title/favicon if easy), upload-a-file (Supabase Storage), or a plain note. Show them as a compact chip list on the task card in list/calendar views."

**Testing:**
- Links survive task edits, moves, and reschedules.
- File links respect the same RLS as everything else (another user can't guess a URL and access your file).

---

## 12. Module: Settings & personalization

**Build prompts:**
> "Build a Settings screen: working hours, quiet hours, default automation mode, notification channel toggles + Telegram linking status, theme, and data export (JSON/CSV of all tasks)."

**Testing:** Every setting change actually changes downstream behavior (reminders, reschedule sweep, agent) — not just cosmetic. Test the data export produces a file you could actually restore from.

---

## 13. Module: Analytics & insights

**Build prompts:**
> "Build a Review screen: completion rate over time, focus-time trend from `focus_sessions`, current streaks, and a 'what slipped and why' list pulled from `reschedule_log` grouped by reason."

**Testing:** Numbers match a manual count from the raw tables for at least one full week of your own real usage before trusting the dashboard.

---

## 14. Cross-cutting: testing strategy

**Automated (where the AI builder can help):**
- Unit tests around the reschedule algorithm's rule functions (priority ordering, cap enforcement, working-hours respect) — this is the one place worth insisting on real test coverage even in a vibecoded app, because it's the module most likely to silently misbehave.
- Basic integration test hitting the `agent` Edge Function's tool-calling path end to end.

**Manual QA checklist (run before you start relying on this daily):**
- [ ] Full sign-up → onboarding → first-task flow on a real phone, not just desktop.
- [ ] PWA install + push notification test on an actual Android phone.
- [ ] PWA install + push notification test on an actual iPhone (Safari, installed to home screen) — the platform most likely to disappoint you.
- [ ] Telegram bot: linking flow, receiving a reminder, replying `done`/`snooze`.
- [ ] Reschedule sweep triggered manually with a deliberately-missed task, in each automation mode (off/ask/auto).
- [ ] Timezone/DST edge case (schedule something across a DST transition if applicable).
- [ ] Two-account RLS check — account B can never see account A's tasks/files.
- [ ] A full week of real daily use, including the morning-plan and evening-close rituals, before declaring it "done."

**Security checklist:**
- [ ] RLS enabled and correct on every table (`tasks`, `time_blocks`, `memory_facts`, etc.) — this is the single most important thing to verify, since a vibecoded backend can easily ship with RLS off or too loose.
- [ ] Secrets (LLM key, Telegram token, VAPID keys, email API key) stored as Supabase secrets, never in frontend code or committed to the repo.
- [ ] File storage bucket policies scoped per-user.

---

## 15. Cross-cutting: deployment & ops

- Keep a `dev` Supabase project separate from `prod` if you're actively hacking on the reschedule engine — you don't want a bug wiping your real task list.
- Monitor `cron.job_run_details` (built into `pg_cron`) periodically for failed reminder/reschedule runs — Supabase's cron doesn't auto-retry a skipped tick, so silent failures are possible if you never check.
- Track LLM API spend weekly for the first month to catch runaway agent costs early.
- Keep the data-export feature (module 12) working at all times as your personal backup path.

---

## 16. Master checklist — everything you must do manually, outside the AI builder

- [ ] Create Supabase project, note keys
- [ ] Create Replit project, store Supabase URL/keys as Replit Secrets
- [ ] Create Telegram bot via BotFather, get token, get your own Telegram user ID
- [ ] Set Telegram webhook URL to your Edge Function
- [ ] Generate VAPID keys for web push
- [ ] Get LLM API key (Claude/OpenAI/Gemini)
- [ ] Get email-sending API key (Resend/SendGrid)
- [ ] Store all of the above as Supabase secrets (never hardcode)
- [ ] Enable `pgvector` extension in Supabase dashboard
- [ ] Confirm `pg_cron` + `pg_net` are enabled
- [ ] Connect Replit's Git pane to a GitHub repo, do this before the project gets big
- [ ] Test PWA install on a real Android phone
- [ ] Test PWA install + push on a real iPhone
- [ ] (Optional) point a custom domain

---

## 17. Suggested prompt sequence (condensed, paste-ready order)

1. Scaffold React + Tailwind + shadcn/ui + Supabase, PWA manifest, auth (Phase 0/§2)
2. Onboarding flow (§3)
3. Tasks table + RLS + quick-add + task detail (§4)
4. Calendar Month/Week/Day + drag-drop time blocking (§5)
5. Focus Rounds timer + stats (§6)
6. Reminders tables + dispatcher Edge Function + `pg_cron` schedule (§7)
7. Telegram webhook + linking + command handling (§7)
8. Reschedule engine Edge Function + `pg_cron` sweep (§8)
9. `pgvector` + memory tables + agent Edge Function + chat panel (§9)
10. Recurrence + monthly goals + plan/close-day rituals (§10)
11. Task links polish (§11)
12. Settings (§12)
13. Analytics/Review (§13)
14. Full manual QA pass (§14) before daily reliance

Each numbered step should be its own Replit Agent conversation (or its own PR if you hand a module to Claude Code) — don't prompt for three modules at once, it's how these tools get "messy at scale."

---

## 18. After launch

Run it for real for two weeks before adding anything beyond Tier 3. The most useful next iteration will come from your own friction points (which reminder channel you actually check, which automation mode you trust, what the agent gets wrong) — not from more features guessed in advance.
