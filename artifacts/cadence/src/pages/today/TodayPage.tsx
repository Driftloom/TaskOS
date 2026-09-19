import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Clock3, MoreHorizontal, Plus } from 'lucide-react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMomentumQueryKey,
  getGetTaskSummaryQueryKey,
  getListTasksQueryKey,
  useCreateTask,
  useGetMomentum,
  useGetTaskSummary,
  useListTasks,
  type Task,
} from '@workspace/api-client-react';
import { dateLabel, plural, today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { ActivityRings, ProgressRing } from '@/components/shared/ActivityRings';
import { EmptyState, ErrorState, SectionHeading, SkeletonList } from '@/components/shared/StateViews';
import { TaskRow } from '@/components/task/TaskRow';
import { TaskEditor } from '@/components/task/TaskEditor';

export function TodayPage() {
  const queryClient = useQueryClient();
  const [capture, setCapture] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);

  const params = useMemo(
    () => ({ date: today(), scope: 'today' as const, timezone: timezone() }),
    [],
  );
  const { data: tasks, isLoading, isError, refetch } = useListTasks(params, {
    query: { queryKey: getListTasksQueryKey(params) },
  });

  const summaryParams = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: summary, isLoading: summaryLoading } = useGetTaskSummary(summaryParams, {
    query: { queryKey: getGetTaskSummaryQueryKey(summaryParams) },
  });

  const momentumParams = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: momentum } = useGetMomentum(momentumParams, {
    query: { queryKey: getGetMomentumQueryKey(momentumParams) },
  });

  const create = useCreateTask();
  const taskList = tasks ?? [];
  const next = taskList.find((task) => task.status !== 'completed');

  const submitCapture = (event: FormEvent) => {
    event.preventDefault();
    if (!capture.trim()) return;

    soundFX.playClick();
    create.mutate(
      {
        data: {
          title: capture.trim(),
          status: 'open',
          priority: 'medium',
          durationMin: 30,
          dueAt: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          setCapture('');
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(summaryParams) });
        },
      },
    );
  };

  return (
    <div className="animate-enter">
      <SectionHeading
        eyebrow="Today · ready when you are"
        title="Make room for the day."
        detail={dateLabel()}
        action={
          <button
            onClick={() => {
              soundFX.playClick();
              setEditing({} as Task);
            }}
            data-testid="button-add-task"
            className="hidden min-h-[44px] items-center gap-2 rounded-xl border border-white/[0.1] bg-[#1C1C1E] px-4 text-sm font-bold text-foreground hover:border-primary/50 hover:bg-white/[0.06] transition-all sm:flex"
          >
            <Plus size={16} />
            <span>Add task</span>
          </button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        {/* Main Column */}
        <div className="min-w-0">
          {/* Quick Capture Input */}
          <form
            onSubmit={submitCapture}
            className="mb-6 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] p-3 shadow-[0_8px_30px_rgba(255,159,10,0.06)] transition-all focus-within:border-primary/60"
            data-testid="form-quick-capture"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Plus size={18} strokeWidth={2.5} />
            </div>
            <input
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              placeholder="Capture a task and press Enter (or press 'N')..."
              data-testid="input-quick-capture"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/60 text-foreground"
            />
            <button
              type="submit"
              disabled={!capture.trim() || create.isPending}
              data-testid="button-submit-capture"
              className="hidden min-h-[36px] items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow transition-all hover:brightness-110 disabled:opacity-40 sm:flex"
            >
              <span>Add</span>
              <ArrowRight size={13} />
            </button>
          </form>

          {/* Section Subheader */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold tracking-tight text-foreground">
              Today's shape
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {summaryLoading ? '—' : plural(summary?.open ?? 0, 'open')}
            </span>
          </div>

          {/* Task List or States */}
          {isLoading ? (
            <SkeletonList />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : taskList.length === 0 ? (
            <EmptyState onAction={() => setEditing({} as Task)} />
          ) : (
            <div className="space-y-2.5">
              {taskList.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onEdit={(t) => setEditing(t)}
                  onRefresh={() => refetch()}
                />
              ))}
            </div>
          )}
        </div>

        {/* Aside Sidebar */}
        <aside className="space-y-4">
          {/* Prominent "Next Up" Hero Start Card (Energy-not-pretending rule) */}
          <div
            className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-5 shadow-lg relative overflow-hidden"
            data-testid="card-next-task"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary font-bold">
                Next Up
              </span>
              <span className="size-2 rounded-full bg-primary animate-pulse" />
            </div>

            {next ? (
              <>
                <p className="text-base font-bold leading-snug tracking-tight text-foreground line-clamp-2">
                  {next.title}
                </p>
                <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/[0.08] text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground font-mono">
                    <Clock3 size={13} /> {next.durationMin} min
                  </span>
                  <Link
                    href="/focus"
                    onClick={() => soundFX.playClick()}
                    data-testid="link-start-focus"
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow transition-all hover:brightness-110 active:scale-95"
                  >
                    <span>Start focus</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Nothing queued right now. Add a task to give your next hour a focus target.
              </p>
            )}
          </div>

          {/* Activity Rings Momentum Card */}
          <div
            className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-5 shadow-lg"
            data-testid="card-momentum"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Momentum
              </p>
            </div>
            {momentum ? (
              <div className="flex items-center gap-5">
                <ActivityRings
                  tasksCompleted={momentum.tasksCompleted}
                  tasksTotal={momentum.tasksTotal}
                  roundsCompleted={momentum.roundsCompleted}
                  roundTarget={momentum.roundTarget}
                  streakDays={momentum.streakDays}
                  size={118}
                />
                <div className="space-y-1.5">
                  <div>
                    <p className="font-mono text-[10px] uppercase text-muted-foreground">Rounds</p>
                    <p className="text-lg font-extrabold tracking-tight text-foreground">
                      {momentum.roundsCompleted}
                      <span className="text-xs font-medium text-muted-foreground">
                        {' '}/ {momentum.roundTarget}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase text-muted-foreground">Tasks</p>
                    <p className="text-sm font-semibold text-foreground">
                      {momentum.tasksCompleted} / {momentum.tasksTotal} done
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-28 animate-pulse rounded-xl bg-white/[0.04]" />
            )}
          </div>

          {/* Progress Card */}
          <div
            className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-5 shadow-lg"
            data-testid="card-progress"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Progress
              </p>
              <MoreHorizontal size={16} className="text-muted-foreground opacity-60" />
            </div>
            <div className="flex items-center gap-5">
              <ProgressRing
                completed={summary?.completed ?? 0}
                total={summary?.total ?? taskList.length}
                size={110}
              />
              <div>
                <p className="font-mono text-[10px] uppercase text-muted-foreground">Completed</p>
                <p className="text-xl font-extrabold tracking-tight text-foreground">
                  {summary?.completed ?? 0}
                  <span className="text-xs font-medium text-muted-foreground">
                    {' '}/ {summary?.total ?? taskList.length}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Open</p>
                <p className="mt-0.5 text-base font-bold text-foreground">{summary?.open ?? 0}</p>
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Focus Time</p>
                <p className="mt-0.5 text-base font-bold text-foreground">
                  {summary?.focusMinutes ?? 0}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">min</span>
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Task Editor Dialog */}
      {editing && (
        <TaskEditor
          task={editing.id ? editing : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
