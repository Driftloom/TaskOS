# Cadence — Enterprise UI & Frontend Audit: Findings Register

> **Audit Date:** 2026-10-06T23:40:00+05:30  
> **Audit Standard:** `docs/13-master-design-system-prompt.md` §P31.4  

---

## Findings Summary

| Finding ID | Severity | Category | Affected File(s) | Spec Reference | Status / Verdict |
|---|---|---|---|---|---|
| `FINDING-PERF-001` | **P0** | Performance | `artifacts/cadence/src/App.tsx:149-170, 326-382` | P26.2, Google CWV | **ACTIVE**: LCP 5956 ms (2.38x breach) caused by Clerk render-blocking `/` |
| `FINDING-PERF-002` | **P1** | Bundle Size | `artifacts/cadence/src/App.tsx:357` | P26.2 | **HEADROOM RISK**: First-visit JS at 199.97 kB against 200 kB budget (30 bytes headroom) |
| `FINDING-A11Y-001` | **P1** | Accessibility | `artifacts/cadence/src/components/` | P18.1, WCAG 2.4.3 | **RESOLVED**: 43/43 & 55/55 focus rings verified `outline >= 2px`; 0 axe violations |
| `FINDING-DENS-001` | **P1** | Touch Safety | `tokens/tokens.json`, `tokens.css` | P8.1, P8.4 | **RESOLVED**: Compact mode gated to `(pointer: fine)`; coarse devices clamp to default |
| `FINDING-DENS-002` | **P2** | Density Scope | `src/components/task/TimeBlock.tsx` | P8.4, Contract Test | **DOCUMENTED EXCLUSION**: `TimeBlock` preserves 44px contract to prevent touch collision |
| `FINDING-SPEC-001` | **P1** | Spec Governance | `docs/13-master-design-system-prompt.md:704-1530` | P31.5 | **DRAFT RATIFICATION**: P18–P32 empirical figures verified; awaiting owner final sign-off |
| `FINDING-I18N-001` | **P2** | Localization | `artifacts/cadence/src/lib/date-utils.ts` | P19 | **OPEN**: Hardcoded English weekday strings; locale parameterization deferred to P2 |

---

## Detailed Finding Briefs

### `FINDING-PERF-001` [P0] — Clerk Bundle Render-Blocks Landing Page on Route `/`
- **Location:** `artifacts/cadence/src/App.tsx:149–170` (`HomeRedirect`) & `App.tsx:326–382` (`Router`).
- **Violation:** P26.2 & Google Core Web Vitals LCP threshold (2500 ms).
- **Evidence:** `verify-core-web-vitals.cjs` measured LCP = 5956 ms. `smart-weasel-9905.clerk.accounts.dev` transfers 359.2 kB (55.7% of total load) before `<LandingPage />` paints.
- **Remediation Plan:**
  1. Detect existing session synchronously via cookie scan (`__session` / `__client_uat`).
  2. If unauthenticated, render `LandingPage` optimistically without waiting for Clerk `isLoaded`.
  3. Defer `<ClerkProvider>` initialization to authenticated routes or mount lazily.

### `FINDING-PERF-002` [P1] — First-Visit JS Budget at Critical Ceiling
- **Location:** `artifacts/cadence/src/App.tsx`, `artifacts/cadence/vite.config.ts`.
- **Violation:** P26.2 JS budget ceiling of 200.00 kB.
- **Evidence:** `verify-web-vitals-budget.cjs` measures first-visit JS at **199.97 kB** (only 30 bytes of headroom remaining).
- **Remediation Plan:**
  1. Continue vigilant vendor splitting in `vite.config.ts`.
  2. Avoid importing heavy third-party helper libraries into the entry bundle.
  3. Preload route chunks during browser idle time via `<link rel="modulepreload">`.

### `FINDING-DENS-002` [P2] — Deliberate Exclusion of `TimeBlock` from Density Shrinkage
- **Location:** `artifacts/cadence/src/components/task/TimeBlock.tsx:64`.
- **Criterion:** P8.1 Apple HIG 44×44px minimum tap target.
- **Evidence:** `TimeBlock` chip in calendar hour rows has adjacent neighbors separated by only `gap-2` (8px). Shrinking `TimeBlock` to 38px would create tap ambiguity on touch screens.
- **Resolution:** Preserved `min-h-11` (44px) contract test in `TimeBlock.test.tsx` as intentional, accessibility-safe behavior.
