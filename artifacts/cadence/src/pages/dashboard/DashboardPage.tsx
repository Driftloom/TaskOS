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
  type Task,
} from '@workspace/api-client-react';
import { today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
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
  const todayDate = useMemo(() => today(), []);
  const userTz = useMemo(() => timezone(), []);
  const month = useMemo(() => getCurrentMonthString(), []);

  // Today's tasks query
  const todayParams = useMemo(
    () => ({ date: todayDate, scope: 'today' as const, timezone: userTz }),
    [todayDate, userTz],
  );
  const { data: todayTasksData } = useListTasks(todayParams, {
    query: { queryKey: getListTasksQueryKey(todayParams) },
  });
  const todayTasks = useMemo(
    () => (Array.isArray(todayTasksData) ? todayTasksData : []),
    [todayTasksData],
  );

  // Inbox tasks query
  const inboxParams = useMemo(() => ({ scope: 'inbox' as const }), []);
  const { data: inboxTasksData, isLoading: inboxLoading } = useListTasks(inboxParams, {
    query: { queryKey: getListTasksQueryKey(inboxParams) },
  });
  const inboxTasks = useMemo(
    () => (Array.isArray(inboxTasksData) ? inboxTasksData : []),
    [inboxTasksData],
  );

  // Momentum query
  const momentumParams = useMemo(() => ({ date: todayDate, timezone: userTz }), [todayDate, userTz]);
  const { data: momentum } = useGetMomentum(momentumParams, {
    query: { queryKey: getGetMomentumQueryKey(momentumParams) },
  });

  // Task summary query
  const summaryParams = useMemo(() => ({ date: todayDate, timezone: userTz }), [todayDate, userTz]);
  const { data: summary } = useGetTaskSummary(summaryParams, {
    query: { queryKey: getGetTaskSummaryQueryKey(summaryParams) },
  });

  // Time blocks query
  const blockParams = useMemo(() => ({ date: todayDate, timezone: userTz }), [todayDate, userTz]);
  const { data: blocksData, isLoading: blocksLoading } = useListBlocks(blockParams, {
    query: { queryKey: getListBlocksQueryKey(blockParams) },
  });
  const blocks = useMemo(
    () => (Array.isArray(blocksData) ? blocksData : []),
    [blocksData],
  );

  // Goals query
  const { data: goalsData, isLoading: goalsLoading } = useListGoals(
    { month },
    { query: { queryKey: getListGoalsQueryKey({ month }) } },
  );
  const goals = useMemo(
    () => (Array.isArray(goalsData) ? goalsData : []),
    [goalsData],
  );

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
  const roundTarget = momentum?.roundTarget ?? 4;
  const streakDays = momentum?.streakDays ?? 0;
  const focusMinutes = summary?.focusMinutes ?? 0;
  const openTasks = summary?.open ?? Math.max(0, tasksTotal - tasksCompleted);

  return (
    <div className="space-y-6 pb-12 animate-enter">
      {/* Header with dynamic greeting and action toolbar */}
      <DashboardHeader />

      {/* Pending Reschedule Alert (if engine proposed moves) */}
      {pendingProposals.length > 0 && (
        <aside
          role="status"
          aria-label="Pending Reschedule Proposals"
          className="flex items-center justify-between rounded-xl border border-status-warning/40 bg-status-warning/10 p-4"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-control bg-status-warning/20 text-status-warning-text shrink-0">
              <AlertCircle size={18} aria-hidden="true" />
            </span>
            <div>
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
            className="inline-flex tap-target-h items-center gap-1.5 rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground transition-colors hover:bg-muted active:scale-98 shrink-0 ml-3"
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
          />
        </div>

        <div className="lg:col-span-5 flex flex-col">
          <NextUpFocusHero task={nextUpTask} />
        </div>
      </div>

      {/* Secondary 3-Column Horizon: Inbox, Time Blocks, and Monthly Goals */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
        <InboxTriageCard inboxTasks={inboxTasks} isLoading={inboxLoading} />
        <ScheduleSnapshotCard blocks={blocks} isLoading={blocksLoading} />
        <ActiveGoalsCard goals={goals} isLoading={goalsLoading} />
      </div>

      {/* System Invariant Transparency Badge */}
      <footer className="mt-8 flex flex-wrap items-center justify-center gap-6 rounded-xl border border-border-control/40 bg-card/30 p-4 text-center font-mono text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-status-success-text" aria-hidden="true" />
          Multi-user safe RLS isolation
        </span>
        <span className="hidden sm:inline text-border-control" aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles size={14} className="text-primary-text" aria-hidden="true" />
          9-Rule auto-reschedule engine active
        </span>
        <span className="hidden sm:inline text-border-control" aria-hidden="true">·</span>
        <span>Strict streaks (no freeze)</span>
      </footer>
    </div>
  );
}
export default DashboardPage;
