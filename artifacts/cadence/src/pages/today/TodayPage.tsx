import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Clock3,
  MoreHorizontal,
  Plus,
  Sun,
  Moon,
  Search,
  Flame,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
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
  useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import { dateLabel, plural, today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { ActivityRings, ProgressRing } from '@/components/shared/ActivityRings';
import { EmptyState, ErrorState, SectionHeading, SkeletonList } from '@/components/shared/StateViews';
import { TaskRow } from '@/components/task/TaskRow';
import { TaskEditor } from '@/components/task/TaskEditor';
import { RitualDialog } from '@/components/rituals/RitualDialog';

export function TodayPage() {
  const queryClient = useQueryClient();
  const [capture, setCapture] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [ritualType, setRitualType] = useState<'morning' | 'evening' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customNextUpId, setCustomNextUpId] = useState<number | null>(null);

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
  const updateTask = useUpdateTask();
  const taskList = tasks ?? [];

  // Designated Next Up: explicit user choice or first incomplete task
  const next = useMemo(() => {
    if (customNextUpId) {
      const found = taskList.find((t) => t.id === customNextUpId && t.status !== 'completed');
      if (found) return found;
    }
    return taskList.find((task) => task.status !== 'completed');
  }, [taskList, customNextUpId]);

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return taskList;
    const q = searchQuery.toLowerCase();
    return taskList.filter((t) => t.title.toLowerCase().includes(q));
  }, [taskList, searchQuery]);

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
          queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey(momentumParams) });
        },
      },
    );
  };

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
          queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey(momentumParams) });
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('morning');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30 text-xs font-bold hover:bg-[#0A84FF]/25 transition-all active:scale-95"
              title="Plan My Day Ritual"
            >
              <Sun className="size-3.5" />
              <span className="hidden sm:inline">Plan Day</span>
            </button>

            <button
              onClick={() => {
                soundFX.playClick();
                setEditing({} as Task);
              }}
              data-testid="button-add-task"
              className="hidden min-h-[40px] items-center gap-2 rounded-xl border border-white/[0.1] bg-[#1C1C1E] px-4 text-xs font-bold text-foreground hover:border-primary/50 hover:bg-white/[0.06] transition-all sm:flex"
            >
              <Plus size={15} />
              <span>Add task</span>
            </button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        {/* Main Column */}
        <div className="min-w-0 space-y-4">
          {/* Quick Capture Input */}
          <form
            onSubmit={submitCapture}
            className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] p-3 shadow-[0_8px_30px_rgba(10,132,255,0.06)] transition-all focus-within:border-primary/60"
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

          {/* Search & Filter Bar */}
          {taskList.length > 2 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1C1C1E] border border-white/[0.06] text-xs text-muted-foreground">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Filter today's tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-muted-foreground hover:text-foreground text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Section Subheader */}
          <div className="flex items-center justify-between pt-1">
            <h2 className="text-sm font-extrabold tracking-tight text-foreground flex items-center gap-2">
              <span>Today's shape</span>
              {searchQuery && (
                <span className="text-xs text-[#0A84FF] font-normal">
                  ({filteredTasks.length} matching)
                </span>
              )}
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
          ) : filteredTasks.length === 0 ? (
            searchQuery ? (
              <div className="text-center py-12 text-xs text-muted-foreground bg-[#1C1C1E] rounded-2xl border border-white/[0.06]">
                No tasks match "{searchQuery}"
              </div>
            ) : (
              <EmptyState onAction={() => setEditing({} as Task)} />
            )
          ) : (
            <div className="space-y-2.5">
              {filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onEdit={(t) => setEditing(t)}
                  onRefresh={() => {
                    refetch();
                    queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(summaryParams) });
                    queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey(momentumParams) });
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Aside Sidebar */}
        <aside className="space-y-4">
          {/* Prominent "Next Up" Hero Start Card (Energy-not-pretending rule) */}
          <div
            className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-5 sm:p-6 shadow-xl relative overflow-hidden"
            data-testid="card-next-task"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary font-bold flex items-center gap-1.5">
                <Flame className="size-3.5 text-[#FF9F0A]" />
                Next Up Priority
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
                    <Clock3 size={13} /> {next.durationMin || 25} min
                  </span>
                  <Link
                    href="/focus"
                    onClick={() => soundFX.playFocusStart()}
                    data-testid="link-start-focus"
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-extrabold text-primary-foreground shadow-lg transition-all hover:brightness-110 active:scale-95"
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
            className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-5 sm:p-6 shadow-xl"
            data-testid="card-momentum"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold">
                Momentum
              </span>
              <Link
                href="/review"
                onClick={() => soundFX.playClick()}
                className="text-xs text-primary font-semibold hover:underline"
              >
                Review →
              </Link>
            </div>

            <div className="flex items-center justify-center py-2">
              <ActivityRings
                tasksCompleted={momentum?.tasksCompleted ?? summary?.completed ?? 0}
                tasksTotal={momentum?.tasksTotal ?? summary?.total ?? 0}
                roundsCompleted={momentum?.roundsCompleted ?? 0}
                roundTarget={momentum?.roundTarget ?? 4}
                streakDays={momentum?.streakDays ?? 0}
                size={168}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-4 text-center text-xs">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Done
                </span>
                <p className="font-mono text-base font-bold text-primary">
                  {summary?.completed ?? 0}
                </p>
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Focus
                </span>
                <p className="font-mono text-base font-bold text-emerald-400">
                  {summary?.focusMinutes ?? 0}m
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Quick Task Editor Modal */}
      {editing && (
        <TaskEditor
          task={editing.id ? editing : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
            queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(summaryParams) });
            queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey(momentumParams) });
          }}
        />
      )}

      {/* Guided Ritual Modal */}
      {ritualType && (
        <RitualDialog
          type={ritualType}
          tasks={taskList}
          onClose={() => setRitualType(null)}
          onUpdateTask={handleUpdateTask}
          onSelectNextUp={(id) => setCustomNextUpId(id)}
        />
      )}
    </div>
  );
}
export default TodayPage;
