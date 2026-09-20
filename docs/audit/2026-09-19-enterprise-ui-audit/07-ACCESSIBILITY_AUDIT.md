# Cadence — Accessibility & WCAG 2.1 Audit

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Certified Accessibility Auditor  
> **Compliance Target:** WCAG 2.1 Level AA / Apple HIG Accessibility Standards  

---

## 1. Executive Accessibility Findings Table

| Finding ID | Category | Severity | Location | Element / Component | Issue Description | WCAG 2.1 Criterion | Verification |
|---|---|---|---|---|---|---|---|
| `UI-A11Y-001` | Focus Visibility | **P1** | `index.css` L143–149 | `.border-none:focus-visible` | Strips focus outline with `outline: none !important;` | 2.4.7 Focus Visible (AA) | Verified |
| `UI-A11Y-002` | Touch Target | **P1** | `AppShell.tsx` L455–481 | Mobile bottom dock | 8 buttons in 351px width (<42px per item) | 2.5.5 Target Size (AAA / Apple HIG) | Verified |
| `UI-A11Y-003` | Touch Target | **P1** | `TaskRow.tsx` L151, 235 | Checkbox (20px) & pencil/trash (28px) | Sub-44px touch targets on primary daily task rows | 2.5.5 Target Size (AAA / Apple HIG) | Verified |
| `UI-A11Y-004` | Touch Target | **P2** | `CalendarPage.tsx` L278 | Time block delete button | `size-4` (16×16px) close button | 2.5.5 Target Size (AAA / Apple HIG) | Verified |
| `UI-A11Y-005` | Semantics | **P1** | `ReviewPage.tsx` L222, 251 | Guided ritual cards | `<div onClick={...}>` without `role="button"` or `tabIndex` | 4.1.2 Name, Role, Value (A) | Verified |
| `UI-A11Y-006` | Semantics | **P2** | `OnboardingPage.tsx` L269 | Automation dial cards | `<div onClick={...}>` without keyboard activation | 2.1.1 Keyboard (A) | Verified |
| `UI-A11Y-007` | Form Labels | **P2** | `TaskEditor.tsx` L188, 201 | Title & notes inputs | Missing accessible `<label>` or `aria-label` | 3.3.2 Labels or Instructions (A) | Verified |
| `UI-A11Y-008` | Form Labels | **P2** | `TodayPage.tsx` L242 | Filter input | Missing `<label>` or `aria-label` | 3.3.2 Labels or Instructions (A) | Verified |
| `UI-A11Y-009` | Motion | **P2** | `index.css` L259–278 | Animations & pulses | Missing `@media (prefers-reduced-motion)` overrides | 2.3.3 Animation from Interactions (AAA) | Verified |
| `UI-A11Y-010` | Color Contrast | **P2** | `MemoryPage.tsx`, `AppShell.tsx`| AI Indigo (`#5E5CE6`) | Contrast ratio 4.10:1 on black (fails 4.5:1 requirement) | 1.4.3 Contrast (Minimum) (AA) | Verified |

---

## 2. Deep Dive: Critical Accessibility Findings

### [Finding UI-A11Y-001] Focus Ring Suppression in Global CSS
In `artifacts/cadence/src/index.css` Lines 143–149:
```css
input.border-none:focus-visible,
textarea.border-none:focus-visible,
.border-none:focus-visible,
.outline-none:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}
```
- **Impact:** In `TaskEditor.tsx` (Lines 195, 208), the title input and description textarea specify `border-none outline-none`. This global rule overrides all focus indicators with `!important`. Keyboard users tabbing into the task modal cannot see where the focus caret is located, directly violating **WCAG 2.4.7 Focus Visible**.
- **Remediation:** Remove the `!important` suppression rule or replace with a subtle, non-intrusive focus ring (`ring-1 ring-primary/40`).

### [Finding UI-A11Y-002 & 003] Sub-44px Touch Targets Across Mobile Surfaces
- **Mobile Navigation Dock:** 8 items in 351px width gives ~43.8px per button before subtracting margins.
- **Task Row:** Checkbox is `size-5` (20×20px); Edit and Delete buttons are `size-7` (28×28px).
- **Impact:** Violates Apple Human Interface Guidelines and WCAG Success Criterion 2.5.5. Users with motor tremors or large fingertips suffer frequent mis-taps.
- **Remediation:** Use `.tap-target-44` wrapper or negative margin hit bounds (`p-2.5 -m-2.5`) to expand the invisible interactive area to at least 44×44px without changing visual icon sizing.

### [Finding UI-A11Y-005] Non-Semantic `div onClick` on Interactive Cards
In `ReviewPage.tsx` Lines 222 and 251:
```tsx
<div
  onClick={() => {
    soundFX.playTactileClick();
    setRitualType('morning');
  }}
  className="card-enterprise ... cursor-pointer"
>
```
- **Impact:** Screen readers perceive this as a static grouping `div`. It cannot be focused via Tab key, cannot be announced as a button, and cannot be pressed via Space or Enter keys.
- **Remediation:** Convert the outer element to a semantic `<button type="button">` or add `role="button"`, `tabIndex={0}`, and `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') ... }}`.

### [Finding UI-A11Y-009] Absence of `prefers-reduced-motion` Handling
- **Observed:** `index.css` implements `.animate-enter`, `.animate-check-pop`, and `.animate-pulse-subtle`. No media query exists in the CSS to collapse or suppress these animations when a user has enabled "Reduce Motion" at the operating system level.
- **Impact:** Users with vestibular motion disorders or visual motion sensitivities experience continuous pulsing on indicators.
- **Remediation:** Add to `index.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```

---

## 3. Accessible HTML Landmarks & Semantic Structure

| Landmark | HTML Element | Location | Status |
|---|---|---|---|
| **Banner (Header)** | `<header>` | `AppShell.tsx` L326 | **Pass** |
| **Main Navigation** | `<nav aria-label="Primary navigation">` | `AppShell.tsx` L232 | **Pass** |
| **Mobile Navigation**| `<nav aria-label="Mobile navigation">` | `AppShell.tsx` L456 | **Pass** |
| **Complementary** | `<aside>` | `AppShell.tsx` L176, `TodayPage.tsx` L307 | **Pass** |
| **Main Content** | `<main>` | `AppShell.tsx` L448, `LandingPage.tsx` L7 | **Pass** |
| **Dialog Modals** | `role="dialog" aria-modal="true"` | `TaskEditor.tsx`, `CommandPalette.tsx`, `RitualDialog.tsx` | **Pass** |
