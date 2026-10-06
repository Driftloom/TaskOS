# Cadence — Enterprise UI & Frontend Audit: Route Inventory

> **Audit Date:** 2026-10-06T23:40:00+05:30  
> **Source Verification:** `artifacts/cadence/src/App.tsx`, `artifacts/cadence/src/components/chrome/AppShell.tsx`  
> **Audit Standard:** `ln-22-current-architecture-documenter` & `ln-53-documentation-auditor`  

---

## 1. Route Map & Protection Hierarchy

Every client-side route is managed by `wouter` with base path normalization (`stripBase`). Routes are classified into **Public Unauthenticated**, **Authentication Flow**, and **Protected Workspace** surfaces.

| Route Path | Page Component | Splitting Strategy | Gating / Auth Boundary | Primary Job / User Outcome |
|---|---|---|---|---|
| `/` | `HomeRedirect` / `LandingPage` | Lazy (`LandingPage.js` 5.3 kB) | Public (checks Clerk `useAuth`) | App entry point; renders landing hero for new visitors, redirects signed-in users |
| `/sign-in/*?` | `SignInPage` | Eager inside Clerk | Public auth flow | User authentication via Clerk hosted components |
| `/sign-up/*?` | `SignUpPage` | Eager inside Clerk | Public auth flow | New user onboarding registration |
| `/download` | `DownloadPage` | Lazy (`DownloadPage.js` 9.1 kB) | Public | PWA & Android APK download portal with install guidance |
| `/today` | `TodayPage` | **Eager in entry chunk** | Protected (`requireAuth` + RLS) | Daily command center: Next Up, Focus timer launch, Activity Rings, quick capture |
| `/inbox` | `InboxPage` | Lazy (`InboxPage.js` 8.4 kB) | Protected (`requireAuth` + RLS) | Unprocessed task capture triage, tagging, due date assignment |
| `/focus` | `FocusPage` | **Eager in entry chunk** | Protected (`requireAuth` + RLS) | Deep work focus mode with Web Audio sound synthesis, countdown timer |
| `/calendar` | `CalendarPage` | Lazy (`CalendarPage.js` 21.6 kB) | Protected (`requireAuth` + RLS) | Hour-grid time-blocking, drag-and-drop task scheduling |
| `/projects` | `ProjectsPage` | Lazy (`ProjectsPage.js` 11.3 kB) | Protected (`requireAuth` + RLS) | Project organization, milestone tracking, project-scoped task filters |
| `/agent` | `AgentPage` | Lazy (`AgentPage.js` 3.5 kB) | Protected (`requireAuth` + RLS) | Conversational AI assistant with memory integration, bulk confirmation |
| `/review` | `ReviewPage` | Lazy (`ReviewPage.js` 14.2 kB) | Protected (`requireAuth` + RLS) | Evening / weekly review ritual, completed task reflection, streak tracking |
| `/activity` | `ActivityPage` | Lazy (`ActivityPage.js` 10.8 kB) | Protected (`requireAuth` + RLS) | Historical completion analytics, Activity Ring milestones, focus statistics |
| `/memory` | `MemoryPage` | Lazy (`MemoryPage.js` 28.9 kB) | Protected (`requireAuth` + RLS) | Transparent AI memory facts viewer: Source A (behavioral) & Source B (chat) facts |
| `/settings` | `SettingsPage` | Lazy (`SettingsPage.js` 52.2 kB) | Protected (`requireAuth` + RLS) | System preferences: Timezone, Working hours, Automation kill switches, Density |
| `/profile` | `ProfilePage` | Lazy (`ProfilePage.js` 18.9 kB) | Protected (`requireAuth` + RLS) | Clerk user account settings, sign out, device information |
| `/*` (Fallback)| `NotFound` | Eager in entry chunk | Catch-all | 404 error page with safe navigation return to `/today` |

---

## 2. Code-Splitting Architecture & Chunk Bundling

Following the P26.3 code splitting refactor, route modules are dynamically imported using `React.lazy`:
- **Eager Routes:** Only `/today`, `/focus`, and `NotFound` reside in the initial entry bundle (`assets/index-Bw17gSOP.js`, 110.45 kB gzip).
  - *Rationale:* Today is the first paint after authentication; Focus is one tap away from Next Up; NotFound handles sudden route failures without network latency.
- **Lazy Routes:** 10 routes split into isolated on-demand chunks.
- **Prefetched Modals:** `QuickCaptureSheet` (1556 lines) is dynamically imported but warmed during browser idle time so pressing `N` or tapping `+` has zero latency.
- **Vendors Split:**
  - `vendor-react` (61.23 kB gzip): React, React-DOM, Wouter.
  - `vendor-query` (10.61 kB gzip): TanStack React Query.
  - `vendor-toast` (9.55 kB gzip): Sonner toast notifications.
  - `vendor-icons` (8.13 kB gzip): Lucide React SVG icons.
