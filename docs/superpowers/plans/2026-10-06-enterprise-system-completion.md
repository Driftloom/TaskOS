# Cadence Enterprise 10/10 System Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate Cadence Task OS to a full 10/10 enterprise standard across Performance, Design System, Accessibility, Density, and Spec Integrity by eliminating the 5.9s Clerk LCP bottleneck, propagating density safely, clearing the token lint baseline to 0, and creating the `/__design` live catalog.

**Architecture:** Implement a dynamic Clerk authentication boundary in `App.tsx` that optimistically mounts public routes without waiting for Clerk's 359 kB script over the network, slashing LCP on `/` from 5956 ms to <1500 ms; propagate the P1 density system across data lists while preserving Apple HIG 44px touch contracts; eliminate the 4 remaining baselined token lint violations; and create a live visual design catalog (`/__design`).

**Tech Stack:** React 19, Vite 7, Tailwind CSS v4, Clerk React SDK, TanStack React Query, Playwright, Vitest, Lighthouse 13.5.0.

**Spec:** `docs/13-master-design-system-prompt.md` §P0–P32, `spec/design-system.md`, `spec/system-requirements.md`, `spec/locked-decisions.md`.

## Global Constraints
- **Zero Trust:** Every claim must be verified empirically by running test scripts and browser tests; no simulated or guessed passes.
- **Verification Ladder:** All 9 gates in `node scripts/run-gates.cjs` must remain 100% green (`exit 0`).
- **Core Web Vitals Threshold:** LCP on `/` must be <= 2500 ms (measured via `verify-core-web-vitals.cjs` with mobile Lantern emulation).
- **Bundle Budget:** First-visit JS must remain <= 200.00 kB gzip and entry chunk <= 120.00 kB gzip.
- **Touch Safety:** All interactive elements must maintain a minimum 44×44px hit target on touch devices; compact mode is restricted to `(pointer: fine)`.
- **Database Safety:** Remote Supabase databases must never run destructive schema drop tests (`CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS=1` is local-only).
- **Ascii-Only Console:** Any console or script outputs must remain strictly ASCII (< 0x80) for Windows codepage 437 compatibility.

## Review Focus
1. **Unauthenticated visitor loading `/`:** Hero text must render immediately (<1.5s) without waiting for Clerk script download.
2. **Authenticated user returning to `/`:** Session cookie detection (`__session` or `__client_uat`) must seamlessly redirect to `/today` without unstyled landing flash.
3. **E2E automated testing:** Fixtures using `?test_auth=true` must continue to bypass auth seamlessly across all 92 Playwright specs.
4. **Coarse pointer touch devices:** Lists rendered on mobile must clamp to 50px height and never overlap 44px checkboxes.
5. **Zero token regressions:** Running `node scripts/lint-tokens.cjs` must yield 0 new violations and 0 baselined violations.

---

### Task 1: Dynamic Clerk Auth Boundary (Slashing LCP from 5.9s to <1.5s)

**Files:**
- Modify: `artifacts/cadence/src/App.tsx:149-170, 326-382`
- Test: `scripts/verify-core-web-vitals.cjs`

**Interfaces:**
- Consumes: Clerk `useAuth()`, document cookies `__session`, `__client_uat`.
- Produces: `hasSessionCookie()` helper, dynamic boundary for `ClerkProvider` on `/` and `/download`.

- [ ] **Step 1: Write verification test / probe for unauthenticated immediate landing render**
  Assert that when `document.cookie` has no `__session` or `__client_uat`, `HomeRedirect` immediately returns `<LandingPage />` in `<Suspense fallback={null}>` without rendering `<LoadingScreen />`.

- [ ] **Step 2: Implement optimistic landing render and lazy Clerk initialization in `artifacts/cadence/src/App.tsx`**
  ```tsx
  function hasClerkSession(): boolean {
    if (typeof document === 'undefined') return false;
    return /(?:__session|__client_uat=[1-9])/.test(document.cookie);
  }
  ```
  In `HomeRedirect`:
  If `!hasClerkSession()`, render `<LandingPage />` immediately.
  If `hasClerkSession()`, await Clerk's `isLoaded` and redirect to `/today` if signed in.

