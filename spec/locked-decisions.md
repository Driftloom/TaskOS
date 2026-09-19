# Cadence — Locked Architectural Decisions

> **Canonical reference.** Every decision here is closed. Re-opening requires an explicit dated entry in `AUDIT.md` plus an update to this file. "Closed" means it is not revisited in agent prompts, PR reviews, or planning sessions without that gate.
>
> **Last verified:** 2026-09-19. Supersedes the open-questions table in `docs/archive/01-idea-research-and-spec.md §12`.

---

## Settled Decision Table

| # | Decision | Settled Value | Source | Date Closed |
|---|---|---|---|---|
| D-01 | **Home timezone default** | `Asia/Kolkata` (IST) — stored as IANA string in `users.timezone` | `docs/07 §0`, `docs/09 #5b`, `docs/10 §6` | 2026-09-11 |
| D-02 | **Working hours default** | Configurable; seeds as 24-hour flexibility (`00:00–23:59`) per owner preference | User decision 2026-09-19 | 2026-09-19 |
| D-03 | **Auto-reschedule cap per task** | **5** moves maximum (loosened from initial 3), then flags "needs attention" — never auto-moves again after cap | `docs/01 §9 rule 5`, `docs/10 §11` | 2026-09-11 |
| D-04 | **Automation dial default** | `auto` on first miss; engine auto-downgrades same task to `ask` on a second miss. New tasks default to `auto`. | `docs/01 §9 rule 6`, `docs/10 §6` | 2026-09-11 |
| D-05 | **Bulk-agent confirmation threshold** | **> 10 tasks** touched in one agent action requires explicit user confirmation before executing | `docs/09 #2`, `docs/10 §1` | 2026-09-11 |
| D-06 | **Streak freeze** | **Not building.** Streaks stay strict — a missed day resets to zero, no grace day / freeze mechanic | `docs/09 #10`, `docs/10 §15` | 2026-09-11 |
| D-07 | **LLM gateway & fallback chain** | **LiteLLM:** NVIDIA NIM primary (free, OpenAI-compatible function calling) → Groq/OpenRouter → Hugging Face tertiary | `docs/08`, `docs/10 §12` | 2026-09-11 |
| D-08 | **LLM spend safety-net alert** | ~₹300–500/month ceiling (target \$0 via free tiers). Single `llm_usage` table tracks all calls. | `docs/08 #5a`, `docs/10 §12` | 2026-09-11 |
| D-09 | **Memory extraction cadence** | **Nightly batch job** via `pg_cron` — one run per user per night. Not per-message. | `docs/11 §2.2` | 2026-09-11 |
| D-10 | **Memory source split** | Source A (behavioral/statistical) updates facts automatically. Source B (conversational LLM) prompts user before updating or archiving any fact. | `docs/11 §2.5` | 2026-09-11 |
| D-11 | **Memory transparency screen** | **Confirmed for first build, not deferred.** Route: `/memory`. Ships alongside the memory module, not after. | `docs/11 §4c`, `docs/10 §12` | 2026-09-11 |
| D-12 | **Memory seed categories** | Four confirmed seeds: (1) task-type procrastination, (2) channel responsiveness, (3) soft recurring commitments, (4) hackathon-mode shifts — plus open-ended extraction for any other behavior-relevant pattern | `docs/11 §2.1` | 2026-09-11 |
| D-13 | **Reschedule Rule 9** | Before placing/scheduling a task, the engine checks `memory_facts` for a duration multiplier or pattern matching the task's tags/project. | `docs/11 §4a` | 2026-09-11 |
| D-14 | **Status color accessibility** | Every status color **must** be paired with a distinct icon/shape (colorblind-safe). Color alone is never sufficient. | `docs/09 #3`, `docs/10 §16` | 2026-09-11 |
| D-15 | **Primary reminder channel** | **Telegram Bot API** is the primary notification channel. Web Push is secondary. Email digest is fallback. Push notifications alone are not sufficient (iOS PWA reliability). | `docs/01 §10`, `docs/08` | 2026-09-11 |
| D-16 | **Auth stack** | **Clerk** native third-party-auth integration with Supabase. `requireAuth` on all routes except `GET /healthz` and `GET /api/healthz`. | `docs/07 §0` | 2026-09-11 |
| D-17 | **Database & ORM** | **Supabase Postgres + Drizzle ORM**. RLS enforced per-request via `runWithRls` using `auth.jwt()->>'sub'` as the user claim. Never Replit's own database. | `docs/07 §0`, `docs/05` | 2026-09-11 |
| D-18 | **Backend language** | **TypeScript + Express 5** — not Python/FastAPI. MCP if needed uses the official TypeScript SDK. | `docs/01 §5` | 2026-09-11 |
| D-19 | **Scheduling backend** | `pg_cron` + `pg_net` (Supabase extensions) calling `/internal/dispatch` and `/internal/reschedule` with `DISPATCH_SECRET`. Not Replit Scheduled Deployments. | `docs/01 §4–5`, `docs/10 §10` | 2026-09-11 |
| D-20 | **Monitoring** | Healthchecks.io dead-man's-switch ping on every cron run + Telegram alert on missed ping. Sentry for runtime errors. `automation_flags` table is the manual kill switch. | `docs/08 #2`, `docs/10 §10` | 2026-09-11 |
| D-21 | **Supabase test branch discipline** | Close every test/scratch branch the same day it is opened — it bills ~\$0.32/day. | `docs/09 #8` | 2026-09-11 |
| D-22 | **Catch-up notification behavior** | If > N reminders are pending after the user has been away, batch them into **one** catch-up summary. Never replay N individual pings. | `docs/09 #9` | 2026-09-11 |
| D-23 | **Paper-photo-import confirmation** | All draft tasks from the photo-import feature go through a confirm-before-save queue. Never auto-filed. | `docs/04 §4`, `docs/08 problem 4` | 2026-09-11 |
| D-24 | **Explicitly deferred — do not build without owner instruction** | Helicone/LangSmith, dedicated OCR vendor, Google Calendar sync, payments/billing, streak freeze | `docs/08` "What NOT to add" | 2026-09-11 |
| D-25 | **Liquid Glass constraint** | Glass effect (`backdrop-blur-xl` + 1px border `rgba(255,255,255,0.08)`) confined strictly to chrome (sidebar, bottom dock, headers, modals). Never applied to body content cards. | `docs/03 §2`, `docs/10 §16` | 2026-09-11 |
| D-26 | **Agent action log & undo** | Every agent action (create/edit/delete/reschedule) writes to `agent_action_log` with sufficient data to reverse. "Undo last agent action" exposed in both the chat panel and Telegram. | `docs/09 #2` | 2026-09-11 |
| D-27 | **Agent token spend ceiling** | \$5.00 per month (~₹400) hard alert ceiling. Tracked per-call in `llm_usage` table. | `docs/10 §12` | 2026-09-11 |
| D-28 | **Parallel-run trial gate** | Paper planner stays primary until **2 weeks pass** or **7 consecutive days** where every paper item also appears correctly in Cadence — whichever is longer. Any real missed deadline resets the clock. | `docs/04 §3`, `docs/08 problem 3` | 2026-09-11 |

---

## Decision Governance

- **To re-open a decision:** append a dated `## REOPENED [date]` section to this file, cite the reason, and record the new value or "reverted to open." Update `AUDIT.md` in the same commit.
- **Audit cadence:** re-run `docs/governance/zero-trust-audit-prompt.md` weekly during active build weeks. Do not wait for a problem to trigger a re-audit.
- **Stale risk:** this file itself is subject to the zero-trust posture — treat it as a snapshot verified on the date above, not as perpetually accurate without re-verification.
