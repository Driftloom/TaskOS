# Cadence Zero-Trust Verification Evidence Ledger

> **Status as of 2026-10-21:** SCAFFOLD ONLY. The evidence subdirectories are empty and untracked; no verification artifacts are committed here. This directory does not substantiate any PASS claim.

> **Zero-Trust Rule 1.8 (Safe Boundaries & Privacy):**
> 1. Never commit real secrets, private Clerk tokens, Supabase service keys, or real Telegram bot tokens.
> 2. Redact sensitive values (`sk_live_***`, `Bearer eyJ***...`, `t.me/token***`) while retaining enough entropy/structure to verify format validity.
> 3. Evidence records added in future must be deterministic, timestamped, and tied to a verifiable command execution or observed system state.

## Subdirectories

- `screenshots/`: Playwright visual diffs, manual UI inspection captures, mobile layout proofs.
- `api-or-cli/`: Raw curl / HTTP client response payloads, status codes, headers, and RFC 7807 error bodies.
- `database/`: Read-only SQL query results, row counts, constraint violation outputs, RLS isolation verification proofs.
- `logs/`: Application stdout/stderr logs, Express request logs, migration runner outputs.
- `traces/`: End-to-end request trace dumps, timing breakdowns, Core Web Vitals lab runs.
- `events-and-queues/`: `pg_cron` execution receipts (`cron.job_run_details`), `pg_net` responses (`net._http_response`), Healthchecks.io ping receipts.
- `model-or-agent-runs/`: LiteLLM gateway request/response transcripts, tool call arguments, `agent_action_log` records, Rule 9 multiplier calculation traces.

These are expected categories, not evidence that the files exist. Add artifacts deliberately and link them from the relevant report before claiming coverage.
