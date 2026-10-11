# Subsystem & Module Architecture Directory

> **Zero-Trust Module Topology**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  

---

## 1. Monorepo Subsystems

Cadence is divided into four major subsystems:

### 1.1 Web Application (`artifacts/cadence/`)
- **Core Technology:** React 19, Vite 6, Tailwind CSS v4, TanStack Query v5, Wouter.
- **Architectural Patterns:**
  - Token-driven styling with custom `@utility` classes.
  - Multi-instance cross-window coordination via Web Locks API and BroadcastChannel.
  - Wall-clock timer persistence (`runAnchor.ts`) for zero timer drift.
  - Optimistic offline outbox for quick task capture.

### 1.2 API Server (`artifacts/api-server/`)
- **Core Technology:** Node.js 22, Express 5, Pino logging, Clerk Express middleware.
- **Key Modules:**
  - `src/middlewares/auth.ts`: Clerk JWT session verification.
  - `src/lib/rls.ts`: Database transaction wrapper enforcing Postgres Row Level Security.
  - `src/lib/agent/`: ReAct agent loop, tool execution, circuit breakers, and intent classifier.
  - `src/routes/`: 19 modular routers handling 84+ endpoints.

### 1.3 Database & Migrations (`lib/db/`)
- **Core Technology:** Supabase PostgreSQL 15+, Drizzle ORM, Drizzle Kit.
- **Key Modules:**
  - `src/schema/`: 23 typed Drizzle schema definitions.
  - `migrations/`: 19 forward-only SQL migrations (`0000` through `0018`).
  - `src/migrate.ts`: Custom migration runner with distributed advisory lock and SHA-256 checksum drift detection.

### 1.4 API Contract & Codegen (`lib/api-spec/`)
- **Core Technology:** OpenAPI 3.1, Orval codegen.
- **Key Modules:**
  - `openapi.yaml`: Single source of truth for all API contracts.
  - `@workspace/api-client-react`: Generated TanStack React Query client hooks.
  - `@workspace/api-zod`: Generated Zod validation schemas for request bodies and responses.

---

## 2. Cross-Subsystem Traceability Index

Detailed traceability across all 31 locked architectural decisions, 19 routers, and 16 pages is documented in:
- [`03-requirements-traceability.md`](../03-requirements-traceability.md)
- [`04-master-module-inventory.md`](../04-master-module-inventory.md)
- [`08-risk-and-security-matrix.md`](../08-risk-and-security-matrix.md)
- [`10-defect-triage-and-release-gate.md`](../10-defect-triage-and-release-gate.md)
