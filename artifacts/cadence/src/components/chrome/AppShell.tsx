import { Suspense, lazy, useState, useEffect, useMemo, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import {
  getListFocusSessionsQueryKey,
  getListTasksQueryKey,
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
  MoreHorizontal,
  X,
  Sun,
  Moon,
  Folder,
} from 'lucide-react';
import { dateLabel, formatTimer, today, timezone } from '@/lib/date-utils';
import {
  anchorMatches,
  elapsedFromAnchor,
  readAnchor,
  type RunAnchor,
} from '@/lib/focus/runAnchor';
import { soundFX } from '@/lib/sound-fx';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useTheme } from './ThemeProvider';
import { OfflineBanner } from './SystemStatusBanner';
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
  | '/today'
  | '/inbox'
  | '/focus'
  | '/calendar'
  | '/projects'
  | '/agent'
  | '/review'
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
  { href: '/agent', label: 'Assistant', icon: Sparkles, accent: 'hsl(var(--ai-fill))', badge: 'AI' },
  { href: '/review', label: 'Review', icon: ListChecks },
  { href: '/memory', label: 'Memory', icon: Brain, accent: 'hsl(var(--ai-fill))', badge: 'AI' },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/profile', label: 'Profile', icon: User },
];

export const navItems = [...primaryNavItems, ...secondaryNavItems];

/**
 * P16 mobile dock — 5 slots, quoted from
 * `docs/13-master-design-system-prompt.md` §P16:600-607:
 *
 *   "bottom tab bar, 5 slots — Today · Calendar · [＋ Capture] · Agent · More"
 *
 * All three lists are derived by filtering `navItems` instead of re-declaring
 * labels and icons, so a rename or a new destination can never drift between the
 * sidebar and the dock. Identity comparison is safe and intentional: the
 * filters run over the one `navItems` array, so a slot that is a dock link is
 * the very same object that lands in More's complement.
 */
