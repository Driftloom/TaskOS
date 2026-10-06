# Cadence — Enterprise UI & Frontend Audit: Layout & Density Modes

> **Audit Date:** 2026-10-06T23:40:00+05:30  
> **Source Verification:** `artifacts/cadence/src/components/chrome/DensityProvider.tsx`, `tokens/tokens.json`, `tests/e2e/density.spec.ts`  
> **Audit Standard:** `docs/13-master-design-system-prompt.md` §P1, §P8.1, §P8.4  

---

## 1. P1 Density System Architecture

Cadence implements a comprehensive Display Density System via `DensityProvider` and CSS token bindings. Density affects row heights, list padding, and interactive control sizing across data-dense views.

### Density Mode Specification:
| Mode | Row Height (`--density-row-h`) | Vertical Padding (`--density-row-p`) | Control Height (`--density-control-h`) | Intended Hardware / Context |
|---|---|---|---|---|
| `comfortable` | 56px (3.5rem) | 16px (1.0rem) | 48px | Touch-first mobile devices, relaxed reading |
| `default` | 50px (3.125rem) | 12px (0.75rem) | 44px | Standard baseline across desktop and mobile |
| `compact` | 38px (2.375rem) | 8px (0.5rem) | 36px | Desktop mouse/pointer, data-dense review |

---

## 2. Touch-Safety & Pointer Fine Gating

A critical finding from earlier audits was that setting 38px row height on a mobile phone caused adjacent 44px tap targets (such as task completion checkboxes) to collide and steal taps.

### Architectural Solution:
- In `tokens/tokens.json` and generated `tokens.css`:
  - `compact` mode variables are scoped under `@media (pointer: fine)`.
  - On coarse pointer devices (smartphones, tablets without mouse), the CSS token pipeline ignores compact overrides and clamps to `default` (50px / 44px).
- **Automated Browser Proof (`density.spec.ts`):**
  - Simulated coarse pointer (`(pointer: coarse)`) hides or disables the compact density switch in `/settings`.
  - Fine pointer (`(pointer: fine)`) allows the user to activate compact mode.
  - Test passes 100% across Chromium browsers.

---

## 3. Control Height Density Integration (`density-control`)

- Custom CSS class `.density-control` was created in `index.css`:
  ```css
  .density-control {
    min-height: var(--density-control-h);
  }
  ```
- Wired into primary action controls and calendar headers.
- **Contract Boundary Retained:**
  - `TimeBlock` remains protected at `min-h-11` (44px) by its explicit contract test in `TimeBlock.test.tsx` to prevent schedule chip collision.
  - `MemoryFactCard` buttons remain at 36px with `.tap-target-expand` to preserve dense layout aesthetics while ensuring touch compliance.
