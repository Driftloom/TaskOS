# Design System — Phase 4 Completion Report (2026-09-30)

Continues `COMPLETION-2026-09-30-PHASE-3.md`. Covers live verification of the automation
kill switch, OpenAPI/Orval contract completion, and contract tests locking the security posture.

---

## 1. Verification gates — all seven green

| # | Gate | Result |
|---|---|---|
| 1 | `tsc --build --force` | **exit 0** |
| 2 | `tokens:check` | **exit 0** |
| 3 | `lint:tokens` | **exit 0** — 101 baselined, **0 new** |
| 4 | `openapi codegen` (Orval) | **exit 0** — regenerates clean |
| 5 | `api-server` build | **exit 0** |
| 6 | `cadence` (web) build | **exit 0** — 1882 modules |
| 7 | vitest | **exit 0** — **227 passing** (215 api-server + 12 db), 23 skipped |

Test count rose from 220 → **227** (7 new contract tests).

---

## 2. The kill switch is now verified against the live database

Last report I flagged: *"the two new endpoints have **never executed** — no `DATABASE_URL`."*

**That was wrong: `DATABASE_URL` is present in `.env` and reachable.** I probed it.

`scripts/probe-automation-flags.ts` (new, read-only) against `aws-0-ap-south-1.pooler.supabase.com`:

```
connected as: postgres | db: postgres
automation_flags rows: 2
  key=reminders  enabled=true  updated_at=2026-09-18T19:40:03.802Z
  key=reschedule enabled=true  updated_at=2026-09-18T20:08:25.689Z
derived paused: false
whitelisted keys present : reminders, reschedule
non-whitelisted present  : none
indexes: automation_flags_pkey (unique)
RLS policies on automation_flags:
  flags readable  cmd=SELECT  roles={authenticated}
RLS enabled: true | forced: false
```

This confirms every assumption the security note in `automation.ts` rests on:

| Assumption | Verified |
|---|---|
| The two whitelisted keys are the real keys | ✅ both present, **zero** non-whitelisted keys |
| Read can go through `runWithRls` | ✅ a `SELECT` policy scoped to `authenticated` exists |
| Write cannot go through RLS | ✅ **only** a SELECT policy — no INSERT/UPDATE, as the schema comment says |
| RLS is on but not forced | ✅ explains why the owner-level write path is needed |
| `onConflictDoUpdate({ target: key })` is valid | ✅ `automation_flags_pkey` is a unique index on the key |
| Banner will not show today | ✅ derived `paused: false` — both switches are on |

---

## 3. OpenAPI contract completed + Orval regenerated

Phase 3 shipped the hand-written client and deferred codegen. That's now closed.

**`lib/api-spec/openapi.yaml`** — added:
- `GET /automation/flags` → `AutomationFlags { flags, paused }`
- `PUT /automation/flags/{key}` → `SetAutomationFlag200 { flag }`
- `automation` tag; `AutomationFlag`, `AutomationFlags`, `SetAutomationFlagInput` schemas
- `clerkSession` security on both; `key` param is `enum: [reminders, reschedule]`

**Orval ran clean (exit 0)** and generated:
- `AutomationFlagKey` as a **generated enum** — `setAutomationFlag(key: 'reminders' | 'reschedule', ...)` is now unrepresentable with a bad key **at the type level**, giving defence in depth behind the server allow-list.
- `getGetAutomationFlagsQueryOptions()` + a typed `AutomationFlags` interface.

**Client rewritten to use the generated client**, matching the other 18 files in the app — the hand-rolled `fetch` is gone.

Two bugs hit and fixed on the way:
1. **`SetAutomationFlagBody` name collision** — an inline `requestBody` schema made Orval emit the name twice (`setAutomationFlagBody.ts` + `api.ts`), failing `tsc` with `TS2308`. Fixed by promoting the body to a named `SetAutomationFlagInput` component schema.
2. **`useQueryClient` imported from the wrong package** — I'd pulled it from `@workspace/api-client-react`, which re-exports the generated API but not the react-query hook. `tsc --build` passed it (incremental, libs already built) but **Rollup caught it at bundle time**. Now imported from `@tanstack/react-query`. Worth noting: **`tsc` green did not mean the bundle built** — only the full gate caught this.

---

## 4. Contract tests lock the security posture

`artifacts/api-server/src/routes/automation.test.ts` (new, 7 tests) — run in the normal suite, no `DATABASE_URL` needed:

- accepts exactly `reminders` / `reschedule`
- rejects `user_settings`, wrong casing, `__proto__`, `constructor`, empty, and all non-strings
- `enabled` must be a **strict boolean** (no `1`/`"true"` coercion)
- **no DELETE route and no generic PUT** — fails if someone widens the surface
- `paused` derivation, including the live DB state (both on → not paused)

The point: a future refactor that quietly broadens the write surface now fails CI instead of shipping.

---

## 5. Still not done

| Item | Why |
|---|---|
| **`§P18–P32` spec sections** | Your design philosophy. Unchanged and still the top blocker — `§P31`, the mandated *first* deliverable, does not exist. |
| **Remaining 22 P0/P1 domain components** | Depend on `§P18–P22`. |
| **6 calendar tap targets** | Needs a grid-pitch decision. |
| **101 baselined lint violations** | Shadow strings, SVG `rgba()`, Clerk config. |
| **Visible pause/resume control in Settings** | The banner + Resume exist; a dedicated Settings row does not. |
| **Actual `PUT` execution against the live DB** | The read path and the schema are verified; I did **not** mutate a live kill switch to prove the write. Reversible, but it is your safety control — say the word and I'll exercise it. |
| **`--cad-` prefix** | Partially impossible (shadcn contract). |

---

## 6. Deviations & assumptions

1. **DEVIATION (standing)** — `automation_flags` gains an API write path. Owner-authorised in Phase 3; security posture now **verified** against the live DB (Phase 4). Still wants your explicit sign-off.
2. **DEVIATION** — client moved from hand-written `fetch` to the Orval-generated client (the correct pattern, matching the rest of the app).
3. **ASSUMPTION** — a named `SetAutomationFlagInput` component schema is preferable to an inline body, both to avoid the Orval name collision and for reuse.
4. **ASSUMPTION** — the 23 skipped `lib/db` tests remain skipped; they are destructive-ledger tests gated behind `CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS=1` and must not run against a remote host. Deliberately not enabled.

---

## 7. Not verified

**Still no rendered frame.** No browser, no device, no screen reader. Unverified:

1. **Every visual change across all four phases** — light theme, 394-substitution colour sweep, Today reorder, `border-border-control` weight, hit-area overlaps, 12px text clipping.
2. **The `PUT` handler's runtime behaviour** — upsert, 400s, and `requireAuth` wiring are unit-tested by construction, not executed.
3. **The banner's rendered behaviour** when a switch *is* off (live state is currently unpaused, so the paused path has never rendered).

The colour/design work is now on solid, enforced foundations and its data is verified correct. What it needs is a device.
