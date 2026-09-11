# Master Build Prompt — Cadence (paste this into Replit Agent)

**How to use this file:** everything below the `=== COPY BELOW THIS LINE ===` marker is written to be pasted as your **first message** to Replit Agent, as-is. It's long on purpose — a detailed brief up front means less drift and fewer wrong guesses than feeding it one line at a time. It condenses `01-idea-research-and-spec.md` and `02-implementation-plan.md`; keep both of those open in a tab so you can paste extra detail from them if the agent asks for more on any one module.

**How I interpreted your ask, so flag anything wrong:** "Apple-like" → built around Apple's actual Human Interface Guidelines (Clarity/Deference/Depth) and the current *Liquid Glass* design language, not just "clean and white." "Colors that give energy" → Apple's own system-orange as the primary accent (it's literally the color Apple uses for Clock/Timer — thematically right for a time app) instead of a generic SaaS blue/grey. "Energy instead of pretending" → concrete UI rules (below), not motivational copy — a big one-tap Start action, visible momentum (Activity-Ring-style progress), no empty "You got this!" filler. "Ask about metrics, module completions, audit" → the Operating Protocol section makes the agent surface these to you as it works, instead of you having to ask.

---

=== COPY BELOW THIS LINE ===

I'm building **Cadence**, a personal task and time-management app, in this Replit project. Read this whole brief before writing any code — it covers product, design, architecture, and how I want you to work with me through the build. Confirm you've understood it and ask me anything genuinely ambiguous before starting Phase 0.

## 1. What this app is

A personal system that replaces a paper planner: fast mobile task capture, a real calendar, focus timers, reminders that reach me through a channel I'll actually see, an engine that automatically and *visibly* reschedules anything I miss, and a conversational agent with memory that learns how I actually work. Single user (me) for now, but build it multi-user-safe from day one (RLS everywhere) since it's nearly free to do now and painful to retrofit.

## 2. Design language — read this section twice, it governs every screen

Target quality bar: **Apple's own apps** — specifically **Things 3** (Apple Design Award winner, the best-in-class example of this exact product category) and Apple's own **Reminders / Clock / Timer** apps. Follow Apple's Human Interface Guidelines, built on three principles: **Clarity, Deference, Depth.** Content leads; chrome recedes; hierarchy comes from depth and typography, not decoration.

**Typography**
- Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, sans-serif` — this renders as real San Francisco on Apple devices automatically, and falls back to **Inter** (closest free web-licensed match) everywhere else. Don't try to embed SF Pro directly — it's not licensed for general web use.
- Type scale: body text 17px, large page titles 34px, section titles ~22px, captions ~13px. Semibold for titles/labels, regular for body, generous line-height (1.4–1.5).

**Spacing & shape**
- 8px spacing grid, everywhere — margins, gaps, padding all multiples of 8.
- Minimum 44×44px tap targets on every interactive element (mobile-first, real accessibility requirement, not a suggestion).
- Consistent corner radii — larger radii on bigger containers (cards, sheets), smaller on buttons/chips — matching the "concentric" feel Apple uses between hardware and software shapes.

**Color system** — use Apple's *system colors* as the base (these are the actual, recognizable Apple palette; treat exact hex as close community-standard approximations, not literal Apple source, since Apple ships them as adaptive light/dark tokens):

| Role | Light mode | Dark mode | Use for |
|---|---|---|---|
| Background | `#F5F5F7` | `#000000` | App background |
| Surface / card | `#FFFFFF` | `#1C1C1E` | Cards, panels |
| Primary text | `#1D1D1F` | `#F5F5F7` | Headlines, body |
| Secondary text | `#6E6E73` | `#98989D` | Captions, metadata |
| **Primary accent — energy** | `#FF9500` (System Orange) | `#FF9F0A` | **Primary CTAs, "Start" buttons, active timers/rounds, streaks.** This is the "give me energy to start" color — it's literally Apple's own Clock/Timer color, use it generously on anything that starts momentum. |
| Success | `#34C759` (System Green) | `#30D158` | Completions, "done" states — this is the dopamine-hit color, use a real animation when it fires (see Motion below) |
| Urgent / overdue | `#FF3B30` (System Red) | `#FF453A` | Reserve this *only* for genuinely overdue/at-risk items — overusing red kills its meaning and makes the app feel anxious instead of energizing |
| Links / secondary action | `#007AFF` (System Blue) | `#0A84FF` | Secondary buttons, links |
| AI / agent content | `#5E5CE6` (System Indigo) | `#5E5CE6` | Anything the agent did (an auto-reschedule, an agent-created task) gets a subtle indigo tag so I can always tell what I did vs. what it did |

Default to **dark mode as a first-class citizen**, not an afterthought — Apple's own apps look best there, and it should be the default given this is a personal-use app you'll open constantly, including at night.

**Depth & material — approximate Apple's current "Liquid Glass" language** where it's practical in a web app: translucent, subtly blurred surfaces (`backdrop-blur`) for the nav bar, modals, and the quick-capture sheet, layered *above* content rather than as flat opaque blocks, with a soft 1px border and shadow instead of hard edges. Don't overdo it — Apple uses it for controls/chrome, not for body content.

**The signature visual element — Activity Rings for progress.** Build a ring-based progress visualization (like Apple Watch's Move/Exercise/Stand rings) on the Today screen: one ring for tasks completed today, one for focus rounds completed, optionally one for a streak. This is the concrete answer to "give energy instead of pretending" — a real, satisfying, glanceable sense of momentum instead of a static checklist or a cheerful sentence.

**Motion**
- Spring-based transitions (not linear/ease-in-out) for anything that moves — Apple's characteristic slightly-bouncy, physical feel.
- A real completion micro-interaction on marking a task done: checkbox fills, a satisfying scale/checkmark-draw animation, the ring(s) update live.
- Page/sheet transitions slide or fade smoothly; nothing jarring or instant-cut.

**The "energy, not pretending" rule, made concrete:**
- The single most prominent element on the Today screen is always a **"Start"** action on whatever's next — one tap begins a focus round on that task immediately. Don't make me navigate to start something.
- No generic motivational copy ("You've got this!", "Keep it up!") — momentum is communicated through the rings and real numbers (rounds done, streak length), not filler text.
- Completing something should *feel* rewarding (the micro-interaction above) — that's the "energy," not decorative color.

## 3. Tech stack

- Frontend: React + Tailwind + shadcn/ui, PWA-enabled (manifest + service worker, installable on Android and iOS home screen)
- Backend: **Supabase** — Postgres, Auth, Storage, Edge Functions, Realtime. Enable `pgvector` (for agent memory) and confirm `pg_cron` + `pg_net` are available.
- Scheduling / background jobs: run the reminder-dispatcher and reschedule-sweep as **Supabase `pg_cron`** jobs calling Edge Functions — *not* Replit's own Scheduled Deployments (those bill per compute-second per run and are the wrong shape for something firing every 5–10 minutes all month).
- Reminders: Web Push (VAPID) for installed-PWA users, a **Telegram bot** as the primary reliable message channel (two-way: I can reply `done` / `snooze 1h` / `list today`), email digest (Resend or SendGrid) as fallback + weekly summaries.
- Agent: Claude (Anthropic) via an Edge Function, using tool/function calling mapped to the exact same CRUD operations the UI uses — the agent should never be able to do anything the UI's own API can't also do.
- Memory: structured `memory_facts` table for durable learned patterns (real task durations vs. my estimates, actual deep-work hours, recurring commitments) + `pgvector` embeddings of freeform notes for semantic recall. Don't reach for a hosted memory product — Postgres handles single-user scale fine.
- Keep all secrets (Supabase keys, Telegram bot token, VAPID keys, LLM API key, email API key) in Replit Secrets / Supabase secrets — never hardcoded, never committed.

## 4. Full feature set, by tier

**Tier 1 — MVP:** mobile-first quick capture with natural-language date parsing; tasks with title/notes/due date/duration estimate/priority/project/tags/links/subtasks; projects & tags; Today + Inbox views; Month/Week/Day calendar with drag-drop time blocking; basic reminders (in-app + push); manual complete/snooze/reschedule.

**Tier 2 — differentiators:** Focus Rounds (Pomodoro-style timer tied to a task, configurable work/break length, daily round target, Activity Ring stats); Telegram bot reminders + two-way commands; **auto-reschedule engine** (rules in §6) with a visible, reversible log and a per-task/global automation dial (Off / Ask / Auto); recurring tasks (RRULE); monthly goals + rollups; a guided "plan my day" (morning) and "close my day" (evening) ritual; escalating reminder tiers + quiet hours.

**Tier 3 — agent, memory, polish:** in-app + Telegram conversational agent (§7); memory system that measurably improves scheduling suggestions over time; optional Eisenhower Matrix view; analytics (completion rate, focus trends, streaks, "what slipped and why"); data export (JSON/CSV); full settings/personalization.

## 5. Data model (build these tables, all RLS-scoped by `user_id`)

```
users, projects, tags, tasks, task_tags, task_links, time_blocks,
recurrence_rules, reminders, notification_channels, notification_log,
focus_sessions, reschedule_log, memory_facts, memory_embeddings,
agent_conversations
```
Full column-level detail is in `01-idea-research-and-spec.md` §8 — pull from there if you need exact fields for any table.

## 6. Auto-reschedule engine — the rules, exactly

Trigger: a sweep (every 15–30 min via `pg_cron`, plus one end-of-day run) finds tasks whose time block passed without completion or a logged focus round.
1. Never touch anything marked fixed/immovable.
2. Respect working hours and quiet hours from user settings.
3. Search forward within the task's flexibility window (default: up to its due date) for a matching-duration slot.
4. Priority-weighted placement — higher priority gets first pick; lower priority can get bumped later but never past its own due date.
5. Cap auto-moves at 3 per task by default; after that, stop moving it and flag "needs attention" instead.
6. `off` tasks only ever get flagged, never moved. `ask` tasks propose a slot I must confirm. `auto` tasks move immediately.
7. Every move writes to `reschedule_log` and sends one human-readable notification ("Moved 'X' to Thu 3–4pm — today was full") — **never silent.**
8. Batch on a fixed cadence, don't thrash on every individual miss.

## 7. Agent + memory

One agent, two front doors (in-app chat panel + Telegram bot), same Edge Function, same tool-calling surface as the UI. Memory in tiers: in-context (current conversation), semantic (`pgvector` similarity search over past notes/conversation), and structured facts (`memory_facts` — durable learned patterns that should actually change scheduling behavior, not just get recalled in chat). It should handle: "what's overdue," "what's on today," "push everything low-priority to next week," "why did X move," "add [task] due Friday with a link to [url]," and proactive daily/weekly digests over Telegram.

## 8. Build order — work through these phases in order, don't skip ahead

0. Environment: Supabase connection, auth, PWA shell
1. Task/project/tag CRUD + quick capture + Inbox/Today views
2. Calendar (Month/Week/Day) + drag-drop time blocking
3. Focus Rounds timer + Activity Ring stats
4. Reminders: tables + dispatcher Edge Function + `pg_cron` schedule + Telegram bot + webhook commands
5. Auto-reschedule engine (§6) as an Edge Function + `pg_cron` sweep
6. Agent + memory (§7): `pgvector`, memory tables, agent Edge Function, chat panel, Telegram wiring
7. Recurrence, monthly goals, plan/close-day rituals
8. Settings, analytics/review, data export
9. Full manual QA pass (device testing, RLS check, notification reliability check on a real iPhone and Android phone)

## 9. Operating protocol — how I want you to work with me on this

- **Before each phase**, restate in 2–3 sentences what you're about to build and any assumption you're making, so I can correct course before you write code, not after.
- **After each phase**, give me a short completion report: what got built, what you actually tested (not just "should work"), what's explicitly *not* done yet, and any deviation from this brief and why.
- **Maintain two living documents in the repo**, updated after every phase:
  - `PROGRESS.md` — every module from §8, status as Not started / In progress / Done / Blocked, updated as you go.
  - `AUDIT.md` — a dated log: what changed, why, any schema migration, any manual step I still need to do (API keys, webhook URLs, dashboard toggles) that you can't do from inside the repo.
- **Ask me, don't guess,** whenever a decision is genuinely ambiguous or hard to reverse — schema changes, anything that could delete real data, anything that would send real notifications while we're still testing.
- **Never mark something "Done"** in `PROGRESS.md` without listing what you actually tested for it.
- **Metrics — propose these to me before Phase 3, don't assume:**
  - *Product metrics* (what the app tracks about my usage): task completion rate, focus rounds/day, on-time completion %, current streak, reschedule frequency per task. Confirm this list with me or adjust it.
  - *Build metrics* (what you report to me about the build itself): after each phase, how many endpoints/functions were added, whether automated tests exist for the reschedule engine's rule logic specifically (this module gets real test coverage, not just manual eyeballing — see §6's rules, each one should have a corresponding test case), and what manual QA items are still outstanding.

## 10. Start here

Begin with **Phase 0** only. When it's done, give me the completion report described in §9, update `PROGRESS.md` and `AUDIT.md`, and stop for my confirmation before starting Phase 1.

=== END OF PROMPT ===
