# Zero-Trust Audit Prompt (for OpenCode)

**How to use this file:** two options. (1) Paste everything below the divider as your first message in an `opencode` session in the repo root. (2) Better — save it as `AGENTS.md` in the repo root first. OpenCode automatically reads `AGENTS.md` for project instructions on every session, so this becomes a standing rule instead of a one-off ask, and any future OpenCode session in this repo inherits the zero-trust posture by default.

**Before running this:** drop `01-idea-research-and-spec.md`, `02-implementation-plan.md`, `03-master-build-prompt-for-replit.md`, and `04-critical-gaps-research.md` into the repo under a `spec/` folder — the prompt below treats those as the source of truth to audit against. If they're not there, the agent is instructed to stop and ask rather than guess at what "correct" means.

**What this pass does NOT do:** it does not add features and does not fix bugs. It only verifies and reports. Fixing comes after you've read the report — same staged approach as the rest of this project.

---

=== COPY BELOW THIS LINE (or save as AGENTS.md) ===

You are auditing an existing codebase, not building one right now. Your mandate for this session is **verification only** — do not add features, do not refactor, do not "helpfully" fix anything you find broken. Produce a report. Nothing else changes.

## The one rule that matters: zero trust

Treat every existing status claim in this repo as an **unverified hypothesis**, including:
- Everything in `PROGRESS.md`
- Everything in `AUDIT.md`
- Any prior AI agent's own summary of what it built (including whatever a previous Replit Agent session reported as done — that includes any claim about a "timezone-safe" fix or similar recent work; verify it, don't take the changelog's word for it)

None of the above counts as evidence on its own. Evidence means: you opened the actual file, read the actual logic, checked the actual schema, or ran an actual (read-only) command and saw the actual result. If you can't produce that evidence for a claim, the claim is **unverified**, not confirmed — say so plainly, don't round up.

## Source of truth

Read `spec/01-idea-research-and-spec.md`, `spec/02-implementation-plan.md`, and `spec/04-critical-gaps-research.md` in full before auditing anything. These define what "correct" and "done" actually mean for this project — feature list, data model, the reschedule algorithm's exact rules, the notification architecture, the agent/memory design, and the five specific risks flagged in doc 4 (build-time paradox, no monitoring/kill-switch, no parallel-run plan, no paper-import path, cost ceiling + timezone gap).

**If those files aren't in the repo, stop here and tell me instead of guessing what the spec says.**

## What to actually check, module by module

Go through every phase/module from `02-implementation-plan.md` §2–13. For each one:

1. **Read `PROGRESS.md`'s claimed status for this module.**
2. **Independently verify it:**
   - Open the actual files implementing it. Is the logic real, or is there mock/hardcoded/stubbed data pretending to be a working feature? (Specifically look for: functions that return a fixed sample object instead of querying Supabase; UI buttons wired to `console.log` or a TODO instead of a real call; "Coming soon" placeholders counted as done in `PROGRESS.md`.)
   - Check the database: does the actual Supabase schema match §8 of doc 1? Note any missing tables, missing columns, or columns present in code but absent in the schema (or vice versa).
   - Check Row-Level Security: is RLS actually enabled and correctly scoped by `user_id` on every table that should have it? This is a security-critical item — verify it directly against the Supabase schema/policies, don't infer it from the code alone.
   - Check secrets: grep for anything that looks like a hardcoded API key, token, or connection string that should be in Secrets/env vars instead.
   - If the module involves the reschedule engine, check it against **every individual rule in doc 1 §9** (never touch fixed events; respect working/quiet hours; priority-weighted placement; cap of 3 auto-moves; automation-mode dial respected; always logs + notifies, never silent; batched not instant). Report pass/fail per rule, not as one blob.
   - If the module involves reminders/notifications, check whether `pg_cron` jobs actually exist and are scheduled (query `cron.job` if you have DB access), not just whether the Edge Function code exists. A function that's never scheduled is not a working reminder system.
   - If the module involves the agent/memory system, check whether `pgvector` is actually enabled and whether `memory_facts`/`memory_embeddings` are actually written to by real conversations, or whether the tables exist but nothing populates them.
3. **Specifically cross-check the five risks from doc 4** — for each, state directly whether it's been addressed, partially addressed, or not addressed at all, with evidence:
   - Is there an IANA timezone field on `users`, separate from `working_hours`/`quiet_hours`, and is it actually used when evaluating those fields? (This is the one to check hardest — a prior session claimed timezone-related fixes; verify exactly what was fixed and whether it covers the travel scenario in doc 4 §5b, not just the DST unit test.)
   - Is there any heartbeat/dead-man's-switch check on the cron jobs, or a manual "pause all automation" kill switch? (Very likely: no. Say so plainly if so — this was flagged as unbuilt.)
   - Is there any defined parallel-run/rollout logic, or is launch still all-or-nothing?
   - Is there any capture path for importing existing paper notes (photo → draft tasks)? (Very likely: no — say so.)
   - Is there any cost/spend tracking on the LLM API usage?

## What you can't verify from code alone

Be honest about this category instead of assuming pass: things like "does a Telegram reminder actually arrive," "does push notification actually fire on a real iPhone," "does the reschedule sweep behave correctly when it actually runs on a live cron schedule" can't be confirmed by reading code. For each, mark it **"Unverified — needs a manual test"** and state exactly what manual test would confirm it (e.g., "create a task due in 2 minutes with a linked Telegram account, and confirm the message arrives").

## Output — produce this as a new file, `VERIFICATION_REPORT.md`

**Do not overwrite `AUDIT.md` or `PROGRESS.md`** — this is a separate, dated report so the before/after is comparable. Structure it as:

1. **One-paragraph summary** — overall state, in plain terms: is this closer to "mostly real, a few gaps" or "mostly scaffolding, treat prior progress claims skeptically"?
2. **Module-by-module table:** `Module | Self-reported status | Verified status | Evidence | Confidence (High/Medium/Low/Unverifiable) | Gap or risk found`
3. **The five doc-4 risks, addressed directly** as their own short section, per the checklist above.
4. **A prioritized punch list** — what should be fixed or verified manually *before* any new feature work resumes, ordered by severity (security/data-integrity issues first, silent-automation-failure risks second, everything else after).

## Stop condition

When the report is complete, stop. Don't start fixing anything, don't continue into new phases. I'll review `VERIFICATION_REPORT.md` and decide what happens next.

=== END OF PROMPT ===
