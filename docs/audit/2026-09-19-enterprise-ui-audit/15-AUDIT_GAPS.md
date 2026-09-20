# Cadence — Audit Gaps & Verification Boundaries

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Enterprise Quality Auditor  
> **Scope:** Explicit inventory of unverified runtime surfaces, testing boundaries, and physical execution gaps identified during the zero-trust frontend audit.

---

## 1. Executive Statement of Boundaries

In accordance with the **Zero-Trust Enterprise Audit Protocol** (`docs/governance/zero-trust-audit-prompt.md` §0, §4), this audit operated under a strict **Read-Only / Evidence-First** posture. No source code was modified, no test runners were executed destructively, and no unverifiable assumptions were made.

While code paths, AST structures, CSS token math, network imports, and React component lifecycles were inspected down to exact file lines, certain operational behaviors require live physical hardware, browser sandboxes, or external service keys that were outside this session's execution perimeter. This document catalogs those unverified boundaries, classifies their risk, and prescribes the exact verification protocols required before Phase 14 production sign-off.

---

## 2. Audit Gaps Inventory

| Gap ID | Dimension | Target Surface | Blocked Verification Item | Root Reason / Perimeter Constraint | Risk Level | Prescribed Resolution Protocol |
|---|---|---|---|---|---|---|
| `GAP-ENV-001` | Runtime E2E | Playwright Suite | Automated browser regression runs against local Vite dev server | Terminal execution sandbox limits automated browser launching without bypass permissions | **High** | Run Playwright test runner in unsandboxed CI environment (`pnpm test:e2e`) |
| `GAP-PWA-001` | Mobile OS | iOS Safari PWA | Standalone Web Push notification receipt & badge updates | iOS Web Push requires real Apple Developer APNs certificates, HTTPS, and iOS 16.4+ physical device | **Critical** | Physical iPhone test: Add to Home Screen, trigger manual push via API, verify banner and audio |
| `GAP-PWA-002` | Hardware UX | iOS Safari Shell | Home indicator swipe-gesture collision with floating dock | Physical capacitive touch area of iOS home bar varies across iPhone 13/14/15/16 physical models | **High** | Physical iPhone test across mini (375px), standard (390px), and Pro Max (430px) form factors |
| `GAP-A11Y-001`| Assistive Tech| Screen Readers | Real VoiceOver (macOS/iOS) & NVDA (Windows) announcement streams | Accessibility tree inspected via DOM/ARIA, but live speech synthesizer timing and focus traps unverified | **High** | Manual screen reader walkthrough of `TaskEditor`, `RitualDialog`, and `CommandPalette` |
| `GAP-A11Y-002`| Assistive Tech| Dynamic Announcements | Web Audio chime perception by hearing-impaired users | Synth chime code verified in `sound.ts`, but visual caption or toast fallback parity unverified | **Medium** | Test with audio muted; verify UI visual feedback (Activity Ring bounce, toast notification) |
| `GAP-PERF-001`| Network / CWV | Mobile Core Web Vitals| Real LCP, INP, CLS on CPU-throttled mid-tier Android hardware | Synthetic code inspection conducted; real Chrome DevTools 4x CPU / Fast 3G throttling unmeasured | **Medium** | Run Lighthouse / WebPageTest audit on deployed staging environment under 4x CPU throttle |
| `GAP-PERF-002`| GPU Rendering| SVG Noise Filter | Dropped frame rate during rapid inertial scrolling | SVG `feTurbulence` GPU composite overhead depends on mobile GPU rasterization engines | **Medium** | Profile frame rate (FPS meter) on low-power mobile browser during list scroll |
| `GAP-DND-001` | Touch Input | Calendar Drag-Drop | Physical touch event translation on iPad / Android tablets | Code inspection verified HTML5 drag events lack touch polyfill; physical touch response unmeasured | **Critical** | Physical tablet testing: verify whether tap-to-schedule modal acts as touch fallback |
| `GAP-INT-001` | Third-Party API| Clerk Auth Flow | Multi-tab session synchronization and token expiration UX | Live Clerk JWT refresh loop requires active network session with Clerk production servers | **Medium** | Multi-tab test: expire JWT in dev tools and verify redirect/silent refresh behavior |
| `GAP-INT-002` | Third-Party API| Telegram Bot Webhook| Two-way command round-trip (`done`, `snooze 1h`, `list today`) | Telegram Bot API requires public webhook URL (ngrok/Cloudflare tunnel) or polling daemon | **High** | End-to-end integration test with live Telegram test bot and user chat ID |

