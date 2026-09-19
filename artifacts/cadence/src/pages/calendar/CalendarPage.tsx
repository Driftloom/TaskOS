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
        eyebrow="Calendar · time in perspective"
        title="See the shape of time."
        detail="Schedule your hours with time blocks, without losing the freedom to adapt."
        action={
          <button
            onClick={() => {
              soundFX.playClick();
              setEditing({} as Task);
            }}
            data-testid="button-calendar-add"
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/[0.1] bg-[#1C1C1E] px-4 text-sm font-bold text-foreground hover:border-primary/50 hover:bg-white/[0.06] transition-all"
          >
            <Plus size={16} />
            <span>Add task</span>
          </button>
        }
      />

      <div className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-4 sm:p-6 shadow-xl">
        {/* Navigation & View Toggle Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => move(-1)}
              aria-label="Previous period"
              className="grid size-9 place-items-center rounded-xl border border-white/[0.1] hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                soundFX.playClick();
                setSelectedDate(today());
              }}
              className="rounded-xl border border-white/[0.1] px-3.5 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => move(1)}
              aria-label="Next period"
              className="grid size-9 place-items-center rounded-xl border border-white/[0.1] hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight size={16} />
            </button>
            <h2 className="ml-2 text-base sm:text-lg font-bold tracking-tight text-foreground">
              {heading}
            </h2>
          </div>

          <div className="flex rounded-xl border border-white/[0.1] bg-black/40 p-1">
            {(['day', 'week', 'month'] as const).map((item) => (
              <button
                key={item}
                onClick={() => {
                  soundFX.playClick();
                  setView(item);
                }}
                className={`rounded-lg px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all ${
                  view === item
                    ? 'bg-primary text-primary-foreground font-bold shadow'
                    : 'text-muted-foreground hover:text-foreground'
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
              <p className="font-mono text-[10px] uppercase tracking-wider text-primary font-semibold">
                {dayTasks?.length ?? 0} scheduled · {blocks?.length ?? 0} blocked
              </p>
              <span className="font-mono text-[10px] text-muted-foreground">{timezone()}</span>
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
                <span className="font-mono text-[10px] text-muted-foreground">
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
                    <span className="w-12 shrink-0 font-mono text-[10px] text-muted-foreground">
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
                            {block.taskTitle} · {shortTime(block.startAt)}–{shortTime(block.endAt)}
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
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(parseDateKey(day))}
                  </span>
                  <span className="mt-2 block text-2xl font-extrabold text-foreground">
                    {parseDateKey(day).getDate()}
                  </span>
                  <span className="mt-5 block font-mono text-[10px] text-primary">
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
            <div className="mb-2 grid grid-cols-7 gap-2 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
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
                  return <span key={`empty-${index}`} className="min-h-20 rounded-xl border border-transparent" />;
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
                    className={`min-h-20 rounded-xl border p-2.5 text-left transition-all hover:border-primary/50 ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-white/[0.08] bg-white/[0.02]'
                    }`}
                  >
                    <span className="text-xs font-bold text-foreground">{day}</span>
                    <span className="mt-2.5 block font-mono text-[10px] text-primary">
                      {count > 0 ? `${count} task${count === 1 ? '' : 's'}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
