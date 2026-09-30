import { useState } from 'react';
import {
  Check,
  Clock3,
  CornerDownRight,
  Pencil,
  Tag as TagIcon,
  Trash2,
  Flame,
  CircleDot,
  Minus,
  GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListTasksQueryKey,
  getGetTaskSummaryQueryKey,
  useCreateTask,
  useDeleteTask,
  useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import { plural, shortTime, today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';

interface TaskRowProps {
  task: Task;
  onEdit: (task: Task) => void;
  onRefresh?: () => void;
  onDragStart?: (task: Task) => void;
}

export function TaskRow({ task, onEdit, onRefresh, onDragStart }: TaskRowProps) {
  const queryClient = useQueryClient();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const create = useCreateTask();
  const [deleting, setDeleting] = useState(false);

  const completed = task.status === 'completed';

  const toggle = () => {
    const nextStatus = completed ? 'open' : 'completed';
    if (nextStatus === 'completed') {
      soundFX.playCompletion();
    } else {
      soundFX.playClick();
    }

    update.mutate(
      { id: task.id, data: { status: nextStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }),
          });
          onRefresh?.();
        },
      },
    );
  };

  const handleDelete = () => {
    soundFX.playClick();
    setDeleting(true);

    // Capture task copy for undo
    const backup = { ...task };

    remove.mutate(
      { id: task.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }),
          });
          onRefresh?.();

          // Show undoable toast
          toast('Task deleted', {
            description: `"${task.title}" was removed.`,
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
                      status: backup.status === 'inbox' ? 'inbox' : 'open',
                      dueAt: backup.dueAt,
                      projectId: backup.projectId,
                      parentId: backup.parentId,
                      ...(backup.tags?.length ? { tagIds: backup.tags.map((t) => t.id) } : {}),
                    },
                  },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
                      queryClient.invalidateQueries({
                        queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }),
                      });
                      toast.success('Task restored');
                    },
                  },
                );
              },
            },
          });
        },
        onSettled: () => setDeleting(false),
      },
    );
  };

  const formattedTags = (task.tags ?? [])
    .map((t) => (typeof t === 'string' ? t : (t as { name?: string })?.name))
    .filter(Boolean)
    .join(', ');

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart ? () => onDragStart(task) : undefined}
      className={`card-enterprise group relative flex min-h-[54px] items-center gap-2.5 rounded-xl border border-white/[0.06] bg-card px-3 py-2 transition-all hover:border-white/[0.14] hover:bg-muted ${
        completed ? 'opacity-60' : ''
      }`}
      data-testid={`row-task-${task.id}`}
    >
      {/* Drag grip affordance */}
      <div
        className="hidden sm:grid size-5 place-items-center cursor-grab text-white/15 group-hover:text-white/40 active:cursor-grabbing shrink-0 transition-colors"
        aria-hidden="true"
        title="Drag to reorder"
      >
        <GripVertical size={13} />
      </div>

      {/* Things 3 Circular Checkbox with 44px HIG Touch Target */}
      <button
        onClick={toggle}
        disabled={update.isPending}
        data-testid={`button-complete-task-${task.id}`}
        aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className="relative -m-2.5 flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <span
          className={`grid size-5 place-items-center rounded-full border transition-all ${
            completed
              ? 'border-success bg-success text-black animate-check-pop shadow-[0_0_8px_rgba(48,209,88,0.3)]'
              : 'border-white/25 bg-white/[0.02] text-transparent hover:border-white/50 hover:bg-white/[0.06] active:scale-90'
          }`}
        >
          <Check size={11} strokeWidth={3} />
        </span>
      </button>

      {/* Task Content Button (Opens Editor) */}
      <button
        onClick={() => {
          soundFX.playClick();
          onEdit(task);
        }}
        data-testid={`button-edit-task-${task.id}`}
        className="min-w-0 flex-1 text-left py-0.5"
      >
        <div className="flex items-center gap-1.5">
          {task.parentId && (
            <CornerDownRight size={12} className="text-zinc-500 shrink-0" />
          )}
          <span
            className={`block truncate text-[13px] font-medium tracking-tight text-zinc-100 transition-all ${
              completed ? 'line-through text-zinc-500' : ''
            }`}
          >
            {task.title}
          </span>
        </div>

        {/* Metadata Badges & Tags */}
        <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-400">
          {task.dueAt && (
            <span className="flex items-center gap-1 text-primary font-medium">
              <Clock3 size={10} /> {shortTime(task.dueAt)}
            </span>
          )}

          {/* Colorblind-Safe Priority Pairing (Icon + Shape + Text) */}
          <span className="flex items-center gap-1">
            {task.priority === 'high' ? (
              <span className="flex items-center gap-0.5 text-primary font-semibold">
                <Flame size={10} className="text-primary" />
                <span>high</span>
              </span>
            ) : task.priority === 'medium' ? (
              <span className="flex items-center gap-0.5 text-accent font-medium">
                <CircleDot size={10} className="text-accent" />
                <span>med</span>
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-zinc-500">
                <Minus size={10} />
                <span>low</span>
              </span>
            )}
          </span>

          {/* Duration */}
          <span className="text-zinc-600">Ã‚Â·</span>
          <span>{plural(task.durationMin, 'min', '')}</span>

          {/* Tags */}
          {formattedTags && (
            <>
              <span className="text-zinc-600">Ã‚Â·</span>
              <div className="flex items-center gap-1 text-zinc-400">
                <TagIcon size={9} className="text-zinc-500" />
                <span>{formattedTags}</span>
              </div>
            </>
          )}
        </div>
      </button>

      {/* Accessible Action Bar */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => {
            soundFX.playClick();
            onEdit(task);
          }}
          data-testid={`button-pencil-task-${task.id}`}
          className="grid size-8 place-items-center rounded-lg text-zinc-500 transition-all hover:bg-white/[0.06] hover:text-zinc-200 active:scale-95 sm:size-7 tap-target-expand"
          aria-label={`Edit ${task.title}`}
        >
          <Pencil size={13} />
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          data-testid={`button-delete-task-${task.id}`}
          className="grid size-8 place-items-center rounded-lg text-zinc-500 transition-all hover:bg-destructive/15 hover:text-destructive active:scale-95 sm:size-7 tap-target-expand"
          aria-label={`Delete ${task.title}`}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
