# Adversarial Test Status

No executable adversarial test suite is tracked here as of 2026-10-21.

The former `adversarial-security.spec.ts` was quarantined at `../archive/adversarial-security.spec.ts.invalid` because it did not exercise Cadence:
- It asserted against local literals and in-memory objects.
- It imported no API routes, RLS helpers, database code, or Telegram code.
- It was outside the Playwright test tree and was never collected by CI.

Do not restore it as evidence. New adversarial coverage should be API-level integration tests under `artifacts/api-server/src/tests/`, using the real route handlers and `runWithRls`, with authenticated test users and explicit cross-tenant assertions. Update `../08-risk-and-security-matrix.md` and the active verification matrix only after those tests run.
