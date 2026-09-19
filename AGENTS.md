# AGENTS.md — Cadence (Personal Task & Time OS)

> **File provenance (updated 2026-09-19):** Synthesized from the canonical corpus in `docs/` and `spec/` (01–12), `VERIFICATION_REPORT.md`, `AUDIT.md` (through 2026-09-19), and verified repo mechanics carried over from prior sessions. Docs 07–12, now fully reconciled in the repository, supersede the pre-audit phase orders and settle previously open architectural decisions.
> **Freshness:** Real state verified 2026-09-19. Re-run `spec/06` zero-trust audit weekly during active build weeks.

## 1. What this is

**Cadence** (working title, owner: Rohit) — a personal task + time-management app that replaces a paper planner: fast mobile capture, a real calendar, focus timers, reminders over a channel actually seen, a visibly self-fixing reschedule engine, and a conversational agent with memory that learns real work patterns (`spec/01 §1–2`, `spec/03 §1`). **Single user for now, built multi-user-safe from day one** — every table gets `user_id`-scoped RLS; nearly free now, painful to retrofit (`spec/01 §8`, `spec/03 §1`).

## 2. Current real state (last verified 2026-09-19)

- **Built and verified real (no mocks):**
  - **Auth & Hardening:** Clerk auth (branded sign-in/up, landing, protected routes, sign-out), Supabase Postgres target with `runWithRls` JWT claims enforcement (`auth.jwt()->>'sub'`), FK + CHECK constraints, CORS allowlist, `demo-user` default removed.
  - **Task & Calendar Data Engine:** Migrations `0001` through `0008` applied to Supabase (tasks, focus_sessions, projects, tags, subtasks, task_files, time_blocks, reminders, reminder_runs, notification_settings, automation_flags, focus_settings, reschedule_proposals, reschedule_runs, reschedule_settings). Express 5 API mounts 48+ handlers, all with `requireAuth` and RLS isolation. 86/86 vitest suites pass.
  - **Frontend Core:** Modularized component architecture (`components/chrome`, `components/task`, `components/shared`, `pages/today`, `pages/inbox`, `pages/focus`, `pages/calendar`, `pages/review`, `pages/settings`, `pages/landing`). Apple HIG dark mode tokens, Activity Rings, Web Audio cues, global keyboard shortcuts (`N`, `Cmd+K`, `1..6`), PWA shell (manifest, service worker, icons).
- **Module Scorecard & Status:** See `spec/07 §2` for the 5-gate scorecard and `PROGRESS.md`.

## 3. Tech stack, as it actually stands

| Layer | Stands at | Source |
|---|---|---|
| Frontend | React + Vite + Tailwind + shadcn/ui, PWA (manifest + SW). Apple HIG aesthetic, dark-mode default (OLED `#000000`), Activity Rings momentum. | `spec/03 §2`, `spec/07` |
| API | Express 5 (`artifacts/api-server`), esbuild CJS→ESM bundle, `PORT=5000`. | Appendix A |
| DB/ORM | Supabase Postgres + Drizzle ORM; RLS enforced per-request via `runWithRls` (`auth.jwt()->>'sub'`). | `spec/07 §0`, `spec/08` |
| Auth | Clerk native third-party-auth integration; `requireAuth` on all routes except `GET /healthz` and `/api/healthz`. | `spec/07 §0` |
| Scheduling | `pg_cron` + `pg_net` calling internal job endpoints (`/internal/dispatch`, `/internal/reschedule`) with `DISPATCH_SECRET`. | `spec/01 §4–5`, `spec/10 §10` |
| Reminders | Telegram Bot API **primary** (free, two-way commands: `done`, `snooze 1h`, `list today`), Web Push/VAPID secondary, email digest fallback. | `spec/01 §10`, `spec/08` |
| Agent/memory | LiteLLM gateway with **NVIDIA NIM primary** (free, OpenAI-compatible function calling) → **Groq/OpenRouter** → **Hugging Face** fallback. Memory in 3 tiers: In-context, Semantic (`pgvector`), Structured facts (`memory_facts` JSONB). Two extraction sources (A: Behavioral arithmetic, B: Conversational LLM). | `spec/01 §11`, `spec/08`, `spec/11` |
| Monitoring | Healthchecks.io dead-man's-switch ping on every cron run + Telegram alert; Sentry for runtime errors; `automation_flags` manual kill switch. | `spec/08 #2`, `spec/10 §10` |

