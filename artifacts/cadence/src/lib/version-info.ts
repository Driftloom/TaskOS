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
  version: '0.1.1',
  versionCode: 2,
  releaseDate: 'October 2026',
  highlights: [
    {
      title: 'Full-Screen Mobile Experience',
      description: 'Zero browser top bar inside installed Android APK and standalone PWA.',
    },
    {
      title: 'Seamless Background Updates',
      description: 'Automatic over-the-air update detection with "What\'s New" changelog and Settings controls.',
    },
    {
      title: 'Zero Data Loss & My Activity Page',
      description: 'Durable user activity tracking with offline queuing and dedicated history audit page.',
    },
    {
      title: 'Edge-to-Edge Responsiveness',
      description: 'Viewport safe-area insets, notch protection, responsive timer scaling, and mobile-friendly touch interactions.',
    },
    {
      title: 'Multi-Tab Master Sync',
      description: 'Cross-tab auth synchronization and single master focus timer to prevent duplicate audio bells.',
    },
  ],
  changelogHistory: [
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
