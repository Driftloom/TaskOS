# End-to-End Verification Architecture & Test Catalog

> **Playwright E2E Verification Blueprint**<br>
> **Audit Snapshot:** 2026-10-11<br>
> **Inventory Refreshed:** 2026-10-21<br>
> **Last Measured:** 151 tests across 19 spec files via `pnpm run verify:e2e:desktop`

---

## 1. Playwright E2E Architecture Overview

The Cadence E2E suite lives in `artifacts/cadence/tests/e2e/*.spec.ts` and currently contains **19 spec files / 151 tests**.
- **API Isolation:** Many specs intercept `/api/*` with `page.route()` and deterministic fixtures, avoiding a live PostgreSQL, Clerk, or Telegram dependency. Inspect individual specs for the exact mocking boundary.
- **Server Requirement:** Playwright is configured in `artifacts/cadence/playwright.config.ts` and starts or targets the Vite dev server. The port defaults to `E2E_PORT ?? 5173`; there is no requirement for a `vite preview` server on port 4173.
- **Counts Are Measurements:** Re-run `pnpm run verify:e2e:desktop` before citing a count. Do not inherit the previous 144-test claim, which was stale.

---

## 2. E2E Spec Inventory (19 Spec Files)

| Spec File | Current Status |
|---|---|
| `a11y-audit.spec.ts` | Tracked |
| `agent-chat.spec.ts` | Tracked |
| `auth-design-and-quality.spec.ts` | Tracked |
| `auth.spec.ts` | Tracked |
| `console.spec.ts` | Tracked |
| `density-control.spec.ts` | Tracked |
| `density.spec.ts` | Tracked |
| `design-system.spec.ts` | Tracked |
| `focus-mini-chip.spec.ts` | Tracked |
| `focus.spec.ts` | Tracked |
| `goals.spec.ts` | Tracked |
| `keyboard.spec.ts` | Tracked |
| `memory-and-rituals.spec.ts` | Tracked |
| `monthly-goals.spec.ts` | Tracked |
| `navigation.spec.ts` | Tracked |
| `pages.spec.ts` | Tracked |
| `task-search-and-archive.spec.ts` | Tracked |
| `tasks.spec.ts` | Tracked |
| `token-layer.spec.ts` | Tracked |

The previous inventory listed 16 specs that do not exist (`today-view`, `inbox-triage`, `quick-capture`, `focus-timer`, `calendar-blocks`, `reschedule-flow`, `agent-panel`, `memory-transparency`, `goals-rituals`, `projects-tags`, `task-editor`, `search-archive`, `settings-view`, `auth-navigation`, `multi-tab-sync`, `offline-outbox`). Those entries were not evidence and have been removed.

---

## 3. End-to-End User Verification Journeys

The 5 primary critical user journeys that the owner must execute manually are defined in `docs/audits/zero-trust-verification/06-manual-verification-master-plan.md`:
1. **Journey 1: Mobile Quick Capture to Scheduled Calendar:** Capture via NL string → triage into project → drag into calendar time slot.
2. **Journey 2: Deep Focus Sprints with Zero Audio Bleed:** Start 25m round on task → switch to background → return and complete round → hear single chime.
3. **Journey 3: Autonomous Overdue Sweep & Proposal Triage:** Nightly sweep runs → moves tasks <5 times → flags 6th miss as proposal → user approves in 1 click.
4. **Journey 4: Two-Way Telegram Conversational Sync:** Telegram alerts user → user replies `done` → web app updates instantly.
5. **Journey 5: Guided Monthly Goal Review & Immutability Freeze:** Monthly ritual runs → captures final progress → freezes snapshot table irrevocably.
