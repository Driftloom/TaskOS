# Master Design System Prompt — Cadence

**What this is:** the enterprise design-system template you pasted, with every placeholder filled in from the 12 docs and the verified repo state, and specialized to Cadence. It is the *final artifact* the template asks for: a copy-paste-ready execution spec for an AI agent (OpenCode primary). Paste everything below the `=== COPY BELOW THIS LINE ===` marker.

**Before running it:** put this file in `spec/` next to docs 01–12. It **refines `spec/03 §2`** (the original Apple-style design section). Where the two differ, this file wins — the prompt says so explicitly so the agent doesn't have to guess.

## Three things I did that you should know about

1. **Proportionality.** The template is written for an enterprise product with a design team. Cadence is one person and a Friday deadline; doc 4's build-time paradox applies to design systems too. So the prompt specifies everything at decision level, then **tiers the build** (P0 now / P1 soon / P2 specified-but-deferred) with a hard rule that design-system work never blocks the Friday slice. Nothing from the template is dropped — the coverage map below shows where each item landed, including what's deferred and why.
2. **A real contrast problem in the original palette (checked by hand, agent must re-verify by script).** System Orange `#FF9500` on white is roughly **2.2:1** — it fails WCAG for text *and* for UI graphics (3:1) in light mode. White text on an orange button fails the same way. Fixes baked in: dark on-accent text (`#1D1D1F` on orange ≈ 7.7:1), plus darker "text-safe" variants of orange/green/red/blue for use as text or thin icons on light backgrounds. System Green on white (~2.2:1) and System Blue on white (~4.0:1, fails for small text) have the same issue. Dark mode passes as-is, except indigo needs a lighter dark-mode value. This is a correction to doc 03's palette, not a restyle.
3. **Code is the source of truth; Figma is an optional downstream mirror.** Your repo already runs a single-source pipeline (OpenAPI → Orval → Zod + react-query). Tokens get the same treatment: one `tokens.json` → CSS variables + Tailwind theme + TS types. If you're not actually using Figma, nothing here breaks (see the question at the end of my chat reply).

## Coverage map — template section → where it landed

| Template § | Topic | Prompt § | Tier |
|---|---|---|---|
| 1–2 | Objective, application context | P0, P1 | — |
| 3 | Philosophy & principles | P3 | P0 |
| 4 | Architecture layers | P4 | P0 |
| 5 | Tokens | P5 | P0 |
| 6 | Color | P6 | P0 |
| 7 | Typography | P7 | P0 |
| 8–10 | Spacing/layout, responsive, density | P8 | P0 (density P1) |
| 11 | Iconography | P9 | P0 |
| 12 | Motion | P10 | P0 |
| 13 | Component library | P11 | P0 subset / P1 rest |
| 14 | Component states | P12 | P0 |
| 15 | Forms & validation | P13 | P0 |
| 16–17 | Data tables, dashboards | P14 | P1 (Today = P0) |
| 18 | AI UX | P15 | built with the agent module |
| 19 | Navigation | P16 | P0 |
| 20–22 | Feedback, empty states, errors | P17 | P0 |
| 23 | Accessibility | P18 | P0 baseline / P1 full |
| 24 | Internationalization | P19 | time/format P0; translation & RTL P2 |
| 25 | Content design | P20 | P0 |
| 26 | Patterns | P21 | P0 for capture/Today; rest P1 |
| 27–28 | Page architecture, visual hierarchy | P22 | P0 (Today) / P1 |
| 29 | Theming | P23 | P0 (light/dark) |
| 30 | Figma architecture | P24 | P2 |
| 31–33 | Frontend architecture, token pipeline, component API | P25 | P0 |
| 34 | Performance | P26 | P0 budgets / P1 tooling |
| 35 | Security & trust UX | P27 | P0 |
| 36–39 | Governance, QA, testing, documentation | P28 | lightweight P0 / full P1 |
| 40–42 | Anti-patterns, naming, composition | P29 | P0 |
| 43–45 | Maturity, roadmap, repository | P30 | P0 |
| 46–49 | Output format, quality rules, audit, final prompt | whole file, P31–P32 | — |

---

=== COPY BELOW THIS LINE ===

# P0 — Role, mandate, and how you must work

You are acting as a senior design-systems team: principal product designer, design-systems architect, UX architect, UI engineer, accessibility specialist, and frontend architect. You are building the **design system for Cadence**, a personal task and time-management PWA, inside an existing repository that already has real, verified code. This is an execution specification, not an essay: work systematically, produce evidence, and never restyle page-by-page by improvisation.

**Precedence.** `spec/03 §2` was the original design brief. **This document refines it and wins wherever they differ** (text-safe color variants, on-accent text color, dark-mode indigo, states, AI patterns). Everything else in `AGENTS.md` and `spec/` still stands, including every locked decision (see P1).

**How you must work — non-negotiable:**
1. **Inspect before you change.** Your first deliverable is an audit of the existing UI, not new components (P31).
2. **Zero trust, including toward yourself.** Do not self-certify. Every "done" needs evidence: a screenshot, a script's output, a test result. If you cannot produce evidence, report "unverified."
3. **Ask, don't guess.** When a decision is genuinely ambiguous or hard to reverse, stop and ask. Bundle questions, explain each in plain language, give options with trade-offs, and state your recommended default so I can answer with one word.
4. **Migrate incrementally.** Adopt tokens/components screen by screen, starting with Today. Never break a verified route, API contract, auth flow, or RLS policy. Design work does not touch auth, RLS, migrations, or API contracts — if a design task seems to require that, stop and ask.
5. **Proportionality (P2) is a hard rule.** Design-system work must never block the Friday slice.
6. **Do not invent product requirements.** Where information is missing, make a sensible assumption, label it "ASSUMPTION," and list it in your completion report.

---

# P1 — Application context (template placeholders, filled)

