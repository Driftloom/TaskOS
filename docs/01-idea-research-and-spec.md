# Personal Task & Time OS — Idea, Research & Product Spec
**Working title:** *Cadence* (placeholder — rename freely)
**Owner:** Rohit
**Doc type:** High-level research + spec (paired with `02-implementation-plan.md`)
**Status:** v1 draft — has open questions in §12, answer those before build

---

## 0. What this document is

You asked for a personal tracker with mobile quick-add, timers, reminders, "rounds," auto-reschedule, month-long planning, task links, message-based reminders, and an agent+memory layer — built with a vibecoding tool (Lovable / Replit / AI Studio). This doc does the research part: what already exists, which platform to build on, and a filled-in spec. `02-implementation-plan.md` turns this into a buildable, module-by-module plan with prompts, manual steps, and testing.

---

## 1. Problem & Vision

You're running many parallel threads — hackathons, coursework, MLSS, coding practice, applications — tracked on paper right now (that's what the photo showed). Paper doesn't remind you, doesn't reschedule missed items, and doesn't compound learning about how you actually work.

**Vision:** one always-with-you system that (a) makes capturing a task as fast as writing it on paper, (b) puts it on a real calendar automatically, (c) nags you through a channel you'll actually see, (d) fixes itself when you miss something instead of silently failing, and (e) gets smarter about your patterns over time via an agent that remembers.

---

## 2. Interpreting the ambiguous parts of your brief

You wrote fast and casual (as instructed to build fast off), so I'm stating assumptions explicitly — flag any of these that are wrong in §12.

| Your phrase | Interpretation used in this spec |
|---|---|
| "rounds" | **Focus Rounds** — Pomodoro-style work/break cycles you run against a task (e.g., 4× 25-min rounds with 5-min breaks), with a daily round target. This is the TickTick/Forest pattern. |
| "timers and reminder" | Two separate things: (1) a **focus timer** (rounds, above) that runs while you work, and (2) **reminders** — scheduled nudges independent of whether you're actively working. |
| "msg to remind me" | A **Telegram bot** as the primary reminder channel (see §10 for why this beats push notifications), alongside in-app + push + optional email. |
| "auto reschedule if not complete" | A defined **reschedule engine** (§9) — not silent magic. It moves missed tasks to the next realistic slot, respects priority and deadlines, caps how many times it'll move something, and always tells you what it changed. |
| "schedule for months" | Recurring tasks + a real **Month view** + monthly/weekly goal rollups (§6, §7). |
| "agents and memory system" | An in-app + Telegram **conversational agent** that can read/write your tasks via tool calls, plus a **memory layer** that learns your patterns (how long tasks actually take you, your real focus hours, recurring commitments) — detailed in §11. |
| "links of that task" | Each task supports one or more **URL/file links + free-text notes**, plus optional "related task" links. |

---

## 3. Prior art — what to steal from existing apps

I researched the current (2026) landscape of personal task/time apps so you're not reinventing worse versions of solved problems.

| App | What it's best at | What to steal |
|---|---|---|
| **Todoist** | Cleanest task engine, natural-language quick-add ("call mom tmrw 6pm" auto-parses), huge integration ecosystem, AI task suggestions | Natural-language date parsing in quick-add is table stakes — build this first |
| **TickTick** | All-in-one bundle: tasks + calendar + Pomodoro + habit tracker + Eisenhower Matrix in one screen, generous free tier, best Android app in the category | The "everything visible in one dashboard" layout; Pomodoro + focus stats; Eisenhower Matrix as an optional lens, not a forced structure |
| **Sunsama** | A *guided daily planning ritual* — review yesterday, pick today's work, estimate durations, drag onto calendar; daily "shutdown" ritual that pushes unfinished work forward intentionally | The ritual UX — don't just dump a backlog on the user, walk them through planning/closing the day |
| **Motion** | Full autopilot — it owns your whole calendar and reshuffles everything when plans change | The *aggressiveness* is also its biggest complaint (users report it "takes over your day"). Borrow the reshuffle logic, not the opacity. |
| **Reclaim.ai** | Auto-reschedules tasks around real Google Calendar events without becoming the calendar itself; protects habits/focus time as first-class blocks | Its core mental model: tasks are *flexible* until scheduled, fixed events are *never touched* |
| **Akiflow / Structured / FlowSavvy** | Akiflow = keyboard-first power-user speed; Structured = best mobile-first visual timeline (iOS); FlowSavvy = cheap/simple auto-scheduling for individuals | Structured's visual "vertical timeline of the day" is a strong mobile home-screen pattern |
| **Temporal** | Energy-aware scheduling — 3 automation modes (Suggest / Auto / Off) so the user dials how much control to give up | The **automation dial** concept — you should be able to turn auto-reschedule from "ask me" to "just do it" per task or globally |

