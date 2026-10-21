import { useState } from 'react';
import { useLocation } from 'wouter';
import { AlertTriangle, CheckCircle2, Clock, Play, RotateCcw, Sparkles, Tag as TagIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListTasksQueryKey,
  getGetMomentumQueryKey,
  getGetTaskSummaryQueryKey,
  useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';

interface NextUpFocusHeroProps {
  task: Task | null;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function NextUpFocusHero({
  task,
  isLoading = false,
  isError = false,
  onRetry,
}: NextUpFocusHeroProps) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [completing, setCompleting] = useState(false);
  const updateTask = useUpdateTask();

  const handleStartFocus = () => {
    soundFX.playClick();
    setLocation('/focus');
  };

  const handleMarkComplete = () => {
    if (!task) return;
    setCompleting(true);
    soundFX.playCompletion();

    updateTask.mutate(
      {
        id: task.id,
        data: { status: 'completed' },
      },
      {
        onSettled: () => {
          setCompleting(false);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey() });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <section
        aria-labelledby="next-up-hero-heading"
        aria-busy="true"
        data-testid="card-dashboard-next-up"
        className="flex flex-col justify-between rounded-2xl border border-border-control bg-card p-6 shadow-xl"
      >
        <div>
          <div className="flex items-center gap-2 pb-4 border-b border-border-control/40">
            <span className="grid size-8 place-items-center rounded-control bg-primary/15 text-primary-text">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <div>
              <h2
                id="next-up-hero-heading"
                className="font-mono text-caption uppercase tracking-wider text-primary-text font-bold"
              >
                Next Up
              </h2>
              <p className="text-callout font-bold text-foreground">Loading today's queue…</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <div className="h-9 w-4/5 animate-pulse rounded-lg bg-muted/50" />
            <div className="h-6 w-2/5 animate-pulse rounded-lg bg-muted/40" />
          </div>
        </div>
        <div className="mt-6 h-11 animate-pulse rounded-control bg-muted/40" />
      </section>
    );
  }

  if (isError) {
    return (
      <section
        aria-labelledby="next-up-hero-heading"
        data-testid="card-dashboard-next-up"
        className="flex flex-col justify-between rounded-2xl border border-status-warning/40 bg-card p-6 shadow-xl"
      >
        <div>
          <div className="flex items-center gap-2 pb-4 border-b border-border-control/40">
            <span className="grid size-8 place-items-center rounded-control bg-status-warning/15 text-status-warning-text">
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <div>
              <h2
                id="next-up-hero-heading"
                className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-bold"
              >
                Next Up
              </h2>
              <p className="text-callout font-bold text-foreground">Queue unavailable</p>
            </div>
          </div>
          <p className="py-8 text-center text-callout text-muted-foreground">
            Today's tasks couldn't load, so there is nothing to report yet.
          </p>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onRetry();
            }}
            data-testid="button-next-up-retry"
            className="w-full inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-card text-callout font-bold text-foreground transition-colors hover:bg-muted active:scale-98"
          >
            <RotateCcw size={15} aria-hidden="true" />
            <span>Try again</span>
          </button>
        ) : null}
      </section>
    );
  }

  if (!task) {
    return (
      <section
        aria-labelledby="next-up-hero-heading"
        data-testid="card-dashboard-next-up"
        className="flex flex-col justify-between rounded-2xl border border-border-control bg-card p-6 shadow-xl"
      >
        <div>
          <div className="flex items-center gap-2 pb-4 border-b border-border-control/40">
            <span className="grid size-8 place-items-center rounded-control bg-status-success/15 text-status-success-text">
              <CheckCircle2 size={18} aria-hidden="true" />
            </span>
            <div>
              <h2
                id="next-up-hero-heading"
                className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-bold"
              >
                Next Up
              </h2>
              <p className="text-callout font-bold text-foreground">Nothing scheduled</p>
            </div>
          </div>

          <div className="py-8 text-center">
            <p className="text-headline font-semibold text-foreground">
              No tasks queued for today
            </p>
            <p className="mt-2 text-callout text-muted-foreground max-w-sm mx-auto">
              Capture one deliberate thing to give the day a clear focus target, or triage your inbox.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
          }}
          data-testid="button-next-up-capture"
          className="w-full inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-muted/60 text-callout font-bold text-foreground transition-colors hover:bg-muted active:scale-98"
        >
          <span>Capture new task</span>
          <kbd className="rounded border border-border-control px-1.5 py-0.5 font-mono text-caption text-muted-foreground">
            N
          </kbd>
        </button>
      </section>
    );
  }

  const isHighPriority = task.priority === 'high';

  return (
    <section
      aria-labelledby="next-up-hero-heading"
      data-testid="card-dashboard-next-up"
      className="flex flex-col justify-between rounded-2xl border border-primary/30 bg-card p-6 shadow-xl relative overflow-hidden"
    >
      <div className="pointer-events-none absolute -top-12 -right-12 size-36 rounded-full bg-primary/[0.08] blur-[60px]" aria-hidden="true" />

      <div>
        <div className="flex items-center justify-between pb-4 border-b border-border-control/40">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-control bg-primary/15 text-primary-text font-bold">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <div>
              <h2
                id="next-up-hero-heading"
                className="font-mono text-caption uppercase tracking-wider text-primary-text font-bold"
              >
                Next Up
              </h2>
              <p className="text-caption text-muted-foreground">Queued for single-task focus</p>
            </div>
          </div>

          {isHighPriority && (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 font-mono text-caption font-semibold uppercase tracking-wider text-destructive">
              <AlertTriangle size={12} aria-hidden="true" />
              <span>Priority 1</span>
            </span>
          )}
        </div>

        <div className="mt-5">
          <h3 className="text-display1 font-bold text-card-foreground line-clamp-2 leading-tight">
            {task.title}
          </h3>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {task.durationMin != null ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-control/60 bg-muted/40 px-2.5 py-1 font-mono text-caption text-muted-foreground">
                <Clock size={13} aria-hidden="true" />
                <span>{task.durationMin} min planned</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-control/60 bg-muted/40 px-2.5 py-1 font-mono text-caption text-muted-foreground">
                <Clock size={13} aria-hidden="true" />
                <span>Duration not set</span>
              </span>
            )}

            {task.tags && task.tags.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-control/60 bg-muted/40 px-2.5 py-1 font-mono text-caption text-muted-foreground">
                <TagIcon size={13} aria-hidden="true" />
                <span>#{task.tags[0].name}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 border-t border-border-control/40 pt-4">
        <button
          type="button"
          onClick={handleStartFocus}
          data-testid="button-next-up-launch-focus"
          className="w-full sm:flex-1 inline-flex tap-target-h items-center justify-center gap-2 rounded-control bg-primary px-4 text-callout font-bold text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-98"
        >
          <Play size={16} fill="currentColor" aria-hidden="true" />
          <span>Launch Focus Round</span>
        </button>

        <button
          type="button"
          onClick={handleMarkComplete}
          disabled={completing}
          data-testid="button-next-up-mark-done"
          className="w-full sm:w-auto inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-card px-4 text-callout font-bold text-foreground transition-colors hover:bg-muted active:scale-98 disabled:opacity-50"
        >
          <CheckCircle2 size={16} className="text-status-success-text" aria-hidden="true" />
          <span>{completing ? 'Completing…' : 'Mark Done'}</span>
        </button>
      </div>
    </section>
  );
}
