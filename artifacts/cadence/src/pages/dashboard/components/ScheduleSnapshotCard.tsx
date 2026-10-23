import { useMemo } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowRight, CalendarDays, Clock, RotateCcw } from 'lucide-react';
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
  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [blocks],
  );
  const count = sortedBlocks.length;
  const previewBlocks = sortedBlocks.slice(0, 3);
  const unknown = isLoading || isError;

  const now = new Date();

  return (
    <section
      aria-labelledby="schedule-snapshot-heading"
      data-testid="card-dashboard-schedule"
      className="flex flex-col justify-between rounded-2xl border border-border-control/70 bg-card p-4 sm:p-5 shadow-lg overflow-hidden"
    >
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border-control/40 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid size-7 place-items-center rounded-control bg-status-scheduled/15 text-status-scheduled-text shrink-0">
              <CalendarDays size={15} aria-hidden="true" />
            </span>
            <h2
              id="schedule-snapshot-heading"
              className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-bold truncate"
            >
              Time Blocks
            </h2>
          </div>

          <span className="font-mono tabular-nums text-caption text-muted-foreground shrink-0">
            {unknown ? '— blocks' : `${count} ${count === 1 ? 'block' : 'blocks'}`}
          </span>
        </div>

        <div className="mt-3.5 sm:mt-4">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-11 animate-pulse rounded-lg bg-muted/50" />
              <div className="h-11 animate-pulse rounded-lg bg-muted/50" />
            </div>
          ) : isError ? (
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
                  className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground hover:bg-muted active:scale-98 tap-target-expand"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Retry
                </button>
              ) : null}
            </div>
          ) : count === 0 ? (
            <div className="py-6 text-center">
              <Clock size={24} className="mx-auto text-muted-foreground mb-2 opacity-60" aria-hidden="true" />
              <p className="text-callout font-semibold text-foreground">
                No time blocks scheduled for today.
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                Your calendar has no focus blocks for today.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {previewBlocks.map((block) => {
                const s = new Date(block.startAt).getTime();
                const e = new Date(block.endAt).getTime();
                const t = now.getTime();
                const isCurrent = t >= s && t < e;
                const isPast = t >= e;

                return (
                  <li
                    key={block.id}
                    className={`flex items-center justify-between rounded-xl border p-2.5 min-w-0 gap-2 transition-all ${
                      isCurrent
                        ? 'border-primary/60 bg-primary/10 shadow-sm ring-1 ring-primary/30'
                        : isPast
                          ? 'border-border-control/30 bg-muted/20 opacity-60'
                          : 'border-border-control/50 bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isCurrent && (
                        <span className="size-1.5 rounded-full bg-primary animate-pulse shrink-0" aria-hidden="true" />
                      )}
                      <span className={`text-callout truncate min-w-0 ${isCurrent ? 'font-bold text-primary-text' : 'font-medium text-foreground'}`}>
                        {block.taskTitle || 'Focus block'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCurrent && (
                        <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-micro font-bold text-primary-text uppercase">
                          Now
                        </span>
                      )}
                      <span className="font-mono tabular-nums text-caption text-muted-foreground">
                        {formatBlockTime(block.startAt)}–{formatBlockTime(block.endAt)}
                      </span>
                    </div>
                  </li>
                );
              })}
              {count > 3 && (
                <li className="text-center font-mono tabular-nums text-caption text-muted-foreground pt-1">
                  +{count - 3} more on calendar
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-3.5 sm:mt-4 pt-3 border-t border-border-control/40">
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
