import { type FormEvent, useEffect, useState } from 'react';
import {
  X,
  Sparkles,
  AlertCircle,
  Flame,
  CircleDot,
  Minus,
  Clock3,
  Calendar,
  Tag as TagIcon,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListTasksQueryKey,
  getGetTaskSummaryQueryKey,
  getListTagsQueryKey,
  createTag,
  useCreateTask,
  useUpdateTask,
  type Task,
  type TaskPriority,
} from '@workspace/api-client-react';
import { today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { TaskAttachments } from '@/components/task/TaskAttachments';

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
  // `dueText` is request-only: the server resolves it to `dueAt` and never
  // echoes it back, so an existing task's resolved time is the only signal.
  const [showExactPicker, setShowExactPicker] = useState(Boolean(task?.dueAt));

  const initialTags = (task?.tags ?? [])
    .map((t) => (typeof t === 'string' ? t : (t as { name?: string })?.name))
    .filter(Boolean)
    .join(', ');
  const [tagsText, setTagsText] = useState(initialTags);
  const [saveError, setSaveError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  // Escape key closes modal & lock body scroll while modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    setSaveError(null);
    soundFX.playClick();

    const naturalWords = dueText.trim();

    // Parse and resolve tags
    const tagNames = tagsText
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    let tagIds: number[] = [];
    if (tagNames.length > 0) {
      try {
        const resolved = await Promise.all(
          tagNames.map((name) => createTag({ name }))
        );
        tagIds = resolved.map((t) => t.id);
      } catch (err) {
        console.warn('Could not resolve tags:', err);
      }
    }

    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      durationMin: Math.max(5, Number(duration) || 30),
      priority,
      tagIds,
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
      queryClient.invalidateQueries({ queryKey: getListTagsQueryKey() });
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

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent);
  const modKey = isMac ? '⌘' : 'Ctrl';
  const enterKey = isMac ? '↵' : 'Enter';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm animate-enter"
      role="dialog"
      aria-modal="true"
      aria-label={task ? 'Edit task' : 'Capture task'}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[540px] max-h-[92dvh] sm:max-h-[min(540px,calc(100dvh-2rem))] flex flex-col rounded-t-2xl sm:rounded-2xl border-t sm:border border-border-control2] bg-muted shadow-2xl shadow-black text-foreground transition-all overflow-hidden"
        data-testid="form-task-editor"
      >
        {/* Mobile Pull-Down Indicator Grab Bar */}
        <div className="sm:hidden mx-auto w-10 h-1 rounded-full bg-card/25 mt-2.5 mb-0.5 shrink-0" />

        {/* Fixed Rigid Header (Always pinned at top, never scrolled) */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 sm:py-3 border-b border-border-control bg-card shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-md bg-primary/15 text-primary-text text-xs">
              <CheckCircle2 size={13} className="text-primary-text" />
            </span>
            <span className="text-xs font-semibold text-foreground">
              {task ? 'Edit Task' : 'New Task'}
            </span>
            <span className="text-muted-foreground text-xs">•</span>
            <span className="text-xs font-medium text-muted-foreground">
              Cadence OS
            </span>
          </div>

          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-block rounded border border-border-control bg-card/[0.04] px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              Esc
            </kbd>
            <button
              type="button"
              onClick={onClose}
              data-testid="button-close-editor"
              className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-card/[0.08] hover:text-foreground transition-colors active:scale-95"
              aria-label="Close dialog"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable Body (Scrolls internally if notes are long) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-3.5 space-y-3 custom-scrollbar">
          {/* Title Input (Linear Clean Headline, No Orange Focus Box) */}
          <div>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={240}
              placeholder="What needs to get done?"
              data-testid="input-task-title"
              className="w-full bg-transparent text-base sm:text-lg font-semibold text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-0 border-none p-0 tracking-tight leading-snug"
            />
          </div>

          {/* Description / Notes (Seamless Inline Textarea) */}
          <div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="Add details, context, sub-bullets..."
              data-testid="input-task-notes"
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-0 border-none p-0 resize-none min-h-[32px] max-h-20 leading-relaxed"
            />
          </div>

          {/* Compact Property Stack (Clean Apple HIG layout, zero horizontal clipping) */}
          <div className="border-t border-border-control pt-3 space-y-2">
            {/* Row 1: Priority */}
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-card/[0.02] border border-border-control">
              <span className="text-xs font-medium text-muted-foreground">Priority</span>
              <div className="flex items-center gap-1">
                {(['low', 'medium', 'high'] as TaskPriority[]).map((p) => {
                  const selected = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      data-testid={`option-priority-${p}`}
                      onClick={() => {
                        soundFX.playTactileClick();
                        setPriority(p);
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all active:scale-95 ${
                        selected
                          ? p === 'high'
                            ? 'bg-primary/20 text-primary-text border border-primary/35 shadow-sm font-semibold'
                            : p === 'medium'
                            ? 'bg-accent/20 text-accent border border-accent/35 shadow-sm font-semibold'
                            : 'bg-card/[0.12] text-foreground border border-border-control/20 shadow-sm font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-card/[0.03] border border-transparent'
                      }`}
                    >
                      {p === 'high' && <Flame size={12} className="text-primary-text" />}
                      {p === 'medium' && <CircleDot size={12} className="text-accent" />}
                      {p === 'low' && <Minus size={12} className="text-muted-foreground" />}
                      <span>{p}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 2: Duration */}
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-card/[0.02] border border-border-control">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock3 size={13} className="text-muted-foreground" />
                <span>Duration</span>
              </div>
              <div className="flex items-center gap-1">
                {[15, 25, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      soundFX.playTactileClick();
                      setDuration(String(mins));
                    }}
                    className={`px-2 py-1 rounded-md text-xs font-mono transition-all active:scale-95 ${
                      duration === String(mins)
                        ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                        : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-card/[0.04]'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-1 pl-2 border-l border-border-control">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    data-testid="input-task-duration"
                    className="h-6 w-10 rounded bg-card px-1 text-center font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/60 border border-border-control"
                  />
                  <span className="font-mono text-xs text-muted-foreground">m</span>
                </div>
              </div>
            </div>

            {/* Row 3: Due Date & Schedule */}
            <div className="p-2.5 rounded-lg bg-card/[0.02] border border-border-control space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Calendar size={12} className="text-primary-text" />
                  <span>Due Date</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExactPicker(!showExactPicker)}
                  className="text-xs font-medium text-muted-foreground hover:text-primary-text transition-colors inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-card/[0.04]"
                >
                  <CalendarDays size={11} />
                  <span>{showExactPicker ? 'Smart words' : 'Exact timestamp'}</span>
                </button>
              </div>

              {!showExactPicker ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Sparkles size={12} className="absolute left-2.5 top-2.5 text-primary-text pointer-events-none" />
                    <input
                      value={dueText}
                      onChange={(e) => setDueText(e.target.value)}
                      maxLength={120}
                      placeholder="e.g. tomorrow 5pm, next friday 10am, in 2h"
                      data-testid="input-task-duetext"
                      className="h-8 w-full rounded-md border border-border-control bg-card pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors"
                    />
                  </div>
                  {/* Quick Preset Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { label: 'Today 5pm', value: 'today 5pm' },
                      { label: 'Tomorrow 9am', value: 'tomorrow 9am' },
                      { label: 'This Fri', value: 'friday 5pm' },
                      { label: 'Next Mon', value: 'next monday 9am' },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => {
                          soundFX.playTactileClick();
                          setDueText(preset.value);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          dueText === preset.value
                            ? 'bg-primary/20 text-primary-text border border-primary/30 font-semibold shadow-sm'
                            : 'bg-card/[0.03] text-muted-foreground hover:text-foreground hover:bg-card/[0.06] border border-border-control'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => {
                    setDueAt(e.target.value);
                    setDueText('');
                  }}
                  data-testid="input-task-due"
                  className="h-8 w-full rounded-md border border-border-control bg-card px-2.5 text-xs text-foreground outline-none focus:border-primary/60 transition-colors [color-scheme:dark]"
                />
              )}
            </div>

            {/* Row 4: Tags (Compact Inline) */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/[0.02] border border-border-control">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
                <TagIcon size={12} className="text-muted-foreground" />
                <span>Tags</span>
              </div>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="work, design, sprint-1..."
                className="h-5 flex-1 rounded bg-transparent px-1 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/60 border border-transparent focus:border-primary/40 transition-colors"
              />
            </div>
          </div>

          {/* Error message */}
          {saveError && (
            <div
              role="alert"
              data-testid="status-save-error"
              className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
            >
              <AlertCircle size={12} className="shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Reminders + links. Both are per-task sub-resources, so they only
              appear once the task actually exists on the server. */}
          {task && <TaskAttachments taskId={task.id} dueAt={task.dueAt} />}
        </div>

        {/* Fixed Rigid Footer */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-t border-border-control bg-card shrink-0 pb-safe sm:pb-2.5">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Press</span>
            <kbd className="rounded bg-card/[0.06] border border-border-control px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              Esc
            </kbd>
            <span>to cancel</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              data-testid="button-cancel-editor"
              className="h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !title.trim()}
              data-testid="button-save-task"
              className="btn-primary h-8 rounded-lg px-3.5 text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <span>{pending ? 'Saving…' : task ? 'Save changes' : 'Add to today'}</span>
              <kbd className="hidden sm:inline-block rounded bg-background/25 px-1.5 py-0.5 font-mono text-xs text-primary-foreground font-bold">
                {modKey} + {enterKey}
              </kbd>
            </button>
          </div>

        </div>
      </form>
    </div>
  );
}

