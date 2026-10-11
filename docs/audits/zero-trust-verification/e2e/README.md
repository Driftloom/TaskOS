# End-to-End Verification Architecture & Test Catalog

> **Playwright E2E Verification Blueprint**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  

---

## 1. Playwright E2E Architecture Overview

The Cadence E2E verification suite comprises **144 Playwright tests across 19 spec files** (`tests/e2e/*.spec.ts`).
- **Self-Mocking API Design:** Playwright tests intercept `/api/*` network requests using `page.route()`, returning deterministic fixtures without requiring a live PostgreSQL instance or third-party Clerk connectivity in CI.
- **Preview Server Requirement:** E2E tests drive real browser interactions against a running preview server on port 4173 (`pnpm --filter @workspace/cadence run serve`).

---

## 2. E2E Spec Inventory (19 Spec Files / 144 Tests)

| Spec File | Test Count | Target Capabilities Verified |
|---|---|---|
| `a11y-audit.spec.ts` | 8 | Automated Axe-Core WCAG 2.1 AA audits across dark and light themes. |
| `keyboard.spec.ts` | 12 | Focus trapping, Tab sequence, modal Escape lifecycle, keyboard shortcuts. |
| `density.spec.ts` | 6 | Comfortable, Default, and Compact density switching and pointer fine guards. |
| `today-view.spec.ts` | 14 | NextUp card render, task completion toggle, inline capture, daily progress ring. |
| `inbox-triage.spec.ts` | 10 | Inbox filtering, drag to project, date scheduling, bulk selection. |
| `quick-capture.spec.ts` | 12 | Natural language parsing, chip removal, ambiguity resolution, draft save. |
| `focus-timer.spec.ts` | 10 | Pomodoro round transitions, break periods, wall-clock survival, audio controls. |
| `calendar-blocks.spec.ts`| 8 | Day/week view grids, collision alerts, time-block resizing. |
| `reschedule-flow.spec.ts`| 10 | Proposal card interactions, 1-click batch accept, deferral dialog. |
| `agent-panel.spec.ts` | 12 | Conversational chat, tool execution preview, >10 task confirmation modal. |
| `memory-transparency.spec.ts` | 8 | Fact confidence badges, decay visualization, approval/decline queues. |
| `goals-rituals.spec.ts` | 6 | Month-close wizard, metrics calculation, snapshot freeze display. |
| `projects-tags.spec.ts` | 8 | Project CRUD, tag assignment, color swatch selector. |
| `task-editor.spec.ts` | 10 | Task modal drawer, note editing, recurrence rule picker, subtask trees. |
| `search-archive.spec.ts` | 8 | Real-time full-text search, archive view, restoration from archive. |
| `settings-view.spec.ts` | 8 | Timezone menu, working hours sliders, Telegram QR code render. |
| `auth-navigation.spec.ts`| 6 | Unauthenticated redirect to `/`, sign-in modal, session persistence. |
| `multi-tab-sync.spec.ts`| 4 | BroadcastChannel logout sync, query cache purge across windows. |
| `offline-outbox.spec.ts` | 4 | Service worker offline shell render, localStorage outbox replaying. |

---

## 3. End-to-End User Verification Journeys

The 5 primary critical user journeys that the owner must execute manually are defined in `docs/audits/zero-trust-verification/06-manual-verification-master-plan.md`:
1. **Journey 1: Mobile Quick Capture to Scheduled Calendar:** Capture via NL string → triage into project → drag into calendar time slot.
2. **Journey 2: Deep Focus Sprints with Zero Audio Bleed:** Start 25m round on task → switch to background → return and complete round → hear single chime.
3. **Journey 3: Autonomous Overdue Sweep & Proposal Triage:** Nightly sweep runs → moves tasks <5 times → flags 6th miss as proposal → user approves in 1 click.
4. **Journey 4: Two-Way Telegram Conversational Sync:** Telegram alerts user → user replies `done` → web app updates instantly.
5. **Journey 5: Guided Monthly Goal Review & Immutability Freeze:** Monthly ritual runs → captures final progress → freezes snapshot table irrevocably.
