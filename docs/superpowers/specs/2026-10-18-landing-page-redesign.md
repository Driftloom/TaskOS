# Cadence Landing Page End-to-End Architectural Specification

**Document:** `docs/superpowers/specs/2026-10-18-landing-page-redesign.md`  
**Date:** 2026-10-18  
**Status:** Approved for Implementation  
**Mode:** Persuade (High Craft, Tactical Calm, Zero AI Slop)  
**Author:** AI Agent Pair (Superpowers + Impeccable + Design Taste Frontend v1 + Autoplan)

---

## 1. Executive Summary & Intent

Cadence replaces paper planners (Hobonichi, Bullet Journal) with an honest, distraction-free digital time OS. The current landing page at `/` is an unstyled, 115-line placeholder triad that fails to communicate Cadence's true superpowers:
1. Natural language capture that parses "tomorrow 5pm" instantaneously.
2. Compounding Activity Rings with Web Audio chords that motivate focused execution.
3. A transparent 9-rule auto-reschedule engine that shows its work instead of silently moving tasks.
4. Two-way Telegram bot dispatch for capturing and completing tasks on the move.
5. Absolute data safety: multi-user safe Supabase Postgres RLS with Clerk JWT claims.

This specification outlines the complete redesign of the public front door (`/`) to meet world-class design taste standards (`impeccable`, `design-taste-frontend-v1`, Apple HIG, and Things 3 craft) while strictly respecting Cadence's critical performance invariants: **< 120 kB entry chunk** and **< 200 kB first-visit JS cold load**.

---

## 2. Technical Invariants & Guardrails

| Constraint | Authority / Spec | Hard Requirement |
|---|---|---|
| **Eager Bundle Weight** | `App.tsx` (L27–36), docs/13 §P26.2 | LandingPage is eager; the entry chunk must stay `< 120 kB` raw / `< 30 kB` CSS. No heavy external animation libraries (e.g., GSAP/Three.js/heavy Framer bundles) in this eager surface. Leaf animations use CSS and SVG primitives. |
| **Design Tokens** | `tokens/tokens.json`, `scripts/lint-tokens.cjs` | Zero raw utilities (`text-xs`, `text-sm`, `duration-200` fail lint). Use exclusively semantic tokens: `text-caption`, `text-callout`, `text-macro`, `text-display1..4`, `duration-base`, etc. |
| **Sizing Utilities** | `artifacts/cadence/src/styles/index.css` | Custom token dimensions must use explicit `@utility` classes (e.g. `control-md-h`, `tap-target-h`, `overlay-cta-h`). Check with `pnpm run verify:sizing`. |
| **E2E Anchors** | `tests/e2e/auth.spec.ts`, `navigation.spec.ts` | Must preserve data-testid attributes: `link-landing-sign-up`, `link-landing-sign-in`, `link-landing-download` (conditional for non-standalone). |
| **Accessibility & Contrast** | `scripts/verify-contrast.cjs`, WCAG 2.1 AA | OLED `#000000` dark base, `#1C1C1E` cards, `#84848E` control borders. Every status color paired with distinct icon/shape. 44px minimum touch targets. Reduced motion via `@media (prefers-reduced-motion)` and `useReducedMotion`. |
| **Anti-Emoji Policy** | `design-taste-frontend-v1` §2 | Zero emoji characters in code or copy. Use SVG primitives and `lucide-react` icons (already installed). |

---

## 3. Page Structure & Component Decomposition

The landing page will be modularized into lightweight, single-responsibility components under `artifacts/cadence/src/pages/landing/components/`:

