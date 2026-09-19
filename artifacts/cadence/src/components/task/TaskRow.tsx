import { useState } from 'react';
import {
  Check,
  Clock3,
  CornerDownRight,
  Pencil,
  Tag as TagIcon,
  Trash2,
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

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart ? () => onDragStart(task) : undefined}
      className={`group relative flex min-h-[72px] items-center gap-3.5 rounded-2xl border border-white/[0.08] bg-[#1C1C1E] px-4 py-3 transition-all hover:border-primary/40 hover:bg-[#222226] ${
        completed ? 'opacity-65' : ''
      }`}
      data-testid={`row-task-${task.id}`}
    >
      {/* Interactive Checkbox */}
      <button
        onClick={toggle}
        disabled={update.isPending}
        data-testid={`button-complete-task-${task.id}`}
        aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className={`grid size-7 shrink-0 place-items-center rounded-full border transition-all ${
          completed
            ? 'border-emerald-400 bg-emerald-400 text-black animate-check-pop shadow-[0_0_12px_rgba(52,199,89,0.35)]'
            : 'border-white/20 text-transparent hover:border-primary hover:text-primary active:scale-95'
        }`}
      >
        <Check size={14} strokeWidth={3} />
      </button>

      {/* Task Content Button (Opens Editor) */}
      <button
        onClick={() => {
          soundFX.playClick();
          onEdit(task);
        }}
        data-testid={`button-edit-task-${task.id}`}
        className="min-w-0 flex-1 text-left py-1"
      >
        <div className="flex items-center gap-2">
          {task.parentId && (
            <CornerDownRight size={13} className="text-muted-foreground shrink-0" />
          )}
          <span
            className={`block truncate text-sm font-semibold tracking-tight text-foreground transition-all ${
              completed ? 'line-through text-muted-foreground' : ''
            }`}
          >
            {task.title}
          </span>
        </div>

        {/* Metadata Badges & Tags */}
        <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
          {task.dueAt && (
            <span className="flex items-center gap-1 text-primary/90 font-medium">
              <Clock3 size={11} /> {shortTime(task.dueAt)}
            </span>
          )}

          {/* Priority indicator */}
          <span className="flex items-center gap-1">
            <span
              className={`size-1.5 rounded-full ${
                task.priority === 'high'
                  ? 'bg-primary shadow-[0_0_6px_rgba(255,159,10,0.8)]'
                  : task.priority === 'medium'
                  ? 'bg-sky-400'
                  : 'bg-muted-foreground/50'
              }`}
            />
            <span>{task.priority}</span>
          </span>

          {/* Duration */}
          <span>·</span>
          <span>{plural(task.durationMin, 'min', '')}</span>

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <>
              <span>·</span>
              <div className="flex items-center gap-1">
                <TagIcon size={10} className="text-muted-foreground" />
                <span>{task.tags.join(', ')}</span>
              </div>
            </>
          )}
        </div>
      </button>

      {/* Actions (Accessible min 44x44 tap target) */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => {
            soundFX.playClick();
            onEdit(task);
          }}
          data-testid={`button-pencil-task-${task.id}`}
          className="grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground active:scale-95"
          aria-label={`Edit ${task.title}`}
        >
          <Pencil size={15} />
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          data-testid={`button-delete-task-${task.id}`}
          className="grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive active:scale-95"
          aria-label={`Delete ${task.title}`}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
