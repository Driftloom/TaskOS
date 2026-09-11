# Critical Gaps & Risks — Research Paper

**Pairs with:** `01-idea-research-and-spec.md`, `02-implementation-plan.md`, `03-master-build-prompt-for-replit.md`
**Status:** Diagnosis only. **Nothing in docs 1–3 has been changed.** This is the "problems clearly stated, with evidence" doc you asked for — fixes go in later, once you've read this and decided what to actually change.

---

## Why these five, specifically

These aren't hypothetical "best practice" nitpicks — each one is a documented, common failure mode in the exact category of thing we're building (personal automation tools, cron-driven background systems, system migrations, handwriting digitization, multi-tenant cost/timezone handling), and I checked each one against what's actually in docs 1–3 to confirm it's a real, currently-open gap, not something already covered.

---

## Problem 1 — The build-time paradox: this could cost you more time than paper ever did

**The problem, plainly:** you need Cadence *because* you're time-crunched. The plan we wrote is genuinely large — 9 build phases in doc 2, each with its own research/plan/build/test cycle. If building it eats into the same hours as MLSS prep, hackathons, and coursework, you can end up worse off than when you started: less time for the actual work, and a half-built app that's neither helping nor finished.

**The evidence this isn't just caution-for-its-own-sake:**
- Research on personal productivity tooling finds the average professional tries **3 to 5 productivity apps over two years and abandons each one within weeks** — and the recurring reason isn't laziness, it's that the tool created *more* upkeep work than it removed.
- A widely-cited framing from behavioral economics: you design and commit to systems in a "cold," motivated state (Sunday evening, planning) but you actually *use* them in a "hot," depleted state (Tuesday 11pm, mid-deadline) — and your motivated self systematically can't predict how little energy your tired self will have. This is exactly the gap between "I'll debug the `pg_cron` job this weekend" and "it's 1am before a submission and Telegram didn't fire."
- Personal productivity systems specifically (as opposed to team tools) have been described as needing **constant re-architecture, not just new features** — a system that's "always almost right, one more table away from working" is a well-documented trap for exactly this kind of self-built tool.

**Concrete example, using your own numbers:** doc 2's Tier-1 MVP alone (Phases 0–2: auth, capture, calendar, CRUD) is realistically several evenings of real work even moving fast. If that competes with hackathon crunch weeks, the honest risk isn't "the app has a bug" — it's "the app sits at 60% done for a month while paper (which already works today) quietly wins by default."

**What this means, unresolved:** doc 2 has no defined "smallest possible version that's actually usable this week" — it assumes you build in the given phase order before getting real value out of any of it.

---

## Problem 2 — Nothing watches the automation itself (silent failure risk)

**The problem, plainly:** the entire value proposition of auto-reschedule + reminders is "it catches what I miss." But nothing in the current plan catches *it* missing. If the `pg_cron` reminder-dispatcher or reschedule-sweep silently stops running — a bad Edge Function deploy, a Supabase project pause, a schema migration that breaks a query — you get no reminders and nothing reschedules, and you don't find out until you miss something real. That's strictly worse than paper, because paper never "silently stops working" — it just sits there, unglamorous but honest.

**The evidence this is a known, named failure class, not a hypothetical:** this exact pattern has a standard name in software engineering — a **"dead man's switch"** (or heartbeat monitor): a scheduled job is expected to "check in" on a fixed cadence, and *the absence of a check-in* is what triggers the alert, rather than waiting for an error. The whole reason this pattern exists is that scheduled jobs fail differently from normal services — they produce no traffic, no error, no symptom. One documented real-world case: a company's automated Monday-morning report jobs silently stopped for **three weeks** before anyone noticed — discovered only when a customer asked why a number looked stale, i.e., discovered downstream, by someone relying on the output, exactly like you'd discover a missed hackathon deadline.

**Concrete example, applied to Cadence:** say a Supabase migration during Phase 6 accidentally breaks the reminder-dispatcher's query. It fails silently. You have zero reminders for four days. You don't know, because there's no mechanism telling you "the thing that's supposed to run every 10 minutes hasn't run in 4 hours." The first signal you get is a missed deadline — the exact outcome the whole system exists to prevent.