```
artifacts/cadence/src/pages/landing/
├── LandingPage.tsx                     # Main orchestrator with noise overlay and ambient glow
└── components/
    ├── LandingHeader.tsx               # Floating glass navigation bar with brand, sound toggle, auth links
    ├── LandingHero.tsx                 # Asymmetric 50/50 hero: headline + interactive natural capture sandbox
    ├── InteractiveCaptureSandbox.tsx   # Live typing/parsing demo ("review budget tomorrow 5pm #finance")
    ├── LandingBentoGrid.tsx            # Bento 2.0 grid: Activity Rings, 9-Rule Engine, Telegram bot, 24h Blocks
    ├── LandingPhilosophy.tsx           # "Paper-like calm" vs "Admin chore" comparison matrix
    ├── LandingSecurityProof.tsx        # Multi-user RLS architecture, zero trackers, open source
    └── LandingFooter.tsx               # Command deck CTA, APK download, copyright & live status
```

---

## 4. Detailed Section Specifications

### 4.1. Section 1: Floating Glass Header (`LandingHeader.tsx`)
- **Positioning:** Sticky top bar with `backdrop-blur-xl`, `border-b border-white/[0.08]`, `bg-background/80`.
- **Left:** Monogram brand badge ("C" in orange squircle), product name "Cadence", and version badge ("v0.1.6").
- **Right:**
  - Synthesized Web Audio sound toggle (`soundFX.isEnabled` / `soundFX.toggle()`) with volume icon.
  - "Download APK" link (conditional via `useIsStandalone()`).
  - "Sign In" button (`data-testid="link-landing-sign-in"`).
  - "Get Started" CTA (`data-testid="link-landing-sign-up"`).

### 4.2. Section 2: Asymmetric Split Hero (`LandingHero.tsx`)
- **Layout:** Asymmetric 2-column grid (`grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center`).
- **Left Column (7 cols):**
  - Eyebrow: `A PERSONAL TASK & TIME OS` with live pulse dot.
  - H1 Display: `"Make room for the day."` (OLED high-contrast, crisp tracking).
  - Paragraph: Concise, concrete value proposition without filler words:
    > "Cadence replaces the paper planner without turning your life into an administrative chore. Natural language capture, focus momentum, time blocking, and auto-rescheduling that shows its work."
  - Primary Action Cluster:
    - Primary CTA: `"Create your cadence"` (`data-testid="link-landing-sign-up"`) with hover energy and click sound.
    - Secondary CTA: `"Sign In"` (`data-testid="link-landing-sign-in"`).
    - Mobile App CTA: `"Download APK"` (`data-testid="link-landing-download"`).
- **Right Column (5 cols) — `InteractiveCaptureSandbox.tsx`:**
  - Live interactive capture card styled like the Cadence Quick Capture sheet.
  - Interactive input field allowing visitors to type or click preset pills:
    - Pill 1: `"prep team sync tomorrow 10am !p1"`
    - Pill 2: `"deep work session in 2 hours #focus"`
    - Pill 3: `"weekly review every friday 6pm"`
  - Live parser decomposition showing chips in real time:
    - Task title chip
    - Time/Due date chip (`Tomorrow 10:00 AM`)
    - Priority chip (`High Priority`)
    - Project / Tag chip (`#focus`)
  - Tactile "Simulate Capture" button that triggers `soundFX.playPop()` and shows a temporary success card.

### 4.3. Section 3: Bento 2.0 Engine Grid (`LandingBentoGrid.tsx`)
Four asymmetric cards showcasing Cadence's 4 core mechanical systems:

1. **Card A: Activity Rings Momentum (Span 7 cols)**
   - Live rendered SVG Activity Rings with dual concentric loops:
     - Outer ring: Focus rounds completed today (e.g. 3 of 4).
     - Inner ring: Tasks completed today (e.g. 8 of 10).
   - Strict streak indicator ("🔥 12-day streak · Strict, no freeze").
   - Interactive button: "Test completion chime" triggering `soundFX.playCompletionChime()`.
2. **Card B: 9-Rule Auto-Reschedule Engine (Span 5 cols)**
   - Live visual simulation of a reschedule proposal:
     - "Task slipped: Draft quarterly roadmaps"
     - Proposed slot: "Tomorrow 09:30 AM (Rule 9: +25% duration multiplier from past focus telemetry)"
     - Reversible 1-click audit trail ("All moves logged to agent_action_log with instant Undo").