- [ ] **Step 3: Run web build and test bundle budget**
  Run: `node scripts/verify-web-vitals-budget.cjs`
  Expected: All 5 bundle budgets PASS (first-visit JS <= 200 kB, entry chunk <= 120 kB).

- [ ] **Step 4: Run Core Web Vitals measurement against the production build**
  Run: `node scripts/verify-core-web-vitals.cjs --lighthouse=node_modules/lighthouse --no-build --runs=1`
  Expected: LCP on `/` drops from 5956 ms to <= 2500 ms (PASS).

- [ ] **Step 5: Verify E2E suite compatibility**
  Run: `pnpm run verify:e2e:desktop`
  Expected: All navigation and task specs pass with `?test_auth=true`.

---

### Task 2: Propagate P1 Density Across All Data Lists While Preserving 44px Contracts

**Files:**
- Modify: `artifacts/cadence/src/pages/inbox/InboxPage.tsx`
- Modify: `artifacts/cadence/src/pages/review/ReviewPage.tsx`
- Modify: `artifacts/cadence/src/pages/projects/ProjectsPage.tsx`
- Test: `artifacts/cadence/src/components/chrome/DensityProvider.test.tsx`
- Test: `artifacts/cadence/tests/e2e/density.spec.ts`

**Interfaces:**
- Consumes: `useDensity()` from `DensityProvider.tsx`, CSS token `--density-row-h`.
- Produces: Density-responsive lists that shrink to 38px only under `(pointer: fine)`.

- [ ] **Step 1: Inspect list row wrappers in `InboxPage.tsx`, `ReviewPage.tsx`, and `ProjectsPage.tsx`**
  Ensure list rows apply `row-density` class.

- [ ] **Step 2: Confirm contract tests protect 44px hit bounds**
  Verify that `TimeBlock` retains `min-h-11` (44px) and `MemoryFactCard` retains 36px + `.tap-target-expand`.

- [ ] **Step 3: Run density unit and e2e tests**
  Run: `pnpm --filter @workspace/cadence run test`
  Expected: All 414 cadence tests PASS.

---

### Task 3: Zero-Baseline Token Cleanup & `/__design` Live Catalog Route

**Files:**
- Create: `artifacts/cadence/src/pages/design/DesignCatalogPage.tsx`
- Modify: `artifacts/cadence/src/App.tsx` (mount `/__design` in dev/staging)
- Modify: `docs/audit/2026-09-30-design-system-audit/token-lint-baseline.json`
- Test: `scripts/lint-tokens.cjs`

**Interfaces:**
- Consumes: All 125 design tokens from `tokens.generated.ts`.
- Produces: Live visual token inspection route (`/__design`), 0 baselined violations in `lint-tokens.cjs`.

- [ ] **Step 1: Clean up the 4 remaining legacy token violations**
  Refactor the 4 legacy styling occurrences to use official tokens.

- [ ] **Step 2: Verify `lint-tokens.cjs` reports 0 baselined and 0 new violations**
  Run: `node scripts/lint-tokens.cjs`
  Expected: 0 new, 0 baselined, exit code 0.

- [ ] **Step 3: Create `DesignCatalogPage.tsx`**
  Render an interactive visual grid displaying:
  - Color swatches with live contrast badges.
  - 11-step typography scale examples.
  - Activity Rings in default vs reduced-motion modes.
  - Density preview comparing comfortable, default, and compact.

---

### Task 4: Complete Verification Ladder & Production Sign-Off

**Files:**
- Verification: Root workspace scripts

- [ ] **Step 1: Run full 9-gate verification ladder**
  Run: `pnpm run verify` (`node scripts/run-gates.cjs`)
  Expected: 9/9 gates green (typecheck, tokens, lint:tokens, contrast, codegen, build:api, build:web, encoding, test).

- [ ] **Step 2: Run Core Web Vitals audit**
  Run: `pnpm run verify:cwv`
  Expected: Full pass on LCP (<= 2500 ms) and CLS (<= 0.100).

- [ ] **Step 3: Verify clean git status and document audit sign-off**
  Run: `git status`
  Expected: Clean working tree.
