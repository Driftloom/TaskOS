# Replit ↔ GitHub ↔ OpenCode / Antigravity — Portability Guide

**Why this doc exists:** you hit Replit's Starter monthly quota (resets Oct 4, per your screenshot) with real progress already made (PROGRESS.md, AUDIT.md, 15 files in `lib`, 5 artifacts). This answers exactly what you asked: can you leave, keep working elsewhere, and come back — and what actually moves vs. what you have to rebuild.

---

## Your three questions, answered directly

**1. Push Replit → GitHub → pull into OpenCode and keep working — does this work?**
**Yes, cleanly.** Your code isn't locked to Replit. Once it's in a GitHub repo, it's just... a folder of code. OpenCode (terminal-based) or Antigravity (a real VS Code fork you run locally) both just open a folder — `git clone` it and you're working, no special "import" step needed. This is completely standard, no gotchas.

**2. After finishing in OpenCode, can you pull the code back into Replit?**
**Yes, same mechanism in reverse.** Push from OpenCode/your machine to GitHub, then in Replit either "Import from GitHub" as a new Repl, or use the existing Repl's Git pane to pull the latest commits. Fully bidirectional — nothing about this is Replit-specific or one-way.

**3. Can you then publish/deploy on Replit and use Replit's services (database etc.) even though it wasn't all built there?**
**Publishing: yes, no restriction.** Replit's own docs explicitly support importing projects from other tools (they name Vercel, Bolt, Lovable, Base44 as known import sources) and deploying them normally — where the code was authored doesn't matter to the deploy step.
**Replit's own database: you don't need it, and per our plan you shouldn't reach for it.** Two separate things are true here: (a) Replit does have its own managed Postgres now (recently migrated to their own infra, called Helium, previously Neon-backed) that you *could* use, but (b) our whole architecture (docs 1–3) deliberately runs on **Supabase** instead — specifically for `pg_cron`, `pgvector`, and the bundled Auth/Edge Functions. That decision holds regardless of which editor is touching the code. Good news found while checking this: Replit's own import documentation explicitly notes that when importing a project that already uses Supabase, **Supabase data is not migrated into Replit's database** — meaning Supabase is treated as an external service Replit doesn't touch. That's exactly what we want: Supabase is the one constant piece across every editor swap; only the code moves.

---

## The mental model

```
GitHub repo  ──────────────  the code. Portable. Any editor can clone it.
Supabase project ──────────  the backend + data. Portable. Any editor can point at it via env vars.
Replit / OpenCode / Antigravity ── just the hands typing the code. Fully swappable.
```

Nothing about "where you code" is permanent. The two things that *do* need to travel deliberately are below.

---

## What does NOT travel automatically (do these by hand every time you switch editors)

1. **Secrets / environment variables.** Replit Secrets, and whatever OpenCode/Antigravity use locally, are never committed to git (correctly — that's a security feature, not a bug). Every time you move editors, manually re-enter: Supabase URL + anon/service keys, Telegram bot token, VAPID keys, your LLM API key, email API key. Keep one private note (not in the repo) with all of these so this is a 2-minute copy-paste each time, not a hunt.
2. **Replit-specific config files** (`.replit`, `replit.nix`) — harmless to leave in the repo, but OpenCode/Antigravity don't need them and won't use them. Don't spend time "porting" them.
3. **Anything actually stored in Replit's own database**, if you ever used it (you shouldn't have, per the plan — Supabase is the backend). If you did accidentally write anything there, it stays in Replit and needs a manual export; it won't follow the code.

---

## Step-by-step: Replit → OpenCode (or Antigravity)

1. In Replit, open the **Git** pane → connect a GitHub repo if you haven't already → commit and push everything, including `PROGRESS.md` and `AUDIT.md` (keep those, they're useful context even under zero-trust review — see the audit prompt doc).
2. On your machine: install OpenCode (`curl -fsSL https://opencode.ai/install | bash`, or via npm/brew) — it's free, open-source, and you bring your own model API key, which is exactly what fixes the "ran out of bundled credits" problem: you pay per token to whichever provider you choose instead of hitting a platform-wide monthly quota again.
3. `git clone` your repo, `cd` into it, run `opencode`.
4. Re-enter all the secrets from the list above (as a local `.env` or however the app expects them — check `AUDIT.md`/`PROGRESS.md` for what's already documented there).
5. Before doing anything else: run the zero-trust audit (the second file) — don't just trust the existing progress notes and start adding features on top of possibly-unverified work.

**If you pick Antigravity instead:** same steps 1 and 4–5 apply; step 2–3 becomes "install the Antigravity desktop app, open the cloned folder as a project." Antigravity is a real GUI IDE (VS Code fork) with a built-in browser for visually verifying UI changes and a "Manager" view for running multiple agents in parallel — genuinely nice for a UI-heavy phase, but it's in free public preview with a paid tier stated as "coming," so don't assume the free ride is permanent the way you might've assumed about Replit's Starter tier.

## Step-by-step: OpenCode/Antigravity → back to Replit → Publish

1. Commit and push from wherever you're working.
2. In Replit: **Import from GitHub** (new Repl) or pull into the existing Repl via its Git pane.
3. Re-enter secrets as Replit Secrets (again — see the list above).
4. Hit **Publish** as normal. Deployment doesn't care where the code came from.

---

## OpenCode vs. Antigravity — quick take, since you named both

| | OpenCode | Antigravity |
|---|---|---|
| Interface | Terminal-first (also desktop/VS Code extension) | Full GUI IDE (VS Code fork) with an agent "Manager" view |
| Cost model | Free/open-source tool itself; you pay your own model provider per token — **no bundled monthly quota to run out of again** | Free public preview now; a paid tier is stated as coming |
| Model choice | 75+ providers, fully bring-your-own-key (Claude, GPT, Gemini, local models, etc.) | Multi-model but centered on Gemini 3, also offers Claude models |
| Fits your ask | Matches "0 trust audit" well — it's fully open source, you can read exactly what it's doing, no vendor lock-in | Naturally produces visual "Artifacts" (screenshots, recordings) for verifying UI work — nice for trust-building on the design side |
| Best fit here | **Recommended primary** — terminal fits a dev workflow, and per-token billing directly solves the quota problem that just bit you | Good secondary, especially for visually confirming Design-tab-style UI changes without digging through code |

Given you already asked for the audit prompt specifically for OpenCode, that lines up with the pick above — go with OpenCode as primary, keep Antigravity in your back pocket if you want a GUI pass later (e.g., visually verifying the Design tab work Replit's agent already did).

---

## One more thing before you touch new code

You've already put real work into this Repl (the screenshot shows an active PROGRESS.md, AUDIT.md, and 15 files under `lib`). Before building anything further in whatever tool you land on next, run the zero-trust audit — it's the second file — so you're extending verified work instead of building on top of claims that might not hold up.
