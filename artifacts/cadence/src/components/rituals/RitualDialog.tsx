import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sun,
  Moon,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  Inbox,
  Clock,
  Flame,
  Star,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
import { usePlanDay, useCloseDay } from '@workspace/api-client-react';
import { today, timezone } from '@/lib/date-utils';
import { recordActivity } from '@/lib/activity-history';
import type { Task } from '@workspace/api-client-react';

interface RitualDialogProps {
  type: 'morning' | 'evening';
  tasks: Task[];
  /**
   * The state of the query that produced `tasks`. An unread or failed
   * query is NOT an empty task list: the parent must say which it was, so
   * this dialog can state the absence of open tasks instead of claiming
   * the day is clear.
   */
  tasksLoading?: boolean;
  tasksError?: boolean;
  onRetryTasks?: () => void;
  onClose: () => void;
  onUpdateTask: (taskId: number, updates: { dueAt?: string | null; status?: 'inbox' | 'open' }) => void;
  onSelectNextUp?: (taskId: number) => void;
}

/**
 * The evidence this dialog needs to talk about the user's day did not
 * arrive. It says so, instead of rendering the empty state -- which would
 * read as "everything is done" when nothing answered.
 */
function TasksUnknownNote({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="py-6 text-center" data-testid="ritual-tasks-unknown" role="status">
      <AlertTriangle size={20} className="mx-auto mb-2 text-status-warning-text" aria-hidden="true" />
      <p className="text-callout font-semibold text-foreground">Your tasks could not be loaded</p>
      <p className="mt-1 text-caption text-muted-foreground">
        We don't know what is still open, so we can't say the day is clear.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            onRetry();
          }}
          /* TAP TARGET: `min-h-9` is a 36px visual box, under the 44x44px
             floor (DESIGN.md A6 "44x44px Minimum", locked decision D-29). The
             visual box stays 36px and `tap-target-expand` grows the hit area
             to 44px around it. Dense-cluster check: the button is the only
             control in this note, its nearest neighbour is a paragraph, and
             the 4px of overhang on each side lands on that paragraph's own
             line box -- so no other hit area is stolen. */
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-control bg-card px-3 text-caption font-bold text-foreground hover:bg-muted active:scale-98 tap-target-expand"
        >
          <RotateCcw size={13} aria-hidden="true" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** The same, for a query that is still in flight. */
function TasksLoadingNote() {
  return (
    <div
      className="flex items-center justify-center gap-2 py-6 text-caption text-muted-foreground"
      data-testid="ritual-tasks-loading"
    >
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      Loading your tasks…
    </div>
  );
}

