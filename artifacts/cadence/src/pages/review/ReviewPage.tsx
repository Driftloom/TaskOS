import { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Flame,
  Sparkles,
  Sun,
  Moon,
  ArrowRight,
  Archive,
  Calendar,
  Clock,
  RotateCcw,
  History,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListTasksQueryKey,
  getGetTaskSummaryQueryKey,
  useGetTaskSummary,
  useGetMomentum,
  useGetSlippageReport,
  useListTasks,
  useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import { plural, today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { ProgressRing } from '@/components/shared/ActivityRings';
import { ErrorState, SectionHeading } from '@/components/shared/StateViews';
import { RitualDialog } from '@/components/rituals/RitualDialog';
import { WorkspacePanel } from '@/components/task/WorkspacePanel';
import { ActivityHistoryDrawer } from '@/components/shared/ActivityHistoryDrawer';
import { toast } from 'sonner';

export function ReviewPage() {
  const queryClient = useQueryClient();
  const [ritualType, setRitualType] = useState<'morning' | 'evening' | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [viewScope, setViewScope] = useState<'today' | 'archive'>('today');

  const summaryParams = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: summary, isLoading, isError, refetch } = useGetTaskSummary(summaryParams);

  const {
    data: slippage,
    isLoading: slippageLoading,
    isError: slippageError,
    refetch: refetchSlippage,
  } = useGetSlippageReport({
    days: 7,
    timezone: timezone(),
  });
  const hasCompletedSample = (slippage?.totalCompletedOnTime ?? 0) > 0;
  const slippageCount = (n: number | undefined) =>
    slippage != null && !slippageLoading && !slippageError ? (n ?? 0) : '—';

  const momentumParams = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: momentum } = useGetMomentum(momentumParams);

  const listParams = useMemo(
    () => ({
      date: today(),
      // "archive" is a real 7-day completion window backed by
      // tasks.completed_at. It used to send no scope at all, so the tab
      // labelled "Archive (7d)" was actually showing every task ever created.
      scope: viewScope === 'today' ? ('today' as const) : ('completed7d' as const),
      timezone: timezone(),
    }),
    [viewScope],
  );
  const { data: tasks } = useListTasks(listParams);

  const updateTask = useUpdateTask();

  const completedTasks = tasks?.filter((t) => t.status === 'completed') ?? [];
  const openTasks = tasks?.filter((t) => t.status !== 'completed') ?? [];

  const handleUpdateTask = (
    taskId: number,
    updates: { dueAt?: string | null; status?: 'inbox' | 'open' },
  ) => {
    updateTask.mutate(
      {
        id: taskId,
        data: updates,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(summaryParams) });
        },
      },
    );
  };

  return (
    <div className="animate-enter w-full space-y-6">
      <SectionHeading
        eyebrow="Review"
        title="Notice what moved."
        detail="A calm, honest view of today's work based on what actually happened."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                soundFX.playTactileClick();
                setShowHistory(true);
              }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border-control bg-card/[0.03] hover:bg-card/[0.06] hover:border-border-control text-caption font-medium text-foreground hover:text-foreground transition-all active:scale-[0.98] tap-target-expand"
              title="View Activity History"
              aria-label="View Activity History"
            >
              <History className="size-3.5 text-accent" />
              <span>History</span>
            </button>
            <button
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('morning');
              }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border-control bg-card/[0.03] hover:bg-card/[0.06] hover:border-border-control text-caption font-medium text-foreground hover:text-foreground transition-all active:scale-[0.98] tap-target-expand"
            >
              <Sun className="size-3.5 text-accent" />
              <span>Plan Day</span>
            </button>
            <button
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('evening');
              }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border-control bg-card/[0.03] hover:bg-card/[0.06] hover:border-border-control text-caption font-medium text-foreground hover:text-foreground transition-all active:scale-[0.98] tap-target-expand"
            >
              <Moon className="size-3.5 text-status-success-text" />
              <span>Close Day</span>
            </button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 calendar-cell">
          <div className="h-52 animate-pulse rounded-xl bg-card/[0.02] border border-border-control" />
          <div className="h-52 animate-pulse rounded-xl bg-card/[0.02] border border-border-control" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          {/* Top Cards Grid */}
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            {/* Progress Card */}
            <div className="card-enterprise rounded-xl border border-border-control bg-card p-5 sm:p-6 shadow-xl">
              <p className="font-mono text-caption uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                Today's Progress
              </p>

              <div className="mt-6 flex items-center gap-6">
                <ProgressRing
                  completed={summary?.completed ?? 0}
                  total={summary?.total ?? 0}
                  size={120}
                  strokeWidth={8}
                />
                <div>
                  <p className="text-display2 font-extrabold tracking-tight text-foreground font-mono">
                    {summary?.completed ?? 0}
                  </p>
                  <p className="mt-1 text-caption text-muted-foreground">
                    of {summary?.total ?? 0} tasks finished
                  </p>
                </div>
              </div>

              <div className="mt-6 border-t border-border-control pt-4">
                <p className="text-caption leading-relaxed text-muted-foreground">
                  {summary?.completed
                    ? `You moved ${plural(summary.completed, 'task', '')} forward today. Real focus creates durable momentum.`
                    : 'The day is open. One clear, finished item is enough to begin.'}
                </p>
              </div>
            </div>

            {/* The Completed Ledger Card */}
            <div className="card-enterprise rounded-xl border border-border-control bg-card p-5 sm:p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-caption uppercase tracking-[0.2em] text-muted-foreground">
                      The Ledger
                    </p>
                    <div className="flex rounded-lg bg-muted p-0.5 text-caption">
                      {/* WCAG 2.5.8 / AGENTS.md 44px floor. Two changes, not
                          one: the pill was raised 20px -> 32px (`py-1.5`) so the
                          strip reads as a control rather than a text run, and
                          `tap-target-expand` closes the last 12px. Dense-cluster
                          check: the two tab centres are 60.5px apart (45.67px
                          and 75.34px wide, flush, no gap), so the two expanded
                          boxes -- 0.8..44.8 and 61.3..105.3 -- do not overlap,
                          which is the caveat index.css documents for this
                          utility. The vertical 12px of overhang lands on the
                          non-interactive "The Ledger" caption above and the
                          completed-task rows below. */}
                      <button
                        onClick={() => {
                          soundFX.playTactileClick();
                          setViewScope('today');
                        }}
                        className={`tap-target-expand px-2 py-1.5 rounded-md font-semibold ${
                          viewScope === 'today'
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground'
                        }`}
                      >
                        Today
                      </button>
                      <button
                        onClick={() => {
                          soundFX.playTactileClick();
                          setViewScope('archive');
                        }}
                        className={`tap-target-expand px-2 py-1.5 rounded-md font-semibold ${
                          viewScope === 'archive'
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground'
                        }`}
                      >
                        Archive (7d)
                      </button>
                    </div>
                  </div>

                  <span className="font-mono text-caption text-primary-text font-bold">
                    {summary?.focusMinutes ?? 0} min focused
                  </span>
                </div>

                <div className="mt-5 space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {completedTasks.length > 0 ? (
                    completedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="row-density flex items-center rounded-xl bg-card/[0.03] text-micro hover:bg-card/[0.06] transition-colors"
                        data-testid={`review-task-${task.id}`}
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success/20 text-status-success-text">
                          <Check size={13} strokeWidth={3} />
                        </span>
                        <span className="truncate font-semibold text-foreground text-caption sm:text-micro">
                          {task.title}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-caption text-muted-foreground">
                          {task.durationMin}m
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-border-control p-8 text-center text-caption text-muted-foreground">
                      Completed tasks will settle here as you finish them.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* What Slipped & Why — Raw Table Reconciliation Card */}
          <div className="card-enterprise rounded-xl border border-border-control bg-card p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-control pb-4">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-lg bg-status-warning-fill/15 text-status-warning-text">
                  <AlertTriangle size={16} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-headline font-bold text-foreground flex items-center gap-2">
                    What Slipped &amp; Why
                    <span className="text-caption font-mono uppercase px-2 py-0.5 rounded-full bg-card border border-border-control text-muted-foreground font-semibold">
                      7-Day Lookback
                    </span>
                  </h3>
                  <p className="text-caption text-muted-foreground">
                    Reconciled across raw tasks, reschedule proposals, and agent logs.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-micro font-bold font-mono text-foreground">
                    {/* The API returns 1.0 when nothing has been completed in the
                        window. Never turn that empty sample into a 100% claim. */}
                    {slippage != null && !slippageLoading && !slippageError && hasCompletedSample
                      ? `${Math.round(slippage.onTimeRate * 100)}%`
                      : '—'}
                  </span>
                  <span className="block text-caption text-muted-foreground">On-Time Rate</span>
                </div>
                <div className="h-8 w-px bg-border-control" />
                <div className="text-right">
                  <span className="text-micro font-bold font-mono text-status-warning-text">
                    {slippageCount(slippage?.totalSlipped)}
                  </span>
                  <span className="block text-caption text-muted-foreground">Slipped</span>
                </div>
              </div>
            </div>

            {/* Reason Breakdown Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-lg border border-border-control bg-card">
                <div className="flex items-center gap-1.5 text-foreground text-caption font-bold">
                  <Clock size={13} className="text-status-warning-text" />
                  <span>Capacity</span>
                </div>
                <div className="mt-1 text-callout font-bold font-mono text-foreground">
                  {slippageCount(slippage?.byReason.capacityOverrun)}
                </div>
                <div className="text-caption text-muted-foreground">Multiple auto-moves</div>
              </div>

              <div className="p-3 rounded-lg border border-border-control bg-card">
                <div className="flex items-center gap-1.5 text-foreground text-caption font-bold">
                  <AlertTriangle size={13} className="text-status-danger-text" />
                  <span>Missed</span>
                </div>
                <div className="mt-1 text-callout font-bold font-mono text-foreground">
                  {slippageCount(slippage?.byReason.missedDeadline)}
                </div>
                <div className="text-caption text-muted-foreground">Past-due open tasks</div>
              </div>

              <div className="p-3 rounded-lg border border-border-control bg-card">
                <div className="flex items-center gap-1.5 text-foreground text-caption font-bold">
                  <RotateCcw size={13} className="text-accent" />
                  <span>Postponed</span>
                </div>
                <div className="mt-1 text-callout font-bold font-mono text-foreground">
                  {slippageCount(slippage?.byReason.postponed)}
                </div>
                <div className="text-caption text-muted-foreground">Proposal / user moves</div>
              </div>

              <div className="p-3 rounded-lg border border-border-control bg-card">
                <div className="flex items-center gap-1.5 text-foreground text-caption font-bold">
                  <AlertCircle size={13} className="text-primary-text" />
                  <span>Flagged</span>
                </div>
                <div className="mt-1 text-callout font-bold font-mono text-foreground">
                  {slippageCount(slippage?.byReason.flaggedCapExceeded)}
                </div>
                <div className="text-caption text-muted-foreground">Exceeded 5-move cap</div>
              </div>
            </div>

            {/* Slipped Task List */}
            <div className="space-y-2 pt-2">
              {slippage?.slippedTasks && slippage.slippedTasks.length > 0 ? (
                slippage.slippedTasks.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-border-control bg-card hover:bg-muted/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-caption sm:text-micro text-foreground truncate">
                          {item.title}
                        </span>
                        {item.rescheduleCount > 0 && (
                          <span className="shrink-0 font-mono text-caption px-1.5 py-0.2 rounded bg-muted border border-border-control text-muted-foreground font-semibold">
                            {item.rescheduleCount} move{item.rescheduleCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-caption text-muted-foreground">
                        {item.recommendedAction}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 text-caption font-mono font-bold px-2 py-0.5 rounded-full border ${
                          item.reason === 'flagged_cap_exceeded'
                            ? 'bg-status-danger-fill/15 text-status-danger-text border-status-danger-fill/30'
                            : item.reason === 'capacity_overrun'
                            ? 'bg-status-warning-fill/15 text-status-warning-text border-status-warning-fill/30'
                            : item.reason === 'missed_deadline'
                            ? 'bg-destructive/15 text-destructive border-destructive/30'
                            : 'bg-card text-foreground border-border-control'
                        }`}
                      >
                        {item.reason === 'flagged_cap_exceeded' && <AlertCircle size={11} />}
                        {item.reason === 'capacity_overrun' && <Clock size={11} />}
                        {item.reason === 'missed_deadline' && <AlertTriangle size={11} />}
                        {item.reason === 'postponed' && <RotateCcw size={11} />}
                        <span>{item.reasonLabel}</span>
                      </span>
                    </div>
                  </div>
                ))
              ) : slippageLoading ? (
                <div className="space-y-2" aria-busy="true">
                  <div className="h-12 animate-pulse rounded-lg bg-muted/50" />
                  <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
                </div>
              ) : slippageError ? (
                <div className="p-6 rounded-lg border border-status-warning/40 bg-status-warning/10 text-center text-caption text-muted-foreground">
                  <AlertTriangle size={18} className="mx-auto mb-1 text-status-warning-text" />
                  <p className="font-semibold text-foreground">Slippage report couldn't load</p>
                  <p className="mt-1">No slippage result is being claimed.</p>
                  <button
                    type="button"
                    onClick={() => refetchSlippage()}
                    className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground hover:bg-muted"
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    Retry
                  </button>
                </div>
              ) : !hasCompletedSample ? (
                <div className="p-6 rounded-lg border border-dashed border-border-control text-center text-caption text-muted-foreground">
                  <Clock size={18} className="mx-auto mb-1 text-muted-foreground" />
                  No completed tasks in the last 7 days, so there is no on-time sample yet.
                </div>
              ) : (
                <div className="p-6 rounded-lg border border-dashed border-border-control text-center text-caption text-muted-foreground">
                  <CheckCircle2 size={18} className="mx-auto mb-1 text-status-success-text" />
                  No slippage detected in the last 7 days.
                </div>
              )}
            </div>

            {/* Raw Table Reconciliation Audit Footer */}
            <div className="pt-3 border-t border-border-control flex flex-wrap items-center justify-between text-caption font-mono text-muted-foreground gap-2">
              <span>
                {slippage ? (
                  <>
                    Reconciliation: {slippage.reconciliation.rawProposalsCount} proposals ·{' '}
                    {slippage.reconciliation.autoMovedTasksCount} auto-moved ·{' '}
                    {slippage.reconciliation.flaggedTasksCount} flagged ·{' '}
                    {slippage.reconciliation.openOverdueCount} overdue
                  </>
                ) : (
                  'Reconciliation unavailable'
                )}
              </span>
            </div>
          </div>

          {/* Interactive Guided Ritual Cards */}
          <div className="grid gap-3.5 sm:grid-cols-2">
            {/* Morning Plan Ritual Card */}
            <button
              type="button"
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('morning');
              }}
              className="text-left w-full card-enterprise rounded-xl border border-border-control bg-card p-4 sm:p-5 hover:border-accent/40 transition-all cursor-pointer shadow-lg group relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-accent">
                  <Sun size={15} />
                  <span className="font-mono text-caption uppercase tracking-wider font-bold">
                    Morning Ritual
                  </span>
                </div>
                <span className="text-caption text-muted-foreground group-hover:text-accent flex items-center gap-1 font-medium">
                  Start Plan <ArrowRight size={12} />
                </span>
              </div>

              <div className="mt-2.5 text-headline font-bold text-foreground">Give the day a shape</div>
              <p className="mt-1 text-caption text-muted-foreground leading-relaxed">
                Pick your primary #1 focus outcome. Align on time blocks and set intentions before the rush begins.
              </p>
              <div className="mt-3 flex items-center justify-between text-caption font-mono text-muted-foreground pt-2.5 border-t border-border-control">
                <span>{openTasks.length} tasks open in Today</span>
              </div>
            </button>

            {/* Evening Close Ritual Card */}
            <button
              type="button"
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('evening');
              }}
              className="text-left w-full card-enterprise rounded-xl border border-border-control bg-card p-4 sm:p-5 hover:border-success/40 transition-all cursor-pointer shadow-lg group relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-status-success-text">
                  <Moon size={15} />
                  <span className="font-mono text-caption uppercase tracking-wider font-bold">
                    Evening Ritual
                  </span>
                </div>
                <span className="text-caption text-muted-foreground group-hover:text-status-success-text flex items-center gap-1 font-medium">
                  Close Day <ArrowRight size={12} />
                </span>
              </div>

              <div className="mt-2.5 text-headline font-bold text-foreground">Close the loop</div>
              <p className="mt-1 text-caption text-muted-foreground leading-relaxed">
                Check off what finished, roll over uncompleted items forward without guilt, and leave a clear slate for tomorrow.
              </p>
              <div className="mt-3 flex items-center justify-between text-caption font-mono text-muted-foreground pt-2.5 border-t border-border-control">
                {(momentum?.streakDays ?? 0) > 0 ? (
                  <span className="flex items-center gap-1">
                    <Flame size={12} className="text-primary-text" />
                    <span>Streak preserved</span>
                  </span>
                ) : (
                  <span>No active streak</span>
                )}
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Projects & tags, which had a full CRUD API and no UI. */}
      <WorkspacePanel />

      {/* Guided Ritual Modal */}
      {ritualType && (
        <RitualDialog
          type={ritualType}
          tasks={tasks ?? []}
          onClose={() => setRitualType(null)}
          onUpdateTask={handleUpdateTask}
        />
      )}

      {/* Activity History Slide-Over Drawer */}
      <ActivityHistoryDrawer
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}
export default ReviewPage;
