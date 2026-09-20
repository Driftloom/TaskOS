import { useState, useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import {
  CalendarDays,
  Command,
  Focus,
  Inbox,
  ListChecks,
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
} from 'lucide-react';
import { dateLabel } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { CommandPalette } from './CommandPalette';
import { TaskEditor } from '@/components/task/TaskEditor';

export type PageKey =
  | '/today'
  | '/inbox'
  | '/focus'
  | '/calendar'
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
  { href: '/review', label: 'Review', icon: ListChecks },
  { href: '/memory', label: 'Memory', icon: Brain, accent: '#7A78FF', badge: 'AI' },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/profile', label: 'Profile', icon: User },
];

export const navItems = [...primaryNavItems, ...secondaryNavItems];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => soundFX.isEnabled());
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
        className={`fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-white/[0.08] bg-[#0E0E10]/95 px-3.5 py-4 backdrop-blur-2xl transition-all duration-200 ease-in-out lg:flex ${
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
            <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-[#FF9F0A] to-[#FF8500] text-black font-black shadow-sm">
              <span className="font-mono text-xs font-black">C</span>
            </span>
            <span className="text-base font-bold tracking-tight text-white">
              cadence
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            {/* Online status indicator */}
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                isOnline
                  ? 'bg-[#30D158]/10 text-[#30D158] border-[#30D158]/20'
                  : 'bg-[#FF453A]/10 text-[#FF453A] border-[#FF453A]/20'
              }`}
            >
              <span className={`size-1.5 rounded-full ${isOnline ? 'bg-[#30D158]' : 'bg-[#FF453A]'}`} />
              <span>{isOnline ? 'LIVE' : 'OFFLINE'}</span>
            </div>

            {/* Collapse Sidebar Button */}
            <button
              onClick={toggleSidebar}
              data-testid="button-collapse-sidebar"
              className="grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors"
              title="Close sidebar (⌘\)"
              aria-label="Close sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          </div>
        </div>

        {/* Workspace Section Header */}
        <p className="mb-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">
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
                className={`group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-white/[0.08] text-white font-semibold'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
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
                  className={active ? 'text-primary' : 'text-zinc-400 group-hover:text-zinc-200'}
                />
                <span>{label}</span>

                {badge && (
                  <span
                    className="ml-auto rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: accent ? `${accent}20` : 'rgba(255,255,255,0.08)',
                      color: accent || 'inherit',
                    }}
                  >
                    {badge}
                  </span>
                )}

                {shortcutNum && !badge && (
                  <kbd className="ml-auto hidden rounded border border-white/[0.06] bg-white/[0.03] px-1 py-0.2 font-mono text-[9px] text-zinc-500 group-hover:inline-block">
                    {shortcutNum}
                  </kbd>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Quick Capture & Command Palette */}
        <div className="mt-auto space-y-1.5 pt-3 border-t border-white/[0.08]">
          <button
            onClick={() => {
              soundFX.playClick();
              setCaptureOpen(true);
            }}
            data-testid="button-sidebar-capture"
            className="flex h-8 w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs font-medium text-zinc-300 hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white transition-all active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <Plus size={14} className="text-primary" />
              <span>New task</span>
            </span>
            <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.2 font-mono text-[9px] text-zinc-400">
              N
            </kbd>
          </button>

          <button
            onClick={() => {
              soundFX.playClick();
              setCmdOpen(true);
            }}
            className="flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-xs text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Command size={13} />
              <span>Commands</span>
            </span>
            <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.2 font-mono text-[9px] text-zinc-400">⌘K</kbd>
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
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.08] bg-[#000000]/95 px-4 backdrop-blur-xl sm:px-8 lg:px-10">
          {/* Left Side: Mobile Brand & Desktop Toggle + Breadcrumbs */}
          <div className="flex items-center gap-2.5">
            {/* Mobile Brand */}
            <Link
              href="/today"
              onClick={() => soundFX.playClick()}
              data-testid="link-mobile-brand"
              className="flex items-center gap-2 lg:hidden"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-[#FF9F0A] to-[#FF8500] text-xs font-black text-black">
                C
              </span>
              <span className="font-bold tracking-tight text-white">cadence</span>
            </Link>

            {/* Desktop Sidebar Toggle Button (when sidebar is collapsed) */}
            {sidebarCollapsed && (
              <button
                onClick={toggleSidebar}
                data-testid="button-open-sidebar"
                className="hidden lg:grid size-8 place-items-center rounded-lg border border-white/[0.08] bg-[#141416] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors mr-1"
                title="Open sidebar (⌘\)"
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
                    className="flex items-center gap-1.5 font-bold text-white hover:text-primary transition-colors"
                  >
                    <span className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-[#FF9F0A] to-[#FF8500] text-[10px] font-black text-black">
                      C
                    </span>
                    <span>cadence</span>
                  </Link>
                  <span className="text-zinc-600">/</span>
                </>
              )}
              <span className="font-semibold text-zinc-200">
                {navItems.find((item) => location === item.href || location.startsWith(`${item.href}/`))?.label ?? 'Today'}
              </span>
              <span className="text-zinc-600">/</span>
              <span className="font-mono text-[11px] text-zinc-400">
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
                  ? 'bg-[#141416] text-[#30D158] border-[#30D158]/30 hover:bg-white/[0.06]'
                  : 'bg-[#141416] border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
              aria-label={soundEnabled ? 'Mute audio' : 'Unmute audio'}
              title={soundEnabled ? 'Acoustic cues: Active' : 'Acoustic cues: Muted'}
            >
              {soundEnabled ? (
                <Volume2 size={14} className="text-[#30D158]" />
              ) : (
                <VolumeX size={14} className="text-zinc-400" />
              )}
              {soundEnabled && (
                <span className="size-1.5 rounded-full bg-[#30D158] animate-pulse" />
              )}
            </button>

            {/* Command Palette Trigger */}
            <button
              onClick={() => {
                soundFX.playClick();
                setCmdOpen(true);
              }}
              className="grid size-8 place-items-center rounded-lg border border-white/[0.08] bg-[#141416] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
              aria-label="Command palette"
              title="Command palette (⌘K)"
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
              className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-all active:scale-95 lg:hidden"
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
              className={`grid size-8 place-items-center rounded-full border transition-all ${
                location === '/profile'
                  ? 'border-primary ring-2 ring-primary/40 bg-primary/20 text-primary font-bold'
                  : 'border-white/[0.08] bg-[#141416] text-xs font-semibold text-zinc-300 hover:border-white/20 hover:text-white'
              }`}
              aria-label={`Open profile for ${displayName}`}
              title={`Profile (${displayName})`}
            >
              {initials}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-8 sm:pt-8 lg:px-10 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Mobile Floating Bottom Dock (Apple HIG Glass - 5 Tab Architecture) */}
      <nav
        className="fixed inset-x-3 bottom-3 z-30 flex h-16 items-center justify-around rounded-2xl glass-chrome shadow-2xl p-1.5 lg:hidden"
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Mobile navigation"
      >
        {primaryNavItems.map(({ href, label, icon: Icon, accent }) => {
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
              className={`flex h-full min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-all ${
                active
                  ? 'bg-primary/20 text-primary font-bold'
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

        {/* 5th Tab: More Button */}
        {(() => {
          const isSecondaryActive = secondaryNavItems.some(
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
              className={`flex h-full min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-all ${
                isSecondaryActive || mobileMoreOpen
                  ? 'bg-primary/20 text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MoreHorizontal size={18} strokeWidth={isSecondaryActive ? 2.4 : 1.8} />
              <span>More</span>
            </button>
          );
        })()}
      </nav>

      {/* Mobile "More" Bottom Action Sheet */}
      {mobileMoreOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/70 backdrop-blur-sm lg:hidden animate-enter"
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl border-t border-white/[0.12] bg-[#1C1C1E] p-5 pb-8 shadow-2xl space-y-4"
            style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                More Destinations
              </span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="grid size-7 place-items-center rounded-full bg-white/[0.06] text-zinc-400 hover:text-white transition-colors"
                aria-label="Close menu"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {secondaryNavItems.map(({ href, label, icon: Icon, accent, badge }) => {
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
                        ? 'bg-primary/15 border-primary/40 text-white font-bold'
                        : 'bg-white/[0.03] border-white/[0.06] text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <Icon
                      size={18}
                      className={active ? 'text-primary' : 'text-zinc-400'}
                      style={{ color: !active && accent ? accent : undefined }}
                    />
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-xs font-semibold truncate">{label}</span>
                      {badge && (
                        <span className="rounded bg-[#7A78FF]/20 px-1 py-0.2 font-mono text-[9px] font-bold text-[#7A78FF] border border-[#7A78FF]/30">
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

      {/* Quick Task Capture Modal */}
      {captureOpen && (
        <TaskEditor
          onClose={() => setCaptureOpen(false)}
          onSaved={() => setCaptureOpen(false)}
        />
      )}
    </div>
  );
}
