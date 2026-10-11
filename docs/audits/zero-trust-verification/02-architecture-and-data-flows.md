# 02 — Architecture, Trust Boundaries & Data Flows

> **Zero-Trust Architectural Investigation**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Principal Security Architect & SRE Lead  

---

## 1. System Topology & Trust Boundaries

Cadence is a multi-tenant personal task and time operating system structured into four primary trust zones:

```mermaid
flowchart TB
    subgraph ClientZone ["Zone 0: Client & Edge (Untrusted)"]
        Browser["Mobile / Desktop Browser (React 19 PWA)"]
        SW["Service Worker (Cache Shell, runAnchor)"]
        ClerkEdge["Clerk Frontend API Proxy (/api/__clerk)"]
        TG["Telegram Client / Bot Interface"]
    end

    subgraph IngressZone ["Zone 1: API Server Boundary (Enforced Auth)"]
        Express["Express 5 Gateway (Node.js 22 on Port 5000)"]
        CorsPino["CORS Allowlist + Pino HTTP Serializer"]
        ClerkMW["clerkMiddleware + requireAuth Guard"]
        DispatchGuard["x-dispatch-secret Guard (/internal/*)"]
    end

    subgraph ApplicationZone ["Zone 2: Execution & Business Logic"]
        Routers["19 Express Routers (Tasks, Blocks, Goals, etc.)"]
        RLSBridge["runWithRls Transaction Wrapper (rls.ts)"]
        AgentEngine["Agent & Intent Engine (engine.ts / tools.ts)"]
        CronSweep["Internal Sweep Handlers (dispatch, reschedule)"]
    end

    subgraph PersistenceZone ["Zone 3: Database & Scheduling (Single Source of Truth)"]
        Postgres["Supabase Postgres (23 Tables, Check Constraints)"]
        RLSPolicies["PostgreSQL Row Level Security (auth.jwt()->>'sub')"]
        PGCron["pg_cron Scheduler (5 Active Jobs)"]
        PGNet["pg_net Extension (HTTP Worker via net.http_post)"]
        Vault["Supabase Vault (Target for DISPATCH_SECRET)"]
    end

    Browser -->|HTTPS REST| IngressZone
    TG -->|Webhook HTTPS| IngressZone
    ClerkEdge -->|Proxy Pipe| Express
    Express --> CorsPino --> ClerkMW --> Routers
    Express --> DispatchGuard --> CronSweep
    Routers --> RLSBridge
    RLSBridge -->|SET LOCAL ROLE authenticated| Postgres
    CronSweep -->|Direct DB / Owner Context| Postgres
    PGCron -->|cron.job_run_details| PGNet
    PGNet -->|Internal HTTP POST| DispatchGuard
```

---

## 2. Core Security & Isolation Mechanics

### 2.1 The RLS Bridge Architecture (`artifacts/api-server/src/lib/rls.ts`)
The API server connects to PostgreSQL using `DATABASE_URL` as the database owner (`postgres`). By default in PostgreSQL, table owners bypass RLS entirely. Pointing queries at Supabase without transaction-level role demotion provides zero multi-tenant security.