| Field | Value |
|---|---|
| Application name | **Cadence** (working title; rename later must be a token/string change, not a refactor) |
| Application type | Personal task & time-management PWA with an autonomous scheduling engine and a conversational agent with memory |
| Product description | Replaces a paper planner: fast mobile capture, calendar time-blocking, focus rounds, reminders via Telegram/push/email, an engine that automatically and **visibly** reschedules missed work, and an agent that learns how the user works. |
| Target users | One user now (a student/full-stack developer running hackathons, coursework, and programs at once). Built multi-user-safe (RLS) but **no multi-user UI** is in scope. |
| Primary persona | "Deadline-driven builder": phone-first capture between things, laptop for planning; unreliable Wi-Fi at events; travels across timezones; will distrust any automation that acts silently. |
| Secondary persona | Deferred (future teammate). Do not design for it. |
| Core flows | Quick capture → Today/Start → Focus round → Calendar time-blocking → Reminder received (Telegram/push) → Auto-reschedule review/undo → Agent chat + undo → Memory transparency & confirmation → Paper-photo import confirm queue → Plan-my-day / Close-my-day → Onboarding & Settings |
| Business domain | Personal productivity / time management |
| Platforms | PWA (mobile-first, installable), desktop browser. Telegram is a second *content* surface (text only — content rules in P20 apply; you don't design its UI). |
| Devices | iPhone (installed PWA), Android phone, laptop. Dev machine is Windows; CI is Linux. |
| Tech stack (verified) | React + TypeScript + Tailwind + shadcn/ui (Radix) · Express · Clerk (auth) · Supabase (Postgres, RLS, `pg_cron`, `pgvector`, Storage) · Drizzle · OpenAPI → Orval → Zod + react-query · pnpm workspaces (`artifacts/`, `lib/`, `scripts/`) |
| Brand direction | Apple Human Interface Guidelines (Clarity / Deference / Depth) + an *approximation* of Apple's Liquid Glass for chrome only; System Orange as the "energy" accent; dark-mode-first; no generic motivational copy |
| Reference products | Things 3 (closest category benchmark), Apple Reminders/Clock/Timer, Structured (day timeline), Sunsama (planning ritual), Reclaim.ai/Motion (auto-scheduling — borrow the mechanics, not the opacity), TickTick (all-in-one density), Linear (calm density) |

**Locked product decisions that constrain design (do not re-litigate):**

| Decision | Value | Design consequence |
|---|---|---|
| Home timezone default | `Asia/Kolkata` | Timezone-change notice pattern (P19); times show tz when it differs from the working tz |
| Auto-reschedule default | `auto` on first miss → downgrades to `ask` on the second miss of the same task | Both an "auto-moved" state and an "asks first" proposal state must exist (P11, P15) |
| Reschedule cap | 5 auto-moves per task, then "needs attention" | Log items show "n of 5"; needs-attention is a first-class state |
| Agent bulk-confirm threshold | actions touching >10 tasks require explicit confirm | Action-preview + confirm pattern (P15) |
| Streaks | strict — a missed day resets it; **no** streak-freeze | Broken-streak copy must be neutral, never shaming (P20) |
| Memory | re-confirmation split by source; transparency screen ships in the first memory build | Memory screen + confirmation prompt are P0 for the memory module (P11, P15) |
| Automation safety | manual kill switch (`automation_paused`) | Global "Automation paused" banner (P17) |
| LLM providers | free-tier-first fallback chain (NIM → Groq/OpenRouter → HF) | Rate-limit/queued/fallback states + data-disclosure UX (P15, P27) |

**Labeled assumptions (correct me if wrong):**
- ASSUMPTION: no dedicated designer; code is the source of truth, Figma optional (P24).
- ASSUMPTION: English-only UI now; locale-aware formatting from day one; translation framework deferred (P19).
- ASSUMPTION: single-user, so avatars/teams/roles/permissions-management UI are out of scope.
- ASSUMPTION: task lists stay in the hundreds-to-low-thousands (personal scale) — "millions of rows" behaviors are specified as N/A, not built.

---

# P2 — Proportionality rule and build tiers (read before planning anything)

Enterprise-grade **decisions**, personal-scale **build**. A design system that takes longer to build than the app it serves is the failure mode doc 4 warned about. Everything below is specified; it is *built* by tier:

| Tier | Meaning | Contents |
|---|---|---|
| **P0 — now** | Needed for the Friday slice and the core loop | Tokens + light/dark theme + contrast script; type/spacing/radius/elevation/motion foundations; accessibility baseline; ~15 core components (via shadcn); the Cadence domain components for Today/capture/Focus (NextUpCard, TaskRow, QuickCaptureSheet, ActivityRings, FocusTimer); Today template; navigation shell; states matrix; feedback/empty/error basics; a `/__design` living style page |
| **P1 — soon** | Needed as their modules get built or before trusting the app daily | Remaining components; Calendar/TimeBlock; density modes; full responsive matrix; Review/analytics; AI UX components (built *with* the agent module, not before); visual regression on key screens; full a11y pass incl. screen-reader/device testing; Storybook only if the `/__design` page proves insufficient |
| **P2 — specified, deferred** | Real but not worth building now | Figma variable library + token sync; RTL; translation framework; multi-brand theming; formal governance workflow; maturity-level 3+ machinery; dashboard widget reordering; data-table features for huge datasets |

**Hard rules:**
- P0 work must not delay the Friday slice (signed-in Today + typed quick-add + one real Telegram reminder). If the design-system phases DS-0…DS-4 aren't finished by then, **ship the slice on the existing UI** and continue afterward.
- Any single design-system task that balloons beyond its estimate gets **cut or simplified, not pushed through**. Report it and ask.
- Never add a component "for completeness." A component is built when a real screen needs it (rule of three — P29).
- Don't overfit the system to one page, and don't over-generalize it beyond this product.

---

# P3 — Philosophy and principles

Every principle below has a *why*, a *when/how*, and an *avoid*. Use this table as the tiebreaker whenever a design decision is unclear.

| Principle | Why it exists | Apply it by | Avoid |
|---|---|---|---|
| **Clarity, Deference, Depth** (Apple HIG) | Content is the product; chrome should recede; hierarchy should come from type and layering, not decoration | Strong type hierarchy, generous spacing, glass only on chrome (nav, sheets), flat surfaces for content | Decorative gradients, shadows on everything, chrome louder than content |
| **Start-first** | The user's core failure is *starting*, not organizing | The single most prominent element on Today is always **Start** on the next task; one tap begins a focus round | Making the user navigate/decide before they can begin |
| **Momentum over cheerleading** ("energy, not pretending") | Motivational filler is noise; visible real progress is motivating | Activity Rings, real counts, a rewarding completion micro-interaction | "You've got this!", confetti on trivial actions, fake streak pressure |
| **Automation is never silent** | Doc 4 problem 2 and doc 9: silent automation destroys trust | Every automated change shows what changed, why, and a one-tap undo; AI-caused items carry a visible tag | Invisible reschedules, auto-actions with no log, undo buried in menus |
| **Reversibility over confirmation** | Confirm dialogs train reflexive "OK"; undo is honest and faster | Undo snackbar for routine actions; confirmation only for irreversible or >10-item agent actions | Modal "Are you sure?" on everything |
| **Predictability** | An app you rely on must behave the same every time | Same action → same result, same place, same wording everywhere | Context-dependent surprises, moving controls |
| **Progressive disclosure** | Day-one simplicity, power on demand | Rounds, matrix, memory, and log are one step away, never in the way | Showing every capability on the home screen |
| **Feedback for every action** | Silence reads as failure | Optimistic UI + confirmation appropriate to the action (P17) | Spinners with no context; success with no signal |
| **Error prevention** | Cheaper than error handling | Live parse preview in quick-add, disabled-with-reason controls, guarded destructive actions | Letting the user commit a misparse |
| **Calm urgency** | Overused red makes the app feel anxious | Red only for genuinely overdue/at-risk; everything else neutral or accent | Red badges as decoration; alarmist copy |
| **Trust & explainability** | An agent that acts on your calendar must be legible | "Why?" on every AI action; show what it did and did not touch; show what data it used | Anthropomorphic personality, hidden reasoning, confidence theater |
| **Recoverability** | Failure is expected (offline, rate limits, closed app) | Never lose typed text; timers survive backgrounding; queued offline writes; graceful degraded modes | Data loss on refresh/back/offline |
| **Density follows context** | Phone = comfortable; desktop planning = denser | Density tokens (P8) keyed to pointer/viewport | One density everywhere; tiny touch targets |
| **Simplicity vs density** | Personal app: simplicity wins by default | Default density is calm; compact only where scanning many rows helps (log, calendar week) | Enterprise-dense screens for a one-person app |

---

# P4 — Design-system architecture (layers)

```
Brand → Principles → Foundations → Tokens → Primitives → Core components
      → Composite (Cadence domain) components → Patterns → Templates → Pages/Experiences
```

| Layer | Belongs here | Must NOT be here |
|---|---|---|
| Brand | Name, tone, accent, glass/energy character | Any component or pixel value |
| Principles | P3 | Implementation details |
| Foundations | Type scale, spacing scale, radii, elevation, motion, icon rules, breakpoints | Component-specific overrides |
| Tokens | Named values (global → alias → semantic → component) | Raw values scattered in components; layout logic |
| Primitives | Unstyled/lightly-styled building blocks (Radix/shadcn) wrapped once | Cadence business concepts |
| Core components | Button, Input, Sheet, Toast… consuming semantic tokens | Data fetching; domain rules |
| Composite (domain) | TaskRow, NextUpCard, TimeBlock, ActivityRings… composed from core + domain types | New raw values; one-off page styling |
| Patterns | Reusable flows (capture, approve, undo, import-confirm) | Page-specific layout |
| Templates | Page skeletons (Today, Calendar, Settings…) | Real data or business logic |
| Pages | Templates + data + routing | New visual decisions (all decisions come from lower layers) |

**Anti-duplication rule:** before creating anything, search the layers below for an existing component or a variant that fits (P29 decision tree). A page may not define its own button, card, chip, or sheet.

---

# P5 — Design tokens

**Tier: P0.** Tokens are the single source of truth. Components consume **semantic** tokens only; raw values live only in the global layer.

## 5.1 Token layers and naming

| Layer | Purpose | Example (JSON path → CSS variable) |
|---|---|---|
| **Global** | Raw palette/scale values, theme-agnostic | `color.orange.500` → `--cad-color-orange-500` |
| **Alias** | Brand-level meaning of a global | `color.accent.base` → `--cad-color-accent-base` (= orange.500) |
| **Semantic** | Role in the UI; **themed** (light/dark/high-contrast override these) | `color.bg.canvas`, `color.text.primary`, `color.interactive.primary` |
| **Component** | Per-component decisions referencing semantics | `button.primary.bg` → `--cad-button-primary-bg` |

**Naming convention:** `--cad-{category}-{role}[-{variant}][-{state}]`, kebab-case, lowercase; JSON paths use dots. Examples: `--cad-color-bg-canvas`, `--cad-color-text-secondary`, `--cad-space-4`, `--cad-radius-md`, `--cad-shadow-2`, `--cad-motion-duration-base`. Themes change semantic values only (via `[data-theme="dark"]` / media queries), never component code.

## 5.2 Token categories (all must exist; values in P6–P10)

Color (global ramps, semantic roles, status, AI, data-viz) · Typography (family, size, weight, line-height, tracking, numeric) · Spacing · Sizing (control heights, tap targets, icon sizes) · Grid/layout (columns, gutters, margins, container widths, breakpoints) · Border (width, style, color roles) · Radius · Elevation/Shadow · Glass/material · Opacity (disabled, overlay, hover/pressed tints) · Motion (duration, easing, spring) · Z-index · Focus indicator · Density · Interaction-state tints.

## 5.3 Rules

- **Tokens MUST be used for:** color, spacing, radius, shadow, z-index, duration/easing, font size/weight/line-height, control sizes.
- **Raw values are acceptable only for:** the global layer itself; SVG path geometry; intermediate keyframe positions; a third-party override where a variable can't reach (document it in a comment with the reason).
- **Forbidden:** arbitrary Tailwind values (`bg-[#…]`, `p-[13px]`, `rounded-[7px]`); hex/rgb in component files; inline style colors. Enforce with a lint rule or a CI grep (P25) — a failing check, not a guideline.
- Component tokens exist only when a component genuinely needs a different decision than its semantic default. Don't create one per component reflexively.
- **Brand customization:** rename/re-accent must be achievable by changing `color.accent.*` and the app-name string only.
- **High-contrast tokens:** a `forced-colors` / `prefers-contrast: more` override layer mapping semantics to system colors and stronger borders (P23).
- **Data-viz tokens:** a separate `color.viz.*` set (categorical, ring, sequential) — never reuse semantic status colors for category encoding.

## 5.4 Token file and outputs

`tokens/tokens.json` (single source) → build script generates: `tokens.css` (CSS variables, all themes), a Tailwind theme extension mapping utilities to the variables, and TS types. Same single-source philosophy as the existing OpenAPI → Orval pipeline. Details in P25.

---

# P6 — Color system

**Tier: P0.** Starting values below are **hand-computed and must be re-verified by script** (P25: `verify-contrast`). The verified ratio for every foreground/background pair goes into `tokens.json` metadata and the QA evidence. If a value fails, adjust it and record the change — don't ship "close enough."

## 6.1 Semantic colors (starting values)

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg.canvas` | `#F5F5F7` | `#000000` | App background |
| `bg.surface` | `#FFFFFF` | `#1C1C1E` | Cards, rows, panels |
| `bg.raised` | `#FFFFFF` + elevation 2 | `#2C2C2E` | Popovers, menus, raised cards |
| `bg.sunken` | `#ECECF0` | `#0B0B0C` | Wells, inset areas, ring tracks |
| `bg.overlay` (glass) | `rgba(255,255,255,.72)` | `rgba(28,28,30,.72)` | Nav bar, sheets, quick-capture (with backdrop blur) |
| `text.primary` | `#1D1D1F` | `#F5F5F7` | Headlines, body |
| `text.secondary` | `#6E6E73` | `#98989D` | Metadata, captions (≈4.65:1 on `#F5F5F7`) |
| `text.tertiary` | `#8E8E93` | `#6E6E73` | **Non-essential only** (≈3.3:1 on white — never for information the user needs) |
| `text.on-accent` | `#1D1D1F` | `#1D1D1F` | Text/icons on orange fills (**dark, not white**) |
| `border.subtle` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.12)` | Dividers, card edges (decorative) |
| `border.control` | `#8E8E93` | `#6E6E73` | **Input/control boundaries** — must be ≥3:1 against the surface (WCAG 1.4.11). Hairline `border.subtle` is NOT sufficient for inputs. |
| `interactive.primary.bg` | `#FF9500` | `#FF9F0A` | Primary CTA, **Start**, active timer/round |
| `interactive.primary.text-safe` | `#B25000` | `#FF9F0A` | Orange used **as text or thin icon on light backgrounds** (≈5.2:1) |
| `interactive.secondary` / `link` | `#0040DD` | `#0A84FF` | Secondary actions, links (system blue `#007AFF` is only ≈4.0:1 on white) |
| `focus.ring` | `#0040DD` | `#0A84FF` | 2px ring + 2px offset, ≥3:1 against adjacent colors |
| `status.success.fill` / `.text` | `#34C759` / `#1E7B34` | `#30D158` / `#30D158` | Completion. Fill for icons/backgrounds *with* a check icon; text-safe for text (≈5.3:1) |
| `status.warning.fill` / `.text` | `#FFCC00` / `#8A5A00` | `#FFD60A` / `#FFD60A` | At-risk, caution |
| `status.danger.fill` / `.text` | `#FF3B30` / `#D70015` | `#FF453A` / `#FF453A` | **Overdue/at-risk/destructive only** (fill ≈3.55:1 on white passes graphics, not text; text-safe ≈5.4:1) |
| `status.info` | = link | = link | Informational |
| `ai.fill` / `ai.text` | `#5E5CE6` / `#3634A3` | `#7D7AFF` / `#7D7AFF` | **Anything the agent or automation did** (dark indigo must be lighter than `#5E5CE6`, which is only ≈3.4:1 on `#1C1C1E`) |
| `ai.tint` | indigo @ 12% | indigo @ 16% | AI-tag backgrounds |
| `state.hover` / `.pressed` | 6% / 12% black overlay | 8% / 16% white overlay | Interaction tints (apply via overlay tokens, not new colors) |
| `state.selected` | accent @ 12% | accent @ 16% | Selected rows/blocks |

