# Cadence — Color System & Contrast Audit

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Color Accessibility Specialist  
> **Contract Reference:** `spec/design-system.md §2` & `spec/locked-decisions.md D-14`  

---

## 1. Master Color Inventory & Token Alignment

| Semantic Token | Spec Dark Hex | CSS Implementation | Intended Use | Required Icon Pairing | Actual Code Implementation | Alignment Status |
|---|---|---|---|---|---|---|
| `--bg` | `#000000` | `hsl(0 0% 0%)` | App background (OLED true black) | — | Bound to `html` and `body` | **Pass** |
| `--surface` | `#1C1C1E` | `hsl(240 4% 11%)` | Primary cards, panels | — | Bound to `--card` | **Pass** |
| `--surface-elevated`| `#2C2C2E` | `--p-surface-elevated` | Modals, sheets, popovers | — | Used in modals & dropdowns | **Pass** |
| `--surface-base` | — | `#121214` | Card base (`.card-enterprise`) | — | Unofficial token used in cards | **Deviation** |
| `--text-primary` | `#F5F5F7` | `hsl(240 5% 96%)` | Headlines, body text | — | Bound to `--foreground` | **Pass** |
| `--text-secondary`| `#98989D` | `hsl(240 2% 61%)` | Captions, timestamps | — | Bound to `--muted-foreground` | **Pass** |
| `--accent-energy` | `#FF9F0A` | `hsl(36 100% 52%)` | Primary CTAs, Start buttons, streaks | 🔥 Flame / `ArrowUp` | Bound to `--primary` | **Pass** |
| `--success` | `#30D158` | `hsl(142 69% 50%)` | Task completion, round complete | ✅ `CheckCircle2` | Bound to `--success` | **Pass** |
| `--urgent` | `#FF453A` | `hsl(4 100% 61%)` | Overdue tasks, at-risk deadlines only | ⚠️ `AlertTriangle` | Bound to `--destructive` | **Pass** |
| `--scheduled` | `#0A84FF` | `hsl(211 100% 52%)` | Time blocks, secondary links | 🕐 `Clock` | Bound to `--accent` | **Pass** |
| `--ai` | `#5E5CE6` | `hsl(241 77% 63%)` | Memory facts, agent recommendations | ✨ `Sparkles` / `Brain` | Bound to `--ai` | **Pass** |

---

## 2. Contrast Ratio Matrix & WCAG 2.1 Verification

### Formula & Methodology
Contrast ratio is calculated using the relative luminance formula defined by W3C WCAG 2.1:
$$\text{Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05}$$
where $L_1$ is the lighter luminance and $L_2$ is the darker luminance.

| Element / Color Combination | Luminance Foreground ($L_1$) | Luminance Background ($L_2$) | Contrast Ratio | WCAG 2.1 AA Normal (4.5:1) | WCAG 2.1 AA Large (3.0:1) | WCAG 2.1 AAA Normal (7.0:1) |
|---|---|---|---|---|---|---|
| **Text Primary (`#F5F5F7`) on OLED (`#000000`)** | 0.920 | 0.000 | **19.40 : 1** | **PASS** | **PASS** | **PASS** |
| **Text Primary (`#F5F5F7`) on Card (`#1C1C1E`)** | 0.920 | 0.012 | **15.65 : 1** | **PASS** | **PASS** | **PASS** |
| **Text Secondary (`#98989D`) on OLED (`#000000`)**| 0.317 | 0.000 | **7.34 : 1** | **PASS** | **PASS** | **PASS** |
| **Text Secondary (`#98989D`) on Card (`#1C1C1E`)**| 0.317 | 0.012 | **5.92 : 1** | **PASS** | **PASS** | Fail |
| **Energy Button Text (`#000000`) on (`#FF9F0A`)** | 0.468 | 0.000 | **10.36 : 1** | **PASS** | **PASS** | **PASS** |
| **Completions Green (`#30D158`) on OLED (`#000000`)**| 0.477 | 0.000 | **10.54 : 1** | **PASS** | **PASS** | **PASS** |
| **Scheduled Blue (`#0A84FF`) on OLED (`#000000`)** | 0.279 | 0.000 | **6.58 : 1** | **PASS** | **PASS** | Fail |
| **Urgent Red (`#FF453A`) on OLED (`#000000`)** | 0.245 | 0.000 | **5.90 : 1** | **PASS** | **PASS** | Fail |
| **AI Indigo (`#5E5CE6`) on OLED (`#000000`)** | 0.155 | 0.000 | **4.10 : 1** | **FAIL** (Requires 4.5) | **PASS** | Fail |
| **AI Indigo (`#5E5CE6`) on Card (`#1C1C1E`)** | 0.155 | 0.012 | **3.31 : 1** | **FAIL** (Requires 4.5) | **PASS** | Fail |
| **`text-zinc-500` (`#71717A`) on Surface (`#121214`)**| 0.168 | 0.007 | **3.82 : 1** | **FAIL** (Requires 4.5) | **PASS** | Fail |
| **`text-zinc-600` (`#52525B`) on Surface (`#121214`)**| 0.083 | 0.007 | **2.33 : 1** | **FAIL** (Severe) | **FAIL** | Fail |

