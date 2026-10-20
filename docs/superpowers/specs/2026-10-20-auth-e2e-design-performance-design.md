# Specification: Comprehensive End-to-End Auth Test Suite (Authentication, Authorization, Design System & Performance)

**Date:** 2026-10-20  
**Status:** PROPOSED  
**Authors:** Rohit, Antigravity Agent  
**Scope:** `artifacts/api-server`, `artifacts/cadence`, `lib/db`  

---

## 1. System Overview & Objectives

Cadence is a personal task and time-management OS. The authentication and authorization subsystems provide the foundational security perimeter for all user data:
1. **Authentication (Clerk Auth + Session Management):** Validates user credentials, provides Clerk-hosted `<SignIn />` and `<SignUp />` cards, manages JWT issuance, handles dev-mode test bypass (`cadence_test_auth`), and terminates sessions cleanly.
2. **Authorization (Row Level Security + Multi-Tenant Isolation):** Express 5 middleware (`requireAuth`) extracts user identity and session JWTs, passing them into PostgreSQL via `runWithRls(req, tx => ...)`. PostgreSQL sets `request.jwt.claims` and drops to `authenticated` role, enforcing strict per-user table isolation.
3. **Design System & Accessibility Conformance:** Auth surfaces must conform to Cadence design tokens (`tokens.json`), ensuring fluid card responsiveness (390px to 1440px), 44px minimum tap targets, WCAG 2.2 AA non-text ($\ge 3:1$) and text ($\ge 4.5:1$) contrast, and semantic `<main>` landmarks.
4. **Web Quality & Performance Budgets:** Auth route load performance, DOMContentLoaded and First Contentful Paint navigation timing budgets, hydration layout shift ($\text{CLS} < 0.05$), and backend auth rejection latency SLA ($< 50\text{ms}$).

---

## 2. Input Audit & Security Risk Model

### 2.1 Input Audit
- **Known Facts:**
  - Every API route (except `GET /api/healthz`) requires Clerk authentication (`requireAuth`) and executes inside `runWithRls`.
  - Frontend routes behind auth redirect unauthenticated users to `/`.
  - Clerk stylesheet cascade specificity requires explicit style objects in `App.tsx` using `inset 0 0 0 1px` box-shadow for borders and `--component-dimension-auth-card-w` (440px) on `rootBox` and `cardBox`.
  - Verification scripts exist (`verify-auth-surface.cjs`, `verify-two-account-isolation.cjs`, `verify-live-deployment.cjs`).
- **Missing / Test Gaps:**
  - Automated Vitest test suite explicitly asserting corrupted, truncated, and malformed JWTs on Express routes without database dependencies.
  - Vitest test asserting the backend auth rejection latency SLA ($< 50\text{ms}$).
  - Isolated React unit tests for `HomeRedirect`, `ProtectedRouter`, and deep-link redirect preservation (`cadence_last_path`).
  - Playwright E2E assertions for theme persistence across auth pages, fluid card responsiveness at 390px / 768px / 1440px, and Navigation Timing metrics on `/sign-in`.
- **Out of Scope:**
  - Modifying third-party Clerk servers or issuing real production Clerk credentials in automated tests.
  - Altering the fundamental multi-tenant RLS schema or migrating auth providers away from Clerk.

---

## 3. Detailed Finding Contracts & Test Cases

### 3.1 Authentication Contracts (`AUT-##`)

#### `AUT-01`: Protected Route Rejection Boundary
- **Object / Rule:** All routes mounted under `/api` (excluding `/api/healthz`) must reject unauthenticated requests with HTTP 401 JSON (`{"error": "Unauthorized"}`).
- **Source:** `spec/system-requirements.md §4`, `artifacts/api-server/src/middlewares/auth.ts`.
- **Trigger:** Calling any protected endpoint without an `Authorization` header or Clerk session cookie.
- **Expected Concern:** A route omitting `requireAuth` would allow anonymous access to private task and calendar data.
- **Evidence State:** Automated Vitest contract test (`auth-contract.test.ts`).
- **Impact / Priority:** P0 / Critical.
- **Owner Role:** Backend Engineer.
- **Close Condition:** All registered routes verified to return 401 JSON when unauthenticated.
- **Validation Method:** Iterative socket probe across the complete endpoint catalog.