**Contrast findings that drove these choices** (hand-computed, verify by script): orange `#FF9500` on white ≈ **2.2:1 (fails)**; dark `#1D1D1F` on orange ≈ 7.7:1 (passes); green `#34C759` on white ≈ 2.2:1 (fails as text/icon); red `#FF3B30` on white ≈ 3.55:1 (graphics only); blue `#007AFF` on white ≈ 4.0:1 (fails small text). Dark-mode fills pass (orange on `#000` ≈ 10:1, on `#1C1C1E` ≈ 8:1).

## 6.2 Data-visualization and category colors

- **Activity Rings:** tasks = orange (`viz.ring.tasks`), focus rounds = teal (`#30B0C7` light / `#40C8E0` dark), streak = yellow (`#FFCC00` / `#FFD60A`); tracks use `bg.sunken`. Rings are *supplementary to numbers* — the count is always shown as text in text tokens, so ring fills may use brand fills without failing 1.4.11. Ring identity is carried by position, icon, and label, never color alone.
- **Project/category colors:** a separate categorical set of ~8 hues that **excludes** red, green, orange, and indigo (those are semantic). Every color always pairs with a label, initial, or icon. The agent picks hex values that pass 3:1 against `bg.surface` in both themes.
- **Charts (P1):** categorical `viz.cat.1…8`, sequential ramp for intensity, and a diverging ramp only if needed; max 5 series per chart; direct labels over legends where possible; patterns/dashes for series distinction so charts survive color-blindness.