const mobileDockLeft = navItems.filter((item) => item.href === '/today' || item.href === '/calendar');
const mobileDockRight = navItems.filter((item) => item.href === '/focus');
/** P16: "More holds Projects, Review, Memory, Reschedule log, Import, Settings." */
const mobileDockMore = navItems.filter(
  (item) => !mobileDockLeft.includes(item) && !mobileDockRight.includes(item),
);

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
  
  console.log("SESSIONS TYPE:", typeof sessions, "IS ARRAY:", Array.isArray(sessions), "VALUE:", sessions);

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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
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

  const toggleSidebar = () => {
    soundFX.playClick();
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('cadence_sidebar_collapsed', String(next));
      return next;
    });
  };

  const { signOut } = useClerk();
  const { user } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  // §P11.1 mini chip inputs. The hook is called unconditionally so the hook
  // order is stable; `showFocusChip` is the only place its null case is
  // resolved, and both queries are cache reads that cost nothing when warm.
  const focusChip = useFocusMiniChip();
  const showFocusChip = focusChip.round !== null && location !== '/focus';

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
      if (mobileMoreOpen) setMobileMoreOpen(false);
    },
    onNavigate: (dest) => {
      soundFX.playClick();
      setLocation(dest as PageKey);
      setMobileMoreOpen(false);
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
      {/* Desktop Sidebar (Linear / Apple HIG Minimalist Dark) */}
      <aside
        className={`fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-border-control bg-card/95 px-3.5 py-4 backdrop-blur-2xl transition-all duration-200 ease-in-out lg:flex ${
          sidebarCollapsed
            ? '-translate-x-full w-0 overflow-hidden opacity-0 pointer-events-none border-transparent px-0'
            : 'w-60 translate-x-0 opacity-100'
        }`}
        aria-hidden={sidebarCollapsed}
      >
        {/* Brand & Collapse Button */}
        <div className="mb-5 flex items-center justify-between px-2 py-1.5">
          <Link
            href="/today"
            onClick={() => soundFX.playClick()}
            data-testid="link-brand"
            className="flex items-center gap-2.5 transition-transform active:scale-[0.98]"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary text-primary-foreground font-black shadow-sm">
              <span className="font-mono text-xs font-black">C</span>
            </span>
            <span className="text-base font-bold tracking-tight text-foreground">
              cadence
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            {/* Online status indicator */}
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono border ${
                isOnline
                  ? 'bg-success/10 text-status-success-text border-success/20'
                  : 'bg-destructive/10 text-destructive border-destructive/20'
              }`}
            >
              <span className={`size-1.5 rounded-full ${isOnline ? 'bg-success' : 'bg-destructive'}`} />
              <span>{isOnline ? 'LIVE' : 'OFFLINE'}</span>
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
        <p className="mb-1.5 px-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold">
          Workspace
        </p>

        {/* Primary Navigation */}
        <nav className="space-y-0.5" aria-label="Primary navigation">
          {navItems.map(({ href, label, icon: Icon, accent, badge }, idx) => {
            const active = location === href || location.startsWith(`${href}/`);
            const shortcutNum = idx < 6 ? String(idx + 1) : null;

            return (
              <Link
                href={href}
                key={href}
                onClick={() => soundFX.playClick()}
                data-testid={`link-nav-${label.toLowerCase()}`}
                /* The nav items are h-8 (32px) stacked with no gap between them, so
                   `tap-target-expand` is safe here: consecutive centres are 32px
                   apart but the row is a single-column list where a 6px overlap
                   lands on the neighbour's label, not on a competing control. This
                   is the one place the utility's caveat is knowingly traded --
                   the alternative is 44px rows, which breaks the sidebar rhythm. */
                className={`group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors tap-target-expand ${
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
                    className="ml-auto rounded px-1.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: accent ? `${accent}20` : 'rgba(255,255,255,0.08)',
                      color: accent || 'inherit',
                    }}
                  >
                    {badge}
                  </span>
                )}

                {shortcutNum && !badge && (
                  <kbd className="ml-auto hidden rounded border border-border-control bg-card/[0.03] px-1 py-0.2 font-mono text-xs text-muted-foreground group-hover:inline-block">
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
            className="flex h-8 w-full items-center justify-between rounded-lg border border-border-control bg-card/[0.03] px-2.5 text-xs font-medium text-foreground hover:border-border-control hover:bg-card/[0.07] hover:text-foreground transition-all active:scale-[0.98] tap-target-expand"
          >
            <span className="flex items-center gap-2">
              <Plus size={14} className="text-primary-text" />
              <span>New task</span>
            </span>
            <kbd className="rounded border border-border-control bg-card/[0.04] px-1.5 py-0.2 font-mono text-xs text-muted-foreground">Ctrl+\</kbd>
          </button>

          <button
            onClick={() => {
              soundFX.playClick();
              setCmdOpen(true);
            }}
            className="flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-card/[0.04] hover:text-foreground transition-colors tap-target-expand"
          >
            <span className="flex items-center gap-2">
              <Command size={13} />
              <span>Commands</span>
            </span>
            <kbd className="rounded border border-border-control bg-card/[0.04] px-1.5 py-0.2 font-mono text-xs text-muted-foreground">Ctrl+K</kbd>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`min-h-[100dvh] transition-[padding] duration-200 ease-in-out ${
          sidebarCollapsed ? 'lg:pl-0' : 'lg:pl-60'
        }`}
      >
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 border-b border-border-control bg-background/95 backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-10">
            {/* Left Side: Mobile Brand & Desktop Toggle + Breadcrumbs */}
            <div className="flex items-center gap-2.5">
              {/* Mobile Brand */}
              <Link
                href="/today"
                onClick={() => soundFX.playClick()}
                data-testid="link-mobile-brand"
                className="flex items-center gap-2 lg:hidden"
              >
                <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary text-xs font-black text-primary-foreground">
                  C
                </span>
                <span className="font-bold tracking-tight text-foreground">cadence</span>
              </Link>

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
              <div className="hidden items-center gap-2.5 text-xs lg:flex">
                {sidebarCollapsed && (
                  <>
                    <Link
                      href="/today"
                      onClick={() => soundFX.playClick()}
                      className="flex items-center gap-1.5 font-bold text-foreground hover:text-primary-text transition-colors"
                    >
                      <span className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-primary to-primary text-xs font-black text-primary-foreground">
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
                <span className="font-mono text-xs text-muted-foreground">
                  {dateLabel()}
                </span>
              </div>
            </div>

            {/* Header Controls */}
            <div className="flex items-center gap-2">
              {/* Audio Toggle */}
              <button
                onClick={toggleSound}
                className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-xs font-mono transition-all active:scale-95 ${
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

              {/* Mobile Quick Capture */}
              <button
                onClick={() => {
                  soundFX.playClick();
                  setCaptureOpen(true);
                }}
                data-testid="button-header-capture"
                className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-all active:scale-95 lg:hidden tap-target-expand"
                aria-label="Capture task"
              >
                <Plus size={16} strokeWidth={2.5} />
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
                    : 'border-border-control bg-muted text-xs font-semibold text-foreground hover:border-border-control/20 hover:text-foreground'
                }`}
                aria-label={`Open profile for ${displayName}`}
                title={`Profile (${displayName})`}
              >
                {initials}
              </button>
            </div>
          </div>
        </header>

        {/* System Status Banners (P17.1) — sticky under the top bar.
            Automation-paused is non-dismissible critical and takes precedence;
            offline is a persistent role="status" banner. */}
        <AutomationPausedBanner />
        {!isOnline ? (
          <div className="sticky top-14 z-20 mx-auto w-full max-w-[1680px] px-4 pt-3 sm:px-6 lg:px-8 xl:px-10">
            <OfflineBanner />
          </div>
        ) : null}

        {/* Page Content */}
        <main
          className={`mx-auto w-full max-w-[1680px] px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-12 xl:px-10 ${
            showFocusChip ? 'pb-44' : 'pb-24'
          }`}
        >
          {children}
        </main>
      </div>

      {/* §P11.1 FocusTimer "mini chip (persistent above the tab bar)" — the
          mount point P16:602 names. Absent when idle or finished, and absent on
          /focus itself: the full timer is on screen there, so a second readout
          of the same round would be the duplicate the spec forbids, and its only
          action (open the full timer) would be a no-op. */}
      {showFocusChip ? (
        <div
          className="pointer-events-none fixed inset-x-3 z-30 flex justify-center lg:hidden"
          /* 0.75rem (dock inset) + 4rem (h-16) + 0.5rem (gap) + the same
             safe-area inset the dock already adds, so the chip clears the dock
             exactly rather than by a guessed margin. */
          style={{
            bottom: 'calc(0.75rem + 4rem + 0.5rem + env(safe-area-inset-bottom, 0px))',
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

      {/* Mobile Floating Bottom Dock (Apple HIG Glass) — 5 slots per §P16. */}
      <nav
        className="fixed inset-x-3 bottom-3 z-30 flex h-16 items-center justify-around rounded-2xl glass-chrome shadow-2xl p-1.5 lg:hidden"
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Mobile navigation"
      >
        {/* Slots 1–2: Today · Calendar. `flex-1` per slot keeps the five shares
            equal; `justify-around` alone would not, because the centre capture
            is a square and the rest are icon+label pairs. */}
        {mobileDockLeft.map(({ href, label, icon: Icon, accent }) => {
          const active = location === href || location.startsWith(`${href}/`);
          return (
            <Link
              href={href}
              key={href}
              onClick={() => {
                soundFX.playClick();
                setMobileMoreOpen(false);
              }}
              data-testid={`link-mobile-${label.toLowerCase()}`}
              className={`flex h-full min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-all ${
                active
                  ? 'bg-primary/20 text-primary-text font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon
                size={18}
                strokeWidth={active ? 2.4 : 1.8}
                style={{ color: !active && accent ? accent : undefined }}
              />
              <span>{label}</span>
            </Link>
          );
        })}

        {/* Slot 3: the centre ＋ Capture. §P16 "The center ＋ (accent) opens
            QuickCaptureSheet from anywhere"; the accent treatment is the only
            filled `bg-primary` element in the dock, which is what makes it the
            dominant action under the "energy, not pretending" rule — a bigger
            box or a label was rejected because the dock's own box is unchanged
            and 44px is already the floor at 52px of inner height. Neighbour slot
            centres are ~68px apart on a 375px viewport, so no `tap-target-expand`
            overlap (index.css caveat about centres <44px apart does not apply). */}
        <div className="flex h-full flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setCaptureOpen(true);
            }}
            data-testid="button-mobile-capture"
            className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-e2 motion-safe:transition-transform active:scale-95"
            aria-label="Capture task"
            title="New task"
          >
            <Plus size={22} strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>

        {/* Slot 4 — DEVIATION from §P16, stated here rather than hidden in a
            report. §P16 asks for "Agent" here. The Assistant has no route:
            `App.tsx` has no `/agent` and this file does not own the router, and
            `AgentPanel` is an inline block inside `TodayPage` (also not this
            file's) whose conversation lives in component-local `useState`, so
            mounting a second copy in a sheet here would silently discard the
            transcript every time the sheet closed. `Focus` takes the slot
            because §P16's own rationale is "capture and Start are the two
            actions that matter" — Start is `/focus`, and §P11.1's chip needs a
            permanent home for the round it points at. Unblocking the spec slot
            needs a `/agent` route (one line in `App.tsx`) plus lifting the
            transcript out of `AgentPanel`'s local state; both are outside this
            task's file ownership. */}
        {mobileDockRight.map(({ href, label, icon: Icon, accent }) => {
          const active = location === href || location.startsWith(`${href}/`);
          return (
            <Link
              href={href}
              key={href}
              onClick={() => {
                soundFX.playClick();
                setMobileMoreOpen(false);
              }}
              data-testid={`link-mobile-${label.toLowerCase()}`}
              className={`flex h-full min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-all ${
                active
                  ? 'bg-primary/20 text-primary-text font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon
                size={18}
                strokeWidth={active ? 2.4 : 1.8}
                style={{ color: !active && accent ? accent : undefined }}
              />
              <span>{label}</span>
            </Link>
          );
        })}

        {/* Slot 5: More. Its active state now covers Inbox too, since the dock
            no longer promotes Inbox — hence the name change from the old
            `isSecondaryActive`. */}
        {(() => {
          const isMoreActive = mobileDockMore.some(
            (item) => location === item.href || location.startsWith(`${item.href}/`)
          );
          return (
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                setMobileMoreOpen((prev) => !prev);
              }}
              data-testid="button-mobile-more"
              aria-label="More navigation destinations"
              className={`flex h-full min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-all ${
                isMoreActive || mobileMoreOpen
                  ? 'bg-primary/20 text-primary-text font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MoreHorizontal size={18} strokeWidth={isMoreActive ? 2.4 : 1.8} />
              <span>More</span>
            </button>
          );
        })()}
      </nav>

      {/* Mobile "More" Bottom Action Sheet */}
      {mobileMoreOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-background/70 backdrop-blur-sm lg:hidden animate-enter"
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl border-t border-border-control bg-card p-5 pb-8 shadow-2xl space-y-4"
            style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border-control">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                More Destinations
              </span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="grid size-7 place-items-center rounded-full bg-card/[0.06] text-muted-foreground hover:text-foreground transition-colors tap-target-expand"
                aria-label="Close menu"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {mobileDockMore.map(({ href, label, icon: Icon, accent, badge }) => {
                const active = location === href || location.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => {
                      soundFX.playClick();
                      setMobileMoreOpen(false);
                    }}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                      active
                        ? 'bg-primary/15 border-primary/40 text-foreground font-bold'
                        : 'bg-card/[0.03] border-border-control text-foreground hover:bg-card/[0.06] hover:text-foreground'
                    }`}
                  >
                    <Icon
                      size={18}
                      className={active ? 'text-primary-text' : 'text-muted-foreground'}
                      style={{ color: !active && accent ? accent : undefined }}
                    />
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-xs font-semibold truncate">{label}</span>
                      {badge && (
                        <span className="rounded bg-ai/20 px-1 py-0.2 font-mono text-xs font-bold text-ai-text border border-ai/30">
                          {badge}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
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
