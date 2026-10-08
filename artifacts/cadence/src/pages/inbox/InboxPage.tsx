import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Circle,
  Pencil,
  Trash2,
  Search,
  CircleDot,
  Minus,
  Flame,
  Tag,
  Folder,
  Calendar,
  Sparkles,
  CheckCircle2,
  Clock,
  Target,
  X,
  Archive,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListTasksQueryKey,
  useCreateTask,
  useDeleteTask,
  useListTasks,
  useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import { plural, today, timezone } from '@/lib/date-utils';
import { recordActivity } from '@/lib/activity-history';
import { soundFX } from '@/lib/sound-fx';
import { EmptyState, ErrorState, SectionHeading, SkeletonList } from '@/components/shared/StateViews';
import { TaskEditor } from '@/components/task/TaskEditor';

export function InboxPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'inbox' | 'archived'>('inbox');

  const params = useMemo(() => ({ scope: activeTab as 'inbox' | 'archived' }), [activeTab]);
  const { data: tasks, isLoading, isError, refetch } = useListTasks(params, {
    query: { queryKey: getListTasksQueryKey(params) },
  });

  const update = useUpdateTask();
  const remove = useDeleteTask();
  const create = useCreateTask();

  const handleArchive = (task: Task) => {
    soundFX.playClick();
    update.mutate(
      { id: task.id, data: { status: 'archived' } },
      {
        onSuccess: () => {
          recordActivity({
            type: 'task_updated',
            title: task.title,
            description: 'Archived task from inbox',
          });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ scope: 'inbox' }) });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ scope: 'archived' }) });
          toast.success(`"${task.title}" archived`);
        },
      },
    );
  };

  const handleRestore = (task: Task, targetStatus: 'inbox' | 'open' = 'inbox') => {
    soundFX.playClick();
    update.mutate(
      { id: task.id, data: { status: targetStatus } },
      {
        onSuccess: () => {
          recordActivity({
            type: 'task_updated',
            title: task.title,
            description: `Restored task to ${targetStatus}`,
          });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ scope: 'inbox' }) });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ scope: 'archived' }) });
          queryClient.invalidateQueries({
            queryKey: getListTasksQueryKey({ date: today(), scope: 'today' }),
          });
          toast.success(`"${task.title}" restored`);
        },
      },
    );
  };

  const handleScheduleForToday = (task: Task) => {
    soundFX.playCompletion();
    update.mutate(
      { id: task.id, data: { status: 'open', dueText: 'today', timezone: timezone() } },
      {
        onSuccess: () => {
          recordActivity({
            type: 'task_created',
            title: task.title,
            description: 'Scheduled for today from Inbox',
          });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(params) });
          queryClient.invalidateQueries({
            queryKey: getListTasksQueryKey({ date: today(), scope: 'today' }),
          });
          toast.success(`"${task.title}" scheduled for today`);
        },
      },
    );
  };

  const handleDelete = (task: Task) => {
    soundFX.playClick();
    const backup = { ...task };

    remove.mutate(
      { id: task.id },
      {
        onSuccess: () => {
          recordActivity({
            type: 'task_deleted',
            title: task.title,
            description: 'Deleted from inbox',
          });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(params) });
          toast('Task deleted', {
            // 10s for a destructive action: sonner's 4s default leaves too little
            // time to notice the delete and find Undo. See the identical change in
            // components/task/TaskRow.tsx.
            duration: 10_000,
            action: {
              label: 'Undo',
              onClick: () => {
                soundFX.playClick();
                /* mutateAsync, not mutate with a per-call onSuccess -- see the
                   identical fix and rationale in components/task/TaskRow.tsx.
                   React Query v5 drops per-call callbacks once the component
                   unmounts, and InboxPage survives here only by luck; the same
                   shape in a row component is a silently broken undo. */
                create
                  .mutateAsync({
                    data: {
                      title: backup.title,
                      notes: backup.notes,
                      durationMin: backup.durationMin,
                      priority: backup.priority,
                      status: 'inbox',
                      dueAt: backup.dueAt,
                      projectId: backup.projectId,
                      parentId: backup.parentId,
                      ...(backup.tags?.length ? { tagIds: backup.tags.map((t) => t.id) } : {}),
                    },
                  })
                  .then(() => {
                    recordActivity({
                      type: 'task_created',
                      title: backup.title,
                      description: 'Restored deleted inbox task',
                    });
                    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(params) });
                    toast.success('Task restored');
                  })
                  .catch(() => {
                    toast.error('Could not restore that task', {
                      description: 'It is still deleted. Try capturing it again.',
                    });
                  });
              },
            },
          });
        },
      },
    );
  };

  const taskList = tasks ?? [];

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return taskList;
    const q = searchQuery.toLowerCase();
    return taskList.filter((t) => t.title.toLowerCase().includes(q));
  }, [taskList, searchQuery]);

  return (
    <div className="animate-enter space-y-5" data-testid="inbox-container">
      <SectionHeading
        eyebrow="Inbox · loose threads"
        title="Give it a place."
        detail="Unscheduled captures waiting for a deliberate decision."
        action={
          <span className="rounded-full border border-border-control bg-card px-3.5 py-1.5 font-mono text-caption text-muted-foreground font-semibold">
            {taskList.length} waiting
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-start">
        {/* Main Task Stream Column */}
        <div className="lg:col-span-8 xl:col-span-8 space-y-4 min-w-0">
          {/* View Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border-control w-fit text-caption font-medium">
            <button
              type="button"
              data-testid="tab-active-captures"
              onClick={() => setActiveTab('inbox')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'inbox'
                  ? 'bg-card text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Active Captures
            </button>
            <button
              type="button"
              data-testid="tab-archived-captures"
              onClick={() => setActiveTab('archived')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'archived'
                  ? 'bg-card text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Archived
            </button>
          </div>

          {/* Search Filter */}
          {taskList.length > 2 && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card border border-border-control text-caption text-muted-foreground">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search captures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                /* The focus ring is declared, not suppressed. index.css exempts
                   `bg-transparent` inputs from the global `input:focus-visible`
                   outline, so `outline-none` left this filter with no keyboard
                   focus indicator at all (SC 2.4.7). */
                className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="grid size-5 place-items-center rounded-md text-muted-foreground hover:bg-card/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary tap-target-expand shrink-0"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          <div className="calendar-cell">
            {isLoading ? (
              <SkeletonList />
            ) : isError ? (
              <ErrorState onRetry={() => refetch()} />
            ) : taskList.length === 0 ? (
              <EmptyState inbox />
            ) : filteredTasks.length === 0 ? (
              <div className="flex calendar-cell flex-col items-center justify-center text-center py-6 text-caption text-muted-foreground bg-card rounded-lg border border-border-control">
                No captures match "{searchQuery}"
              </div>
            ) : (
            <div className="space-y-2.5">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="card-enterprise row-density rounded-xl border border-border-control bg-card transition-all hover:border-border-control hover:bg-muted shadow-sm"
                  data-testid={`card-inbox-task-${task.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 text-muted-foreground">
                      {task.priority === 'high' ? (
                        <Flame className="size-3.5 text-primary-text" />
                      ) : task.priority === 'medium' ? (
                        <CircleDot className="size-3.5 text-accent" />
                      ) : (
                        <Minus className="size-3.5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-semibold text-foreground text-micro tracking-tight">{task.title}</p>
                      {task.notes && (
                        <p className="line-clamp-2 text-caption leading-relaxed text-muted-foreground">
                          {task.notes}
                        </p>
                      )}

                      <div className="flex items-center gap-2 flex-wrap font-mono text-caption text-muted-foreground pt-0.5">
                        <span className="bg-card/[0.04] border border-border-control px-1.5 py-0.2 rounded text-foreground">
                          {plural(task.durationMin, 'min', '')}
                        </span>

                        {task.tags && task.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            {task.tags.map((t) => (
                              <span
                                key={t.id}
                                className="px-1.5 py-0.2 rounded bg-card/[0.04] text-muted-foreground text-caption"
                              >
                                #{t.name}
                              </span>
                            ))}
                          </div>
                        )}

                        <span className="text-muted-foreground">•</span>
                        <span>
                          Captured{' '}
                          {new Intl.DateTimeFormat('en-US', {
                            month: 'short',
                            day: 'numeric',
                          }).format(new Date(task.createdAt))}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => {
                          soundFX.playClick();
                          setEditing(task);
                        }}
                        data-testid={`button-edit-inbox-${task.id}`}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors tap-target-expand"
                        aria-label={`Edit ${task.title}`}
                      >
                        <Pencil size={13} />
                      </button>
                      {activeTab === 'inbox' ? (
                        <button
                          onClick={() => handleArchive(task)}
                          data-testid={`button-archive-inbox-${task.id}`}
                          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors tap-target-expand"
                          aria-label={`Archive ${task.title}`}
                          title="Archive"
                        >
                          <Archive size={13} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRestore(task, 'inbox')}
                          data-testid={`button-restore-inbox-${task.id}`}
                          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors tap-target-expand"
                          aria-label={`Restore ${task.title}`}
                          title="Restore"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(task)}
                        data-testid={`button-delete-inbox-${task.id}`}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors tap-target-expand"
                        aria-label={`Delete ${task.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border-control pt-2">
                    {activeTab === 'archived' ? (
                      <span className="text-caption font-mono uppercase text-muted-foreground text-micro">Archived</span>
                    ) : <div />}
                    <div className="flex items-center gap-2">
                      {activeTab === 'archived' && (
                        <button
                          onClick={() => handleRestore(task, 'inbox')}
                          disabled={update.isPending}
                          data-testid={`button-restore-inbox-footer-${task.id}`}
                          className="flex h-7 items-center gap-1.5 rounded-lg border border-border-control bg-card/[0.03] hover:bg-card/[0.07] px-2.5 text-caption font-medium text-foreground hover:text-foreground transition-all active:scale-[0.98] tap-target-expand"
                        >
                          <RotateCcw size={12} />
                          <span>Restore</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleScheduleForToday(task)}
                        disabled={update.isPending}
                        data-testid={`button-schedule-task-${task.id}`}
                        className="flex h-7 items-center gap-1.5 rounded-lg border border-border-control bg-card/[0.03] hover:bg-card/[0.07] px-2.5 text-caption font-medium text-foreground hover:text-foreground transition-all active:scale-[0.98] tap-target-expand"
                      >
                        <span>Schedule for today</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>

        {/* Triage Discipline Sidebar (Visible on lg: screens) */}
        <aside className="hidden lg:block lg:col-span-4 xl:col-span-4 space-y-4 lg:sticky lg:top-20">
          <div className="card-enterprise rounded-lg border border-border-control bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-control">
              <span className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-semibold">
                Triage Discipline
              </span>
              <span className="font-mono text-caption font-bold text-primary-text">
                {taskList.length} in queue
              </span>
            </div>

            <div className="space-y-3 text-caption leading-relaxed text-muted-foreground">
              <div className="flex items-start gap-2.5">
                <Target size={14} className="text-primary-text shrink-0 mt-0.5" />
                <p>
                  <strong className="text-foreground">Schedule for today:</strong> Place an item directly into today's timeline if it must be done before you sleep.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock size={14} className="text-status-success-text shrink-0 mt-0.5" />
                <p>
                  <strong className="text-foreground">Assign duration:</strong> Give every capture a realistic time estimate so the reschedule engine can protect your quiet hours.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={14} className="text-accent shrink-0 mt-0.5" />
                <p>
                  <strong className="text-foreground">Aim for inbox zero:</strong> Keep this list under 10 loose threads so capture stays trusted and quick.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-border-control flex items-center justify-between text-caption font-mono text-muted-foreground">
              <span>Shortcut</span>
              <kbd className="px-1.5 py-0.5 rounded border border-border-control bg-muted text-foreground">
                N
              </kbd>
            </div>
          </div>
        </aside>
      </div>

      {editing && (
        <TaskEditor
          task={editing}
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
export default InboxPage;
