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
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListTasksQueryKey,
  getGetTaskSummaryQueryKey,
  useGetTaskSummary,
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
import { toast } from 'sonner';

export function ReviewPage() {
  const queryClient = useQueryClient();
  const [ritualType, setRitualType] = useState<'morning' | 'evening' | null>(null);
  const [viewScope, setViewScope] = useState<'today' | 'archive'>('today');

  const summaryParams = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: summary, isLoading, isError, refetch } = useGetTaskSummary(summaryParams);

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
    <div className="animate-enter space-y-6">
      <SectionHeading
        eyebrow="Review"
        title="Notice what moved."
        detail="A calm, honest view of today's work based on what actually happened."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('morning');
              }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14] text-xs font-medium text-zinc-300 hover:text-white transition-all active:scale-[0.98]"
            >
              <Sun className="size-3.5 text-[#0A84FF]" />
              <span>Plan Day</span>
            </button>
            <button
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('evening');
              }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14] text-xs font-medium text-zinc-300 hover:text-white transition-all active:scale-[0.98]"
            >
              <Moon className="size-3.5 text-[#30D158]" />
              <span>Close Day</span>
            </button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="h-52 animate-pulse rounded-xl bg-white/[0.02] border border-white/[0.06]" />
          <div className="h-52 animate-pulse rounded-xl bg-white/[0.02] border border-white/[0.06]" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          {/* Top Cards Grid */}
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            {/* Progress Card */}
            <div className="card-enterprise rounded-xl border border-white/[0.08] bg-[#121214] p-5 sm:p-6 shadow-xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400 font-semibold">
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
                  <p className="text-3xl font-extrabold tracking-tight text-white font-mono">
                    {summary?.completed ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    of {summary?.total ?? 0} tasks finished
                  </p>
                </div>
              </div>

              <div className="mt-6 border-t border-white/[0.06] pt-4">
                <p className="text-xs leading-relaxed text-zinc-400">
                  {summary?.completed
                    ? `You moved ${plural(summary.completed, 'task', '')} forward today. Real focus creates durable momentum.`
                    : 'The day is open. One clear, finished item is enough to begin.'}
                </p>
              </div>
            </div>

            {/* The Completed Ledger Card */}
            <div className="card-enterprise rounded-xl border border-white/[0.08] bg-[#121214] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      The Ledger
                    </p>
                    <div className="flex rounded-lg bg-[#262628] p-0.5 text-[10px]">
                      <button
                        onClick={() => {
                          soundFX.playTactileClick();
                          setViewScope('today');
                        }}
                        className={`px-2 py-0.5 rounded-md font-semibold ${
                          viewScope === 'today'
                            ? 'bg-[#1C1C1E] text-foreground shadow-sm'
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
                        className={`px-2 py-0.5 rounded-md font-semibold ${
                          viewScope === 'archive'
                            ? 'bg-[#1C1C1E] text-foreground shadow-sm'
                            : 'text-muted-foreground'
                        }`}
                      >
                        Archive (7d)
                      </button>
                    </div>
                  </div>

                  <span className="font-mono text-xs text-primary font-bold">
                    {summary?.focusMinutes ?? 0} min focused
                  </span>
                </div>

                <div className="mt-5 space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {completedTasks.length > 0 ? (
                    completedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3 text-sm hover:bg-white/[0.06] transition-colors"
                        data-testid={`review-task-${task.id}`}
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#30D158]/20 text-[#30D158]">
                          <Check size={13} strokeWidth={3} />
                        </span>
                        <span className="truncate font-semibold text-foreground text-xs sm:text-sm">
                          {task.title}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                          {task.durationMin}m
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/[0.08] p-8 text-center text-xs text-muted-foreground">
                      Completed tasks will settle here as you finish them.
                    </div>
                  )}
                </div>
              </div>
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
              className="text-left w-full card-enterprise rounded-xl border border-white/[0.08] bg-[#121214] p-4 sm:p-5 hover:border-[#0A84FF]/40 transition-all cursor-pointer shadow-lg group relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/60"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#0A84FF]">
                  <Sun size={15} />
                  <span className="font-mono text-[10px] uppercase tracking-wider font-bold">
                    Morning Ritual
                  </span>
                </div>
                <span className="text-xs text-zinc-400 group-hover:text-[#0A84FF] flex items-center gap-1 font-medium">
                  Start Plan <ArrowRight size={12} />
                </span>
              </div>

              <div className="mt-2.5 text-sm font-bold text-white">Give the day a shape</div>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Pick your primary #1 focus outcome. Align on time blocks and set intentions before the rush begins.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-mono text-zinc-500 pt-2.5 border-t border-white/[0.06]">
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
              className="text-left w-full card-enterprise rounded-xl border border-white/[0.08] bg-[#121214] p-4 sm:p-5 hover:border-[#30D158]/40 transition-all cursor-pointer shadow-lg group relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30D158]/60"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#30D158]">
                  <Moon size={15} />
                  <span className="font-mono text-[10px] uppercase tracking-wider font-bold">
                    Evening Ritual
                  </span>
                </div>
                <span className="text-xs text-zinc-400 group-hover:text-[#30D158] flex items-center gap-1 font-medium">
                  Close Day <ArrowRight size={12} />
                </span>
              </div>

              <div className="mt-2.5 text-sm font-bold text-white">Close the loop</div>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Check off what finished, roll over uncompleted items forward without guilt, and leave a clear slate for tomorrow.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-mono text-zinc-500 pt-2.5 border-t border-white/[0.06]">
                <span className="flex items-center gap-1">
                  <Flame size={12} className="text-[#FF9F0A]" />
                  <span>Streak preserved</span>
                </span>
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
    </div>
  );
}
export default ReviewPage;
