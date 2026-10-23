import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Sparkles } from 'lucide-react';
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
  useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import { today } from '@/lib/date-utils';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { ErrorState } from '@/components/shared/StateViews';
import { RitualDialog } from '@/components/rituals/RitualDialog';
import { DashboardHeader } from './components/DashboardHeader';
import { FocusHorizonBar } from './components/FocusHorizonBar';
import { AttentionFlightStrip } from './components/AttentionFlightStrip';
import { CircadianRitualHero } from './components/CircadianRitualHero';
import { MomentumCommandCard } from './components/MomentumCommandCard';
import { InboxTriageCard } from './components/InboxTriageCard';
import { ScheduleSnapshotCard } from './components/ScheduleSnapshotCard';
import { ActiveGoalsCard } from './components/ActiveGoalsCard';

function getCurrentMonthString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const updateTask = useUpdateTask();
  const [ritualType, setRitualType] = useState<'morning' | 'evening' | null>(null);
  const userTz = useUserTimezone();
  const todayDate = useMemo(() => today(userTz), [userTz]);
  const month = useMemo(() => getCurrentMonthString(), []);

  const handleUpdateTask = (
    taskId: number,
    updates: { dueAt?: string | null; status?: 'inbox' | 'open' },
  ) => {
    updateTask.mutate(
      { id: taskId, data: updates },
      {
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey() });
        },
      },
    );
  };

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

  // Automation flags query
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
      {/* Header with dynamic greeting, time context and ritual triggers */}
      <DashboardHeader onOpenRitual={setRitualType} />

      {coreError ? (
        <ErrorState onRetry={refetchCore} />
      ) : (
        <>
          {/* Focus Horizon Day Timeline Scrub Bar */}
          <FocusHorizonBar blocks={blocks} userTimezone={userTz} />

          {/* Autonomous Flight Strip (Proposals, Overdue Backlog, Kill Switch) */}
          <AttentionFlightStrip
            pendingProposals={pendingProposals}
            reschedulePaused={rescheduleEnabled === false}
          />

          {/* Primary Command Split (8 cols Action Hero vs 4 cols Momentum Rings on desktop) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Action Hero Slot: Circadian Ritual Hero & Next Up Priority */}
            <div className="lg:col-span-8 flex flex-col order-1">
              <CircadianRitualHero
                task={nextUpTask}
                tasksCompleted={tasksCompleted}
                tasksTotal={tasksTotal}
                streakDays={streakDays}
                focusMinutes={focusMinutes}
                isLoading={todayLoading}
                isError={todayError}
                onRetry={refetchToday}
                onOpenRitual={setRitualType}
              />
            </div>

            {/* Momentum & Rings Slot */}
            <div className="lg:col-span-4 flex flex-col order-2">
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
          </div>

          {/* Secondary 3-Column Horizon Bento: Micro-Triage, Dynamic Blocks, Monthly Goals */}
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

          {/* Guided Ritual Modal when triggered */}
          {ritualType && (
            <RitualDialog
              type={ritualType}
              tasks={todayTasks}
              tasksLoading={todayLoading}
              tasksError={todayError}
              onRetryTasks={() => void refetchToday()}
              onClose={() => setRitualType(null)}
              onUpdateTask={handleUpdateTask}
            />
          )}
        </>
      )}
    </div>
  );
}

export default DashboardPage;