3. **Card C: Two-Way Telegram Bot Dispatch (Span 5 cols)**
   - Mock Telegram message chat bubble:
     - Bot: `"🔔 Reminder: Deep work on architecture due now"`
     - Inline interactive buttons: `[ ✅ Done ]` `[ ⏱ Snooze 1h ]` `[ 📋 List Today ]`
     - Demonstrates instant capture without opening the browser.
4. **Card D: 24h Time Blocking & Overlap Detection (Span 7 cols)**
   - Visual hour grid snippet (`09:00` to `13:00`).
   - Draggable/interactive time blocks showing focus chunks, quiet hours protection, and no artificial calendar lock-in.

### 4.4. Section 4: "Honest Architecture" Proof Grid (`LandingPhilosophy.tsx` & `LandingSecurityProof.tsx`)
Three clean comparative pillars:
1. **Paper-Like Calmness:** No push notification spam, no fake motivational badges, strict batch catch-up notifications if away.
2. **Deterministic Privacy & Multi-Tenant RLS:** PostgreSQL Row-Level Security on every single table via Clerk JWT claims (`auth.jwt()->>'sub'`). Zero cross-tenant leaks.
3. **Open & Portable:** Full JSON data export with one click, standard RRULE recurrence, and BYOK LiteLLM encryption.

### 4.5. Section 5: Command Deck & Footer (`LandingFooter.tsx`)
- High-impact terminal banner: "Stop managing the planner. Start making room for the day."
- Persistent links to GitHub, User Manual, APK Download, and Status.
- Multi-user safe badge, MIT license, and current build version.

---

## 5. Autoplan Multi-Perspective Review

### 5.1. CEO / Product Review
- **Value Proposition:** Cadence isn't "another todo list"; it's a personal operating system bridging paper simplicity with computational horsepower.
- **Conversion Driver:** The Interactive Capture Sandbox immediately proves natural language parsing before the visitor signs up.
- **Decision:** Keep the interactive simulator completely local (no API calls or auth required). This provides instantaneous feedback with zero server load.

### 5.2. Design Review
- **Visual Hierarchy:** Left-aligned split hero prevents centered template fatigue.
- **Materiality:** Deep OLED `#000000` base with subtle `1px` borders (`border-white/[0.08]`) and diffuse orange energy accents (`#FF9F0A`).
- **Tactility:** Integration with existing `soundFX` audio engine adds tactile Apple-like feedback.
- **Vestibular Safety:** All transitions respect `prefers-reduced-motion` and Cadence's `useReducedMotion` hook.

### 5.3. Engineering Review
- **Bundle Integrity:** No new external dependencies installed. Uses existing `lucide-react`, Tailwind v4 tokens, and custom hooks.
- **Performance:** Entry chunk stays comfortably below the 120 kB threshold.
- **State Management:** Local React state only for the interactive preview widgets.

### 5.4. Developer Experience (DX) Review
- **File Organization:** Clear subcomponent directory (`pages/landing/components/`) keeps `LandingPage.tsx` concise and easily testable.
- **Verification Gates:** Runs through `pnpm run verify:fast`, token lint, sizing utilities, and Playwright E2E suites.

---

## 6. Verification & Acceptance Criteria

1. **Gate 1: Token Lint & Sizing (`lint:tokens`, `verify:sizing`)**
   - 0 new token violations, 0 dead classes.
   - Sizing utilities resolve properly.
2. **Gate 2: Typecheck & Build (`typecheck`, `build`)**
   - Clean compilation with zero TypeScript errors across all workspace packages.
3. **Gate 3: E2E Test Suite (`test:e2e`)**
   - `auth.spec.ts` passes (verifies `link-landing-sign-in`, `link-landing-sign-up`).
   - `navigation.spec.ts` passes (verifies public routing & hrefs).
   - `a11y-audit.spec.ts` passes (zero accessibility violations in light and dark themes).
4. **Gate 4: Performance & Cold Load**
   - Entry chunk strictly `< 120 kB`. First visit JS `< 200 kB`.
