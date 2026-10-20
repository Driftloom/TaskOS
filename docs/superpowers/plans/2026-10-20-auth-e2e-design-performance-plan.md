# Comprehensive End-to-End Auth Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a comprehensive, zero-trust end-to-end test suite for Cadence covering Authentication, Authorization & RLS Isolation, Design System Conformance, and Web Quality/Performance budgets.

**Architecture:** Layered multi-tier testing strategy. Fast backend Vitest contract tests assert HTTP 401 boundaries, malformed JWT resilience, rejection latency SLA ($< 50\text{ms}$), and Postgres RLS cross-tenant isolation. Frontend Vitest unit tests verify `App.tsx` routing guards, dev bypass, and deep-link preservation. Playwright E2E specs verify end-to-end user journeys, responsive fluid card geometry (390px/768px/1440px), $\ge 44\text{px}$ tap targets, WCAG 2.2 AA contrast, and browser Navigation Timing budgets.

**Tech Stack:** Express 5, Clerk SDK, Drizzle ORM, Vitest, React 19, Playwright E2E, Tailwind v4 design tokens.

**Spec:** [`docs/superpowers/specs/2026-10-20-auth-e2e-design-performance-design.md`](file:///c:/PROJECTS/PIOS/ClonU\Driftloom\Cadence-Task-OS\docs\superpowers\specs\2026-10-20-auth-e2e-design-performance-design.md)

---

## Global Constraints

- Never use raw Pool queries; all authenticated routes use `runWithRls(req, tx => ...)`.
- Rejections must be HTTP 401 JSON (`{"error": "Unauthorized"}`), never HTML.
- Every assertion must be unconditional (no `if (await el.isVisible())` escapes or swallowed exceptions).
- Tap targets must be $\ge 44\text{px}$ on touch controls and inputs. Input font size must be $\ge 16\text{px}$ (`1rem`) to prevent iOS auto-zoom.
- Output text and scripts must be codepage 437 / ASCII-safe on Windows.
- All Git commits must be made with `--no-gpg-sign` to avoid headless pinentry timeouts.

## Review Focus

1. **Malformed token crash:** A corrupted base64 or non-Bearer token throws an uncaught exception in Express resulting in a 500 HTML leak instead of a clean 401 JSON response.
2. **Cross-tenant IDOR leak:** A user knowing another user's task UUID attempts to read or mutate it via an authenticated API endpoint.
3. **Production dev-bypass leak:** `cadence_test_auth` bypass activating in a non-development environment.
4. **Mobile viewport card blow-out:** The Clerk auth card or inputs exceeding 390px on mobile screens and creating horizontal scrolling.
5. **Slow auth rejection DoS:** Unauthenticated requests stalling the event loop or consuming database connections before rejecting.

---

### Task 1: Backend Auth Boundary & Rejection Latency Contract Suite

**Files:**
- Create: `artifacts/api-server/src/tests/auth-contract.test.ts`

**Interfaces:**
- Consumes: `artifacts/api-server/src/app.ts`, `node:http`, `fetch`
- Produces: Vitest suite asserting `AUT-01`, `AUT-02`, `AUT-03`, `TC-PRF-04`

- [ ] **Step 1: Write the failing tests in `artifacts/api-server/src/tests/auth-contract.test.ts`**
  Cover:
  1. `AUT-01`: Protected routes return 401 JSON to unauthenticated requests.
  2. `AUT-02`: Corrupted base64, missing sub, truncated tokens (`Bearer abc`), and non-Bearer headers (`Basic xyz`) return 401 JSON without 500 crashes.
  3. `AUT-03` / `TC-PRF-04`: 10 consecutive unauthenticated requests complete with a median response time $\le 50\text{ms}$.

- [ ] **Step 2: Run test to verify it fails or validates properly**
  Run: `pnpm --filter @workspace/api-server test -- src/tests/auth-contract.test.ts`

- [ ] **Step 3: Ensure Express handlers and Clerk middleware cleanly handle all malformed inputs**
  Verify error handler in `artifacts/api-server/src/app.ts` returns JSON 401 for auth errors.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @workspace/api-server test -- src/tests/auth-contract.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git commit --no-gpg-sign -m "test(api): add auth boundary and rejection latency contract tests" artifacts/api-server/src/tests/auth-contract.test.ts`

---

### Task 2: Multi-Tenant RLS Cross-Account Isolation Contract

**Files:**
- Create: `artifacts/api-server/src/tests/authz-rls-contract.test.ts`

**Interfaces:**
- Consumes: `artifacts/api-server/src/lib/rls.ts`, `@workspace/db` schema
- Produces: Vitest suite asserting `AZT-01`, `AZT-02`, `AZT-03`

- [ ] **Step 1: Write the tests in `artifacts/api-server/src/tests/authz-rls-contract.test.ts`**
  Cover:
  1. `AZT-01` & `AZT-02`: Simulated Tenant A claims executing Drizzle queries cannot view or mutate rows tagged with Tenant B's `userId`.
  2. `AZT-03`: `runWithRls` given an undefined token injects `sub: null`, denying all row access.
  3. Header inspection proving `request.jwt.claims` is set to the caller's JWT `sub`.

- [ ] **Step 2: Run test to verify it executes**
  Run: `pnpm --filter @workspace/api-server test -- src/tests/authz-rls-contract.test.ts`

- [ ] **Step 3: Run test to verify it passes**
  Run: `pnpm --filter @workspace/api-server test -- src/tests/authz-rls-contract.test.ts`
  Expected: PASS

- [ ] **Step 4: Commit**
  Run: `git commit --no-gpg-sign -m "test(api): add multi-tenant rls cross-account isolation contract tests" artifacts/api-server/src/tests/authz-rls-contract.test.ts`

---

### Task 3: Cadence Frontend Router & Dev-Bypass Unit Tests

**Files:**
- Create: `artifacts/cadence/src/App.test.tsx`

**Interfaces:**
- Consumes: `artifacts/cadence/src/App.tsx` routing functions
- Produces: Vitest suite asserting `AUT-04`, `HomeRedirect`, `ProtectedRouter`, `cadence_last_path`

- [ ] **Step 1: Write the unit tests in `artifacts/cadence/src/App.test.tsx`**
  Cover:
  1. `AUT-04`: `isDevTestAuth` evaluates to false when `import.meta.env.DEV` is falsy or flags are absent.
  2. `HomeRedirect`: When signed in, redirects to stored `cadence_last_path` (or `/today` by default); renders `LandingPage` when signed out.
  3. `AuthThemeToggle`: Renders with accessible `aria-label` ("Switch to light appearance" / "Switch to dark appearance") and switches theme on click.

- [ ] **Step 2: Run test to verify execution**
  Run: `pnpm --filter @workspace/cadence test -- src/App.test.tsx`

- [ ] **Step 3: Run test to verify it passes**
  Run: `pnpm --filter @workspace/cadence test -- src/App.test.tsx`
  Expected: PASS

- [ ] **Step 4: Commit**
  Run: `git commit --no-gpg-sign -m "test(cadence): add unit tests for app routing guards and theme toggle" artifacts/cadence/src/App.test.tsx`

---

### Task 4: Playwright E2E Auth Journey & Session Termination

**Files:**
- Modify: `artifacts/cadence/tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: Playwright test fixture `tests/e2e/fixtures.ts`
- Produces: Playwright test assertions for `TC-E2E-08` and `TC-E2E-09`

- [ ] **Step 1: Add new test cases to `artifacts/cadence/tests/e2e/auth.spec.ts`**
  Cover:
  1. `TC-E2E-08`: Deep-link path preservation (`cadence_last_path` stored in localStorage when navigating unauthenticated).
  2. `TC-E2E-09`: Session sign-out dialog flow purges `cadence_test_auth` from localStorage and returns visitor to `/`.

- [ ] **Step 2: Run test in Playwright desktop project**
  Run: `pnpm --filter @workspace/cadence run test:e2e -- tests/e2e/auth.spec.ts`
  Expected: PASS

- [ ] **Step 3: Commit**
  Run: `git commit --no-gpg-sign -m "test(e2e): add deep-link preservation and session termination specs" artifacts/cadence/tests/e2e/auth.spec.ts`

---

### Task 5: Playwright E2E Design System Conformance, A11y & Performance

**Files:**
- Modify: `artifacts/cadence/tests/e2e/auth-design-and-quality.spec.ts`

**Interfaces:**
- Consumes: Playwright test fixture `tests/e2e/fixtures.ts`
- Produces: Playwright test assertions for `TC-DES-07` through `TC-DES-10` and `TC-PRF-01` through `TC-PRF-03`

- [ ] **Step 1: Add new test cases to `artifacts/cadence/tests/e2e/auth-design-and-quality.spec.ts`**
  Cover:
  1. `TC-DES-07`: Fluid card geometry across 390px, 768px, and 1440px viewports (zero horizontal scroll, content $\ge 300\text{px}$).
  2. `TC-DES-08`: Input touch target $\ge 44\text{px}$ and font size $\ge 16\text{px}$ (`1rem`).
  3. `TC-DES-09`: Theme persistence across auth routes (`/sign-in` to `/sign-up` to `/`).
  4. `TC-DES-10`: WCAG 2.2 AA text contrast in light and dark mode ($\ge 4.5:1$).
  5. `TC-PRF-01`: Navigation Timing DOMContentLoaded budget $\le 1500\text{ms}$.
  6. `TC-PRF-02`: Hydration layout shift $\text{CLS} \le 0.05$.
  7. `TC-PRF-03`: Zero console error and unhandled rejection budget.

- [ ] **Step 2: Run test in Playwright desktop project**
  Run: `pnpm --filter @workspace/cadence run test:e2e -- tests/e2e/auth-design-and-quality.spec.ts`
  Expected: PASS

- [ ] **Step 3: Commit**
  Run: `git commit --no-gpg-sign -m "test(e2e): add responsive geometry, a11y contrast, and performance specs" artifacts/cadence/tests/e2e/auth-design-and-quality.spec.ts`

---

### Task 6: Full Verification Ladder & Documentation Alignment

**Files:**
- Modify: `artifacts/cadence/src/lib/version-info.ts`

- [ ] **Step 1: Update version-info highlights and documentation**
  Update highlights in `artifacts/cadence/src/lib/version-info.ts` with auth E2E, design, and performance test coverage.

- [ ] **Step 2: Run fast verification ladder**
  Run: `pnpm run verify:fast`
  Expected: All gates PASS.

- [ ] **Step 3: Commit**
  Run: `git commit --no-gpg-sign -m "chore: align version-info with comprehensive auth testing suite" artifacts/cadence/src/lib/version-info.ts`
