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
import { plural, today } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { EmptyState, ErrorState, SectionHeading, SkeletonList } from '@/components/shared/StateViews';
import { TaskEditor } from '@/components/task/TaskEditor';

export function InboxPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const params = useMemo(() => ({ scope: 'inbox' as const }), []);
  const { data: tasks, isLoading, isError, refetch } = useListTasks(params, {
    query: { queryKey: getListTasksQueryKey(params) },
  });

  const update = useUpdateTask();
  const remove = useDeleteTask();
  const create = useCreateTask();

  const handleScheduleForToday = (task: Task) => {
    soundFX.playCompletion();
    update.mutate(
      { id: task.id, data: { status: 'open', dueAt: new Date().toISOString() } },
      {
        onSuccess: () => {
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
    <div className="animate-enter space-y-5">
      <SectionHeading
        eyebrow="Inbox · loose threads"
        title="Give it a place."
        detail="Unscheduled captures waiting for a deliberate decision."
        action={
          <span className="rounded-full border border-border-control bg-card px-3.5 py-1.5 font-mono text-xs text-muted-foreground font-semibold">
            {taskList.length} waiting
          </span>
        }
      />

      <div className="max-w-3xl space-y-4">
        {/* Search Filter */}
        {taskList.length > 2 && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card border border-border-control text-xs text-muted-foreground">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search unscheduled captures..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              /* The focus ring is declared, not suppressed. index.css exempts
                 `bg-transparent` inputs from the global `input:focus-visible`
                 outline, so `outline-none` left this filter with no keyboard
                 focus indicator at all (SC 2.4.7). */
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {isLoading ? (
          <SkeletonList />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : taskList.length === 0 ? (
          <EmptyState inbox />
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12 text-xs text-muted-foreground bg-card rounded-2xl border border-border-control">
            No captures match "{searchQuery}"
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="card-enterprise rounded-xl border border-border-control bg-card p-3.5 transition-all hover:border-border-control4] hover:bg-muted shadow-sm"
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
                    <p className="font-semibold text-foreground text-sm tracking-tight">{task.title}</p>
                    {task.notes && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {task.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap font-mono text-xs text-muted-foreground pt-0.5">
                      <span className="bg-card/[0.04] border border-border-control px-1.5 py-0.2 rounded text-foreground">
                        {plural(task.durationMin, 'min', '')}
                      </span>

                      {task.tags && task.tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          {task.tags.map((t) => (
                            <span
                              key={t.id}
                              className="px-1.5 py-0.2 rounded bg-card/[0.04] text-muted-foreground text-xs"
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
                      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors"
                      aria-label={`Edit ${task.title}`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(task)}
                      data-testid={`button-delete-inbox-${task.id}`}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                      aria-label={`Delete ${task.title}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex justify-end border-t border-border-control pt-2">
                  <button
                    onClick={() => handleScheduleForToday(task)}
                    disabled={update.isPending}
                    data-testid={`button-schedule-task-${task.id}`}
                    className="flex h-7 items-center gap-1.5 rounded-lg border border-border-control bg-card/[0.03] hover:bg-card/[0.07] px-2.5 text-xs font-medium text-foreground hover:text-foreground transition-all active:scale-[0.98]"
                  >
                    <span>Schedule for today</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
