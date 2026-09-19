import { useMemo, useState } from 'react';
import { ArrowRight, Circle, Pencil, Trash2 } from 'lucide-react';
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

  return (
    <div className="animate-enter">
      <SectionHeading
        eyebrow="Inbox · loose threads"
        title="Give it a place."
        detail="Unscheduled captures waiting for a deliberate decision."
        action={
          <span className="rounded-full border border-white/[0.08] bg-[#1C1C1E] px-3.5 py-1.5 font-mono text-xs text-muted-foreground">
            {taskList.length} waiting
          </span>
        }
      />

      <div className="max-w-3xl">
        {isLoading ? (
          <SkeletonList />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : taskList.length === 0 ? (
          <EmptyState inbox />
        ) : (
          <div className="space-y-3">
            {taskList.map((task) => (
              <div
                key={task.id}
                className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-4 sm:p-5 transition-all hover:border-white/20"
                data-testid={`card-inbox-task-${task.id}`}
              >
                <div className="flex items-start gap-3.5">
                  <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground opacity-60" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground text-sm">{task.title}</p>
                    {task.notes && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {task.notes}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>{plural(task.durationMin, 'min', '')}</span>
                      <span>·</span>
                      <span>
                        Captured{' '}
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'short',
                          day: 'numeric',
                        }).format(new Date(task.createdAt))}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        soundFX.playClick();
                        setEditing(task);
                      }}
                      data-testid={`button-edit-inbox-${task.id}`}
                      className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                      aria-label={`Edit ${task.title}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(task)}
                      data-testid={`button-delete-inbox-${task.id}`}
                      className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
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
                    className="flex min-h-[38px] items-center gap-2 rounded-xl bg-primary/15 px-3.5 text-xs font-bold text-primary hover:bg-primary/25 transition-all active:scale-98"
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
