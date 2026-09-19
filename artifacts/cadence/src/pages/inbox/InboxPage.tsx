import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Circle,
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
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
            action: {
              label: 'Undo',
              onClick: () => {
                soundFX.playClick();
                create.mutate(
                  {
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
                  },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(params) });
                      toast.success('Task restored');
                    },
                  },
                );
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
          <span className="rounded-full border border-white/[0.08] bg-[#1C1C1E] px-3.5 py-1.5 font-mono text-xs text-muted-foreground font-semibold">
            {taskList.length} waiting
          </span>
        }
      />

      <div className="max-w-3xl space-y-4">
        {/* Search Filter */}
        {taskList.length > 2 && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1C1C1E] border border-white/[0.06] text-xs text-muted-foreground">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search unscheduled captures..."
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

        {isLoading ? (
          <SkeletonList />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : taskList.length === 0 ? (
          <EmptyState inbox />
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12 text-xs text-muted-foreground bg-[#1C1C1E] rounded-2xl border border-white/[0.06]">
            No captures match "{searchQuery}"
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-4 sm:p-5 transition-all hover:border-white/20 shadow-md"
                data-testid={`card-inbox-task-${task.id}`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="mt-0.5 shrink-0 text-muted-foreground">
                    {task.priority === 'high' ? (
                      <AlertTriangle className="size-4 text-[#FF453A]" />
                    ) : task.priority === 'medium' ? (
                      <Flame className="size-4 text-[#FF9F0A]" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground/60" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="font-bold text-foreground text-sm tracking-tight">{task.title}</p>
                    {task.notes && (
                      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {task.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap font-mono text-[10px] text-muted-foreground pt-1">
                      <span className="bg-[#262628] px-2 py-0.5 rounded-md text-foreground">
                        {plural(task.durationMin, 'min', '')}
                      </span>

                      {task.tags && task.tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          {task.tags.map((t) => (
                            <span
                              key={t.id}
                              className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-muted-foreground text-[10px]"
                            >
                              #{t.name}
                            </span>
                          ))}
                        </div>
                      )}

                      <span>•</span>
                      <span>
                        Captured{' '}
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'short',
                          day: 'numeric',
                        }).format(new Date(task.createdAt))}
                      </span>
                    </div>
                  </div>

                  {/* Actions (Accessible 44x44px targets) */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        soundFX.playClick();
                        setEditing(task);
                      }}
                      data-testid={`button-edit-inbox-${task.id}`}
                      className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                      aria-label={`Edit ${task.title}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(task)}
                      data-testid={`button-delete-inbox-${task.id}`}
                      className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                      aria-label={`Delete ${task.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex justify-end border-t border-white/[0.08] pt-3">
                  <button
                    onClick={() => handleScheduleForToday(task)}
                    disabled={update.isPending}
                    data-testid={`button-schedule-task-${task.id}`}
                    className="flex min-h-[40px] items-center gap-2 rounded-xl bg-primary/15 px-4 text-xs font-bold text-primary hover:bg-primary/25 transition-all active:scale-98"
                  >
                    <span>Schedule for today</span>
                    <ArrowRight size={14} />
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
