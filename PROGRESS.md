# Cadence progress

| Module | Status | Tested |
| --- | --- | --- |
| Foundation and app shell | Complete | Clerk auth, branded auth routes, protected API, responsive shell, full typecheck |
| Task capture and CRUD | Tier-1 backend complete, authed e2e done (1 user) | `dueText` end-to-end incl. web editor box; projects/tags (0002), subtasks (0003), file links (0004) live with RLS verified + 44 vitest green; localhost full stack (web 5173 + API 5000) serving; authed battery green with real Clerk JWT (201s, exact 400 bodies, 204s, DB back to zero); two-account live still needs a 2nd user's token |
| Today and Inbox views | Complete | Existing task loop works behind authentication; visual preview verified |
| Calendar | Day view time-blocking done, week/month counts-only | `time_blocks` (0005) live with RLS verified; block CRUD + day-range API; day view hour grid 06–22 with drag-drop + overlap 400s; 48 vitest green |
| Focus rounds | Usable timer + persisted sessions, needs background test (corrected 2026-09-12; was "Planned") | Start/pause/resume/finish + focus minutes in summary; daily round target, Activity Ring, background/reopen manual test pending |
| Reminders | Not started | — |
| Auto-reschedule engine | Not started | — |
| Agent and memory | Not started | — |
| Recurrence and review rituals | Planned (Review ledger shell only) | Recurrence and review ritual remain separate from basic task CRUD |
| Settings and data export | Not started | — |
| Analytics | Not started (daily counts only via /tasks/summary) | — |
| Security hardening (2026-09-12 batch) | Cutover verified at DB/policy level, live HTTP tests pending | Fresh Supabase project: base tables + 0001 applied as owner 2026-09-16 — RLS on, 8 policies, FK + 3 CHECKs, user_id default live-verified; A/B isolation probed (B sees 0 rows, cross-insert + cross-delete blocked); lib/db + api-server typecheck green; signed-out 401 + `/api/healthz` 200 verified on localhost 2026-09-17; authed-200 + two-account live test still pending (needs browser Clerk session) |