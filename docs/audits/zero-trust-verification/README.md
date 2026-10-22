# Zero-Trust Verification Audit — Historical Snapshot

> **Audit Date:** 2026-10-11<br>
> **Status:** HISTORICAL — not current release evidence<br>
> **Caveats refreshed:** 2026-10-21

This directory preserves a dated zero-trust audit of Cadence. It is useful as a record of what was examined, which risks were suspected, and what manual verification was planned. It is **not** a current pass/fail record.

## Read this before using any report here

- **Counts and statuses are stale.** Migration, router, test, vulnerability, and gate-status claims describe 2026-10-11. Re-measure against the current repository.
- **The former adversarial suite was not real evidence.** `tests/adversarial-security.spec.ts` asserted against local literals and in-memory objects, imported no product code, and was not collected by Playwright or CI. It was quarantined at `archive/adversarial-security.spec.ts.invalid` on 2026-10-21. See `tests/README.md`.
- **The evidence directory is an empty scaffold.** `evidence/` categories describe what should be captured; no artifacts are committed there.
- **The E2E catalog has been refreshed.** `e2e/README.md` lists the actual 19 spec files and the last measured count (151 tests), instead of the previous 16 phantom spec names and 144-test claim.
- **The module topology has been refreshed.** `modules/README.md` now uses the measured 20 routers, 20 migrations, 15 schema modules, and 24 table definitions.
- **The security matrix is historical.** `08-risk-and-security-matrix.md` preserves the 2026-10-11 vulnerability triage; current patched/unpatched status must be established by new code review and tests.
- **Current authority:** `AGENTS.md`, `docs/07-module-registry.md`, `docs/architecture/current-state.md`, and `spec/master-verification-matrix.md`.

## Contents

- `00`–`10`: dated audit reports and plans.
- `e2e/`: Playwright E2E architecture and actual spec inventory.
- `modules/`: subsystem topology and module inventory.
- `evidence/`: evidence-capture scaffold (empty).
- `tests/`: quarantined-test notice.
- `archive/`: non-executable historical test artifact.
- `reports/`: generated report artifacts, if any.

Do not cite this directory as proof that a current release gate passed. Rebuild executable evidence and update the active verification records instead.
