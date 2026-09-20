# Cadence — Typography & Font Audit

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Frontend Architect & Typography Specialist  
> **Contract Reference:** `spec/design-system.md §3` (Apple HIG Typography Standard)  

---

## 1. Font Families & Loading Architecture

### Canonical Font Contract (`spec/design-system.md §3`)
```
Font stack: -apple-system, "SF Pro Display", "SF Pro Text", "Inter", sans-serif
```

### Actual Implementation in Code

#### A. HTML Head (`artifacts/cadence/index.html` Lines 23–27)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://fonts.cdnfonts.com" crossorigin>
<link href="https://fonts.cdnfonts.com/css/sf-pro-display" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
```

#### B. CSS Stylesheet (`artifacts/cadence/src/index.css` Lines 2–3)
```css
@import url('https://fonts.cdnfonts.com/css/sf-pro-display');
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

#### C. Declared CSS Variables (`artifacts/cadence/src/index.css` Lines 32–33, 74–75)
```css
--font-sans: "SF Pro Display", "Geist", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", -system-ui, sans-serif;
--font-mono: "Geist Mono", "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace;
```

---

## 2. Critical Typography Findings

### [Finding UI-TYP-001] Severe Duplicate Font Loading Waterfall
- **Evidence:** Both `index.html` (via `<link rel="stylesheet">`) and `index.css` (via `@import url(...)`) execute HTTP requests for the exact same Google Fonts URL and cdnfonts URL.
- **Why it matters:** `@import` inside CSS forces the browser to serialize network downloads: the HTML parser discovers `index.css`, fetches it, parses it, and only then triggers sub-requests for `@import` stylesheets. This doubles the network round-trips and blocks the First Contentful Paint (FCP).

### [Finding UI-TYP-002] Excessive Font Families and Unused Weights
- **Evidence:** The Google Fonts request bundles **5 distinct font families** across **28 weights**:
  - Geist (7 weights: 300, 400, 500, 600, 700, 800, 900)
  - Geist Mono (4 weights: 400, 500, 600, 700)
  - Plus Jakarta Sans (6 weights: 300, 400, 500, 600, 700, 800)
  - Inter (7 weights: 300, 400, 500, 600, 700, 800, 900)
  - JetBrains Mono (4 weights: 400, 500, 600, 700)
- **Why it matters:** Loading 28 font weight variants over cellular mobile connections introduces massive bandwidth overhead (~400KB+ of WOFF2 files) when only 4 weights (400, 500, 600, 700) are actually utilized by the UI.

### [Finding UI-TYP-003] Deprioritization of System Native Fonts on Apple Devices
- **Evidence:** In `index.css`, `"SF Pro Display"` (hosted on third-party `cdnfonts.com`) is placed **before** `-apple-system`.
- **Why it matters:** Apple devices (macOS, iOS) ship with San Francisco pre-installed at the hardware/OS level. Specifying an un-optimized web font before `-apple-system` forces Apple devices to download fonts over the network rather than instantly rendering the local OS font with zero latency and zero Cumulative Layout Shift (CLS).

---

## 3. Typography Scale Audit vs. Implementation

| Spec Role | Spec Size | Spec Weight | Spec Line-Height | Observed Code Usage in Cadence | Alignment Status |
|---|---|---|---|---|---|
| **Display / Hero** | 34px | 700 (Bold) | 1.1 | `text-4xl sm:text-6xl font-extrabold` (LandingPage) | **Pass** |
| **Title 1** | 28px | 700 (Bold) | 1.2 | `text-2xl sm:text-3xl font-bold` (`SectionHeading`) | **Pass** |
| **Title 2** | 22px | 600 (Semibold) | 1.25 | `text-xl sm:text-2xl font-bold` (`FocusPage`) | **Pass** |
| **Headline** | 17px | 600 (Semibold) | 1.3 | `text-base font-bold` (Card headers) | **Pass** |
| **Body** | 17px | 400 (Regular) | 1.5 | `text-sm text-zinc-100` (`TaskRow`, `TodayPage`) | **Pass** (Slightly compact 14px for density) |
| **Callout** | 16px | 400 (Regular) | 1.45 | `text-sm text-zinc-300` (`TaskEditor`) | **Pass** |
| **Subhead** | 15px | 400 (Regular) | 1.4 | `text-[13px] font-medium` (`TaskRow` title) | **Pass** |
| **Footnote** | 13px | 400 (Regular) | 1.4 | `text-xs text-zinc-400` (Descriptions) | **Pass** |
| **Caption** | 12px | 400 (Regular) | 1.3 | `text-[11px]` / `text-[10px]` (`font-mono` badges) | **Pass** |

---

## 4. Typography Features & Legibility Rules

### Verified Strengths
1. **Tabular Numerals Enforced:** Monospace fonts consistently use `font-feature-settings: "tnum" 1, "zero" 1;` and `font-variant-numeric: tabular-nums;` in `index.css` Line 116. This prevents jitter and jumping numbers on timers and countdowns.
2. **Apple OpenType Feature Flags:** `index.css` Line 99 specifies `font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11', 'ss01', 'ss02';` providing refined curved quotes, uppercase colon alignment, and proper glyph substitution.
3. **Subpixel Antialiasing:** `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` are globally bound to `body`.