## 4. Global rules — do and don't (`spec/10 §1` verbatim)

### Always do
- **Zero trust, permanently.** Every status claim (`PROGRESS.md`, `AUDIT.md`, a prior agent's own summary) is unverified until it's independently checked — this isn't a one-time audit posture, it's the standing rule now. (`spec/06`, `spec/09 §0`)
- **Never move a fixed/immovable calendar event**, under any automation mode. (`spec/01 §9 rule 1`)
- **Never silently reschedule or bulk-edit.** Every automated move or agent bulk-action logs what changed and notifies — no silent diffs, ever. (`spec/01 §9 rule 7`, `spec/09 #2`)
- **Confirm before any bulk agent action touching more than 10 tasks.** (`spec/09 #2`)
- Log every agent action (create/edit/delete/reschedule) to `agent_action_log` with enough data to reverse it, and expose an "undo last agent action" command in both the chat panel and Telegram. (`spec/09 #2`)
- Re-run the zero-trust audit (`spec/06`) **weekly during active build weeks**, not once. (`spec/09 §0`)
- Keep the parallel-run rule live: paper stays your primary until 2 weeks pass, or 7 consecutive days where every paper item also appears correctly in Cadence — whichever is longer. Any real missed deadline during the trial resets the clock. (`spec/04 §3`, `spec/08 problem 3`)

### Never do
- Don't overwrite `AUDIT.md` or `PROGRESS.md` when running an audit — write a new dated report file instead, so before/after is comparable. (`spec/06`)
- Don't add features or "helpfully" fix things during an audit pass — audit sessions verify and report only. (`spec/06`)
- Don't build Reminders or the Auto-reschedule engine before timezone + working/quiet hours + the monitoring heartbeat all exist. (`VERIFICATION_REPORT` punch list #8, `spec/07 step 6`)
- Don't use Replit's own database — Supabase is the one constant backend across every editor. (`spec/05`)
- Don't leave a Supabase test/scratch branch running after you're done with it — it bills ~$0.32/day. (`spec/09 #8`)
- Don't rely on push notifications alone — iOS PWA push is unreliable enough that Telegram stays the primary channel. (`spec/01 §10`)
- Don't auto-file anything from the paper-photo-import feature — draft tasks always go through a confirm-before-save queue. (`spec/04 §4`, `spec/08 problem 4`)
- Don't add these right now — Helicone/LangSmith, a dedicated OCR vendor, Google Calendar sync, any payments/billing integration. Explicitly deferred until the self-built versions actually become a bottleneck. (`spec/08` "What NOT to add")
- Don't let a single missed reminder replay as N separate pings after you've been away a few days — batch into one catch-up summary instead. (`spec/09 #9`)
- Don't communicate task status through color alone — every status color pairs with an icon/shape too (colorblind-safe). (`spec/09 #3`)
- Don't treat this checklist itself as gospel forever — it goes stale the same way `PROGRESS.md` did, hence the weekly re-audit rule above.

## 5. Design system essentials (`spec/03 §2`, `spec/10 §16`)

Apple Human Interface Guidelines — **Clarity, Deference, Depth**. Quality bar: Things 3 + Apple Reminders/Clock/Timer.

| Role | Light | Dark | Use for | Icon/Shape Pairing (Colorblind Safe) |
|---|---|---|---|---|
| Background | `#F5F5F7` | `#000000` | App background (OLED true black dark mode) | — |
| Surface / Card | `#FFFFFF` | `#1C1C1E` | Primary cards, panels | — |
| Elevated Surface | `#F2F2F7` | `#2C2C2E` | Modals, sheets, popovers | — |
| Primary text | `#1D1D1F` | `#F5F5F7` | Headlines, body | — |
| Secondary text | `#6E6E73` | `#98989D` | Captions, metadata | — |
| **Accent — Energy** | `#FF9500` | `#FF9F0A` | **Primary CTAs, Start buttons, active timers, streaks** | Flame / ArrowUp |
| Success | `#34C759` | `#30D158` | Completions — multi-sensory spring hit | Checkmark Circle (`CheckCircle2`) |
| Urgent / Overdue | `#FF3B30` | `#FF453A` | Overdue / at-risk tasks only | Alert Triangle (`AlertTriangle`) |
| Scheduled / Next | `#007AFF` | `#0A84FF` | Scheduled time blocks, secondary links | Clock (`Clock`) |
| AI / Memory | `#5E5CE6` | `#5E5CE6` | Memory facts, agent recommendations | Sparkles / Brain (`Sparkles`) |

- **Liquid Glass Restraint:** Glass (`backdrop-blur-xl` + 1px border `rgba(255,255,255,0.08)`) is confined strictly to chrome (sidebar, bottom dock, headers, modals)—never body content.
- **Activity Rings:** Tasks done (Orange ring) / Focus rounds (Green ring) / Streak (center count).
- **Energy-not-pretending rule:** Prominent **Start** CTA on Next Up; zero "You've got this!" motivational copy.
- **Audio micro-interactions:** Subtle Web Audio synthesizer chimes (`C5-E5-G5`), focus bell, and tactile clicks with instant mute toggle.

## 6. Locked decisions (settled reference table)

| Decision | Settled Value | Source |
|---|---|---|
| Home Timezone | `Asia/Kolkata` (default, stored as IANA string in user profile) | `spec/07 §4`, `spec/08 #5b`, `spec/10 §6` |
| Working Hours | Configurable; defaults to 24-hour flexibility (`00:00 - 23:59`) per user preference | User Decision 2026-09-19 |
| Reschedule Cap | **5** auto-moves per task (loosened from 3), then flags "needs attention" | `spec/03 §6`, `spec/10 §11` |
| Automation Dial Default | **`auto` on 1st miss, auto-downgrades to `ask` on a 2nd miss** of the same task | `spec/01 §9 rule 6`, `spec/10 §6` |
| Bulk-Agent-Confirm Threshold | **> 10 tasks** touched at once requires explicit confirmation | `spec/09 #2`, `spec/10 §1` |
| Streak Freeze | **Declined, not building.** Streaks stay strict; a missed day resets it. | `spec/09 #10`, `spec/10 §15` |
| LLM Gateway & Fallback | **LiteLLM:** NVIDIA NIM primary → Groq/OpenRouter fallback → Hugging Face tertiary | `spec/08`, `spec/10 §12` |
| Spend Safety-Net Alert | **~₹300–500/mo** alert ceiling (target is $0 via free tiers) | `spec/08 #5a`, `spec/10 §12` |
| Memory Extraction Cadence | **Nightly batch job** via `pg_cron` (Source A arithmetic + Source B LLM) | `spec/11 §2.2` |
| Memory Re-confirmation Split | **Source A updates automatically; Source B prompts user** before updating/archiving | `spec/11 §2.5` |
| Memory Transparency Screen | **Confirmed for first build, not deferred:** "What Cadence Knows About Me" | `spec/11 §4c`, `spec/10 §12` |
| Memory Seed Categories | 4 confirmed seeds: task-type procrastination, channel responsiveness, soft commitments, hackathon shifts; plus open-ended extraction | `spec/11 §2.1` |
| Reschedule Rule 9 | Check `memory_facts` for duration multiplier / pattern before scheduling | `spec/11 §4a` |
| Status Color Accessibility | Every status color **must pair with an icon/shape** (colorblind-safe) | `spec/09 #3`, `spec/10 §16` |

## 7. Build order (`spec/07 §4`)

1. **Architecture decision** (Supabase + Clerk + RLS + `pgvector` + `pg_cron`) — Done & verified.
2. **Security/data hardening** (remove `demo-user`, FK + CHECKs, CORS allowlist) — Done & verified.
3. **Reproducible builds & test tooling** (vitest, cross-platform preinstall, Playwright config) — Done.
4. **Onboarding + Settings** (`users.timezone`, 24h work rhythm, automation defaults, Telegram wizard) — **CURRENT STEP**.
5. **Reminders + heartbeat monitoring** (dispatcher + Healthchecks.io ping + kill switch) — Backend done, UI connected.
6. **Auto-reschedule engine** (sweep + dial + proposals + Rule 9 memory integration) — Backend done, UI connected.
7. **Calendar time-blocking** (`time_blocks`, drag-drop hour grid) — Done & verified.
8. **Telegram bot wiring** (two-way webhook `done`, `snooze 1h`, `list today`) — Backend done.
9. **Agent + memory** (LiteLLM gateway, `memory_facts`, transparency screen `/memory`) — **CURRENT STEP**.
10. **Recurrence, monthly goals, guided rituals** ("Plan My Day" / "Close My Day") — **CURRENT STEP**.
11. **Task links & attachments, search & archive** (`task_links`, `tsvector`, archive filter).
12. **Paper-photo-import** (Claude vision upload to draft queue with confirmation).
13. **Analytics & export polish**.
14. **Full manual QA pass & 2-week parallel-run trial**.

## 8. Operating protocol

- **Confirm scope before each phase; completion report after** (`spec/03 §9`): 2–3 sentence pre-statement with assumptions; post-report covering built / tested / not done / deviations.
- **Maintain `PROGRESS.md` + `AUDIT.md` after every phase** (`spec/03 §9`): `AUDIT.md` is an append-only dated log.
- **Ask, don't guess** on irreversible decisions.
- **Weekly zero-trust re-audit** during active build weeks (`spec/09 §0`).

## 9. Manual-test backlog

See `spec/07 §3` for the full manual test backlog: signed-out 401, two-account RLS isolation, real-device PWA install/push, Focus background timer survival, and 2-week paper parallel run.

## 10. Explicitly deferred — don't build without being asked

Helicone/LangSmith, dedicated OCR vendor, Google Calendar sync, payments/billing (`spec/08`).

## 11. Repo governance

- Canonical instructions for OpenCode. Replit and Antigravity sessions pointed here manually (`spec/05`, `spec/09 §5`).
- `README.md` contains pointer to this file.
- `docs/` and `spec/` maintained in strict synchronization.

## Appendix A — Repo mechanics (preserved from prior AGENTS.md, re-verified true)

- **pnpm only.** Root `preinstall` (`scripts/enforce-pnpm.cjs`) deletes `package-lock.json`/`yarn.lock`, exits 1 under npm/yarn. Install: `pnpm install --frozen-lockfile`. Never touch `minimumReleaseAge: 1440` in `pnpm-workspace.yaml`.
- **Commands.** `pnpm run typecheck` = `tsc --build` (libs `@workspace/db`, `@workspace/api-client-react`, `@workspace/api-zod`) then per-package `typecheck` in `artifacts/**` + `scripts`. `pnpm run build` = typecheck first, then `pnpm -r --if-present run build`. Single package: `pnpm --filter <name> run <script>`. API: `pnpm --filter @workspace/api-server run dev` (port 5000, esbuild bundle + `node --enable-source-maps ./dist/index.mjs`, needs `DATABASE_URL`). Web: `pnpm --filter @workspace/cadence run dev` — Vite **throws without `PORT` + `BASE_PATH`**.
- **Layout.** `artifacts/cadence` (React+Vite app) · `artifacts/api-server` (Express 5, `build.mjs`) · `artifacts/mockup-sandbox` (throwaway previews — never import from it) · `lib/api-spec/openapi.yaml` (**contract source of truth**; `lib/api-client-react` = react-query `baseUrl: /api` + `customFetch` mutator, `lib/api-zod` = Orval output — never hand-edit `src/generated/`) · `lib/db/src/schema/` · `lib/db/migrations/`.
- **Codegen/DB order.** After `openapi.yaml` edits, regenerate on Linux/Replit: `pnpm --filter @workspace/api-spec run codegen` (also runs `typecheck:libs`). Orval pins Zod v3 (`orval.config.ts`) though catalog resolves zod v4 — do not "fix." Schema changes (dev only): `pnpm --filter @workspace/db run push`.
- **Isolation (load-bearing).** Handlers **must** use `runWithRls(req, tx => …)` (`artifacts/api-server/src/lib/rls.ts`) — owner-level `Pool` bypasses RLS alone; fail-closed (no token → match-nothing claims). Keep app-layer `where user_id = ?`. `GET /healthz` and `/api/healthz` public, rest behind `requireAuth`. CORS allowlist from `CORS_ORIGINS` (default `http://localhost:5173`) — never `origin: true`.
- **Platform.** Primary dev Replit/Linux; workspace strips non-linux esbuild/rollup/lightningcss/tailwind-oxide binaries — Windows best-effort. On Windows run typechecks via `node node_modules/typescript/bin/tsc --build --force`.
- **Verification.** Full green = `tsc --build --force` (exit 0) + live checks + vitest suite (86/86 passed).
