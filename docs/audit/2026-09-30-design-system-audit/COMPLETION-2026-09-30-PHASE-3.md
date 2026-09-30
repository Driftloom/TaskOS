# Design System — Phase 3 Completion Report (2026-09-30)

Continues `COMPLETION-2026-09-30-PHASE-1-2.md`. Covers the P0 domain components, the
Today hierarchy fix, the automation kill switch, and a hardening pass on the lint gate.

---

## 1. Verification gates — all six green

| # | Gate | Result |
|---|---|---|
| 1 | `tsc --build --force` | **exit 0** |
| 2 | `tokens:check` (generated files current) | **exit 0** |
| 3 | `lint:tokens` | **exit 0** — 101 baselined, **0 new** |
| 4 | `api-server` build | **exit 0** |
| 5 | `cadence` (web) build | **exit 0** |
| 6 | vitest | **exit 0** — **220 passing**, 23 skipped |

---

## 2. Built

### 2.1 P0 domain components extracted (`§P11.1`)

`components/task/CadenceDomain.tsx` (new) — previously inline JSX inside pages, which
`§P4` forbids ("A page may not define its own button, card, chip, or sheet").

| Component | States implemented | Key non-negotiables honoured |
|---|---|---|
| **`NextUpCard`** | next-task · no-task · busy · error+retry | Most prominent element on Today; min-height 72; 2-line title clamp; `interactive.primary` fill with `text.on-accent`; disabled is never silent (`§P12`) — the reason is always shown |
| **`AITag`** | agent · auto-moved · suggested | Indigo + icon + text; `Why?` affordance per `§P15.1` ("every AI action must be explainable") |
| **`StatusIndicator`** | done · overdue · scheduled · running · paused · needs-attention · fixed | The full `§P9` icon table. **Never colour-alone** (`§P6.3`); scheduled/running always pair with the time text |

### 2.2 Today reordered to `§P14.2` — the "Start-first" inversion is fixed

This was finding 6-3, the audit's most product-visible defect: the single most
important action in the app rendered **last** on mobile and inside a 280px aside on desktop.

| | Before | After |
|---|---|---|
| Start position | `xl:` aside, 3rd element | **First element, full width, above the fold at every breakpoint** |
| Mobile order | proposals → capture → filters → full task list → **Start** | **Start** → proposals → capture → filters → task list |
| Proposals | above the fold, unbounded | under attention (`§P14.2 §4`) |

`§P3` "Start-first" is now actually true on screen.

### 2.3 Automation kill switch — built, with the security change documented

You told me to proceed, so I did — but **not** by quietly widening access.

`lib/db/src/schema/notifications.ts:65-67` states the table is *"writable ONLY by the
owner — there are deliberately no write policies. Toggle via the Supabase dashboard /
SQL editor, never via the API."* Implementing this necessarily narrows that stance, so
I kept the blast radius minimal and wrote the reasoning into the file:

**`artifacts/api-server/src/routes/automation.ts`** (new, mounted)
- `GET /api/automation/flags` — via `runWithRls` on the **existing** SELECT policy. No RLS change.
- `PUT /api/automation/flags/:key` — owner-level write, but **hard-whitelisted to `reminders` and `reschedule`**. Any other key → 400.
- Single-row upsert on one key. No delete, no key creation, no other table touched. `requireAuth` on both verbs. Every write logged.

**`components/chrome/AutomationPausedBanner.tsx`** (new, mounted in `AppShell`)
- Non-dismissible **critical** banner + working **Resume**, per `§P17.1`.
- Polls every 60s; keeps the last known value through refetch failures.
- Fails **safe**: it never claims automation is fine based on a failed fetch, and never cries wolf on a blip.

`SystemStatusBanner`'s `critical` tone enforces non-dismissible + `aria-live="assertive"`.

**⚠️ This is a deliberate security-posture change and needs your explicit sign-off.** It adds a write path to a table that was designed to have none. Reverting is deleting `automation.ts` and its `router.use` line.

### 2.4 Lint gate hardened — a real design flaw found and fixed