#### `AUT-02`: Malformed, Truncated & Corrupted Token Defense
- **Object / Rule:** Requests carrying malformed JWTs (invalid characters, truncated segments, invalid base64, non-Bearer schemes) must fail closed with 401 JSON and never produce a 500 error or stack leak.
- **Source:** `artifacts/api-server/src/lib/rls.ts:22-30`, `artifacts/api-server/src/middlewares/auth.ts`.
- **Trigger:** Submitting `Authorization: Bearer invalid.jwt.token`, `Authorization: Basic xyz`, or malformed base64 headers.
- **Expected Concern:** An unhandled JSON parsing exception or buffer overflow in JWT decoding leading to application crash.
- **Evidence State:** Automated Vitest contract test (`auth-contract.test.ts`).
- **Impact / Priority:** P0 / Critical.
- **Owner Role:** Backend Engineer.
- **Close Condition:** 401 JSON returned cleanly; zero unhandled errors logged.
- **Validation Method:** Synthetic malformed token injections.

#### `AUT-03`: Auth Rejection Latency SLA
- **Object / Rule:** Unauthenticated or invalid requests must be rejected within $< 50\text{ms}$ (median), avoiding database connection exhaustion.
- **Source:** `spec/system-requirements.md §5`.
- **Trigger:** Burst of unauthenticated requests.
- **Expected Concern:** Slow auth middleware causing resource starvation.
- **Evidence State:** Vitest performance benchmark test.
- **Impact / Priority:** P1 / High.
- **Owner Role:** Performance Engineer.
- **Close Condition:** Median latency over 10 consecutive rejections $\le 50\text{ms}$.
- **Validation Method:** `performance.now()` socket timing.

#### `AUT-04`: Dev-Mode Auth Bypass Hardening
- **Object / Rule:** The `cadence_test_auth` bypass must only function when `import.meta.env.DEV === true` and never permit bypass in production bundles.
- **Source:** `artifacts/cadence/src/App.tsx:410`, `artifacts/cadence/src/App.tsx:569-574`.
- **Trigger:** Accessing protected routes with `?test_auth=true` or `localStorage.cadence_test_auth = 'true'`.
- **Expected Concern:** Inadvertent bypass activation in a deployed production environment.
- **Evidence State:** Unit tests in `App.test.tsx` and bundle inspection.
- **Impact / Priority:** P0 / Critical.
- **Owner Role:** Frontend Security Engineer.
- **Close Condition:** Production build ignores bypass; development build allows mock E2E navigation.
- **Validation Method:** Vitest unit test with simulated environment flags.

#### `AUT-05`: Sign-Out & Session Termination
- **Object / Rule:** Initiating sign-out displays an accessible confirmation dialog (`role="dialog"`, `aria-modal="true"`), dismissible with `Escape` or `Cancel`, and confirming sign-out clears tokens and redirects to `/`.
- **Source:** `artifacts/cadence/src/pages/profile/ProfilePage.tsx:619-689`, `tests/e2e/auth.spec.ts`.
- **Trigger:** User clicks "Sign Out" in Profile.
- **Expected Concern:** Accidental logout without confirmation or stuck session after sign-out.
- **Evidence State:** Playwright E2E spec (`TC-E2E-06`).
- **Impact / Priority:** P1 / High.
- **Owner Role:** Frontend Engineer.
- **Close Condition:** Confirmation dialog flow passes with keyboard dismiss and token purge.
- **Validation Method:** Headless Playwright browser test.

---

### 3.2 Authorization & RLS Contracts (`AZT-##`)

#### `AZT-01`: Multi-Tenant Cross-Account Read Isolation
- **Object / Rule:** Queries executed under Tenant A's session JWT must return zero rows for Tenant B's tasks, blocks, or goals, even if Tenant B's UUID is explicitly queried.
- **Source:** `AGENTS.md §4.1`, `artifacts/api-server/src/lib/rls.ts`, `lib/db/src/schema/`.
- **Trigger:** Tenant A sending `GET /api/tasks/:id` where `:id` belongs to Tenant B.
- **Expected Concern:** Inadvertent IDOR (Insecure Direct Object Reference) data exposure.
- **Evidence State:** Vitest integration test & `verify-two-account-isolation.cjs`.
- **Impact / Priority:** P0 / Critical.
- **Owner Role:** Security Engineer.
- **Close Condition:** Status 404 or empty collection returned when accessing foreign records.
- **Validation Method:** Direct Drizzle query execution with mocked tenant claims.

