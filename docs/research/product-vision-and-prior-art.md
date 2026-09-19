# Cadence — Product Vision & Prior Art Research

> **Doc type:** Research and historical context. Human-facing.  
> **Distilled from:** `docs/archive/01-idea-research-and-spec.md §1–5`.  
> This document preserves the research reasoning, competitor teardowns, and platform analysis. For the resulting decisions and requirements, see `spec/locked-decisions.md` and `spec/system-requirements.md`.

---

## 1. Problem & Vision

Rohit is running many parallel threads — hackathons (DATASPHERE 26, MLSS, national-level), coursework, coding practice, research applications — tracked on paper right now. Paper doesn't remind you, doesn't reschedule missed items, and doesn't compound learning about how you actually work.

**Vision:** one always-with-you system that:
- (a) Makes capturing a task as fast as writing it on paper
- (b) Puts it on a real calendar automatically
- (c) Nags through a channel that will actually be seen
- (d) Fixes itself when something is missed instead of silently failing
- (e) Gets smarter about real work patterns over time via an agent that remembers

**The gap none of the existing apps fill well:** a real conversational agent with persistent memory that you can just *talk to* — in-app or over Telegram — and have it reason using what it has learned about how you work, not a fixed rules engine. That's Cadence's differentiator.

---

## 2. Competitor Teardowns

| App | What it's best at | What Cadence steals |
|---|---|---|
| **Todoist** | Cleanest task engine; natural-language quick-add ("call mom tmrw 6pm" auto-parses); huge integration ecosystem | NL date parsing in quick-add is table stakes — build this first |
| **TickTick** | All-in-one: tasks + calendar + Pomodoro + habit tracker + Eisenhower Matrix; generous free tier; best Android app in category | "Everything visible in one dashboard" layout; Pomodoro + focus stats; Eisenhower Matrix as optional lens, not forced structure |
| **Sunsama** | Guided daily planning ritual — review yesterday, pick today's work, estimate durations, drag onto calendar; daily "shutdown" ritual that pushes unfinished work forward intentionally | The ritual UX — don't just dump a backlog; walk the user through planning and closing the day |
| **Motion** | Full autopilot — owns the whole calendar and reshuffles everything when plans change | The *aggressiveness* is also its biggest complaint. Users report it "takes over your day." Borrow the reshuffle logic, not the opacity. |
| **Reclaim.ai** | Auto-reschedules tasks around real Google Calendar events without becoming the calendar itself; protects habits/focus time as first-class blocks | Its core mental model: tasks are *flexible* until scheduled; fixed events are *never touched* |
| **Akiflow** | Keyboard-first power-user speed | Keyboard shortcut philosophy |
| **Structured** | Best mobile-first visual timeline (iOS) | Vertical timeline-of-the-day as mobile home-screen pattern |
| **FlowSavvy** | Cheap/simple auto-scheduling for individuals | Simplicity bar |
| **Temporal** | Energy-aware scheduling — 3 automation modes (Suggest / Auto / Off) | **The automation dial concept** — user should be able to tune how much control to hand over |

---

## 3. Platform Analysis: Why Replit + Supabase

Three platforms were evaluated: Google AI Studio, Lovable, and Replit.

| Platform | Fit assessment | Verdict |
|---|---|---|
| **Google AI Studio** | Best when the app *is* a thin UI around a Gemini call | ❌ Not designed for multi-table, cron-driven, multi-channel-notification products. Fights you on everything except the agent. |
| **Lovable** | Generates polished React frontend with Supabase backend | ✅ Good fit, but optimizes for UI-generation speed — less necessary for someone who already reads code |
| **Replit** | Full AI-assisted dev environment; agent writes/runs/tests real code | ✅✅ Best for backend-heavy, logic-heavy work — exactly describes the reschedule engine and agent |

**Final recommendation:** Replit for all code (frontend + backend); Supabase for DB/Auth/cron/pgvector; Telegram for messages.

**Why Supabase over Replit's own DB (or any other DB):** Supabase provides, at no extra cost: Postgres (with `pgvector` for memory), Row-Level Security, `pg_cron` (no separate server for scheduled jobs), and first-class Clerk integration. These four features together are what the Cadence spec requires — and all four are available on the Supabase free tier.

**Why NOT Replit Scheduled Deployments for cron jobs:** spins up a fresh container per run and bills by compute-second. For a job firing every 5–10 minutes, 24/7, that adds up fast (tens of dollars/month for something that's free and instant as an in-database `pg_cron` job). `pg_cron` is the standard, supported pattern.

---

## 4. Tech Stack Rationale (historical)

The backend language choice (TypeScript + Express vs. Python/FastAPI) was evaluated specifically for the agent use case. Neither reason that makes Python tempting applies:
1. **MCP is a protocol, not a language** — the official TypeScript SDK is MCP's "native" implementation; wanting to expose Cadence's tools over MCP doesn't favor Python.
2. **The actual agent work** (LLM tool-calling over HTTP, `pgvector` via SQL, `pg_cron` for jobs) isn't local ML — nothing in it needs Python's ecosystem.

Decision: stay TypeScript + Express. Escape hatch if genuine Python tooling is needed: add a small Python microservice for just that piece, callable over MCP or HTTP — not a rewrite.

---

## 5. UX Principles (historical framing)

The design principles that informed the spec:

1. **Mobile capture must be the fastest thing in the app.** One tap, one field, smart parsing. Every extra step between "open app" and "task saved" is a reason to go back to paper.
2. **Unify task list + calendar.** Don't context-switch between a to-do list and a separate calendar app. TickTick and Sunsama's biggest UX win.
3. **Automation must be visible and reversible, never silent.** Every auto-reschedule shows what moved and why, with one-tap undo.
4. **Progressive disclosure.** Day one feels like a simple list + calendar. Rounds, Eisenhower view, analytics, and agent chat are there when wanted, not in the way.
5. **Ritual over raw list.** A "Plan My Day" morning flow and a "Close My Day" evening flow beats a static backlog.
6. **Notification design respects attention.** Escalating tiers, quiet hours, digest bundling instead of one ping per event.
7. **The automation dial.** Let the user choose per-task/globally how much control to hand over — Off / Ask / Auto.
