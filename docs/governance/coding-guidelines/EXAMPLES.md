# Worked Examples

Before/after pairs for the rules in [GUIDELINES.md](GUIDELINES.md). Every "wrong"
version below is plausible, compiles, and would pass review — which is the point.

Section numbers refer to `AGENTS.md`.

---

## 1. Read before you write

### The request: "Add a bulk-edit tasks endpoint"

**What goes wrong**

```ts
router.post("/tasks/bulk", requireAuth, async (req, res) => {
  const { ids, patch } = req.body as { ids: string[]; patch: Partial<Task> };
  await db.update(tasks).set(patch).where(inArray(tasks.id, ids));
  res.json({ updated: ids.length });
});
```

It compiles. It passes review if the reviewer is not holding the RLS rule in
their head. It is a cross-tenant data leak:

- `db` is the owner-level pool. It bypasses RLS on its own — that is why
  `runWithRls` exists (`AGENTS.md §4.1`).
- No `user_id` predicate, which `AGENTS.md §4.1` calls load-bearing.
- No confirmation above 10 tasks (`AGENTS.md §5`).
- Applies `patch` blindly, including to fixed/immovable calendar events
  (`AGENTS.md §5`, Always Do 2).
- Changes 400 rows and tells nobody.

**What happens instead**

```
Four things need answers before any code:

1. RLS      — runs inside `runWithRls`, like every other route?
2. Cap      — over 10 tasks needs explicit confirmation (`AGENTS.md §5`).
              Return 409 with a count, or require `confirmed: true`?
3. Fixed    — skip fixed calendar blocks, or refuse the whole request?
4. Reversal — log to `agent_action_log` so undo works (`AGENTS.md §5`)?

Then: one route, inside runWithRls, capped at the existing threshold,
every changed row logged and notified.
```

### The request: "Make search faster"

**What goes wrong** — reaching for a cache, an index and a debounce hook before
establishing which "faster" is meant. Three different problems live under that
sentence, and they share almost no code:

1. **Query latency** on `/api/tasks?query=` at current data volume.
2. **A cold database path** — search is backed by the `tasks_archive_and_search`
   tsvector column; an index on the expression in the `WHERE` clause may already
   cover it, or may not.
3. **First paint, not search.** The measured LCP problem is 5993 ms on `/`
   against a 2500 ms threshold, and 55.8% of first-load transfer is Clerk. If
   "search" meant *the app feels slow to open*, none of the first two apply.

Asking which one costs one message and saves an afternoon.

---

## 2. Build the smallest thing that is correct

### The request: "Compute the next reschedule proposal"

**What goes wrong**

```ts
interface RescheduleStrategy {
  readonly id: string;
  propose(ctx: RescheduleContext): Proposal | null;
}
class FixedIntervalStrategy implements RescheduleStrategy { /* ... */ }
class WorkingHoursStrategy implements RescheduleStrategy { /* ... */ }
class MemoryMultiplierStrategy implements RescheduleStrategy { /* ... */ }

class RescheduleEngine {
  constructor(
    private readonly strategies: RescheduleStrategy[],
    private readonly config: RescheduleConfig,
  ) {}
  run(ctx: RescheduleContext): Proposal[] {
    return this.strategies.map((s) => s.propose(ctx)).filter(Boolean);
  }
}
```

Three strategies, a DI container and ~80 lines of setup to produce at most **one**
proposal per task. `AGENTS.md §6` fixes the cap at 5 moves; there is no second
strategy on the roadmap.

**What happens instead**

```ts
export function nextProposal(task: Task, ctx: RescheduleContext): Proposal | null {
  if (ctx.autoMoveCountFor(task.id) >= RESCHEDULE_CAP) return null;
  const slot = nextSlotInWorkingHours(ctx.settings, task.estimatedMinutes);
  return slot ? { taskId: task.id, from: task.scheduledAt, to: slot } : null;
}
```

Add the strategy interface on the day a second strategy exists.