Cadence enforces multi-tenancy through `runWithRls(req, fn)`:
```typescript
function claimsJsonFromJwt(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("Malformed session token");
  }
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

const NO_USER_CLAIMS = JSON.stringify({ sub: null, role: "authenticated" });

export async function runWithRls<T>(
  req: Request,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const claims = req.authToken ? claimsJsonFromJwt(req.authToken) : NO_USER_CLAIMS;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${claims}, true)`,
    );
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    return fn(tx);
  });
}
```

#### Isolation Invariants & Guarantees
1. **Transaction Isolation:** `set_config('request.jwt.claims', claims, true)` marks the configuration parameter as transaction-local (`is_local = true`). Upon transaction commit or rollback, the setting is purged, preventing leakage across connection pool re-use.
2. **Role Demotion:** `SET LOCAL ROLE authenticated` drops the owner connection privileges to the Supabase `authenticated` role for the duration of the transaction.
3. **Fail-Closed Fallback:** If `req.authToken` is undefined or fails retrieval in `requireAuth`, `claims` defaults to `NO_USER_CLAIMS` with `sub: null`. In PostgreSQL ternary logic, `NULL = user_id` evaluates to `NULL` (falsy), rejecting all `SELECT`, `UPDATE`, `INSERT`, and `DELETE` queries.
4. **Defense-in-Depth:** Every Drizzle query inside route handlers includes an application-level filter: `.where(and(eq(tasksTable.userId, req.userId!), ...))`.

---

## 3. End-to-End Workflow Sequences

### 3.1 Task Capture & Natural Language Ingestion Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Web as Web App (QuickCaptureSheet)
    participant Local as localStorage Outbox
    participant API as Express API (/api/tasks)
    participant RLS as runWithRls Wrapper
    participant DB as Supabase PostgreSQL

    User->>Web: Inputs "Submit tax report tomorrow 3pm !high #finance"
    Web->>Web: parseQuickCapture (extracts due date, priority, tag)
    alt Network Offline
        Web->>Local: Store draft in cadence.capture.outbox.v1
        Web-->>User: Render optimistic pending task card
    else Network Online
        Web->>API: POST /api/tasks (Bearer Clerk JWT)
        API->>API: requireAuth (validates JWT, attaches req.userId & authToken)
        API->>RLS: runWithRls(req, tx => ...)
        RLS->>DB: BEGIN TX
        RLS->>DB: set_config('request.jwt.claims', claims, true)
        RLS->>DB: SET LOCAL ROLE authenticated
        RLS->>DB: INSERT INTO tasks (title, due_at, priority, user_id)
        DB-->>RLS: Row Created (id: 42)
        RLS->>DB: INSERT INTO task_tags (task_id, tag_id, user_id)
        RLS->>DB: COMMIT TX
        DB-->>API: Task Record
        API-->>Web: HTTP 201 JSON (CreateTaskResponse)
        Web->>Web: TanStack Query Cache Invalidate ('/api/tasks')
    end
```

---

### 3.2 Scheduled Sweeps & Dispatch Engine Sequence (`pg_cron` + `pg_net`)

```mermaid
sequenceDiagram
    autonumber
    participant Cron as pg_cron Worker
    participant PGNet as pg_net Extension
    participant API as Express API (/internal/dispatch)
    participant DB as PostgreSQL (Pool Owner)
    participant TG as Telegram Bot API

    Cron->>Cron: Ticks at */5 * * * *
    Cron->>PGNet: SELECT net.http_post(url, headers: {'x-dispatch-secret': secret}, body)
    PGNet->>API: POST /api/internal/dispatch
    API->>API: secretMatches(header, DISPATCH_SECRET)
    alt Secret Missing or Invalid
        API-->>PGNet: HTTP 401 Unauthorized
    else Secret Valid
        API->>DB: BEGIN TX
        API->>DB: SELECT * FROM reminders WHERE status = 'pending' AND remind_at <= NOW() FOR UPDATE SKIP LOCKED LIMIT 100
        DB-->>API: Claimed Reminders Batch
        loop Each Claimed Reminder
            API->>DB: SELECT quiet_start, quiet_end, timezone FROM notification_settings WHERE user_id = ?
            alt Inside Quiet Hours
                API->>DB: UPDATE reminders SET remind_at = quiet_end, attempts = attempts + 1
            else Outside Quiet Hours
                API->>TG: POST https://api.telegram.org/bot<TOKEN>/sendMessage
                alt Telegram Success (200 OK)
                    API->>DB: UPDATE reminders SET status = 'sent', sent_at = NOW()
                else Telegram Rate-Limited or Failed
                    API->>DB: UPDATE reminders SET attempts = attempts + 1, remind_at = NOW() + INTERVAL '5m'
                end
            end
        end
        API->>DB: INSERT INTO reminder_runs (checked, sent, failed) VALUES (...)
        API->>DB: COMMIT TX
        API-->>PGNet: HTTP 200 JSON ({ runId, checked, sent, failed })
    end
```

---