**The gap none of them fill well:** a real conversational agent with persistent memory that you can just *talk to* (in-app or over Telegram) — "push everything non-urgent to next week," "why is X still open," "what should I actually work on right now" — and have it reason using what it's learned about how you work, not a fixed rules engine. That's your differentiator per §11.

---

## 4. Build platform research & recommendation

You named AI Studio, Lovable, and Replit. Here's how they actually differ as of 2026, specifically for *this* app (multi-table data model, background cron jobs, multi-channel notifications, an LLM agent with tool-calling, mobile-first PWA).

| Platform | What it actually is | Strengths for this project | Weak points for this project |
|---|---|---|---|
| **Lovable** | Generates a polished React frontend, wired to a **Supabase** backend (Postgres + Auth + Storage + Edge Functions) | Supabase gives you, out of the box: Postgres (with `pgvector` for the memory layer), Auth, Row-Level Security, Edge Functions, and **`pg_cron`** — which is exactly the engine you need for scheduled reminders and the reschedule sweep. Fastest path from zero to a good-looking, installable, mobile-ready app. | Prompt-driven iteration gets messy as the project grows ("prompt history gets messy at scale" is a documented limitation of all these tools). Backend logic that needs precision (the reschedule algorithm, the agent) is better hand-written than prompted. |
| **Replit** | A full AI-assisted **dev environment** — the agent writes/runs/tests real code, you keep full control | Best for backend-heavy, logic-heavy work — which describes your reschedule engine and agent exactly. Full code control from message one, no "graduate off the prompt tool" step later. Has its own DB + **Scheduled Deployments** (cron-like) if you want to stay 100% inside Replit. | UI quality out of the box is more variable than Lovable's — closeable by being explicit about shadcn/ui + Tailwind in prompts. Scheduled Deployments bill per compute-second per deployment (see note below) — fine occasionally, not the right tool for a job firing every 5–10 min all month. |
| **Google AI Studio (Build)** | Best when the app *is* a thin UI around a Gemini call | Great fit if a feature is "call Gemini, show the result" | Not designed for a multi-table, cron-driven, multi-channel-notification, multi-module product like this. It'd fight you on everything except the agent itself. |

### Recommendation — updated

**Both Lovable and Replit are legitimate primary choices. Given your background (full-stack dev, Python, Docker, LangChain/multi-agent work), go straight into Replit and skip the Lovable hop.**

Reasoning:
1. The main thing Lovable buys you over Replit is UI-polish speed with zero code-reading. You don't need that training wheel — you'll be reading and steering the generated code either way, so you may as well be doing it in an environment that gives you full control from the first prompt instead of migrating later.
2. Replit Agent handles backend-heavy, logic-heavy modules (the reschedule engine, the agent+memory layer) more naturally than a UI-generation tool, because that's closer to how it actually works — real files, real tests, real terminal.
3. **One thing that doesn't change no matter which builder you use: keep Supabase as the backend.** Write your Replit (or Lovable) code against a Supabase project for Postgres/Auth/Storage/`pgvector`, and schedule the reminder-dispatcher and reschedule-sweep jobs with Supabase's `pg_cron` — not Replit's Scheduled Deployments. Scheduled Deployments spin up a fresh container per run and bill by compute-second; for a job firing every 5–10 minutes, 24/7, that adds up fast (tens of dollars/month for something that's free and instant as an in-database `pg_cron` job). Supabase is explicitly designed to be used this way — "wire it up from Replit, Lovable, v0, or any AI platform" is the standard, supported pattern, not a workaround.
4. **Skip Google AI Studio** as the primary builder — use it only if you want to fast-prototype a single AI feature in isolation before wiring it into the real app.

