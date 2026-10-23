import { Link } from 'wouter';
import { CalendarDays, Play, Plus, Sparkles } from 'lucide-react';
import { dateLabel } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardHeader() {
  const currentHour = new Date().getHours();
  const greeting = getGreeting(currentHour);
  const formattedDate = dateLabel();

  const handleCaptureClick = () => {
    soundFX.playClick();
    // Dispatch keyboard event 'n' to trigger global QuickCaptureSheet
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
  };

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-border-control/60 pb-5 sm:pb-6">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="size-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
          <p className="font-mono text-caption uppercase tracking-[0.2em] text-primary-text font-bold">
            Command Deck · {formattedDate}
          </p>
        </div>
        <h1 className="text-title1 sm:text-display2 lg:text-display3 font-extrabold tracking-tight text-foreground">
          {greeting}.
        </h1>
        <p className="mt-1 text-footnote sm:text-callout text-muted-foreground">
          At-a-glance daily momentum, priority focus, and active horizon.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
        <Link
          href="/focus"
          onClick={() => soundFX.playClick()}
          data-testid="button-dashboard-focus"
          className="col-span-2 sm:col-span-1 inline-flex tap-target-h items-center justify-center gap-2 rounded-control bg-primary px-4 text-callout font-bold text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-98 order-1 sm:order-2"
        >
          <Play size={16} fill="currentColor" aria-hidden="true" />
          <span>Start Focus</span>
        </Link>

        <button
          type="button"
          onClick={handleCaptureClick}
          data-testid="button-dashboard-capture"
          className="inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-card px-3 sm:px-4 text-callout font-bold text-foreground transition-colors hover:bg-muted active:scale-98 order-2 sm:order-1"
        >
          <Plus size={16} className="text-primary-text" aria-hidden="true" />
          <span>Capture</span>
          <kbd className="hidden sm:inline-block ml-1 rounded border border-border-control px-1.5 py-0.5 font-mono text-caption text-muted-foreground">
            N
          </kbd>
        </button>

        <Link
          href="/today"
          onClick={() => soundFX.playClick()}
          data-testid="button-dashboard-today"
          className="inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-card px-3 sm:px-4 text-callout font-bold text-foreground transition-colors hover:bg-muted active:scale-98 order-3 sm:order-3"
        >
          <CalendarDays size={16} className="text-muted-foreground" aria-hidden="true" />
          <span>Today</span>
        </Link>
      </div>
    </header>
  );
}
