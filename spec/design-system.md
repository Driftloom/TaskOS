# Cadence — Design System

> **Canonical design contract.** Authoritative Apple HIG token set for Cadence. All frontend work must reference this document. Deviations require an `AUDIT.md` entry.  
> **Quality bar:** Things 3 + Apple Reminders/Clock/Timer.  
> **Last verified:** 2026-09-19.

---

## 1. Design Philosophy

Apple Human Interface Guidelines — three principles, in order:

1. **Clarity** — Typography, color, and iconography communicate meaning immediately. No decoration that doesn't carry information.
2. **Deference** — The interface steps back from the content. Chrome is minimal, surfaces are clean, transitions are purposeful.
3. **Depth** — Spatial cues (layering, shadow, blur) reinforce hierarchy. Used sparingly — only chrome elements get Glass.

**Energy-not-pretending rule:** Every "motivational" nudge must give the user real, actionable information or disappear. No "You've got this!" copy. Prominent **Start** CTA on Next Up. Streaks show a count, not praise.

---

## 2. Adaptive Color System

All colors adapt between Light and Dark modes. Dark mode is the **default** (OLED true black `#000000`).

Every status color **must** pair with a distinct icon/shape — color alone is never sufficient (Apple HIG mandate + colorblind accessibility, see `spec/locked-decisions.md D-14`).

### Surface Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F5F5F7` | `#000000` | App background (OLED true black in dark) |
| `--surface` | `#FFFFFF` | `#1C1C1E` | Primary cards, panels |
| `--surface-elevated` | `#F2F2F7` | `#2C2C2E` | Modals, sheets, popovers |
| `--text-primary` | `#1D1D1F` | `#F5F5F7` | Headlines, body |
| `--text-secondary` | `#6E6E73` | `#98989D` | Captions, metadata, timestamps |

### Semantic Status Tokens

| Token | Light | Dark | Use | Required Icon Pairing |
|---|---|---|---|---|
| `--accent-energy` | `#FF9500` | `#FF9F0A` | Primary CTAs, Start buttons, active timers, streaks | 🔥 Flame / `ArrowUp` |
| `--success` | `#34C759` | `#30D158` | Task completions, focus round complete | ✅ `CheckCircle2` |
| `--urgent` | `#FF3B30` | `#FF453A` | Overdue tasks, at-risk deadlines only | ⚠️ `AlertTriangle` |
| `--scheduled` | `#007AFF` | `#0A84FF` | Scheduled time blocks, secondary links, calendar | 🕐 `Clock` |
| `--ai` | `#5E5CE6` | `#5E5CE6` | Memory facts, agent recommendations, AI labels | ✨ `Sparkles` / `Brain` |

> **Urgent (`--urgent`) is reserved for genuinely overdue / at-risk states only.** Do not use for emphasis or decoration.

---

## 3. Typography

```
Font stack: -apple-system, "SF Pro Display", "SF Pro Text", "Inter", sans-serif
```

| Role | Size | Weight | Line Height |
|---|---|---|---|
| Display / Hero | 34px | 700 (Bold) | 1.1 |
| Title 1 | 28px | 700 | 1.2 |
| Title 2 | 22px | 600 (Semibold) | 1.25 |
| Headline | 17px | 600 | 1.3 |
| Body | 17px | 400 (Regular) | 1.5 |
| Callout | 16px | 400 | 1.45 |
| Subhead | 15px | 400 | 1.4 |
| Footnote | 13px | 400 | 1.4 |
| Caption | 12px | 400 | 1.3 |

---

## 4. Geometry & Spacing

- **Base grid:** 8px
- **Spacing scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64px
- **Corner radius:** 12px (cards), 8px (buttons/chips), 16px (modals/sheets), 50% (pill badges)
- **Minimum touch target:** 44×44px (Apple HIG minimum for tappable elements on mobile)
- **Card padding:** 16px (default), 12px (compact)

---

## 5. Liquid Glass — Restraint Contract

Glass effect is **strictly confined to chrome**:
- ✅ Sidebar / navigation rail
- ✅ Bottom dock / tab bar
- ✅ Headers / nav bars
- ✅ Modals and sheets (frosted backdrop)
- ❌ Never on body content cards or task list items
- ❌ Never on the main scrollable content area

**Glass recipe:**
```css
backdrop-filter: blur(24px) saturate(180%);
background: rgba(28, 28, 30, 0.72);    /* dark mode */
border: 1px solid rgba(255, 255, 255, 0.08);
```

---

## 6. Activity Rings

Three concentric rings on the Today screen. Inspired by Apple Fitness rings — provide at-a-glance daily momentum without a dashboard.

| Ring | Color | Tracks | Fills When |
|---|---|---|---|
| Outer — Tasks | `--accent-energy` (#FF9F0A) | Tasks completed today | All planned tasks for today are done |
| Middle — Focus | `--success` (#30D158) | Focus rounds completed today | Daily round target is hit |
| Center — Streak | Text count, `--accent-energy` | Consecutive days with ≥1 completion | — (always shows count) |

Rules:
- Rings animate on completion with a spring overshoot (brief 105% scale, settles to 100%).
- Streak is strict — no freeze mechanic (see `spec/locked-decisions.md D-06`).
- Rings are decorative momentum indicators only — not a blocker or gamification gate.

---

## 7. Web Audio Micro-interactions

All audio is synthesized via Web Audio API — no asset files required. Instant mute toggle is always visible.

| Event | Sound | Notes |
|---|---|---|
| Task complete | `C5 → E5 → G5` ascending chime | Spring hit, 120ms attack, 600ms decay |
| Focus round complete | Bell tone, 440Hz sustained 800ms | Lower, meditative |
| Button tap / action confirm | Click transient, 2000Hz, 40ms decay | Subtle, tactile |
| Error / destructive action | Descending two-tone, 300ms | Not a harsh buzz |

Mute state is stored in `localStorage` and persists across sessions.

---

## 8. Motion Principles

- **Purposeful only.** Transitions communicate state change; they do not decorate.
- **Duration:** 200–350ms for page/panel transitions; 150ms for micro-interactions (button presses, checkmarks).
- **Easing:** Spring physics preferred (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for completions and rings. `ease-out` for panels entering, `ease-in` for panels leaving.
- **Reduce motion:** Respect `prefers-reduced-motion` — all animations collapse to instant transitions when set.

---

## 9. Component Conventions

### Task Card States
| State | Visual Treatment |
|---|---|
| `open` | Default surface, `--text-primary` title |
| `completed` | Strikethrough title, `--success` check icon, reduced opacity (0.6) |
| `overdue` | `--urgent` left border accent + `AlertTriangle` icon (never color alone) |
| `scheduled` | `--scheduled` clock icon + time label |
| `needs_attention` | `--urgent` banner + `AlertTriangle`, pulsing (reduced motion: static) |

### Quick-Add Bar
- Always visible at the bottom of Today and Inbox views.
- Single text field. Enter key submits.
- Natural-language parsing (date/time/priority extracted inline).
- Keyboard shortcut: `N` globally opens it.

### Focus Timer Display
- Full-screen during active round.
- Shows: task title, elapsed/remaining time, round number, daily count.
- Control: Start / Pause / End Round.
- Background survival: timer state persists via `localStorage` + Service Worker.

---

## 10. PWA Shell

- `manifest.json`: `display: standalone`, `theme_color: #000000`, `background_color: #000000`
- Icons: 192×192 and 512×512 (maskable)
- Service Worker: network-first for API, cache-first for static assets; Background Sync queue for offline writes
- Install prompt: shown after 3 days of use, not on first open