### 3.3 AI Agent Conversation & ReAct Tool Loop Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Panel as AgentPanel UI
    participant API as Express API (/api/agent/chat)
    participant Engine as Agent Engine (engine.ts)
    participant LiteLLM as LiteLLM / Provider Gateway
    participant Tools as Agent Tools (tools.ts)
    participant DB as PostgreSQL

    User->>Panel: "Reschedule my overdue tasks to tomorrow morning"
    Panel->>API: POST /api/agent/chat { message }
    API->>API: requireAuth (verify JWT)
    API->>Engine: runAgentConversation(userId, message)
    Engine->>DB: assembleAgentContext (fetch open tasks, 48h calendar, memory facts)
    Engine->>Engine: formatDynamicSystemPrompt (inject time, context, rules)
    Engine->>LiteLLM: POST /chat/completions (model, messages, tools)
    alt LLM Returns Tool Call: bulk_reschedule
        LiteLLM-->>Engine: tool_call: bulk_reschedule(taskIds: [1,2,3], targetDate: '2026-10-12')
        alt taskIds.length > 10 and not confirmed (Rule D-05)
            Engine-->>Panel: requiresConfirmation = true (Surfaces ActionPreview modal)
        else Permitted Execution
            Engine->>Tools: executeAgentTool("bulk_reschedule", args)
            Tools->>DB: UPDATE tasks SET due_at = ... WHERE id IN (...)
            Tools->>DB: INSERT INTO agent_action_log (before_state, after_state)
            Tools-->>Engine: Tool Execution Result
            Engine->>LiteLLM: POST /chat/completions (tool result)
            LiteLLM-->>Engine: Final Prose Response
            Engine->>DB: INSERT INTO agent_conversations (user, assistant turns)
            Engine->>DB: INSERT INTO llm_usage (tokens, cost)
            Engine-->>API: Assistant Response
            API-->>Panel: HTTP 200 JSON ({ response, toolCalls, spendAlert })
        end
    end
```

---

## 4. Architectural Inconsistencies & Trust Boundary Traps

### 4.1 Routing Inconsistency in `app.ts` (`/api/healthz`)
- **Observed:** Line 48 of `artifacts/api-server/src/app.ts` executes:
  `app.use("/api/healthz", healthRouter);`
- **Implementation:** Inside `routes/health.ts`, the router defines `router.get("/healthz", ...)`.
- **Result:** Mounting `healthRouter` at `/api/healthz` registers the route as `/api/healthz/healthz`.
- **Why it currently passes tests:** `healthRouter` is also imported in `routes/index.ts` and mounted at `app.use("/api", router)`. When a client requests `GET /api/healthz`, it is handled by the second mount inside `router`.
- **Architectural Consequence:** The route is handled **after** `clerkMiddleware` (lines 53–63), defeating the architectural intent (comment lines 39–47) to answer liveness probes *before* Clerk key validation.

### 4.2 Global Kill Switch Endpoint Authentication & Scope
- **Location:** `artifacts/api-server/src/routes/automation.ts` (`PUT /api/automation/flags/:key`).
- **Issue:** The route requires `requireAuth` but does not verify whether the authenticated user is a system administrator or owner. Furthermore, `automation_flags` is a single global database table without a `user_id` column.
- **Vulnerability:** Any authenticated user can disable reminders or reschedule sweeps globally for all users in the system.

### 4.3 Direct DB Invocations Bypassing RLS
Multiple backend services query the database connection pool directly without `runWithRls`:
1. **Telegram Webhook (`routes/telegram.ts`):** Inbound webhooks lack Clerk JWTs and use direct `db` queries, relying entirely on application-level filtering (`where(eq(tasksTable.userId, userId))`).
2. **Internal Cron Endpoints (`routes/internal.ts`):** Sweeps execute directly under table-owner privileges guarded solely by `x-dispatch-secret`.
3. **Agent Tool Executor (`lib/agent/tools.ts`):** Tool mutations execute via direct `db` queries with application-level `where` filters instead of the RLS transaction context.

---
*Verified through source analysis of `artifacts/api-server/src/app.ts`, `rls.ts`, `engine.ts`, `internal.ts`, and `spec/agent-and-memory-subsystem.md`.*