#### `AZT-02`: Multi-Tenant Cross-Account Mutation Denial
- **Object / Rule:** PATCH or DELETE requests executed under Tenant A's session targeting Tenant B's record ID must affect 0 rows and return 404 Not Found.
- **Source:** `spec/master-verification-matrix.md §3`.
- **Trigger:** Tenant A sending `PATCH /api/tasks/:id` with Tenant B's `:id`.
- **Expected Concern:** Unauthorized cross-account data modification or deletion.
- **Evidence State:** Vitest integration test.
- **Impact / Priority:** P0 / Critical.
- **Owner Role:** Security Engineer.
- **Close Condition:** Target record remains unchanged; 404 returned.
- **Validation Method:** Two-tenant transaction simulation.

#### `AZT-03`: Fail-Closed RLS On Missing Claims
- **Object / Rule:** When `runWithRls` is invoked without a valid token, it must inject `{"sub": null, "role": "authenticated"}` into `request.jwt.claims`, causing all RLS policies to evaluate false.
- **Source:** `artifacts/api-server/src/lib/rls.ts:32-38`.
- **Trigger:** Handler calling `runWithRls` when `req.authToken` is undefined.
- **Expected Concern:** Handler silently falling back to Postgres owner privileges and bypassing RLS.
- **Evidence State:** Vitest unit test in `rls.test.ts`.
- **Impact / Priority:** P0 / Critical.
- **Owner Role:** Backend Engineer.
- **Close Condition:** `set_config('request.jwt.claims', ...)` contains `sub: null`.
- **Validation Method:** Mock transaction inspection.

---

### 3.3 Design System & Accessibility Contracts (`DES-##`)

#### `TC-DES-07`: Responsive Fluid Card Geometry Across Breakpoints
- **Object / Rule:** The Clerk authentication card (`rootBox` and `cardBox`) must stay fluid on mobile (390px), tablet (768px), and desktop (1440px), capping at `--component-dimension-auth-card-w: 440px`, with zero horizontal scroll (`scrollWidth <= viewportWidth`) and $\ge 300\text{px}$ usable content width on a 390px viewport.
- **Source:** `artifacts/cadence/src/App.tsx:187-220`, `scripts/verify-auth-surface.cjs`.
- **Trigger:** Rendering `/sign-in` and `/sign-up` across viewport widths (390px, 768px, 1440px).
- **Evidence State:** Playwright E2E spec in `auth-design-and-quality.spec.ts`.
- **Impact / Priority:** P1 / High.
- **Validation Method:** Playwright bounding-box measurement and `document.documentElement.scrollWidth` assertion.

#### `TC-DES-08`: Input Touch Target & Zoom Safety
- **Object / Rule:** All input fields on `/sign-in` and `/sign-up` must have computed `minHeight >= 44px` and computed `fontSize >= 16px` (`1rem`) to prevent iOS Safari auto-zoom on focus.
- **Source:** `spec/design-system.md §2`, `artifacts/cadence/src/App.tsx:154-159`.
- **Trigger:** Focused input inspection on auth forms.
- **Evidence State:** Playwright E2E spec in `auth-design-and-quality.spec.ts`.
- **Impact / Priority:** P1 / High.
- **Validation Method:** `window.getComputedStyle(input)` in Playwright.

#### `TC-DES-09`: Theme Persistence & Dynamic Styling
- **Object / Rule:** Toggling the auth theme toggle flips between dark and light modes, immediately updates card styles, and persists the choice in `localStorage.cadence.theme` across page navigations.
- **Source:** `artifacts/cadence/src/App.tsx:444-459`.
- **Trigger:** Clicking `[data-testid="auth-theme-toggle"]`.
- **Evidence State:** Playwright E2E spec in `auth-design-and-quality.spec.ts`.
- **Impact / Priority:** P2 / Medium.
- **Validation Method:** Click toggle, assert `document.documentElement` class list, reload page, assert persistence.

