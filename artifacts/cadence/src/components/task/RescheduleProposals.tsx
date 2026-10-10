import { useMemo, useState } from 'react';
import { CalendarClock, TriangleAlert } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListTasksQueryKey,
  getGetTaskSummaryQueryKey,
  useAcceptRescheduleProposal,
  useDeclineRescheduleProposal,
  useGetRescheduleSettings,
  useListRescheduleProposals,
  type RescheduleProposal,
  type Task,
} from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';
import { plural, timezone, today } from '@/lib/date-utils';
import { toast } from 'sonner';
import { TaskEditor } from '@/components/task/TaskEditor';
import { ProposalCard, type ProposalVariant } from '@/components/task/ProposalCard';

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
 * `customFetch` throws `ApiError` with the HTTP status attached, but the class is
 * not re-exported from the package entry, so this reads the field structurally
 * rather than importing an internal.
 */
function errorStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: unknown }).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

/** A decision the user just made, kept on screen so nothing changes invisibly. */
interface SettledProposal {
  proposal: RescheduleProposal;
  task: Task | null;
  variant: Exclude<ProposalVariant, 'proposed' | 'failed'>;
  error: string | null;
}

function moveCountLabel(count: number): string {
  return plural(count, 'time', 's');
}

/**
 * Pending reschedule decisions.
 *
 * The sweep in `ask` mode leaves proposals here instead of moving work silently.
 * This is the only place a user can accept or decline one, so it is the surface
 * that keeps the "never silently reschedule" rule true (P3, Rule 7).
 *
 * §P11.1 non-negotiables are delegated to `ProposalCard`; this component owns the
 * data, the one-line "why", and the outcome state machine:
 *   accept 2xx  -> approved  (receipt: the task moved)
 *   accept 4xx  -> expired   (receipt: the server closed it WITHOUT moving it)
 *   decline 2xx -> declined  (receipt: the task kept its time)
 *   anything else failed    -> the card turns `failed`, keeps its controls, and
 *                               reports the error; the proposal is still pending
 *
 * ASYMMETRY THAT IS NOT A BUG: the list endpoint only returns `pending` rows
 * (artifacts/api-server/src/routes/reschedule.ts:31), so a receipt can never come
 * back from the server. `settled` is local state, and "Got it" clears it.
 * Refetching the list is what removes the pending row; the receipt is what tells
 * the user what happened to it.
 */
