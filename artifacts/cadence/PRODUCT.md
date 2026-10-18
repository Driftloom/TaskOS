# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Rohit — the owner and the only planned end user today. He runs his work and personal
schedule off one surface that replaces his paper planner.

The codebase is strictly multi-tenant-safe from day one (every table `user_id`-scoped
with Postgres RLS), so future design work is never asked to undo itself; but the
experience is designed for one user, and shows things like tint/pill/telemetry that
would never suit a stranger's data.

## Product Purpose

Replaces paper planning end to end: capture a task anywhere in seconds, resolve it
into honest calendar time-blocking, get reminders that fire reliably, and finish with
a review loop that tells the truth about what slipped and why.

Success is measured in that order — the paper planner stops being needed, with zero
dropped tasks in the cut-over.

## Positioning

One end-to-end mechanism, in sequence:

1. **Capture-to-discipline.** Lowest-friction capture anywhere (PWA quick capture,
   async drafts / inbox), funneling directly into honest calendar time-blocking.
2. **Automation with receipts.** Every automated change is logged, reportable in
   batches, and one-click reversible — the planner never silently edits your day.
3. **Memory-driven agent.** A personal agent with 3-tier memory that learns duration
   and rhythm from real completions (Rule 9 duration multiplier) and negotiates the
   next placement of a task instead of duplicating a task list elsewhere.

Neighboring planners can truthfully copy this claim as a feature list; they cannot
copy it end to end once the receipts mechanism (agent_action_log + 1-click undo)
and the memory chain (completed work → learned duration → next placement) have to
survive a real calendar.

## Operating Context

- **Reminders are channel-agnostic by record.** Which channel is primary is owned by
  `spec/locked-decisions.md` (D-15), not by this file. Pending alerts batch into one
  summary when the user has been away (D-22). Delivery reliability, absence of scary
  chants, and one device being enough matter more than which twin bar the reminder
  rode over.
- **Discipline mechanics are strict by design.** Streaks never freeze (D-06). The
  auto-rescheduler caps at 5 moves per task and then flags it as needing attention
  (D-03). Agent bulk actions >10 tasks require explicit confirmation (D-05). The
  automation dial turns `auto` on the 1st miss and downgrades to `ask` on the 2nd
  miss of the same task (D-04).
- **Fixed/immovable calendar events never move**, under any mode (engine Rule 1).
- **Paper-photo imports always route through a confirm-before-save draft queue**;
  they are never auto-saved (D-23).
- **Agent memory is a transparency surface.** Behavioral facts (Source A)
  auto-update; conversational facts (Source B) prompt the user first (D-10). The
  `/memory` screen shows every stored fact (D-11).
- **Ops health is product, not infrastructure.** Automation kill switches are
  authenticated and ID-whitelisted (D-30); a dead-man's switch plus Sentry watch
  the heartbeat (D-20).

## Capabilities and Constraints

- Auth via Clerk; data via Supabase Postgres with `runWithRls` JWT-claims RLS
  (D-16/D-17). Only `/api/healthz` is public; every other route requires auth.
- Agent LLM: BYOK LiteLLM chain — NVIDIA NIM primary, Groq/OpenRouter fallback,
  Hugging Face last (D-07); monthly spend alert ceiling ~$5/₹400, tracked in
  `llm_usage` (D-08).
- Scheduled work: `pg_cron` + `pg_net` call internal dispatch/reschedule endpoints
  (D-19) — reminders, reschedule sweeps, memory extraction, recurrence.
- Home timezone defaults to `Asia/Kolkata` (D-01); work rhythm defaults to 24h
  flexibility, 00:00–23:59 (D-02).
- Decided product facts live in `spec/locked-decisions.md` (D-01–D-31). That file,
  not this one, owns feature deferrals, a decided notification channel, and other
  facts that may move between releases; this record deliberately does not duplicate
  them.

## Brand Commitments

- Name: **Cadence**.
- Voice: energy without pretending. No motivational platitudes ("You've got this!"),
  no fake praise, calm urgency — alert red is reserved for real overdue deadlines
  and system faults, never to manufacture a feeling.
- Real assets only; never fabricate testimonials, customers, benchmarks, or press.

## Evidence on Hand

- Authoritative contracts: `spec/system-requirements.md`,
  `spec/data-models-and-schema.md`, `spec/locked-decisions.md`,
  `spec/auto-reschedule-engine.md`, `spec/design-system.md`.
- Verification evidence: 894 Vitest unit/contract tests across 69 files; 144
  Playwright E2E tests; a 12-gate verification ladder (`pnpm run verify`); a G4
  manual verification runbook including two-account cross-tenant RLS isolation.
- Working telemetry: activity ledger (`/activity`), slippage analytics + tamper-evident
  reconciliation footer (`/review`), `reschedule_runs` audit stream.

## Product Principles

1. **Never silently act.** Automated changes are logged, reported, batched, and
   one-click reversible; fixed events never move.
2. **Honest accountability.** Strict streaks, real slippage data, no freezes — the
   review loop tells the truth the user needs, not the lie that flatters them.
3. **Capture outruns the thought.** Getting a task recorded must always be faster
   than the forgetting it prevents.
4. **Server-backed memory.** State lives in Postgres; browser storage is never the
   authoritative source of truth.
5. **Explain before it moves.** Placements and proposals are nameable and reversible
   because the agent learns from evidence, not vibes.

## Accessibility & Inclusion

- **WCAG 2.2 AA is a product requirement, not an aspiration:** gated measured
  contrast (99 verified pairs across themes), axe-core zero-violation E2E on the
  routes, 44×44 min hit targets (WCAG 2.5.5), strict reduced-motion respect with an
  in-app override.
- **Zero color-alone communication:** every status color pairs with an icon/shape
  (D-14), so both colorblind users and noisy screens read the same day.