#### `TC-DES-10`: WCAG 2.2 AA Contrast Compliance
- **Object / Rule:** In both light and dark themes, text elements (`colorForeground`, `colorNeutral`, `footerActionLink`) must achieve $\ge 4.5:1$ contrast against the card background, and interactive borders / controls must achieve $\ge 3:1$ contrast.
- **Source:** `scripts/verify-contrast.cjs`, `scripts/verify-auth-surface.cjs`.
- **Evidence State:** Playwright E2E spec with RGB luminance calculation.
- **Impact / Priority:** P1 / High.
- **Validation Method:** Playwright DOM color extraction and mathematical luminance calculation.

---

### 3.4 Web Quality & Performance Contracts (`PRF-##`)

#### `TC-PRF-01`: Navigation Timing & FCP Budget
- **Object / Rule:** On `/sign-in`, DOMContentLoaded must complete within $\le 1500\text{ms}$ and First Contentful Paint within $\le 2000\text{ms}$ under standard test conditions.
- **Source:** `spec/system-requirements.md §5`.
- **Evidence State:** Playwright E2E spec measuring `performance.getEntriesByType('navigation')`.
- **Impact / Priority:** P2 / Medium.
- **Validation Method:** Browser Performance API evaluation.

#### `TC-PRF-02`: Hydration Layout Stability (CLS)
- **Object / Rule:** Cumulative Layout Shift during Clerk card mounting and hydration must not exceed `0.05`.
- **Source:** `scripts/verify-core-web-vitals.cjs`.
- **Evidence State:** Playwright PerformanceObserver probe.
- **Impact / Priority:** P1 / High.
- **Validation Method:** PerformanceObserver evaluating `layout-shift` entries.

#### `TC-PRF-03`: Zero Console Error Budget
- **Object / Rule:** Page loads of `/`, `/sign-in`, and `/sign-up` must finish with zero console errors or unhandled promise rejections.
- **Source:** `artifacts/cadence/tests/e2e/fixtures.ts:collectPageProblems`.
- **Evidence State:** Playwright E2E spec.
- **Impact / Priority:** P1 / High.
- **Validation Method:** `page.on('console')` and `page.on('pageerror')`.

---

## 4. Test File Architecture & Deliverables

1. **`artifacts/api-server/src/tests/auth-contract.test.ts` (Vitest):**
   - Implements `AUT-01` (401 across all protected routes).
   - Implements `AUT-02` (malformed, truncated, non-Bearer tokens).
   - Implements `AUT-03` & `TC-PRF-04` (auth rejection latency $< 50\text{ms}$).
   - Implements `AZT-01` & `AZT-02` (cross-tenant multi-account isolation simulation).
2. **`artifacts/cadence/src/App.test.tsx` (Vitest + Testing Library):**
   - Implements `AUT-04` (dev bypass guard and production safety).
   - Tests `HomeRedirect` (signed-in vs signed-out paths).
   - Tests deep-link redirect preservation via `cadence_last_path`.
   - Tests `AuthThemeToggle` rendering and accessible title/aria-label.
3. **`artifacts/cadence/tests/e2e/auth.spec.ts` (Playwright E2E):**
   - Complete end-to-end journey tests (`TC-E2E-01` to `TC-E2E-07`).
   - Session sign-out dialog flow (`AUT-05`).
4. **`artifacts/cadence/tests/e2e/auth-design-and-quality.spec.ts` (Playwright E2E):**
   - Responsive fluid geometry across 390px, 768px, 1440px (`TC-DES-07`).
   - Input touch target and zoom safety (`TC-DES-08`).
   - Theme toggle persistence across routes (`TC-DES-09`).
   - WCAG 2.2 AA text and control contrast (`TC-DES-10`).
   - Navigation timing & layout stability (`TC-PRF-01`, `TC-PRF-02`, `TC-PRF-03`).

---

## 5. Execution Strategy & Quality Gates

All tests must integrate into Cadence's existing zero-trust verification ladder:
- `pnpm --filter @workspace/api-server test` executes `auth-contract.test.ts`.
- `pnpm --filter @workspace/cadence test` executes `App.test.tsx`.
- `pnpm run verify:e2e:desktop` executes `auth.spec.ts` and `auth-design-and-quality.spec.ts`.
- The full 12-gate ladder (`pnpm run verify`) must remain 100% green.
