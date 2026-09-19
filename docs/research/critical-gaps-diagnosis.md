# Cadence — Critical Gaps Diagnosis & Integrations Research

> **Doc type:** Research paper. Human-facing. Preserved for historical context and problem framing.  
> **Distilled from:** `docs/archive/04-critical-gaps-research.md` and `docs/archive/08-integrations-and-solutions-research.md`.  
> The solutions described here have been implemented or superseded by the architecture decisions in `spec/locked-decisions.md`.

---

## Part 1 — The 5 Critical Failure Modes (Diagnosis)

These were diagnosed before the post-audit architecture decision. Each represents a documented, common failure mode in personal automation tools. Status as of 2026-09-19 is noted.

### Problem 1 — The Build-Time Paradox

**Problem:** The plan was large (9 build phases). If building it competed with hackathons and coursework, the risk wasn't "the app has a bug" — it was "the app sits at 60% done for a month while paper wins by default."

Research backing: average professional tries 3–5 productivity apps over two years, abandons each within weeks. "Hot/cold" motivation gap — planning happens in a motivated "cold" state, execution in a depleted "hot" state.

**Status:** Addressed via hard scope rule — "smallest usable slice this week" before touching Tier-2/3 features. The Friday-slice target was defined in `docs/archive/09-end-to-end-gaps-and-solutions.md #1`.

---

### Problem 2 — No Monitoring on the Automation (Dead Man's Switch)

**Problem:** The entire value of auto-reschedule + reminders is "it catches what I miss." But nothing was watching *it*. A silent `pg_cron` failure produces no traffic, no error, no symptom — discovered downstream only when a user misses something real.

Research backing: a standard failure class in scheduled-job systems; documented 3-week silent failure cases discovered by customers, not by ops.

**Status:** Resolved. Healthchecks.io dead-man's-switch wired on every cron job. Telegram-native alerting (same bot). `automation_flags` table is the manual kill switch. See `spec/integrations-and-apis.md §8`.

---

### Problem 3 — No Parallel-Run Period

**Problem:** The plan said "run it for real for two weeks" as a post-launch step, with no defined point at which paper was still the safety net.

Research backing: big-bang cutovers (drop old system on a fixed date) succeed only 10–25% of the time in migration research; parallel/gradual approaches succeed far more reliably.

**Status:** Resolved as a hard rule. See `spec/locked-decisions.md D-28`. Paper stays primary until: 2 weeks pass, OR 7 consecutive days where every paper item also appears correctly in Cadence — whichever is longer. Any real missed deadline resets the clock.

---

### Problem 4 — No Path for the Existing Paper Backlog

**Problem:** Nothing in the original plan imported the existing paper tracker. Day one would have two unsynced systems.

Research backing: Rocketbook (dedicated handwriting-to-digital product) users report ~50% OCR error rates on handwriting with personal shorthand. Classic glyph-matching OCR fails exactly on the kind of mixed handwriting, symbols, and abbreviations in personal trackers.

**Status:** Designed but not built yet. Solution: Claude Vision API (multimodal) reads the photo contextually (as a person would), produces draft tasks with per-item confidence flags, surfaces in a confirm-before-save queue. Never auto-filed. See `spec/system-requirements.md §2 Tier 3`.

---

### Problem 5a — No Cost Ceiling Tracked

**Problem:** LLM API spend was flagged as an open question in the original spec but never closed.

**Status:** Resolved. Self-built: `llm_usage` table logs tokens + estimated cost per call. `pg_cron` job sends Telegram alert if trailing-30-day total approaches the ceiling. Ceiling: ~₹400/month. No Helicone/LangSmith at this scale. See `spec/locked-decisions.md D-08` and `spec/agent-and-memory-subsystem.md §1`.

---

### Problem 5b — No IANA Timezone Field (Live Bug)

**Problem:** `working_hours` and `quiet_hours` stored without an explicit IANA timezone column — a textbook scheduling bug. Recurring wall-clock rules must be evaluated in the user's local IANA timezone, not baked into UTC.

Concrete failure: at a hackathon in a different timezone, the quiet-hours window silently inverts — the app goes silent during actual working hours and starts pinging at 3am local time.

**Status:** Resolved. `notification_settings.timezone` (IANA string, default `Asia/Kolkata`) added. Home timezone locked at `Asia/Kolkata` per owner preference. See `spec/locked-decisions.md D-01`.

---

## Part 2 — Full Integration Map (Researched Choices)

| Category | Service | Why this one | Status |
|---|---|---|---|
| Core backend | Supabase Postgres | RLS, `pg_cron`, `pgvector`, Storage in one bundle | ✅ Live |
| Auth | Clerk | Already built; official Supabase RLS integration | ✅ Live |
| Reminders primary | Telegram Bot API | Free, cross-platform, two-way commands, Healthchecks-native alerting | ✅ Backend done |
| Reminders secondary | Web Push / VAPID | Native to PWA; Android strong, iOS with caveats | ✅ Wired |
| Reminders fallback | Resend / SendGrid | Email digests, weekly summaries | Pending |
| LLM gateway | LiteLLM → NVIDIA NIM → Groq → HF | Free-tier-first; single call shape + automatic fallback | ⚠️ In progress |
| Automation heartbeat | Healthchecks.io | Purpose-built for missed-cron detection; free; Telegram-native | ✅ Wired |
| Error monitoring | Sentry | Runtime exception capture — the other half of "nothing watching the automation" | ✅ Wired |
| Paper import | Claude Vision API | Contextual reading, not glyph-matching OCR; same LLM already integrated | 🔜 Deferred (Tier 3) |
| Source control + CI | GitHub + GitHub Actions | Cross-platform typecheck on Linux; sidesteps Windows `preinstall` issue | ✅ Live |

---

## Part 3 — What NOT to Add

These are explicitly deferred. Not because they aren't useful — because they solve problems that don't exist yet at single-user scale, and adding them now adds maintenance overhead without payoff.

| Deferred | Reason |
|---|---|
| Helicone / LangSmith | `llm_usage` table covers the needed spend tracking; revisit only if it becomes insufficient |
| Dedicated OCR vendor (Google Vision, AWS Textract) | Claude Vision covers the paper-import use case at no extra cost |
| Google Calendar two-way sync | Complex OAuth + sync edge cases; `time_blocks` covers internal calendar; revisit when manual friction is felt |
| Payments / billing integration | No monetization at this stage |
