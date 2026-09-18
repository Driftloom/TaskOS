# Cadence progress

| Module | Status | Tested |
| --- | --- | --- |
| Foundation and app shell | Complete | Clerk auth, branded auth routes, protected API, responsive shell, full typecheck |
| Task capture and CRUD | NL dates done server-side, Tier-1 rest pending | POST/PATCH accept `dueText`+`timezone` (openapi → regen), deterministic EN parser, 32 vitest cases green; projects/tags, subtasks, file links still pending; web capture UI still sends `dueAt` only |
| Today and Inbox views | Complete | Existing task loop works behind authentication; visual preview verified |
| Calendar | Shell with counts, no time blocking (corrected 2026-09-12; was "Planned") | Day/Week/Month view with per-day counts; drag-drop, time_blocks table, backlog scheduling pending |
| Focus rounds | Usable timer + persisted sessions, needs background test (corrected 2026-09-12; was "Planned") | Start/pause/resume/finish + focus minutes in summary; daily round target, Activity Ring, background/reopen manual test pending |
| Reminders | Not started | — |
| Auto-reschedule engine | Not started | — |
| Agent and memory | Not started | — |
| Recurrence and review rituals | Planned (Review ledger shell only) | Recurrence and review ritual remain separate from basic task CRUD |
| Settings and data export | Not started | — |
| Analytics | Not started (daily counts only via /tasks/summary) | — |
| Security hardening (2026-09-12 batch) | Cutover verified at DB/policy level, live HTTP tests pending | Fresh Supabase project: base tables + 0001 applied as owner 2026-09-16 — RLS on, 8 policies, FK + 3 CHECKs, user_id default live-verified; A/B isolation probed (B sees 0 rows, cross-insert + cross-delete blocked); lib/db + api-server typecheck green; signed-out 401 + `/api/healthz` 200 verified on localhost 2026-09-17; authed-200 + two-account live test still pending (needs browser Clerk session) |