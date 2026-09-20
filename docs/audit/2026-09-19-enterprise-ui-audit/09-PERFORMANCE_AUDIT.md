# Cadence — Performance & Core Web Vitals Audit

> **Audit Date:** 2026-09-19  
> **Auditor:** Principal Web Performance Engineer  
> **Build Target:** Vite 6 + React 19 production bundle  

---

## 1. Network Waterfall & Initial Asset Loading

```
Initial Request Waterfall (Cold Cache)
───────────────────────────────────────────────────────────────────────────────
0ms    GET /                         (HTML Document, 2.2KB)
├─── 120ms  GET /src/main.tsx        (Entry JS module)
├─── 130ms  GET index.css            (Global CSS Bundle)
│      ├─── [BLOCKING] @import cdnfonts/sf-pro-display
│      └─── [BLOCKING] @import Google Fonts (5 families, 28 weights)
├─── 140ms  <link> Google Fonts      [DUPLICATE FETCH]
└─── 145ms  <link> cdnfonts          [DUPLICATE FETCH]
```

### [Finding UI-PERF-001] Render-Blocking Font Waterfall
- **Evidence:** `index.css` Line 2 imports `https://fonts.cdnfonts.com/css/sf-pro-display` and Line 3 imports Google Fonts with 28 font weight variants.
- **Measurable Cost:** The browser halts CSSOM construction while waiting for the imported CSS files to resolve over the network. On a 4G mobile network (150ms round-trip latency), this adds **300ms–600ms of idle waiting time** before the First Contentful Paint (FCP) can occur.
- **Remediation:** Remove `@import` statements from `index.css`. Keep `<link rel="preload">` in `index.html` or self-host subsetted WOFF2 files directly under `public/fonts/`.

---

## 2. Core Web Vitals (Estimated Enterprise Profile)

| Metric | Target | Estimated Status | Direct Cause / Evidence |
|---|---|---|---|
| **LCP (Largest Contentful Paint)** | `< 2.5s` | **At Risk (~2.8s on Mobile 4G)** | Third-party web font downloads delay headline rendering in `TodayPage`. |
| **INP (Interaction to Next Paint)**| `< 200ms`| **Good (~40ms)** | Web Audio synthesizer executes on worker audio thread; fast React state updates. |
| **CLS (Cumulative Layout Shift)**  | `< 0.1`   | **Moderate (~0.12)** | Font swapping from fallback sans-serif to late-arriving SF Pro causes headline reflow. |
| **FCP (First Contentful Paint)**   | `< 1.8s` | **At Risk (~2.1s on Mobile 4G)** | Double font waterfall in HTML and CSS blocks initial paint. |
| **TTFB (Time to First Byte)**      | `< 800ms` | **Good** | Static HTML shell served from Vite/CDN edge. |

---

## 3. DOM & Rendering Overhead

### [Finding UI-PERF-002] Fixed SVG Noise Overlay Filter Cost
- **Location:** `artifacts/cadence/src/index.css` Lines 280–288
- **Evidence:**
  ```css
  .noise::after {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 50;
    pointer-events: none;
    opacity: 0.025;
    background-image: url("data:image/svg+xml,...<feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' .../>");
  }
  ```
- **Why it matters:** An SVG `feTurbulence` filter with `numOctaves='4'` applied over a full-viewport `position: fixed` pseudo-element forces continuous GPU compositing and redrawing during page scrolling on low-powered mobile devices (such as budget Android devices and older iPhones), causing frame drops below 60fps.
- **Remediation:** Replace the inline SVG procedural filter with a static, pre-rendered 100×100px PNG tile or pure CSS noise gradient.

### [Finding UI-PERF-003] Redundant Polling in `MessagingIntegrationsView.tsx`
- **Location:** `artifacts/cadence/src/pages/settings/MessagingIntegrationsView.tsx` Lines 105–131
- **Evidence:** An unthrottled 2-second `setInterval` polls `/api/integrations/telegram/pairing-status` whenever the QR modal is open. If the user leaves the tab open, it continues polling without checking `document.hidden`.
- **Remediation:** Check `if (document.hidden) return;` inside the interval or use Server-Sent Events (SSE).

---

## 4. Bundle & Code Splitting Status

In `artifacts/cadence/vite.config.ts`:
- **Observed:** No `manualChunks` or vendor splitting configuration exists in the Vite config.
- **Impact:** All third-party libraries (`@clerk/react`, `@tanstack/react-query`, `lucide-react`, `cmdk`, `date-fns`, `sonner`, `recharts`) are bundled into one large vendor chunk loaded on every page, rather than lazily splitting routes like `/settings`, `/profile`, `/memory` with `React.lazy()`.
