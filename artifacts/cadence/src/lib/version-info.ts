export interface ReleaseHighlight {
  title: string;
  description: string;
}

export interface VersionInfo {
  version: string;
  versionCode: number;
  releaseDate: string;
  highlights: ReleaseHighlight[];
  changelogHistory: {
    version: string;
    date: string;
    items: string[];
  }[];
}

export const APP_VERSION_INFO: VersionInfo = {
  version: '0.1.8',
  versionCode: 9,
  releaseDate: 'October 2026',
  highlights: [
    {
      title: 'Mobile Bottom-Only Chrome',
      description: 'The sticky top header is now desktop-only: on a phone the shell is one glass layer at the bottom (§P16 dock unchanged), with the profile chip and brand wordmark, sound, theme, and command-palette controls relocated into the More sheet, and status banners pinning to the safe-area top instead of a header that no longer exists. New E2E coverage asserts the header is hidden at 390px and every sheet control holds the 44px tap floor.',
    },
    {
      title: 'Scheduler Honesty & Timezone-Correct Defaults',
      description: 'The public landing bento grid now labels every demo panel as an interactive preview on sample data (no live-account claims, no simulated "live" pulse), the PWA widget payload is an honest static title instead of invented task data, and all server-side day-boundary math (recurrence materialization, agent schedule queries, notification defaults) resolves each user\'s real IANA timezone with the Asia/Kolkata (D-01) fallback instead of server-local UTC.',
    },
    {
      title: 'Dispatch Secret Moved to Supabase Vault (G4-j Closed)',
      description: 'The month-close cron job that had never fired was traced to a NULL runtime secret lookup plus plaintext secrets baked into every scheduled command. All five pg_cron jobs now resolve x-dispatch-secret from a vault secret at job time, verified live with two accelerated HTTP-200 month-close ticks and a 200 on the natural dispatch path.',
    },
    {
      title: 'Page-by-Page Data-Honesty Remediation',
      description: 'Projects now loads the full task list (scope all, not server-default today) so off-today project tasks render; the Morning Ritual no longer claims a #1 priority was set when nothing was selected or no provider exists; the Calendar day grid derives hour rows from real block start hours (23:00 and 00:00 blocks render, D-02) and week/month views surface a visible "N tasks not shown" Inbox chip; On-Time Rate shows an em dash while loading instead of a fabricated 100%; Settings device counts and desktop channel badges (Telegram Primary, Device Alerts Secondary — D-15) never assert unverified values; and Telegram deep-link fallbacks no longer guess a bot username.',
    },
    {
      title: 'End-to-End Auth, Security & Performance Test Suite',
      description: 'Comprehensive test coverage across Express HTTP contracts (AUT-01/02), Postgres RLS multi-tenant boundary isolation (AZT-01/02/03), auth rejection latency SLA (TC-PRF-04), frontend routing and deep-link preservation (App.test.tsx), and Playwright E2E suites verifying fluid responsive card width, 44px tap targets, WCAG 2.2 AA contrast, and Core Web Vitals hydration stability.',
    },
    {
      title: 'Honest Streak Note on Review',
      description: 'The Evening Ritual card now derives its streak note from the real momentum.streakDays instead of a hardcoded "Streak preserved" claim, showing "No active streak" whenever the streak is zero.',
    },
    {
      title: 'Settings & Activity Layout Integrity Pass',
      description: 'Merged the split time/rhythm settings into one grouped card, unified boolean preferences onto the real Switch primitive (sound, reminders dispatcher, auto-reschedule) with a segmented control for reduced motion, migrated the Activity header to the shared SectionHeading with an action slot, fixed the mobile metric-ribbon border artifact, and brought every filter pill, search field, and header action to the 44px tap-target floor (D-29).',
    },
    {
      title: 'Sidebar Navigation Integrity Pass',
      description: 'Digit shortcut badges now mirror the real key bindings (0–6 via a single NAV_SHORTCUT_KEYS source), the New task hint shows N instead of the sidebar toggle, every nav surface declares aria-current="page", and the mobile More sheet is a labelled modal dialog with a focus trap and focus restore.',
    },
    {
      title: 'Design System Typography Calibration & Responsiveness Overhaul',
      description: 'Restored geometric OpenType features (cv02, cv03, cv04, cv11, ss01) across global typography, realigned typographic hierarchy eliminating improper 14px micro headings in favor of P7 tokens (title3 and headline), hardened touch-device scroll safety in 3D tilt cards, and stabilized mobile viewport heights with min-h-[100dvh].',
    },
    {
      title: 'Daily Command Deck & Unified Dashboard (/dashboard)',
      description: 'Comprehensive high-level command center consolidating daily Activity Rings, streak tracker, top-priority focus task launcher, inbox triage pulse, today\'s scheduled time blocks, and active monthly goals horizon.',
    },
    {
      title: 'Full-Bleed 3D Spatial Experience & Interactive 3D Bento Canvases',
      description: 'End-to-end spatial 3D experience featuring an unboxed, borderless native WebGL 3D Chrono-Sphere in the hero stage, continuous ambient celestial stardust galaxy across all scroll depths, stereoscopic unflattened 3D tilt cards with cursor-tracking spotlight rims, and interactive Three.js micro-canvases: 3D Activity Rings with volumetric toruses and celebration particles, 3D Decision Gyroscope for 9-rule auto-rescheduling, 3D Origami Telegram Plane with aerodynamic banking and barrel rolls, and 3D Lexer Token Prism—maintaining 100% WCAG AA compliance and zero token lint debt.',
    },
    {
      title: 'What Slipped & Why — Raw Table Reconciliation Engine',
      description: 'Automated lookback audit reconciling tasks, reschedule proposals, and agent action logs. Displays On-Time Completion Rate, 4-tier failure taxonomy, actionable recovery recommendations, and tamper-evident raw table proof.',
    },
    {
      title: 'Native VAPID Web Push (RFC 8291)',
      description: 'Zero-app background push notifications directly to device lock screens (desktop and mobile PWA). Standalone VAPID endpoints, multi-device registration, automatic dead-device pruning, and 1-tap test dispatch.',
    },
    {
      title: 'Enterprise Dynamic Model Discovery & Fallback Matrix',
      description: 'Zero-token native model discovery for Google Gemini, Groq, and OpenRouter eliminating 404 key probe rejections. Frontier curated defaults with Gemini 3.8 Flash (Recommended), 3.8 Flash Lite (Cheapest), and 3.1 Pro (Deep Reasoning).',
    },
    {
      title: 'Autonomous Model Switching & Telegram Bot /model',
      description: 'Switch models in 1 click in /agent, dynamically via conversational triggers, or via the Telegram bot /model command without re-entering keys.',
    },
    {
      title: 'Monthly Goals Subsystem',
      description: 'Set and track monthly intentions automatically evaluated from actual focus and task telemetry. Reality-grounded 30d/90d baseline guidance.',
    },
    {
      title: 'Dedicated Assistant Co-Pilot Surface',
      description: 'The conversational Assistant is now its own dedicated page at /agent, keeping Today clean and aligning the mobile dock with Apple HIG (§P16).',
    },
  ],
  changelogHistory: [
    {
      version: 'v0.1.8',
      date: 'October 2026',
      items: [
        'Mobile bottom-only chrome: the top header is hidden below lg, the mobile brand link and header capture button were removed (the dock FAB is the capture affordance), and profile, sound, theme, and the command palette moved into the More sheet with dedicated *-sheet testids; sticky status banners re-anchored via a shared .sticky-banner-top utility (safe-area top on mobile, below the 56px header at lg+). Playwright E2E suite now 151 tests across 19 files.',
        'Landing bento grid honesty pass: preview chip ("Interactive Preview · Sample Data"), sample-data webhook feed label replacing the simulated live pulse, "Strict Streaks" chip naming the real mechanic, and a visible disclosure that the demo runs on sample data, not live account data.',
        'PWA widget payload (today-data.json) replaced with a static honest title instead of fabricated task and streak data.',
        'Timezone-correct scheduling internals: recurrence materialization fetches each user\'s IANA timezone (D-01 fallback Asia/Kolkata) before computing day boundaries, and the agent query_schedule tool converts wall-clock day windows to UTC per user zone.',
        'Server-side notification defaults now use Asia/Kolkata as the default timezone (D-01) instead of UTC for new and defaulted notification_settings rows.',
        'Migrated all five pg_cron jobs to runtime Supabase Vault secret lookup (cadence_dispatch_secret), removing plaintext DISPATCH_SECRET from cron.job.command; close-month job NULL-lookup root cause fixed and proven live with accelerated HTTP-200 ticks; backup of legacy jobs captured pre-migration.',
        'lib/db/setup_supabase_cron.sql rewritten to the Vault generation with pre-flight validation, idempotent secret seeding, and dirty-job diagnostics; kept gate-9 parse shape.',
        'verify-two-account-isolation.cjs hardened: account IDs moved to env keys (CADENCE_ISOLATION_USER_A_ID/B), explicit CADENCE_ALLOW_LIVE_WRITES=1 gate for non-local targets, generic env-setting helper.',
      ],
    },
    {
      version: 'v0.1.7',
      date: 'October 2026',
      items: [
        'Calibrated typography system with OpenType geometric features (cv02, cv03, cv04, cv11, ss01), eliminated improper 14px micro headings in favor of P7 tokens (title3 and headline) across all app pages, hardened mobile viewport stability with min-h-[100dvh], and secured touch-device scroll safety in 3D tilt cards.',
        'Added Daily Command Deck & Unified Dashboard (/dashboard) with real-time Activity Rings, Next Up single-task focus launcher, inbox triage, time blocks snapshot, and active monthly goals.',
        'Integrated Three.js interactive 3D micro-canvases (ActivityRings3D, DecisionGyro3D, TelegramPlane3D, TokenLexer3D, TimeGrid3D) and persistent AmbientCosmicStream3D celestial stardust stream with 0 console warnings, unflattened stereoscopic card elevations, and vendor-three chunk caching.',
        'Implemented end-to-end craft redesign of the public Landing Page (/) with an Asymmetric Split Hero, live Interactive Natural Language Capture Sandbox, Bento 2.0 Engine Grid, and Paper-Calm Philosophy pillars.',
        'Maintains strict performance invariants: entry chunk 71.11 kB (vs 120 kB budget), cold-load JS 151.57 kB (vs 200 kB budget), 0 token lint violations, and 0 WCAG AA violations.',
        'Implemented "What Slipped & Why" raw-table reconciliation engine (GET /api/analytics/slippage) fulfilling Module 15 requirement.',
        'Reconciles tasksTable, rescheduleProposalsTable, rescheduleRunsTable, and agentActionLogTable with user-scoped RLS and configurable lookback window.',
        '4-tier failure taxonomy: Capacity Overrun, Missed Deadline, Postponed by User, and Flagged (Cap Exceeded) with actionable remediation recommendations.',
        'Interactive ReviewPage card featuring On-Time Completion rate, category count pills, slipped tasks audit list, and tamper-evident raw table reconciliation footer.',
        'WCAG AA accessible with zero axe-core contrast violations across light and dark themes.',
        '896 Vitest unit & contract tests across 70 files (100% green); 144 Playwright E2E tests across 19 files (100% green).',
        'Added a keyboard skip link as the app shell first tab stop targeting #main-content, so keyboard users can bypass repeated sidebar and dock chrome (WCAG 2.4.1 bypass).',
        'Completed page-by-page data-honesty remediation: Projects scope-all fetch, ritual-task selection honesty, calendar hour-grid derived from real block start hours with an undated-tasks Inbox chip, loading-safe On-Time Rate, device-count and channel-hierarchy labels aligned to D-15, and no invented Telegram bot handles.',
      ],
    },
    {
      version: 'v0.1.6',
      date: 'October 2026',
      items: [
        'Implemented native VAPID Web Push (RFC 8291) with migration 0019_web_push_subscriptions.sql and user-scoped RLS policies.',
        'Integrated background push delivery in reminder cron dispatcher and added 1-tap subscription/test alert UI in Settings.',
        'Implemented enterprise dynamic model discovery (GET /api/agent/models/:provider) via Google ListModels API, Groq, and OpenRouter consuming 0 inference tokens.',
        'Eliminated false-negative 404 key probe rejections during BYOK credential validation by probing discovered working models.',
        'Curated Gemini 3.8 Flash (Recommended), Gemini 3.8 Flash Lite (Cheapest), Gemini 3.1 Pro (Deep Reasoning), and Groq Llama 3.3 70B with capability tier badges.',
        'Added Telegram bot /model command and conversational model switching triggers in ReAct loop.',
        'Enabled dynamic model selection in UI with zero key re-entry, preserving AES-256-GCM encrypted keys in PostgreSQL.',
        '888 Vitest unit & contract tests across 67 files (100% green); 144 Playwright E2E tests (100% green).',
      ],
    },
    {
      version: 'v0.1.5',
      date: 'October 2026',
      items: [
        'Optimized /sign-in Auth Core Web Vitals: desktop reaches 100/100 (579ms LCP, 0.000 CLS, 0ms TBT); mobile LCP reduced by 3.2s down to 2,513ms via zero-shift AuthFallbackCard and HTML head script preloading.',
        'Added migration 0018_monthly_goals.sql creating monthly_goals and immutable monthly_goal_snapshots with PostgreSQL mutation rejection triggers.',
        'Decoupled conversational Assistant from Today into dedicated /agent route; aligned mobile bottom dock to §P16 (Today · Calendar · Capture · Agent · More).',
        'Implemented DST-safe half-open month windows [start, end) in user IANA timezone across all spec timezones.',
        'Built automated telemetry metrics for focus minutes, sessions, days, tasks completed, and tasks completed on time.',
        'Added trailing 30d/90d baseline telemetry helper grounding goal targets in reality.',
        'Added Monthly Review ritual dialog and non-destructive carry-forward cloning.',
        'Added /internal/goals/close-month cron endpoint and verify:cron-routes gate (11-gate ladder green at the time of this release).',
        'WCAG AA contrast fix on composited AI tint and running-timer focus mini chip E2E coverage.',
        'Added standalone Quick Focus Session mode (G4-d) allowing immediate 25m focus round and persistent background recovery even with an empty task queue.',
        'Hardened Focus Timer offline-first recovery: restored active round synchronously on mount from localStorage anchor and added customFetch 401 retry on Clerk token race.',
        'Hardened Agent natural language task intent classifier (G4-g, G4-h) matching "create a task to..." patterns and stripping leading prepositions with instant 1-tap undo.',
        'Added explicit Telegram bot webhook "help" command handler delivering instant interactive command palette to Rohit.',
        'Connected and verified 2-way Telegram bot integration (@cadence_tasks_bot) with Infisical secret synchronization and database fallback credentials.',
        '846 Vitest unit & contract tests across 61 files (100% green).',
      ],
    },
    {
      version: 'v0.1.4',
      date: 'October 2026',
      items: [
        'Added migration 0017_tasks_archive_and_search.sql with PostgreSQL GIN index on tsvector expression across task title and notes.',
        'Wired live full-text search with relevance ranking into the Cmd+K command palette with keyboard navigation.',
        'Added task status "archived" preserving completed_at, dedicated Inbox archive view, and restore actions in TaskEditor.',
        'Implemented TaskLinkChips with interactive external link badges and click isolation.',
        'Added POST /integrations/url-metadata with SSRF protection, private IP blocking, 3.5s timeout aborts, and 64KB chunk limits.',
        '801 Vitest unit & contract tests across 54 files and 118 Playwright E2E tests across 14 spec files (100% green).',
      ],
    },
    {
      version: 'v0.1.3',
      date: 'October 2026',
      items: [
        'Isolated Telegram bot credentials and implemented BYOK encryption with migration 0016_llm_credentials.sql.',
        'Dynamic conversational agent with real-time prompt grounding and robust intent fallback engine.',
        'Upgraded to 10-gate verification ladder with exclusive cross-process build lock (scripts/lib/build-lock.cjs).',
        'Zero token lint debt across all 147 source files with full scale emission and WCAG AA contrast compliance.',
        'Production Render DISPATCH_SECRET synced via Infisical; verified live automation heartbeat across all 6 links.',
        '784 Vitest tests passing across 50 files; 116 Playwright E2E tests passing 100% green.',
      ],
    },
    {
      version: 'v0.1.2',
      date: 'October 2026',
      items: [
        'Dynamic Clerk boundary for cold first-visits, cutting 359 kB of auth transfer from public routes.',
        'Session persistence hydration guard and cadence_last_path route resumption on app reopen.',
        'Safe-area dock clearance (pb-dock-clearance) preventing bottom item overlap on mobile devices.',
        'Interactive Design System Catalog mounted at /__design for live token and layout inspection.',
        'Zero-baseline token hygiene achieved with 0 errors across 92 scanned source files.',
        '100/100 Playwright E2E tests green across accessibility, keyboard, and task lifecycle suites.',
      ],
    },
    {
      version: 'v0.1.1',
      date: 'October 2026',
      items: [
        'Added standalone detection on Landing Page to hide redundant download CTAs when installed.',
        'Hardened Service Worker update lifecycle with dismissible notifications and re-open modal.',
        'Created dedicated /activity page with filtering, date scopes, search, and CSV/JSON export.',
        'Added notch safe-area utilities (pt-safe, pb-safe) for edge-to-edge mobile viewports.',
        'Enabled cross-tab session synchronization and single-master focus timer election.',
      ],
    },
    {
      version: 'v0.1.0',
      date: 'September 2026',
      items: [
        'Initial production release: Task capture, 9-rule reschedule engine, and focus rounds.',
        'Clerk authentication with Supabase Row-Level Security.',
        'Telegram bot companion with two-way dispatch.',
      ],
    },
  ],
};

const DISMISSED_UPDATE_STORAGE_KEY = 'cadence_dismissed_update_version';

export function markUpdateDismissed(version: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DISMISSED_UPDATE_STORAGE_KEY, version);
  } catch {
    // ignore
  }
}

export function isUpdateDismissedThisSession(version: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DISMISSED_UPDATE_STORAGE_KEY) === version;
  } catch {
    return false;
  }
}
