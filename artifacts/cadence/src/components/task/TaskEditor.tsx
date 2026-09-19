import { type FormEvent, useEffect, useState } from 'react';
import { X, Sparkles, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListTasksQueryKey,
  getGetTaskSummaryQueryKey,
  useCreateTask,
  useUpdateTask,
  type Task,
  type TaskPriority,
} from '@workspace/api-client-react';
import { today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';

interface TaskEditorProps {
  task?: Task;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function TaskEditor({
  task,
  defaultDate,
  onClose,
  onSaved,
}: TaskEditorProps) {
  const queryClient = useQueryClient();
  const create = useCreateTask();
  const update = useUpdateTask();

  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [duration, setDuration] = useState(String(task?.durationMin ?? 30));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [dueAt, setDueAt] = useState(
    task?.dueAt
      ? task.dueAt.slice(0, 16)
      : defaultDate
      ? `${defaultDate}T09:00`
      : '',
  );
  const [dueText, setDueText] = useState('');
  const [tagsText, setTagsText] = useState(task?.tags?.join(', ') ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  // Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    setSaveError(null);
    soundFX.playClick();

    const naturalWords = dueText.trim();
    const parsedTags = tagsText
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      durationMin: Math.max(5, Number(duration) || 30),
      priority,
      ...(naturalWords
        ? { dueText: naturalWords, timezone: timezone() }
        : {
            dueAt: dueAt
              ? new Date(dueAt).toISOString()
              : task
              ? null
              : new Date().toISOString(),
          }),
      ...(task ? {} : { status: 'open' as const }),
    };

    const handleSuccess = () => {
      soundFX.playCompletion();
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }),
      });
      onSaved();
    };

    const handleFailure = (error: Error) => {
      setSaveError(error.message || 'Could not save task. Please check the inputs.');
    };

    if (task) {
      update.mutate({ id: task.id, data: payload }, { onSuccess: handleSuccess, onError: handleFailure });
    } else {
      create.mutate({ data: payload }, { onSuccess: handleSuccess, onError: handleFailure });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-enter"
      role="dialog"
      aria-modal="true"
      aria-label={task ? 'Edit task' : 'Capture task'}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl border border-white/[0.1] bg-[#1C1C1E] p-6 shadow-2xl glass-chrome text-foreground sm:p-8"
        data-testid="form-task-editor"
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
              {task ? 'Refine task' : 'Quick capture'}
            </p>
            <h2 className="text-2xl font-extrabold tracking-tight">
              {task ? 'Edit task' : 'What needs doing?'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="button-close-editor"
            className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Task Title */}
        <div className="space-y-1">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={240}
            placeholder="e.g. Finalize Q3 product roadmap"
            data-testid="input-task-title"
            className="w-full border-b border-white/[0.1] bg-transparent pb-3 text-lg font-semibold outline-none placeholder:text-muted-foreground/60 focus:border-primary transition-colors"
          />
        </div>

        {/* Natural Language Due Date ("Due in words") */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground flex items-center gap-1.5">
              <Sparkles size={11} className="text-primary" />
              <span>Due in words (Smart Parse)</span>
            </label>
            <span className="text-[10px] text-muted-foreground">e.g. tomorrow 5pm, in 2h</span>
          </div>
          <input
            value={dueText}
            onChange={(e) => setDueText(e.target.value)}
            maxLength={120}
            placeholder="e.g. tomorrow 5pm, next friday 10am"
            data-testid="input-task-duetext"
            className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary transition-colors"
          />
        </div>

        {/* Traditional Form Grid (Duration, When, Priority) */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Minutes
            </label>
            <input
              type="number"
              min={5}
              max={1440}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              data-testid="input-task-duration"
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 text-sm outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Explicit When
            </label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              data-testid="input-task-due"
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 text-xs outline-none focus:border-primary [color-scheme:dark]"
            />
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              data-testid="select-task-priority"
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-[#242428] px-3 text-sm outline-none focus:border-primary text-foreground"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        {/* Tags */}
        <div className="mt-4">
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Tags <span className="opacity-60 normal-case">(comma-separated)</span>
          </label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="e.g. work, design, sprint-1"
            className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary transition-colors"
          />
        </div>

        {/* Notes */}
        <div className="mt-4">
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Notes <span className="opacity-60 normal-case">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Context, bullet points, links for future you..."
            data-testid="input-task-notes"
            className="w-full resize-none rounded-xl border border-white/[0.1] bg-white/[0.04] p-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary transition-colors"
          />
        </div>

        {/* Error message */}
        {saveError && (
          <div
            role="alert"
            data-testid="status-save-error"
            className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <AlertCircle size={14} className="shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-7 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            data-testid="button-cancel-editor"
            className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !title.trim()}
            data-testid="button-save-task"
            className="min-h-[44px] rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? 'Saving…' : task ? 'Save changes' : 'Add to today'}
          </button>
        </div>
      </form>
    </div>
  );
}
