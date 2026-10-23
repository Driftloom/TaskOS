import { useMemo } from 'react';
import { AlertCircle, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import {
  getListBlocksQueryKey,
  getListGoalsQueryKey,
  getListRescheduleProposalsQueryKey,
  getListTasksQueryKey,
  getGetMomentumQueryKey,
  getGetTaskSummaryQueryKey,
  useListBlocks,
  useListGoals,
  useListRescheduleProposals,
  useListTasks,
  useGetMomentum,
  useGetTaskSummary,
  useGetAutomationFlags,
  type Task,
} from '@workspace/api-client-react';
import { today } from '@/lib/date-utils';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { soundFX } from '@/lib/sound-fx';
import { ErrorState } from '@/components/shared/StateViews';
import { DashboardHeader } from './components/DashboardHeader';
import { MomentumCommandCard } from './components/MomentumCommandCard';
import { NextUpFocusHero } from './components/NextUpFocusHero';
import { InboxTriageCard } from './components/InboxTriageCard';
import { ScheduleSnapshotCard } from './components/ScheduleSnapshotCard';
import { ActiveGoalsCard } from './components/ActiveGoalsCard';

function getCurrentMonthString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function DashboardPage() {
  const userTz = useUserTimezone();
  const todayDate = useMemo(() => today(userTz), [userTz]);
  const month = useMemo(() => getCurrentMonthString(), []);

  // Today's tasks query
  const todayParams = useMemo(
    () => ({ date: todayDate, scope: 'today' as const, timezone: userTz }),
    [todayDate, userTz],
  );
  const {
    data: todayTasksData,
    isLoading: todayLoading,
    isError: todayError,
    refetch: refetchToday,
  } = useListTasks(todayParams, {
    query: { queryKey: getListTasksQueryKey(todayParams) },
  });
  const todayTasks = useMemo(
    () => (Array.isArray(todayTasksData) ? todayTasksData : []),
    [todayTasksData],
  );

  // Inbox tasks query
  const inboxParams = useMemo(() => ({ scope: 'inbox' as const }), []);
  const {
    data: inboxTasksData,
    isLoading: inboxLoading,
    isError: inboxError,
    refetch: refetchInbox,
  } = useListTasks(inboxParams, {
    query: { queryKey: getListTasksQueryKey(inboxParams) },
  });
  const inboxTasks = useMemo(
    () => (Array.isArray(inboxTasksData) ? inboxTasksData : []),
    [inboxTasksData],
  );

  // Momentum query
  const momentumParams = useMemo(() => ({ date: todayDate, timezone: userTz }), [todayDate, userTz]);
  const {
    data: momentum,
    isLoading: momentumLoading,
    isError: momentumError,
    refetch: refetchMomentum,
  } = useGetMomentum(momentumParams, {
    query: { queryKey: getGetMomentumQueryKey(momentumParams) },
  });

  // Task summary query
  const summaryParams = useMemo(() => ({ date: todayDate, timezone: userTz }), [todayDate, userTz]);
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useGetTaskSummary(summaryParams, {
    query: { queryKey: getGetTaskSummaryQueryKey(summaryParams) },
  });

  // Time blocks query
  const blockParams = useMemo(() => ({ date: todayDate, timezone: userTz }), [todayDate, userTz]);
  const {
    data: blocksData,
    isLoading: blocksLoading,
    isError: blocksError,
    refetch: refetchBlocks,
  } = useListBlocks(blockParams, {
    query: { queryKey: getListBlocksQueryKey(blockParams) },
  });
  const blocks = useMemo(
    () => (Array.isArray(blocksData) ? blocksData : []),
    [blocksData],
  );

  // Goals query
  const {
    data: goalsData,
    isLoading: goalsLoading,
    isError: goalsError,
    refetch: refetchGoals,
  } = useListGoals(
    { month },
    { query: { queryKey: getListGoalsQueryKey({ month }) } },
  );
  const goals = useMemo(
    () => (Array.isArray(goalsData) ? goalsData : []),
    [goalsData],
  );

  // The footer badge reports the reschedule flag; it must not claim "active"
  // while the flag is off or unreadable.
  const {
    data: automationFlags,
    isLoading: flagsLoading,
    isError: flagsError,
  } = useGetAutomationFlags();
  const rescheduleEnabled = automationFlags?.flags?.find((f) => f.key === 'reschedule')?.enabled;
  const rescheduleLabel = flagsLoading
    ? 'Reschedule status checking…'
    : flagsError || rescheduleEnabled == null
      ? 'Reschedule status unknown'
      : rescheduleEnabled
        ? '9-Rule auto-reschedule on'
        : 'Auto-reschedule paused';

  // Pending reschedule proposals query
  const { data: proposalsData } = useListRescheduleProposals({
    query: { queryKey: getListRescheduleProposalsQueryKey() },
  });
  const pendingProposals = useMemo(
    () => (Array.isArray(proposalsData) ? proposalsData.filter((p) => p.status === 'pending') : []),
    [proposalsData],
  );

  // Determine top Next Up task: first incomplete task for today
  const nextUpTask: Task | null = useMemo(() => {
    return todayTasks.find((t) => t.status !== 'completed') || null;
  }, [todayTasks]);

  // Momentum metrics calculation
  const tasksCompleted = summary?.completed ?? momentum?.tasksCompleted ?? 0;
  const tasksTotal = summary?.total ?? momentum?.tasksTotal ?? 0;
  const roundsCompleted = momentum?.roundsCompleted ?? 0;
  const roundTarget = momentum?.roundTarget ?? 0;
  const streakDays = momentum?.streakDays ?? 0;
  const focusMinutes = summary?.focusMinutes ?? 0;
  const openTasks = summary?.open ?? Math.max(0, tasksTotal - tasksCompleted);

  // Any failed core query means the dashboard cannot state facts about today.
  // Render a retry surface instead of zeros and "all clear" copy.
  const coreError = todayError || momentumError || summaryError;
  const metricsLoading = todayLoading || momentumLoading || summaryLoading;
  const refetchCore = () => {
    void refetchToday();
    void refetchMomentum();
    void refetchSummary();
    void refetchInbox();
  };

  return (
    <div className="space-y-6 pb-12 animate-enter">
      {/* Header with dynamic greeting and action toolbar */}
      <DashboardHeader />

      {coreError ? (
        <ErrorState onRetry={refetchCore} />
      ) : (
        <>
      {/* Pending Reschedule Alert (if engine proposed moves) */}
      {pendingProposals.length > 0 && (
        <aside
          role="status"
          aria-label="Pending Reschedule Proposals"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-status-warning/40 bg-status-warning/10 p-3.5 sm:p-4"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid size-8 place-items-center rounded-control bg-status-warning/20 text-status-warning-text shrink-0">
              <AlertCircle size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-callout font-bold text-foreground">
                {pendingProposals.length} reschedule proposal{pendingProposals.length === 1 ? '' : 's'} waiting for review
              </p>
              <p className="text-caption text-muted-foreground">
                Cadence proposed moves to preserve your focus commitments without silent rescheduling.
              </p>
            </div>
          </div>

          <Link
            href="/today"
            onClick={() => soundFX.playClick()}
            className="inline-flex tap-target-h items-center justify-center gap-1.5 rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground transition-colors hover:bg-muted active:scale-98 shrink-0 w-full sm:w-auto ml-0 sm:ml-3"
          >
            <span>Review on Today</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </aside>
      )}

      {/* Primary 2-Column Split: Momentum Rings vs Next Up Focus Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 flex flex-col">
          <MomentumCommandCard
            tasksCompleted={tasksCompleted}
            tasksTotal={tasksTotal}
            roundsCompleted={roundsCompleted}
            roundTarget={roundTarget}
            streakDays={streakDays}
            focusMinutes={focusMinutes}
            openTasks={openTasks}
            isLoading={metricsLoading}
          />
        </div>

        <div className="lg:col-span-5 flex flex-col">
          <NextUpFocusHero
            task={nextUpTask}
            isLoading={todayLoading}
            isError={todayError}
            onRetry={refetchToday}
          />
        </div>
      </div>

      {/* Secondary 3-Column Horizon: Inbox, Time Blocks, and Monthly Goals */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
        <InboxTriageCard
          inboxTasks={inboxTasks}
          isLoading={inboxLoading}
          isError={inboxError}
          onRetry={refetchInbox}
        />
        <ScheduleSnapshotCard
          blocks={blocks}
          isLoading={blocksLoading}
          isError={blocksError}
          onRetry={refetchBlocks}
        />
        <ActiveGoalsCard
          goals={goals}
          isLoading={goalsLoading}
          isError={goalsError}
          onRetry={refetchGoals}
        />
      </div>

      {/* System Invariant Transparency Badge */}
      <footer className="mt-6 sm:mt-8 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2.5 sm:gap-6 rounded-xl border border-border-control/40 bg-card/30 p-3.5 sm:p-4 text-center font-mono text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-status-success-text" aria-hidden="true" />
          Multi-user safe RLS isolation
        </span>
        <span className="hidden sm:inline text-border-control" aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles size={14} className="text-primary-text" aria-hidden="true" />
          {rescheduleLabel}
        </span>
        <span className="hidden sm:inline text-border-control" aria-hidden="true">·</span>
        <span>Strict streaks (no freeze)</span>
      </footer>
        </>
      )}
    </div>
  );
}
export default DashboardPage;