**What this means, unresolved:** neither doc 2's testing checklist nor doc 3's operating protocol includes a heartbeat check on the cron jobs themselves, or a manual "pause all automation" kill switch for when something's clearly misbehaving (e.g., the reschedule engine starts moving things wrong). Both are cheap to add and currently absent.

---

## Problem 3 — No parallel-run period; paper gets dropped too early

**The problem, plainly:** the plan (doc 2 §18) says "run it for real for two weeks" — but that's framed as something that happens *after* full launch, with no defined point at which paper is still your safety net vs. fully retired, and no rule for what triggers falling back to paper if week one of full-auto reveals a scheduling bug.

**The evidence this is a well-studied risk in any old-system-to-new-system transition:** in system migration research, **61% of migration projects overrun their planned timeline by 40–100%**, and the single most common cause cited isn't technical complexity — it's choosing a "big-bang" cutover over a gradual, parallel one. Big-bang cutovers (drop the old system, switch to the new one on a fixed date) succeed only **10–25% of the time** in the literature; running old and new side-by-side for a defined window is reported by **79% of developers surveyed** as meaningfully reducing project risk. The core reason: a big-bang cutover concentrates *all* the risk into one moment and assumes that moment goes perfectly. It never does.

**Concrete example, applied to you specifically:** picture week one after "launch" — you're at a hackathon, phone reception is bad, the Telegram bot's webhook happens to be down (Problem 2), and you already stopped carrying the paper tracker because the app "launched." That's the single worst moment for the safety net to be missing — mid-event, away from your normal setup, exactly when things go sideways.

**What this means, unresolved:** there's no explicit rule anywhere in docs 1–3 for "paper and Cadence run together until X criteria are met," and no defined fallback behavior for "what do I do if Cadence clearly fails me during the trial period."

---

## Problem 4 — No path in for your existing paper backlog

**The problem, plainly:** you have (per the photo you sent) what's presumably years of pages like that one — hackathon deadlines, tracker rows, personal shorthand, symbols, strikethroughs. Nothing in the current plan imports any of it. Day one, you'd have two unsynced systems: the paper archive and a brand-new empty app — which recreates the exact fragmentation problem Cadence exists to solve.

**The evidence this is a known-hard problem, not a small feature:** the closest real-world precedent is **Rocketbook**, a physical notebook whose entire product is "scan your handwriting, get digital text." It's a mature, widely-used product, and its own users report real accuracy limits with classic OCR — one representative complaint from Rocketbook's own feedback forum: handwriting recognition was described as extremely poor, with roughly **half the text misinterpreted**, making manual correction take **twice as long** as just retyping the notes from scratch. Rocketbook's own documentation says the built-in OCR struggles specifically with anything that isn't clean, print-style writing — cursive and personal shorthand are explicitly called out as weak points, which is close to what's in your photo (mixed writing styles, symbols, overlapping columns, abbreviations only you know the meaning of).

**Concrete example:** your own tracker photo — the one I read for you earlier in this conversation — is close to a worst case for classic OCR (glyph-by-glyph pattern matching): personal shorthand ("HTC," starred priority marks, strikethroughs), mixed print/cursive, and columns that don't follow a clean grid. What actually worked was a vision-capable model reading it *contextually*, the way a person would, and even then with real uncertainty flagged rather than blind confidence — which is the more realistic bar to set for an import feature, not "scan and auto-file with no review."

**What this means, unresolved:** there's no capture mode in the current spec for "photograph a paper page, get draft tasks I confirm before they're saved" — and without one, your actual backlog just never makes it into the system you're building to track it.

---

## Problem 5 — Two open-ended unknowns that were flagged, never closed: cost ceiling and travel timezones

### 5a. Cost ceiling (LLM + Supabase)

**The problem, plainly:** doc 1 §12 explicitly listed "budget for LLM API calls" as an open question and never answered it. Doc 3's operating protocol asks the agent to propose *product* metrics before Phase 3 but never asks for *cost* metrics specifically — so nothing currently tracks spend as the agent+memory layer goes from "occasional test message" to "daily driver."

