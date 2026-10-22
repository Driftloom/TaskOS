# 08 — Risk, Threat Modeling & Security Vulnerability Matrix

> **HISTORICAL SNAPSHOT (2026-10-11):** The vulnerability statuses below describe the audit date and are **not current release evidence**. Re-verify each item against the current code before acting. See [`README.md`](./README.md) in this directory.

> **Zero-Trust Security & Adversarial Threat Matrix**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Principal Security Architect & Penetration Tester  

---

## 1. Threat Classification & Scoring Standard

Vulnerabilities are evaluated using standard CVSS 3.1 qualitative severity ratings:
- **Critical (9.0–10.0):** Immediate cross-tenant credential exposure, remote code execution, or unauthorized administrative takeover.
- **High (7.0–8.9):** Cross-tenant data tampering, denial of service across tenants, or SSRF reaching private networks.
- **Medium (4.0–6.9):** Privilege escalation within a tenant, broken rollback logic, non-blocking cost overruns, or token replay windows.
- **Low (0.1–3.9):** Minor routing misconfigurations, missing dead-letter queues, or informational leaks.

---

## 2. Master Vulnerability & Threat Matrix

| Threat ID | Threat / Vulnerability Title | Affected File & Lines | Attack Vector / Root Cause | Severity | Current Status | Remediation Required |
|---|---|---|---|---|---|---|
| **VULN-01** | **Cross-Tenant Telegram Bot Token Leak** | `artifacts/api-server/src/lib/telegram-credentials.ts:74-90, 120-137` | Un-scoped database fallback query selects `memoryFactsTable` where `key = 'telegram_config'` **without** `userId` filter. Returns User A's private bot token to any unconfigured tenant or unknown chat. | **CRITICAL** (CVSS 9.1) | **UNPATCHED VULNERABILITY** | Remove unscoped query. Only return token if matching `userId` exists. |
| **VULN-02** | **Cross-Tenant DoS via Global Kill Switch BOLA** | `artifacts/api-server/src/routes/automation.ts:65-98` | `PUT /api/automation/flags/:key` requires authentication but performs no tenant check or owner authorization. Any valid user can disable reminders or reschedule sweeps globally for all users. | **HIGH** (CVSS 8.2) | **UNPATCHED VULNERABILITY** | Scope `automation_flags` per `user_id` or restrict route to platform owner's ID. |
| **VULN-03** | **SSRF via URL Metadata Extraction** | `artifacts/api-server/src/lib/url-metadata.ts:20-36, 130-141` | `isPrivateOrForbiddenHost` uses regex without pre-fetch DNS resolution. Vulnerable to DNS rebinding (e.g. `127.0.0.1.nip.io`), decimal IP encodings, and HTTP 302 redirects following to private endpoints. | **HIGH** (CVSS 7.5) | **UNPATCHED VULNERABILITY** | Disable redirect following (`redirect: 'manual'`) and validate resolved IP against RFC 1918 CIDRs. |
| **VULN-04** | **Plaintext `DISPATCH_SECRET` in `cron.job.command`** | `lib/db/setup_supabase_cron.sql:161-251` | `cron.schedule()` string interpolation bakes the plaintext secret literal into PostgreSQL table `cron.job`. Readable by anyone with DB read rights; unrotatable without job teardown. | **HIGH** (CVSS 7.2) | **ARCHITECTURAL DEFECT** | Migrate secret to Supabase Vault (`vault.decrypted_secrets`) and read dynamically at runtime. |
| **VULN-05** | **Session GUC Null Resolution (Cron Job E Failure)** | `lib/db/setup_supabase_cron.sql` (Job E registration) | Job E `cadence-goals-close-month` evaluates `current_setting('app.cadence.dispatch_secret', true)` in a background cron worker session where GUCs are unset. Returns NULL and fails with 401 on every tick. | **HIGH** (CVSS 7.0) | **ACTIVE DEFECT (0 runs)** | Migrate to Supabase Vault resolution (same fix as VULN-04). |
| **VULN-06** | **Agent Tools Direct DB Invocations (RLS Bypass)** | `artifacts/api-server/src/lib/agent/tools.ts:143, 313, 360` | Tool actions mutate `tasksTable` using raw `db` pool connection without `runWithRls`. In `bulk_reschedule`, update query omits `eq(tasksTable.userId, userId)`, risking cross-tenant updates if IDs collide. | **MEDIUM** (CVSS 6.5) | **UNPATCHED VULNERABILITY** | Wrap all tool operations in `runWithRls` or enforce strict `and(eq(tasksTable.id, id), eq(tasksTable.userId, userId))`. |
| **VULN-07** | **Telegram Pairing Token Replay Window** | `artifacts/api-server/src/lib/telegram-pairing.ts:37-55` | Confirmation of pairing token marks `session.confirmed = true` but does not delete token from memory registry. Token remains replayable for the remainder of its 10-minute TTL. | **MEDIUM** (CVSS 5.8) | **UNPATCHED VULNERABILITY** | Call `pairingRegistry.delete(token)` immediately upon confirmation. |
| **VULN-08** | **LLM Spend Ceiling Non-Enforcement & Lifetime Sum Bug** | `artifacts/api-server/src/lib/agent/engine.ts:1260-1272` | Query sums `llmUsageTable` without date filtering (`created_at >= monthStart`), calculating lifetime spend rather than monthly spend. Reaching $5.00 emits an alert flag but never blocks or throttles calls. | **MEDIUM** (CVSS 5.3) | **ACTIVE DEFECT** | Filter query to current month; return HTTP 429 when monthly spend reaches $5.00 ceiling. |
| **VULN-09** | **Indirect Prompt Injection via Task Titles** | `artifacts/api-server/src/lib/agent/engine.ts:400-450` | Dynamic system prompt concatenates raw task titles into the `### REASONING RULES` section without XML tags or character escaping, enabling prompt injection from malicious task titles. | **MEDIUM** (CVSS 5.0) | **ARCHITECTURAL RISK** | Wrap task list in `<user_tasks>` XML tags and sanitize prompt injection markers. |
| **VULN-10** | **Violation of D-22 Reminder Storm Suppression** | `artifacts/api-server/src/routes/internal.ts:164-223` | Claims up to 100 overdue reminders and dispatches individual Telegram messages in a loop instead of batching multiple overdue alerts into a single summary notification. | **LOW** (CVSS 3.8) | **SPECIFICATION DRIFT** | Aggregate reminders by `userId` and send a single summary message when count > 3. |
| **VULN-11** | **Health Probe Mounting Order in `app.ts`** | `artifacts/api-server/src/app.ts:48` | `app.use("/api/healthz", healthRouter)` mounts router handling `/healthz`, creating `/api/healthz/healthz`. Actual `/api/healthz` is handled by inner router after `clerkMiddleware`. | **LOW** (CVSS 3.1) | **CONFIGURATION DEFECT** | Mount health router directly at `/api` or rewrite handler to `/`. |
| **VULN-12** | **Absence of API Rate Limiting** | `artifacts/api-server/src/app.ts` | No rate limiting middleware installed across Express routers. Expensive endpoints (`/api/agent/chat`, `/api/integrations/url-metadata`) vulnerable to resource exhaustion. | **MEDIUM** (CVSS 5.5) | **ENTERPRISE GAP** | Add `express-rate-limit` with Redis or in-memory token bucket. |

---

## 3. Adversarial Test Evidence Status (Updated 2026-10-21)

The former `docs/audits/zero-trust-verification/tests/adversarial-security.spec.ts` did **not** contain concrete reproduction tests. It asserted against local literals and in-memory values, did not import or invoke Cadence routes, RLS, database code, or Telegram code, and was outside the Playwright test tree so it was never collected by CI. The claim that it reproduced every vulnerability above was false.

The file has been quarantined at `archive/adversarial-security.spec.ts.invalid`. The vulnerability table above remains a **historical triage list**, not a verified current vulnerability register. Any ADV coverage must be rebuilt as executable API-level integration tests before a remediation claim is made.

---
*Historical matrix retained for security triage context; not a current release gate.*
