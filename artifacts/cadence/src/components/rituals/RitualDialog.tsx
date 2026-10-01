import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
import { usePlanDay, useCloseDay } from '@workspace/api-client-react';
import { today, timezone } from '@/lib/date-utils';
import type { Task } from '@workspace/api-client-react';

interface RitualDialogProps {
  type: 'morning' | 'evening';
  tasks: Task[];
  onClose: () => void;
  onUpdateTask: (taskId: number, updates: { dueAt?: string | null; status?: 'inbox' | 'open' }) => void;
  onSelectNextUp?: (taskId: number) => void;
}

export function RitualDialog({
  type,
  tasks,
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

  const handleFinishMorning = () => {
    soundFX.playFocusStart();
    if (selectedNextUpId && onSelectNextUp) {
      onSelectNextUp(selectedNextUpId);
    }
    toast.success('Morning plan locked in!', {
      description: 'Your #1 focus priority has been set on Today.',
    });
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/90 backdrop-blur-md overflow-y-auto animate-enter"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[92dvh] sm:max-h-[min(600px,calc(100dvh-2rem))] flex flex-col rounded-t-2xl sm:rounded-2xl border-t sm:border border-border-control2] bg-muted shadow-2xl shadow-black text-foreground transition-all overflow-hidden my-0 sm:my-auto"
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
              <h2 className="text-base font-bold tracking-tight text-foreground">
                {type === 'morning' ? 'Plan My Day' : 'Close My Day'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {type === 'morning'
                  ? 'Set your intentional shape and commit to your #1 priority.'
                  : 'Review accomplishments, clean the ledger, and leave nothing hanging.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-block rounded border border-border-control bg-card/[0.04] px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              Esc
            </kbd>
            <button
              onClick={onClose}
              className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-card/[0.08] hover:text-foreground transition-colors active:scale-95"
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
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
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

              <div>
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Star className="size-3.5 text-accent" />
                  <span>Select Your #1 Next Up Focus Task</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The single high-leverage task to tackle first when energy is highest.
                </p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {planLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Building your plan…
                  </div>
                ) : incompleteToday.length === 0 ? (
                  <div className="text-center py-8 rounded-xl bg-card/[0.02] border border-border-control text-xs text-muted-foreground">
                    No tasks due today. Add tasks from Inbox to plan your day.
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
                          : 'bg-card/[0.02] border-border-control hover:border-border-control2] hover:bg-card/[0.04]'
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
                        <span className="text-xs font-medium text-foreground truncate">{task.title}</span>
                      </div>

                      {task.durationMin && (
                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                          {task.durationMin}m
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Evening Close Ritual Flow */}
          {type === 'evening' && (
            <div className="space-y-4">
              {/* Step 1: Accomplishments */}
              <div className="p-3.5 rounded-xl bg-card/[0.02] border border-border-control space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-status-success-text flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    Today's Completed Wins ({completedToday.length})
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {completedToday.reduce((acc, t) => acc + (t.durationMin || 0), 0)} min total
                  </span>
                </div>

                <div className="max-h-32 overflow-y-auto space-y-1 pt-1">
                  {completedToday.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No tasks completed yet today.</p>
                  ) : (
                    completedToday.map((t) => (
                      <div key={t.id} className="text-xs text-foreground flex items-center gap-2 truncate">
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
                  <h3 className="text-xs font-semibold text-foreground">
                    Incomplete Tasks ({incompleteToday.length})
                  </h3>
                  <span className="text-xs text-muted-foreground">Never leave items hanging</span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {incompleteToday.length === 0 ? (
                    <div className="text-center py-6 rounded-xl bg-card/[0.02] border border-border-control text-xs text-status-success-text font-semibold">
                      🎉 Inbox Zero! Everything scheduled for today is complete.
                    </div>
                  ) : (
                    incompleteToday.map((task) => (
                      <div
                        key={task.id}
                        className="p-2.5 rounded-xl bg-card/[0.02] border border-border-control flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-medium text-foreground truncate max-w-[240px]">
                          {task.title}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleRolloverTomorrow(task.id)}
                            className="px-2 py-1 rounded-md bg-card/[0.04] hover:bg-card/[0.08] text-xs font-medium text-foreground flex items-center gap-1 border border-border-control transition-colors"
                            title="Move to Tomorrow 09:00"
                          >
                            <RotateCcw className="size-3 text-accent" />
                            Tomorrow
                          </button>

                          <button
                            onClick={() => handleReturnToInbox(task.id)}
                            className="px-2 py-1 rounded-md bg-card/[0.04] hover:bg-card/[0.08] text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 border border-border-control transition-colors"
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
        <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-border-control bg-card shrink-0 pb-safe sm:pb-3.5">
          <button
            onClick={onClose}
            className="h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors active:scale-95"
          >
            Cancel
          </button>
          {type === 'morning' ? (
            <button
              onClick={handleFinishMorning}
              className="h-8 px-4 rounded-lg bg-accent hover:bg-accent/90 text-foreground font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span>Commit & Start Day</span>
              <ArrowRight className="size-3.5" />
            </button>
          ) : (
            <button
              onClick={handleFinishEvening}
              disabled={closeDay.isPending}
              className="h-8 px-4 rounded-lg bg-success hover:bg-success/90 text-primary-foreground font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-60"
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
}

export default RitualDialog;
