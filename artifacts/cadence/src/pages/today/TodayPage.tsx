import { useMemo, useState } from 'react';
import {
  Plus,
  Sun,
  Search,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMomentumQueryKey,
  getGetTaskSummaryQueryKey,
  getListTasksQueryKey,
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
import { NextUpCard } from '@/components/task/CadenceDomain';
import { QuickCaptureForm } from '@/components/task/QuickCaptureSheet';
import { TaskEditor } from '@/components/task/TaskEditor';
import { RitualDialog } from '@/components/rituals/RitualDialog';
import { RescheduleProposals } from '@/components/task/RescheduleProposals';
import { AgentPanel } from '@/components/agent/AgentPanel';

export function TodayPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Task | null>(null);
  const [ritualType, setRitualType] = useState<'morning' | 'evening' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setLocation] = useLocation();
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
        title="Make room for the day."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('morning');
              }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border-control bg-card/[0.03] hover:bg-card/[0.06] hover:border-border-control4] text-xs font-medium text-foreground hover:text-foreground transition-all active:scale-[0.98] tap-target-expand"
              title="Plan My Day Ritual"
            >
              <Sun className="size-3.5 text-primary-text" />
              <span className="hidden sm:inline">Plan Day</span>
            </button>

            <button
              onClick={() => {
                soundFX.playClick();
                setEditing({} as Task);
              }}
              data-testid="button-add-task"
              className="hidden h-8 items-center gap-1.5 rounded-lg border border-border-control bg-card/[0.03] hover:bg-card/[0.06] hover:border-border-control4] px-3 text-xs font-medium text-foreground hover:text-foreground transition-all sm:flex active:scale-[0.98] tap-target-expand"
            >
              <Plus size={14} className="text-muted-foreground" />
              <span>Add task</span>
            </button>
          </div>
        }
      />

      {/* P14.2 order: 1 Start (dominant), 2 rings, 3 timeline, 4 attention, 5 quiet footer.
          P3 "Start-first": the core failure is *starting*, so Start is the first
          thing on the page and the most prominent element, not an aside. */}
      <div className="mb-4">
        <NextUpCard
          task={
            next
              ? {
                  id: String(next.id),
                  title: next.title,
                  durationMin: next.durationMin,
                }
              : null
          }
          onStart={() => {
            soundFX.playFocusStart();
            setLocation('/focus');
          }}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        {/* Main Column */}
        <div className="min-w-0 space-y-3.5">
          {/* P14.2 section 4: attention items -- needs-attention tasks, pending proposals, */}
          <RescheduleProposals tasks={taskList} />

          {/* Quick capture — P11.1. Today deliberately keeps the PERSISTENT
              INLINE form (P1 locked decision: capture is the most important
              action after Start). The logic, chips and states live in
              QuickCaptureSheet.tsx so a sheet wrapper can reuse them; only the
              presentation differs by `variant`. */}
          <QuickCaptureForm
            variant="inline"
            showShortcutHint
            testId="form-quick-capture"
            inputTestId="input-quick-capture"
          />

          {/* Search & Filter Bar */}
          {taskList.length > 2 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted border border-border-control text-xs text-muted-foreground">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Filter tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                </button>
              )}
            </div>
          )}

          {/* Section Subheader */}
          <div className="flex items-center justify-between pt-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span>Tasks</span>
              {searchQuery && (
                <span className="text-xs text-accent lowercase font-normal">
                  ({filteredTasks.length} matching)
                </span>
              )}
            </h2>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {summaryLoading ? '...' : plural(summary?.open ?? 0, 'open')}
            </span>
          </div>

          {/* Task List or States */}
          {isLoading ? (
            <SkeletonList />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : filteredTasks.length === 0 ? (
            searchQuery ? (
              <div className="text-center py-10 text-xs text-muted-foreground bg-muted rounded-xl border border-border-control">
                No tasks match "{searchQuery}"
              </div>
            ) : (
              <EmptyState onAction={() => setEditing({} as Task)} />
            )
          ) : (
            <div className="space-y-2">
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

          {/* Conversational agent: chat, action log, and "undo last action".
              Locked decision D-26 requires the agent to be able to change
              work only reversibly and visibly. */}
          <AgentPanel tasks={taskList} />
        </div>

        {/* Aside Column — Momentum (P14.2 §2 rings, moved here now that Start owns the top) */}
        <aside className="space-y-3.5">
          {/* Activity Rings Momentum Card */}
          <div
            className="card-enterprise rounded-xl border border-border-control bg-card p-4 shadow-xl"
            data-testid="card-momentum"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground font-bold">
                Momentum
              </span>
              <Link
                href="/review"
                onClick={() => soundFX.playClick()}
                className="text-xs text-primary-text font-medium hover:underline"
              >
                Review --&gt;
              </Link>
            </div>

            <div className="flex items-center justify-center py-1">
              <ActivityRings
                tasksCompleted={momentum?.tasksCompleted ?? summary?.completed ?? 0}
                tasksTotal={momentum?.tasksTotal ?? summary?.total ?? 0}
                roundsCompleted={momentum?.roundsCompleted ?? 0}
                roundTarget={momentum?.roundTarget ?? 4}
                streakDays={momentum?.streakDays ?? 0}
                size={144}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-control pt-3 text-center text-xs">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Done
                </span>
                <p className="font-mono text-base font-bold text-primary-text">
                  {summary?.completed ?? 0}
                </p>
              </div>
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Focus
                </span>
                <p className="font-mono text-base font-bold text-success">
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
