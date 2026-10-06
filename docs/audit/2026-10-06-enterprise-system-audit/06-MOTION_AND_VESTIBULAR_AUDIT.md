# Cadence — Enterprise UI & Frontend Audit: Motion & Vestibular Safety

> **Audit Date:** 2026-10-06T23:40:00+05:30  
> **Source Verification:** `artifacts/cadence/src/hooks/useReducedMotion.ts`, `artifacts/cadence/src/index.css`, `artifacts/cadence/src/components/task/ActivityRings.tsx`  
> **Audit Standard:** WCAG 2.1 Success Criterion 2.3.3 (Animation from Interactions), `docs/13-master-design-system-prompt.md` §P10, §P18.1  

---

## 1. Vestibular Safety Architecture

Cadence enforces vestibular safety through a dual-layer strategy: CSS-level duration collapse and React hook state orchestration.

### Layer 1: Global CSS Duration Collapse
In `artifacts/cadence/src/index.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
This guarantees that regardless of inline styles or third-party libraries (e.g. Radix UI, Sonner, Tw-Animate), browser motion collapses instantly to 0.01ms when the operating system requests reduced motion.

---

## 2. Centralized React Hook (`useReducedMotion`)

Component-driven animations (SVG paths, canvas renders, Web Audio visualizers) query the centralized hook:
- **Location:** `artifacts/cadence/src/hooks/useReducedMotion.ts`
- **Behavior:**
  1. Detects OS media query `(prefers-reduced-motion: reduce)` via `window.matchMedia`.
  2. Respects user override toggle in `/settings` ("Reduce motion").
  3. Re-renders subscribed components dynamically when OS or in-app preference changes.
- **Unit Test Coverage:** Contract-tested in `useReducedMotion.test.ts` (4/4 tests passing):
  - Honors system media query match.
  - Honors local storage override.
  - Dynamically updates upon listener event.

---

## 3. Component-Level Animation Safeguards

### Activity Rings (`ActivityRings.tsx`):
- Under default motion: Animated SVG stroke-dashoffset spring transition with subtle deceleration.
- Under reduced motion: Springs are bypassed; stroke-dashoffset snaps directly to the calculated completion percentage without overshoot or looping oscillations.

### Ambient Noise & Shimmer Filters:
- Background ambient `.noise::after` layer uses a static inline SVG `feTurbulence` with opacity 0.02, avoiding continuous GPU repainting or layout thrashing.
- Running timers update numerical digits in-place using tabular figures (`tabular-nums`); no infinite pulsating rings or ambient throbbing effects exist in the application.
