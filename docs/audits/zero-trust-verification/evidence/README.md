# Cadence Zero-Trust Verification Evidence Ledger

> **Zero-Trust Rule 1.8 (Safe Boundaries & Privacy):**
> 1. Never commit real secrets, private Clerk tokens, Supabase service keys, or real Telegram bot tokens.
> 2. Redact sensitive values (`sk_live_***`, `Bearer eyJ***...`, `t.me/token***`) while retaining enough entropy/structure to verify format validity.
> 3. All evidence records here are strictly deterministic, timestamped, and tied to verifiable command execution or observed system state.

## Subdirectories

- `screenshots/`: Playwright visual diffs, manual UI inspection captures, mobile layout proofs.
- `api-or-cli/`: Raw curl / HTTP client response payloads, status codes, headers, and RFC 7807 error bodies.
- `database/`: Read-only SQL query results, row counts, constraint violation outputs, RLS isolation verification proofs.
- `logs/`: Application stdout/stderr logs, Express request logs, migration runner outputs.
- `traces/`: End-to-end request trace dumps, timing breakdowns, Core Web Vitals lab runs.
- `events-and-queues/`: `pg_cron` execution receipts (`cron.job_run_details`), `pg_net` responses (`net._http_response`), Healthchecks.io ping receipts.
- `model-or-agent-runs/`: LiteLLM gateway request/response transcripts, tool call arguments, `agent_action_log` records, Rule 9 multiplier calculation traces.
