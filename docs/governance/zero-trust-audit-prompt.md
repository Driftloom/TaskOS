# Cadence — Zero-Trust Audit Protocol

> **Doc type:** Governance — repeatable audit procedure.  
> **When to use:** Run this weekly during active build weeks. Not a one-time event.  
> **Source:** Distilled from `docs/archive/06-opencode-zero-trust-audit-prompt.md`.

---

## 0. Zero-Trust Posture (Standing Rule)

Every status claim — in `PROGRESS.md`, `AUDIT.md`, prior agent summaries, or a spec doc — is **unverified until independently checked**. This is not a one-time audit stance; it is the permanent operating posture.

Running this audit:
- Verifies the current state against live code
- Does NOT make changes, add features, or "helpfully fix" things
- Produces a new dated report file (never overwrites existing reports)

---

## 1. Pre-Audit Setup

Before running the audit, confirm:
- [ ] Access to the live Supabase project (schema inspector or SQL editor)
- [ ] Ability to run `pnpm run test` (or equivalent) and see output
- [ ] Ability to run `pnpm run typecheck` (Linux/Replit) or `node node_modules/typescript/bin/tsc --build --force` (Windows)
- [ ] Current `PROGRESS.md` and `AUDIT.md` open for comparison

---

## 2. What to Verify (Checklist)

### 2.1 Schema vs. Spec
For each table in `spec/data-models-and-schema.md`:
- [ ] Table exists in Supabase
- [ ] All columns exist with correct types
- [ ] CHECK constraints match the spec (priority, status, automation, source, confidence, etc.)
- [ ] Foreign key constraints match (ON DELETE behavior)
- [ ] RLS is enabled on the table
- [ ] The required indexes exist

### 2.2 Route Coverage
- [ ] Count mounted routers in `artifacts/api-server/src/index.ts` — verify count matches `AGENTS.md`
- [ ] Spot-check 3 routes: confirm `requireAuth` is present, `runWithRls` is used in the handler
- [ ] `GET /healthz` and `GET /api/healthz` are publicly accessible (no auth)
- [ ] CORS is configured from `CORS_ORIGINS` env var — not `origin: true`

### 2.3 Test Suite
- [ ] Run `pnpm run test` — record the actual pass count and file count
- [ ] Compare to the count in `AGENTS.md` — flag any discrepancy
- [ ] TypeScript compile: `tsc --build --force` exits 0

### 2.4 Frontend Pages
- [ ] Verify which pages in `artifacts/cadence/src/pages/` actually exist
- [ ] Compare to the Information Architecture in `spec/system-requirements.md §3`
- [ ] Flag any pages claimed in docs but not present, or present but undocumented

### 2.5 Status Claims in PROGRESS.md
For each module listed:
- [ ] Find the implementing code
- [ ] Confirm the claimed status (Done / In Progress / Not Started) matches what the code actually does
- [ ] Correct any aspirational claims

### 2.6 Migration Status
- [ ] List applied migrations in Supabase (`supabase_migrations` table or schema inspector)
- [ ] Compare to migration files in `lib/db/migrations/`
- [ ] Flag any migration written but not applied

### 2.7 Cron Jobs
- [ ] Confirm `pg_cron` jobs exist in Supabase
- [ ] Verify schedule matches `spec/integrations-and-apis.md §3`
- [ ] Check Healthchecks.io dashboard — are pings arriving on schedule?

---

## 3. Report Format

Write the report to a new file: `AUDIT-[YYYY-MM-DD].md` at the repo root. **Never overwrite `AUDIT.md`** — append to it with a dated entry, or create a separate dated file.

Required sections:
1. **Date & auditor**
2. **What was verified** (checklist items run)
3. **Findings** — for each discrepancy, record: what was claimed, what was found, the file/line/evidence
4. **Status corrections** — list every `PROGRESS.md` entry that needs updating
5. **Open action items** — specific, owner-assigned, not vague recommendations

---

## 4. What NOT to Do During an Audit

- ❌ Do not fix bugs found during the audit in the same session
- ❌ Do not add features or "helpfully improve" things
- ❌ Do not update `PROGRESS.md` during the audit — that's a post-audit action
- ❌ Do not treat a prior audit's "verified" claims as still true — re-verify independently

---

## 5. Cadence

- **During active build weeks:** weekly minimum
- **After a major feature merge:** immediately before declaring the module "done"
- **Before a parallel-run trial:** full audit required as a go/no-go gate
- **Trigger for reset:** any real missed deadline during daily use triggers an unscheduled audit
