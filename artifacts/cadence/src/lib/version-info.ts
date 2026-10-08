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
  version: '0.1.5',
  versionCode: 6,
  releaseDate: 'October 2026',
  highlights: [
    {
      title: 'Monthly Goals Subsystem',
      description: 'Set and track monthly intentions automatically evaluated from actual focus and task telemetry. Reality-grounded 30d/90d baseline guidance.',
    },
    {
      title: 'Immutable Snapshot Ledger',
      description: 'Monthly goal snapshots stored in a tamper-proof ledger protected by PostgreSQL triggers blocking UPDATE and DELETE.',
    },
    {
      title: 'End-of-Month Review Ritual',
      description: 'Reflective monthly review modal with completion telemetry, achieved/missed breakdowns, and non-destructive carry-forward cloning.',
    },
    {
      title: '10-Gate Ladder Verification',
      description: '826 Vitest unit & contract tests across 58 test files and 119 Playwright E2E tests passing 100% green with 0 token violations.',
    },
  ],
  changelogHistory: [
    {
      version: 'v0.1.5',
      date: 'October 2026',
      items: [
        'Added migration 0018_monthly_goals.sql creating monthly_goals and immutable monthly_goal_snapshots with PostgreSQL mutation rejection triggers.',
        'Implemented DST-safe half-open month windows [start, end) in user IANA timezone across all spec timezones.',
        'Built automated telemetry metrics for focus minutes, sessions, days, tasks completed, and tasks completed on time.',
        'Added trailing 30d/90d baseline telemetry helper grounding goal targets in reality.',
        'Added Monthly Review ritual dialog and non-destructive carry-forward cloning.',
        'Added /internal/goals/close-month cron endpoint with idempotency checks and DISPATCH_SECRET security.',
        'Mounted GoalsPage at /goals with AppShell navigation and CommandPalette shortcut.',
        '826 Vitest unit & contract tests across 58 files and 119 Playwright E2E tests across 15 spec files (100% green).',
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
