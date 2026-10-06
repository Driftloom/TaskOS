# Cadence — Enterprise UI & Frontend Audit: Security & Trust UX

> **Audit Date:** 2026-10-06T23:40:00+05:30  
> **Source Verification:** `artifacts/api-server/src/lib/rls.ts`, `lib/db/src/schema/notifications.ts`, `artifacts/cadence/src/components/agent/ActionPreview.tsx`  
> **Audit Standard:** `docs/13-master-design-system-prompt.md` §P27, `spec/locked-decisions.md` D-05, D-16, D-17, D-26  

---

## 1. Multi-Tenant Data Isolation & RLS Security

### Architecture:
- Every database query touching user records runs through `runWithRls`:
  - Sets transaction claims: `SET LOCAL "request.jwt.claims" = ...`
  - Drops connection privileges: `SET LOCAL ROLE authenticated`
  - Policies assert: `auth.jwt()->>'sub' = user_id`
- **Fail-Closed Guarantee:** If no authentication token is provided, `runWithRls` sets a match-nothing claims payload, ensuring zero cross-tenant row leakage.
- **Contract Tests:** Contract test suite `artifacts/api-server/src/tests/http-contract.test.ts` asserts that unauthenticated requests to any protected endpoint return `401 Unauthorized` JSON.

---

## 2. Automation Kill Switch End-to-End

### Invariants:
1. `automation_flags` table stores global safety switches (`reminders`, `reschedule`).
2. Write permissions are restricted exclusively to owner roles; standard authenticated clients cannot directly overwrite flags via Supabase PostgREST.
3. Express server exposes strictly validated endpoints (`PUT /api/automation/flags/:key`) backed by strict zod validation.

### User Surface in Settings:
- Mounts in `/settings` under "Automation & Safety Controls".
- Provides direct toggle controls for `reminders_paused` and `reschedule_paused`.
- Mounts `AutomationPausedBanner` on `/today` and `/calendar` whenever automated actions are paused, ensuring the user is never left in the dark about system state.

---

## 3. Trust UX & Agent Action Safeguards

### Bulk Confirmation Threshold (>10 Tasks):
- Governed by Locked Decision **D-05** and contract-tested in `ActionPreview.test.tsx` (23 tests passing):
  - Touching ≤ 10 tasks allows single-click confirmation.
  - Touching **> 10 tasks** enforces an explicit bulk confirmation modal requiring the user to inspect the affected list before proceeding.
  - Dynamic button labeling: Displays explicit counts (e.g. "Reschedule 14 Tasks") rather than vague "Confirm" or "OK".

### Transparent Memory Provenance (D-10):
- Dedicated route `/memory` discloses learned user patterns.
- Distinguishes **Source A** (behavioral arithmetic: auto-updated from completed sessions) from **Source B** (conversational inferences: prompts user for confirmation).
- Displays decayed confidence levels as explicit meters with text values, never color alone.
