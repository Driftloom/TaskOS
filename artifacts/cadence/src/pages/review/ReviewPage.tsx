import { useMemo } from 'react';
import { Check, CheckCircle2, Flame, Sparkles } from 'lucide-react';
import { useGetTaskSummary, useListTasks } from '@workspace/api-client-react';
import { plural, today, timezone } from '@/lib/date-utils';
import { ProgressRing } from '@/components/shared/ActivityRings';
import { ErrorState, SectionHeading } from '@/components/shared/StateViews';

export function ReviewPage() {
  const params = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: summary, isLoading, isError, refetch } = useGetTaskSummary(params);

  const listParams = useMemo(
    () => ({ date: today(), scope: 'today' as const, timezone: timezone() }),
    [],
  );
  const { data: tasks } = useListTasks(listParams);

  const completedTasks = tasks?.filter((t) => t.status === 'completed') ?? [];
  const openTasks = tasks?.filter((t) => t.status !== 'completed') ?? [];

  return (
    <div className="animate-enter">
      <SectionHeading
        eyebrow="Review · close the loop"
        title="Notice what moved."
        detail="A calm, honest view of today's work based on what actually happened."
      />

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="h-56 animate-pulse rounded-3xl bg-[#1C1C1E]" />
          <div className="h-56 animate-pulse rounded-3xl bg-[#1C1C1E]" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          {/* Top Cards Grid */}
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            {/* Progress Card */}
            <div className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Today's Progress
              </p>

              <div className="mt-8 flex items-center gap-6">
                <ProgressRing
                  completed={summary?.completed ?? 0}
                  total={summary?.total ?? 0}
                  size={132}
                  strokeWidth={9}
                />
                <div>
                  <p className="text-4xl font-extrabold tracking-tight text-foreground">
                    {summary?.completed ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    of {summary?.total ?? 0} tasks finished
                  </p>
                </div>
              </div>

              <div className="mt-8 border-t border-white/[0.08] pt-5">
                <p className="text-xs leading-5 text-muted-foreground">
                  {summary?.completed
                    ? `You moved ${plural(summary.completed, 'task', '')} forward today. Real focus creates durable momentum.`
                    : 'The day is open. One clear, finished item is enough to begin.'}
                </p>
              </div>
            </div>

            {/* The Completed Ledger Card */}
            <div className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  The Ledger
                </p>
                <span className="font-mono text-xs text-primary font-bold">
                  {summary?.focusMinutes ?? 0} min focused
                </span>
              </div>

              <div className="mt-6 space-y-3">
                {completedTasks.length > 0 ? (
                  completedTasks.slice(0, 6).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3 text-sm"
                      data-testid={`review-task-${task.id}`}
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-400/20 text-emerald-400">
                        <Check size={13} strokeWidth={3} />
                      </span>
                      <span className="truncate font-semibold text-foreground">{task.title}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                        {task.durationMin}m
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/[0.08] p-8 text-center text-xs text-muted-foreground">
                    Completed tasks will settle here as you finish them.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Review Ritual Cards (Morning Plan & Evening Close) */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Morning Plan Ritual */}
            <div className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles size={16} />
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold">
                  Morning Ritual
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-foreground">Give the day a shape</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-5">
                Pick 2–3 essential outcomes. Schedule them into time blocks and push non-critical
                overflow to Inbox.
              </p>
              <div className="mt-4 flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span>{openTasks.length} tasks open in Today</span>
              </div>
            </div>

            {/* Evening Close Ritual */}
            <div className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 size={16} />
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold">
                  Evening Ritual
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-foreground">Close the loop</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-5">
                Check off what finished, move incomplete items forward without guilt, and leave a
                clear desk for tomorrow.
              </p>
              <div className="mt-4 flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Flame size={13} className="text-primary" />
                  <span>Streak preserved</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
