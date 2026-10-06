# Cadence — Enterprise UI & Frontend Audit: Typography & Fonts

> **Audit Date:** 2026-10-06T23:40:00+05:30  
> **Source Verification:** `artifacts/cadence/src/styles/tokens.css`, `artifacts/cadence/index.html`, `artifacts/cadence/src/index.css`  
> **Audit Standard:** `docs/13-master-design-system-prompt.md` §P7, §P26.2  

---

## 1. Font Strategy & Self-Hosting Architecture

In compliance with P7 and Core Web Vitals best practices, Cadence has eliminated all render-blocking third-party font stylesheets (Google Fonts, cdnfonts). 

### Shipped Architecture:
1. **Self-Hosted Variable Font:**
   - Package: `@fontsource-variable/inter` (Latin subset).
   - Bundle Weight: **48.26 kB raw / 48.25 kB gzip** (`assets/inter-latin-wght-normal-Dx4kXJAl.woff2`).
   - Served directly from our own origin, enabling HTTP/2 multiplexing with zero external DNS lookups or TLS handshakes.
   - Preloaded via `<link rel="preload" as="font" type="font/woff2" crossorigin>` in `index.html`.
2. **Metric-Matched Local Fallback (`Inter Fallback`):**
   - Implemented via `@font-face` overrides in `index.css`:
     - `size-adjust: 107.4%`
     - `ascent-override: 90.2%`
     - `descent-override: 22.48%`
   - **User Outcome:** Ensures that system fallback fonts match the exact bounding box and line metrics of Inter before the webfont loads, completely eliminating layout shifting. This directly drives the measured **CLS = 0.000** in Lighthouse runs.

---

## 2. 11-Step Typography Scale Hierarchy (P7)

Cadence maps its typography directly to Apple Human Interface Guidelines and P7 tokens:

| Scale Step Token | Size | Line Height | Tracking | Weight | Semantic Role |
|---|---|---|---|---|---|
| `largeTitle` | 34px (2.125rem) | 41px (1.21) | `-0.022em` | Bold (700) | Top-level view hero headers |
| `title1` | 28px (1.75rem) | 34px (1.21) | `-0.020em` | Bold (700) | Section lead titles |
| `title2` | 22px (1.375rem) | 28px (1.27) | `-0.015em` | Bold (700) | Card group headers |
| `title3` | 20px (1.25rem) | 25px (1.25) | `-0.010em` | Semibold (600) | Modal headers, sub-sections |
| `headline` | 17px (1.0625rem) | 22px (1.29) | `-0.005em` | Semibold (600) | Task titles, emphasized list labels |
| `body` | 17px (1.0625rem) | 22px (1.29) | `0em` | Regular (400) | Primary prose, descriptions |
| `callout` | 16px (1.0rem) | 21px (1.31) | `0em` | Regular (400) | Helper text, form field labels |
| `subheadline` | 15px (0.9375rem) | 20px (1.33) | `0em` | Regular (400) | Secondary card descriptions |
| `footnote` | 13px (0.8125rem) | 18px (1.38) | `+0.005em` | Regular (400) | Metadata chips, timestamps, tag names |
| `caption1` | 12px (0.75rem) | 16px (1.33) | `+0.010em` | Regular (400) | Badges, small metadata |
| `caption2` | 11px (0.6875rem) | 13px (1.18) | `+0.015em` | Regular (400) | Sub-badges, micro-hints |

### Tabular Figures (`tabular-nums`):
- Required by P7 and P11.1 for all focus timer displays, duration badges, and activity counters.
- Applied via `.tabular-nums` class and OpenType `font-feature-settings: "tnum"`.
- Prevents horizontal jitter as countdown numbers change every second.
