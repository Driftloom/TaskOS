# Cadence Coding Guidelines

How to work in this repository. Every rule here exists because something specific
in this codebase has already gone wrong — the trap it guards is named in each
section, so you can check the rule against reality rather than take it on faith.

**These are working-style defaults, not authority.** Where this file and
`AGENTS.md` disagree, `AGENTS.md` wins without argument — §5's always-do/never-do
list, `spec/locked-decisions.md`, and the 12-gate `pnpm run verify` ladder are what
actually bind. Workable examples in [EXAMPLES.md](EXAMPLES.md).

**These files carry status claims, so they expire.** Any gate count, test count or
router count written here was true on the date stated and stops being true the
moment one is added. That is not hypothetical: the previous version of this
document said "11-gate" until `verify:auth-surface` landed, and the same drift had
already put that number into eight other documents. When you add a gate, a test
file or a router, update the count everywhere it appears — `AGENTS.md §5` carries
the full file-by-file map.

---

## 1. Read before you write

Cadence has load-bearing invariants that are invisible at the call site. A change
that looks local can silently break tenant isolation or ship a class that does
nothing.

Before implementing anything, state your assumptions. If two readings of the
request exist, present both — do not pick one silently. If something is unclear,
stop and say which part.

**The traps this guards, in this repo:**

- **RLS is load-bearing.** Every handler runs inside `runWithRls`
  (`artifacts/api-server/src/lib/rls.ts`). The bare `db` export is an
  owner-level pool that bypasses RLS on its own. A query outside that wrapper is
  a cross-tenant data leak, not a style choice. See `AGENTS.md §4.1`.
- **Code is not committed here.** Migrations `0000`–`0018` are applied, and the
  ladder runs `codegen` on every pass.

## 2. Build the smallest thing that is correct

No feature that was not asked for. No abstraction for a single call site. No
configuration for a case that does not exist. If 200 lines could be 50, write 50.

**The traps this guards, in this repo:**

- **A locked decision is not a licence to generalise.** `spec/locked-decisions.md`
  fixes the reschedule cap at 5, Telegram as the primary channel, and bulk
  confirmation above 10 tasks. Build that, not a configurable version of it. The
  same applies to what is *deferred* — Google Calendar sync, Helicone, dedicated
  OCR and billing are explicitly out (`AGENTS.md §5`), so do not build a seam for
  them either.
- **Over-abstraction has a real cost here.** A strategy hierarchy around
  rescheduling would be three classes and a container to produce at most one
  proposal per task, when a single exported function does it.

## 3. Touch only what the request touches

Match the surrounding style even when you would write it differently. Do not
reformat adjacent code, do not rename things you did not need to, do not
reformat a file because a tool would. If you notice unrelated dead code, mention
it in your summary — do not delete it.

**The traps this guards, in this repo:**

- **A class can emit nothing and still typecheck.** Tailwind v4 resolves
  `min-h-*` / `max-w-*` / `min-w-*` from the `--spacing` namespace only, so a
  token under any other namespace produces zero CSS and the property silently
  falls back to `auto`. Custom sizing must be an explicit `@utility` rule in
  `index.css`. This passed `typecheck`, `lint:tokens` *and* `build:web` while 47
  call sites did nothing. See `AGENTS.md §4.3`.
- **`shadcn add` regenerates `components/ui/`** and silently restores raw
  literals. Two tokenised files live there. Re-run `pnpm run lint:tokens`
  afterwards and confirm they still name the utility.
- **Bulk migrations are not a side effect of a fix.** If one call site was wrong,
  report the scope and let the owner decide the migration. Do not rewrite 47
  sites in the same diff as a bug fix.

## 4. Name the gate, then loop until it is green

"Done" means a named command exited 0. Not "it compiles", not "the tests pass",
not "it looks right in the preview".

For multi-step work, state the plan as steps with their checks before starting:

```
1. [Step] → verify: [gate or command]
2. [Step] → verify: [gate or command]
```

**The traps this guards, in this repo:**

- **`tsc` passing is not the bundle passing.** The workspace-lib import case has
  broken a build that typechecked clean. `build:api` and `build:web` are separate
  gates for this reason.
- **A green gate only proves what it measures.** `contrast` reads the token
  palette and never opens a browser — it reported 99/99 while the rendered Clerk
  CTA had no background at all, because Clerk injects an unlayered stylesheet that
  outranks every Tailwind layer. Before citing a green gate as evidence about a
  rendered surface, confirm the gate reaches that surface.
- **An intermittent gate is not yet a gate.** If something fails one run in three,
  narrow it to which check fails before changing anything. Adding retries hides
  the cause and is how a gate becomes noise people learn to ignore.
- **Some gates need a running server.** `verify:sizing` and `verify:auth-surface`
  drive a real browser against a preview build. Read `AGENTS.md §2` for the
  prerequisites before running them, or you will get `ERR_CONNECTION_REFUSED`
  rather than a useful message.
- **CI fails on a dirty tree.** After `pnpm run verify`, `git status --porcelain`
  must be empty. Codegen rewrites `lib/api-client-react` and `lib/api-zod` output
  by design, so a hand-edit to a generated file fails the build.

## 5. Reproduce before you fix

Write the failing test first. If it passes, the bug is not what was reported —
find out what is before changing anything.

**The trap this guards:** in a tenant-isolated system, "it returns the wrong
data" has a short list of causes — the handler queries outside `runWithRls`, it
wraps `runWithRls` but drops the application-level `where user_id = ?`, or the
RLS policy does not exist (and RLS-with-no-policy denies everything). The failing
test tells you which. Guessing edits the wrong layer and leaves the bug in place.

---

**These guidelines are working if:** diffs stay small and traceable to the request,
clarifying questions land before implementation rather than after a wrong turn,
and the reasons above can be quoted back to you when someone proposes widening a
change.