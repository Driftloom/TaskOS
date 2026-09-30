import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListBlocksQueryKey,
  getListTasksQueryKey,
  useCreateTaskBlock,
  useDeleteTaskBlock,
  useListBlocks,
  useListTasks,
  type Task,
} from '@workspace/api-client-react';
import {
  dateHeading,
  dateKey,
  monthEnd,
  monthHeading,
  monthStart,
  parseDateKey,
  shiftDate,
  shortTime,
  startOfWeek,
  today,
  timezone,
} from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { ErrorState, SectionHeading, SkeletonList } from '@/components/shared/StateViews';
import { TaskRow } from '@/components/task/TaskRow';
import { TaskEditor } from '@/components/task/TaskEditor';

export function CalendarPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(today());
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [editing, setEditing] = useState<Task | null>(null);
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [scheduleHourModal, setScheduleHourModal] = useState<number | null>(null);

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

  const refreshBlocks = () => {
    queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey(blockParams) });
  };

  const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  const scheduleTaskAtHour = (task: Task, hour: number) => {
    soundFX.playClick();
    const start = new Date(`${selectedDate}T${String(hour).padStart(2, '0')}:00:00`);
    const end = new Date(start.getTime() + task.durationMin * 60_000);

    setBlockError(null);
    createBlock.mutate(
      {
        id: task.id,
        data: { startAt: start.toISOString(), endAt: end.toISOString() },
      },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          setScheduleHourModal(null);
          refreshBlocks();
        },
        onError: (error: Error) => {
          setBlockError(error.message || 'Could not schedule time block. Check for overlapping blocks.');
        },
      },
    );
  };

  const dropOnHour = (hour: number, event: React.DragEvent) => {
    event.preventDefault();
    if (!dragTask) return;

    soundFX.playClick();
    const start = new Date(`${selectedDate}T${String(hour).padStart(2, '0')}:00:00`);
    const end = new Date(start.getTime() + dragTask.durationMin * 60_000);

    setBlockError(null);
    createBlock.mutate(
      {
        id: dragTask.id,
        data: { startAt: start.toISOString(), endAt: end.toISOString() },
      },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          setDragTask(null);
          refreshBlocks();
        },
        onError: (error: Error) => {
          setBlockError(error.message || 'Could not schedule time block. Check for overlapping blocks.');
        },
      },
    );
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
            className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14] px-3 text-xs font-medium text-zinc-300 hover:text-white transition-all active:scale-[0.98]"
          >
            <Plus size={14} className="text-zinc-400" />
            <span>Add task</span>
          </button>
        }
      />

      <div className="card-enterprise rounded-xl border border-white/[0.08] bg-card p-4 sm:p-5 shadow-xl">
        {/* Navigation & View Toggle Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => move(-1)}
              aria-label="Previous period"
              className="grid size-7 place-items-center rounded-md border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => {
                soundFX.playClick();
                setSelectedDate(today());
              }}
              className="h-7 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 font-mono text-xs uppercase tracking-wider text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => move(1)}
              aria-label="Next period"
              className="grid size-7 place-items-center rounded-md border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            <h2 className="ml-2 text-sm sm:text-base font-bold tracking-tight text-white">
              {heading}
            </h2>
          </div>

          <div className="flex rounded-lg border border-white/[0.08] bg-black/40 p-0.5">
            {(['day', 'week', 'month'] as const).map((item) => (
              <button
                key={item}
                onClick={() => {
                  soundFX.playClick();
                  setView(item);
                }}
                className={`rounded-md px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-all ${
                  view === item
                    ? 'bg-white/[0.08] text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Day View */}
        {view === 'day' && (
          <div className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-wider text-primary font-semibold">
                {dayTasks?.length ?? 0} scheduled Â· {blocks?.length ?? 0} blocked
              </p>
              <span className="font-mono text-xs text-muted-foreground">{timezone()}</span>
            </div>

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

            {/* Time Blocks Drag-Drop Hour Grid */}
            <div className="mt-8 border-t border-white/[0.08] pt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold tracking-tight text-foreground">
                  Time Blocks
                </h3>
                <span className="font-mono text-xs text-muted-foreground">
                  Drag any task row onto an hour slot
                </span>
              </div>

              {blockError && (
                <div
                  role="alert"
                  data-testid="status-block-error"
                  className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
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
                    className="flex min-h-[50px] items-center gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2 transition-all hover:border-primary/40 hover:bg-primary/[0.03]"
                  >
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                      {hourLabel(hour)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                      {blocksStartingAt(hour).map((block) => (
                        <span
                          key={block.id}
                          data-testid={`chip-block-${block.id}`}
                          className="inline-flex min-h-[32px] items-center gap-2 rounded-lg bg-primary/20 border border-primary/30 px-3 text-xs font-bold text-primary shadow-sm"
                        >
                          <span>
                            {block.taskTitle} Â· {shortTime(block.startAt)}â€“{shortTime(block.endAt)}
                          </span>
                          <button
                            onClick={() => {
                              soundFX.playClick();
                              removeBlock.mutate({ id: block.id }, { onSuccess: refreshBlocks });
                            }}
                            aria-label={`Remove block for ${block.taskTitle}`}
                            className="grid size-4 place-items-center rounded hover:bg-primary/30"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Touch & Quick Schedule Button */}
                    <button
                      type="button"
                      onClick={() => {
                        soundFX.playClick();
                        setScheduleHourModal(hour);
                      }}
                      data-testid={`button-add-block-${hour}`}
                      aria-label={`Schedule block at ${hourLabel(hour)}`}
                      className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
                    >
                      <Plus size={13} />
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
                  className={`min-h-32 rounded-2xl border p-4 text-left transition-all hover:border-primary/50 active:scale-98 ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(255,159,10,0.15)]'
                      : 'border-white/[0.08] bg-white/[0.02]'
                  }`}
                >
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(parseDateKey(day))}
                  </span>
                  <span className="mt-2 block text-2xl font-extrabold text-foreground">
                    {parseDateKey(day).getDate()}
                  </span>
                  <span className="mt-5 block font-mono text-xs text-primary">
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
            <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
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
                  return <span key={`empty-${index}`} className="min-h-14 sm:min-h-20 rounded-xl border border-transparent" />;
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
                        : 'border-white/[0.08] bg-white/[0.02]'
                    }`}
                  >
                    <span className="text-xs font-bold text-foreground">{day}</span>
                    {count > 0 && (
                      <span className="mt-1 flex items-center gap-1 font-mono text-xs text-primary">
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-enter"
          onClick={() => setScheduleHourModal(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-white/[0.1] bg-card p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Schedule Block at {hourLabel(scheduleHourModal)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Tap any task to block this time slot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleHourModal(null)}
                className="grid size-7 place-items-center rounded-full bg-white/[0.06] text-zinc-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 py-1 flex-1 custom-scrollbar">
              {(allTasks ?? []).filter((t) => t.status === 'open' || t.status === 'inbox').length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
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
                      className="w-full text-left p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] hover:border-primary/40 transition-all flex items-center justify-between group active:scale-[0.99]"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="text-xs font-semibold text-foreground block truncate">
                          {task.title}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {task.durationMin} min Â· {task.priority} priority
                        </span>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Schedule â†’
                      </span>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
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
