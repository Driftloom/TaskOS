# Cadence progress

| Module | Status | Tested |
| --- | --- | --- |
| Foundation and app shell | Complete | Clerk auth, branded auth routes, protected API, responsive shell, full typecheck |
| Task capture and CRUD | Core complete, Tier-1 extras pending | Database-backed CRUD scoped to the signed-in Clerk user; NL date parsing, projects/tags, subtasks, file links still pending |
| Today and Inbox views | Complete | Existing task loop works behind authentication; visual preview verified |
| Calendar | Shell with counts, no time blocking (corrected 2026-09-12; was "Planned") | Day/Week/Month view with per-day counts; drag-drop, time_blocks table, backlog scheduling pending |
| Focus rounds | Usable timer + persisted sessions, needs background test (corrected 2026-09-12; was "Planned") | Start/pause/resume/finish + focus minutes in summary; daily round target, Activity Ring, background/reopen manual test pending |
| Reminders | Not started | — |
| Auto-reschedule engine | Not started | — |
| Agent and memory | Not started | — |
| Recurrence and review rituals | Planned (Review ledger shell only) | Recurrence and review ritual remain separate from basic task CRUD |
| Settings and data export | Not started | — |
| Analytics | Not started (daily counts only via /tasks/summary) | — |
| Security hardening (2026-09-12 batch) | In progress | demo-user default removed, FK + CHECK constraints added, CORS allowlisted, openapi securitySchemes added, RLS migration + per-request JWT wiring implemented; Supabase cutover + two-account live test pending (your manual steps) |