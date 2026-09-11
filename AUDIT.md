# Cadence build audit

## 2026-09-09

- Created the Cadence web artifact and kept the first slice intentionally narrow: task capture, Today, Inbox, completion, editing, deletion, and progress summary.
- Added the first OpenAPI contract and regenerated the typed client and validation schemas.
- Provisioned managed Clerk authentication and replaced the demo user scope with the authenticated Clerk user ID on every task route.
- Added branded sign-in/sign-up routes, a signed-out landing page, protected workspace routing, and a sign-out control.
- Added API routes backed by the Replit-managed PostgreSQL database.
- Seeded three starter tasks for the initial preview.
- Verified signed-out task access returns 401 while health remains public.
- The remaining product modules are still separate work: timezone-aware scheduling, focus sessions, calendar, reminders, rescheduling, recurrence, analytics, Telegram, export/settings, and the agent.