### The request: "Send a Telegram notification when a task is rescheduled"

**What goes wrong** — building a notification platform: a `Channel` interface, a
registry, a WebPush channel, an email-digest channel, per-channel retry policy,
per-user preferences, a dispatcher.

`spec/integrations-and-apis.md §4` already decided this: **Telegram primary, Web
Push secondary, email digest fallback**. Nobody asked for a registry.

**What happens instead** — one function that calls the Telegram Bot API. The other
two channels get added when they are actually wired, not as a framework for them.

---

## 3. Touch only what the request touches

### The request: "Fix the broken min-height in the calendar rows"

**What goes wrong**

```diff
-            className="min-h-[40px] flex items-center"
+            className="min-h-size-control-md flex items-center gap-2 rounded-lg"
+            // (applied across all 47 call sites, reformatted the surrounding
+            //  JSX, updated 6 snapshots)
```

`min-h-size-control-md` is a **dead class**. It passes `typecheck`, passes
`lint:tokens`, and `build:web` succeeds — while producing no CSS at all, so
min-height silently falls back to `auto`. This is the exact failure documented in
`AGENTS.md §4.3`, and it shipped once.

**What happens instead** — the verification is the deliverable, not the migration:

1. Confirm the failure mode in the **built CSS**, not in the source.
   → `pnpm run verify:no-dead-classes`
2. Confirm the fix emits before touching a single call site.
   → `pnpm run verify:sizing` (needs `vite preview` on :4173 and
   `pnpm run verify:install` for Chromium, or it exits on `ERR_CONNECTION_REFUSED`)
3. Report: *N call sites across M files are affected; the fix is an `@utility`
   rule in `index.css`. Migrating them is a separate, owner-approved change.*

**A build that succeeds is not evidence that a class works.**

### The request: "Add error handling to the focus timer"

**What goes wrong**

```diff
-      setTimeout(end, ms);
+      // Wrap the timer callback so a thrown error is logged.
+      window.setTimeout(() => {
+        end();
+      }, ms);
+      /* meanwhile: double quotes throughout the file, JSDoc added to three
+         untouched functions, Prettier run over the whole component */
```

**What happens instead** — the two-line change, matching existing style, with no
type hints and no reformat. If `shadcn add` runs later, remember it regenerates
`components/ui/` and silently restores raw literals (`AGENTS.md §4.3`).

---

## 4. Name the gate, then loop until it is green

### The request: "Improve performance"

**What goes wrong**

```
I'll improve performance by:
1. Reviewing the code
2. Identifying issues
3. Making improvements
4. Testing the changes

[Proceeds to make changes]
```

**What happens instead** — attach a number and an instrument first:

```
Known, measured:
  LCP  5993 ms [5896-5999] on /          (threshold 2500 ms) — a real 2.4x breach
  LCP  5943 ms [5884-5962] on /sign-in
  CLS  0.000 on every route
  INP  not measurable in navigation mode — report n/a, never as a pass

Bottleneck already identified: Clerk is 359.3 kB = 55.8% of first-load transfer.
Removing the CDN fonts (291.1 kB) was real, and was under half the problem.
Moving Clerk behind a dynamic boundary is the largest measured lever and is an
OWNER DECISION — it changes when `user` is available in every e2e spec.

Plan:
1. Add a local auth bypass → verify: / renders without Clerk
2. Re-measure              → verify: pnpm run verify:cwv shows the delta
3. Stop and present numbers → verify: owner decides whether to ship step 1
```

### The trap: a gate that passes and still ships

The `/sign-in` CTA was styled with a Tailwind class on a Clerk element:

```ts
// contrast reports 99/99 green and lint:tokens is clean, so this must be fine.
formButtonPrimary: `bg-accent ${txtFg} font-bold hover:brightness-110 shadow-md`,
```

It was not fine. Clerk injects its stylesheet at runtime as an **unlayered**
constructable sheet, which outranks every Tailwind layer regardless of source
order. The class compiled, emitted, and then lost: the CTA rendered at
`rgba(0,0,0,0)` — no button at all — and the Google label sat at **1.22:1**.
`contrast` reported 99/99 the entire time, because it measures the token palette
and never opens a browser.

