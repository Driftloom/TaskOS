# Problem→Solution Research & Full Integration Map — Cadence

**Pairs with:** `04-critical-gaps-research.md` (the problems, diagnosed) and `07-post-audit-master-plan.md` (where each solution slots into the build order). This doc does two things: (1) turns each of the five doc-4 problems into an actual chosen solution, researched, not just "add monitoring" hand-waving; (2) maps every external service the whole application depends on — not just messaging connectors, all of it.

---

## Part 1 — Problem → researched solution

### Problem 1 — Build-time paradox
**Solution: a hard scope rule, not a tool.** Define "smallest usable slice" explicitly and enforce a time-box: if Task CRUD + quick capture + Today view isn't usable within a small, fixed number of real coding sessions, the fix is to cut scope further, not push through. Concretely: don't touch Tier-2/Tier-3 features (Rounds polish, agent, recurrence) until you've personally used Tier-1 daily for a week. This is already partially true — Focus Rounds and Calendar shells got built *ahead* of Reminders/Settings per the audit, which is the opposite of the paradox (good sign, not a gap) — the actual risk now is finishing the *prerequisite* work (§0/timezone/settings from File 1) before jumping to Agent+Memory, which is the more "exciting" module and the one most likely to eat unbounded time.

### Problem 2 — No monitoring on the automation (dead man's switch)
**Solution: Healthchecks.io**, free tier, purpose-built for exactly this pattern. How it fits: your `pg_cron`-triggered reminder-dispatcher and reschedule-sweep Edge Functions each `curl` a unique Healthchecks.io ping URL on every successful run; Healthchecks.io expects a ping within a configurable grace window and alerts you (email, or — nicely — it supports **Telegram** as a notification channel directly, so the same bot you're already building can double as your ops alert channel) the moment a check-in is missed. This is a 10-minute setup per job, free at this scale, and it's the exact tool built for "tell me when the thing that should run every N minutes *doesn't*," rather than trying to build heartbeat logic yourself. Pair it with a **manual kill switch**: a single `automation_paused` boolean on the `users` row (or a settings toggle) that every dispatcher/sweep function checks first and no-ops on — cheap, and it's your emergency brake if the reschedule engine ever starts moving things wrong.

### Problem 3 — No parallel-run period
**Solution: an explicit coexistence rule, not a tool.** Write this into `AUDIT.md` once, as a real rule, not a vague intention:
- Run paper + Cadence together for a **minimum of 2 weeks**, or until **7 consecutive days** where every paper-tracked item also appears correctly in Cadence — whichever is longer.
- **Fallback trigger:** if Cadence misses or mishandles a real deadline during the trial, the trial clock resets to zero and you go back to paper-as-primary until the cause is fixed and verified (via a G4 manual test, not just a code fix).
- Only after the trial closes clean do you stop carrying the paper tracker to events.

### Problem 4 — No path for the existing paper backlog
**Solution: reuse the LLM you're already integrating, don't add a separate OCR service.** Classic OCR (what Rocketbook uses, and why it struggles) does glyph-by-glyph matching — bad fit for your actual handwriting sample. A multimodal call to the **same Claude API** already planned for the agent (§9) can read a photo contextually the way a person does — this is literally what happened earlier in this conversation with your tracker photo. Concretely: a "Photo capture" mode that uploads an image to Supabase Storage, sends it to Claude with a prompt asking for a structured list of **draft** tasks (title, best-guess due date, confidence per item), and shows them in a **confirm-before-save** queue — never auto-filed. This avoids standing up a separate OCR vendor (Google Vision, AWS Textract, a dedicated handwriting API) for a feature that needs the same "read this contextually, flag uncertainty" behavior your agent already needs to have.

### Problem 5a — No cost ceiling tracked
**Solution: a self-built spend log, not a third-party observability platform.** At single-user scale, standing up something like Helicone or LangSmith is overhead you don't need yet. Instead: every agent Edge Function call logs `{tokens_in, tokens_out, estimated_cost, timestamp}` to a small `llm_usage` table (Anthropic's API response includes token counts on every call — this is a few lines, not a new integration). A `pg_cron` job sums the trailing 30 days weekly and sends a Telegram message if it crosses a ceiling you set in Settings. If usage ever gets complex enough to need real dashboards, Helicone's free tier is the natural upgrade — but don't add it now.

