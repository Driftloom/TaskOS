import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListBlocksQueryKey,
  getListTasksQueryKey,
  useCreateTaskBlock,
  useDeleteTaskBlock,
  useListBlocks,
  useListTasks,
  useUpdateTaskBlock,
  type Task,
  type TimeBlock as TimeBlockRecord,
} from '@workspace/api-client-react';
import {
  dateHeading,
  dateKey,
  monthEnd,
  monthHeading,
  monthStart,
  parseDateKey,
  shiftDate,
  startOfWeek,
  today,
  timezone,
} from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { ErrorState, SectionHeading, SkeletonList } from '@/components/shared/StateViews';
import { TaskRow } from '@/components/task/TaskRow';
import { TaskEditor } from '@/components/task/TaskEditor';
import { TimeBlock } from '@/components/task/TimeBlock';

export function CalendarPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(today());
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [editing, setEditing] = useState<Task | null>(null);
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [scheduleHourModal, setScheduleHourModal] = useState<number | null>(null);
  /** The block open in the time picker — §P11.1's mandatory non-drag alternative. */
  const [pickerBlock, setPickerBlock] = useState<TimeBlockRecord | null>(null);
  const [pickerStart, setPickerStart] = useState('09:00');
  const [pickerEnd, setPickerEnd] = useState('10:00');
  /** Id of the chip a dragged task is currently hovering, for its drop-target state. */
  const [dropOverBlockId, setDropOverBlockId] = useState<number | null>(null);

  const dayParams = useMemo(
    () => ({ date: selectedDate, scope: 'today' as const, timezone: timezone() }),
    [selectedDate],
  );
  const allParams = useMemo(() => ({ scope: 'all' as const }), []);

  const { data: dayTasks, isLoading, isError, refetch } = useListTasks(dayParams, {
    query: { queryKey: getListTasksQueryKey(dayParams) },
  });
  const { data: allTasks } = useListTasks(allParams, {
    query: { queryKey: getListTasksQueryKey(allParams) },
  });

  const blockParams = useMemo(
    () => ({ date: selectedDate, timezone: timezone() }),
    [selectedDate],
  );
  const { data: blocks } = useListBlocks(blockParams, {
    query: { queryKey: getListBlocksQueryKey(blockParams) },
  });

  const createBlock = useCreateTaskBlock();
  const removeBlock = useDeleteTaskBlock();
  const updateBlock = useUpdateTaskBlock();

  const refreshBlocks = () => {
    queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey(blockParams) });
  };

  const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  /** `HH:MM` in the viewer's local zone, for `<input type="time">`. */
  const timeInputValue = (iso: string) => {
    const date = new Date(iso);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const afterBlockWrite = () => {
    soundFX.playCompletion();
    setScheduleHourModal(null);
    setPickerBlock(null);
    setDragTask(null);
    setDropOverBlockId(null);
    refreshBlocks();
  };

  const onBlockWriteError = (error: Error) =>
    setBlockError(
      error.message ||
        'Could not save that time block. Check that it does not overlap another one.',
    );

  /**
   * Place a task on the grid, idempotently.
   *
   * `POST /tasks/:id/blocks` always INSERTs (it only rejects genuine overlaps),
   * so re-placing a task that already owned a block used to leave that task with
   * two blocks. If a block already exists for the task on this view we PATCH it
   * instead — same user intent ("put this task here"), one row, no surprises
   * (§P3 Predictability).
   */
  const placeBlock = (task: Task, hour: number) => {
    soundFX.playClick();
    const start = new Date(`${selectedDate}T${String(hour).padStart(2, '0')}:00:00`);
    const end = new Date(start.getTime() + task.durationMin * 60_000);
    const existing = (blocks ?? []).find((block) => block.taskId === task.id);

    setBlockError(null);

    if (existing) {
      updateBlock.mutate(
        {
          id: existing.id,
          data: { startAt: start.toISOString(), endAt: end.toISOString() },
        },
        { onSuccess: afterBlockWrite, onError: onBlockWriteError },
      );
      return;
    }

    createBlock.mutate(
      { id: task.id, data: { startAt: start.toISOString(), endAt: end.toISOString() } },
      { onSuccess: afterBlockWrite, onError: onBlockWriteError },
    );
  };

  const scheduleTaskAtHour = (task: Task, hour: number) => {
    placeBlock(task, hour);
  };

  const dropOnHour = (hour: number, event: React.DragEvent) => {
    event.preventDefault();
    if (!dragTask) return;
    placeBlock(dragTask, hour);
  };

  /** §P11.1 arrow-key move: ±15 minutes, both edges shifted. */
  const moveBlock = (block: TimeBlockRecord, deltaMinutes: number) => {
    soundFX.playClick();
    const start = new Date(new Date(block.startAt).getTime() + deltaMinutes * 60_000);
    const end = new Date(new Date(block.endAt).getTime() + deltaMinutes * 60_000);
    setBlockError(null);
    updateBlock.mutate(
      { id: block.id, data: { startAt: start.toISOString(), endAt: end.toISOString() } },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          refreshBlocks();
        },
        onError: onBlockWriteError,
      },
    );
  };

  /** §P11.1 arrow-key resize: ±15 minutes on the end time. */
  const resizeBlock = (block: TimeBlockRecord, deltaMinutes: number) => {
    soundFX.playClick();
    const start = new Date(block.startAt);
    const end = new Date(new Date(block.endAt).getTime() + deltaMinutes * 60_000);
    if (end <= start) {
      setBlockError('A time block must end after it starts — 15 minutes is the smallest step.');
      return;
    }
    setBlockError(null);
    updateBlock.mutate(
      { id: block.id, data: { endAt: end.toISOString() } },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          refreshBlocks();
        },
        onError: onBlockWriteError,
      },
    );
  };

  const openBlockPicker = (block: TimeBlockRecord) => {
    soundFX.playClick();
    setBlockError(null);
    setPickerStart(timeInputValue(block.startAt));
    setPickerEnd(timeInputValue(block.endAt));
    setPickerBlock(block);
  };

  const saveBlockTimes = (block: TimeBlockRecord, startValue: string, endValue: string) => {
    const start = new Date(`${selectedDate}T${startValue}:00`);
    const end = new Date(`${selectedDate}T${endValue}:00`);
    // §P13: validate on submit, name the field, say how to fix it, blame nobody.
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setBlockError('Enter both a start and an end time for this block.');
      return;
    }
    if (end <= start) {
      setBlockError('The end time must be later than the start time on the same day.');
      return;
    }
    setBlockError(null);
    updateBlock.mutate(
      { id: block.id, data: { startAt: start.toISOString(), endAt: end.toISOString() } },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          setPickerBlock(null);
          refreshBlocks();
        },
        onError: onBlockWriteError,
      },
    );
  };

  const removeOneBlock = (block: TimeBlockRecord) => {
    soundFX.playClick();
    removeBlock.mutate(
      { id: block.id },
      {
        onSuccess: () => {
          setPickerBlock(null);
          refreshBlocks();
        },
      },
    );
  };

  /**
   * Drop-target state for a chip. §P12 "drop-target valid/invalid": a refusal has
   * to say why, and a drop onto a task's own block is exactly that — it would
   * re-place the task on the hour it is already in.
   */
  const dropTargetFor = (block: TimeBlockRecord): 'none' | 'valid' | 'invalid' => {
    if (dropOverBlockId !== block.id || !dragTask) return 'none';
    return dragTask.id === block.taskId ? 'invalid' : 'valid';
  };

  const taskById = useMemo(
    () => new Map((allTasks ?? []).map((task) => [task.id, task])),
    [allTasks],
  );

  /**
   * A block reads as overdue when its window has closed AND its task is still
   * open. §P3 "calm urgency": red is for genuinely overdue work, never
   * decoration — so "the hour passed" alone is not enough, and a block whose task
   * is not in the loaded set stays quiet rather than guessing.
   */
  const isBlockOverdue = (block: TimeBlockRecord) => {
    if (new Date(block.endAt).getTime() >= Date.now()) return false;
    const task = taskById.get(block.taskId);
    return task ? task.status !== 'completed' : false;
  };

  const blocksStartingAt = (hour: number) =>
    (blocks ?? []).filter((block) => {
      const start = new Date(block.startAt);
      return dateKey(start) === selectedDate && start.getHours() === hour;
    });

  const days = Array.from({ length: 7 }, (_, index) =>
    shiftDate(startOfWeek(selectedDate), index),
  );
  const firstOfMonth = parseDateKey(monthStart(selectedDate));
  const daysInMonth = parseDateKey(monthEnd(selectedDate)).getDate();
  const monthCells = Array.from(
    { length: firstOfMonth.getDay() + daysInMonth },
    (_, index) => index - firstOfMonth.getDay() + 1,
  );

  const tasksOn = (value: string) =>
    allTasks?.filter((task) => task.dueAt && dateKey(new Date(task.dueAt)) === value) ?? [];

  const move = (amount: number) => {
    soundFX.playClick();
    if (view === 'day') setSelectedDate(shiftDate(selectedDate, amount));
    else if (view === 'week') setSelectedDate(shiftDate(selectedDate, amount * 7));
    else {
      const date = parseDateKey(selectedDate);
      date.setMonth(date.getMonth() + amount);
      setSelectedDate(dateKey(date));
    }
  };

  const heading = view === 'month' ? monthHeading(selectedDate) : dateHeading(selectedDate);

  return (
    <div className="animate-enter">
      <SectionHeading
        eyebrow="Calendar"
        title="See the shape of time."
        detail="Schedule your hours with time blocks, without losing the freedom to adapt."
        action={
          <button
            onClick={() => {
              soundFX.playClick();
              setEditing({} as Task);
            }}
            data-testid="button-calendar-add"
            /* TAP TARGET: was `h-8` (32px). Its only neighbour is the section
               heading, which is not interactive, so there is nothing to steal a
               tap from and the box itself is raised to 44px. No
               `tap-target-expand` — expanding a compliant 44px box would only
               push it past the layout. */
            className="inline-flex density-control items-center gap-1.5 rounded-lg border border-border-control bg-card px-3.5 text-footnote font-medium text-foreground transition-colors [@media(hover:hover)]:hover:bg-muted active:scale-98"
          >
            <Plus size={14} className="text-muted-foreground" aria-hidden="true" />
            <span>Add task</span>
          </button>
        }
      />

      <div className="card-enterprise rounded-xl border border-border bg-card p-4 shadow-e2 sm:p-5">
        {/* Navigation & View Toggle Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => move(-1)}
              aria-label="Previous period"
              /* TAP TARGETS (prev / Today / next were 28px each, 34px apart).
                 Expanding all three is the wrong fix: index.css's
                 `tap-target-expand` centres a 44px box on each control, so at
                 34px pitch the three hit areas would overlap and a tap aimed at
                 "next" would often land on "previous". These three sit in a tight
                 cluster, so the pitch is raised instead of the hit areas: each
                 box is now 44px and they are `gap-1` apart, putting centres
                 >=48px apart. Adjacent boxes that are each already 44px cannot
                 produce overlapping hit areas. */
              className="grid size-11 shrink-0 place-items-center rounded-md border border-border-control bg-card text-muted-foreground transition-colors [@media(hover:hover)]:hover:bg-muted active:scale-98"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              onClick={() => {
                soundFX.playClick();
                setSelectedDate(today());
              }}
              className="density-control shrink-0 rounded-md border border-border-control bg-card px-3 font-mono text-caption font-semibold uppercase tracking-wider text-muted-foreground transition-colors [@media(hover:hover)]:hover:bg-muted active:scale-98"
            >
              Today
            </button>
            <button
              onClick={() => move(1)}
              aria-label="Next period"
              /* Same geometry as the previous-period button above. */
              className="grid size-11 shrink-0 place-items-center rounded-md border border-border-control bg-card text-muted-foreground transition-colors [@media(hover:hover)]:hover:bg-muted active:scale-98"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <h2 className="ml-1 text-headline font-bold tracking-tight text-foreground sm:font-display sm:text-title3 truncate max-w-[200px] sm:max-w-none">
              {heading}
            </h2>
          </div>

          <div className="flex rounded-lg border border-border-control bg-background p-0.5">
            {(['day', 'week', 'month'] as const).map((item) => (
              <button
                key={item}
                onClick={() => {
                  soundFX.playClick();
                  setView(item);
                }}
                aria-pressed={view === item}
                /* TAP TARGET: the segmented control was ~24px tall. Each segment
                   is now `min-h-11`; they are laid out edge to edge, so their
                   centres are >=44px apart and no expansion is used. */
                className={`min-w-11 min-h-size-tap-target h-11 shrink-0 rounded-md px-3 font-mono text-caption font-semibold uppercase tracking-wider transition-colors active:scale-98 ${
                  view === item
                    ? 'bg-muted text-foreground shadow-e1'
                    : 'text-muted-foreground [@media(hover:hover)]:hover:text-foreground'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Day View */}
        {view === 'day' && (
          <div className="pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-start">
            {/* Scheduled Tasks Pane */}
            <div className="lg:col-span-5 xl:col-span-5 space-y-4 min-w-0">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-mono text-caption font-semibold uppercase tracking-wider text-primary-text">
                  {dayTasks?.length ?? 0} scheduled · {blocks?.length ?? 0} blocked
                </p>
                <span className="font-mono text-caption text-muted-foreground">{timezone()}</span>
              </div>

              <div className="min-h-component-dimension-calendar-cell-min-h">
                {isLoading ? (
                  <SkeletonList />
                ) : isError ? (
                  <ErrorState onRetry={() => refetch()} />
                ) : (
                  <div className="space-y-2.5">
                    {(dayTasks ?? []).map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onRefresh={() => refetch()}
                        onEdit={setEditing}
                        onDragStart={setDragTask}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Time Blocks Drag-Drop Hour Grid */}
            <div className="lg:col-span-7 xl:col-span-7 space-y-4 min-w-0 lg:border-l lg:border-border-control lg:pl-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-headline font-bold tracking-tight text-foreground">
                  Time Blocks
                </h3>
                <span className="font-mono text-caption text-muted-foreground">
                  Drag any task row onto an hour slot
                </span>
              </div>

              {/* Suppressed while the picker is open so a save failure is not
                  announced twice (both surfaces are role="alert"). */}
              {blockError && !pickerBlock && (
                <div
                  role="alert"
                  data-testid="status-block-error"
                  className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-footnote text-destructive"
                >
                  {blockError}
                </div>
              )}

              <div className="space-y-2">
                {Array.from({ length: 17 }, (_, index) => index + 6).map((hour) => (
                  <div
                    key={hour}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => dropOnHour(hour, e)}
                    data-testid={`hour-slot-${hour}`}
                    /* TAP TARGET / PITCH: the hour row is the "surrounding row"
                       whose pitch §P8.1 asks to grow instead of overlapping hit
                       areas. It was `min-h-[50px]` with `py-2`, leaving a 34px
                       content box — too short for the 44px TimeBlock chip or the
                       44px add-block button this row now contains. `min-h-14`
                       (56px) minus `py-1.5` (6px a side) leaves exactly a 44px
                       content box, so every control in the row has a real 44px
                       box and none of them needs `tap-target-expand`.
                       17 rows x 56px = 952px of scroll, which the day view
                       already expects. */
                    className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card/40 px-3.5 py-1.5 transition-colors [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:bg-primary/5"
                  >
                    <span className="w-12 shrink-0 font-mono text-caption tabular-nums text-muted-foreground">
                      {hourLabel(hour)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      {blocksStartingAt(hour).map((block) => (
                        <TimeBlock
                          key={block.id}
                          block={block}
                          /* `GET /blocks` exposes no source/lock column, so the
                             server cannot yet distinguish an auto-placed block
                             from a manual one. `manual` is the honest default;
                             the auto-placed / fixed / proposed / missed variants
                             are rendered by the component and will switch on as
                             soon as that column exists. `overdue` needs no
                             column — it is derived from the block's end time
                             plus the linked task's status above. */
                          variant="manual"
                          overdue={isBlockOverdue(block)}
                          dropTarget={dropTargetFor(block)}
                          dropTargetMessage={
                            dropTargetFor(block) === 'invalid'
                              ? 'Already blocked here — move it with the arrow keys instead'
                              : undefined
                          }
                          onOpenPicker={openBlockPicker}
                          onRemove={removeOneBlock}
                          onMove={moveBlock}
                          onResize={resizeBlock}
                          onDropTask={
                            /* Only wired while something is actually being
                               dragged, so the chip never advertises a drop
                               target it cannot honour. */
                            dragTask
                              ? (target) => placeBlock(dragTask, new Date(target.startAt).getHours())
                              : undefined
                          }
                          onDragOverChange={(id, over) => setDropOverBlockId(over ? id : null)}
                        />
                      ))}
                    </div>

                    {/* Touch & Quick Schedule Button.
                        TAP TARGET: was `size-7` (28px). It sits flush against the
                        chip area, so a `tap-target-expand` here would grow its hit
                        box 8px leftward into the last chip and steal its taps. The
                        box is raised to `size-11` instead: a real 44px square
                        beside a 44px chip cannot overlap, and it exactly fills
                        the row's 44px content box vertically. */}
                    <button
                      type="button"
                      onClick={() => {
                        soundFX.playClick();
                        setScheduleHourModal(hour);
                      }}
                      data-testid={`button-add-block-${hour}`}
                      aria-label={`Schedule block at ${hourLabel(hour)}`}
                      className="grid size-11 shrink-0 place-items-center rounded-lg border border-border-control bg-card text-muted-foreground transition-colors [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:bg-primary/10 [@media(hover:hover)]:hover:text-primary-text active:scale-98"
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Week View */}
        {view === 'week' && (
          <div className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((day) => {
              const count = tasksOn(day).length;
              const isSelected = day === selectedDate;
              return (
                <button
                  key={day}
                  onClick={() => {
                    soundFX.playClick();
                    setSelectedDate(day);
                    setView('day');
                  }}
                  className={`min-h-32 rounded-lg border p-4 text-left transition-colors active:scale-98 [@media(hover:hover)]:hover:border-primary/50 ${
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card/40'
                  }`}
                >
                  <span className="font-mono text-caption uppercase tracking-wider text-muted-foreground">
                    {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(parseDateKey(day))}
                  </span>
                  <span className="mt-2 block font-display text-title2 font-bold text-foreground">
                    {parseDateKey(day).getDate()}
                  </span>
                  <span className="mt-5 block font-mono text-caption text-primary-text">
                    {count} {count === 1 ? 'task' : 'tasks'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Month View */}
        {view === 'month' && (
          <div className="pt-6">
            <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2 text-center font-mono text-caption uppercase tracking-wider text-muted-foreground">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <span key={d} className="truncate">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {monthCells.map((day, index) => {
                const value =
                  day < 1 || day > daysInMonth
                    ? ''
                    : dateKey(
                        new Date(
                          parseDateKey(selectedDate).getFullYear(),
                          parseDateKey(selectedDate).getMonth(),
                          day,
                        ),
                      );
                if (!value) {
                  return <span key={`empty-${index}`} className="min-h-14 rounded-xl border border-transparent sm:min-h-20" />;
                }
                const count = tasksOn(value).length;
                const isSelected = value === selectedDate;
                return (
                  <button
                    key={value}
                    onClick={() => {
                      soundFX.playClick();
                      setSelectedDate(value);
                      setView('day');
                    }}
                    className={`min-h-14 sm:min-h-20 rounded-xl border p-1.5 sm:p-2.5 text-left transition-all hover:border-primary/50 flex flex-col justify-between ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card/40'
                    }`}
                  >
                    <span className="text-footnote font-bold text-foreground">{day}</span>
                    {count > 0 && (
                      <span className="mt-1 flex items-center gap-1 font-mono text-caption text-primary-text">
                        <span className="size-1.5 rounded-full bg-primary shrink-0" />
                        <span className="hidden sm:inline">
                          {count} task{count === 1 ? '' : 's'}
                        </span>
                        <span className="sm:hidden font-bold">{count}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Touch-Friendly Schedule Picker Modal */}
      {scheduleHourModal !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm animate-enter"
          onClick={() => setScheduleHourModal(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setScheduleHourModal(null);
          }}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col space-y-4 rounded-t-3xl border border-border bg-card p-6 shadow-e3 sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-headline font-bold text-foreground">
                  Schedule Block at {hourLabel(scheduleHourModal)}
                </h3>
                <p className="text-footnote text-muted-foreground">
                  Tap any task to block this time slot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleHourModal(null)}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors [@media(hover:hover)]:hover:text-foreground active:scale-98"
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto py-1">
              {(allTasks ?? []).filter((t) => t.status === 'open' || t.status === 'inbox').length === 0 ? (
                <div className="py-8 text-center text-footnote text-muted-foreground">
                  No open tasks available to schedule.
                </div>
              ) : (
                (allTasks ?? [])
                  .filter((t) => t.status === 'open' || t.status === 'inbox')
                  .map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => scheduleTaskAtHour(task, scheduleHourModal)}
                      disabled={createBlock.isPending}
                      className="group flex w-full items-center justify-between rounded-xl border border-border bg-card/40 p-3 text-left transition-colors active:scale-98 [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="block truncate text-footnote font-semibold text-foreground">
                          {task.title}
                        </span>
                        <span className="font-mono text-caption text-muted-foreground">
                          {task.durationMin} min · {task.priority} priority
                        </span>
                      </div>
                      <span className="shrink-0 text-footnote font-bold text-primary-text opacity-0 transition-opacity group-hover:opacity-100">
                        Schedule →
                      </span>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Block Time Picker — §P11.1's MANDATORY non-drag alternative.
          Reached by tapping a chip, by Enter/Space on a focused chip, or by Home.
          Dragging is additive; this is the path that must never be missing. */}
      {pickerBlock && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-picker-heading"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm overflow-y-auto animate-enter"
          onClick={() => setPickerBlock(null)}
          /* Escape closes. A real focus trap needs a Dialog primitive, which is
             a wider refactor than this task owns; `autoFocus` on the first field
             is the mitigation here, and the gap is called out in the handoff. */
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPickerBlock(null);
          }}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 shadow-e3 max-h-[calc(100dvh-2rem)] overflow-y-auto my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div className="min-w-0">
                <h3 id="block-picker-heading" className="text-headline font-bold text-foreground">
                  Reschedule block
                </h3>
                <p className="mt-0.5 truncate text-footnote text-muted-foreground">
                  {pickerBlock.taskTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerBlock(null)}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors [@media(hover:hover)]:hover:text-foreground active:scale-98"
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {/* §P11.2: the time picker steps in 5/15 minutes; the native
                `type="time"` control on mobile is the platform's own picker. */}
            <div className="flex items-end gap-3">
              <label className="flex-1">
                <span className="block font-mono text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                  Starts
                </span>
                <input
                  type="time"
                  step={900}
                  autoFocus
                  value={pickerStart}
                  onChange={(event) => setPickerStart(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-border-control bg-background px-3 text-body text-foreground"
                />
              </label>
              <label className="flex-1">
                <span className="block font-mono text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                  Ends
                </span>
                <input
                  type="time"
                  step={900}
                  value={pickerEnd}
                  onChange={(event) => setPickerEnd(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-border-control bg-background px-3 text-body text-foreground"
                />
              </label>
            </div>

            {blockError ? (
              <p role="alert" className="text-footnote text-destructive">
                {blockError}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => removeOneBlock(pickerBlock)}
                className="min-h-11 rounded-lg border border-border-control bg-card px-3.5 text-footnote font-semibold text-destructive transition-colors [@media(hover:hover)]:hover:bg-destructive/10 active:scale-98"
              >
                Remove block
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPickerBlock(null)}
                  className="min-h-11 rounded-lg border border-border-control bg-card px-3.5 text-footnote font-medium text-foreground transition-colors [@media(hover:hover)]:hover:bg-muted active:scale-98"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveBlockTimes(pickerBlock, pickerStart, pickerEnd)}
                  disabled={updateBlock.isPending}
                  aria-busy={updateBlock.isPending || undefined}
                  data-testid="button-save-block-time"
                  className="min-h-11 rounded-lg bg-primary px-4 text-footnote font-bold text-primary-foreground shadow-e1 transition-all [@media(hover:hover)]:hover:brightness-105 active:scale-98 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editing && (
        <TaskEditor
          task={editing.id ? editing : undefined}
          defaultDate={selectedDate}
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
