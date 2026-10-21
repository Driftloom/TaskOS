import { Link } from 'wouter';
import { AlertTriangle, ArrowRight, CalendarDays, Clock, Lock, RotateCcw } from 'lucide-react';
import type { TimeBlock } from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';

interface ScheduleSnapshotCardProps {
  blocks: TimeBlock[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

function formatBlockTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return iso;
  }
}

export function ScheduleSnapshotCard({
  blocks,
  isLoading,
  isError = false,
  onRetry,
}: ScheduleSnapshotCardProps) {
  const sortedBlocks = [...blocks].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const count = sortedBlocks.length;
  const previewBlocks = sortedBlocks.slice(0, 3);
  const unknown = isLoading || isError;

  return (
    <section
      aria-labelledby="schedule-snapshot-heading"
      data-testid="card-dashboard-schedule"
      className="flex flex-col justify-between rounded-2xl border border-border-control bg-card p-5 shadow-lg"
    >
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border-control/40">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-control bg-primary/15 text-primary-text">
              <CalendarDays size={15} aria-hidden="true" />
            </span>
            <h2
              id="schedule-snapshot-heading"
              className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-bold"
            >
              Time Blocks
            </h2>
          </div>

          <span className="font-mono text-caption text-muted-foreground">
            {unknown ? '— blocks' : `${count} ${count === 1 ? 'block' : 'blocks'}`}
          </span>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
              <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
            </div>
          ) : isError ? (
            // A failed blocks query is "we don't know", not "nothing is
            // scheduled". Rendering the empty state here would state a fact
            // about the user's day that nothing actually answered.
            <div className="py-5 text-center" data-testid="dashboard-schedule-error">
              <AlertTriangle size={22} className="mx-auto mb-2 text-status-warning-text" aria-hidden="true" />
              <p className="text-callout font-semibold text-foreground">Schedule couldn't load</p>
              <p className="mt-1 text-caption text-muted-foreground">
                We don't know what is scheduled yet. Check your connection and try again.
              </p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    onRetry();
                  }}
                  className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground hover:bg-muted active:scale-98"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Retry
                </button>
              ) : null}
            </div>
          ) : count === 0 ? (
            <div className="py-6 text-center">
              <Clock size={24} className="mx-auto text-muted-foreground mb-2" aria-hidden="true" />
              {/* Absence of data, not a verdict on the day: "Open Schedule"
                  claimed the day was clear, which an empty query cannot
                  prove. */}
              <p className="text-callout font-semibold text-foreground">
                No time blocks scheduled for today.
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                Your calendar has no focus blocks for today.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {previewBlocks.map((block) => (
                <li
                  key={block.id}
                  className="flex items-center justify-between rounded-lg border border-border-control/40 bg-muted/30 p-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-callout text-foreground truncate">
                      {block.taskTitle || 'Focus block'}
                    </span>
                  </div>

                  <span className="font-mono text-caption text-muted-foreground shrink-0 ml-2">
                    {formatBlockTime(block.startAt)}–{formatBlockTime(block.endAt)}
                  </span>
                </li>
              ))}
              {count > 3 && (
                <li className="text-center font-mono text-caption text-muted-foreground pt-1">
                  +{count - 3} more on calendar
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border-control/40">
        <Link
          href="/calendar"
          onClick={() => soundFX.playClick()}
          data-testid="link-dashboard-calendar"
          className="inline-flex w-full tap-target-h items-center justify-between rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground transition-colors hover:bg-muted active:scale-98"
        >
          <span>Open Full Calendar</span>
          <ArrowRight size={14} className="text-muted-foreground" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
