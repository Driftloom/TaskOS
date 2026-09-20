# Cadence — Complete Route & Page Inventory

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Enterprise UI Auditor  
> **Router Implementation:** Wouter v3 (`artifacts/cadence/src/App.tsx`)  
> **Zero-Trust Rule:** "Nothing is considered correct until independently verified."  

---

## 1. Primary Route Matrix

| Route | Page Name | Layout | Component Entry | Auth Required | Data Dependency | Responsive | Loading State | Empty State | Error State | Accessibility State | Performance Risk | Audit Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | Home / Gateway | Root Switch | `HomeRedirect` (`App.tsx`) | Conditional | Static / Hybrid | Verified | Present (`LoadingScreen`) | N/A | Missing | Partially Verified | Low | **Pass** |
| `/sign-in/*?` | Sign In | Centered Grid | `SignInPage` (`App.tsx`) | Public | Clerk API | Verified | Present (Clerk internal) | N/A | Present (Clerk internal) | Verified (Clerk) | Medium | **Pass** |
| `/sign-up/*?` | Sign Up | Centered Grid | `SignUpPage` (`App.tsx`) | Public | Clerk API | Verified | Present (Clerk internal) | N/A | Present (Clerk internal) | Verified (Clerk) | Medium | **Pass** |
| `/today` | Today (Command Center) | `AppShell` | `TodayPage` (`TodayPage.tsx`) | Required | API (`/api/tasks`, `/api/tasks/summary`, `/api/focus-sessions/momentum`) | Verified | Present (`SkeletonList`) | Present (`EmptyState`) | Present (`ErrorState`) | Finding (Touch targets <44px) | Low | **Finding** |
| `/inbox` | Inbox (Triage) | `AppShell` | `InboxPage` (`InboxPage.tsx`) | Required | API (`/api/tasks?scope=inbox`) | Verified | Present (`SkeletonList`) | Present (`EmptyState inbox`) | Present (`ErrorState`) | Finding (Priority icon mismatch, 28px buttons) | Low | **Finding** |
| `/focus` | Focus Timer | `AppShell` | `FocusPage` (`FocusPage.tsx`) | Required | API (`/api/focus-sessions`, `/api/focus-settings`) | Verified | Present (Task title skeleton) | Present (No active tasks fallback) | Missing | Finding (Stepper buttons <44px, no fullscreen) | Low | **Finding** |
| `/calendar` | Calendar & Time Blocks | `AppShell` | `CalendarPage` (`CalendarPage.tsx`) | Required | API (`/api/tasks`, `/api/task-blocks`) | Finding (Drag-drop touch failure) | Present (`SkeletonList`) | Partial (Empty month cells) | Present (`ErrorState`) | Finding (Drag-and-drop inaccessible on touch, 16px X button) | Medium | **Finding** |
| `/review` | Daily / Weekly Review | `AppShell` | `ReviewPage` (`ReviewPage.tsx`) | Required | API (`/api/tasks/summary`, `/api/tasks`) | Verified | Present (Card skeletons) | Present (Ledger empty slate) | Present (`ErrorState`) | Finding (`div onClick` non-semantic cards) | Low | **Finding** |
| `/memory` | Memory Transparency | `AppShell` | `MemoryPage` (`MemoryPage.tsx`) | Required | **Mocked** (`localStorage`) | Verified | Missing | Present (No matching facts) | Missing | Finding (Contrast ratio 4.09:1 for AI Indigo) | Low | **Critical** (Client mock) |
| `/onboarding` | 3-Step Onboarding Wizard| Standalone / `AppShell` | `OnboardingPage` (`OnboardingPage.tsx`) | Required | **Mocked** (`localStorage`) | Verified | Missing | N/A | Missing | Finding (Non-semantic dial cards, buttons <44px) | Low | **Critical** (Client mock) |
| `/profile` | Profile & Identity Ledger | `AppShell` | `ProfilePage` (`ProfilePage.tsx`) | Required | API (`/api/tasks`, Clerk `useUser`) | Verified | Missing | N/A | Missing | Finding (Local-only 24h toggle, hardcoded badges) | Low | **Finding** |
| `/settings` | Settings & Boundaries | `AppShell` | `SettingsPage` (`SettingsPage.tsx`) | Required | API (`/api/focus-settings`) + Mock/Local | Verified | Present (Focus settings query) | N/A | Missing | Finding (Unsaved timezone input, monolithic child) | High (926-line subcomponent) | **Finding** |
| `*` (Fallback)| 404 Not Found | Standalone Grid | `NotFound` (`not-found.tsx`) | Public | Static | Verified | Missing | N/A | N/A | **Critical** (Light-mode flash `#F9FAFB`, no escape link) | Low | **Critical** |

