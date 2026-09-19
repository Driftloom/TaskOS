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
      scope: viewScope === 'today' ? ('today' as const) : undefined,
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
        eyebrow="Review · close the loop"
        title="Notice what moved."
        detail="A calm, honest view of today's work based on what actually happened."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('morning');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF9F0A]/15 text-[#FF9F0A] border border-[#FF9F0A]/30 text-xs font-bold hover:bg-[#FF9F0A]/25 transition-all active:scale-95"
            >
              <Sun className="size-3.5" />
              Plan Day
            </button>
            <button
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('evening');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#30D158]/15 text-[#30D158] border border-[#30D158]/30 text-xs font-bold hover:bg-[#30D158]/25 transition-all active:scale-95"
            >
              <Moon className="size-3.5" />
              Close Day
            </button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="h-56 animate-pulse rounded-3xl bg-[#1C1C1E]" />
          <div className="h-56 animate-pulse rounded-3xl bg-[#1C1C1E]" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          {/* Top Cards Grid */}
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            {/* Progress Card */}
            <div className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Today's Progress
              </p>

              <div className="mt-8 flex items-center gap-6">
                <ProgressRing
                  completed={summary?.completed ?? 0}
                  total={summary?.total ?? 0}
                  size={132}
                  strokeWidth={9}
                />
                <div>
                  <p className="text-4xl font-extrabold tracking-tight text-foreground">
                    {summary?.completed ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    of {summary?.total ?? 0} tasks finished
                  </p>
                </div>
              </div>

              <div className="mt-8 border-t border-white/[0.08] pt-5">
                <p className="text-xs leading-5 text-muted-foreground">
                  {summary?.completed
                    ? `You moved ${plural(summary.completed, 'task', '')} forward today. Real focus creates durable momentum.`
                    : 'The day is open. One clear, finished item is enough to begin.'}
                </p>
              </div>
            </div>

            {/* The Completed Ledger Card */}
            <div className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl flex flex-col justify-between">
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
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Morning Plan Ritual Card */}
            <div
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('morning');
              }}
              className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 hover:border-[#FF9F0A]/50 transition-all cursor-pointer shadow-lg group relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#FF9F0A]">
                  <Sun size={17} />
                  <span className="font-mono text-[10px] uppercase tracking-wider font-bold">
                    Morning Ritual
                  </span>
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-[#FF9F0A] flex items-center gap-1 font-bold">
                  Start Plan <ArrowRight size={13} />
                </span>
              </div>

              <h3 className="mt-3 text-base font-bold text-foreground">Give the day a shape</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-5">
                Pick your primary #1 focus outcome. Align on time blocks and set intentions before the rush begins.
              </p>
              <div className="mt-4 flex items-center justify-between text-xs font-mono text-muted-foreground pt-3 border-t border-white/[0.06]">
                <span>{openTasks.length} tasks open in Today</span>
              </div>
            </div>

            {/* Evening Close Ritual Card */}
            <div
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('evening');
              }}
              className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 hover:border-[#30D158]/50 transition-all cursor-pointer shadow-lg group relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#30D158]">
                  <Moon size={17} />
                  <span className="font-mono text-[10px] uppercase tracking-wider font-bold">
                    Evening Ritual
                  </span>
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-[#30D158] flex items-center gap-1 font-bold">
                  Close Day <ArrowRight size={13} />
                </span>
              </div>

              <h3 className="mt-3 text-base font-bold text-foreground">Close the loop</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-5">
                Check off what finished, roll over uncompleted items forward without guilt, and leave a clear slate for tomorrow.
              </p>
              <div className="mt-4 flex items-center justify-between text-xs font-mono text-muted-foreground pt-3 border-t border-white/[0.06]">
                <span className="flex items-center gap-1">
                  <Flame size={13} className="text-[#FF9F0A]" />
                  <span>Streak preserved</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

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