### Key Contrast Findings
1. **[Finding UI-CLR-001] AI Indigo (`#5E5CE6`) Fails WCAG AA Normal Text Contrast**  
   - Relative luminance of `#5E5CE6` is 0.155. When rendered on true black `#000000`, the contrast ratio is **4.10:1**, falling below the WCAG 2.1 AA minimum threshold of 4.5:1. On card backgrounds (`#1C1C1E`), the ratio drops to **3.31:1**.
   - **Remediation:** In dark mode, lighten AI Indigo to `#7D7AFF` (luminance ~0.26, contrast 6.2:1) for body text and small badge copy.
2. **[Finding UI-CLR-002] Low-Contrast Subtle Text (`zinc-500` & `zinc-600`)**  
   - Metadata dividers (`·`), tag labels, and timestamps frequently use `text-zinc-500` (3.82:1) and `text-zinc-600` (2.33:1) on `#121214`. These fail WCAG AA readability for small 10px–11px type.

---

## 3. Colorblind Accessibility Audit (D-14 Compliance)

Locked Decision D-14 mandates: *"Every status color must be paired with a distinct icon/shape (colorblind-safe). Color alone is never sufficient."*

| Feature Area | Status / Priority | Color | Paired Icon / Shape | Compliance | Notes |
|---|---|---|---|---|---|
| **TaskRow** | High Priority | `#FF9F0A` | Flame 🔥 + text "high" | **Compliant** | Triple pairing (Color + Icon + Text) |
| **TaskRow** | Medium Priority | `#0A84FF` | CircleDot ⊙ + text "med" | **Compliant** | Triple pairing |
| **TaskRow** | Low Priority | `zinc-500` | Minus − + text "low" | **Compliant** | Triple pairing |
| **TaskRow** | Completed | `#30D158` | Checkmark in circle | **Compliant** | Distinct circular check |
| **InboxPage** | High Priority | `#FF453A` | AlertTriangle ⚠️ | **Violation** | Red AlertTriangle used for priority, colliding with Urgent/Overdue |
| **InboxPage** | Medium Priority | `#FF9F0A` | Flame 🔥 | **Violation** | Flame used for Medium instead of High |
| **AppShell** | Audio Muted | `zinc-400` | Volume2 🔊 | **Violation** | Icon does NOT change to VolumeX when muted |
| **Activity Rings** | Tasks Ring | `#FF9F0A` | Concentric position (Outer) | **Compliant** | Spatial position reinforces color |
| **Activity Rings** | Focus Ring | `#30D158` | Concentric position (Inner) | **Compliant** | Spatial position reinforces color |

---

## 4. Unsanctioned Hardcoded Colors Across Pages

The following utility classes bypass the design token system:

| File | Unsanctioned Classes / Hex | Design System Equivalent |
|---|---|---|
| `ProfilePage.tsx` | `bg-sky-500/15 text-sky-400` | `bg-accent/15 text-accent` (`#0A84FF`) |
| `ProfilePage.tsx` | `bg-amber-500/15 text-amber-400` | `bg-primary/15 text-primary` (`#FF9F0A`) |
| `ProfilePage.tsx` | `bg-purple-500/15 text-purple-400` | `bg-ai/15 text-ai` (`#5E5CE6`) |
| `SettingsPage.tsx` | `bg-sky-500/15 text-sky-400` | `bg-accent/15 text-accent` (`#0A84FF`) |
| `SettingsPage.tsx` | `bg-emerald-500/15 text-emerald-400` | `bg-success/15 text-success` (`#30D158`) |
| `LandingPage.tsx` | `bg-emerald-500/15 text-emerald-400` | `bg-success/15 text-success` (`#30D158`) |
| `LandingPage.tsx` | `bg-sky-500/15 text-sky-400` | `bg-accent/15 text-accent` (`#0A84FF`) |
| `not-found.tsx` | `bg-gray-50`, `text-gray-900`, `text-red-500` | `bg-background`, `text-foreground`, `text-destructive` |
| `error-boundary.tsx`| `bg-gray-50`, `text-gray-900`, `bg-gray-900` | `bg-background`, `text-foreground`, `btn-primary` |

---

## 5. Light-Mode Readiness Audit

`spec/design-system.md §2` defines token mappings for both Light and Dark modes.
- **Observed:** `artifacts/cadence/src/index.css` defines only a single hardcoded `:root` palette with dark values (`--background: 0 0% 0%`). There is no `.light` class or `@media (prefers-color-scheme: light)` implementation.
- **Impact:** Light mode is completely unimplemented at the CSS level.
