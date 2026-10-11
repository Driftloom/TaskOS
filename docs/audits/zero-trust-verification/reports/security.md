# Specialized Subsystem Report: Security, Multi-Tenancy & Threat Analysis

> **Zero-Trust Security & Threat Assessment**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Principal Security Architect & Penetration Tester  

---

## 1. Identity, Authentication & RLS Isolation Architecture

Cadence enforces multi-tenancy through a decoupled identity model:
- **Identity Provider:** Clerk Auth issues JWTs upon user login.
- **Database Engine:** Supabase PostgreSQL with Row Level Security (RLS) enabled across all user tables.
- **Security Bridge (`runWithRls`):** The backend database connection pool connects using owner credentials (`postgres`), which bypasses RLS by default. `runWithRls` opens a transaction, sets `request.jwt.claims` to the forwarded Clerk JWT payload, drops connection role to `authenticated`, and executes queries.
- **Fail-Closed Verification:** If `authToken` is absent or malformed, claims default to `{ sub: null, role: 'authenticated' }`. Because `NULL = user_id` evaluates to NULL/falsy in SQL, all queries are denied immediately.

---

## 2. In-Depth Vulnerability Analysis

### 2.1 Critical Vulnerability: Telegram Bot Token Cross-Tenant Leak (VULN-01)
- **File:** `artifacts/api-server/src/lib/telegram-credentials.ts:74-90, 120-137`
- **Root Cause:**
  When resolving a bot token for a user or chat ID, if no specific record is found, the helper executes an un-scoped fallback query:
  ```typescript
  const [fact] = await db
    .select({ value: memoryFactsTable.value })
    .from(memoryFactsTable)
    .where(
      and(
        eq(memoryFactsTable.key, "telegram_config"),
        eq(memoryFactsTable.archived, false),
      ),
    )
    .limit(1);
  ```
  **Notice:** The query omits `eq(memoryFactsTable.userId, userId)`.
- **Exploitation:** In a multi-tenant environment, the first tenant (User A) to configure a Telegram bot token has their token returned to any other tenant (User B) who has not yet configured one. User B's notifications and messages route through User A's private bot.
- **Remediation:** Remove the unscoped fallback completely. Only return a token when `eq(memoryFactsTable.userId, userId)` matches.

### 2.2 Broken Object Level Authorization (BOLA) on Global Kill Switch (VULN-02)
- **File:** `artifacts/api-server/src/routes/automation.ts:65-98`
- **Root Cause:** `PUT /api/automation/flags/:key` updates `automation_flagsTable` without checking whether the user is an administrator or platform owner. The table has no `user_id` column and controls global dispatch behavior.
- **Exploitation:** Any authenticated user can issue:
  ```http
  PUT /api/automation/flags/reminders
  {"enabled": false}
  ```
  This immediately halts reminder dispatching for all users on the platform.
- **Remediation:** Scope `automation_flags` per `user_id` or restrict the endpoint to a whitelist containing only the owner's `user_id`.

### 2.3 Server-Side Request Forgery (SSRF) in URL Metadata Resolver (VULN-03)
- **File:** `artifacts/api-server/src/lib/url-metadata.ts:20-36, 130-141`
- **Root Cause:**
  1. `isPrivateOrForbiddenHost` uses string regex without pre-fetch DNS resolution (vulnerable to DNS rebinding).
  2. Native `fetch` follows HTTP 302 redirects by default (`redirect: 'follow'`).
- **Exploitation:** An attacker submits a public domain returning a 302 redirect to `http://169.254.169.254/latest/meta-data/` or `http://localhost:5000/api/healthz`. The server follows the redirect and exposes internal payloads.
- **Remediation:** Set `redirect: 'manual'` and validate the socket destination IP address against private CIDR ranges prior to streaming response bytes.

---

## 3. Supabase Vault Migration Procedure (VULN-04 & VULN-05)

### Problem Statement
1. Jobs A–D store `DISPATCH_SECRET` in plaintext inside `cron.job.command`.
2. Job E (`cadence-goals-close-month`) evaluates `current_setting('app.cadence.dispatch_secret', true)` in a background cron worker where session GUCs are unset, returning NULL and failing with 401 on every run (`runs_ever = 0`).

### Remediation SQL Migration
```sql
-- 1. Store secrets securely inside Supabase Vault
SELECT vault.create_secret('https://api.domain.com/api', 'cadence_api_url', 'Cadence API Base URL');
SELECT vault.create_secret('REPLACE_WITH_REAL_DISPATCH_SECRET', 'cadence_dispatch_secret', 'Cadence Internal Dispatch Secret');

-- 2. Unschedue existing jobs
SELECT cron.unschedule('cadence-reminder-dispatch');
SELECT cron.unschedule('cadence-reschedule-sweep');
SELECT cron.unschedule('cadence-memory-extraction');
SELECT cron.unschedule('cadence-recurrence-materialize');
SELECT cron.unschedule('cadence-goals-close-month');

-- 3. Reschedule with dynamic Vault resolution
SELECT cron.schedule(
  'cadence-reminder-dispatch',
  '*/5 * * * *',
  $$SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cadence_api_url') || '/internal/dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cadence_dispatch_secret')
      ),
      body := '{}'::jsonb
    );$$
);

SELECT cron.schedule(
  'cadence-goals-close-month',
  '5 0 1 * *',
  $$SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cadence_api_url') || '/internal/goals/close-month',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cadence_dispatch_secret')
      ),
      body := '{}'::jsonb
    );$$
);
```

---

## 4. BYOK Credential Envelope Encryption Architecture

- Per-user LLM provider keys are stored in `llm_credentialsTable`.
- Ciphertext format: `v1:<iv>:<tag>:<payload>` using AES-256-GCM.
- Managed by `artifacts/api-server/src/lib/agent/credential-crypto.ts`.
- **Security Invariant:** `GET /agent/credentials` never selects or returns `ciphertext`. It projects only `keyHint` (last 4 characters) to the UI.

---
*Report certified by Principal Security Architect.*
