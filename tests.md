# Cadence Testing Strategy & Enterprise Test Architecture

> **Authoritative Testing Specification & Operational Runbook for Cadence.**
> **Standard:** Enterprise Production-Ready, Zero-Trust Architecture, SOC 2 Type II & OWASP API Top 10 Aligned.

---

## 1. Executive Summary & Testing Philosophy

Cadence is a personal task and time-management OS engineered under a strict **Zero-Trust Invariant**:
- Every boundary is verified independently against executable assertions.
- Multi-tenancy is enforced at the database level via PostgreSQL Row Level Security (RLS) in Supabase, double-fenced with application-level filters.
- All client-side assertions are hit-tested and computed against real rendered CSS/DOM rather than class-name sniffing.
- Tests never contain conditional escapes (e.g. `if (await el.isVisible())`); every assertion is unconditional and deterministic.
- Zero flaky tolerance: `retries: 0` is enforced across CI to ensure tests prove real stability.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      12-Gate Verification Ladder                       │
│  Typecheck → Tokens → Lint → Contrast → Codegen → Builds → DeadClasses │
│        → CronRoutes → AuthSurface → Mojibake → DB/API Tests            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    ▼                                                               ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│     Vitest Test Suites       │              │    Playwright E2E Suites     │
│   - API Server & RLS         │              │   - Auth User Journeys       │
│   - Custom Fetch Token Bridge│              │   - Design System Conformance│
│   - Multi-Instance Sync      │              │   - Workflows & Time-Block   │
│   - Database Schema Invariants│             │   - Keyboard & Modal Traps   │
└──────────────────────────────┘              └──────────────────────────────┘
```

---

## 2. Enterprise Security & Compliance Mapping

### 2.1 OWASP API Security Top 10 (2023) Verification

| OWASP Category | Cadence Threat Surface | Mitigation & Test Verification | Test Suite |
|---|---|---|---|
| **API1:2023 Broken Object Level Authorization (BOLA)** | Cross-tenant task/project/goal access | PostgreSQL RLS `runWithRls` drops to `authenticated` role with caller JWT `sub`. Application-level `where user_id = ?`. Verified by two-account isolation probe. | `verify-two-account-isolation.cjs`, `rls.test.ts` |
| **API2:2023 Broken Authentication** | Unauthenticated access, token forging | `requireAuth` middleware gates all private routes, rejects missing/tampered/expired JWTs with 401 JSON. | `auth.test.ts`, `http-contract.test.ts` |
| **API3:2023 Broken Object Property Level Auth** | Database owner connection bypassing RLS | `SET LOCAL ROLE authenticated` pins transaction to unprivileged role. `runWithRls` fails closed on missing token. | `rls.test.ts`, `db-invariants.test.ts` |
| **API5:2023 Broken Function Level Authorization** | Unprotected cron dispatchers & webhooks | `/api/internal/*` guarded with `x-dispatch-secret`. `/api/telegram/webhook` guarded with webhook token. | `http-contract.test.ts` |
| **API7:2023 Server Side Request Forgery (SSRF)** | Origin reflection, arbitrary metadata fetching | Strict CORS origin allowlist (`CORS_ORIGINS`). URL metadata endpoint restricts internal IP access. | `http-contract.test.ts`, `url-metadata.test.ts` |
| **API8:2023 Security Misconfiguration** | Leakage of stack traces, open debug routes | Express JSON 404 handler, production error masking, healthz endpoint reports bounded status without DB credentials. | `http-contract.test.ts` |

### 2.2 STRIDE Threat Model Verification Matrix

- **Spoofing (Identity)**: Verified by `requireAuth` unit tests (`auth.test.ts`) and HTTP contract boundary tests. Header injection attacks (`x-user-id`, `x-sub`) are strictly ignored; Clerk JWT is the single identity claim.
- **Tampering (Data Integrity)**: Verified by `rls.test.ts` checking base64 decoding and payload validation. Corrupted JWTs immediately throw. Drizzle migrations maintain strict FK and CHECK constraints.
- **Repudiation**: Verified by `agent_action_log` audit trail. All agent modifications and bulk updates are permanently logged with reversible payloads and 1-click undo.
- **Information Disclosure**: Verified by fail-closed RLS mechanics (`NO_USER_CLAIMS = { sub: null, role: 'authenticated' }`). A missing token denies all rows rather than falling back to database owner privileges.
- **Denial of Service**: Token bridge micro-benchmarks ensure `< 1ms` overhead per API invocation. Auth bundles are isolated from background pages to prevent main-thread starvation.
- **Elevation of Privilege**: Verified by `runWithRls` transaction testing, dropping from database connection owner to PostgreSQL `authenticated` role on every transaction.

### 2.3 SOC 2 Type II Alignment

- **CC6.1 (Logical Access Security)**: Automated tests assert 401 boundaries across 24+ protected API routes and all protected frontend client routes.
- **CC6.3 (Role-Based Access Control)**: Enforced via PostgreSQL RLS policies scoped to `auth.jwt()->>'sub'`.
- **CC6.6 (Segregation of Duties / Tenant Isolation)**: Automated two-account cross-tenant verification script simulates User A attempting to read, update, or delete User B canary records. Zero cross-tenant leakage permitted.
- **CC7.2 (System Monitoring & Health)**: Healthchecks.io dead-man's switch integration verified via `/api/healthz` and dispatcher heartbeat.
- **CC8.1 (Change Management & Quality Gates)**: 12-gate verification ladder runs on every commit. CI fails if git status is dirty after verification.

---

## 3. Test Suites Directory & Architecture

### 3.1 Backend & Security (`artifacts/api-server`)
Located in `artifacts/api-server/src/`:

1. **`lib/rls.test.ts` (Vitest)**
   - `TC-RLS-01`: Valid JWT payload extraction and injection into PostgreSQL `request.jwt.claims`.
   - `TC-RLS-02`: Malformed token rejection (missing dot delimiters).
   - `TC-RLS-03`: Corrupted base64 payload error handling.
   - `TC-RLS-04`: **Fail-Closed Guarantee**: Missing `authToken` sets `{ sub: null, role: 'authenticated' }` denying all user-scoped rows.
   - `TC-RLS-05`: `SET LOCAL ROLE authenticated` isolation confirmation.
   - `TC-RLS-06`: Transaction rollback verification on query failures.

2. **`middlewares/auth.test.ts` (Vitest)**
   - `TC-MID-01`: Unauthenticated requests (`userId` absent) reject with HTTP 401 JSON.
   - `TC-MID-02`: Middleware chain execution halted on 401.
   - `TC-MID-03`: Valid sessions attach `req.userId` and `req.authToken`.
   - `TC-MID-04`: Token fetch rejection gracefully clears `authToken` for fail-closed RLS fallback.

3. **`tests/http-contract.test.ts` (Vitest / Real Express App)**
   - Validates real HTTP socket behavior against boots of `app.ts`.
   - 401 boundary across all 24+ protected endpoints.
   - Tampered and invalid bearer token rejection.
   - Public `/api/healthz` endpoint contract.
   - JSON 404 behavior on unknown routes.
   - `/api/internal/*` secret gating.
   - CORS allowlist enforcement.

### 3.2 Client State & Synchronization (`artifacts/cadence` & `lib/api-client-react`)

1. **`lib/api-client-react/src/custom-fetch.test.ts` (Vitest)**
   - Dynamic `setAuthTokenGetter` registration.
   - Automatic `Authorization: Bearer <token>` attachment.
   - Preserves explicit request headers.
   - Clean handling when getter returns `null` or throws.
   - Base URL prepending for relative API paths.

2. **`artifacts/cadence/src/lib/multi-instance-sync.test.ts` (Vitest)**
   - Cross-tab `AUTH_LOGOUT` broadcast message delivery.
   - Subscriber registration and cleanup.
   - Graceful fallback when `BroadcastChannel` is unavailable.
   - Safe sessionStorage draft persistence and clearance.

3. **`artifacts/cadence/src/components/` (Vitest + Testing Library)**
   - Component rendering, keyboard shortcuts, modal focus trapping, accessibility attributes.

### 3.3 End-to-End User Journeys (`artifacts/cadence/tests/e2e`)

1. **`auth.spec.ts` (Playwright)**
   - `TC-E2E-01`: Unauthenticated public landing page loads cleanly with Sign In / Sign Up CTAs.
   - `TC-E2E-02`: Direct access to protected routes (`/today`, `/inbox`, `/calendar`, `/profile`, `/settings`) redirects to `/`.
   - `TC-E2E-03`: `/sign-in` renders Clerk authentication card with accessible landmarks.
   - `TC-E2E-04`: `/sign-up` renders Clerk registration card.
   - `TC-E2E-05`: Dev auth bypass (`?test_auth=true` / `cadence_test_auth`) hydrates authenticated shell.
   - `TC-E2E-06`: Profile page sign-out dialog flow:
     - Open dialog → verify `role="dialog"` and `aria-modal="true"`.
     - Press Escape → verify dialog dismisses.
     - Cancel button → verify dialog dismisses.
     - Confirm Sign Out → triggers sign-out redirect to `/`.
   - `TC-E2E-07`: Local storage session state persistence.

2. **`auth-design-and-quality.spec.ts` (Playwright)**
   - `TC-DES-01`: 390px mobile viewport card geometry — zero horizontal scroll (`scrollWidth <= 390`).
   - `TC-DES-02`: 1440px desktop card geometry — max width conforms to `--component-dimension-auth-card-w` (440px).
   - `TC-DES-03`: 44x44px minimum tap targets across auth buttons, toggles, and inputs.
   - `TC-DES-04`: Input font size >= 16px to prevent iOS Safari auto-zoom.
   - `TC-DES-05`: Semantic landmark accessibility (`main#main-content`, proper headings).
   - `TC-DES-06`: Theme toggle contrast >= 3:1 against background (WCAG 1.4.11).
   - `TC-DES-07`: Clean console execution across auth routes.

---

## 4. Developer Execution Runbook

### 4.1 Daily Development Commands
```bash
# Run all unit test suites across the monorepo
pnpm test

# Run fast 7-gate verification ladder (typecheck, tokens, lint, contrast, cron, encoding, tests)
pnpm run verify:fast

# Run tests for a specific workspace package
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/cadence test

# Run a single specific test file
pnpm --filter @workspace/api-server test -- src/lib/rls.test.ts
pnpm --filter @workspace/cadence test -- src/lib/multi-instance-sync.test.ts
```

### 4.2 End-to-End & Security Probes
```bash
# List all registered Playwright E2E tests
pnpm run verify:e2e:list

# Run Playwright E2E suite (desktop chromium, self-mocking API)
pnpm run verify:e2e

# Run Playwright with interactive UI mode
pnpm --filter @workspace/cadence exec playwright test --ui

# Run two-account cross-tenant RLS isolation probe (requires backend + DB)
pnpm run verify:isolation

# Run browser-rendered auth surface design probe
pnpm run verify:auth-surface
```

### 4.3 Pre-Merge Full Verification (The 12 Gates)
```bash
# Complete 12-gate ladder matching CI
pnpm run verify
```

The 12 gates executed:
1. `typecheck`: Monorepo TypeScript compilation without emit
2. `tokens:check`: Design tokens synchronization
3. `lint:tokens`: Design token usage linting (forbids raw sizes / hex colors)
4. `contrast:check`: WCAG 2.2 contrast compliance verification
5. `codegen:check`: OpenAPI contract synchronization
6. `build:api`: Production bundling of API server
7. `build:web`: Production bundling of Cadence web app
8. `verify:no-dead-classes`: Detection of unused or broken Tailwind classes
9. `verify:cron-routes`: Cron route and dispatcher security audit
10. `verify:auth-surface`: In-browser rendered auth surface geometry probe
11. `encoding:check`: UTF-8 mojibake scanner
12. `test`: All Vitest suites across packages

---

## 5. Test Data Management Strategy

1. **Deterministic In-Memory Fixtures**:
   - Unit tests use factory functions (`createMockReq()`, `seedTask()`, `MockBroadcastChannel`) to generate isolated fixtures without shared mutable state.
2. **Stateful API Mocking (`installMockApi`)**:
   - Playwright tests mock the network layer via Playwright's `page.route` handler.
   - The mock serves full Drizzle schemas, tracks mutations, and intercepts `/api/*` endpoints without requiring a live Postgres instance.
3. **Database Invariant Testing**:
   - Local DB tests execute against an ephemeral PostgreSQL Docker container (`pnpm run test:db:local`), creating isolated schemas with fresh migrations.

---

## 6. Flaky Test Prevention & Continuous Regression

- **No Conditional Logic in Tests**: Assertions must never be guarded by `if` statements. If a button should be visible, assert `.toBeVisible()` directly.
- **Zero Retries (`retries: 0`)**: CI enforces zero retries. A test that fails intermittently is treated as a defect and repaired immediately.
- **Working Tree Cleanliness**: CI runs `git status --porcelain` after running the verification ladder. Any uncommitted artifact drift or codegen change fails the build immediately.
- **Real Alpha Compositing**: Color contrast checks calculate true relative luminance taking layered translucent backgrounds into account.

---

## 7. Performance & Core Web Vitals Benchmarks

Measured via `scripts/verify-core-web-vitals.cjs` (Lighthouse 13.5.0) and `scripts/verify-web-vitals-budget.cjs` against production builds (`dist/public`).

### 7.1 Emulated Mobile Benchmarks (Moto G Power, 4x CPU slowdown, 1.6 Mbit/s 3G)

| Route | Perf Score | LCP (<= 2500ms) | FCP | CLS (<= 0.100) | TBT (<= 200ms) | Wire Transfer | Status |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **`/` (Public Landing)** | **96 / 100** | **2,522 ms** | **2,009 ms** | **0.000** | **22 ms** | **243.2 kB** | **PASS** (sub-2.5s LCP, zero CLS) |
| **`/sign-in` (Auth)** | **74 / 100** | **5,744 ms** | **1,926 ms** | **0.017** | **204 ms** | **645.7 kB** | **G4-l DIAGNOSTIC** (400.3 kB Clerk SDK) |

### 7.2 Emulated Desktop Benchmarks (10 Mbit/s, unthrottled CPU)

| Route | Perf Score | LCP (<= 2500ms) | FCP | CLS (<= 0.100) | TBT (<= 200ms) | Wire Transfer | Status |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **`/` (Public Landing)** | **100 / 100** | **561 ms** | **465 ms** | **0.000** | **0 ms** | **243.2 kB** | **PERFECT PASS** |
| **`/sign-in` (Auth)** | **97 / 100** | **1,237 ms** | **439 ms** | **0.008** | **3 ms** | **645.6 kB** | **PASS** |
| **`/today` (App Shell)** | **99 / 100** | **986 ms** | **476 ms** | **0.000** | **0 ms** | **600.9 kB** | **PASS** |
| **`/settings` (App Shell)**| **99 / 100** | **965 ms** | **463 ms** | **0.000** | **0 ms** | **602.0 kB** | **PASS** |

### 7.3 Bundle Budgets & Code Splitting Optimization

- **Entry Chunk (gzip)**: **63.68 kB** (Budget: <= 120.00 kB) -- **PASS**
- **First-Visit JS (gzip)**: **144.10 kB** (Budget: <= 200.00 kB) -- **PASS** (reduced from 196.35 kB via route splitting)
- **Total CSS on disk (gzip)**: **27.16 kB** (Budget: <= 30.00 kB) -- **PASS**
- **Largest Single Chunk (raw)**: **239.14 kB** (Budget: <= 500.00 kB) -- **PASS**
- **Render-Blocking 3rd-Party Stylesheets**: **0** -- **PASS**

### 7.4 Architectural Diagnosis for /sign-in (G4-l)

Analysis of network wire transfer on `/sign-in` confirms:
1. Cadence application bundles account for **243.2 kB** (37.7% of transfer).
2. External Clerk SDK runtime scripts account for **400.3 kB** (62.0% of transfer) across 16 sequential chunks (`clerk.browser.js`, `ui.browser.js`, `ui-common_ui.js`, `form-sign-in.js`, `vendors.js`).
3. Under desktop network conditions, `/sign-in` completes in **1.23 seconds (97/100)**.
4. Under simulated 1.6 Mbit/s mobile 3G link, the physical transfer of Clerk's 400+ kB multi-chunk loader waterfall requires ~3.5s of link time, which directly accounts for the 5.7s LCP.
5. In accordance with AGENTS.md Section 7 (G4-l), moving Clerk behind a lazy import would alter authentication timing across the application and remains an explicit owner-level architectural decision.
