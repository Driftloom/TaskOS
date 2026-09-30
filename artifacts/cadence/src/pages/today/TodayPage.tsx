import { useMemo, useState, type FormEvent } from 'react';
import {
  Clock3,
  Plus,
  Sun,
  Search,
  Flame,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMomentumQueryKey,
  getGetTaskSummaryQueryKey,
  getListTasksQueryKey,
  getListTagsQueryKey,
  createTag,
  useCreateTask,
  useGetMomentum,
  useGetTaskSummary,
  useListTasks,
  useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import { dateLabel, plural, today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { ActivityRings, ProgressRing } from '@/components/shared/ActivityRings';
import { EmptyState, ErrorState, SectionHeading, SkeletonList } from '@/components/shared/StateViews';
import { TaskRow } from '@/components/task/TaskRow';
import { NextUpCard } from '@/components/task/CadenceDomain';
import { TaskEditor } from '@/components/task/TaskEditor';
import { RitualDialog } from '@/components/rituals/RitualDialog';
import { RescheduleProposals } from '@/components/task/RescheduleProposals';
import { AgentPanel } from '@/components/agent/AgentPanel';

export function TodayPage() {
  const queryClient = useQueryClient();
  const [capture, setCapture] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [ritualType, setRitualType] = useState<'morning' | 'evening' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setLocation] = useLocation();
  const [customNextUpId, setCustomNextUpId] = useState<number | null>(null);

  const params = useMemo(
    () => ({ date: today(), scope: 'today' as const, timezone: timezone() }),
    [],
  );
  const { data: tasks, isLoading, isError, refetch } = useListTasks(params, {
    query: { queryKey: getListTasksQueryKey(params) },
  });

  const summaryParams = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: summary, isLoading: summaryLoading } = useGetTaskSummary(summaryParams, {
    query: { queryKey: getGetTaskSummaryQueryKey(summaryParams) },
  });

  const momentumParams = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: momentum } = useGetMomentum(momentumParams, {
    query: { queryKey: getGetMomentumQueryKey(momentumParams) },
  });

  const create = useCreateTask();
  const updateTask = useUpdateTask();
  const taskList = tasks ?? [];

  // Designated Next Up: explicit user choice or first incomplete task
  const next = useMemo(() => {
    if (customNextUpId) {
      const found = taskList.find((t) => t.id === customNextUpId && t.status !== 'completed');
      if (found) return found;
    }
    return taskList.find((task) => task.status !== 'completed');
  }, [taskList, customNextUpId]);

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return taskList;
    const q = searchQuery.toLowerCase();
    return taskList.filter((t) => t.title.toLowerCase().includes(q));
  }, [taskList, searchQuery]);

  // Real-time NLP preview for Superhuman / Linear style quick capture
  const nlpPreview = useMemo(() => {
    if (!capture.trim()) return null;
    const tagMatches = capture.match(/#([a-zA-Z0-9_-]+)/g)?.map((t) => t.slice(1)) ?? [];
    const isUrgent = /\b(!high|#urgent|p1|urgent)\b/i.test(capture);
    const timeMatch = capture.match(
      /\b(today|tomorrow|tonight|in \d+\s*(?:h|m|hours|mins)|at \d{1,2}(?::\d{2})?(?:am|pm)?)\b/i,
    )?.[0];
    if (tagMatches.length === 0 && !isUrgent && !timeMatch) return null;
    return { tags: tagMatches, isUrgent, timeMatch };
  }, [capture]);

  const submitCapture = async (event: FormEvent) => {
    event.preventDefault();
    if (!capture.trim()) return;

    soundFX.playClick();

    const isUrgent = /\b(!high|#urgent|p1|urgent)\b/i.test(capture);
    const isLow = /\b(!low|#low|p3)\b/i.test(capture);
    const priority = isUrgent ? 'high' : isLow ? 'low' : 'medium';

    const tagMatches = nlpPreview?.tags ?? [];
    const timeMatch = nlpPreview?.timeMatch;

    let cleanedTitle = capture
      .replace(/#([a-zA-Z0-9_-]+)/g, '')
      .replace(/\b(!high|#urgent|p1|urgent|!low|#low|p3)\b/gi, '')
      .replace(/\b(today|tomorrow|tonight|in \d+\s*(?:h|m|hours|mins)|at \d{1,2}(?::\d{2})?(?:am|pm)?)\b/gi, '')
      .trim();
    if (!cleanedTitle) cleanedTitle = capture.trim();

    let tagIds: number[] = [];
    if (tagMatches.length > 0) {
      try {
        const resolved = await Promise.all(
          tagMatches.map((name) => createTag({ name }))
        );
        tagIds = resolved.map((t) => t.id);
      } catch (err) {
        console.warn('Could not resolve quick capture tags:', err);
      }
    }

    create.mutate(
      {
        data: {
          title: cleanedTitle,
          status: 'open',
          priority,
          durationMin: 30,
          tagIds,
          ...(timeMatch
            ? { dueText: timeMatch, timezone: timezone() }
            : { dueAt: new Date().toISOString() }),
        },
      },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          setCapture('');
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListTagsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(summaryParams) });
          queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey(momentumParams) });
        },
      },
    );
  };

  const handleUpdateTask = (
    taskId: number,
    updates: { dueAt?: string | null; status?: 'inbox' | 'open' },
  ) => {
    updateTask.mutate(
      {
        id: taskId,
        data: updates,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(summaryParams) });
          queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey(momentumParams) });
        },
      },
    );
  };

  return (
    <div className="animate-enter">
      <SectionHeading
        title="Make room for the day."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                soundFX.playTactileClick();
                setRitualType('morning');
              }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14] text-xs font-medium text-zinc-300 hover:text-white transition-all active:scale-[0.98] tap-target-expand"
              title="Plan My Day Ritual"
            >
              <Sun className="size-3.5 text-primary" />
              <span className="hidden sm:inline">Plan Day</span>
            </button>

            <button
              onClick={() => {
                soundFX.playClick();
                setEditing({} as Task);
              }}
              data-testid="button-add-task"
              className="hidden h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14] px-3 text-xs font-medium text-zinc-300 hover:text-white transition-all sm:flex active:scale-[0.98] tap-target-expand"
            >
              <Plus size={14} className="text-zinc-400" />
              <span>Add task</span>
            </button>
          </div>
        }
      />

      {/* P14.2 order: 1 Start (dominant) Ãƒâ€šÃ‚Â· 2 rings Ãƒâ€šÃ‚Â· 3 timeline Ãƒâ€šÃ‚Â· 4 attention (capped 3) Ãƒâ€šÃ‚Â· 5 quiet footer.
          P3 "Start-first": the core failure is *starting*, so Start is the first
          thing on the page and the most prominent element, not an aside. */}
      <div className="mb-4">
        <NextUpCard
          task={
            next
              ? {
                  id: String(next.id),
                  title: next.title,
                  durationMin: next.durationMin,
                }
              : null
          }
          onStart={() => {
            soundFX.playFocusStart();
            setLocation('/focus');
          }}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        {/* Main Column */}
        <div className="min-w-0 space-y-3.5">
          {/* P14.2 Ãƒâ€šÃ‚Â§4: attention items ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â needs-attention tasks, pending proposals,
              memory confirmations ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â capped at 3 with "See all". Proposals are the
              sweep's asks, so they belong under attention, not above the fold. */}
          <RescheduleProposals tasks={taskList} />

          {/* Quick Capture Input (Linear / Superhuman Minimalist Standard) */}
          <form
            onSubmit={submitCapture}
            className="rounded-xl border border-white/[0.08] bg-muted p-1.5 transition-all focus-within:border-white/20 focus-within:bg-muted focus-within:shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
            data-testid="form-quick-capture"
          >
            <div className="flex items-center gap-2 px-2">
              <Plus size={15} className="text-zinc-500 shrink-0" />
              <input
                value={capture}
                onChange={(e) => setCapture(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && capture) {
                    setCapture('');
                  }
                }}
                placeholder="Capture task... (e.g. 'Review PR tomorrow 3pm #eng !high')"
                data-testid="input-quick-capture"
                className="h-8 min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 placeholder:text-zinc-500 outline-none"
              />
              <kbd className="hidden sm:inline-flex items-center rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-xs text-zinc-500">
                ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â½
              </kbd>
            </div>

            {/* Real-time NLP Detection Preview Chips */}
            {nlpPreview && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-2 pt-1.5 text-xs font-mono">
                <span className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">
                  Detected:
                </span>
                {nlpPreview.isUrgent && (
                  <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary font-semibold border border-primary/20">
                    <Flame size={10} /> high priority
                  </span>
                )}
                {nlpPreview.timeMatch && (
                  <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-accent font-medium border border-accent/20">
                    <Clock3 size={10} /> {nlpPreview.timeMatch}
                  </span>
                )}
                {nlpPreview.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 text-zinc-300 border border-white/[0.06]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </form>

          {/* Search & Filter Bar */}
          {taskList.length > 2 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted border border-white/[0.06] text-xs text-zinc-400">
              <Search className="size-3.5 text-zinc-500 shrink-0" />
              <input
                type="text"
                placeholder="Filter tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent outline-none text-zinc-200 placeholder:text-zinc-500 text-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-zinc-500 hover:text-zinc-300 text-xs"
                >
                  ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢
                </button>
              )}
            </div>
          )}

          {/* Section Subheader */}
          <div className="flex items-center justify-between pt-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <span>Tasks</span>
              {searchQuery && (
                <span className="text-xs text-accent lowercase font-normal">
                  ({filteredTasks.length} matching)
                </span>
              )}
            </h2>
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
              {summaryLoading ? 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â' : plural(summary?.open ?? 0, 'open')}
            </span>
          </div>

          {/* Task List or States */}
          {isLoading ? (
            <SkeletonList />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : filteredTasks.length === 0 ? (
            searchQuery ? (
              <div className="text-center py-10 text-xs text-zinc-500 bg-muted rounded-xl border border-white/[0.06]">
                No tasks match "{searchQuery}"
              </div>
            ) : (
              <EmptyState onAction={() => setEditing({} as Task)} />
            )
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onEdit={(t) => setEditing(t)}
                  onRefresh={() => {
                    refetch();
                    queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(summaryParams) });
                    queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey(momentumParams) });
                  }}
                />
              ))}
            </div>
          )}

          {/* Conversational agent: chat, action log, and "undo last action".
              Locked decision D-26 requires the agent to be able to change
              work only reversibly and visibly. */}
          <AgentPanel tasks={taskList} />
        </div>

        {/* Aside Column — Momentum (P14.2 §2 rings, moved here now that Start owns the top) */}
        <aside className="space-y-3.5">
          {/* Activity Rings Momentum Card */}
          <div
            className="card-enterprise rounded-xl border border-white/[0.08] bg-card p-4 shadow-xl"
            data-testid="card-momentum"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-400 font-bold">
                Momentum
              </span>
              <Link
                href="/review"
                onClick={() => soundFX.playClick()}
                className="text-xs text-primary font-medium hover:underline"
              >
                Review ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢
              </Link>
            </div>

            <div className="flex items-center justify-center py-1">
              <ActivityRings
                tasksCompleted={momentum?.tasksCompleted ?? summary?.completed ?? 0}
                tasksTotal={momentum?.tasksTotal ?? summary?.total ?? 0}
                roundsCompleted={momentum?.roundsCompleted ?? 0}
                roundTarget={momentum?.roundTarget ?? 4}
                streakDays={momentum?.streakDays ?? 0}
                size={144}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3 text-center text-xs">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                  Done
                </span>
                <p className="font-mono text-base font-bold text-primary">
                  {summary?.completed ?? 0}
                </p>
              </div>
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                  Focus
                </span>
                <p className="font-mono text-base font-bold text-success">
                  {summary?.focusMinutes ?? 0}m
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Quick Task Editor Modal */}
      {editing && (
        <TaskEditor
          task={editing.id ? editing : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
            queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(summaryParams) });
            queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey(momentumParams) });
          }}
        />
      )}

      {/* Guided Ritual Modal */}
      {ritualType && (
        <RitualDialog
          type={ritualType}
          tasks={taskList}
          onClose={() => setRitualType(null)}
          onUpdateTask={handleUpdateTask}
          onSelectNextUp={(id) => setCustomNextUpId(id)}
        />
      )}
    </div>
  );
}
export default TodayPage;
