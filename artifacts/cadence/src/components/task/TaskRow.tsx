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
import { recordActivity } from '@/lib/activity-history';
import { soundFX } from '@/lib/sound-fx';
import { TaskLinkChips } from './TaskLinkChips';

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
          recordActivity({
            type: nextStatus === 'completed' ? 'task_completed' : 'task_reopened',
            title: task.title,
            description: nextStatus === 'completed' ? 'Marked as completed' : 'Reopened task',
          });
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
          recordActivity({
            type: 'task_deleted',
            title: task.title,
            description: 'Deleted task',
          });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }),
          });
          onRefresh?.();

          // Show undoable toast
          // 10s, not sonner's 4s default. This is a DESTRUCTIVE action and D-26
          // requires it to be reversible; a 4-second window to notice you deleted a
          // task and find the Undo button is a reversal affordance in name only.
          // The longer window is also what makes the e2e assertion deterministic:
          // at 4s the toast could expire mid-assertion depending on how loaded the
          // machine was, which is exactly the flakiness we were seeing.
          toast('Task deleted', {
            description: `"${task.title}" was removed.`,
            duration: 10_000,
            action: {
              label: 'Undo',
              onClick: () => {
                soundFX.playClick();
                /*
                 * mutateAsync, NOT mutate with a per-call onSuccess.
                 *
                 * React Query v5 only invokes per-call callbacks (the second
                 * argument's onSuccess) while the calling component is still
                 * mounted. Undo is only reachable AFTER the delete succeeded and
                 * the list refetched -- which unmounts this very TaskRow. So the
                 * old `create.mutate(vars, { onSuccess })` sent the POST, got a
                 * 201, and then silently discarded every follow-up: no cache
                 * invalidation, no "Task restored" toast, no error. The task was
                 * back on the server and the user was never told. That violates
                 * D-26, which requires "undo last agent action" to actually work.
                 *
                 * The promise returned by mutateAsync is not tied to the component
                 * lifecycle, so these handlers run after unmount.
                 */
                create
                  .mutateAsync({
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
                  })
                  .then(() => {
                    recordActivity({
                      type: 'task_created',
                      title: backup.title,
                      description: 'Restored deleted task',
                    });
                    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
                    queryClient.invalidateQueries({
                      queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }),
                    });
                    onRefresh?.();
                    toast.success('Task restored');
                  })
                  .catch(() => {
                    // Blame-free and specific: say what failed and what state the
                    // task is actually in, never a raw provider error (P17.4).
                    toast.error('Could not restore that task', {
                      description: 'It is still deleted. Try capturing it again.',
                    });
                  });
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
      /* A completed row is NOT dimmed with `opacity-60`. That blanket fade was
         measured taking the row's own already-muted ink below WCAG 1.4.3 --
         axe reported 3.17:1 in dark and 2.49:1 in light on the strikethrough
         title, its priority chip and its duration, against a 4.5:1 floor.
         Completion is already carried by shape and by colour together: the
         filled check circle, the `line-through`, and the muted ink below. */
      className="card-enterprise row-density group relative flex items-center rounded-xl border border-border-control bg-card transition-all hover:border-border-control hover:bg-muted"
      data-testid={`row-task-${task.id}`}
    >
      {/* Drag grip affordance */}
      <div
        className="hidden sm:grid size-5 place-items-center cursor-grab text-foreground/15 group-hover:text-foreground/40 active:cursor-grabbing shrink-0 transition-colors"
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
              ? 'border-success bg-success text-primary-foreground animate-check-pop shadow-[0_0_8px_rgba(48,209,88,0.3)]'
              : 'border-border-control/25 bg-card/[0.02] text-transparent hover:border-border-control/50 hover:bg-card/[0.06] active:scale-90'
          }`}
        >
          <Check size={11} strokeWidth={3} />
        </span>
      </button>

      {/* Task Content Button (Opens Editor) */}
      <div className="min-w-0 flex-1 py-0.5">
        <button
          onClick={() => {
            soundFX.playClick();
            onEdit(task);
          }}
          data-testid={`button-edit-task-${task.id}`}
          className="w-full text-left"
        >
          <div className="flex items-center gap-1.5">
            {task.parentId && (
              <CornerDownRight size={12} className="text-muted-foreground shrink-0" />
            )}
            <span
              className={`block truncate text-footnote font-medium tracking-tight text-foreground transition-all ${
                completed ? 'line-through text-muted-foreground' : ''
              }`}
            >
              {task.title}
            </span>
          </div>

          {/* Metadata Badges & Tags */}
          <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-caption text-muted-foreground">
            {task.dueAt && (
              <span className="flex items-center gap-1 text-primary-text font-medium">
                <Clock3 size={10} /> {shortTime(task.dueAt)}
              </span>
            )}

            {/* Colorblind-Safe Priority Pairing (Icon + Shape + Text) */}
            <span className="flex items-center gap-1">
              {task.priority === 'high' ? (
                <span className="flex items-center gap-0.5 text-primary-text font-semibold">
                  <Flame size={10} className="text-primary-text" />
                  <span>high</span>
                </span>
              ) : task.priority === 'medium' ? (
                <span className="flex items-center gap-0.5 text-accent font-medium">
                  <CircleDot size={10} className="text-accent" />
                  <span>med</span>
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-muted-foreground">
                  <Minus size={10} />
                  <span>low</span>
                </span>
              )}
            </span>

            {/* Duration */}
            <span className="text-muted-foreground">·</span>
            <span>{plural(task.durationMin, 'min', '')}</span>

            {/* Tags */}
            {formattedTags && (
              <>
                <span className="text-muted-foreground">·</span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TagIcon size={9} className="text-muted-foreground" />
                  <span>{formattedTags}</span>
                </div>
              </>
            )}
          </div>
        </button>

        <TaskLinkChips taskId={task.id} />
      </div>

{/* Accessible Action Bar.
            gap-3 is load-bearing, not cosmetic: the buttons are size-8 (32px), so
            a gap smaller than 12px puts their centres under 44px apart and the two
            expanded 44px hit areas would overlap, making a tap ambiguous. The
            visual boxes stay 32px; only the touch area grows. */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => {
              soundFX.playClick();
              onEdit(task);
            }}
            data-testid={`button-pencil-task-${task.id}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-card/[0.06] hover:text-foreground active:scale-95 tap-target-expand"
            aria-label={`Edit ${task.title}`}
          >
            <Pencil size={13} />
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            data-testid={`button-delete-task-${task.id}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/15 hover:text-destructive active:scale-95 tap-target-expand"
            aria-label={`Delete ${task.title}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
    </div>
  );
}