---

## 3. Deep Dive into Critical Gaps

### 3.1 `GAP-PWA-001`: Physical iOS PWA Push Notification Delivery
- **The Reality:** As established in `spec/integrations-and-apis.md §4` and `spec/locked-decisions.md D-15`, iOS PWA push notifications are notoriously fragile. On iOS 16.4+, web push only functions if:
  1. The app is explicitly added to the Home Screen via Safari.
  2. The user grants push permissions via a direct user-initiated gesture.
  3. The service worker is registered with an Apple Push Notification service (APNs) compatible VAPID key.
  4. The background process is not terminated by iOS aggressive power management.
- **Why It Was Not Tested in Static Audit:** Static code inspection confirms `manifest.json`, `sw.js`, and VAPID public key variables exist. However, simulated desktop browsers and Emulated DevTools cannot simulate APNs routing, background delivery when the device is locked, or iOS silent background push throttling.
- **Remediation Requirement:** Maintain Telegram Bot as primary notification channel (`D-15`). Physical device testing required prior to Phase 14.

### 3.2 `GAP-DND-001`: Touch-Based Time Blocking in Calendar
- **The Reality:** In `artifacts/cadence/src/pages/calendar/CalendarPage.tsx` lines 69–94, dragging an unscheduled task into an hour block relies entirely on standard HTML5 Drag and Drop events (`onDragStart`, `onDragOver`, `onDrop`).
- **Why It Is Inoperable on Mobile:** Mobile WebKit (iOS Safari) and mobile Blink (Chrome Android) **do not support native HTML5 drag and drop** without an explicit polyfill (such as `drag-drop-touch`) or a pointer-event abstraction library (such as `@dnd-kit/core`).
- **Audit Verdict:** Code inspection mathematically proves this feature is 100% broken on touch devices. However, whether the fallback "Click to open time-picker" flow is intuitive on touch devices remains unverified by live users.

### 3.3 `GAP-A11Y-001`: Live Screen Reader Verification
- **The Reality:** ARIA attributes were inspected across all components (`TaskRow.tsx`, `AppShell.tsx`, `TaskEditor.tsx`, `RitualDialog.tsx`).
- **Identified Latent Risks:**
  - `RitualDialog.tsx` uses custom `div` elements instead of `<dialog>` or Radix primitive with `role="dialog"` and `aria-modal="true"`. Focus is not programmatically trapped inside the dialog when opened.
  - `StateViews.tsx` uses generic `role="alert"` for `ErrorState`, which will announce the error, but the "Retry" button lacks an `aria-describedby` linking it to the error description.
  - While VoiceOver and NVDA will follow the DOM tree, focus management upon modal open/close may dump the user at the top of the body (`<body>`).

---

## 4. Verification Protocol for Build Phase 14

Prior to completing Phase 14 ("Full manual QA pass & 2-week parallel-run trial" in `spec/system-requirements.md §6`), the following mandatory manual test matrix must be executed and recorded:

```
[ ] Test 1: Real iPhone 14/15/16 Safari -> Add to Home Screen -> PWA Launch -> Verify safe area padding
[ ] Test 2: Two-account RLS isolation test -> Verify User A cannot fetch User B tasks via modified client ID
[ ] Test 3: Focus Timer background survival -> Start 25m timer -> Lock phone for 10m -> Unlock -> Verify timer accuracy
[ ] Test 4: VoiceOver walkthrough on macOS Safari -> Complete task creation flow using keyboard + VoiceOver only
[ ] Test 5: Telegram Bot webhook test -> Send "/done <task-id>" -> Verify task status changes in web UI in real-time
[ ] Test 6: Network offline test -> Turn on Airplane mode -> Create task -> Turn off Airplane mode -> Verify sync/error
```