---

## 2. Information Architecture Discrepancy Analysis

Comparing the live routing in `artifacts/cadence/src/App.tsx` against the authoritative Information Architecture in `spec/system-requirements.md §3`:

| Spec Route | Spec Purpose | Live Status in Codebase | Implementation Reality |
|---|---|---|---|
| `/projects` | Project list & per-project task view | **Missing** | Not defined in router, no file exists in `src/pages/projects/`. Deferred or omitted without spec reconciliation. |
| `/agent` | In-app conversational chat panel | **Missing** | Not defined in router, no file exists in `src/pages/agent/`. Backend agent endpoints exist, but frontend UI surface is unmounted. |
| `/landing` | Signed-out marketing page | **Hybrid** | Mounted at `/` when signed out via `<Show when="signed-out"><LandingPage /></Show>`. Dedicated route `/landing` is not directly addressable. |
| `/today` | Vertical timeline & Activity Rings | **Present** | Fully mounted and operational. |
| `/inbox` | Uncategorized quick-captures | **Present** | Fully mounted and operational. |
| `/focus` | Focus round timer & stats | **Present** | Mounted, but lacks full-screen mode mandated in `spec/design-system.md §9`. |
| `/calendar` | Month/Week/Day + Time blocks | **Present** | Fully mounted; desktop drag-and-drop operational, touch drag-and-drop broken. |
| `/review` | Daily shutdown & ledger | **Present** | Fully mounted; includes Plan Day and Close Day modal triggers. |
| `/memory` | "What Cadence Knows About Me" | **Present (Mock)** | Fully designed visual layout, but disconnected from Postgres database. |
| `/onboarding` | Timezone & rhythm setup | **Present (Mock)** | Fully designed 3-step wizard, but writes only to client `localStorage`. |
| `/profile` | Account & rhythm ledger | **Present** | Fully mounted; features live IST clock and JSON backup export. |
| `/settings` | Working hours & integrations | **Present** | Fully mounted; contains monolithic `MessagingIntegrationsView`. |

---

## 3. Route Guard & Protection Trace

```
Incoming Request
  │
  ├─► Is Route "/"?
  │     ├── Signed In ──► Redirect to "/today"
  │     └── Signed Out ─► Render <LandingPage />
  │
  ├─► Is Route "/sign-in/*" or "/sign-up/*"?
  │     └── Render Clerk Auth Pages
  │
  └─► Any Other Route (ProtectedRouter)
        ├── Clerk Not Loaded && !isTestMode ──► Render <LoadingScreen />
        ├── User Not Signed In && !isTestMode ─► Redirect to "/"
        └── User Signed In (or DEV ?test_auth=true)
              └── Wrap in <ErrorBoundary resetKey={location}>
                    └── Wrap in <AppShell>
                          └── Mount Requested Page Route or <NotFound />
```

### Dev Mode Bypass Verification
In `artifacts/cadence/src/App.tsx` (Lines 147–158), a developer bypass exists:
```typescript
const isTestMode = import.meta.env.DEV && (
  typeof window !== 'undefined' && (
    window.location.search.includes('test_auth=true') ||
    window.localStorage.getItem('cadence_test_auth') === 'true'
  )
);
```
- **Security Check:** Verified that this is guarded by `import.meta.env.DEV`. In production builds, `import.meta.env.DEV` is compiled out as `false` by Vite, eliminating unauthorized bypass in production bundles.
