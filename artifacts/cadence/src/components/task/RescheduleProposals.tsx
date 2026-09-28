import { useMemo } from 'react';
import { CalendarClock, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListTasksQueryKey,
  useAcceptRescheduleProposal,
  useDeclineRescheduleProposal,
  useListRescheduleProposals,
  type Task,
} from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';
import { timezone } from '@/lib/date-utils';
import { toast } from 'sonner';

function formatWhen(iso: string | null): string {
  if (!iso) return 'unscheduled';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unscheduled';
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone(),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone(),
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return `${day} ${time}`;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Request failed';
}

/**
 * Pending reschedule decisions.
 *
 * The sweep runs in `ask` mode leaves proposals here instead of moving work
 * silently. This is the only place a user can accept or decline one, so it is
 * the surface that keeps the "never silently reschedule" rule true.
 */
export function RescheduleProposals({ tasks }: { tasks: Task[] }) {
  const queryClient = useQueryClient();
  const { data: proposals, isLoading, isError } = useListRescheduleProposals();
  const accept = useAcceptRescheduleProposal();
  const decline = useDeclineRescheduleProposal();

  const rows = useMemo(() => {
    const list = proposals ?? [];
    return list.map((p) => ({
      proposal: p,
      task: tasks.find((t) => t.id === p.taskId) ?? null,
    }));
  }, [proposals, tasks]);

  if (isLoading || rows.length === 0) return null;

  const afterChange = (onDone?: () => void) => {
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    onDone?.();
  };

  return (
    <section className="space-y-3" data-testid="reschedule-proposals">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-[#0A84FF]" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#0A84FF]">
          Reschedule Proposals ({rows.length})
        </h2>
        <span className="text-xs text-muted-foreground">
          Nothing moves until you decide
        </span>
      </div>

      {isError && (
        <p className="text-xs text-destructive">
          Could not load proposals. They remain pending on the server.
        </p>
      )}

      <div className="grid gap-3">
        {rows.map(({ proposal, task }) => (
          <div
            key={proposal.id}
            className="p-4 rounded-2xl bg-[#1C1C1E] border border-[#0A84FF]/30 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30">
                  Move
                </span>
                {task?.needsAttention && (
                  <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-destructive/15 text-destructive border border-destructive/30">
                    <AlertTriangle className="size-3" />
                    Needs attention
                  </span>
                )}
              </div>
              <p className="text-sm sm:text-base font-medium text-foreground truncate">
                {task?.title ?? `Task #${proposal.taskId}`}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="line-through">{formatWhen(proposal.fromDue)}</span>
                <span className="mx-1.5">&rarr;</span>
                <span className="font-mono font-bold text-foreground">
                  {formatWhen(proposal.toDue)}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  soundFX.playCompletion();
                  accept.mutate(
                    { id: proposal.id },
                    {
                      onSuccess: () => {
                        afterChange();
                        toast.success('Rescheduled', {
                          description: task?.title ?? `Task #${proposal.taskId}`,
                        });
                      },
                      onError: (err) =>
                        toast.error('Could not apply the move', {
                          description: errorMessage(err),
                        }),
                    },
                  );
                }}
                disabled={accept.isPending || decline.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#30D158] hover:bg-[#30D158]/90 text-black font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-60"
              >
                {accept.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Accept
              </button>
              <button
                onClick={() => {
                  soundFX.playTactileClick();
                  decline.mutate(
                    { id: proposal.id },
                    {
                      onSuccess: () => {
                        afterChange();
                        toast('Proposal declined', {
                          description: 'The task keeps its current due date.',
                        });
                      },
                      onError: (err) =>
                        toast.error('Could not decline', { description: errorMessage(err) }),
                    },
                  );
                }}
                disabled={accept.isPending || decline.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-muted-foreground hover:text-foreground font-medium text-xs transition-all active:scale-95 disabled:opacity-60"
              >
                <X className="size-4" />
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
