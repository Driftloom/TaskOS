import { useState, type ReactNode } from 'react';
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
} from 'lucide-react';
import { dateLabel } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { CommandPalette } from './CommandPalette';
import { TaskEditor } from '@/components/task/TaskEditor';

export type PageKey = '/today' | '/inbox' | '/focus' | '/calendar' | '/review' | '/settings';

export const navItems: { href: PageKey; label: string; icon: typeof CalendarDays }[] = [
  { href: '/today', label: 'Today', icon: Target },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/focus', label: 'Focus', icon: Focus },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/review', label: 'Review', icon: ListChecks },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { signOut } = useClerk();
  const { user } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  const displayName =
    user?.firstName ??
    user?.username ??
    user?.primaryEmailAddress?.emailAddress ??
    'You';
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      {/* Desktop Sidebar (Apple HIG Glass / Pure Dark) */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-white/[0.08] bg-[#121214]/80 px-4 py-6 backdrop-blur-2xl lg:flex">
        {/* Brand */}
        <Link
          href="/today"
          onClick={() => soundFX.playClick()}
          data-testid="link-brand"
          className="mb-8 flex items-center gap-3 px-3 py-1.5 transition-transform active:scale-98"
        >
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_4px_20px_rgba(255,159,10,0.35)]">
            <span className="font-mono text-sm font-bold">C</span>
          </span>
          <span className="text-lg font-extrabold tracking-tight text-foreground">
            cadence
          </span>
        </Link>

        {/* Workspace Section Header */}
        <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Workspace
        </p>

        {/* Primary Navigation */}
        <nav className="space-y-1" aria-label="Primary navigation">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href || location.startsWith(`${href}/`);
            return (
              <Link
                href={href}
                key={href}
                onClick={() => soundFX.playClick()}
                data-testid={`link-nav-${label.toLowerCase()}`}
                className={`group flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-all ${
                  active
                    ? 'bg-primary/15 text-primary shadow-[0_0_15px_rgba(255,159,10,0.12)]'
                    : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground'
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.3 : 1.8} />
                <span>{label}</span>
                {label === 'Inbox' && (
                  <span className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    ⌘
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Quick Capture Action Bottom Drawer */}
        <div className="mt-auto space-y-2 pt-4 border-t border-white/[0.08]">
          <button
            onClick={() => {
              soundFX.playClick();
              setCaptureOpen(true);
            }}
            data-testid="button-sidebar-capture"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_4px_20px_rgba(255,159,10,0.25)] transition-all hover:brightness-110 active:scale-98"
          >
            <Plus size={17} strokeWidth={2.5} />
            <span>Capture task</span>
          </button>

          <button
            onClick={() => {
              soundFX.playClick();
              setCmdOpen(true);
            }}
            className="flex min-h-[38px] w-full items-center justify-between rounded-xl px-3 text-xs text-muted-foreground hover:bg-white/[0.06] transition-colors"
          >
            <span className="flex items-center gap-2">
              <Command size={13} />
              <span>Command Bar</span>
            </span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="min-h-[100dvh] lg:pl-60">
        {/* Sticky Header */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/[0.08] bg-background/80 px-4 backdrop-blur-2xl sm:px-8 lg:px-12">
          {/* Mobile Brand */}
          <Link
            href="/today"
            onClick={() => soundFX.playClick()}
            data-testid="link-mobile-brand"
            className="flex items-center gap-2.5 lg:hidden"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              C
            </span>
            <span className="font-extrabold tracking-tight">cadence</span>
          </Link>

          {/* Desktop Tagline */}
          <div className="hidden items-center gap-2 text-muted-foreground lg:flex">
            <span className="size-1.5 rounded-full bg-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em]">
              Personal time OS
            </span>
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              {dateLabel()}
            </span>

            {/* Command Palette Trigger */}
            <button
              onClick={() => {
                soundFX.playClick();
                setCmdOpen(true);
              }}
              className="grid size-10 place-items-center rounded-xl border border-white/[0.08] bg-[#1C1C1E] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              aria-label="Command palette"
              title="Command palette (⌘K)"
            >
              <Command size={16} />
            </button>

            {/* Mobile Quick Capture */}
            <button
              onClick={() => {
                soundFX.playClick();
                setCaptureOpen(true);
              }}
              data-testid="button-header-capture"
              className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md transition-all active:scale-95 lg:hidden"
              aria-label="Capture task"
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>

            {/* User Profile & Sign Out */}
            <button
              onClick={() => {
                soundFX.playClick();
                signOut({ redirectUrl: basePath || '/' });
              }}
              data-testid="button-profile"
              className="grid size-10 place-items-center rounded-full border border-white/[0.08] bg-[#1C1C1E] text-xs font-bold text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              aria-label={`Sign out ${displayName}`}
              title={`Sign out ${displayName}`}
            >
              {initials}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-8 sm:px-8 sm:pt-10 lg:px-12 lg:pb-14">
          {children}
        </main>
      </div>

      {/* Mobile Floating Bottom Dock (Apple HIG Glass) */}
      <nav
        className="fixed inset-x-4 bottom-4 z-30 flex h-16 items-center justify-around rounded-2xl glass-chrome shadow-2xl p-1.5 lg:hidden"
        aria-label="Mobile navigation"
      >
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location === href || location.startsWith(`${href}/`);
          return (
            <Link
              href={href}
              key={href}
              onClick={() => soundFX.playClick()}
              data-testid={`link-mobile-${label.toLowerCase()}`}
              className={`flex h-full min-w-[48px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-all ${
                active
                  ? 'bg-primary/20 text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Command Palette Modal */}
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onSelectNewTask={() => setCaptureOpen(true)}
        onNavigate={(path) => setLocation(path)}
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