### Problem 5b — No IANA timezone field (live bug)
**Solution: already resolved by the architecture decision in File 1 §0** — add `users.timezone` (IANA string, e.g. `Asia/Kolkata`) alongside `working_hours`/`quiet_hours`, evaluate both in that zone using a proper timezone library (`date-fns-tz` or `luxon` — either handles IANA-zone math correctly; avoid hand-rolling offset math). Add the travel test from File 1 §3 alongside the existing DST test.

---

## Part 2 — Full integration map (everything the app connects to, not only messaging)

| Category | Service | What it's for | Why this one | Setup effort | Cost at your scale |
|---|---|---|---|---|---|
| **Core backend** | Supabase | Postgres, RLS, `pg_cron`, `pgvector`, Storage, Edge Functions | One bundled backend covering four spec-critical pieces at once | Medium (the DB migration in File 1 §0) | Free tier, $25/mo if outgrown |
| **Auth** | Clerk | Sign-in/up, session management | Already built, real, working — kept as-is; officially integrates with Supabase RLS via `auth.jwt()` | None (already done) | Free tier generous for single-user |
| **Messaging — primary** | Telegram Bot API | Reminders, two-way commands, ops/monitoring alerts | Free, cross-platform, no app-store friction, can double as your Healthchecks alert channel | Low | Free |
| **Messaging — secondary** | Web Push (VAPID) | Push for installed PWA users | Native to PWAs, no extra account needed | Low | Free |
| **Messaging — fallback** | Resend or SendGrid | Email digests, weekly reviews | Never time-critical, good for summaries | Low | Free tier covers this volume |
| **AI / LLM** | **LiteLLM gateway** in front of **NVIDIA NIM** (primary, free) → **Groq/OpenRouter** (fallback, free) → **Hugging Face** (tertiary, free) | Agent+memory tool-calling, **and** paper-photo-import parsing (Problem 4) | Confirmed current (2026): NIM's free Developer tier is OpenAI-compatible with no card required, and several hosted models (Llama 3.1 70B+, Nemotron, GLM, Mixtral) support real function calling — good enough for the agent's tool-calling needs, at $0. LiteLLM officially supports all of these providers behind one call shape with automatic fallback/cooldown built in, so a single rate-limited free tier doesn't take the agent down | Low-medium (one gateway config instead of one API key) | $0 by design — the free tiers are explicitly rate-limited (NIM: ~40 req/min/model, no published guaranteed quota) rather than metered-and-billed, which is exactly why the fallback chain matters more than it would with a single paid vendor |
| **Monitoring — automation heartbeat** | Healthchecks.io | Dead-man's-switch on every `pg_cron` job | Purpose-built for this exact failure mode; Telegram-native alerting | Low, ~10 min per job | Free tier sufficient |
| **Monitoring — errors** *(new — not in any prior doc, genuine gap)* | Sentry | Catch runtime exceptions in production before you notice something's silently broken | Nothing currently tells you the app itself errored, only that a cron job didn't run — this is the other half of "nothing watches the automation" | Low (one SDK install) | Free tier fine at this scale |
| **Source control** | GitHub | The one thing that makes every editor swap (Replit/OpenCode/Antigravity) work at all | Already in use | — | Free |
| **CI / reproducible builds** | GitHub Actions | Run `pnpm run typecheck` + future tests on every push, on Linux — sidesteps the Windows `preinstall` issue the audit hit entirely | Directly fixes punch-list item 7 by making verification reproducible somewhere consistent, instead of fixing the Windows-specific script | Low | Free for public/small private repos |
| **Deployment** | Replit Deployments (or Vercel) | Hosting the published app | Already decided in doc 1 §4 | — | Included/low |
| **Optional / future — not in current spec** | Google Calendar API (two-way sync) | Pull real fixed events into the reschedule engine's "never touch fixed events" rule automatically, instead of manually marking things fixed | Only worth adding once the reschedule engine (File 1 step 6) is live and you feel the manual-marking friction | Medium (OAuth flow) | Free |

**One non-integration fix worth noting here anyway**, since it's a real "thing to connect" in the broader sense: the audit couldn't reproduce `pnpm run typecheck` on Windows because root `preinstall` shells out with `sh`, which doesn't exist there. The GitHub Actions row above is the actual fix — verification happens in a consistent Linux environment on every push, so this stops being a per-machine problem.

---

## What NOT to add right now

Explicitly skip, for the same reason doc 4 argued against big-bang scope: a hosted LLM-observability platform (Helicone/LangSmith), a dedicated OCR vendor, a payments/billing integration (no team version exists yet), and Google Calendar sync (listed above as optional-future, not now). Every one of these solves a problem you don't have yet at single-user scale — add them if and when the self-built version in Part 1 actually becomes the bottleneck, not before.