So, concretely: **Replit for all the code (frontend + Edge Functions), Supabase for the DB/Auth/cron/pgvector, Telegram for messages.** No Lovable step required — though nothing below changes if you decide you'd still rather start there for the UI speed; just read "Replit" and "Lovable" as interchangeable in the modules that follow, with the Supabase-backend rule holding either way.

---

## 5. Recommended tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Tailwind + shadcn/ui, PWA-enabled (manifest + service worker) | Ask for this stack explicitly in your first Replit prompt (it's Lovable's default, but not automatic in Replit); PWA = installable on Android/iOS home screen, works offline for viewing |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions, Realtime) | One bundled backend covers auth, DB, RLS, serverless functions, and file storage |
| Scheduling / background jobs | `pg_cron` + `pg_net` (native Postgres extensions, on by default on Supabase) | Runs the reminder-dispatch and reschedule-sweep jobs directly in the DB — no separate server to babysit |
| Reminders — push | Web Push (VAPID) via service worker | Free, native to PWAs; solid on Android, workable on iOS 16.4+ *if the PWA is installed to the home screen* |
| Reminders — messages | **Telegram Bot API** | Free, cross-platform, far more reliable than iOS web push (which requires install + has documented listener reliability issues after device restarts), no app-store gatekeeping |
| Reminders — fallback | Email digest (Resend/SendGrid) | Catches anything the above two miss; also good for weekly review summaries |
| Agent | **LiteLLM** as a single gateway in front of a free-tier-first fallback chain (NVIDIA NIM primary → Groq/OpenRouter → Hugging Face), called from an Edge Function with **tool/function calling** mapped to the same CRUD operations as the UI | Keeps a single source of truth — the agent can't do anything the UI API can't also do. NVIDIA NIM's larger hosted models (Llama 3.1 70B+, Nemotron) support real OpenAI-format function calling, which is what the agent's tool-calling needs; LiteLLM handles automatic fallback when a free tier rate-limits, instead of one vendor being a single point of failure |
| Memory | Structured fact tables in Postgres + `pgvector` for embeddings of freeform notes | 2026 best practice for personal-assistant memory: don't jump straight to a hosted vector DB — Postgres `pgvector` handles single-user scale fine; upgrade to something like Mem0 later only if needed |
| Dev workflow | Replit (Agent-driven, full code control from the start) → GitHub sync → Claude Code / Cursor if you want a second driver on the same repo | See §4 |
| Hosting | Replit Deployments (or Vercel) for frontend, Supabase for backend | No separate infra to manage |

**Backend language — confirmed staying on Express/TypeScript, not switching to FastAPI/Python.** Checked specifically against the two reasons that make Python tempting for "agent" work: neither applies here. (1) MCP is a protocol, not a language — the official TypeScript SDK is explicitly described as MCP's "native" implementation, ships an **Express-specific middleware package**, and is at least as mature as the Python SDK (both are official, both actively maintained, confirmed current). Wanting to expose Cadence's tools over MCP later, or have its agent call other MCP servers, doesn't favor Python at all — if anything TypeScript has less glue code given the existing Express app. (2) The actual agent work here (LLM tool-calling over HTTP, `pgvector` via SQL, `pg_cron` for jobs) isn't local ML — nothing in it needs Python's ecosystem. Escape hatch if that ever changes (e.g., a genuine need for LangGraph-specific local tooling): add a small Python microservice for just that piece, callable over MCP or HTTP — not a rewrite of what's already working (Clerk auth, RLS isolation, the whole verified route layer).

---

## 6. Feature list — filled and tiered

### Tier 1 — MVP (must work before this replaces paper)
- Mobile-first quick capture: one field, natural-language date/time parsing, add from a widget/shortcut
- Tasks with: title, notes, due date/time, duration estimate, priority, project/list, tags, links (URL/file), subtasks
- Projects/lists + tags
- Today view + Inbox (uncategorized capture)
- Calendar: Month / Week / Day views with drag-and-drop time blocking
- Basic reminders (in-app + push) at task time and configurable lead time (e.g., 30 min before)
- Mark complete / snooze / reschedule manually

