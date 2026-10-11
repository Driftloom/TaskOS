# 01 — Project Reality & Environment Baseline

> **Zero-Trust Baseline Audit**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Zero-Trust Principal Systems & Security Architect  

---

## 1. Project Identity & Repository State

* **Repository / Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`
* **Project Name:** Cadence (Personal Task & Time OS)
* **Primary Owner / Tenant:** Rohit
* **Home Timezone:** `Asia/Kolkata` (`+05:30` IST)
* **Work Rhythm Contract:** 24-hour continuous flexibility (`00:00–23:59`)
* **Git Branch:** `main`
* **Commit SHA:** `79a5ec90cd0aaef33e4f85c870c0e472452f2b9a`
* **Working Tree State (Dirty / Uncommitted Entries):**
  ```text
   M artifacts/cadence/index.html
   M artifacts/cadence/public/sw.js
   M artifacts/cadence/src/main.tsx
  ?? artifacts/cadence/src/lib/pwa-register.ts
  ```
  *(Note: In CI `.github/workflows/ci.yml`, any dirty working tree after running `pnpm run verify` causes immediate exit code 1 due to `git status --porcelain` assertions).*

---

## 2. Technology Stack & Runtime Matrix

| Subsystem / Layer | Technology / Framework | Version Specification | Pin / Stability Invariants |
| :--- | :--- | :--- | :--- |
| **Package Manager** | `pnpm` | `11.20.0` (enforced via `scripts/enforce-pnpm.cjs`) | `preinstall` script blocks `npm` and `yarn`; removes extraneous lockfiles automatically. |
| **Monorepo Engine** | pnpm workspaces | Monorepo root `pnpm-workspace.yaml` | `minimumReleaseAge: 1440` (24-hour supply chain delay active). |
| **Node.js Runtime** | Node.js | `>=22.0.0` | Tested in CI on Node 22.x LTS. |
| **Frontend Framework** | React / React-DOM | `19.1.0` (Catalog Pinned) | **LOAD-BEARING CATALOG PIN:** blanket `pnpm update` breaks Expo/React 19 alignment. |
| **Frontend Build Tool** | Vite | `^6.0.0` | `@vitejs/plugin-react` + `@tailwindcss/vite`. Throws if `PORT` or `BASE_PATH` unset. |
| **Styling & Design System** | Tailwind CSS v4 + Shadcn UI | Tailwind `^4.0.0` | Uses `@utility` custom dimension bridge for `--component-dimension-*` & `--size-*`. |
| **Design Tokens** | Custom Token Compiler | Single source: `tokens/tokens.json` | Emits `styles/tokens.css` via `pnpm run tokens:build`. Linted with 0 baseline debt. |
| **API Backend** | Express.js | `^5.0.0` | Bundled to `dist/index.mjs` via esbuild. Multi-router architecture. |
| **Database ORM & Client** | Drizzle ORM + `pg` | Drizzle `^0.36.0`, `pg` `^8.13.0` | Forward-only migration engine (`lib/db/src/migrate.ts`) with SHA-256 checksum lock. |
| **Database Engine** | Supabase PostgreSQL | PostgreSQL 15+ | 23 tables, pgvector, pg_cron, pg_net, Supabase Vault extensions. |
| **Authentication Authority**| Clerk Auth | `@clerk/express` & `@clerk/clerk-react` | Strict JWT session enforcement via `requireAuth` + `runWithRls`. |
| **Client Data Fetching** | TanStack React Query | `^5.62.0` | Contract-generated via Orval from `lib/api-spec/openapi.yaml`. |
| **Schema Validation** | Zod | `^3.24.0` / Zod v4 in DB | Contract-generated via Orval (`@workspace/api-zod`). |
| **Test Frameworks** | Vitest & Playwright | Vitest `^2.1.0` / Playwright `^1.49.0` | 856 Vitest unit tests, 144 Playwright E2E tests across 19 specs. |

---

## 3. Monorepo Boundaries & Package Topology

```text
c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS
├── artifacts/
│   ├── cadence/                     # Production React 19 PWA Web Application
│   │   ├── public/sw.js             # Service Worker (shell caching, background hooks)
│   │   ├── src/                     # UI components, pages, stores, hooks
│   │   └── vite.config.ts           # Bundler configuration
│   ├── api-server/                  # Express 5 REST API Server
│   │   ├── src/routes/              # 19 Routers handling 84+ endpoints
│   │   ├── src/lib/                 # RLS wrapper, LiteLLM gateway, date algorithms
│   │   └── src/app.ts               # Middleware pipeline, Clerk proxy, CORS
│   └── mockup-sandbox/              # ISOLATED DESIGN SANDBOX (Never import in prod!)
├── lib/
│   ├── api-spec/                    # openapi.yaml (Contract Single Source of Truth)
│   ├── api-client-react/            # Generated TanStack Query client (Orval generated)
│   ├── api-zod/                     # Generated Zod validation schemas (Orval generated)
│   └── db/                          # Drizzle schema definitions & 19 SQL migrations
├── tokens/
│   └── tokens.json                  # Single Source of Truth for all Design Tokens
├── scripts/                         # 12-Gate Verification Ladder & Sizing Probes
├── spec/                            # 8 Authoritative Subsystem Specifications
└── docs/                            # Architecture, Runbooks & Governance Records
```

### Monorepo Dependency Flow Rules
1. `artifacts/cadence` MUST ONLY import from `@workspace/api-client-react`, `@workspace/api-zod`, and local code. NEVER import `@workspace/db` or `artifacts/api-server`.
2. `artifacts/api-server` imports `@workspace/db`, `@workspace/api-zod`, and internal libraries. NEVER import `@workspace/api-client-react` or `artifacts/cadence`.
3. `lib/api-spec/openapi.yaml` is the contract authority. Hand-editing generated code in `lib/api-client-react` or `lib/api-zod` is strictly forbidden.
4. `artifacts/mockup-sandbox` is an isolated scratchpad. Production components must never depend on it.

---

## 4. Verification Ladder & Gate Status

The repository enforces a strict 12-gate verification ladder (`scripts/run-gates.cjs`):

```text
[Gate 01/12] typecheck                PASS (tsc --noEmit across monorepo)
[Gate 02/12] lint:tokens              PASS (151/151 files compliant, 0 baseline debt)
[Gate 03/12] lint                     PASS (ESLint checks across packages)
[Gate 04/12] verify:contrast          PASS (93/93 semantic token pairs compliant)
[Gate 05/12] codegen:check            PASS (OpenAPI -> TanStack & Zod checksum match)
[Gate 06/12] build:api                PASS (api-server bundles cleanly to dist/index.mjs)
[Gate 07/12] build:web                PASS (Vite production build succeeds)
[Gate 08/12] verify:no-dead-classes   PASS (No unused custom classes detected)
[Gate 09/12] verify:cron-routes       PASS (Cron triggers match Express routes)
[Gate 10/12] verify:encoding          PASS (UTF-8 scan: zero CP1252 mojibake)
[Gate 11/12] verify:auth-surface      PASS (8 WARNs: CTA fill vs card 2.14:1)
[Gate 12/12] test                     PASS (856 Vitest suites pass across packages)
```

* **Fast Verification Command:** `pnpm run verify:fast` (7 gates, completes in ~48s).
* **Full Verification Command:** `pnpm run verify` (12 gates, completes in ~95s).
* **Windows Fallback:** `pnpm run typecheck:full` (`node tsc --build --force`).

---

## 5. Tooling Environment Quirks & Windows Operating Constraints

1. **Windows PowerShell Encoding Trap:**
   - PowerShell 5.1 mangles UTF-8 when using `Set-Content` or `Out-File` by re-encoding through CP1252.
   - The Windows console defaults to codepage 437, which displays valid UTF-8 as garbage.
   - `scripts/scan-mojibake.cjs` (Gate 10) is the sole arbiter of encoding integrity. Never edit repository files using PowerShell redirection operators.
2. **Path Resolution in Sandbox:**
   - Sandboxed PowerShell commands resolving relative paths without a leading drive letter or `BypassSandbox: true` may resolve against `C:\` instead of the working directory. Always use workspace-relative or absolute paths.
3. **Sizing Probes Requirement:**
   - `pnpm run verify:sizing` requires a running Vite preview server on `http://localhost:4173` (`pnpm --filter @workspace/cadence run serve`) and Playwright Chromium installed (`pnpm run verify:install`), or it fails with `ERR_CONNECTION_REFUSED`.
4. **Vite Development Server Constraints:**
   - Vite throws immediately if `PORT` and `BASE_PATH` environment variables are unset.

---

## 6. Required Environment Variables Inventory

*All credentials and secrets must be populated in local `.env` or production runtime; never commit real values.*

```text
# Database & Persistence
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# Authentication (Clerk)
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# API Server Operational Controls
PORT=5000
CORS_ORIGINS=http://localhost:5173,https://cadence-task-os.vercel.app
DISPATCH_SECRET=...
CREDENTIAL_ENCRYPTION_KEY=...   # 32-byte base64 AES-256-GCM key for in-app BYOK

# External Integrations (Optional / Per-Tenant)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
HEALTHCHECKS_DISPATCH_PING_URL=...
HEALTHCHECKS_RESCHEDULE_PING_URL=...

# AI Gateway (LiteLLM / Provider Keys)
NVIDIA_NIM_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
GEMINI_API_KEY=...
```

---
*Verified against active commit `79a5ec9` on Windows 11 host environment.*
