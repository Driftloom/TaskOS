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
  version: '0.1.3',
  versionCode: 4,
  releaseDate: 'October 2026',
  highlights: [
    {
      title: 'SecretOps & BYOK Credential Security',
      description: 'Isolated credential modules, AES-256-GCM envelope encryption for BYOK keys, and strict secret sanitization on memory endpoints.',
    },
    {
      title: 'Conversational Agent & Intent Engine',
      description: 'Dynamic grounding with real-time user context, two-stage intent engine with offline deterministic fallbacks.',
    },
    {
      title: '10-Gate CI Ladder & Concurrency Lock',
      description: 'Exclusive cross-process build lock guarding against incremental build cache races across 10 strict verification gates.',
    },
    {
      title: 'Zero Token Debt & WCAG AA Contrast',
      description: 'Zero-baseline token compliance across all 147 source files, 0 contrast failures across themes, and verified tap target floors.',
    },
    {
      title: 'Live Production Automation',
      description: 'Render DISPATCH_SECRET sync verified live via Infisical with active pg_cron reminder and reschedule dispatching.',
    },
  ],
  changelogHistory: [
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
