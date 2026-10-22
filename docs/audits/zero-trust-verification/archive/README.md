# Quarantined Audit Artifacts

This directory holds historical artifacts that must not be executed or cited as current evidence.

## `adversarial-security.spec.ts.invalid`

Quarantined 2026-10-21. The original file used disabled test assertions and local fixtures, imported no Cadence product code, and was never collected by the Playwright or Vitest CI paths. It did not reproduce the vulnerabilities listed in the 2026-10-11 risk matrix.

The `.invalid` suffix prevents accidental test collection. See `../tests/README.md` for the replacement strategy.
