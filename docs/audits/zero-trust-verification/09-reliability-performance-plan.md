# 09 — Reliability, Performance & SRE Architecture Plan

> **Zero-Trust SRE & Performance Investigation**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Principal SRE & Performance Engineer  

---

## 1. Measured Performance Baseline (Core Web Vitals)

Measured on 2026-10-11 using `node scripts/verify-core-web-vitals.cjs` against preview server:

| Route / Surface | Measured LCP (Target: ≤ 2500ms) | Measured CLS (Target: ≤ 0.1) | INP Status | Bundle Transfer Breakdown & Root Cause |
| :--- | :--- | :--- | :--- | :--- |
| **Landing Route (`/`)** | **2,509 ms** [2,495 – 2,700 ms] | **0.000** | `n/a` (Navigation) | Borderline breach (+9ms over threshold). Lightweight landing chunk. |
| **Auth Route (`/sign-in`)** | **5,989 ms** [5,979 – 6,755 ms] | **0.017** | `n/a` (Navigation) | **CRITICAL BREACH (~2.4x Budget):** Clerk JS bundle transfers **400.3 kB (62.0% of total transfer)** synchronously on initial mount. |

### Architectural Performance Findings
1. **Clerk First-Load Weight:** Clerk’s client SDK injects substantial unbundled runtime assets and fonts directly into document `<head>`, delaying the first contentful paint (FCP) and largest contentful paint (LCP).
2. **Unauthenticated Route Limitation:** Because the automated Core Web Vitals harness only probes unauthenticated paths, authenticated application routes (`/today`, `/calendar`, `/focus`) remain unmeasured in CI.
3. **RunAnchor Wall-Clock Immunity:** The focus timer eliminates CPU timer drift completely by computing `Date.now() - runStartedAt`, preventing background interval throttle lag.

---

## 2. Persistence, Connection Pooling & PgBouncer Mechanics

### 2.1 Connection Pool Configuration (`lib/db/src/index.ts`)
The API server instantiates a Postgres pool with default options:
```typescript
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```
- **Risk:** No explicit `max` connection limit, idle timeout, or connection lifetime ceilings are specified. Under burst load, Express can exhaust Supabase connection limits (typically 15 direct connections on free/micro instances).

### 2.2 PgBouncer Mode Compatibility Trap
- **Transaction Mode (Port 6543):**
  - `runWithRls` uses `SET LOCAL ROLE authenticated` and `set_config('request.jwt.claims', claims, true)`. These are strictly transaction-scoped (`is_local = true`) and safely compatible with PgBouncer Transaction Mode.
- **Session Mode (Port 5432):**
  - `lib/db/src/migrate.ts` acquires a session-level advisory lock: `SELECT pg_advisory_lock(8675309)`.
  - **Trap:** Running migrations through PgBouncer in Transaction Mode will throw errors or leave orphaned advisory locks across sessions. Database migrations MUST strictly target the direct connection or Session Mode pooler (port 5432).

---

## 3. High-Frequency Table Bloat & Maintenance Gaps

Four tables experience continuous insert traffic without automated pruning or retention policies:

| Table | Ingestion Rate | Retention Policy | Maintenance Risk |
|---|---|---|---|
| `reminder_runs` | 1 row every 5 minutes (288 rows/day) | **None** (Grows indefinitely) | Unbounded table growth; slow watchdog recency checks. |
| `reschedule_runs` | 1 row every hour (24 rows/day) | **None** (Grows indefinitely) | Unbounded table growth. |
| `llm_usage` | 1 row per LLM call | **None** (Grows indefinitely) | Lifetime spend query performs full sequential scan without date index. |
| `agent_conversations` | 2+ rows per chat turn | **None** (Grows indefinitely) | Conversation history queries slow down over time. |

### Index Bloat in Full-Text Search
- Functional GIN index `tasks_search_gin_idx` (`to_tsvector('english', ...)`) accumulates index bloat under frequent task title and note edits.
- Supabase requires periodic `VACUUM ANALYZE public.tasks;` to reclaim index space and update query planner statistics.

---

## 4. Monitoring, Dead-Man's Switch & Sentry Absence

1. **Dead-Man's Switch Heartbeat:**
   - On every reminder dispatch and reschedule run, `routes/internal.ts` pings `HEALTHCHECKS_DISPATCH_PING_URL` and `HEALTHCHECKS_RESCHEDULE_PING_URL`.
   - If cron ticks stop firing, Healthchecks.io triggers an external alert within 15 minutes.
2. **Frontend Crash Telemetry Gap:**
   - `@sentry/react` is specified in architecture contracts (Rule D-20) but is **completely missing** from `artifacts/cadence/package.json`.
   - `artifacts/cadence/src/components/error-boundary.tsx` logs uncaught React exceptions solely to `console.error`. Client-side crashes in production are unmonitored.

---

## 5. Recommended Load & Stress Testing Scenarios

```typescript
/**
 * Proposed SRE Stress & Concurrency Test Scenarios
 */

// SCENARIO 1: Concurrent Reminder Dispatch Locking (SKIP LOCKED Verification)
// Run 5 simultaneous POST /api/internal/dispatch requests with 50 due reminders.
// Assert: Exactly 50 reminder rows processed; zero duplicate Telegram deliveries.

// SCENARIO 2: Connection Pool Starvation Test
// Flood API with 100 concurrent requests to /api/tasks.
// Assert: Requests queue cleanly; no "sorry, too many clients already" Postgres errors.

// SCENARIO 3: Client Memory Leak Verification
// Mount and unmount /calendar and /focus pages 100 times.
// Assert: Heap memory stabilizes; Web Audio contexts and event listeners cleanly dispose.
```

---
*Plan established to guide infrastructure hardening and production readiness.*
