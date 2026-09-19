# AGENTS.md Create/Upgrade Prompt (for OpenCode)

**How to use this file:** paste everything below the divider as a message in an `opencode` session at the repo root. It doesn't hand-carry the full content of all 11 docs — it instructs the agent to *read and synthesize* from `spec/`, which is more reliable than me re-transcribing 11 documents I've been actively editing throughout this conversation into a 12th one that'd go stale the moment I hit send.

**Before running this:** make sure `spec/` in the repo has the current versions of all eleven docs (`01` through `11`) plus `VERIFICATION_REPORT-2026-09-11.md`. If you've re-run the zero-trust audit since then, include the newer report instead/as well.

---

=== COPY BELOW THIS LINE (or save as a one-off task, not as AGENTS.md itself — this prompt's job is to *produce* AGENTS.md) ===

Your task is to create, or intelligently upgrade, `AGENTS.md` at the repo root — the canonical file OpenCode reads automatically at the start of every future session in this repo. Read this whole brief before touching anything.

## Step 1 — Check for an existing AGENTS.md

If `AGENTS.md` already exists (it may, if a prior session saved the zero-trust audit prompt there per `spec/06-opencode-zero-trust-audit-prompt.md`'s instructions), **don't blindly overwrite it.** Read it first. Anything in it that reflects real, observed repo state (not just copied instructions) is worth preserving or reconciling, not discarding. Log what you kept, changed, or removed in `AUDIT.md` as a dated entry — the same "never silently overwrite" rule that already governs this project's audit reports applies to this file too.

## Step 2 — Read the full spec corpus

Read every file in `spec/` (`01` through `11`) plus the latest verification report in full. Note one thing explicitly: `spec/02-implementation-plan.md`'s and `spec/03-master-build-prompt-for-replit.md`'s original phase ordering ("start at Phase 0") is **superseded** by `spec/07-post-audit-master-plan.md`'s revised build order, which starts from verified real state instead of an empty repo. Docs 02/03's *design system, tech stack, and rule definitions* are still authoritative — only their "where to start" framing is stale. Treat `07` as the current build-order source of truth, everything else as the detail layer beneath it.

## Step 3 — Verify current state before writing it down

Don't copy `PROGRESS.md`'s claims into `AGENTS.md` as fact. If more than roughly a week has passed since the last verification report, say so in `AGENTS.md` itself ("current-state section last verified on [date] — re-run the zero-trust audit if this is stale") rather than presenting possibly-outdated status as current. This is the same zero-trust posture as `spec/06`, applied to writing this file, not just to the last audit.

## Step 4 — Write AGENTS.md with these sections, in this order

Keep it dense and reference-first, not a full copy of eleven documents — link to the specific `spec/` file+section for anything that needs full depth (the complete 16-table schema, the full memory-system design, the full competitor research) rather than duplicating it. `AGENTS.md` loads on *every* session; bloating it with material only needed when actually working on that one module wastes context on every unrelated session.

1. **Project one-liner + who it's for** — personal task/time-management app, single user for now, built multi-user-safe from day one.
2. **Current real state** — a short, honestly-worded summary (per Step 3) of what's actually built vs. spec'd, pointing to `spec/07`'s scorecard for the full module-by-module breakdown.
3. **Tech stack, as it actually stands** — Clerk (auth, kept) + Supabase (Postgres, RLS via Clerk's JWT, `pg_cron`, `pgvector`, Storage, Edge Functions) + Drizzle + Express + React/Tailwind/shadcn PWA. LLM: LiteLLM gateway, NVIDIA NIM primary → Groq/OpenRouter → Hugging Face fallback, free-tier-first by design. Reference `spec/01 §5` and `spec/07 §0` for the full reasoning, don't re-argue it here.
4. **Global rules — do and don't** — pull the full list from `spec/10 §1` verbatim; this is the highest-value section of the whole file, keep it complete, not summarized.
5. **Design system essentials** — Apple HIG (Clarity/Deference/Depth), the color table, 8px grid, dark-mode-default, Activity Rings, the "energy not pretending" rule. Full detail lives in `spec/03 §2`; inline the color hex table here since it's referenced constantly, link out for the rest.
6. **Locked decisions — a flat reference table**, every number that's been settled so no future session re-litigates them: timezone default `Asia/Kolkata`; reschedule cap `5`; bulk-agent-confirm threshold `10`; automation default `auto` on first miss → `ask` on second; streak-freeze `declined, not building`; memory re-confirmation split by source (behavioral auto, conversational asks); memory transparency screen `in first build, not deferred`; extraction cadence `nightly batch`; spend-alert ceiling `~₹300–500/mo safety net, not a real budget`; the four memory seed categories plus "extraction stays open-ended beyond them" (`spec/11 §2.1`).
7. **Build order** — the revised step list from `spec/07 §4`, referenced not re-typed in full, plus which step is current.
8. **Operating protocol** — confirm scope before each phase, completion report after, maintain `PROGRESS.md`/`AUDIT.md`, ask-don't-guess on ambiguous/irreversible decisions, weekly re-audit during active build weeks (`spec/09 §0`), metrics to propose before Phase 3 (`spec/03 §9`).
9. **Manual-test backlog** — pointer to `spec/07 §3`, not duplicated (it changes as tests get checked off; a stale copy here would be actively misleading).
10. **Explicitly deferred — don't build without being asked**: Helicone/LangSmith, dedicated OCR vendor, Google Calendar sync, payments/billing, anything in doc 9's "Later" tier not yet promoted.
11. **Repo governance note** — this file is canonical for OpenCode; Replit and Antigravity sessions should be pointed at it manually since they don't auto-read it (`spec/05`, `spec/09 §5`); `README.md` should have one line pointing here.

## Step 5 — Sanity check before finishing

Re-read the finished `AGENTS.md` once against the checklist in Step 4 — confirm nothing on that list was skipped, and confirm nothing in it contradicts something else in it (e.g., don't have §3 say one LLM strategy and §6 imply another). Report back what you wrote, what you preserved from an existing file if one existed, and anything from the spec corpus you genuinely couldn't reconcile or found contradictory — don't silently resolve a real contradiction by picking one side without flagging it.

=== END OF PROMPT ===