**What I can tell you concretely:**
- **Supabase's free tier** (as of 2026) is genuinely workable for a single-user app — 500MB database, unlimited API requests — but it has one sharp edge: **free projects pause automatically after 7 days of no activity.** That's irrelevant for your production app (you'll use it daily), but it can silently bite a separate dev/staging Supabase project that sits idle between build sessions — worth knowing before you're confused why a test environment "stopped working." Paid tier starts at $25/month if you outgrow free.
- **Claude API pricing is genuinely a moving target right now** — multiple pricing sources from mid-to-late 2026 show different numbers and note Anthropic changed pricing/limits more than once this year. I'm not going to hand you a confident monthly-cost figure I can't stand behind; the real gap isn't "what's the exact number" but that **nothing currently checks actual spend against a ceiling you've set** — that's a five-minute addition (a monthly spend alert), not a research problem.

### 5b. Travel timezone handling — this one's already a live bug in the current spec, not a future risk

**The problem, plainly:** the `users` table in doc 1 §8 has `working_hours` and `quiet_hours` fields with no explicit IANA timezone column called out alongside them. That's not a style nitpick — it's the specific, well-documented way scheduling systems break.

**The evidence:** the standard, hard-won rule for handling time correctly is: **store the exact instant in UTC, and store the timezone as a separate IANA identifier (e.g. `Asia/Kolkata`) — never as a raw offset, because offsets silently go wrong the moment daylight saving or a political timezone change happens.** The more specific rule that applies directly here: *recurring, wall-clock rules — working hours, quiet hours — should be evaluated in the user's local IANA timezone, not baked into UTC once and left alone.*

**Concrete example, using your actual situation:** you travel for national-level hackathons (per your profile — DATASPHERE 26 was a 24-hour datathon at a different institution, for instance). Say your quiet hours are set as "11pm–7am IST." If that's stored as a plain UTC range instead of "11pm–7am, evaluated in whatever `Asia/Kolkata` currently means," then the moment you're at a hackathon in a different timezone, the reschedule engine and reminder-dispatcher keep enforcing your **home** quiet hours translated literally — which could mean it goes silent during your actual working hours at the event, and starts pinging you at what's actually 3am your current, jet-lagged time. This isn't a rare edge case for you specifically — it's close to guaranteed to happen given how you actually use hackathons.

**What this means, unresolved:** neither doc 1's schema nor doc 2's testing checklist currently calls for a dedicated IANA timezone field or a "change timezone mid-trip" test case — the DST test that's in doc 2 §5 is a good start but doesn't cover the travel scenario specifically.

---

## Summary

| # | Problem | Real-world evidence it's a known failure mode | What breaks if ignored |
|---|---|---|---|
| 1 | Build-time paradox | 3–5 apps tried & abandoned within weeks is the norm; "hot/cold" motivation gap | Cadence stays half-built, paper wins by default, net time lost |
| 2 | No monitoring on automation | Dead man's switch pattern exists specifically for this; real 3-week-silent-failure precedent | You only find out reminders stopped when you miss something real |
| 3 | No parallel-run period | Big-bang cutovers succeed 10–25% of the time vs. parallel/gradual approaches | Paper gets dropped before Cadence is proven, right when you need a fallback most |
| 4 | No paper-backlog import | Rocketbook's own users report ~50% OCR error rates on real handwriting | Your existing backlog never enters the system; day-one fragmentation |
| 5a | No cost ceiling tracked | Explicitly flagged open in doc 1, never closed | Agent+memory usage could run up a bill with no alarm |
| 5b | No IANA timezone field | Storing offsets instead of IANA zones is the textbook scheduling bug | Quiet hours / working hours invert while you're at a hackathon away from home |

---

## What this document is *not*

This is diagnosis, not a rewrite. Docs 1–3 are untouched. When you're ready, tell me which of these you want folded in (all five, or a subset) and I'll update the specific sections — schema, testing checklist, operating protocol — rather than regenerating the docs from scratch.