**What happens instead** — colour goes in a Clerk **style object**, which Clerk
compiles into its own stylesheet, so it always applies:

```ts
formButtonPrimary: {
  borderRadius: 'var(--radius-control)',
  minHeight: tap,
  backgroundColor: 'hsl(var(--primary))',
  color: 'hsl(var(--primary-foreground))',
  fontWeight: '700',
},
```

Then verify against what actually renders: `pnpm run verify:auth-surface`.

**A green gate proves the thing it measures, and nothing beyond it.**

### The trap: an intermittent gate is not yet a gate

`verify:auth-surface` was failing roughly 1 run in 3.

**What goes wrong** — "just give it more retries": bump 2 attempts to 5 and the
timeout 20s to 30s. That hides the cause, and it makes the per-page worst case
large enough to start eating the CI job's 15-minute timeout.

**What actually happened** — the bug was in the probe. Playwright's
`browser.newPage()` is a convenience that creates a **new BrowserContext on every
call**, and a new context starts with an empty HTTP cache. The probe opened 8
measured pages plus a warm-up, so it made **9 cold fetches** of Clerk's ~359 kB
browser bundle in a row, against a Clerk dev instance with strict usage limits.
Verified directly: `browser.newPage()` called 3 times returns 3 distinct contexts.

**What happens instead** — share one context, keep separate pages:

```js
const context = await browser.newContext();          // once
const page = await context.newPage();                // per run
await page.setViewportSize({ width, height });
```

Cold third-party loads: **9 → 2**. Every assertion, threshold and the fail-closed
budget stay exactly as they were. Measurements are unaffected — each page still
gets its own `addInitScript` (which re-sets the theme on that page's own load, so
nothing leaks between runs) and its own viewport. Only the network cache is
shared, which was the point.

**Intermittent results are usually a bug in the probe, not flakiness in the thing
being measured.** Narrow to which check fails, then fix that check.

---

## 5. Reproduce before you fix

### The report: "RLS isn't isolating users in the reminders path"

**What goes wrong** — immediately adding a `user_id` filter and calling it done.

**What happens instead**

```
1. Write the failing test first.
   Verify: two accounts, same reminder id, second account gets 404.
   Verify: run it — it must FAIL. If it passes, the bug is not what was reported.

2. Then locate the cause. Three candidates, in order:
   - the handler queries outside `runWithRls` (owner-level pool bypasses RLS)
   - it wraps `runWithRls` but drops the app-layer `where user_id = ?`
   - the RLS policy does not exist, and RLS-with-no-policy denies everything

3. Fix one, re-run.
   Verify: test passes AND the full suite still passes.

Do not change rls.ts until step 2 names it.
```

---

## Summary

| Rule | What goes wrong | What happens instead |
|---|---|---|
| Read before you write | Endpoint that silently bypasses RLS | Name the assumptions, read the existing `runWithRls` wrapper, ask |
| Read before you write | One reading of "faster" picked silently | Present the readings with the number each is measured against |
| Smallest correct thing | Strategy pattern for one strategy | One exported function; refactor when a second case exists |
| Smallest correct thing | Notification platform nobody asked for | Telegram only, per `spec/integrations-and-apis.md §4` |
| Touch only the request | 47 call sites migrated during a one-row fix | Verify in built CSS, report the scope, let the owner approve |
| Touch only the request | Prettier + type hints during a bug fix | Match existing style |
| Name the gate | "I'll review and improve the code" | Name the metric, name the gate, define pass |
| Name the gate | Citing a green gate about a rendered surface | `contrast` measured the palette, not the cascade — `verify:auth-surface` opens the browser |
| Name the gate | Retrying an intermittent gate | Narrow to which check fails, then fix that check |
| Reproduce first | Fix without a failing test | Failing test first, then locate the cause |