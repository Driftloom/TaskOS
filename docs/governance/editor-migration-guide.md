# Cadence — Editor & Tooling Migration Guide

> **Doc type:** Operations/governance — historical and reference.  
> **Source:** Distilled from `docs/archive/05-replit-opencode-antigravity-migration-guide.md`.  
> This guide captures the decisions and mechanics for moving between AI coding environments (Replit, OpenCode, Antigravity/Claude) without losing project context.

---

## 1. The One Constant — Supabase Backend

No matter which editor you switch to, the backend never changes:
- **Supabase Postgres** is the database — the connection string (`DATABASE_URL`) follows you to every editor
- **Clerk** is auth — the API keys follow you
- **GitHub** is source control — the repo is the canonical artifact

Switching editors means pointing a new coding environment at the same repo and the same Supabase project. It does not require re-wiring the backend or migrating data.

---

## 2. Canonical Context File

**`AGENTS.md` at the repository root** is the canonical context document read by all editors.

| Editor | How it reads AGENTS.md |
|---|---|
| **OpenCode** | Auto-reads `AGENTS.md` at repo root on every session |
| **Antigravity** | Pointed via `.user_rules` (references the root `AGENTS.md` path) |
| **Replit Agent** | Does not auto-read — paste a link or summary as the first prompt |
| **Cursor / Claude Code** | Reference it in the system prompt or first message |

**Rule:** `AGENTS.md` stays at the repo root. Never move it.

The `README.md` has a pointer to `AGENTS.md` so any editor that reads `README.md` first can find the canonical context.

---

## 3. Environment Variables to Carry

When opening the project in a new editor, ensure these are set:

| Variable | Value source |
|---|---|
| `DATABASE_URL` | Supabase project → Settings → Database → Connection string |
| `CLERK_SECRET_KEY` | Clerk dashboard → API Keys |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API Keys |
| `DISPATCH_SECRET` | Set once; store in a password manager |
| `TELEGRAM_BOT_TOKEN` | BotFather → token for your bot |
| `HEALTHCHECKS_URL` | Healthchecks.io → check URL for the relevant job |
| `SENTRY_DSN` | Sentry project → Client Keys |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Generated once per deployment |
| `LITELLM_*` | Provider-specific keys (NVIDIA NIM, Groq, HF) |
| `CORS_ORIGINS` | Typically `http://localhost:5173` for dev |

---

## 4. pnpm Only

The project enforces pnpm via a root `preinstall` script (`scripts/enforce-pnpm.cjs`) that:
- Deletes `package-lock.json` / `yarn.lock` if found
- Exits 1 under npm or yarn

Any new editor must install dependencies with:
```bash
pnpm install --frozen-lockfile
```

Never use `npm install` or `yarn install` — they will fail and leave broken lockfiles.

---

## 5. Dev Commands

| Task | Command |
|---|---|
| Start API (port 5000) | `pnpm --filter @workspace/api-server run dev` |
| Start web app | `pnpm --filter @workspace/cadence run dev` (requires `PORT` + `BASE_PATH` env vars) |
| Typecheck all | `pnpm run typecheck` (Linux) or `node node_modules/typescript/bin/tsc --build --force` (Windows) |
| Run tests | `pnpm run test` |
| DB push (dev only) | `pnpm --filter @workspace/db run push` |
| Codegen (after openapi.yaml edits) | `pnpm --filter @workspace/api-spec run codegen` (Linux/Replit only) |

---

## 6. Supabase Branching Policy

If you need a scratch environment for a risky migration:
- Create a Supabase branch (costs ~\$0.32/day)
- **Close it the same day** — note the date in the branch description
- Never leave a test branch open and walk away

---

## 7. Zero-Trust When Resuming After a Gap

When picking up after more than a few days away from active development:
1. Run the zero-trust audit (`docs/governance/zero-trust-audit-prompt.md`) before making any code changes
2. Do not trust prior `PROGRESS.md` or `AUDIT.md` entries as current — verify independently
3. Check that all Supabase branches are closed
4. Verify Healthchecks.io pings are arriving (cron jobs still running)