## 6.3 Rules

- **Semantic exclusivity:** red = overdue/at-risk/destructive only · green = completed/success only · indigo = AI/automation-caused only · orange = action/energy/active-now · blue = links/secondary · yellow = caution. Never repurpose a semantic color for decoration or categories.
- **Never communicate by color alone** (WCAG 1.4.1): every status color is paired with an icon/shape and a text label (P9 table, P12).
- **Contrast targets:** normal text ≥4.5:1; large text (≥24px, or ≥19px bold) ≥3:1; UI components and required graphics ≥3:1; focus indicators ≥3:1; disabled is exempt but must remain perceivable and explained (P12).
- **Dark mode is designed, not inverted:** elevation is expressed by lighter surfaces and borders, not shadows; saturated fills are slightly lightened; re-verify every pair.
- **Color-blindness QA:** simulate protanopia, deuteranopia, and tritanopia on Today, Calendar, and the reschedule log; all states must remain distinguishable.
- **No arbitrary colors.** If a screen "needs" a color that isn't in the system, that's a system decision to propose, not a local hex.

---

# P7 — Typography

**Tier: P0.**

- **Family strategy:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Segoe UI", Roboto, "Noto Sans Tamil", "Noto Sans Devanagari", system-ui, sans-serif`. This renders as San Francisco natively on Apple devices with **no embedding** (SF Pro is not licensed for general web embedding). **Inter (variable, self-hosted, Latin subset)** is the cross-platform fallback. No third-party font CDN (privacy, CSP, performance). User-entered task text may be Tamil/Telugu/Hindi — the fallback stack must render those scripts without tofu, and `dir="auto"` applies to user content.
- **Loading:** `font-display: swap`; preload only the Inter roman file if it's actually used; tune fallback `size-adjust`/`ascent-override` to minimize layout shift.
- **Monospace** (IDs, code, correlation refs): `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- **Numeric:** `font-variant-numeric: tabular-nums` for timers, counts, times, log tables, and anything that updates in place (prevents jitter).
- **Sizing is `rem`-based** (16px root) so user font-size settings and zoom work; never fixed `px` for text.

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `type.timer` | 56–72 / 1.0 (tabular) | 600 | −0.02em | Focus timer digits |
| `type.large-title` | 34 / 41 | 700 | −0.022em | Screen titles (collapse on scroll, mobile) |
| `type.title-1` | 28 / 34 | 700 | −0.02em | Section heroes |
| `type.title-2` | 22 / 28 | 600 | −0.014em | Section titles |
| `type.title-3` | 20 / 25 | 600 | −0.01em | Card/sheet titles |
| `type.headline` | 17 / 22 | 600 | 0 | Row titles, labels |
| `type.body` | 17 / 24 | 400 | 0 | Body, notes, agent text |
| `type.callout` | 16 / 22 | 400 | 0 | Secondary body |
| `type.subhead` | 15 / 20 | 400/500 | 0 | Metadata rows |
| `type.footnote` | 13 / 18 | 400 | +0.005em | Captions, hints |
| `type.caption` | 12 / 16 | 500 | +0.01em | Chips, badges (never for essential info) |

**Rules:** max line length ~65ch for notes and agent text · task titles clamp to 2 lines on mobile (full text in detail view), never mid-word truncation without ellipsis · `overflow-wrap:anywhere` for long unbroken strings (URLs, IDs) · chips truncate with ellipsis and full text on focus/long-press · labels never wrap into two-line buttons — shorten the copy instead · large numbers use tabular figures and locale grouping (P19) · dense areas (logs, week calendar) use `subhead`/`footnote`, never below 12px, never below 4.5:1.

---

# P8 — Spacing, layout, responsive behavior, density

**Tier: P0 (density modes: P1).**

## 8.1 Spacing and shape

- **Base unit 8px; 4px allowed as a half-step** for tight internal gaps (icon-to-label). Scale: `space.0=0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64`.
- **Page margins:** 16 (mobile) · 24 (tablet) · 32 (desktop). **Section spacing:** 24 (mobile) / 32 (desktop). **Card inset:** 16. **Stack gaps:** 8 (tight) / 12 (default) / 16 (loose).
- **Radius:** `xs 6 · sm 10 · md 14 · lg 20 · xl 28 · full`. **Concentric rule:** inner radius = outer radius − padding, so nested shapes look continuous (the Apple hardware/software feel).
- **Tap targets:** minimum **44×44px** for every touch-interactive element (stricter than WCAG 2.2's 24px minimum — deliberate). Compact density may go to 32px **only when `(pointer: fine)`**.
- **Elevation:** `e0` flat · `e1 0 1px 2px rgba(0,0,0,.06)` · `e2 0 4px 12px rgba(0,0,0,.08)` · `e3 0 12px 32px rgba(0,0,0,.14)`. Dark mode: near-zero shadows; use `bg.raised` + `border.subtle`.
- **Glass (chrome only):** `background: bg.overlay; backdrop-filter: blur(20px) saturate(180%); border: 1px solid border.subtle`. **Fallbacks:** opaque `bg.raised` when `backdrop-filter` is unsupported or `prefers-reduced-transparency: reduce`. Never use glass for body content or text-heavy areas.

## 8.2 Layout rules

- **Mobile-first**, built up through breakpoints. Breakpoints: `sm 480 · md 768 · lg 1024 · xl 1280 · 2xl 1536`; design minimum 360px.
- **Grid:** 4 columns (mobile, 16 gutter) · 8 (tablet, 24) · 12 (desktop, 24). **Containers:** Today 720 max · lists/forms 960 · calendar 1200 · anything wider caps at **1440 and centers** (ultra-wide never stretches lines).
- **Use:** Flexbox for one-dimensional flow · CSS Grid for two-dimensional layouts (calendar, week view, settings) · `position: sticky` for headers/day labels · `position: absolute` **only** for overlays and calendar block placement, driven by computed style variables — never for general layout. No arbitrary pixel positioning without a documented reason.
- **PWA safe areas:** `viewport-fit=cover`; pad with `env(safe-area-inset-*)` on top bar, bottom tab bar, and sheets; use `100dvh`, never `100vh`; the bottom tab bar and quick-capture must not obscure focused inputs (WCAG 2.2 "focus not obscured").
- **Vertical rhythm:** consistent section gaps (above); headings sit closer to their content than to the previous section.

## 8.3 Responsive behavior matrix (explicit — not "make it responsive")

| Element | < 768 (phone) | 768–1023 (tablet) | 1024–1535 (laptop/desktop) | ≥ 1536 |
|---|---|---|---|---|
| Navigation | Bottom tab bar (5 slots, P16) | Left rail (icons + labels) | Left sidebar, collapsible | Same, content capped |
| Today | Single column: NextUp → rings → timeline → attention | Same, wider gutters | Two columns: timeline (left), NextUp + rings + attention (right) | Capped at container width |
| Calendar | **Day** default + month strip; week is scroll-snap; month shows agenda list below | Week default | Week/month with side panel for task detail | Capped |
| Task lists | Full-width rows, swipe actions **plus** row menu | Rows with inline meta | Rows + inline actions on hover/focus | Capped |
| Dialogs | **Bottom sheets** (swipe to dismiss, drag handle) | Sheets or centered modal (≤560px) | Centered modal / right drawer | Same |
| Tables (log, memory, usage) | **Card list** — each row becomes a card, key fields first | Compact table | Table with sortable columns | Capped |
| Forms/Settings | Grouped rows, one column | Same | Two-pane (groups left, detail right) | Capped |
| Charts | Simplified (sparkline/fewer ticks, direct labels) | Full | Full + legends where needed | Capped |
| Agent | Full-screen tab | Full-screen or right panel | **Persistent right panel** option | Panel resizable |
| Task detail | Full-height sheet | Right drawer | Right drawer, list stays visible | Same |

**When space is constrained:** chips collapse to `+N` · toolbars overflow into a menu · action buttons drop labels to icon-only **only** when unambiguous *and* with `aria-label` + tooltip, otherwise go to an overflow menu · timeline hour labels thin out · never let content require horizontal page scroll (wide content scrolls in its own container).

## 8.4 Density system (P1)

| Mode | When | Row height | Control height | Padding |
|---|---|---|---|---|
| **Comfortable** | Default on touch/phone | 56 | 48 | 16 |
| **Default** | Tablet, general | 48 | 44 | 12–16 |
| **Compact** | Desktop with `(pointer: fine)` only, for log/calendar/memory tables | 36 | 32 | 8–12 |

Density changes spacing and row/control heights via tokens only. It never reduces text below 12px, never drops touch targets under 44 on touch, and never changes information hierarchy.

---

# P9 — Iconography

**Tier: P0.** SF Symbols cannot be used on the web, so use **Lucide** (ships with shadcn) with one consistent treatment.

- **Style:** outline, rounded caps/joins, stroke **1.75**, 24px grid, sizes `16 / 20 / 24` (`icon.sm/md/lg`), optically centered with adjacent text (align to cap-height, not the box).
- **Filled variants** only for selected/active states in the tab bar.
- **Naming:** `icon.{semantic}` maps semantic meaning → glyph, so swapping a glyph is one edit.
- **Decorative icons** get `aria-hidden="true"`. **Icon-only controls** always get `aria-label` (and a tooltip on hover-capable devices). **Never use an icon as an unexplained replacement for important text**; when meaning isn't universal (auto-move, needs-attention, fixed), show icon **+ label**.

| Meaning | Icon (suggested Lucide name — verify it exists) | Always paired with |
|---|---|---|
| Done | `check-circle-2` | Text "Done" / strike-through |
| Overdue / at risk | `triangle-alert` | Text "Overdue" / "At risk" |
| Scheduled | `clock` | Time text |
| Running | `play` / ring | "Running" + time |
| Paused | `pause` | "Paused" |
| Auto-moved / automation | `calendar-clock` with AI tag | "Auto-moved" |
| Agent-made | `sparkles` | "Agent" |
| Needs attention | `flag` | "Needs attention" |
| Fixed (immovable) | `lock` | "Fixed" |
| Proposed (awaiting you) | `calendar-plus` (dashed outline) | "Proposed" |
| Offline / queued | `cloud-off` | "Offline — n queued" |
| Priority high/med/low | `chevrons-up` / `chevron-up` / `minus` | "High/Medium/Low" |

---

# P10 — Motion

**Tier: P0 (foundations) — motion must communicate CAUSE, CHANGE, FEEDBACK, HIERARCHY, CONTINUITY, or be removed.**

**Tokens:** durations `instant 0 · fast 120 · base 200 · slow 320 · deliberate 480` ms. Easing: `standard cubic-bezier(0.2,0,0,1)`, `decelerate cubic-bezier(0.05,0.7,0.1,1)` (entrances), `accelerate cubic-bezier(0.3,0,0.8,0.15)` (exits). **Spring** (Apple's physical feel) for movable things: `stiffness ~380, damping ~30, mass 1` if a spring library is in use, otherwise CSS `linear()`/cubic approximations.

| Interaction | Motion | Notes |
|---|---|---|
| **Complete a task** | Checkbox fills (120) → checkmark draws (200) → row settles into completed style (320); rings update live via spring | The signature reward; it's the "energy" — keep it crisp, not long |
| **Start (press)** | Press-down scale ~0.98 + tint (fast) → transitions into the running state with a shared-element feel | One tap must feel immediate: optimistic state first, server confirm after |
| Sheet present/dismiss | Spring in from bottom / decelerate; swipe-to-dismiss follows the finger | Backdrop fades (base) |
| Ring fill | Animate **from the previous value**, never from zero | Reduced motion: jump to value |
| Daily ring closed | One subtle pulse/glow (deliberate), **once per day** | No confetti, no sound |
| List insert/remove | Height + fade (base), neighbors reflow with spring | Avoid layout jank |
| Toast / undo bar | Slide + fade in (base), out (fast) | Pauses on hover/focus |
| Skeleton | Static shape blocks with an optional very slow shimmer | Shimmer off for reduced motion |
| Page/tab change | Cross-fade or shared slide (base); no theatrical transitions | |
| Active timer | Digits update in place (tabular); **no** looping pulse animation | Ambient loops are distraction |
| Proposal/AI card appear | Fade + rise (base) | Draws attention exactly once |

**Reduced motion (`prefers-reduced-motion: reduce`):** replace translations/scales/springs with opacity or instant changes, remove shimmer and ring sweeps, keep state changes clearly visible (color/icon/text). Nothing may be *lost* — only de-animated.
**Performance:** animate `transform` and `opacity` only; no layout-thrashing properties; no animation on scroll-linked heavy paint.
**Avoid:** decorative motion, motion that delays a user action, anything that blocks input.

---

# P11 — Component library

**Tier: see per row. Build a component only when a real screen needs it.** Every component, before it is built, gets a spec using the template in 11.3.

## 11.1 Cadence domain (composite) components — the ones that make this product itself

| Component | Tier | Purpose & variants | Required states | Non-negotiables |
|---|---|---|---|---|
| **NextUpCard (Start)** | P0 | Today's hero. Variants: next-task · no-task (pick from backlog / capture) · running (embeds timer + Pause/Finish) · break | idle · pressed · starting · running · paused · disabled-with-reason · error (retry, state preserved) | The single most prominent element on Today. One tap starts a round. Min height 72. `interactive.primary.bg` fill with `text.on-accent`. Shows title (2-line clamp), estimate, "round n of target". |
| **ActivityRings** | P0 | 1–3 concentric rings (tasks, rounds, optional streak); sizes 48 / 120 / 200 | empty · partial · complete · over-target · loading · reduced-motion | Counts always shown as text beside the graphic; accessible name "3 of 5 tasks, 2 of 4 rounds"; animates from previous value; a reset streak renders neutrally, never as a failure state. |
| **TaskRow** | P0 | default · compact · scheduled (time chip) · overdue · auto-moved (AI tag) · needs-attention · agent-created | default · hover (hover-capable only) · focus-visible · pressed · selected · completing · completed · archived · dragging · disabled | 44px checkbox target; 2-line title clamp; **swipe actions are never the only path** (row menu always exists); completion shows the undo bar; meta wraps by priority (time > project > duration). |
| **QuickCaptureSheet** | P0 | Glass sheet; one field + live **parse chips** (date, time, duration, `#tag`, project) | idle · typing · parsed · ambiguous (chip asks, tap to resolve) · saving (optimistic) · saved · error (text retained) · offline (queued) | Reachable in **one tap from every screen**; keyboard opens immediately; **never loses text**; Enter saves; chips are editable/removable; preview prevents committing a misparse. |
| **FocusTimer** | P0 | Full-screen and **mini chip** (persistent above the tab bar) | idle · running · paused · break · finished · **recovered** (app was closed/backgrounded) · sync-failed-but-running | Tabular digits; controls ≥56px; announces start/pause/finish and remaining time **on request only** (never every second); state survives backgrounding and reopen. |
| **StatusIndicator / PriorityMark** | P0 | Icon + label + semantic color per the P9 table | per semantic | Never color alone. |
| **UndoBar** | P0 | Snackbar with one action (Undo), ~6–8s, mirrors into the action log | entering · visible · paused (hover/focus) · undone · expired | Polite live region; keyboard reachable; queue, don't stack. |
| **SystemStatusBanner** | P0 | info / warning / critical. Instances: **automation paused**, offline, timezone changed, reminders may be delayed, session expired | visible · dismissible (where allowed) · action-in-progress | Sticky under the top bar; critical is non-dismissible and carries an action (Resume / Reconnect). |
| **SettingsRow / TimeRangeControl** | P0 | Toggle · select · time range (**supports ranges crossing midnight**, drawn as a bar on a 24h track) | default · saving · saved · error | Autosave; always shows the timezone the range is evaluated in. |
| **ChannelStatus** | P0 (with reminders) | Telegram / Push / Email connection state | connected · unverified · failed · paused | Icon + text; the link-code flow lives here. |
| **AITag / AutomationBadge** | P0 (with agent) | "Agent", "Auto-moved", "Suggested" | default · focus (opens the Why popover) | Indigo + icon + text; always explainable. |
| **TimeBlock** | P1 | manual · auto-placed (AI tag) · fixed (lock) · proposed (dashed outline) · missed | default · hover · focus · selected · dragging · resizing · drop-target valid/invalid · overdue | **A non-drag alternative is mandatory** (tap → time picker; arrow keys move/resize); 15-min blocks stay legible (truncate, don't clip silently). |
| **Calendar (Day/Week/Month + agenda)** | P1 | Views per P8.3 | loading · empty · error · offline | Grid semantics + arrow-key navigation; now-line; timezone label; week start follows locale. |
| **ProposalCard** | P1 | Ask-mode reschedule: old → new slot + alternatives | proposed · approved · declined · expired · failed | Approve / Change / Dismiss; one-line "why"; **never auto-acts on expiry**. |
| **RescheduleLogItem** | P1 | auto · proposed · needs-attention · undone | default · expanded (why) · undone | Shows what / when / why / "2 of 5" / Undo. |
| **TimezoneChangeNotice** | P1 | Banner → sheet when device timezone ≠ profile timezone | shown · resolved (keep home / switch) | **Never silently changes working hours.** |
| **AgentMessage / AgentActionCard / ActionPreview** | P1 (with agent) | See P15 | See P15 | See P15 |
| **MemoryFactCard / ConfirmationPrompt** | P1 (with memory) | See P15 | See P15 | See P15 |
| **ImportDraftRow / ImportQueue** | P1 | Photo thumbnail beside parsed text | pending · edited · accepted · rejected · low-confidence | **Never auto-files**; per-item confidence label; original image always viewable. |
| **EmptyState** | P0 | See P17 | — | Context + explanation + next action. |
| **OnboardingStepper** | P0 (with onboarding) | 3 steps: hours → automation default → optional Telegram link | current · complete · skipped-with-defaults | Back always allowed; skipping applies documented defaults; resumable. |

## 11.2 Standard component inventory (template list → decision)

Base = shadcn/Radix unless stated. "N/A" = deliberately not built, with the reason.

| Component | Tier | Notes |
|---|---|---|
| Button (primary / secondary / ghost / danger; sm-md-lg; loading) · IconButton · Link | P0 | Loading keeps width; icon-only requires `aria-label` |
| Input · Textarea · FormField · Label | P0 | Control border uses `border.control` (≥3:1) |
| Select | P0 | Prefer the native picker on touch |
| Combobox / Autocomplete | P0 | Project/tag picker (Command + Popover); create-on-enter |
| Checkbox (**TaskCheck**, 44px) · Radio · Switch | P0 | |
| Date picker · Time picker | P0 | Time picker is custom, 5/15-minute steps; on mobile, sheet or native |
| Slider | P1 | Round/break length |
| File upload | P1 | Task links, photo import; progress + error states |
| Search | P1 | Postgres full-text; highlights; recent queries |
| Badge · Tag · Chip | P0 | Never the sole carrier of meaning |
| Card · List · Timeline | P0 | Timeline = Today's day view |
| Table | P1 | Reschedule log, memory list, usage — simple, sortable; card list on mobile |
| Tabs · Accordion | P0 · P1 | Accordion for grouped settings |
| Tooltip | P0 | Desktop only; **never** the only place information lives |
| Popover · DropdownMenu | P0 | ContextMenu P2 |
| Command menu (⌘K) | P1 | Search + actions |
| Stepper | P0 | Onboarding |
| Sidebar · Top bar · **Bottom tab bar** | P0 | P16 |
| Toolbar | P1 | Calendar/list controls |
| Modal / Dialog · **Sheet / Drawer** | P0 | Sheets are the default on mobile |
| Toast · **Snackbar (Undo)** | P0 | Sonner-based; Undo variant is its own component |
| Banner · Alert | P0 | SystemStatusBanner builds on Banner |
| Empty · Skeleton · Progress · Spinner · Error · Success | P0 | Skeleton over spinner; spinner only inside buttons |
| Charts / data visualization | P1 | Analytics; max 5 series; direct labels |
| Code block | P2 | Only if agent output needs it |
| Keyboard-shortcut hint | P1 | Desktop only |
| Avatar | P2 | Single-user; account row only |
| Notification center | P2 | Telegram is the notification surface |
| Tree view · Breadcrumbs · Pagination | **N/A** | Flat information architecture; lists use cursor/infinite loading + archive |
| Command bar (separate from ⌘K) | **N/A** | Merged into the command menu |

## 11.3 Per-component spec template (produce before building each component)

Purpose · Usage and when *not* to use · Anatomy · Variants · Sizes · States (from P12) · Props · Slots · Content rules · Interaction rules · Responsive behavior · Accessibility (role, name, keyboard, focus order) · Loading / Error / Empty / Disabled behavior · Dark mode · RTL (logical properties) · Localization notes · Do / Don't · Composition rules · Tokens consumed · Figma mapping (P2) · Code mapping (file path, props API, story/`/__design` entry).
P0 components: write the full spec first. P1: before build. Don't write specs for N/A or P2 items.

---

# P12 — Component states

**Tier: P0.** No interactive component ships without its applicable states explicitly designed *and demonstrated on `/__design`.*

**State vocabulary:** default · hover · focus-visible · pressed · active/selected · disabled · loading · error/invalid · success · warning · readonly · expanded/collapsed · dragging/drop-target.

| Component class | hover | focus-visible | pressed | selected | disabled | loading | error | success | readonly | expanded | drag/drop |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Button | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — | — | — |
| Input / Textarea | ✓ | ✓ | — | — | ✓ | ✓ (async) | ✓ | ✓ | ✓ | — | — |
| Checkbox / Radio / Switch | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | — |
| Select / Combobox | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — |
| TaskRow | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (completing) | ✓ (sync failed) | ✓ (completed) | — | ✓ (detail) | ✓ |
| Interactive card | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — |
| Tab / nav item | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Menu item | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ (submenu) | — |
| TimeBlock | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ (fixed) | — | ✓ |
| Sheet / Dialog | — | ✓ (trap) | — | — | — | ✓ | ✓ | ✓ | — | ✓ | ✓ (swipe) |
| Toast / Banner | ✓ | ✓ | — | — | — | — | ✓ | ✓ | — | — | — |
| Chip / Badge | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — |

**Rules:**
- **Hover** styles only inside `@media (hover: hover)` — touch devices never get stuck hover states.
- **Focus-visible** is keyboard focus (and programmatic focus after navigation), rendered with `focus.ring` (2px + 2px offset). Never remove outlines without an equal replacement.
- **Pressed** = scale ~0.98 + `state.pressed` tint, within `fast` duration.
- **Disabled is never silent.** Disabled controls use reduced emphasis *and* `aria-disabled`, and the **reason is discoverable** (helper text, or tooltip/long-press) — e.g., Start disabled with "No tasks scheduled — capture one".
- **Loading** preserves width/height (no layout jump), blocks duplicate submits, sets `aria-busy`.
- **Error/success/warning** always pair color with icon **and** text.
- **Readonly** is not disabled: readonly content stays focusable, selectable, and copyable.
- **Selected** is communicated by more than color (check icon, outline weight, or position).

---

# P13 — Forms and validation

**Tier: P0.**

- **Layout:** single column; label above field; helper text below; group with clear section headings. Mark **optional** fields "(optional)" rather than starring required ones. Never use placeholder text as the label.
- **Validation timing:**

| Field / flow | When to validate | Why |
|---|---|---|
| Quick capture | **Not while typing.** Show live *parse chips*; only "non-empty" is checked on submit | Interrupting capture defeats the product |
| Text/title fields | On blur, and on submit | Avoid nagging mid-typing |
| Time ranges (working/quiet hours) | On change (start ≠ end; overnight ranges are valid) | Immediate, cheap, local |
| URL / link fields | On blur | Needs the full value |
| Async (Telegram link code, uniqueness) | On submit, with pending state and timeout | Network dependent |
| Destructive/irreversible | At the confirmation step, not before | Keep the flow light until it matters |

- **Error messages:** inline under the field, linked via `aria-describedby`; on multi-field submit, a summary at the top and focus moves to the first error; message says what's wrong and how to fix it, never blames the user. Preserve all input on error.
- **Autosave over "unsaved changes" dialogs:** task drawer and settings autosave (debounced ~600ms) with a quiet inline "Saved" (fades in ~2s). Quick capture keeps a local draft until saved. Only if a surface *cannot* autosave, show an unsaved-changes prompt.
- **Destructive actions — undo-first policy:** routine deletes/archives/completes use the **Undo snackbar**. A confirmation dialog is reserved for: irreversible data removal (erase/export-purge), deleting a project that contains tasks, and **agent actions touching more than 10 tasks** (P15). Confirmation copy names the consequence and uses a specific verb button ("Delete project and 12 tasks"), never "OK".
- **Multi-step (onboarding, plan-my-day):** progress indicator, back always allowed, skip applies documented defaults, resumable after interruption.
- **Loading/disabled/readonly:** per P12. Submit buttons show pending state and are disabled only to block duplicate submits — never to hide why something is invalid.

---

# P14 — Lists, tables, and dashboards

**Tier: lists P0; tables and Review dashboard P1.**

## 14.1 Lists and tables

- **Task lists:** grouped by day/project with sticky group headers; **virtualize above ~200 rows** (windowing); cursor/infinite loading; archived tasks (completed > N days) live in an Archive view and are excluded from default views but stay searchable.
- **Search/filter:** Postgres full-text search with highlighted matches; filters as removable chips; empty-filter state offers "clear filters" (P17).
- **Tables (reschedule log, memory facts, LLM usage):** sortable columns, filter chips, expandable row for detail, sticky header; **card list on mobile** (P8.3). Column visibility/resizing/pinning are P2 — don't build.
- **Scale statement:** personal scale means hundreds to low thousands of rows; virtualization covers that. "Millions of records," server-side column pipelines, and bulk import/export of huge datasets are **N/A** — note them, don't build them. Data export (JSON/CSV) stays in Settings (P0-adjacent, cheap).

## 14.2 Today and Review (dashboards)

**Today — visual hierarchy, top to bottom:**
1. **NextUpCard / Start** (dominant)
2. **ActivityRings** with counts
3. **Timeline** of today's blocks + unscheduled-but-due items
4. **Attention items** — needs-attention tasks, pending proposals, memory confirmations — **capped at 3** with "See all"
5. Quiet footer (today's totals — facts, no cheering)

**Review (P1):** KPI cards (completion rate, on-time %, focus minutes, reschedule count) · trend charts (14/30 days, comparison against the previous period) · "what slipped and why" (grouped by reschedule reason) · every number drills down to its underlying tasks · states: loading (skeleton) / empty ("needs a few days of activity") / error (retry). Widget reordering, resizing, saved views: **P2**.

---

# P15 — AI UX system (build alongside the agent module, not before)

**Tier: P1 — but the *rules* apply to every AI-touched surface from day one.** The interface must always make clear: **what the AI did · what it did NOT do · what the user can control · what is still processing · what data was used · what action will occur.**

## 15.1 AgentActionCard anatomy

```
┌ ✦ Agent · Rescheduled 4 tasks                    ● Done · 14:02
│ Moved: "PS1 writeup" → Thu 3–4pm  · (+3 more)          [Details ▾]
│ Not changed: 2 fixed events · 1 task set to Off
│ Used: Tasks · Calendar · 2 memory facts
└ [Undo]   [Why?]
```

Every AI/automation action renders these six things: **verb + object count**, **what changed**, **what was deliberately NOT changed**, **data used**, **status**, **controls (Undo / Edit / Approve, and Why?)**. "Why?" opens a short plain-language explanation ("Moved because today was full. This is move 2 of 5.").

## 15.2 States

| State | Presentation | Control |
|---|---|---|
| Thinking / streaming | Streaming text with a named step; no fake progress bars | **Stop** |
| Tool running | "Checking your calendar…" — named, specific | Cancel where safe |
| **Awaiting approval** | ActionPreview: full list of changes; **>10 tasks = explicit Confirm required** | Confirm / Edit / Cancel |
| Executed | Done card + persistent Undo (mirrors into `agent_action_log`) | Undo, Why? |
| **Partial failure** | Lists which items succeeded and which failed, with reasons | Undo succeeded, Retry failed |
| Failed | Plain-language reason + what state things are in ("Nothing was changed") | Retry |
| Undone | Card shows undone with timestamp; original retained in log | — |
| Rate-limited / queued | "Agent is busy — retrying. Your request is queued." Non-blocking; rest of the app unaffected | Cancel |
| Fallback provider used | Silent in the flow; visible in Details and the usage log | — |
| Blocked / unsafe | Clear notice that the request wasn't performed and why | Edit request |
| Offline | Agent unavailable notice; all non-AI features continue | — |

## 15.3 Undo and trust boundaries

- **"Undo last agent action" is always one tap** — in the agent panel header and offered in Telegram — backed by `agent_action_log`.
- **The agent can do nothing the UI can't.** Irreversible operations (permanent deletion, erasing data) are **not exposed to the agent at all**; the UI states this in the agent panel ("The agent can create, edit, move, and complete tasks. It can't permanently delete anything.").
- **Provenance everywhere:** items created or moved by the agent/engine carry the **AITag**; user-made items carry none. Users can always tell "what I did" from "what it did."
- **Anti-anthropomorphism:** no human name or avatar, no claims of feelings or intent, minimal first person. Neutral glyph (✦), plain verbs.

## 15.4 Memory UX (transparency screen is part of the first memory build)

- **"What Cadence knows about me"** — list of active facts. Each **MemoryFactCard** shows: a human-readable statement, **source badge** ("Measured from your data" vs "Inferred from chat"), **confidence as text + meter** (Low / Medium / High — never color alone), evidence count, last reinforced, and actions **Edit / Delete / Archive**.
- **Behavioral (measured) facts update automatically**; the card notes "updates automatically." **Conversational facts always prompt**: a **ConfirmationPrompt** ("I used to think you weren't a morning person, but your last three weeks say otherwise — update that?") appears inline in chat *and* is reviewable on this screen.
- Facts near the pruning floor show a "fading" state; archived facts move to an Archived tab — never silently deleted.
- Empty state: "Nothing learned yet. Patterns appear after about two weeks of activity." No fake facts.

## 15.5 Safety, privacy, and untrusted content

- **Untrusted content marking:** text that entered via photo import, pasted web content, or links is tagged "From imported photo/link." The agent **never follows instructions found inside it**; if instruction-like text is detected, log and show "Ignored instructions found in imported text."
- **Data disclosure ("What's sent to AI providers"):** a Settings surface listing exactly which fields go to a model (task titles/notes/times relevant to the request, selected memory facts) and which never do (keys, credentials). **Free-tier providers may retain prompts** — say so plainly and let the user restrict the agent to certain fields. Data minimization is the default.
- **Long-running jobs:** nightly extraction, import parsing, backups show status in their own screen (last run, next run, result) — not as an infinite spinner.
- Multi-agent orchestration UI: **N/A** (single agent). Feedback thumbs/regeneration: P2.

---

# P16 — Navigation

**Tier: P0.**

- **Mobile (<768): bottom tab bar, 5 slots — Today · Calendar · [＋ Capture] · Agent · More.** The center **＋** (accent) opens QuickCaptureSheet from anywhere ("capture in one tap from every screen" is a rule, not a preference). **More** holds Projects, Review, Memory, Reschedule log, Import, Settings. The running timer appears as a **mini chip above the tab bar** and opens the full timer. Rationale: capture and Start are the two actions that matter; everything else is one step away. (The agent may propose a different arrangement only with usability evidence.)
- **Tablet:** left rail (icons + labels). **Desktop:** collapsible left sidebar with the same destinations plus Projects list; **⌘K command menu** for search and actions (P1); global search field.
- **Back behavior:** sheets dismiss by swipe/`Esc`/scrim tap; stack navigation shows a back affordance with the parent's title; the browser back button always does the expected thing (sheets are history entries).
- **Deep links:** Telegram messages link to `/t/:taskId`, opening Today with the task drawer — same wording as in-app.
- **Prevent overload:** maximum 5 primary destinations at any breakpoint; anything else nests under More/Settings.

---

# P17 — Feedback, empty states, and errors

**Tier: P0.**

## 17.1 Feedback for every meaningful action

| Event | Feedback | Duration | Accessibility |
|---|---|---|---|
| Task completed | Completion micro-interaction + Undo snackbar | ~6–8s | Polite live region: "Completed. Undo available." |
| Task created | Row appears with a brief highlight; no toast | — | Polite: "Added: {title}, {when}" |
| Start pressed | Instant running state (optimistic) | — | "Focus round started" |
| Autosave | Quiet inline "Saved" | ~2s | Polite, not repeated |
| Network error | Non-blocking banner/toast with **Retry**; input retained | until resolved | Assertive for errors |
| **Offline** | Persistent banner "Offline — n changes queued"; syncs automatically | until online | `role="status"` |
| Auto-reschedule happened | Log item + AITag; Telegram message; in-app notice only if the user is viewing the affected day | — | Polite |
| **Automation paused** (kill switch) | Global critical banner "Automation paused — reminders and auto-reschedule are off" + **Resume** | until resumed | Persistent, focusable |
| **Reminders may be delayed** (heartbeat stale) | Warning banner + System health row in Settings (last dispatcher run, last sweep, last backup) | until healthy | Polite |
| Notification permission denied | Inline explainer in Settings with how to re-enable; Telegram offered as the primary channel | persistent | — |
| Session expired | Sheet "Sign in again" that **preserves drafts** | — | Focus moved into sheet |
| Background work (extraction, import, backup) | Status in its own screen; progress bar with real numbers where known | — | `aria-busy` |

## 17.2 Empty states (each: context · explanation · next action)

| Type | Context | Copy pattern | Next action |
|---|---|---|---|
| First use (Today) | Nothing captured yet | "Nothing here yet. Capture your first task." | Focused capture field |
| Nothing scheduled today | Tasks exist, none today | "Nothing scheduled today." | Pick from backlog / Start something |
| Completed state | Everything done | "All done for today: 6 tasks, 3 rounds." — facts only, no cheering | Plan tomorrow |
| No results (search/filter) | Query matched nothing | "No tasks match '{query}'." | Clear filters |
| Calendar range empty | Nothing in range | "Nothing scheduled this week." | Schedule from backlog |
| Agent | No conversation | Example requests that work ("What's overdue?", "Push low-priority to next week") | Tap an example |
| Memory | Nothing learned | "Nothing learned yet. Patterns appear after about two weeks." | — |
| Reschedule log | No automation yet | "No automatic changes yet." | Explain automation modes |
| Import queue | Nothing pending | "No photos waiting." | Import a photo |
| Permission/config | Telegram not linked / notifications blocked | What's missing and what it costs | Link / Enable |
| Error empty | Load failed | What happened + retry | Retry |
| Offline empty | No cache yet | "You're offline and nothing is saved on this device yet." | Retry when online |

## 17.3 Error taxonomy and messaging

| Type | Example | Message pattern | Action |
|---|---|---|---|
| Validation | Bad time range | Names the field + the fix | Correct inline |
| Network | Save failed | "Couldn't save. Your changes are kept and will retry." | Retry / auto-retry |
| Authentication | Clerk session lost | "Sign in again to continue." | Re-auth (drafts preserved) |
| Authorization | RLS denial | Shown as "not found" — never confirms existence | Back |
| Server | 5xx | "Something went wrong on our side." + small reference id | Retry |
| Timeout | Slow request | "Taking longer than usual…" then a retry option | Retry / cancel |
| Rate limit (LLM free tier) | Provider throttled | "Agent is busy. Retrying — your request is queued." | Cancel |
| Conflict | Edited elsewhere | "This changed on another device." | Keep mine / Reload |
| Missing data | Deleted task link | "That task no longer exists." | Back to Today |
| Invalid state | Start with no task | Disabled-with-reason (P12) | Capture |
| AI error | Tool failed | Plain reason + what state things are in ("Nothing was changed.") | Retry |
| File error | Photo too large / unsupported | Limit + supported types | Choose another |
| Automation failure | Dispatcher stale | System banner (P17.1) | View system health |

**Rules:** say what happened, what it means for the user, and what to do next; never show stack traces or raw provider errors; every error that reaches Sentry shows a short **reference id** in details for debugging; retries preserve input; copy is blame-free and specific.
