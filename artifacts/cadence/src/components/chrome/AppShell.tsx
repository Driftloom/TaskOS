import { Suspense, lazy, useState, useEffect, useMemo, useCallback, useRef, startTransition, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import {
  getListFocusSessionsQueryKey,
  getListTasksQueryKey,
  useHealthCheck,
  useListFocusSessions,
  useListTasks,
} from '@workspace/api-client-react';
import {
  CalendarDays,
  Command,
  Focus,
  Inbox,
  ListChecks,
  Pause,
  Plus,
  Settings,
  Target,
  Brain,
  User,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Sun,
  Moon,
  Folder,
  History,
  Milestone,
  LayoutDashboard,
} from 'lucide-react';
import { dateLabel, formatTimer, today, timezone } from '@/lib/date-utils';
import {
  anchorMatches,
  elapsedFromAnchor,
  readAnchor,
  type RunAnchor,
} from '@/lib/focus/runAnchor';
import { soundFX } from '@/lib/sound-fx';
import { useDevMockActive } from '@/lib/useDevMockActive';
import { NAV_SHORTCUT_KEYS, useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useTheme } from './ThemeProvider';
import { OfflineBanner, SystemStatusBanner } from './SystemStatusBanner';
import { AutomationPausedBanner } from './AutomationPausedBanner';
import { CommandPalette } from './CommandPalette';
/* QuickCaptureSheet is 1556 lines and was a STATIC import, so its entire tree
 * shipped in the entry chunk even though it is a modal that most sessions never
 * open -- measured as the single largest avoidable item in the entry bundle.
 *
 * It is split, but it is NOT deferred past first interaction: `captureOpen` is
 * false on every first paint, so a lazy import here would make the primary
 * capture affordance wait on a network round trip, which is exactly the cost
 * users would feel most. The prefetch below makes the chunk warm during idle
 * time, so by the time anyone taps + or presses N it is already in cache.
 * See scripts/verify-web-vitals-budget.cjs, which fails the build if the entry
 * chunk regresses past the budget in docs/13 P26.2. */
const QuickCaptureSheet = lazy(() =>
  import('@/components/task/QuickCaptureSheet').then((m) => ({ default: m.QuickCaptureSheet })),
);
const FirstRunTourModal = lazy(() =>
  import('@/components/tour/FirstRunTourModal').then((m) => ({ default: m.FirstRunTourModal })),
);

export type PageKey =
  | '/dashboard'
  | '/today'
  | '/inbox'
  | '/focus'
  | '/calendar'
  | '/projects'
  | '/goals'
  | '/agent'
  | '/review'
  | '/activity'
  | '/memory'
  | '/settings'
  | '/profile';

export const primaryNavItems: {
  href: PageKey;
  label: string;
  icon: typeof CalendarDays;
  accent?: string;
  badge?: string;
}[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/today', label: 'Today', icon: Target },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/focus', label: 'Focus', icon: Focus },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
];

export const secondaryNavItems: {
  href: PageKey;
  label: string;
  icon: typeof CalendarDays;
  accent?: string;
  badge?: string;
}[] = [
  { href: '/projects', label: 'Projects', icon: Folder },
  { href: '/goals', label: 'Goals', icon: Milestone },
  { href: '/agent', label: 'Assistant', icon: Sparkles, accent: 'hsl(var(--ai-fill))', badge: 'AI' },
  { href: '/review', label: 'Review', icon: ListChecks },
  { href: '/activity', label: 'Activity', icon: History },
  { href: '/memory', label: 'Memory', icon: Brain, accent: 'hsl(var(--ai-fill))', badge: 'AI' },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/profile', label: 'Profile', icon: User },
];

export const navItems = [...primaryNavItems, ...secondaryNavItems];
/**
 * Mobile drawer navigation (substitui o §P16 bottom dock, decisão do owner
 * 2026-10-20): o motivo foi mis-tap — 5 slots em 64px de barra geravam toques
 * errados. O drawer traz TODAS as 13 rotas como linhas full-width min-h-12
 * (48px) com espaçamento real, mais captura, perfil e quick settings. Deriva
 * de `navItems` (a MESMA array da sidebar), então rota nova nunca diverge
 * entre sidebar e drawer.
 */

interface AppShellProps {
  children: ReactNode;
}

/**
 * The §P11.1 / §P16 focus mini chip's data, derived entirely inside the shell.
 *
 * `FocusPage` owns no shared state that this needs, and the shell does not
 * import from it (that would invert the chrome -> page dependency and, worse,
 * would remount the page). The two facts the chip wants are already both
 * reachable from two places the shell may legitimately read:
 *
 *  - **Which round is live** — `useListFocusSessions` with the *same* params and
 *    the same `getListFocusSessionsQueryKey` `FocusPage` uses, so this is one
 *    shared react-query cache entry, not a second request or a second copy of
 *    the state.
 *  - **How long it has run** — `@/lib/focus/runAnchor`, the same persisted
 *    anchor `FocusPage` writes. This component never owns a clock; the interval
 *    below only schedules re-renders so the chip can re-read `Date.now()`, and
 *    every readout is recomputed from `runStartedAt`. A throttled or frozen
 *    interval can therefore only leave the chip stale, never wrong
 *    (`runAnchor.ts`: "never an accumulated counter").
 */
