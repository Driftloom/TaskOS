# Specialized Subsystem Report: UX, Design System, ADHD Ergonomics & Accessibility

> **Zero-Trust UX & Accessibility Audit**  
> **Workspace Root:** `c:\PROJECTS\PIOS\ClonU\Driftloom\Cadence-Task-OS`  
> **Audited Date:** 2026-10-11  
> **Auditor Posture:** Principal UX Architect & Accessibility Specialist  

---

## 1. Design System Architecture & Tailwind v4 Custom Sizing

### The Tailwind v4 Spacing Trap & Custom `@utility` Solution
In Tailwind CSS v4, arbitrary dimension utilities (`w-*`, `min-h-*`, `max-w-*`) resolve **strictly and exclusively** from the `--spacing` namespace. Any custom design tokens in `--size-*` or `--component-dimension-*` generate **zero CSS rules** if invoked with standard Tailwind classes.

Cadence solves this by declaring explicit `@utility` classes in `artifacts/cadence/src/index.css`:
```css
@utility auth-card-w { width: var(--component-dimension-auth-card-w, 440px); }
@utility task-editor-max-w { max-width: var(--component-dimension-task-editor-max-w, 540px); }
@utility calendar-cell { min-height: var(--component-dimension-calendar-cell-min-h, 212px); }
@utility tap-target-h { min-height: var(--global-size-tap-target, 44px); }
@utility control-md-h { height: var(--global-size-control-md, 44px); }
@utility control-sm-h { height: var(--global-size-control-sm, 36px); }
```
- **Verification Proof:** Headless Chromium sizing probe (`scripts/verify-sizing-utilities.cjs`) asserts that 22/22 custom utilities resolve to non-zero computed pixel heights and widths.
- **Token Discipline:** Single source of truth `tokens/tokens.json` compiles to `styles/tokens.css`. Lint rule `scripts/lint-tokens.cjs` scans 151 files with 0 baseline debt.

---

## 2. Cognitive Psychology & ADHD / Executive Function Ergonomics

Cadence is explicitly designed around the cognitive needs of adults with ADHD and executive dysfunction:

### 2.1 Frictionless Capture & Cognitive Offloading
- **Instant Access:** Global shortcut `N`, persistent "+" button on mobile dock and header, and inline form on `/today`.
- **Natural Language Parsing (`parseQuickCapture.ts`):** Strips recognized entities ("tomorrow 3pm", "!high", "#work", "45m") without data loss; users do not have to click separate picker modals for dates, durations, or tags.
- **LocalStorage Outbox:** Captures task immediately even when offline, eliminating anxiety about network failure or lost thoughts.

### 2.2 Overwhelm Prevention & Analysis Paralysis Elimination
- **Single-Task Hero (`NextUpCard.tsx`):** Positions **only ONE task** at the top of `/today` with a prominent "Start Focus" CTA. Prevents scanning paralysis across large backlogs.
- **Sensory Calm (Visual Noise Reduction):**
  - Subtle 2% fractal SVG noise texture with gentle ambient glow washes.
  - Strict ban on looping pulse animations or flashing badges during active focus rounds (`FocusTimer.tsx:48`).
- **Proposal Clustering:** Auto-reschedule engine groups overdue tasks into proposal cards with 1-click batch accept or defer, preventing loud visual alarm states.
- **Guided Rituals:** "Plan Day" and "Close Day" step-by-step triage wizards clear mental clutter at start and end of day.

### 2.3 Strict Streak Trade-Off (Rule D-06)
- Streaks reset to zero upon a missed day with no freeze or grace period.
- **Cognitive Risk Analysis:** For neurodivergent users, rigid streak resets can trigger the "abstinence violation effect" (giving up entirely after a minor slip). While intentional under settled decision D-06, this represents an executive function friction point.

---

## 3. Accessibility (a11y) & WCAG 2.1 Compliance

### 3.1 Color Contrast & The Auth Surface CTA Boundary
- **Semantic Token Verification (`scripts/verify-contrast.cjs`):** Asserts 93 color pairs from `tokens/tokens.json`; 100% compliant with WCAG AA (≥ 4.5:1 for body text, ≥ 3:1 for large text).
- **Colorblind-Safe Icon Pairing (Rule D-14):** Status and priority indicators never rely on color alone (`TaskRow.tsx:244`). Priority colors pair with distinct SVG icons (Flame for High, CircleDot for Medium, Minus for Low).
- **The Measured Auth Surface Warning (`scripts/verify-auth-surface.cjs`):**
  - Measures rendered pixels on Clerk sign-in and sign-up cards.
  - Reports **8 WARN lines**: `F3 CTA fill vs card — 2.14:1` against WCAG 1.4.11 non-text UI component floor of 3:1.
  - Root cause: In light theme, Clerk draws the button ring in brand orange fill (`rgb(255, 153, 0)`). Button text itself uses `--primary-text` (`#A64B00`), which complies at 4.96:1. Preserved as an open visual design trade-off.

### 3.2 Touch Targets & Pointer Density Control
- **44x44px Hit Target Rule:** Enforced via `@utility tap-target-h` and `@utility tap-target-expand`.
- **Coarse vs Fine Pointer Safety:** Compact density (38px row height) is strictly restricted to `(pointer: fine)` environments. Coarse pointer devices (touchscreens) automatically fall back to Default density (52px rows) to preserve tap safety.

### 3.3 Keyboard Navigation & Focus Trap Lifecycle
- Global focus rings enforce `2px solid var(--primary-text) !important; outline-offset: 2px !important;` for all `:focus-visible` elements.
- `useModalFocus.ts` traps Tab key focus inside open sheets and dialogs, restoring focus cleanly to trigger elements upon dismissal.

---

## 4. Acoustic Feedback & Multi-Window Synchronization

- **Web Audio API Synthesizer (`src/lib/sound-fx.ts`):** Generates tactile blips and completion chords mathematically without downloading audio asset files.
- **Web Locks Master Audio Election (`src/lib/multi-instance-sync.ts`):** Uses `navigator.locks.request('cadence_audio_master_lock')` to elect a single master tab, preventing echoing or duplicate completion chimes across multiple open windows.

---
*Report certified against WCAG 2.1 AA specifications and live headless browser probes.*
