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
  version: '0.1.2',
  versionCode: 3,
  releaseDate: 'October 2026',
  highlights: [
    {
      title: 'Dynamic First-Visit Performance',
      description: 'Zero-overhead optimistic routing meets all Web Vitals budgets with 0 render-blocking third-party scripts.',
    },
    {
      title: 'Session Persistence & Safe Areas',
      description: 'Zero cold-start session reset, route resumption to active workspace, and notch/dock clearance.',
    },
    {
      title: 'Zero Data Loss & My Activity Page',
      description: 'Durable user activity tracking with offline queuing and dedicated history audit page.',
    },
    {
      title: 'Design System & Density Modes',
      description: 'Interactive Design Catalog at /__design, zero-baseline token hygiene, and pointer-aware compact density.',
    },
    {
      title: 'Enterprise Product Tour',
      description: 'Interactive onboarding walkthrough with value-first notification primer and contextual reminders.',
    },
  ],
  changelogHistory: [
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