### Tier 2 — Core differentiators
- **Focus Rounds** (Pomodoro-style timer tied to a task, configurable round length/breaks, daily round target, focus stats)
- **Telegram bot** reminders + two-way commands ("done", "snooze 1h", "list today")
- **Auto-reschedule engine** (§9) with visible, reversible changes and an automation dial (Off / Ask / Auto) per task or globally
- Recurring tasks (daily/weekly/monthly/custom RRULE)
- Monthly goals + rollups; weekly planning + daily shutdown ritual (Sunsama-style)
- Escalating reminder tiers + quiet hours

### Tier 3 — Agent, memory, polish
- **Agent chat panel** (in-app) and **Telegram conversational agent** (same backend) — natural-language commands: "clear my afternoon," "what's overdue," "plan my week"
- **Memory system**: learns real task durations vs. your estimates, your actual deep-work hours, recurring commitments, and feeds this back into smarter scheduling suggestions
- Eisenhower Matrix view (optional lens, not forced)
- Analytics: completion rate, streaks, focus-time trends, "what slipped and why"
- Data export (JSON/CSV), account settings, theming

---

## 7. UX / UI principles + information architecture

**Principles (drawn from the competitor research above):**
1. **Mobile capture must be the fastest thing in the app.** One tap to open, one field to type in, smart parsing does the rest. Every extra field between "open app" and "task saved" is a reason you go back to paper.
2. **Unify task list + calendar.** Don't make the user context-switch between a to-do list and a separate calendar app — this is TickTick's and Sunsama's biggest UX win.
3. **Automation must be visible and reversible, never silent.** Every auto-reschedule shows what moved and why, with a one-tap undo. This is the #1 complaint pattern about Motion-style full-autopilot tools.
4. **Progressive disclosure.** Day one, the app should feel like a simple list + calendar. Rounds, the Eisenhower view, analytics, and the agent chat are there when you want them, not shoved in your face.
5. **Ritual over raw list.** A short "plan my day" flow each morning and a "close my day" flow each evening (Sunsama's pattern) beats a static backlog for actually finishing things.
6. **Notification design respects attention.** Escalating tiers (gentle → firm → overdue), quiet hours, and digest-bundling instead of one ping per event.
7. **The automation dial.** Let the user (you) choose per task/globally how much control to hand over — Off (never auto-move), Ask (propose, wait for approval), Auto (just do it and tell me after).

**Information architecture — core screens:**
- **Today** (home) — vertical timeline of today, current focus round if active, quick-add bar always visible
- **Inbox** — uncategorized quick-captures waiting to be triaged
- **Calendar** — Month / Week / Day, drag-drop
- **Projects** — list of projects/lists, each with its own task view
- **Focus** — round timer, today's round count, focus stats
- **Agent** — chat panel (mirrors the Telegram bot)
- **Review** — daily shutdown / weekly planning ritual, monthly goal rollup
- **Settings** — working hours, quiet hours, notification channels, automation dial defaults, integrations (Telegram link, calendar export)

---

## 8. Data model (schema sketch)

```
users                 (id, email, timezone, working_hours, quiet_hours, created_at)
projects              (id, user_id, name, color, archived)
tags                  (id, user_id, name)
tasks                 (id, user_id, project_id, title, notes, priority,
                        due_at, duration_est_min, status, flexibility_days,
                        automation_mode [off|ask|auto], reschedule_count,
                        created_at, completed_at)
task_tags             (task_id, tag_id)
task_links            (id, task_id, type [url|file|note], value, label)
time_blocks           (id, task_id, start_at, end_at, source [manual|auto])
recurrence_rules      (id, task_id, rrule, until)
reminders             (id, task_id, fire_at, tier [t-1d|t-1h|at-time|overdue], sent_at)
notification_channels (id, user_id, channel [push|telegram|email], target, verified)
notification_log      (id, user_id, channel, payload, status, sent_at)
focus_sessions         (id, task_id, started_at, ended_at, round_number, completed)
reschedule_log        (id, task_id, old_time, new_time, reason, auto)
memory_facts          (id, user_id, key, value JSONB, confidence, updated_at)
memory_embeddings     (id, user_id, source_text, metadata JSONB, embedding vector, created_at)
agent_conversations   (id, user_id, channel [app|telegram], role, content JSONB, created_at)
```

**On `value`/`content`/`metadata` being `JSONB`, not fixed columns:** this is the answer to "wouldn't NoSQL be easier for agent memory" — Postgres's native `JSONB` type gives you exactly what a document store would for this specific need (arbitrary-shaped "memory cards" the agent can write without a schema migration every time it learns a new kind of fact), while the *table itself* stays relational — still scoped by `user_id`, still RLS-protected, still joinable to `users`/`tasks` when needed, and still sitting in the same database as `pgvector`'s embeddings so a memory query can filter by structured fields *and* semantic similarity in one query. `JSONB` supports its own indexing (GIN) and query operators, so this isn't a slower workaround — it's the standard way to get document-store flexibility inside Postgres without standing up a second database for one subsystem.

All tables get `user_id`-scoped Row-Level Security in Supabase even though this starts single-user — costs nothing now, saves a painful migration if you ever add a second user (or a team version later).

---

## 9. Auto-reschedule algorithm (defined, not vague)

**Trigger:** a scheduled sweep (every 15–30 min via `pg_cron`, plus one end-of-day sweep) checks for tasks whose time block has passed without being marked complete or having a focus round logged against it.

**Rules, in order:**
1. **Never touch fixed/immovable events** — anything explicitly marked as a fixed calendar item is untouchable by the engine.
2. **Respect working hours and quiet hours** from user settings.
3. **Search forward** within the task's `flexibility_days` window (default: up to its due date) for the next slot of matching duration.
4. **Priority-weighted placement** — higher-priority tasks get first pick of good slots; lower-priority tasks can get bumped further out, but never past their own due date.
5. **Cap auto-moves** at 5 per task by default (loosened from an initial default of 3, per your call — gives the engine more room before it stops and asks). After that, stop moving it automatically and flag it "**needs your attention**" instead of quietly shuffling forever.
6. **Automation dial respected, with a hybrid default.** `off` tasks are only ever flagged as overdue, never moved. `ask` tasks generate a proposed new slot the user must confirm (in-app or via a Telegram reply). `auto` tasks — **the default for new tasks** — move immediately on the *first* miss and notify after; if that same task needs a *second* reschedule, the engine automatically drops it into `ask` mode instead of continuing to auto-move it — a repeated miss signals something's off (bad duration estimate, wrong priority) that another silent move won't fix, so a human decision is the safer call at that point.
7. **Always log and notify.** Every move writes to `reschedule_log` and generates a single, human-readable notification ("Moved 'Finish PS1 writeup' to Thu 3–4pm — today was full"), never a silent diff.
8. **Batch, don't thrash.** Reschedule runs on a fixed cadence, not instantly on every miss, so one bad hour doesn't trigger a cascade of tiny moves.

---

## 10. Notification & reminder architecture

**Why not push-notifications-only:** PWA push is solid on Android but has real, documented limits on iOS as of 2026 — it only works if the PWA is installed to the home screen, and service-worker push listeners can fail to fire reliably after a device restart. For something you're relying on to replace a paper planner, that's not good enough on its own.

**Channel strategy:**
| Channel | Role | Reliability notes |
|---|---|---|
| In-app | Always-on source of truth | Only works while the app is open |
| Web Push (PWA) | Secondary, for installed users | Strong on Android; workable on iOS 16.4+ *only if installed to home screen* |
| **Telegram bot** | **Primary "message" channel** | Free, no app-store friction, works identically on every platform, supports two-way commands ("done", "snooze 1h") |
| Email digest | Fallback + weekly review summary | Never time-critical, good for daily/weekly rollups |

**Pipeline:**
```
pg_cron (every N min)
   → Edge Function: "reminder-dispatcher"
        → reads reminders due in this window
        → for each: check user's channel prefs + quiet hours
        → sends via Web Push API / Telegram Bot API sendMessage / Resend email
        → writes to notification_log
```

**Escalation tiers per task** (configurable defaults): T-1 day → T-1 hour → at start time → overdue nudge (repeating, capped, silenced during quiet hours).

---

## 11. Agent + memory system design

**Two front doors, one agent:** the in-app chat panel and the Telegram bot both hit the same Edge Function. The agent has **tool/function-calling** access to exactly the same operations the UI uses (create/update/reschedule/complete task, query schedule) — so it can never do something the app itself can't do or show.

**Memory, in tiers** (this is the current best-practice pattern for personal-assistant memory as of 2026):
1. **In-context** — the current conversation buffer.
2. **Semantic** — freeform notes/conversation turns embedded via `pgvector`, retrieved by similarity when relevant ("what did I say about the hackathon deadline last week?").
3. **Episodic / structured facts** — a small `memory_facts` table (its `value` stored as `JSONB`, so each fact can be shaped however the agent needs — a "card" of arbitrary structure, not a fixed set of columns) of durable, structured things the agent has learned: *"tasks tagged #hackathon actually take ~2.3x the estimated time," "deep-work hours are usually 9–11pm," "Mondays are unreliable for focus rounds."* These are the facts that should actually change how the reschedule engine and the agent's suggestions behave — not just be recalled in chat.

**Practical build note:** don't reach for a hosted memory product on day one. `pgvector` inside your existing Supabase Postgres handles single-user memory at this scale fine; only move to something like Mem0 if you outgrow it.

**What the agent should be able to do out of the gate:**
- "What's overdue?" / "What's on today?"
- "Push everything low-priority to next week"
- "Why did X get moved?"
- "Add [task] with a link to [url], due Friday"
- Daily/weekly digest generation, sent proactively over Telegram

---

## 12. Open decisions — confirm or change these before building

1. **App name** — "Cadence" is a placeholder.
2. **Single-user only, or design for eventual multi-user/team?** (Spec above assumes single-user now, multi-user-ready schema.)
3. ~~Which LLM powers the agent~~ — **Resolved:** no single vendor — a free-tier-first fallback chain via **LiteLLM** (NVIDIA NIM → Groq/OpenRouter → Hugging Face). See §5.
4. **Telegram acceptable as the primary "message" channel?** (Recommended over WhatsApp — WhatsApp's official Business API is heavier to set up and mostly paid; Telegram's bot API is free and instant.)
5. **Default working hours / quiet hours** to seed onboarding with — still open; timezone default is now set (item 8 below), hours/quiet-hours values still need real numbers from you.
6. ~~Automation dial default~~ — **Resolved:** `auto` on the first miss, auto-downgrades to `ask` if the same task needs a second reschedule. See §9 rule 6.
7. ~~Budget for LLM API calls~~ — **Resolved:** free-tier-first, not a spend target — with a small safety-net alert (~₹300–500/mo) in case free tiers are ever exhausted and a paid key gets hit. See doc 8.
8. ~~Home timezone~~ — **Resolved:** `Asia/Kolkata` (IST) is the confirmed default for the `users.timezone` field from doc 7/9.

---

## 13. Risks & constraints to keep in mind

- **iOS push limitations** — mitigated by Telegram as primary message channel (§10).
- **"Growing project" ceiling in prompt-driven builders** — mitigated by moving to code-level edits (GitHub sync) once past MVP (§4).
- **LLM cost creep** from the agent + memory layer — keep conversations short-context, use structured facts instead of re-embedding everything, monitor usage.
- **Notification fatigue** — escalation tiers + quiet hours + digest bundling are not optional polish, they're what keeps you from muting the whole app in week two.
- **Over-automation trust issues** — the automation dial + "always log and notify" rule in §9 exist specifically so auto-reschedule doesn't quietly move things you didn't want moved.

---

*Next: `02-implementation-plan.md` turns every module above into a research → plan → build (with prompts) → test sequence, plus the full list of manual steps you have to do outside the AI builder.*
