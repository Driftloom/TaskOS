# Cadence — Design System & Design Token Coverage Audit

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Design Systems Specialist  
> **Contract Reference:** `spec/design-system.md` & `spec/locked-decisions.md D-25`  

---

## 1. Three-Layer Token Architecture Audit

Cadence architecture is designed around a three-layer design token system:
1. **Layer 1: Primitive Tokens** — Raw hex/HSL values (`--p-black`, `--p-orange`, `--p-surface-card`).
2. **Layer 2: Semantic Tokens** — Role aliases (`--background`, `--foreground`, `--primary`, `--success`, `--destructive`).
3. **Layer 3: Component Tokens & Utilities** — `.glass-chrome`, `.card-enterprise`, `.btn-primary`, `.btn-secondary`.

### Token Hierarchy Integrity
```
Layer 1 (Primitives) ──► Layer 2 (Semantic Roles) ──► Layer 3 (Component Primitives) ──► Application Pages
    #FF9F0A (Orange)          --primary (HSL)                 .btn-primary                   Today / Focus CTA
    #1C1C1E (Dark Gray)       --card (HSL)                    .card-enterprise               Task Row / Ledger
    #30D158 (Green)           --success (HSL)                 Activity Rings                 Momentum Tracker
```

---

## 2. Liquid Glass Restraint Contract (`spec/design-system.md §5`)

The canonical contract strictly dictates:
> *"Glass effect (`backdrop-filter: blur(24px) saturate(180%)`) is strictly confined to chrome: sidebar, bottom dock, headers, modals. Never on body content cards, never on task list items, never on the main scrollable content area."*

### Verification Across Surfaces

| Surface | Visual Treatment | Implementation Code | Compliant? |
|---|---|---|---|
| **Desktop Sidebar** | Frosted chrome rail | `bg-[#0E0E10]/95 backdrop-blur-2xl border-r border-white/[0.08]` | **YES** |
| **Sticky Header** | Frosted chrome header | `bg-[#000000]/95 backdrop-blur-xl border-b border-white/[0.08]` | **YES** |
| **Mobile Dock** | Frosted floating bar | `.glass-chrome` (`backdrop-blur(24px) saturate(190%)`) | **YES** |
| **Command Palette** | Frosted floating modal | `glass-chrome backdrop-blur-md` | **YES** |
| **Task Cards (`TaskRow`)**| Solid dark OLED surface| `.card-enterprise` (`bg-[#121214]` solid) | **YES** (Zero glass in body) |
| **Task Editor Sheet** | Solid elevated card | `bg-[#141416]` solid with `backdrop-blur-md` on overlay | **YES** |

**Conclusion on Liquid Glass:** 100% compliant. No body content cards or task rows use glassmorphism.

---

## 3. Geometry & Corner Radius Scale Audit

### Canonical Scale (`spec/design-system.md §4`)
- **Cards & Panels:** `12px` (`rounded-xl` in Tailwind)
- **Buttons & Chips:** `8px` (`rounded-lg` in Tailwind)
- **Modals & Sheets:** `16px` (`rounded-2xl` in Tailwind)
- **Pills & Badges:** `50%` (`rounded-full` in Tailwind)

### Observed Violations & Drift

| Component / File | Observed Radius | Canonical Standard | Severity | Impact |
|---|---|---|---|---|
| `StateViews.tsx` (ErrorState) | `rounded-3xl` (24px) | `rounded-xl` (12px) | Low | Inconsistent card rounding |
| `LandingPage.tsx` (Feature Cards) | `rounded-3xl` (24px) | `rounded-xl` (12px) | Low | Over-rounded bubble aesthetic |
| `SettingsPage.tsx` (All Sections) | `rounded-3xl` (24px) | `rounded-xl` (12px) | Medium | Breaks 12px visual rhythm |
| `ProfilePage.tsx` (Quick Links) | `rounded-3xl` (24px) | `rounded-xl` (12px) | Medium | Visual discordance with TaskRow |
| `OnboardingPage.tsx` (Main Card) | `rounded-3xl` (24px) | `rounded-2xl` (16px) | Low | Container geometry inconsistency |
| `App.tsx` (Clerk CardBox) | `rounded-3xl` (24px) | `rounded-2xl` (16px) | Low | Modal geometry inconsistency |

---

## 4. Design Token Coverage Report: Token -> Component -> Page

```
Design Token System Coverage: 58% Consistent / 42% Bypassed
```

### Breakdown of Token Bypassing:
1. **Direct Hex Codes in JSX:**
   - Over 40 instances of hardcoded `#FF9F0A`, `#30D158`, `#0A84FF`, `#5E5CE6`, `#FF453A` embedded directly inside component inline styles or template strings instead of referencing `var(--primary)`, `var(--success)`, etc.
2. **Unsanctioned Tailwind Palette Injections:**
   - `sky-500`, `sky-400`, `emerald-500`, `emerald-400`, `amber-500`, `purple-400`, `purple-500` used as one-offs in Profile and Settings pages.
3. **Ghost / Phantom CSS Classes:**
   - `button.tsx` references `hover-elevate`, `active-elevate-2`, `border-primary-border`, `border-secondary-border`, `--button-outline`, none of which are defined in `index.css`.
   - `InboxPage.tsx` references `py-0.2`, which produces no CSS rules.
   - `CalendarPage.tsx` and `LandingPage.tsx` reference `active:scale-98` instead of `active:scale-[0.98]`.
