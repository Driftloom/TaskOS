import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Moon,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Tag as TagIcon,
  Zap,
} from 'lucide-react';
import {
  getListTasksQueryKey,
  getGetMomentumQueryKey,
  getGetTaskSummaryQueryKey,
  useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';

interface CircadianRitualHeroProps {
  task: Task | null;
  tasksCompleted: number;
  tasksTotal: number;
  streakDays: number;
  focusMinutes: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onOpenRitual: (type: 'morning' | 'evening') => void;
}

export function CircadianRitualHero({
  task,
  tasksCompleted,
  tasksTotal,
  streakDays,
  focusMinutes: _focusMinutes,
  isLoading = false,
  isError = false,
  onRetry,
  onOpenRitual,
}: CircadianRitualHeroProps) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [completing, setCompleting] = useState(false);
  const updateTask = useUpdateTask();

  const currentHour = new Date().getHours();
  // Automatic mode based on hour:
  // Morning: 5:00 - 11:59
  // Flow: 12:00 - 17:59
  // Evening: 18:00 - 4:59
  const autoMode: 'morning' | 'flow' | 'evening' =
    currentHour >= 5 && currentHour < 12
      ? 'morning'
      : currentHour >= 12 && currentHour < 18
        ? 'flow'
        : 'evening';

  // Allow user to toggle view manually if desired
  const [manualMode, setManualMode] = useState<'morning' | 'flow' | 'evening' | null>(null);
  const activeMode = manualMode || autoMode;

  const handleStartFocus = () => {
    soundFX.playFocusStart();
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
        aria-labelledby="circadian-hero-heading"
        aria-busy="true"
        data-testid="card-dashboard-next-up"
        className="flex flex-col justify-between rounded-2xl border border-border-control bg-card p-4 sm:p-6 shadow-xl min-h-[260px]"
      >
        <div>
          <div className="flex items-center gap-2 pb-3 sm:pb-4 border-b border-border-control/40">
            <span className="grid size-8 place-items-center rounded-control bg-primary/15 text-primary-text">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <div className="h-3.5 w-24 animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-36 animate-pulse rounded bg-muted/40" />
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <div className="h-8 w-4/5 animate-pulse rounded-lg bg-muted/50" />
            <div className="h-5 w-2/5 animate-pulse rounded-lg bg-muted/40" />
          </div>
        </div>
        <div className="mt-6 h-11 animate-pulse rounded-control bg-muted/40" />
      </section>
    );
  }

  if (isError) {
    return (
      <section
        aria-labelledby="circadian-hero-heading"
        data-testid="card-dashboard-next-up"
        className="flex flex-col justify-between rounded-2xl border border-status-warning/40 bg-card p-4 sm:p-6 shadow-xl min-h-[260px]"
      >
        <div>
          <div className="flex items-center gap-2 pb-3 sm:pb-4 border-b border-border-control/40">
            <span className="grid size-8 place-items-center rounded-control bg-status-warning/15 text-status-warning-text">
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <div>
              <h2
                id="circadian-hero-heading"
                className="font-mono text-caption uppercase tracking-wider text-status-warning-text font-bold"
              >
                Queue Status
              </h2>
              <p className="text-callout font-bold text-foreground">Could not load today's priority task</p>
            </div>
          </div>
          <div className="py-6 text-center">
            <p className="text-caption text-muted-foreground">
              We couldn't reach the task queue. Nothing is guessed or hidden until the connection recovers.
            </p>
          </div>
        </div>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-card px-4 text-callout font-bold text-foreground transition-colors hover:bg-muted active:scale-98"
          >
            <RotateCcw size={15} aria-hidden="true" />
            <span>Try loading task again</span>
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="circadian-hero-heading"
      data-testid="card-dashboard-next-up"
      className="relative flex flex-col justify-between rounded-2xl border border-border-control/80 bg-card p-4 sm:p-6 shadow-xl overflow-hidden min-h-[280px]"
    >
      {/* Specular top rim highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
        aria-hidden="true"
      />

      {/* Hero Header with Circadian Mode Selector */}
      <div>
        <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-border-control/40 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`grid size-8 place-items-center rounded-control shrink-0 ${
                activeMode === 'morning'
                  ? 'bg-primary/20 text-primary-text'
                  : activeMode === 'evening'
                    ? 'bg-ai/20 text-ai-text'
                    : 'bg-accent/20 text-accent'
              }`}
            >
              {activeMode === 'morning' && <Sun size={18} aria-hidden="true" />}
              {activeMode === 'flow' && <Zap size={18} aria-hidden="true" />}
              {activeMode === 'evening' && <Moon size={18} aria-hidden="true" />}
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  id="circadian-hero-heading"
                  className={`font-mono text-caption uppercase tracking-wider font-bold truncate ${
                    activeMode === 'morning'
                      ? 'text-primary-text'
                      : activeMode === 'evening'
                        ? 'text-ai-text'
                        : 'text-accent'
                  }`}
                >
                  {activeMode === 'morning'
                    ? 'Morning Calibration'
                    : activeMode === 'evening'
                      ? 'Evening Shutdown'
                      : 'Next Up Priority'}
                </h2>
                <span className="hidden sm:inline-block text-border-control">•</span>
                <span className="hidden sm:inline-block text-caption font-mono text-muted-foreground">
                  {activeMode === 'morning' ? 'Plan Trajectory' : activeMode === 'evening' ? 'Lock Streak' : 'Flow Cockpit'}
                </span>
              </div>
              <p className="text-callout font-bold text-foreground truncate">
                {activeMode === 'morning'
                  ? 'Shape Today’s Trajectory'
                  : activeMode === 'evening'
                    ? `${streakDays > 0 ? `${streakDays}-Day Streak Active` : 'Day Shutdown'}`
                    : 'Queued for Single-Task Focus'}
              </p>
            </div>
          </div>

          {/* Quick Circadian Switcher */}
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-control border border-border-control/40 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundFX.playTactileClick();
                setManualMode('morning');
              }}
              title="Morning Mode"
              aria-label="Morning Mode"
              className={`px-2 py-1 rounded text-caption font-mono font-semibold transition-colors ${
                activeMode === 'morning' ? 'bg-card text-primary-text shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Dawn
            </button>
            <button
              type="button"
              onClick={() => {
                soundFX.playTactileClick();
                setManualMode('flow');
              }}
              title="Flow Mode"
              aria-label="Flow Mode"
              className={`px-2 py-1 rounded text-caption font-mono font-semibold transition-colors ${
                activeMode === 'flow' ? 'bg-card text-accent shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Flow
            </button>
            <button
              type="button"
              onClick={() => {
                soundFX.playTactileClick();
                setManualMode('evening');
              }}
              title="Evening Mode"
              aria-label="Evening Mode"
              className={`px-2 py-1 rounded text-caption font-mono font-semibold transition-colors ${
                activeMode === 'evening' ? 'bg-card text-ai-text shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Dusk
            </button>
          </div>
        </div>

        {/* Circadian Guidance or Streak Context */}
        {activeMode === 'evening' && (
          <div className="mt-3.5 px-3.5 py-2.5 rounded-lg bg-ai/10 border border-ai/25 flex items-center justify-between gap-3 text-caption">
            <div className="flex items-center gap-2 text-ai-text">
              <Moon size={15} aria-hidden="true" />
              <span>
                <strong className="font-semibold">{tasksCompleted} of {tasksTotal}</strong> planned tasks completed today.
              </span>
            </div>
            <span className="font-mono text-ai-text font-bold uppercase tracking-wider text-micro">
              {streakDays}d Streak
            </span>
          </div>
        )}

        {activeMode === 'morning' && (
          <div className="mt-3.5 px-3.5 py-2.5 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-between gap-3 text-caption">
            <div className="flex items-center gap-2 text-primary-text">
              <Sun size={15} aria-hidden="true" />
              <span>Sequence your top 3 commitments and lock your focus blocks.</span>
            </div>
          </div>
        )}

        {/* Task Priority Block */}
        {task ? (
          <div className="mt-4 sm:mt-5 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-0.5 font-mono text-micro font-bold uppercase tracking-wider text-primary-text border border-primary/20">
                <span>Priority {task.priority === 'high' ? '1' : task.priority === 'medium' ? '2' : '3'}</span>
                {task.priority === 'high' && <span>· High</span>}
                {task.priority === 'medium' && <span>· Medium</span>}
                {task.priority === 'low' && <span>· Low</span>}
              </span>
              {task.durationMin != null && (
                <span className="inline-flex items-center gap-1 font-mono text-caption text-muted-foreground">
                  <Clock size={13} aria-hidden="true" />
                  <span>{task.durationMin} min planned</span>
                </span>
              )}
              {Array.isArray(task.tags) && task.tags.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-micro text-muted-foreground">
                  <TagIcon size={11} aria-hidden="true" />
                  <span>#{task.tags[0].name}</span>
                </span>
              )}
            </div>

            <h3 className="text-title3 sm:text-title2 font-bold tracking-tight text-foreground line-clamp-2">
              {task.title}
            </h3>
          </div>
        ) : (
          <div className="mt-4 sm:mt-5 space-y-2">
            <div className="flex items-center gap-2 text-status-success-text">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span className="font-mono text-caption font-semibold uppercase tracking-wider">All Clear</span>
            </div>
            <h3 className="text-title3 sm:text-title2 font-bold text-foreground">
              You are all caught up for today!
            </h3>
            <p className="text-callout text-muted-foreground">
              No pending tasks scheduled. Capture a new priority or start an open focus sprint.
            </p>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="mt-5 sm:mt-6 pt-4 border-t border-border-control/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {activeMode === 'evening' ? (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full">
            <button
              type="button"
              onClick={() => {
                soundFX.playCelebration();
                onOpenRitual('evening');
              }}
              data-testid="button-begin-evening-ritual"
              className="flex-1 inline-flex tap-target-h items-center justify-center gap-2 rounded-control bg-ai px-4 text-callout font-bold text-ai-foreground shadow-md transition-all hover:brightness-110 active:scale-98"
            >
              <Moon size={16} aria-hidden="true" />
              <span>Begin Close Day Ritual</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
            {task && (
              <>
                <button
                  type="button"
                  onClick={handleStartFocus}
                  className="inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-card px-4 text-callout font-bold text-foreground hover:bg-muted active:scale-98 shrink-0"
                >
                  <Play size={15} fill="currentColor" aria-hidden="true" />
                  <span>Sprint</span>
                </button>
                <button
                  type="button"
                  disabled={completing}
                  onClick={handleMarkComplete}
                  data-testid="button-next-up-mark-done"
                  className="inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-card px-4 text-callout font-bold text-foreground transition-colors hover:bg-muted active:scale-98 disabled:opacity-60 shrink-0"
                >
                  <CheckCircle2 size={16} className="text-status-success-text" aria-hidden="true" />
                  <span>{completing ? 'Completing…' : 'Mark Done'}</span>
                </button>
              </>
            )}
          </div>
        ) : activeMode === 'morning' ? (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full">
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onOpenRitual('morning');
              }}
              data-testid="button-begin-morning-ritual"
              className="flex-1 inline-flex tap-target-h items-center justify-center gap-2 rounded-control bg-primary px-4 text-callout font-bold text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-98"
            >
              <Sun size={16} aria-hidden="true" />
              <span>Begin Morning Ritual</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
            {task && (
              <>
                <button
                  type="button"
                  onClick={handleStartFocus}
                  className="inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-card px-4 text-callout font-bold text-foreground hover:bg-muted active:scale-98 shrink-0"
                >
                  <Play size={15} fill="currentColor" aria-hidden="true" />
                  <span>Start Task</span>
                </button>
                <button
                  type="button"
                  disabled={completing}
                  onClick={handleMarkComplete}
                  data-testid="button-next-up-mark-done"
                  className="inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-card px-4 text-callout font-bold text-foreground transition-colors hover:bg-muted active:scale-98 disabled:opacity-60 shrink-0"
                >
                  <CheckCircle2 size={16} className="text-status-success-text" aria-hidden="true" />
                  <span>{completing ? 'Completing…' : 'Mark Done'}</span>
                </button>
              </>
            )}
          </div>
        ) : task ? (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full">
            <button
              type="button"
              onClick={handleStartFocus}
              data-testid="button-launch-focus-round"
              className="flex-1 inline-flex tap-target-h items-center justify-center gap-2 rounded-control bg-primary px-4 text-callout font-bold text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-98"
            >
              <Play size={16} fill="currentColor" aria-hidden="true" />
              <span>Launch Focus Round</span>
            </button>
            <button
              type="button"
              disabled={completing}
              onClick={handleMarkComplete}
              data-testid="button-next-up-mark-done"
              className="inline-flex tap-target-h items-center justify-center gap-2 rounded-control border border-border-control bg-card px-4 text-callout font-bold text-foreground transition-colors hover:bg-muted active:scale-98 disabled:opacity-60 shrink-0"
            >
              <CheckCircle2 size={16} className="text-status-success-text" aria-hidden="true" />
              <span>{completing ? 'Completing…' : 'Mark Done'}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 w-full">
            <button
              type="button"
              onClick={handleStartFocus}
              className="flex-1 inline-flex tap-target-h items-center justify-center gap-2 rounded-control bg-primary px-4 text-callout font-bold text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-98"
            >
              <Play size={16} fill="currentColor" aria-hidden="true" />
              <span>Start Open Focus</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
