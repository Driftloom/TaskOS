# Cadence progress

| Module | Status | Tested |
| --- | --- | --- |
| Foundation and app shell | Complete | Clerk auth, branded auth routes, protected API, responsive shell, full typecheck |
| Task capture and CRUD | Tier-1 backend complete, authed e2e done (1 user) | `dueText` end-to-end incl. web editor box; projects/tags (0002), subtasks (0003), file links (0004) live with RLS verified + 44 vitest green; localhost full stack (web 5173 + API 5000) serving; authed battery green with real Clerk JWT (201s, exact 400 bodies, 204s, DB back to zero); two-account live still needs a 2nd user's token |
| Today and Inbox views | Complete | Existing task loop works behind authentication; visual preview verified |
| Calendar | Day + week/month blocks, drag-move done | `time_blocks` (0005) live; block CRUD + day/range API; day hour grid with drop-create and chip drag-move; week/month block counts; 86 vitest green; blank task-less blocks deferred |
| Focus rounds | Target, rings, heartbeat done; device test manual | Daily target setting, Activity Rings + streak on Today via `/momentum`, per-minute persist so reloads resume; 72 vitest green |
| Reminders | Backend live, Telegram send pending bot token | 0006 (reminders, runs, settings, kill-switch flags) live with RLS verified incl. owner-only watchdog log; tiers/quiet/expiry logic + Telegram commands 65 vitest green; dispatch + webhook code-complete, 401/503 gates verified live; BotFather token + webhook URL + cron are owner steps |
| Auto-reschedule engine | Backend live, sweep proven on localhost | 0008 (counters, proposals, runs, dial settings) live; mode matrix/cap/flag rules unit-tested; sweep moves/flags/proposes idempotently with kill switch; ask-mode confirmable via API + Telegram; 86 vitest green |
| Agent and memory | Not started | — |
| Recurrence and review rituals | Planned (Review ledger shell only) | Recurrence and review ritual remain separate from basic task CRUD |
| Settings and data export | Not started | — |
| Analytics | Not started (daily counts only via /tasks/summary) | — |
| Security hardening (2026-09-12 batch) | Cutover verified at DB/policy level, live HTTP tests pending | Fresh Supabase project: base tables + 0001 applied as owner 2026-09-16 — RLS on, 8 policies, FK + 3 CHECKs, user_id default live-verified; A/B isolation probed (B sees 0 rows, cross-insert + cross-delete blocked); lib/db + api-server typecheck green; signed-out 401 + `/api/healthz` 200 verified on localhost 2026-09-17; authed-200 + two-account live test still pending (needs browser Clerk session) |