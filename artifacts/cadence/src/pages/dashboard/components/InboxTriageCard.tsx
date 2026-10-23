import { useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, Inbox, RotateCcw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListTasksQueryKey,
  getGetMomentumQueryKey,
  getGetTaskSummaryQueryKey,
  useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';

interface InboxTriageCardProps {
  inboxTasks: Task[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function InboxTriageCard({
  inboxTasks,
  isLoading,
  isError = false,
  onRetry,
}: InboxTriageCardProps) {
  const queryClient = useQueryClient();
  const updateTask = useUpdateTask();
  const [processingId, setProcessingId] = useState<number | null>(null);

  const count = inboxTasks.length;
  const previewItems = inboxTasks.slice(0, 3);

  const handleMoveToToday = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessingId(task.id);
    soundFX.playTactileClick();

    updateTask.mutate(
      {
        id: task.id,
        data: {
          dueAt: new Date().toISOString(),
          status: 'open',
        },
      },
      {
        onSettled: () => {
          setProcessingId(null);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey() });
        },
      },
    );
  };

  const handleMarkDone = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessingId(task.id);
    soundFX.playCompletion();

    updateTask.mutate(
      {
        id: task.id,
        data: { status: 'completed' },
      },
      {
        onSettled: () => {
          setProcessingId(null);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey() });
        },
      },
    );
  };

  return (
    <section
      aria-labelledby="inbox-triage-heading"
      data-testid="card-dashboard-inbox"
      className="flex flex-col justify-between rounded-2xl border border-border-control/70 bg-card p-4 sm:p-5 shadow-lg overflow-hidden"
    >
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border-control/40 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid size-7 place-items-center rounded-control bg-status-warning-fill/15 text-status-warning-text shrink-0">
              <Inbox size={15} aria-hidden="true" />
            </span>
            <h2
              id="inbox-triage-heading"
              className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-bold truncate"
            >
              Inbox Triage
            </h2>
          </div>

          <span
            className={`rounded-full px-2 py-0.5 font-mono tabular-nums text-caption font-semibold shrink-0 ${
              !isLoading && !isError && count > 0
                ? 'bg-status-warning-fill/15 text-status-warning-text border border-status-warning-text/25'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {isLoading || isError ? '— items' : `${count} ${count === 1 ? 'item' : 'items'}`}
          </span>
        </div>

        <div className="mt-3.5 sm:mt-4">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-11 animate-pulse rounded-lg bg-muted/50" />
              <div className="h-11 animate-pulse rounded-lg bg-muted/50" />
            </div>
          ) : isError ? (
            <div className="py-5 text-center" data-testid="dashboard-inbox-error">
              <AlertTriangle size={22} className="mx-auto mb-2 text-status-warning-text" aria-hidden="true" />
              <p className="text-callout font-semibold text-foreground">Inbox couldn't load</p>
              <p className="mt-1 text-caption text-muted-foreground">
                Your captures are safe. Check your connection and try again.
              </p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    onRetry();
                  }}
                  className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground hover:bg-muted active:scale-98 tap-target-expand"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Retry
                </button>
              ) : null}
            </div>
          ) : count === 0 ? (
            <div className="py-6 text-center">
              <Inbox size={24} className="mx-auto text-muted-foreground mb-2 opacity-60" aria-hidden="true" />
              <p className="text-callout font-semibold text-foreground">Your inbox is empty.</p>
              <p className="mt-1 text-caption text-muted-foreground">
                No captures are waiting for triage.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {previewItems.map((task) => (
                <li
                  key={task.id}
                  className={`group relative flex items-center justify-between gap-2 rounded-xl border border-border-control/50 bg-muted/25 p-2.5 transition-all hover:bg-muted/40 hover:border-border-control ${
                    processingId === task.id ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  <span className="text-callout text-foreground truncate min-w-0 font-medium">
                    {task.title}
                  </span>

                  {/* Inline Micro-Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleMoveToToday(task, e)}
                      title="Schedule for Today"
                      aria-label={`Schedule ${task.title} for Today`}
                      data-testid={`button-inbox-today-${task.id}`}
                      className="grid size-7 place-items-center rounded-md border border-border-control/60 bg-card text-muted-foreground transition-all hover:text-primary-text hover:border-primary/40 hover:bg-primary/10 active:scale-95 tap-target-expand"
                    >
                      <Calendar size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleMarkDone(task, e)}
                      title="Mark Complete"
                      aria-label={`Mark ${task.title} Complete`}
                      data-testid={`button-inbox-done-${task.id}`}
                      className="grid size-7 place-items-center rounded-md border border-border-control/60 bg-card text-muted-foreground transition-all hover:text-status-success-text hover:border-status-success/40 hover:bg-status-success/10 active:scale-95 tap-target-expand"
                    >
                      <CheckCircle2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
              {count > 3 && (
                <li className="text-center font-mono tabular-nums text-caption text-muted-foreground pt-1">
                  +{count - 3} more awaiting triage
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-3.5 sm:mt-4 pt-3 border-t border-border-control/40">
        <Link
          href="/inbox"
          onClick={() => soundFX.playClick()}
          data-testid="link-dashboard-inbox"
          className="inline-flex w-full tap-target-h items-center justify-between rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground transition-colors hover:bg-muted active:scale-98"
        >
          <span>Open Full Inbox</span>
          <ArrowRight size={14} className="text-muted-foreground" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