export function RitualDialog({
  type,
  tasks,
  tasksLoading = false,
  tasksError = false,
  onRetryTasks,
  onClose,
  onUpdateTask,
  onSelectNextUp,
}: RitualDialogProps) {
  const [selectedNextUpId, setSelectedNextUpId] = useState<number | null>(null);

  // The morning plan and the evening close are computed server-side so they
  // use the same day boundaries, quiet hours and settings the rest of the app
  // uses. The client used to reimplement both, with its own hardcoded 09:00
  // rollover that ignored the user's working hours.
  const planParams = { date: today(), timezone: timezone() };
  // `usePlanDay` always fires; the evening dialog simply does not render the
  // morning plan, so gating it would add coupling for no benefit.
  const { data: plan, isLoading: planLoading } = usePlanDay(planParams);
  const closeDay = useCloseDay();

  const completedToday = tasks.filter((t) => t.status === 'completed');
  const incompleteToday = tasks.filter((t) => t.status === 'open');
  // The counts above are only facts when the query that produced them
  // answered. While it is in flight, or after it failed, they are unknown --
  // an empty list is not a clear day.
  const tasksUnknown = tasksLoading || tasksError;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose]);

  const canSetNextUp = typeof onSelectNextUp === 'function';

  const handleFinishMorning = () => {
    soundFX.playFocusStart();
    // Compliance honesty (§P3): only claim the #1 priority was set when a
    // provider exists AND a task was actually selected. The dialog also mounts
    // on Review, where no next-up state exists — committing there must not
    // invent a success the user never observed.
    const committedNextUp = canSetNextUp && selectedNextUpId != null && onSelectNextUp;
    if (committedNextUp) {
      onSelectNextUp(selectedNextUpId);
    }
    recordActivity({
      type: 'ritual_completed',
      title: 'Plan My Day ritual completed',
      description: committedNextUp
        ? 'Morning focus plan locked in — #1 priority set'
        : canSetNextUp
          ? 'Morning plan committed without selecting a #1 priority'
          : 'Morning plan committed (priority selection lives on Today)',
    });
    if (committedNextUp) {
      toast.success('Morning plan locked in!', {
        description: 'Your #1 focus priority has been set on Today.',
      });
    } else if (canSetNextUp) {
      toast.success('Morning plan committed', {
        description: 'No #1 priority was selected — pick one on Today anytime.',
      });
    } else {
      toast.success('Morning ritual complete', {
        description: 'Set your #1 focus priority from the Today dashboard.',
      });
    }
    onClose();
  };

  const handleRolloverTomorrow = (taskId: number) => {
    soundFX.playTactileClick();
    onUpdateTask(taskId, { dueAt: null, status: 'open' });
    toast('Unscheduled', {
      description: 'The close-day roll-forward will pick it up with tomorrow\'s date.',
    });
  };

  const handleReturnToInbox = (taskId: number) => {
    soundFX.playTactileClick();
    onUpdateTask(taskId, { dueAt: null, status: 'inbox' });
    toast('Returned task to Inbox');
  };

  const handleFinishEvening = () => {
    soundFX.playFocusStart();
    closeDay.mutate(
      {
        data: {
          rollForwardUnfinished: true,
          targetDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        },
      },
      {
        onSuccess: (summary) => {
          soundFX.playCelebration();
          recordActivity({
            type: 'ritual_completed',
            title: 'Close My Day ritual completed',
            description: `${summary.completedCount} completed · ${summary.movedToTomorrowCount} rolled forward · ${summary.focusMinutesTotal}m focused`,
          });
          toast.success('Day closed', {
            description: `${summary.completedCount} completed · ${summary.movedToTomorrowCount} rolled forward · ${summary.focusMinutesTotal}m focused`,
          });
          onClose();
        },
        onError: (err) =>
          toast.error('Could not close the day', {
            description:
              err && typeof err === 'object' && 'message' in err
                ? String((err as { message: unknown }).message)
                : 'Request failed',
          }),
      },
    );
  };

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/90 backdrop-blur-md overflow-y-auto animate-enter"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[calc(100dvh-2rem)] flex flex-col rounded-lg border border-border-control bg-muted shadow-2xl shadow-black text-foreground transition-all overflow-hidden my-auto"
      >
        {/* Mobile Pull-Down Indicator Grab Bar */}
        <div className="sm:hidden mx-auto w-10 h-1 rounded-full bg-card/25 mt-2.5 mb-0.5 shrink-0" />

        {/* Fixed Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-border-control bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`grid size-9 place-items-center rounded-xl shadow-sm ${
                type === 'morning'
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-ai/20 text-ai-text border border-ai/30'
              }`}
            >
              {type === 'morning' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </div>
            <div>
              <h2 className="text-callout font-bold tracking-tight text-foreground">
                {type === 'morning' ? 'Plan My Day' : 'Close My Day'}
              </h2>
              <p className="text-caption text-muted-foreground">
                {type === 'morning'
                  ? canSetNextUp
                    ? 'Set your intentional shape and commit to your #1 priority.'
                    : 'Review the shape of your day and kick it off — set your #1 priority from Today.'
                  : 'Review accomplishments, clean the ledger, and leave nothing hanging.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-block rounded border border-border-control bg-card/[0.04] px-1.5 py-0.5 font-mono text-caption text-muted-foreground">
              Esc
            </kbd>
            <button
              onClick={onClose}
              className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-card/[0.08] hover:text-foreground transition-colors active:scale-95 tap-target-expand"
              aria-label="Close dialog"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
          {/* Morning Ritual Flow */}
          {type === 'morning' && (
            <div className="space-y-4">
              {/* Server-computed context for the day. */}
              {plan && (
                <div className="flex flex-wrap items-center gap-2 text-caption font-mono">
                  <span className="px-2 py-1 rounded-lg bg-card/[0.04] border border-border-control text-muted-foreground">
                    {plan.todayTasks.length} due today
                  </span>
                  <span
                    className={`px-2 py-1 rounded-lg border ${
                      plan.overdueTasks.length
                        ? 'bg-destructive/10 border-destructive/30 text-destructive'
                        : 'bg-card/[0.04] border-border-control text-muted-foreground'
                    }`}
                  >
                    {plan.overdueTasks.length} overdue
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-card/[0.04] border border-border-control text-muted-foreground">
                    {plan.todayBlocks.length} blocks
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-card/[0.04] border border-border-control text-muted-foreground">
                    aim {plan.dailyFocusTarget} rounds
                  </span>
                </div>
              )}

              {canSetNextUp ? (
                <>
                  <div>
                    <h3 className="text-caption font-semibold text-foreground flex items-center gap-1.5">
                      <Star className="size-3.5 text-accent" />
                      <span>Select Your #1 Next Up Focus Task</span>
                    </h3>
                    <p className="text-caption text-muted-foreground mt-0.5">
                      The single high-leverage task to tackle first when energy is highest.
                    </p>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {planLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-caption text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Building your plan…
                      </div>
                    ) : tasksError ? (
                      <TasksUnknownNote onRetry={onRetryTasks} />
                    ) : tasksLoading ? (
                      <TasksLoadingNote />
                    ) : incompleteToday.length === 0 ? (
                      <div className="text-center py-8 rounded-xl bg-card/[0.02] border border-border-control text-caption text-muted-foreground">
                        No open tasks to pick from. Add tasks from Inbox to plan your day.
                      </div>
                    ) : (
                      incompleteToday.map((task) => (
                        <div
                          key={task.id}
                          onClick={() => {
                            soundFX.playTactileClick();
                            setSelectedNextUpId(task.id);
                          }}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                            selectedNextUpId === task.id
                              ? 'bg-accent/15 border-accent/60 shadow-sm'
                              : 'bg-card/[0.02] border-border-control hover:border-border-control hover:bg-card/[0.04]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <div
                              className={`size-4 rounded-full border grid place-items-center ${
                                selectedNextUpId === task.id
                                  ? 'border-accent bg-accent'
                                  : 'border-border-strong'
                              }`}
                            >
                              {selectedNextUpId === task.id && <Check className="size-3 text-foreground stroke-[3]" />}
                            </div>
                            <span className="text-caption font-medium text-foreground truncate">{task.title}</span>
                          </div>

                          {task.durationMin && (
                            <span className="text-caption font-mono text-muted-foreground shrink-0">
                              {task.durationMin}m
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="p-3 rounded-xl bg-card/[0.02] border border-border-control text-caption text-muted-foreground">
                  The #1 next-up picker lives on the Today dashboard — commit here, and set your priority there.
                </div>
              )}
            </div>
          )}

          {/* Evening Close Ritual Flow */}
          {type === 'evening' && (
            <div className="space-y-4">
              {/* One statement of the unknown, for the whole evening flow:
                  both counts below come from the same read. */}
              {tasksError ? (
                <TasksUnknownNote onRetry={onRetryTasks} />
              ) : tasksLoading ? (
                <TasksLoadingNote />
              ) : null}

              {/* Step 1: Accomplishments */}
              <div className="p-3.5 rounded-xl bg-card/[0.02] border border-border-control space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-caption font-semibold text-status-success-text flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    Today's Completed Wins ({tasksUnknown ? '—' : completedToday.length})
                  </span>
                  <span className="text-caption font-mono text-muted-foreground">
                    {tasksUnknown
                      ? '—'
                      : `${completedToday.reduce((acc, t) => acc + (t.durationMin || 0), 0)} min total`}
                  </span>
                </div>

                <div className="max-h-32 overflow-y-auto space-y-1 pt-1">
                  {tasksUnknown ? null : completedToday.length === 0 ? (
                    <p className="text-caption text-muted-foreground italic">No tasks completed yet today.</p>
                  ) : (
                    completedToday.map((t) => (
                      <div key={t.id} className="text-caption text-foreground flex items-center gap-2 truncate">
                        <span className="text-status-success-text">✓</span>
                        <span className="truncate line-through text-muted-foreground">{t.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Incomplete Task Rollover Triage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-caption font-semibold text-foreground">
                    Incomplete Tasks ({tasksUnknown ? '—' : incompleteToday.length})
                  </h3>
                  <span className="text-caption text-muted-foreground">Never leave items hanging</span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {tasksUnknown ? null : incompleteToday.length === 0 ? (
                    /* An ABSENCE, not a verdict. "Everything scheduled for
                       today is complete" was a success claim the data cannot
                       support: an empty list means nothing was open, not that
                       the day was done well. */
                    <div className="text-center py-6 rounded-xl bg-card/[0.02] border border-border-control text-caption text-muted-foreground">
                      No incomplete tasks.
                    </div>
                  ) : (
                    incompleteToday.map((task) => (
                      <div
                        key={task.id}
                        className="p-2.5 rounded-xl bg-card/[0.02] border border-border-control flex items-center justify-between gap-2"
                      >
                        <span className="text-caption font-medium text-foreground truncate side-panel">
                          {task.title}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleRolloverTomorrow(task.id)}
                            className="px-2 py-1 rounded-md bg-card/[0.04] hover:bg-card/[0.08] text-caption font-medium text-foreground flex items-center gap-1 border border-border-control transition-colors"
                            title="Move to Tomorrow 09:00"
                          >
                            <RotateCcw className="size-3 text-accent" />
                            Tomorrow
                          </button>

                          <button
                            onClick={() => handleReturnToInbox(task.id)}
                            className="px-2 py-1 rounded-md bg-card/[0.04] hover:bg-card/[0.08] text-caption font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 border border-border-control transition-colors"
                            title="Return to Inbox"
                          >
                            <Inbox className="size-3" />
                            Inbox
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        <div
          className="flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-border-control bg-card shrink-0"
          style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={onClose}
            className="h-8 rounded-lg px-3 text-caption font-medium text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors active:scale-95 tap-target-expand"
          >
            Cancel
          </button>
          {type === 'morning' ? (
            <button
              onClick={handleFinishMorning}
              className="h-8 px-4 rounded-lg bg-accent hover:bg-accent/90 text-foreground font-bold text-caption shadow-sm transition-all active:scale-95 flex items-center gap-1.5 tap-target-expand"
            >
              <span>Commit & Start Day</span>
              <ArrowRight className="size-3.5" />
            </button>
          ) : (
            <button
              onClick={handleFinishEvening}
              disabled={closeDay.isPending}
              className="h-8 px-4 rounded-lg bg-success hover:bg-success/90 text-primary-foreground font-bold text-caption shadow-sm transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-60 tap-target-expand"
            >
              <span>{closeDay.isPending ? 'Closing…' : 'Complete Day Review'}</span>
              {closeDay.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

export default RitualDialog;
