# End-to-End Gaps & Solutions — What's Still Missing

**Different from doc 4:** doc 4 covered 5 specific risks, now resolved/queued in docs 7–8. This pass looks at the *whole* application fresh — product, technical, and process — and gives each gap a solution immediately, plus a few genuinely new ideas, not just diagnosis.

---

## 0. "We, you, and I" — the honest version first

**What I (Claude) am missing:** everything past `VERIFICATION_REPORT-2026-09-11.md`. I have no live access to the repo — I only know what that one audit captured. If you've had OpenCode/Replit build anything since, my read of "current state" is already stale in the same way `PROGRESS.md` was stale before the audit. None of the solutions below have been checked against your actual live code — treat them as researched proposals, same trust level the audit taught you to apply to any status claim.

**What you're likely missing:** the thing every solo builder misses — you're close enough to this that "it mostly works on my machine" quietly substitutes for "I verified it," the same gap the audit just caught once already (Calendar/Focus/CRUD were all mis-stated in `PROGRESS.md`, in both directions).

**What we're both missing — the actual meta-gap:** there's no standing process that catches doc-vs-reality drift *again*. The audit was a one-time event. Without a re-audit cadence, `PROGRESS.md` will quietly drift stale a second time, and nobody will catch it until you happen to ask. Solution: re-run `06-opencode-zero-trust-audit-prompt.md` (or a shortened version of it) **weekly during active build weeks**, not once. Put it on the same cadence as the parallel-run trial in doc 4 §3 so it's one habit, not two.

---

## 1. Gaps, with solutions — prioritized

### 🔴 Do now (cheap, and wrong-by-default if skipped)

**1. The "ship this week" slice was never actually defined.** Doc 4 named the build-time paradox; doc 8 said "define the smallest usable slice" as the fix — but never landed on an actual answer. Defining it now: **by end of this week**, the bar is *signed-in Today view + typed quick-add + one real Telegram reminder firing for one real deadline you actually have* — nothing else. Not Rounds polish, not Calendar drag-drop, not the agent. If that's not true by Friday, the fix is cutting further, not working the weekend.

**2. Agent actions have no undo, and no confirmation gate for destructive ones.** The reschedule *engine* has caps and logging (doc 1 §9), but the conversational *agent* (§9 of doc 2) doesn't yet — "push everything low-priority to next week" could misfire and there's no clean way back. Solution: every agent action writes to a small `agent_action_log` with enough data to reverse it, exposed as one command in both surfaces — "undo last agent action" — and anything touching more than 10 tasks at once requires an explicit yes/confirm before executing, not after.

**3. Status colors fail for colorblind users.** Doc 3's palette leans on orange/green/red to carry meaning (energy/success/urgent) — red-green colorblindness affects roughly 1 in 12 men, and that exact pairing is the classic failure case. This is a real accessibility miss, not a nitpick — Apple's own HIG explicitly says never communicate through color alone. Solution: pair every status color with a shape/icon too (a checkmark for done, an exclamation for urgent, a clock for scheduled) so meaning survives without color vision — cheap to build in from the start, expensive to retrofit later.

**4. No backup for real data, only "export."** Doc 2 §12's data export is user-initiated, not automatic — fine for "I want a copy," not a real disaster-recovery plan. Checked current specifics: Supabase's **free tier has no restorable managed backup**, and the paid Point-in-Time-Recovery add-on runs **~$100/month** — not worth it at your stage. Better solution, reusing pieces you already have instead of adding a new service: a weekly **GitHub Actions** job (already recommended in doc 8 for CI) runs `pg_dump`, and sends the resulting file to you as a **Telegram** document (same bot, same integration) — zero new services, and the backup literally lands in the same place your reminders do.

**5. Three coding tools, three different "read this for context" conventions, nothing unifies them.** OpenCode reads `AGENTS.md` automatically; Replit and Antigravity don't share that convention. Solution: keep `AGENTS.md` as the canonical file, and add one line to `README.md` pointing any tool/human at it — cheap, and it means switching editors again (which you've already done once) doesn't mean re-explaining the project.

### 🟡 Do soon (matters within the first real month of daily use, not this week)

**6. No offline handling at all.** You're building this partly *for* hackathon conditions, where wifi is unreliable — but a PWA with no offline strategy just breaks the moment connectivity drops, at exactly the moment you're most likely to need to jot something down. Solution: cache reads and queue writes locally (a service-worker cache layer + the browser's Background Sync API, or a small local-first library like Dexie.js over IndexedDB) so quick-add still works offline and syncs the moment you're back online. Not needed for the Friday slice in #1 — needed before you trust this at an actual event.

**7. No search, and no archive.** Neither exists anywhere in docs 1–3. Fine today with a handful of tasks; won't be fine after a few months of daily use. Solution: Postgres's built-in full-text search (`tsvector`/`to_tsvector`) is enough at this scale — no need for a separate search service. Pair with a simple archive: completed tasks older than N days get an `archived` flag and drop out of default views (still fully queryable, just not cluttering Today/Calendar).

**8. Missing a proper migration-safety habit as the schema keeps changing.** You'll be altering tables constantly over the next few months (16 tables from doc 1 §8, only 2 exist today). Checked current pricing: Supabase **branching** for a scratch test-environment costs about **$0.32/branch/day** (~$10/month if you forget to close one) — cheap if you remember to close the branch after testing a migration, a real leak if you don't. Solution: use it, but set a personal rule to close every test branch the same day you open it, and note that in the branch name/description so it's obvious later if one's been left running.

**9. Missing the-app-comes-back-after-days-away experience.** Realistic during a hackathon crunch: you don't open Cadence for 3 days. Does it fire every individually-missed reminder at once on reopen — a wall of pings that trains you to ignore notifications? Solution: a "catch-up" check — if more than N reminders are pending on open, batch them into **one** summary message instead of replaying each individually.

### 🟢 Genuinely fine to defer (new ideas worth having on a list, not worth building yet)

**10. Streak-breaking — decided, not building this.** Considered a "streak freeze" grace-day mechanic (the Duolingo-style fix for this exact problem elsewhere) — you said keep streaks strict, so a missed day resets it, full stop. Nothing to build here; noted so it doesn't get re-proposed later as if it were still an open question.

**11. Zero-friction capture beyond typing.** A native iOS Shortcuts / Android quick-tile integration ("Hey Siri, add a task to Cadence") would be the actual fastest possible capture path, faster than opening the PWA at all — genuinely Apple-flavored idea fitting doc 3's design language. Nice, not necessary; typed quick-add already clears the "as fast as paper" bar from doc 1 §7.

**12. Google Calendar two-way sync.** Already flagged as optional-future in doc 8 — repeating it here only to confirm it's still correctly deferred, not a new miss.

---

## 2. This week's actual checklist (pulling 🔴 items together)

- [ ] Ship the slice defined in #1 — nothing more
- [ ] Add the agent undo-log + confirm-before-bulk-action pattern (#2) before the agent module (doc 2 §9) starts, not after
- [ ] Swap status-color-only indicators for color+icon pairs (#3) while the Design tab work is still in progress — cheapest moment to fix it
- [ ] Stand up the weekly `pg_dump` → Telegram backup (#4) — 30 minutes, reuses two integrations you already have
- [ ] Add the `AGENTS.md` pointer to `README.md` (#5)
- [ ] Put the re-audit cadence (§0) on the calendar — weekly during active build weeks

Everything in 🟡 and 🟢 stays exactly where it is — on the list, correctly not urgent, per the same build-time-paradox lesson doc 4 already taught us not to ignore twice.