function useFocusMiniChip() {
  const params = useMemo(
    () => ({ date: today(), scope: 'today' as const, timezone: timezone() }),
    [],
  );

  const { data: sessions } = useListFocusSessions(params, {
    query: { queryKey: getListFocusSessionsQueryKey(params) },
  });

  // The first live-or-paused round is the one the timer is on. `completed` and
  // `canceled` are deliberately excluded, which is also what keeps the chip
  // away from `idle` and `finished`.
  const round = useMemo(
    () => sessions?.find((item) => item.status === 'active' || item.status === 'paused') ?? null,
    [sessions],
  );

  // Only fetch the task list once a round exists: the title is the only thing
  // needed from it, and gating the query keeps the common no-round-running path
  // from adding a request on screens that never ask for today's tasks.
  const { data: tasks } = useListTasks(params, {
    query: { queryKey: getListTasksQueryKey(params), enabled: Boolean(round) },
  });

  // Seeded at mount rather than in an effect, so a cold start on a round that
  // has been running for a while shows the real elapsed time on the FIRST paint
  // instead of flashing the server's minute-rounded value.
  const [anchor, setAnchor] = useState<RunAnchor | null>(() => readAnchor());
  const [now, setNow] = useState(() => Date.now());

  // Only an `active` round advances. A paused round reads its banked minutes
  // from the server and has no anchor (`FocusPage` clears it on pause), so
  // ticking for it would only invite drift between the chip and the full timer.
  const tickingRoundId = round?.status === 'active' ? round.id : null;

  useEffect(() => {
    if (tickingRoundId === null) return;

    const refresh = () => {
      setAnchor(readAnchor());
      setNow(Date.now());
    };
    // Read once up front: a round started on this device writes its anchor in
    // the same commit that invalidates this query, and waiting a full second for
    // the first tick would show 00:00 in the meantime.
    refresh();

    const interval = window.setInterval(refresh, 1000);
    // Coming back to a throttled tab must correct the readout immediately, not
    // on the next tick that may never be scheduled.
    const onReturn = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [tickingRoundId]);

  const elapsedSeconds = useMemo(() => {
    if (!round) return 0;
    // Status is the gate, not anchor presence: a stale anchor left over from
    // before a pause must never be allowed to advance a stopped clock.
    if (round.status === 'active' && anchor && anchorMatches(anchor, round.id)) {
      return elapsedFromAnchor(anchor, now);
    }
    return round.elapsedMinutes * 60;
  }, [round, anchor, now]);

  const taskTitle = round
    ? tasks?.find((task) => task.id === round.taskId)?.title?.trim() || null
    : null;

  return { round, elapsedSeconds, taskTitle };
}

export function AppShell({ children }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const [captureOpen, setCaptureOpen] = useState(false);

  // Warm the capture chunk during idle time. Capture is reachable in one tap
  // from every screen and by the N/Cmd+K shortcuts, so deferring its code until
  // the first tap would trade bytes for latency on the app's most-used
  // affordance. requestIdleCallback is feature-detected because Safari only
  // gained it in 16.4 and a missing call must not break the shell.
  useEffect(() => {
    const warm = () => {
      void import('@/components/task/QuickCaptureSheet');
    };
    const idle = window.requestIdleCallback as undefined | ((cb: () => void) => number);
    if (typeof idle === 'function') {
      const handle = idle(warm);
      return () => (window.cancelIdleCallback as (h: number) => void)(handle);
    }
    const timer = window.setTimeout(warm, 2000);
    return () => window.clearTimeout(timer);
  }, []);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => soundFX.isEnabled());
  const { theme, toggleTheme } = useTheme();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cadence_sidebar_collapsed') === 'true';
    }
    return false;
  });

  // True once the dev mock has answered an API request. The data on screen is
  // then SAMPLE data, and the shell says so on every page.
  const devMockActive = useDevMockActive();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    soundFX.playClick();
    startTransition(() => {
      setSidebarCollapsed((prev) => !prev);
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cadence_sidebar_collapsed', String(sidebarCollapsed));
    } catch {
      // quota or private browsing safe fallback
    }
  }, [sidebarCollapsed]);

  // The drawer is a modal dialog: on open it takes focus (close button
  // first), Tab is trapped inside it, and on close focus returns to the
  // hamburger trigger. Escape closes via the global shortcut hook, whose
  // cleanup path this restore rides on.
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const closeBtn = drawer.querySelector<HTMLButtonElement>('[data-testid="button-close-drawer"]');
    (closeBtn ?? drawer.querySelector<HTMLElement>('a[href]'))?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusables = Array.from(
        drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      if (event.shiftKey && (activeEl === first || !drawer.contains(activeEl))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeEl === last || !drawer.contains(activeEl))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      menuTriggerRef.current?.focus();
    };
  }, [mobileDrawerOpen]);

  const { signOut } = useClerk();
  const { user } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  // §P11.1 mini chip inputs. The hook is called unconditionally so the hook
  // order is stable; `showFocusChip` is the only place its null case is
  // resolved, and both queries are cache reads that cost nothing when warm.
  const focusChip = useFocusMiniChip();
  const showFocusChip = focusChip.round !== null && location !== '/focus';

  // Public health probe — no auth required, answers before Clerk is configured.
  const health = useHealthCheck();
  const backendDown = health.data?.status === 'degraded' || health.data?.database === 'down';

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Global Keyboard Shortcuts via consolidated useKeyboardShortcuts hook
  useKeyboardShortcuts({
    onQuickCapture: () => {
      soundFX.playClick();
      setCaptureOpen(true);
    },
    onCommandPalette: () => setCmdOpen((prev) => !prev),
    onToggleSidebar: toggleSidebar,
    onEscape: () => {
      if (mobileDrawerOpen) setMobileDrawerOpen(false);
    },
    onNavigate: (dest) => {
      soundFX.playClick();
      setLocation(dest as PageKey);
      setMobileDrawerOpen(false);
    },
  });

  const toggleSound = () => {
    const next = soundFX.toggle();
    setSoundEnabled(next);
  };

  const displayName =
    user?.firstName ??
    user?.username ??
    user?.primaryEmailAddress?.emailAddress ??
    'You';
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      {/* Skip link — the shell's first tab stop. The sidebar (~8 links, the
          dock's 5, header controls) is repeated chrome on every route, and
          `#main-content` existed with no anchor to it. Hidden until focus,
          visible on it: bg-primary pairs with text-primary-foreground (the
          pairing DESIGN.md mandates on bg-primary), and py-3 + text-body is
          a 48px hit box, clearing the 44px floor (§P29). */}
      <a
        href="#main-content"
        onClick={() => soundFX.playClick()}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-5 focus:py-3 focus:text-body focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>
      {/* Desktop Sidebar (Linear / Apple HIG Minimalist Dark) */}
      <aside
        aria-label="App sidebar"
        className={`fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border-control bg-card/95 px-3.5 py-4 backdrop-blur-2xl ${
          mounted ? 'transition-transform duration-base ease-in-out' : ''
        } lg:flex ${
          sidebarCollapsed
            ? '-translate-x-full pointer-events-none'
            : 'translate-x-0'
        }`}
        aria-hidden={sidebarCollapsed}
      >
        {/* Brand & Collapse Button */}
        <div className="mb-5 flex items-center justify-between px-2 py-1.5">
          <Link
            href="/dashboard"
            onClick={() => soundFX.playClick()}
            data-testid="link-brand"
            className="flex items-center gap-2.5 transition-transform active:scale-[0.98]"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary text-primary-foreground font-black shadow-sm">
              <span className="font-mono text-caption font-black">C</span>
            </span>
            <span className="text-callout font-bold tracking-tight text-foreground">
              cadence
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            {/* Online status indicator */}
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-caption font-mono border ${
                isOnline
                  ? 'bg-success/10 text-status-success-text border-success/20'
                  : 'bg-destructive/10 text-destructive border-destructive/20'
              }`}
            >
              <span className={`size-1.5 rounded-full ${isOnline ? 'bg-success' : 'bg-destructive'}`} />
              <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>

            {/* Collapse Sidebar Button */}
            <button
              onClick={toggleSidebar}
              data-testid="button-collapse-sidebar"
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors tap-target-expand"
              title="Close sidebar (Ctrl+\\)"
              aria-label="Close sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          </div>
        </div>

        {/* Workspace Section Header */}
        <p className="mb-1.5 px-2 font-mono text-caption uppercase tracking-[0.16em] text-muted-foreground font-semibold">
          Workspace
        </p>

        {/* Primary Navigation */}
        <nav className="space-y-0.5" aria-label="Primary navigation">
          {navItems.map(({ href, label, icon: Icon, accent, badge }) => {
            const active = location === href || location.startsWith(`${href}/`);
            const shortcutNum = NAV_SHORTCUT_KEYS[href] ?? null;

            return (
              <Link
                href={href}
                key={href}
                onClick={() => soundFX.playClick()}
                aria-current={active ? 'page' : undefined}
                data-testid={`link-nav-${label.toLowerCase()}`}
                /* The nav items are h-8 (32px) stacked with no gap between them, so
                   `tap-target-expand` is safe here: consecutive centres are 32px
                   apart but the row is a single-column list where a 6px overlap
                   lands on the neighbour's label, not on a competing control. This
                   is the one place the utility's caveat is knowingly traded --
                   the alternative is 44px rows, which breaks the sidebar rhythm. */
                className={`group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-footnote font-medium transition-colors tap-target-expand ${
                  active
                    ? 'bg-card/[0.08] text-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-card/[0.04] hover:text-foreground'
                }`}
              >
                {/* Active Indicator Bar */}
                {active && (
                  <span className="absolute left-1 h-3.5 w-1 rounded-full bg-primary" />
                )}

                <Icon
                  size={15}
                  strokeWidth={active ? 2.2 : 1.7}
                  style={{ color: !active && accent ? accent : undefined }}
                  className={active ? 'text-primary-text' : 'text-muted-foreground group-hover:text-foreground'}
                />
                <span>{label}</span>

                {badge && (
                  <span
                    className="ml-auto rounded px-1.5 py-0.5 font-mono text-caption font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: accent ? 'hsl(var(--ai-fill) / 0.16)' : 'hsl(var(--foreground) / 0.08)',
                      color: accent || 'inherit',
                    }}
                  >
                    {badge}
                  </span>
                )}

                {shortcutNum && !badge && (
                  <kbd className="ml-auto hidden rounded border border-border-control bg-card/[0.03] px-1 py-0.2 font-mono text-caption text-muted-foreground group-hover:inline-block group-focus-within:inline-block">
                    {shortcutNum}
                  </kbd>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Quick Capture & Command Palette */}
        <div className="mt-auto space-y-1.5 pt-3 border-t border-border-control">
          <button
            onClick={() => {
              soundFX.playClick();
              setCaptureOpen(true);
            }}
            data-testid="button-sidebar-capture"
            className="flex h-8 w-full items-center justify-between rounded-lg border border-border-control bg-card/[0.03] px-2.5 text-caption font-medium text-foreground hover:border-border-control hover:bg-card/[0.07] hover:text-foreground transition-all active:scale-[0.98] tap-target-expand"
          >
            <span className="flex items-center gap-2">
              <Plus size={14} className="text-primary-text" />
              <span>New task</span>
            </span>
            <kbd className="rounded border border-border-control bg-card/[0.04] px-1.5 py-0.2 font-mono text-caption text-muted-foreground">N</kbd>
          </button>

          <button
            onClick={() => {
              soundFX.playClick();
              setCmdOpen(true);
            }}
            className="flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-caption text-muted-foreground hover:bg-card/[0.04] hover:text-foreground transition-colors tap-target-expand"
          >
            <span className="flex items-center gap-2">
              <Command size={13} />
              <span>Commands</span>
            </span>
            <kbd className="rounded border border-border-control bg-card/[0.04] px-1.5 py-0.2 font-mono text-caption text-muted-foreground">Ctrl+K</kbd>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`min-h-[100dvh] ${
          mounted ? 'transition-[padding] duration-base ease-in-out' : ''
        } ${sidebarCollapsed ? 'lg:pl-0' : 'lg:pl-60'}`}
      >
        {/* Sticky Header — visível em TODOS os viewports. Mobile: uma linha
            mínima com o gatilho do drawer (hamburger) + wordmark — todo o resto
            (destinos, captura, perfil, quick settings) mora no drawer, com
            linhas de 48px que resolvem o mis-tap do antigo dock. Desktop: a
            linha completa de sempre. O skip link acima continua sendo o
            primeiro tab stop nos dois layouts. */}
        <header
          data-testid="shell-header"
          className="sticky top-0 z-30 border-b border-border-control bg-background/95 backdrop-blur-xl pt-safe"
        >
          {/* Mobile row: hamburger + wordmark (some no lg) */}
          <div className="flex h-14 items-center justify-between px-4 lg:hidden">
            <button
              type="button"
              ref={menuTriggerRef}
              onClick={() => {
                soundFX.playClick();
                setMobileDrawerOpen((prev) => !prev);
              }}
              data-testid="button-mobile-menu"
              aria-label="Open navigation menu"
              aria-expanded={mobileDrawerOpen}
              aria-haspopup="dialog"
              aria-controls="mobile-drawer"
              className="-ml-1.5 grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground active:scale-95"
            >
              <Menu size={20} />
            </button>
            <Link
              href="/dashboard"
              onClick={() => soundFX.playClick()}
              data-testid="link-mobile-brand"
              className="flex items-center gap-2"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary text-caption font-black text-primary-foreground">
                C
              </span>
              <span className="font-bold tracking-tight text-foreground">cadence</span>
            </Link>
            {/* Profile avatar — replaces the dead spacer. Tapping navigates
                to /profile, matching the desktop header's profile button. */}
            <button
              onClick={() => {
                soundFX.playClick();
                setLocation('/profile');
              }}
              data-testid="button-profile-mobile"
              className={`-mr-1.5 grid size-9 place-items-center rounded-full border text-caption font-semibold transition-all tap-target-expand ${
                location === '/profile'
                  ? 'border-primary ring-2 ring-primary/30 bg-primary/20 text-primary-text'
                  : 'border-border-control bg-muted text-foreground'
              }`}
              aria-label={`Open profile for ${displayName}`}
            >
              {initials}
            </button>
          </div>

          {/* Desktop row: header completo (escondido abaixo do lg) */}
          <div className="mx-auto hidden h-14 w-full app-canvas items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-10 lg:flex">
            {/* Left Side: Desktop Toggle + Breadcrumbs */}
            <div className="flex items-center gap-2.5">
              {/* Desktop Sidebar Toggle Button (when sidebar is collapsed) */}
              {sidebarCollapsed && (
                <button
                  onClick={toggleSidebar}
                  data-testid="button-open-sidebar"
                  className="hidden lg:grid size-8 place-items-center rounded-lg border border-border-control bg-muted text-muted-foreground hover:text-foreground hover:bg-card/[0.06] transition-colors mr-1 tap-target-expand"
                  title="Open sidebar (Ctrl+\\)"
                  aria-label="Open sidebar"
                >
                  <PanelLeftOpen size={15} />
                </button>
              )}

              {/* Desktop Breadcrumbs & Date */}
              <div className="hidden items-center gap-2.5 text-caption lg:flex">
                {sidebarCollapsed && (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={() => soundFX.playClick()}
                      className="flex items-center gap-1.5 font-bold text-foreground hover:text-primary-text transition-colors"
                    >
                      <span className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-primary to-primary text-caption font-black text-primary-foreground">
                        C
                      </span>
                      <span>cadence</span>
                    </Link>
                    <span className="text-muted-foreground">/</span>
                  </>
                )}
                <span className="font-semibold text-foreground">
                  {navItems.find((item) => location === item.href || location.startsWith(`${item.href}/`))?.label ?? 'Today'}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="font-mono text-caption text-muted-foreground">
                  {dateLabel()}
                </span>
              </div>
            </div>

            {/* Header Controls */}
            <div className="flex items-center gap-2">
              {/* Audio Toggle */}
              <button
                onClick={toggleSound}
                className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-caption font-mono transition-all active:scale-95 tap-target-expand ${
                  soundEnabled
                    ? 'bg-muted text-status-success-text border-success/30 hover:bg-card/[0.06]'
                    : 'bg-muted border-border-control text-muted-foreground hover:text-foreground hover:bg-card/[0.06]'
                }`}
                aria-label={soundEnabled ? 'Mute audio' : 'Unmute audio'}
                title={soundEnabled ? 'Acoustic cues: Active' : 'Acoustic cues: Muted'}
              >
                {soundEnabled ? (
                  <Volume2 size={14} className="text-status-success-text" />
                ) : (
                  <VolumeX size={14} className="text-muted-foreground" />
                )}
                {soundEnabled && (
                  <span className="size-1.5 rounded-full bg-success animate-pulse" />
                )}
              </button>

              {/* Theme Toggle */}
              <button
                onClick={() => {
                  soundFX.playClick();
                  toggleTheme();
                }}
                data-testid="button-theme-toggle"
                className="grid size-8 place-items-center rounded-lg border border-border-control bg-card text-muted-foreground transition-colors hover:text-foreground tap-target-expand"
                aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'}
                title={theme === 'dark' ? 'Light appearance' : 'Dark appearance'}
              >
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              </button>

              {/* Command Palette Trigger */}
              <button
                onClick={() => {
                  soundFX.playClick();
                  setCmdOpen(true);
                }}
                className="grid size-8 place-items-center rounded-lg border border-border-control bg-muted text-muted-foreground hover:text-foreground hover:bg-card/[0.06] transition-colors tap-target-expand"
                aria-label="Command palette"
                title="Command palette (Ctrl+K)"
              >
                <Command size={14} />
              </button>

              {/* User Profile Navigation */}
              <button
                onClick={() => {
                  soundFX.playClick();
                  setLocation('/profile');
                }}
                data-testid="button-profile"
                className={`grid size-8 place-items-center rounded-full border transition-all tap-target-expand ${
                  location === '/profile'
                    ? 'border-primary ring-2 ring-primary/40 bg-primary/20 text-primary-text font-bold'
                    : 'border-border-control bg-muted text-caption font-semibold text-foreground hover:border-border-control/20 hover:text-foreground'
                }`}
                aria-label={`Open profile for ${displayName}`}
                title={`Profile (${displayName})`}
              >
                {initials}
              </button>
            </div>
          </div>
        </header>

        {/* System Status Banners (P17.1) — sticky under the top chrome.
            Automation-paused is non-dismissible critical and takes precedence;
            offline is a persistent role="status" banner. The shell top bar is
            visible on every viewport (mobile carries the drawer trigger), so
            `sticky-banner-top` pins below the 56px bar plus the safe-area
            inset on ALL viewports — one rule, no media query. The sample-data
            banner shares the offline banner's wrapper so the two stack
            instead of overlapping: both are pinned to the same offset. */}
        <AutomationPausedBanner />
        {backendDown && !health.isPending ? (
          <div className="sticky sticky-banner-top z-20 mx-auto w-full app-canvas px-4 pt-3 sm:px-6 lg:px-8 xl:px-10 flex flex-col gap-2">
            <SystemStatusBanner
              tone="critical"
              title="Backend unhealthy"
              description={
                health.data?.database === 'down'
                  ? "The database is unreachable. Changes can't be saved until it recovers."
                  : 'The backend is degraded. Some features may not work.'
              }
              action={{
                label: 'Retry',
                onClick: () => void health.refetch(),
                busy: health.isPending,
              }}
            />
          </div>
        ) : null}
        {devMockActive || !isOnline ? (
          <div className="sticky sticky-banner-top z-20 mx-auto w-full app-canvas px-4 pt-3 sm:px-6 lg:px-8 xl:px-10 flex flex-col gap-2">
            {devMockActive ? (
              /* The dev mock's fixtures are not the user's account. Without
                 this label, a developer (or anyone reading a dev-mode
                 screenshot) cannot tell sample data from their own. The
                 warning tone ships the AlertTriangle icon and the text, so
                 the state is never carried by colour alone (D-14). */
              <SystemStatusBanner
                tone="warning"
                title="Sample data — this is a local preview, not your account."
              />
            ) : null}
            {!isOnline ? <OfflineBanner /> : null}
          </div>
        ) : null}

        {/* Page Content */}
        {/* px-safe-x / pt-safe-top carry the notch and landscape-corner insets;
            the raw px-* / pt-* values they replace are the same numbers with no
            inset applied, so desktop rendering is unchanged. */}
        <main
          id="main-content"
          role="main"
          /* href="#main-content" moves sequential focus onto a container only
             when it is focusable; without tabindex=-1 Safari leaves focus
             where the link was, splitting focus and navigation. */
          tabIndex={-1}
          className={`mx-auto w-full app-canvas px-safe-x pt-safe-top ${
            showFocusChip ? 'pb-safe-content-with-chip' : 'pb-safe-content'
          } focus:outline-none`}
        >
          {children}
        </main>
      </div>

      {/* §P11.1 FocusTimer "mini chip" — the mount point P16:602 names. Absent
          when idle or finished, and absent on /focus itself: the full timer is
          on screen there, so a second readout of the same round would be the
          duplicate the spec forbids, and its only action (open the full timer)
          would be a no-op. With the bottom dock gone, the chip floats just
          above the bottom edge (plus safe-area inset). */}
      {showFocusChip ? (
        <div
          className="pointer-events-none fixed inset-x-3 z-30 flex justify-center lg:hidden"
          /* 1rem above the bottom edge plus the same safe-area inset the
             dock used to add — the chip is the only floating chrome now. */
          style={{
            bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <Link
            href="/focus"
            onClick={() => soundFX.playClick()}
            data-testid="focus-mini-chip"
            /* Chrome, so glass is in scope here (§5 Liquid Glass Restraint is
               "never BODY content"; this rides with the tab bar). Labelled, not
               aria-hidden: the link needs an accessible name, and the ticking
               digits are hidden from the tree below so the name cannot churn
               every second. No live region is declared — §P11.1 "announces …
               on request only (never every second)". */
            aria-label={`Focus round ${focusChip.round?.status === 'paused' ? 'paused' : 'running'}${
              focusChip.taskTitle ? ` on ${focusChip.taskTitle}` : ''
            }. Open the focus timer.`}
            className="pointer-events-auto flex min-h-11 w-fit max-w-full items-center gap-2 rounded-full glass-chrome px-3 py-1.5 shadow-2xl motion-safe:transition-colors [@media(hover:hover)]:hover:bg-card"
          >
            {/* Icon + label + colour together: §6.3 "never colour alone". The
                whole visual is aria-hidden because the name is on the link. */}
            <span aria-hidden="true" className="flex shrink-0 items-center gap-2">
              {focusChip.round?.status === 'paused' ? (
                <Pause size={14} className="text-muted-foreground" />
              ) : (
                <Focus size={14} className="text-primary-text" />
              )}
              <span className="font-mono text-footnote font-semibold tabular-nums text-foreground">
                {formatTimer(focusChip.elapsedSeconds)}
              </span>
            </span>
            {/* Truncating, not wrapping: the chip is a fixed-height pill, and a
                second line would change its height every time the round started.
                `min-w-0` is load-bearing — a flex item defaults to
                `min-width: auto`, which refuses to shrink and so defeats
                `truncate` entirely. */}
            <span
              aria-hidden="true"
              className="min-w-0 truncate text-caption font-medium text-muted-foreground"
            >
              {focusChip.taskTitle ?? 'Focus round'}
            </span>
          </Link>
        </div>
      ) : null}

      {/* Mobile Navigation Drawer — premium left drawer with grouped nav,
          glass surface, and compact quick-settings toolbar. Focus trap,
          Escape, backdrop dismiss, and focus restoration are handled by
          the useEffect above (mobileDrawerOpen dependency). */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden animate-enter"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div
            id="mobile-drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="flex h-full w-[82%] max-w-xs flex-col border-r border-border-control bg-card/95 backdrop-blur-2xl shadow-2xl animate-slide-in-left"
            /* The notch (top) AND the home indicator (bottom) both cut into the
               drawer's usable height. `calc(1rem + env(...))` ensures proper
               clearance above the home indicator. */
            style={{
              paddingTop: 'env(safe-area-inset-top, 0px)',
              paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header: Brand & Close */}
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <Link
                href="/dashboard"
                onClick={() => {
                  soundFX.playClick();
                  setMobileDrawerOpen(false);
                }}
                data-testid="link-drawer-brand"
                className="flex items-center gap-2.5 transition-transform active:scale-[0.98]"
              >
                <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary text-primary-foreground font-black shadow-sm">
                  <span className="font-mono text-caption font-black">C</span>
                </span>
                <span className="text-callout font-bold tracking-tight text-foreground">
                  cadence
                </span>
              </Link>
              <button
                type="button"
                data-testid="button-close-drawer"
                onClick={() => setMobileDrawerOpen(false)}
                className="grid size-8 place-items-center rounded-lg border border-border-control/40 bg-card/[0.04] text-muted-foreground transition-colors hover:text-foreground hover:bg-card/[0.08] active:scale-95 tap-target-expand"
                aria-label="Close menu"
              >
                <X size={15} />
              </button>
            </div>

            {/* Quick Capture Button (Refined Primary CTA) */}
            <div className="px-3 pb-3">
              <button
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setMobileDrawerOpen(false);
                  setCaptureOpen(true);
                }}
                data-testid="button-drawer-capture"
                className="group relative flex min-h-11 w-full items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-callout font-semibold text-primary-text shadow-sm transition-all duration-base hover:bg-primary/15 active:scale-[0.98]"
              >
                <span className="flex items-center gap-2.5">
                  <span className="grid size-6 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                    <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  <span className="text-foreground tracking-tight">New task</span>
                </span>
                <kbd className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-caption text-primary-text/80">
                  N
                </kbd>
              </button>
            </div>

            {/* Grouped Navigation */}
            <nav
              className="flex-1 overflow-y-auto px-3 py-2 space-y-4"
              aria-label="Mobile navigation"
            >
              {/* Workspace Group */}
              <div className="space-y-0.5">
                <p className="mb-1.5 px-2.5 font-mono text-caption uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                  Workspace
                </p>
                {primaryNavItems.map(({ href, label, icon: Icon, accent, badge }) => {
                  const active = location === href || location.startsWith(`${href}/`);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        soundFX.playClick();
                        setMobileDrawerOpen(false);
                      }}
                      data-testid={`link-drawer-${label.toLowerCase()}`}
                      className={`group relative flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-footnote font-medium transition-colors ${
                        active
                          ? 'bg-card/[0.08] text-foreground font-semibold'
                          : 'text-muted-foreground hover:bg-card/[0.04] hover:text-foreground'
                      }`}
                    >
                      {active && (
                        <span className="absolute left-1 h-3.5 w-1 rounded-full bg-primary" />
                      )}
                      <Icon
                        size={16}
                        strokeWidth={active ? 2.2 : 1.7}
                        style={{ color: !active && accent ? accent : undefined }}
                        className={active ? 'text-primary-text' : 'text-muted-foreground group-hover:text-foreground'}
                      />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {badge && (
                        <span
                          className="ml-auto rounded px-1.5 py-0.5 font-mono text-caption font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: accent ? 'hsl(var(--ai-fill) / 0.16)' : 'hsl(var(--foreground) / 0.08)',
                            color: accent || 'inherit',
                          }}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Organize Group */}
              <div className="space-y-0.5">
                <p className="mb-1.5 px-2.5 font-mono text-caption uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                  Organize
                </p>
                {secondaryNavItems
                  .filter((item) => item.href !== '/settings' && item.href !== '/profile')
                  .map(({ href, label, icon: Icon, accent, badge }) => {
                    const active = location === href || location.startsWith(`${href}/`);
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                          soundFX.playClick();
                          setMobileDrawerOpen(false);
                        }}
                        data-testid={`link-drawer-${label.toLowerCase()}`}
                        className={`group relative flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-footnote font-medium transition-colors ${
                          active
                            ? 'bg-card/[0.08] text-foreground font-semibold'
                            : 'text-muted-foreground hover:bg-card/[0.04] hover:text-foreground'
                        }`}
                      >
                        {active && (
                          <span className="absolute left-1 h-3.5 w-1 rounded-full bg-primary" />
                        )}
                        <Icon
                          size={16}
                          strokeWidth={active ? 2.2 : 1.7}
                          style={{ color: !active && accent ? accent : undefined }}
                          className={active ? 'text-primary-text' : 'text-muted-foreground group-hover:text-foreground'}
                        />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {badge && (
                          <span
                            className="ml-auto rounded px-1.5 py-0.5 font-mono text-caption font-bold uppercase tracking-wider"
                            style={{
                              backgroundColor: accent ? 'hsl(var(--ai-fill) / 0.16)' : 'hsl(var(--foreground) / 0.08)',
                              color: accent || 'inherit',
                            }}
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
              </div>

              {/* Account & Preferences Group */}
              <div className="space-y-0.5">
                <p className="mb-1.5 px-2.5 font-mono text-caption uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                  Account
                </p>
                {secondaryNavItems
                  .filter((item) => item.href === '/settings' || item.href === '/profile')
                  .map(({ href, label, icon: Icon, accent, badge }) => {
                    const active = location === href || location.startsWith(`${href}/`);
                    const testId = href === '/profile' ? 'button-profile-drawer' : `link-drawer-${label.toLowerCase()}`;
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                          soundFX.playClick();
                          setMobileDrawerOpen(false);
                        }}
                        data-testid={testId}
                        className={`group relative flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-footnote font-medium transition-colors ${
                          active
                            ? 'bg-card/[0.08] text-foreground font-semibold'
                            : 'text-muted-foreground hover:bg-card/[0.04] hover:text-foreground'
                        }`}
                      >
                        {active && (
                          <span className="absolute left-1 h-3.5 w-1 rounded-full bg-primary" />
                        )}
                        <Icon
                          size={16}
                          strokeWidth={active ? 2.2 : 1.7}
                          style={{ color: !active && accent ? accent : undefined }}
                          className={active ? 'text-primary-text' : 'text-muted-foreground group-hover:text-foreground'}
                        />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {badge && (
                          <span
                            className="ml-auto rounded px-1.5 py-0.5 font-mono text-caption font-bold uppercase tracking-wider"
                            style={{
                              backgroundColor: accent ? 'hsl(var(--ai-fill) / 0.16)' : 'hsl(var(--foreground) / 0.08)',
                              color: accent || 'inherit',
                            }}
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
              </div>
            </nav>

            {/* Quick settings toolbar: compact horizontal action strip */}
            <div
              className="border-t border-border-control bg-card/60 px-3 py-2.5 backdrop-blur-md"
              role="group"
              aria-label="Quick settings"
            >
              <div className="flex items-center justify-between gap-1.5">
                {/* Sound Toggle */}
                <button
                  type="button"
                  onClick={toggleSound}
                  data-testid="button-sound-toggle-drawer"
                  className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-control bg-card/[0.04] text-footnote transition-colors hover:bg-card/[0.08] active:scale-95 ${
                    soundEnabled ? 'text-status-success-text' : 'text-muted-foreground'
                  }`}
                  aria-label={soundEnabled ? 'Mute audio' : 'Unmute audio'}
                  title={soundEnabled ? 'Acoustic cues: Active' : 'Acoustic cues: Muted'}
                >
                  {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  <span className="font-mono text-caption font-medium uppercase">{soundEnabled ? 'Audio' : 'Mute'}</span>
                </button>

                {/* Theme Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    toggleTheme();
                  }}
                  data-testid="button-theme-toggle-drawer"
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-control bg-card/[0.04] text-footnote text-muted-foreground transition-colors hover:bg-card/[0.08] hover:text-foreground active:scale-95"
                  aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'}
                  title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                  <span className="text-caption font-medium">{theme === 'dark' ? 'Light' : 'Dark'}</span>
                </button>

                {/* Command Palette Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setMobileDrawerOpen(false);
                    setCmdOpen(true);
                  }}
                  data-testid="button-palette-drawer"
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-control bg-card/[0.04] text-footnote text-muted-foreground transition-colors hover:bg-card/[0.08] hover:text-foreground active:scale-95"
                  aria-label="Command palette"
                  title="Search (Ctrl+K)"
                >
                  <Command size={15} />
                  <span className="text-caption font-medium">Search</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette Modal */}
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onSelectNewTask={() => setCaptureOpen(true)}
        onNavigate={(path) => setLocation(path)}
        onSelectTask={(task) => setLocation(task.status === 'inbox' ? '/inbox' : '/today')}
        onToggleSidebar={toggleSidebar}
      />

      {/* First-Run Enterprise Onboarding Tour */}
      <Suspense fallback={null}>
        <FirstRunTourModal />
      </Suspense>

      {/* Quick Capture — P11.1: reachable in ONE TAP from every screen, keyboard
          opens immediately, never loses typed text. The sheet carries the parse
          chips that prevent committing a misparse (P3 error prevention), so this
          replaces the full TaskEditor as the global capture affordance.
          TaskEditor remains reachable from Today/Inbox for editing an existing task. */}
      {/* Fallback is null: captureOpen is false on first paint, so this boundary
          is never visible unless the chunk is still in flight, and a sheet
          rendered without its contents would be a dead affordance rather than an
          honest empty state. */}
      <Suspense fallback={null}>
        <QuickCaptureSheet
          open={captureOpen}
          onOpenChange={setCaptureOpen}
          onSaved={() => setCaptureOpen(false)}
        />
      </Suspense>
    </div>
  );
}
