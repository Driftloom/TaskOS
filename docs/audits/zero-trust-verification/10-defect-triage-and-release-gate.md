# 10 — Defect Triage, Risk Scoring & Release Gate Decision

> **Zero-Trust Release Governance Assessment**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Principal Systems Architect & Release Authority  

---

## 1. Formal Defect Classification & Triage

Defects are assigned strict engineering priorities:
- **P0 (Blocker):** Must be resolved immediately before ANY additional users or traffic are admitted.
- **P1 (Critical):** Must be resolved before general multi-tenant release.
- **P2 (Major):** Functional divergence or enterprise gap to be remediated during active sprint.
- **P3 (Minor):** Non-blocking performance, UX polish, or open design trade-off.

---

### Defect Inventory (F1 through F11)

| ID | Priority | Defect Title & Root Cause | Affected Files | Security & Functional Impact | Remediation Action |
|---|---|---|---|---|---|
| **F-01** | **P0** | **Cross-Tenant Telegram Bot Token Exposure**<br>Unscoped query in `lib/telegram-credentials.ts` selects `telegram_config` without filtering by `userId`. | `artifacts/api-server/src/lib/telegram-credentials.ts:74-90, 120-137` | **CRITICAL SECURITY LEAK:** Any user without a configured bot token inherits the first user's private Telegram token. | Remove unscoped query; return empty string if user has no token configured. |
| **F-02** | **P0** | **Telegram Pairing Token Replay Window**<br>Pairing confirmation updates `telegramChatId` but leaves the token active in memory for remainder of 10m TTL. | `artifacts/api-server/src/lib/telegram-pairing.ts:37-55` | **HIJACK RISK:** An attacker with the pairing token can override the victim's chat ID before expiration. | Call `pairingRegistry.delete(token)` immediately upon confirmation. |
| **F-03** | **P1** | **Broken Month-Close Cron Job & Plaintext Secrets**<br>Job E evaluates session-local GUC resulting in NULL secret (0 runs); jobs A–D embed plaintext secrets in `cron.job.command`. | `lib/db/setup_supabase_cron.sql:161-251` | **INTEGRITY & SECRET EXPOSURE:** Month goals cannot auto-close; secret readable in Postgres tables. | Migrate `DISPATCH_SECRET` to Supabase Vault (`vault.decrypted_secrets`). |
| **F-04** | **P1** | **Global Kill Switch BOLA / Cross-Tenant DoS**<br>`PUT /api/automation/flags/:key` lacks tenant scoping or admin authorization check. | `artifacts/api-server/src/routes/automation.ts:65-98` | **DENIAL OF SERVICE:** Any authenticated user can disable reminders or rescheduling for all tenants. | Scope flags per `user_id` or restrict route to platform owner's ID. |
| **F-05** | **P1** | **SSRF in URL Metadata Resolution**<br>`isPrivateOrForbiddenHost` uses regex without DNS pre-resolution and allows HTTP 302 redirects. | `artifacts/api-server/src/lib/url-metadata.ts:20-36, 130-141` | **NETWORK SSRF:** Attacker can reach private cloud metadata or local internal ports via redirects. | Disable redirect following (`redirect: 'manual'`) and validate resolved IP against RFC 1918. |
| **F-06** | **P2** | **Calendar Time-Block Undo Defect**<br>`undoLastAgentAction` in `undo.ts` only checks `targetType === 'task'`, omitting `time_block`. | `artifacts/api-server/src/lib/agent/undo.ts:36-64` | **STATE DESYNC:** Calling `POST /agent/undo` fails to delete newly created calendar time blocks. | Add `targetType === 'time_block'` branch deleting row from `time_blocksTable`. |
| **F-07** | **P2** | **LLM Spend Ceiling Lifetime Sum Bug**<br>Query in `engine.ts` sums `llmUsageTable` without month filter (`created_at >= monthStart`). | `artifacts/api-server/src/lib/agent/engine.ts:1260-1272` | **QUOTA FAULT:** Calculates lifetime spend; permanently triggers alert once user reaches $5.00 cumulatively. | Add `created_at >= firstDayOfMonth` filter to query; enforce hard 429 throttle. |
| **F-08** | **P2** | **Telegram Freeform Messages Dropped**<br>Non-regex commands in `telegram.ts` return help text instead of routing to `runAgentConversation`. | `artifacts/api-server/src/routes/telegram.ts:140-195` | **DEGRADED UX:** Users cannot talk conversationally to the agent via Telegram. | Route unmatched conversational text to `runAgentConversation`. |
| **F-09** | **P2** | **Tier 2 Semantic Memory Dead Code**<br>`memory_embeddings` table exists in database schema, but zero retrieval or ingestion code exists. | `lib/db/src/schema/memory.ts:67` | **UNIMPLEMENTED CAPABILITY:** "Search my past thoughts/notes" capability is dead code. | Implement embedding generation and cosine similarity search or deprecate table. |
| **F-10** | **P2** | **Clerk `/sign-in` Bundle & LCP Breach**<br>Clerk client transfers 400.3 kB (62% of page load), resulting in LCP of ~5,989 ms. | `artifacts/cadence/src/pages/auth/SignInPage.tsx` | **PERFORMANCE RISK:** Heavy initial load on slow mobile connections. | Evaluate dynamic lazy-loading of Clerk components or pre-connect headers. |
| **F-11** | **P3** | **Auth Surface CTA Contrast Warning (2.14:1)**<br>Clerk draws CTA ring with button's own orange fill, measuring 2.14:1 against light card. | `scripts/verify-auth-surface.cjs` | **A11Y WARNING:** WCAG 1.4.11 prefers 3:1 for non-text UI components. (Text is compliant). | Open visual design decision: retain brand orange or darken light-theme button border. |

---

## 2. Release Gate Decision

### Current Release Recommendation: **NO-GO FOR GENERAL MULTI-TENANT PRODUCTION**

```text
================================================================================
FINAL ZERO-TRUST RELEASE GATE VERDICT: CONDITIONAL DOGFOOD PASS / NO-GO GENERAL
================================================================================
General Multi-Tenant Release:       NO-GO (BLOCKED ON P0 VULNERABILITIES F-01 & F-02)
Owner-Only Single-Tenant Dogfood:   CONDITIONAL PASS (Rohit only, with manual verification)
================================================================================
```

### Rationale
1. **P0 Security Blockers:** `VULN-01` (Telegram token cross-tenant leak) and `VULN-02` (Global kill switch DoS) pose unacceptable security risks in any multi-user deployment.
2. **Scheduled Automation Integrity:** `VULN-05` (Broken month-close cron job) prevents autonomous month transitions, requiring manual operator intervention.
3. **Empty Data Verification Gap:** Procedures G4-e through G4-k cannot be certified complete until synthetic data is seeded and observed at runtime.

### Exit Criteria for Full General Release ("GO")
1. [ ] Hotfix applied to `lib/telegram-credentials.ts` eliminating unscoped fallback.
2. [ ] Hotfix applied to `lib/telegram-pairing.ts` deleting token upon confirmation.
3. [ ] `DISPATCH_SECRET` migrated to Supabase Vault; Job E verified firing with HTTP 200.
4. [ ] `PUT /api/automation/flags/:key` restricted to platform administrator.
5. [ ] Synthetic test data seeded; manual test program (Phases A through J) executed by Rohit.

---
*Zero-trust release evaluation signed by Principal Architect.*