export function RescheduleProposals({ tasks }: { tasks: Task[] }) {
  const queryClient = useQueryClient();
  const { data: proposals, isLoading, isError } = useListRescheduleProposals();
  const { data: settings } = useGetRescheduleSettings();
  const accept = useAcceptRescheduleProposal();
  const decline = useDeclineRescheduleProposal();

  const [settled, setSettled] = useState<SettledProposal[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [changeTarget, setChangeTarget] = useState<Task | null>(null);
  // A mutation that did NOT resolve leaves the proposal pending on the server, so
  // it stays in the list and the failure is shown on its own card rather than as
  // a separate receipt. Recording it twice would render two cards with the same
  // id and the retry copy would point at a control the card no longer had.
  const [errors, setErrors] = useState<Record<number, string>>({});

  const maxMoves = settings?.maxMoves ?? 5;

  const rows = useMemo(() => {
    const list = proposals ?? [];
    return list.map((p) => ({
      proposal: p,
      task: tasks.find((t) => t.id === p.taskId) ?? null,
    }));
  }, [proposals, tasks]);

  const hasAnything = rows.length > 0 || settled.length > 0;

  const overdueCount = useMemo(() => {
    const now = Date.now();
    return tasks.filter(
      (t) => t.dueAt && new Date(t.dueAt).getTime() < now && t.status !== 'completed',
    ).length;
  }, [tasks]);

  const [checkingSweep, setCheckingSweep] = useState(false);

  const handleManualCheck = async () => {
    soundFX.playClick();
    setCheckingSweep(true);
    try {
      const res = await fetch('/api/reschedule/check', { method: 'POST' });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/reschedule/proposals'] });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      if (data.proposed > 0) {
        soundFX.playCompletion();
        toast.success(`Generated ${data.proposed} reschedule proposal(s)`);
      } else {
        toast.info(data.checked > 0 ? 'All overdue tasks already have pending proposals' : 'No overdue tasks found');
      }
    } catch {
      toast.error('Could not check reschedule slots');
    } finally {
      setCheckingSweep(false);
    }
  };

  // An error is never invisible: a failed load still renders the section so the
  // user learns the proposals are still waiting on the server. Only a genuinely
  // empty, healthy list collapses to nothing.
  if (isLoading) return null;
  if (!hasAnything && !isError) {
    if (overdueCount > 0) {
      return (
        <div
          data-testid="reschedule-overdue-banner"
          className="rounded-xl border border-border-control bg-card p-3.5 shadow-sm flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <CalendarClock className="size-4 text-accent shrink-0" aria-hidden="true" />
            <div>
              <p className="text-caption font-semibold text-foreground">
                {plural(overdueCount, 'task', 's')} past scheduled time
              </p>
              <p className="text-caption text-muted-foreground">
                Reschedule engine can propose new slots for today.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualCheck}
            disabled={checkingSweep}
            data-testid="button-check-reschedule"
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border-control bg-muted px-3 text-caption font-semibold text-foreground transition-colors hover:bg-card active:scale-98"
          >
            {checkingSweep ? 'Checking…' : 'Check slots'}
          </button>
        </div>
      );
    }
    return null;
  }

  const afterChange = (onDone?: () => void) => {
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }),
    });
    onDone?.();
  };

  const record = (
    proposal: RescheduleProposal,
    task: Task | null,
    variant: Exclude<ProposalVariant, 'proposed' | 'failed'>,
    error: string | null,
  ) => {
    setErrors((prev) => {
      if (!(proposal.id in prev)) return prev;
      const next = { ...prev };
      delete next[proposal.id];
      return next;
    });
    setSettled((prev) => [
      ...prev.filter((s) => s.proposal.id !== proposal.id),
      { proposal, task, variant, error },
    ]);
  };

  const setFailure = (proposalId: number, message: string) => {
    setErrors((prev) => ({ ...prev, [proposalId]: message }));
  };

  const handleApprove = (proposal: RescheduleProposal, task: Task | null) => {
    soundFX.playCompletion();
    setBusyId(proposal.id);
    accept.mutate(
      { id: proposal.id },
      {
        onSuccess: () => {
          afterChange();
          record(proposal, task, 'approved', null);
          toast.success('Rescheduled', {
            description: task?.title ?? `Task #${proposal.taskId}`,
          });
        },
        onError: (err) => {
          // The accept endpoint answers 400 when it closed the proposal as
          // `expired` (cap reached, task completed, task gone) and 404 when the
          // proposal is already gone. Both paths leave `tasks.due_at` untouched
          // (artifacts/api-server/src/routes/reschedule.ts:80-124), so both mean
          // "this can no longer be applied" rather than "something broke" — and
          // the row is gone from the next list load, so it earns a receipt. Any
          // other status left the proposal pending, so the card stays in the
          // list, keeps its controls, and reports the failure instead.
          const message = errorMessage(err);
          const status = errorStatus(err);
          const expired = status === 400 || status === 404;
          if (expired) {
            record(proposal, task, 'expired', `${message} Nothing was changed.`);
            afterChange();
            toast.error('That move was no longer valid', {
              description: 'The task keeps the time it had before.',
            });
            return;
          }
          setFailure(
            proposal.id,
            `${message} Nothing was changed — the task keeps the time it had.`,
          );
          toast.error('Could not apply the move', {
            description: 'The task keeps the time it had before.',
          });
        },
        onSettled: () => setBusyId(null),
      },
    );
  };

  const handleDismiss = (proposal: RescheduleProposal, task: Task | null) => {
    soundFX.playTactileClick();
    setBusyId(proposal.id);
    decline.mutate(
      { id: proposal.id },
      {
        onSuccess: () => {
          afterChange();
          record(proposal, task, 'declined', null);
          toast('Proposal dismissed', {
            description: 'The task keeps its current due date.',
          });
        },
        onError: (err) => {
          // A failed decline leaves the proposal pending, so the card stays put
          // and keeps its controls rather than becoming a settled receipt.
          setFailure(proposal.id, `${errorMessage(err)} Nothing was changed.`);
          toast.error('Could not dismiss', { description: errorMessage(err) });
        },
        onSettled: () => setBusyId(null),
      },
    );
  };

  /**
   * "Change" hands the decision back to the user: open the task editor on the
   * task in question. The proposal is only declined once the user actually saves
   * a new time, so cancelling the editor leaves the proposal exactly as it was.
   * There is no `change` endpoint in the API contract (lib/api-spec/openapi.yaml
   * exposes only accept and decline), so this is the honest implementation of
   * P11.1's "Change" without inventing a route.
   */
  const handleChange = (proposal: RescheduleProposal, task: Task | null) => {
    if (!task) {
      toast.error('That task is not available', {
        description: 'The proposal can only be approved or dismissed.',
      });
      return;
    }
    soundFX.playTactileClick();
    setChangeTarget(task);
  };

  const commitChange = () => {
    const task = changeTarget;
    setChangeTarget(null);
    if (!task) return;
    const proposal =
      rows.find((r) => r.task?.id === task.id)?.proposal ??
      settled.find((s) => s.task?.id === task.id)?.proposal;
    if (!proposal) return;
    soundFX.playCompletion();
    // No `settled` receipt here on purpose: the user set this time themselves, so
    // a "you dismissed this / the task keeps the time it had" receipt would be
    // false, and `approved` would wrongly claim an engine-initiated move
    // (Rule 5 only counts engine moves, never manual edits). The toast is the
    // feedback; the row simply stops being pending.
    decline.mutate(
      { id: proposal.id },
      {
        onSuccess: () => {
          afterChange();
          toast('Proposal dismissed', {
            description: `"${task.title}" now uses the time you set.`,
          });
        },
        onError: (err) =>
          toast.error('Time saved, proposal still open', {
            description: `${errorMessage(err)} You can dismiss it on this card.`,
          }),
      },
    );
  };

  const why = (task: Task | null): string => {
    const moves = task?.rescheduleCount ?? 0;
    if (task?.needsAttention && moves >= maxMoves) {
      return `This task has already been moved ${moveCountLabel(moves)}, so the cap of ${maxMoves} is reached and the sweep stopped moving it.`;
    }
    if (task?.needsAttention) {
      return 'The sweep could not find a free slot before the next commitment, so it flagged this instead of guessing.';
    }
    if (moves > 0) {
      return `This task is past its time and has already slipped ${moveCountLabel(moves)} — this would be move ${moves + 1} of ${maxMoves}.`;
    }
    return 'This task is past its time and the next free slot is later today.';
  };

  return (
    <section className="space-y-3" data-testid="reschedule-proposals">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="size-4 text-accent" aria-hidden="true" />
        <h2 className="text-micro font-bold uppercase tracking-wider text-accent">
          Reschedule Proposals ({rows.length})
        </h2>
        <span className="text-caption text-muted-foreground">Nothing moves until you decide</span>
      </div>

      {isError ? (
        <p role="alert" className="flex items-center gap-1.5 text-caption text-destructive">
          <TriangleAlert size={12} aria-hidden="true" />
          Could not load proposals. They remain pending on the server.
        </p>
      ) : null}

      <div className="grid gap-3">
        {rows.map(({ proposal, task }) => (
          <ProposalCard
            key={proposal.id}
            proposalId={proposal.id}
            taskId={proposal.taskId}
            taskTitle={task?.title ?? `Task #${proposal.taskId}`}
            fromLabel={formatWhen(proposal.fromDue)}
            toLabel={formatWhen(proposal.toDue)}
            why={why(task)}
            variant={errors[proposal.id] ? 'failed' : 'proposed'}
            error={errors[proposal.id] ?? null}
            needsAttention={Boolean(task?.needsAttention)}
            moves={task?.rescheduleCount ?? 0}
            maxMoves={maxMoves}
            busy={busyId === proposal.id}
            onApprove={() => handleApprove(proposal, task)}
            onChange={() => handleChange(proposal, task)}
            onDismiss={() => handleDismiss(proposal, task)}
          />
        ))}

        {/* Receipts for decisions already made in this session. */}
        {settled.map(({ proposal, task, variant, error }) => (
          <ProposalCard
            key={`settled-${proposal.id}`}
            proposalId={proposal.id}
            taskId={proposal.taskId}
            taskTitle={task?.title ?? `Task #${proposal.taskId}`}
            fromLabel={formatWhen(proposal.fromDue)}
            toLabel={formatWhen(proposal.toDue)}
            why={why(task)}
            variant={variant}
            needsAttention={Boolean(task?.needsAttention)}
            moves={task?.rescheduleCount ?? 0}
            maxMoves={maxMoves}
            error={error}
            onAcknowledge={() =>
              setSettled((prev) => prev.filter((s) => s.proposal.id !== proposal.id))
            }
          />
        ))}
      </div>

      {changeTarget ? (
        <TaskEditor
          task={changeTarget}
          onClose={() => setChangeTarget(null)}
          onSaved={commitChange}
        />
      ) : null}
    </section>
  );
}