Adding my own component made the gate report two violations in `AppShell.tsx` that
were **pre-existing** and merely *shifted* by my added lines. The baseline was keyed on
`rule|file|line|excerpt`.

**Line-number keying is wrong** — any import or a few lines of JSX shifts every line
below it, so after any edit a large file's entire pre-existing debt reports as "new."

Fixed to `rule|file|excerpt` with **multiset counting**: a file can have N baselined
instances of the same text, and adding an N+1th still fails.

**Gate verified to actually work**, not just pass:
- Injected `bg-[#FF0000] text-[9px]` into a probe file → **exit 1**, 3 errors + 1 warn, correctly attributed.
- Removed probe → **exit 0**.

### 2.5 `AGENTS.md` wired to the new system

`§5` now names `docs/13-master-design-system-prompt.md` as the master execution spec that
wins on conflict, documents the generated-token workflow, the `verify` gate, the
`border-control` ≥3:1 rule, `.tap-target-expand`, and the open kill-switch gap.
The doc was previously an **orphan** — referenced nowhere in the repo.

---

## 3. Deliberately NOT done

| Item | Why |
|---|---|
| **`§P18–P32` spec sections** | Your design philosophy. I won't fabricate accessibility criteria, content rules, or a maturity model and present them as your spec. **Still the single biggest blocker** — `§P31` (the mandated first deliverable) doesn't exist. |
| **Remaining 22 P0/P1 domain components** | `NextUpCard`/`AITag`/`StatusIndicator` were unblocked because `§P11.1` fully specifies them. The rest (`FocusTimer`, `QuickCaptureSheet`, `TimeBlock`, `Calendar`, `ProposalCard`, `AgentActionCard`, `MemoryFactCard`, `ImportQueue`, …) depend on `§P18–P22`. |
| **Orval regeneration** | The kill-switch client is hand-written (with a comment saying so) so the UI works now. `openapi.yaml` needs the two paths added, then `pnpm --filter @workspace/api-spec run codegen` on Linux. |
| **6 calendar tap targets** | Needs a grid-pitch decision, not a hit-area patch. |
| **101 baselined lint violations** | Shadow strings, `rgba()` in SVG `stroke`/`filter`, Clerk appearance config. Gate prevents new ones. |
| **`--cad-` prefix (`§P5.1`)** | Partially impossible — shadcn hard-requires unprefixed names. |

---

## 4. Deviations & assumptions

1. **DEVIATION** — automation_flags gains an API write path (`§2.3`). Owner-authorised, narrowly scoped, documented in-file. **Needs sign-off.**
2. **ASSUMPTION** — `paused` is derived as "either kill switch is off," so the banner appears the moment the user pauses anything.
3. **DEVIATION** — kill-switch client is hand-written pending Orval regen.
4. **ASSUMPTION** — dark stays default; light is opt-in (unchanged from Phase 1/2).

---

## 5. Not verified — unchanged and still the top risk

No browser, no rendered frame, no device, no screen reader, and **no `DATABASE_URL`**, so
the kill-switch endpoints have **never been executed**. Specifically unverified:

1. **The new endpoints work at all.** `GET`/`PUT /api/automation/flags` have never run. The write path bypasses RLS by design; I have not confirmed the upsert, the 400 on a bad key, or that `requireAuth` is wired the way the sibling routers are.
2. **`TodayPage` still compiles and renders** after removing 54 lines of aside JSX and re-parenting the momentum card. Build passes; the JSX tree has not been seen.
3. **Start-first actually reads as dominant** on a real phone.
4. **The light theme has still never been rendered.**
5. **The 394-substitution colour sweep** (Phase 1/2) remains visually unconfirmed.
6. **Hit-area overlaps** from the 47 `tap-target-expand` sites.
7. **`border-border-control` at 3.36–4.14:1** may read as too heavy.

**Three rounds, ~800 edits, zero rendered frames.** The next required step is a real
device pass in both themes, plus one `DATABASE_URL`-backed run of the two new endpoints.
