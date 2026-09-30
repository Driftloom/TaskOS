import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CloudOff,
  History,
  Info,
  Loader2,
  Send,
  Sparkles,
  Undo2,
  Wrench,
} from 'lucide-react';
import {
  useAgentChat,
  useAgentUndo,
  useListAgentActions,
  useGetAgentUsage,
  useGetMomentum,
  useGetTaskSummary,
  getGetMomentumQueryKey,
  getGetTaskSummaryQueryKey,
  getListAgentActionsQueryKey,
  getListTasksQueryKey,
  type AgentAction,
  type Task,
} from '@workspace/api-client-react';
import { today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
import { AgentActionCard, type AgentActionChange } from './AgentActionCard';
import { ActionPreview, BULK_CONFIRM_THRESHOLD, type ActionPreviewChange } from './ActionPreview';

/**
 * Conversational agent surface — docs/13-master-design-system-prompt.md §P15.
 *
 * The panel is only the frame. The two §P11.1 components that carry the actual
 * contract live beside it and are the surfaces any agent change must render:
 *   - `AgentActionCard`  §P15.1 anatomy (all six elements) and §P15.2 states.
 *   - `ActionPreview`    the awaiting-approval surface, incl. the >10 threshold.
 *   - `AITag`            provenance, reused from CadenceDomain, never re-made.
 *
 * §P15.3 rules this file is responsible for:
 *  - "Undo last agent action" is ONE TAP in this header, backed by the
 *    agent_action_log endpoint.
 *  - Anti-anthropomorphism: no human name, no avatar, no claimed feelings or
 *    intent, neutral Sparkles glyph, plain verbs, no first person in UI copy.
 *    The panel calls itself "Assistant"; user turns carry no AITag and assistant
 *    turns and their action cards do.
 *  - The trust boundary is stated in the UI, not only in the spec.
 *
 * DATA HONESTY. Every verb, count, object, and date below is read out of the real
 * API response (`toolCallsExecuted[].name/arguments/result`), the real
 * agent_action_log rows, and the real `tasks` prop. Nothing is inferred, and
 * where the current contract carries no field for something §P15.1 asks for, the
 * surface says so rather than guessing:
 *   - `agent_action_log` has no run id, so log cards are one-per-logged-action
 *     and cannot be regrouped into a single "Rescheduled 4 tasks" card.
 *   - It also has no `undoneAt` and no `inputs_used`, so an undone log card shows
 *     "Undone" with the original kept in the log, and the data-used line names
 *     the action log and the list the action read.
 *   - There is no endpoint that resumes a >10 confirmation, so when the parent
 *     does not supply `onConfirmApproval` the preview's Confirm is disabled with
 *     a visible reason instead of pretending to have run.
 */

// ---------------------------------------------------------------------------
// Tool vocabulary. These are the real tool names in
// artifacts/api-server/src/lib/agent/tools.ts (AGENT_TOOLS_DEFINITIONS).
// ---------------------------------------------------------------------------

type ToolName =
  | 'create_task'
  | 'update_task'
  | 'complete_task'
  | 'query_schedule'
  | 'bulk_reschedule'
  | 'undo_last_action';

const READ_ONLY_TOOLS: ToolName[] = ['query_schedule'];

/** P15.2: a tool step is named and specific ("Checking your calendar…"). */
const TOOL_PAST: Record<ToolName, string> = {
  create_task: 'Created a task',
  update_task: 'Edited a task',
  complete_task: 'Completed a task',
  query_schedule: 'Checked your calendar',
  bulk_reschedule: 'Moved tasks on your schedule',
  undo_last_action: 'Undid the last action',
};

const TOOL_VERB: Record<ToolName, { verb: string; noun: { one: string; many: string } }> = {
  create_task: { verb: 'Created', noun: { one: 'task', many: 'tasks' } },
  update_task: { verb: 'Edited', noun: { one: 'task', many: 'tasks' } },
  complete_task: { verb: 'Completed', noun: { one: 'task', many: 'tasks' } },
  query_schedule: { verb: 'Checked', noun: { one: 'block', many: 'blocks' } },
  bulk_reschedule: { verb: 'Moved', noun: { one: 'task', many: 'tasks' } },
  undo_last_action: { verb: 'Undid', noun: { one: 'action', many: 'actions' } },
};

const TOOL_CHANGE_VERB: Record<ToolName, string> = {
  create_task: 'Created',
  update_task: 'Edited',
  complete_task: 'Completed',
  query_schedule: 'Read',
  bulk_reschedule: 'Moved',
  undo_last_action: 'Undid',
};

/** What each tool genuinely reads, for the §P15.1 "Used:" line. */
const TOOL_DATA_USED: Record<ToolName, string[]> = {
  create_task: ['Your request', 'Your task list'],
  update_task: ['Your request', 'Your task list'],
  complete_task: ['Your request', 'Your task list'],
  query_schedule: ['Your schedule'],
  bulk_reschedule: ['Your request', 'Your task list', 'Your schedule'],
  undo_last_action: ['The action log'],
};

/** The `action` values tools.ts writes to agent_action_log (not tool names). */
const LOG_VERB: Record<string, { verb: string; noun: { one: string; many: string } }> = {
  create_task: { verb: 'Created', noun: { one: 'task', many: 'tasks' } },
  update_task: { verb: 'Edited', noun: { one: 'task', many: 'tasks' } },
  complete_task: { verb: 'Completed', noun: { one: 'task', many: 'tasks' } },
  reschedule_task: { verb: 'Moved', noun: { one: 'task', many: 'tasks' } },
};

const LOG_CHANGE_VERB: Record<string, string> = {
  create_task: 'Created',
  update_task: 'Edited',
  complete_task: 'Completed',
  reschedule_task: 'Moved',
};

// ---------------------------------------------------------------------------
// Runtime readers. The generated client types tool calls as
// `{ [key: string]: unknown }`, so every read has to be checked.
// ---------------------------------------------------------------------------

interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
  data: Record<string, unknown> | null;
  success: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

function readToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolCall[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const name = asString(rec.name);
    if (!name) continue;
    const result = asRecord(rec.result);
    out.push({
      name: name as ToolName,
      args: asRecord(rec.arguments) ?? {},
      data: asRecord(result?.data),
      success: result?.success !== false,
    });
  }
  return out;
}

/** YYYY-MM-DD renders as a calendar day; anything else renders with a time. */
function formatWhen(value: string | null | undefined): string {
  if (!value) return 'Unscheduled';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: dateOnly ? 'UTC' : timezone(),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
  if (dateOnly) return day;
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone(),
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return `${day} ${time}`;
}

function formatClock(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone(),
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function httpStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return null;
}

/**
 * P17.3 error taxonomy for the one request this panel makes. Never leaks a stack
 * trace or a raw provider error, and always says what state things are in.
 */
function classifyError(
  err: unknown,
  online: boolean,
): { state: 'queued' | 'offline' | 'failed'; reason: string } {
  if (!online) {
    return {
      state: 'offline',
      reason: 'No connection, so the request never reached the assistant.',
    };
  }
  const status = httpStatus(err);
  if (status === 429) {
    return {
      state: 'queued',
      reason: "The assistant's provider is busy and throttling requests. Your request is queued and will retry.",
    };
  }
  if (status !== null && status >= 500) {
    return { state: 'failed', reason: 'Something went wrong on the server side.' };
  }
  if (err instanceof TypeError) {
    return { state: 'offline', reason: 'The connection dropped before the assistant replied.' };
  }
  return { state: 'failed', reason: 'The assistant could not complete that request.' };
}

// ---------------------------------------------------------------------------
// Panel state
// ---------------------------------------------------------------------------

type FailureState = 'queued' | 'offline' | 'failed';

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** The user request this turn answers, used for "Why?" and Retry. */
  request?: string;
  readTools?: ToolCall[];
  mutations?: ToolCall[];
  memoryFactCount?: number;
  failure?: FailureState | null;
  notice?: boolean;
  /** Timestamp the assistant turn landed, for the card's status detail. */
  at?: string;
}

/** A pending approval built from a real `bulk_reschedule` tool call. */
export interface AgentPendingApproval {
  verb: string;
  changes: ActionPreviewChange[];
  notChanged: string[];
  dataUsed: string[];
  why: string | null;
  /** Set when the agent demanded confirmation without describing the changes. */
  unavailableReason: string | null;
  taskIds: number[];
  targetDate: string | null;
}

export interface AgentPanelProps {
  tasks: Task[];
  /**
   * Optional escape hatch. `POST /agent/chat` has no confirm/resume endpoint, so
   * a >10 confirmation cannot be executed from this panel alone. When supplied,
   * ActionPreview's Confirm calls it with the effective change list. When it is
   * not, Confirm is disabled with a visible reason (§P12).
   */
  onConfirmApproval?: (changes: ActionPreviewChange[]) => void;
  /**
   * Overrides the Confirm-disabled reason shown when there is no
   * `onConfirmApproval`. The default states the gap plainly.
   */
  confirmDisabledReason?: string;
  className?: string;
}

/** P17.2 agent empty state: example requests that the engine handles today. */
const SUGGESTIONS = [
  "What's due today?",
  'Reschedule task 3 to tomorrow',
  'Undo my last change',
];

const TRUST_BOUNDARY =
  'The assistant can create, edit, move, and complete tasks. It cannot permanently delete anything.';

const DEFAULT_CONFIRM_REASON =
  'Confirming a change this size needs a confirmation step this build does not have yet. Nothing has been changed — cancel, or edit the request and send it again.';

export function AgentPanel({
  tasks,
  onConfirmApproval,
  confirmDisabledReason,
  className = '',
}: AgentPanelProps) {
  const queryClient = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [approval, setApproval] = useState<AgentPendingApproval | null>(null);
  const [stopped, setStopped] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const discardReplyRef = useRef(false);

  const chat = useAgentChat();
  const undo = useAgentUndo();
  const { data: actions } = useListAgentActions();
  const { data: usage } = useGetAgentUsage();
  const momentumParams = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: momentum } = useGetMomentum(momentumParams);
  const { data: summary } = useGetTaskSummary(momentumParams);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, approval]);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const refreshDerived = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey(momentumParams) });
    queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(momentumParams) });
    // P15.2 "undone": the log row has to flip to Undone, or the card lies.
    queryClient.invalidateQueries({ queryKey: getListAgentActionsQueryKey() });
  }, [queryClient, momentumParams]);

  const logEntries = useMemo<AgentAction[]>(() => actions?.actions ?? [], [actions]);
  // The API undoes the LAST action only, so exactly one card may offer Undo.
  const newestUndoableId = useMemo(() => {
    const first = logEntries.find((a) => !a.undone);
    return first ? first.id : null;
  }, [logEntries]);
  const hasUndoable = newestUndoableId !== null;

  const taskById = useMemo(() => {
    const map = new Map<number, Task>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  // --- P15.1 line builders, all fed by real response data -------------------

  const affectedTasks = useCallback(
    (tool: ToolCall): Task[] =>
      asNumberArray(tool.args.taskIds)
        .map((id) => taskById.get(id))
        .filter((t): t is Task => Boolean(t)),
    [taskById],
  );

  const notChangedFor = useCallback((affected: Task[]): string[] => {
    const off = affected.filter((t) => t.automation === 'off').length;
    const out = ['Fixed events (never moved automatically)'];
    if (off > 0) out.push(`${off} ${off === 1 ? 'task is' : 'tasks are'} set to Off`);
    return out;
  }, []);

  const whyFor = useCallback((request: string, tool: ToolCall): string => {
    if (tool.name === 'undo_last_action') {
      return `Reversed the most recent change the assistant made, because you asked to undo it. Request: "${request}".`;
    }
    if (tool.name === 'bulk_reschedule') {
      return `Moved the work you named in this request. Request: "${request}". Fixed events were not touched.`;
    }
    return `Ran in response to your request. Request: "${request}".`;
  }, []);

  const dataUsedFor = useCallback((tools: ToolCall[], memoryFactCount: number): string[] => {
    const set = new Set<string>();
    for (const t of tools) {
      for (const d of TOOL_DATA_USED[t.name] ?? []) set.add(d);
    }
    if (memoryFactCount > 0) {
      set.add(`${memoryFactCount} ${memoryFactCount === 1 ? 'memory fact' : 'memory facts'}`);
    }
    return [...set];
  }, []);

  const countFor = useCallback((tool: ToolCall): number => {
    if (tool.name === 'bulk_reschedule') {
      const moved = tool.data?.movedCount;
      if (typeof moved === 'number') return moved;
      return asNumberArray(tool.args.taskIds).length;
    }
    return 1;
  }, []);

  /** Real change rows for a tool call. Empty when the response carries none. */
  const changesFor = useCallback(
    (tool: ToolCall): AgentActionChange[] => {
      if (tool.name === 'create_task') {
        const title = asString(tool.args.title) ?? 'New task';
        const due = asString(tool.args.dueAt);
        return [{ id: 'created', object: title, to: due ? formatWhen(due) : 'No due date' }];
      }
      if (tool.name === 'complete_task') {
        const id = typeof tool.args.id === 'number' ? tool.args.id : null;
        const task = id === null ? null : taskById.get(id);
        return [
          {
            id: String(id ?? 'completed'),
            object: task?.title ?? (id === null ? 'Task' : `Task #${id}`),
            to: 'Marked completed',
          },
        ];
      }
      if (tool.name === 'update_task') {
        const id = typeof tool.args.id === 'number' ? tool.args.id : null;
        const task = id === null ? null : taskById.get(id);
        const fields = Object.keys(tool.args).filter((k) => k !== 'id');
        return [
          {
            id: String(id ?? 'updated'),
            object: task?.title ?? (id === null ? 'Task' : `Task #${id}`),
            note: fields.length > 0 ? `Updated ${fields.join(', ')}` : 'No fields changed',
          },
        ];
      }
      if (tool.name === 'bulk_reschedule') {
        const moved = tool.data?.tasks;
        const target = asString(tool.data?.targetDue) ?? asString(tool.args.targetDate);
        if (Array.isArray(moved) && moved.length > 0) {
          return moved.map((raw, i) => {
            const rec = asRecord(raw);
            const recId = rec ? rec.id : undefined;
            const id = typeof recId === 'number' ? recId : i;
            const title = asString(rec?.title) ?? `Task #${id}`;
            const dueAt = asString(rec?.dueAt);
            return {
              id: String(id),
              object: title,
              to: dueAt ? formatWhen(dueAt) : formatWhen(target),
            };
          });
        }
        // The engine can report success without echoing the rows; fall back to
        // the ids the assistant named, which are real.
        return asNumberArray(tool.args.taskIds).map((id) => ({
          id: String(id),
          object: taskById.get(id)?.title ?? `Task #${id}`,
          to: formatWhen(target),
        }));
      }
      if (tool.name === 'undo_last_action') {
        const targetIdRaw = tool.data?.targetId;
        const targetId = typeof targetIdRaw === 'number' ? targetIdRaw : null;
        const undone = asString(tool.data?.undoneAction);
        return [
          {
            id: 'undone',
            object: targetId === null ? 'Last change' : `Task #${targetId}`,
            note: undone ? `Reversed ${undone.replace(/_/g, ' ')}` : 'Reversed the last change',
          },
        ];
      }
      return [];
    },
    [taskById],
  );

  // --- approval ------------------------------------------------------------

  const buildApproval = useCallback(
    (request: string, tools: ToolCall[], memoryFactCount: number): AgentPendingApproval => {
      const bulk = tools.find((t) => t.name === 'bulk_reschedule');
      if (!bulk) {
        return {
          verb: 'Apply',
          changes: [],
          notChanged: notChangedFor([]),
          dataUsed: dataUsedFor(tools, memoryFactCount),
          why: `Waiting for your approval. Request: "${request}".`,
          unavailableReason:
            'The assistant asked you to confirm this request but did not list what it would change.',
          taskIds: [],
          targetDate: null,
        };
      }
      const taskIds = asNumberArray(bulk.args.taskIds);
      const targetDate = asString(bulk.args.targetDate);
      const changes: ActionPreviewChange[] = taskIds.map((id) => {
        const task = taskById.get(id);
        return {
          id: String(id),
          title: task?.title ?? `Task #${id}`,
          from: task ? formatWhen(task.dueAt) : null,
          to: formatWhen(targetDate),
          kind: 'move',
          fixed: task?.automation === 'off',
          fixedLabel: 'Set to Off — not moved automatically',
        };
      });
      return {
        verb: 'Move',
        changes,
        notChanged: notChangedFor(affectedTasks(bulk)),
        dataUsed: dataUsedFor(tools, memoryFactCount),
        why: `Moves the work you named, so the target date has room. Request: "${request}". Fixed events are not touched.`,
        unavailableReason:
          changes.length === 0
            ? 'The assistant asked you to confirm a change but did not name which tasks it affects.'
            : null,
        taskIds,
        targetDate,
      };
    },
    [affectedTasks, dataUsedFor, notChangedFor, taskById],
  );

  // --- request / response --------------------------------------------------

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || chat.isPending || !isOnline) return;

      setTurns((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: message }]);
      setInput('');
      setApproval(null);
      setStopped(false);
      discardReplyRef.current = false;

      chat.mutate(
        { data: { message, channel: 'app' } },
        {
          onSuccess: (res) => {
            // Tools already ran server-side, so the cache refresh happens either
            // way — a stopped reply must never hide a change that did happen.
            refreshDerived();
            const tools = readToolCalls(res.toolCallsExecuted);
            const memoryFactCount = res.memoryApplied?.length ?? 0;

            if (discardReplyRef.current) {
              setTurns((prev) => [
                ...prev,
                {
                  id: `a-${Date.now()}`,
                  role: 'assistant',
                  text: 'Stopped. The reply was discarded. Anything the request already changed is listed in the action log.',
                  notice: true,
                },
              ]);
              return;
            }

            soundFX.playCompletion();
            setTurns((prev) => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                text: res.reply,
                request: message,
                readTools: tools.filter((t) => READ_ONLY_TOOLS.includes(t.name)),
                mutations: tools.filter((t) => !READ_ONLY_TOOLS.includes(t.name)),
                memoryFactCount,
                at: new Date().toISOString(),
              },
            ]);
            if (res.requiresConfirmation) {
              setApproval(buildApproval(message, tools, memoryFactCount));
            }
          },
          onError: (err) => {
            const { state, reason } = classifyError(err, isOnline);
            if (discardReplyRef.current) {
              setTurns((prev) => [
                ...prev,
                {
                  id: `a-${Date.now()}`,
                  role: 'assistant',
                  text: 'Stopped. The request did not complete, so nothing was changed.',
                  notice: true,
                },
              ]);
              return;
            }
            setTurns((prev) => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                text: reason,
                request: message,
                failure: state,
                notice: true,
              },
            ]);
            setApproval(null);
          },
        },
      );
    },
    [buildApproval, chat, isOnline, refreshDerived],
  );

  /** P15.2 Stop. The reply is discarded; anything that ran is still in the log. */
  const handleStop = useCallback(() => {
    discardReplyRef.current = true;
    setStopped(true);
    soundFX.playTactileClick();
  }, []);

  const handleUndo = useCallback(() => {
    soundFX.playTactileClick();
    undo.mutate(
      { data: {} },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          refreshDerived();
          toast.success('Last assistant action reverted');
        },
        onError: (err) =>
          toast.error('Nothing was undone', { description: classifyError(err, isOnline).reason }),
      },
    );
  }, [isOnline, refreshDerived, undo]);

  const handleApprove = useCallback(
    (changes: ActionPreviewChange[]) => {
      if (!onConfirmApproval) return;
      soundFX.playClick();
      onConfirmApproval(changes);
      setApproval(null);
      toast.success(`${changes.length} ${changes.length === 1 ? 'task' : 'tasks'} moved`, {
        description: 'Undo is one tap above, and the change is written to the action log.',
      });
    },
    [onConfirmApproval],
  );

  const handleCancelApproval = useCallback(() => {
    setApproval(null);
    setTurns((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: 'Cancelled. Nothing was changed.',
        notice: true,
      },
    ]);
  }, []);

  const handleEditRequest = useCallback(() => {
    if (!approval) return;
    const first = approval.changes[0];
    setInput(
      first
        ? `Move only task ${first.id} to ${approval.targetDate ?? 'a new date'}`
        : 'Move ',
    );
    setApproval(null);
    inputRef.current?.focus();
  }, [approval]);

  const working = chat.isPending && !stopped;

  // --- render --------------------------------------------------------------

  return (
    <div className={`space-y-3 ${className}`} data-testid="agent-panel">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          {/* P15.3 neutral glyph. No face, no name, no avatar. */}
          <Sparkles
            size={14}
            className="shrink-0 text-ai"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <h2 className="text-footnote font-bold uppercase tracking-wider text-ai">Assistant</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            aria-expanded={showLog}
            aria-controls="agent-log"
            data-testid="agent-log-toggle"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-control bg-card px-2.5 text-caption font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent tap-target-expand"
          >
            <History size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            Log{logEntries.length > 0 ? ` (${logEntries.length})` : ''}
          </button>
          {/* P15.3: undo last agent action is always one tap, right here. */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={!hasUndoable || undo.isPending || !isOnline}
            aria-busy={undo.isPending || undefined}
            data-testid="agent-undo-last"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-control bg-card px-2.5 text-caption font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand"
          >
            {undo.isPending ? (
              <Loader2 size={12} className="shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Undo2 size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            Undo last
          </button>
        </div>
      </div>

      {/* P12: disabled is never silent — say which of the three reasons applies. */}
      {!hasUndoable || !isOnline ? (
        <p
          className="text-caption leading-relaxed text-muted-foreground"
          data-testid="agent-undo-reason"
        >
          {!hasUndoable
            ? 'Nothing to undo yet. Every change the assistant makes is reversible from here.'
            : 'Undo needs a connection. It will work again as soon as you are back online.'}
        </p>
      ) : null}

      {/* P15.3: the trust boundary is stated in the UI. */}
      <p
        className="flex items-start gap-1.5 rounded-lg border border-border-subtle bg-muted px-2.5 py-2 text-caption leading-relaxed text-muted-foreground"
        data-testid="agent-trust-boundary"
      >
        <Info size={12} className="mt-0.5 shrink-0 text-ai" aria-hidden="true" />
        <span className="min-w-0">{TRUST_BOUNDARY}</span>
      </p>

      {/* P15.2 offline: agent unavailable, non-AI features continue. The global
          OfflineBanner is AppShell's job and is deliberately not duplicated. */}
      {!isOnline ? (
        <div
          className="flex items-start gap-1.5 rounded-lg border border-status-warning-fill/40 bg-status-warning-fill/10 px-2.5 py-2 text-caption leading-relaxed text-foreground"
          data-testid="agent-offline"
          role="status"
        >
          <CloudOff
            size={12}
            className="mt-0.5 shrink-0 text-status-warning-text"
            aria-hidden="true"
          />
          <span className="min-w-0">
            The assistant is unavailable while you are offline. Capturing tasks, the calendar, and
            focus rounds all keep working — none of them need the assistant.
          </span>
        </div>
      ) : null}

      {/* Live context, so the assistant is not guessing about your day. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ContextChip label="tasks today" value={summary?.total ?? 0} />
        <ContextChip label="open" value={summary?.open ?? 0} />
        <ContextChip
          label="rounds"
          value={`${momentum?.roundsCompleted ?? 0}/${momentum?.roundTarget ?? 0}`}
        />
        <ContextChip label="streak" value={`${momentum?.streakDays ?? 0}d`} />
        {usage?.usage ? <ContextChip label="assistant calls" value={usage.usage.totalCalls} /> : null}
      </div>

      {/* P15.2 awaiting approval. */}
      {approval ? (
        <ActionPreview
          verb={approval.verb}
          changes={approval.changes}
          notChanged={approval.notChanged}
          dataUsed={approval.dataUsed}
          why={approval.why}
          unavailableReason={approval.unavailableReason}
          threshold={BULK_CONFIRM_THRESHOLD}
          busy={chat.isPending}
          confirmDisabledReason={
            onConfirmApproval ? null : (confirmDisabledReason ?? DEFAULT_CONFIRM_REASON)
          }
          onConfirm={handleApprove}
          onEdit={handleEditRequest}
          onCancel={handleCancelApproval}
        />
      ) : null}

      {showLog ? (
        <div
          id="agent-log"
          className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border bg-card p-3"
          data-testid="agent-log"
        >
          <h3 className="font-mono text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            Action log
          </h3>
          {logEntries.length > 0 ? (
            logEntries.map((entry) => (
              <LogCard
                key={entry.id}
                entry={entry}
                task={entry.targetId != null ? taskById.get(entry.targetId) : undefined}
                onUndo={entry.id === newestUndoableId ? handleUndo : undefined}
                undoBusy={undo.isPending}
              />
            ))
          ) : (
            <p className="text-caption leading-relaxed text-muted-foreground" data-testid="agent-log-empty">
              No assistant actions recorded yet. Every change the assistant makes is written here
              and can be undone.
            </p>
          )}
        </div>
      ) : null}

      <div
        className="max-h-96 space-y-3 overflow-y-auto rounded-xl border border-border bg-card p-3"
        data-testid="agent-transcript"
      >
        {turns.length === 0 ? (
          <div className="space-y-2">
            <p className="text-caption leading-relaxed text-muted-foreground">
              Ask about your day, or ask for a change. Every change is listed, explained, and
              reversible.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={!isOnline}
                  className="inline-flex min-h-11 items-center rounded-lg border border-border-control bg-card px-2.5 text-caption text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t) => (
            <div key={t.id} className="space-y-1.5" data-testid={`agent-turn-${t.id}`}>
              <div className="flex items-center gap-1.5">
                {t.role === 'assistant' ? (
                  <Sparkles
                    size={11}
                    className="shrink-0 text-ai"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={`font-mono text-caption font-semibold uppercase tracking-wider ${
                    t.role === 'assistant' ? 'text-ai' : 'text-muted-foreground'
                  }`}
                >
                  {/* Anti-anthropomorphism: a role, not a person. */}
                  {t.role === 'assistant' ? 'Assistant' : 'You'}
                </span>
              </div>

              <p
                className={`max-w-prose break-words text-footnote leading-relaxed ${
                  t.notice ? 'text-muted-foreground' : 'text-foreground'
                }`}
              >
                {t.text}
              </p>

              {/* P15.2 tool running / read-only tools: named, never a progress bar. */}
              {(t.readTools ?? []).map((tool, i) => (
                <ToolLine key={`${t.id}-read-${tool.name}-${i}`} tool={tool} />
              ))}

              {/* P15.1: a full card for every real action, not just a chat bubble. */}
              {(t.mutations ?? []).map((tool, i) => (
                <AgentActionCard
                  key={`${t.id}-act-${tool.name}-${i}`}
                  state="executed"
                  verb={TOOL_VERB[tool.name]?.verb ?? 'Changed'}
                  objectCount={countFor(tool)}
                  objectNoun={TOOL_VERB[tool.name]?.noun ?? { one: 'item', many: 'items' }}
                  changeVerb={TOOL_CHANGE_VERB[tool.name] ?? 'Changed'}
                  changes={changesFor(tool)}
                  notChanged={notChangedFor(affectedTasks(tool))}
                  dataUsed={dataUsedFor([tool], t.memoryFactCount ?? 0)}
                  why={t.request ? whyFor(t.request, tool) : null}
                  provenance="agent"
                  stateDetail={formatClock(t.at)}
                />
              ))}

              {/* P15.2 failed / queued / offline, with Retry where it helps. */}
              {t.failure ? (
                <AgentActionCard
                  state={t.failure}
                  headline={
                    t.failure === 'queued'
                      ? 'Request queued'
                      : t.failure === 'offline'
                        ? 'Request not sent'
                        : 'Request failed'
                  }
                  verb="Tried to change"
                  objectCount={0}
                  objectNoun={{ one: 'item', many: 'items' }}
                  changes={[]}
                  notChanged={['Nothing was changed']}
                  dataUsed={['Your request']}
                  failureReason={t.text}
                  stateAfterFailure="Nothing was changed."
                  provenance={null}
                  onRetry={t.request ? () => send(t.request as string) : undefined}
                />
              ) : null}
            </div>
          ))
        )}

        {/* P15.2 thinking / streaming: a NAMED step and Stop, and deliberately
            no progress bar — a bar we cannot honestly fill is a fake bar. */}
        {working ? (
          <AgentActionCard
            state="thinking"
            headline="Working on your request"
            step="Reading your tasks and schedule…"
            verb="Working on"
            objectCount={0}
            objectNoun={{ one: 'request', many: 'requests' }}
            changes={[]}
            notChanged={['Nothing yet — no change has been made']}
            dataUsed={['Your request']}
            provenance={null}
            busyReason="Waiting for the assistant to reply. Nothing has been changed yet."
            onStop={handleStop}
          />
        ) : null}

        {stopped && chat.isPending ? (
          <p className="text-caption leading-relaxed text-muted-foreground" data-testid="agent-stopped">
            Stopped. The reply will be discarded when it arrives; anything the request already
            changed is in the action log.
          </p>
        ) : null}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="space-y-1"
      >
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!isOnline}
            placeholder={
              isOnline
                ? 'Ask the assistant, or ask for a change…'
                : 'The assistant needs a connection'
            }
            aria-label="Message the assistant"
            data-testid="agent-composer"
            className="min-h-11 flex-1 rounded-lg border border-border-control bg-muted px-3 text-footnote text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ai disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || chat.isPending || !isOnline}
            aria-busy={chat.isPending || undefined}
            aria-label="Send to the assistant"
            data-testid="agent-send"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-ai px-3 text-caption font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={12} aria-hidden="true" />
            Send
          </button>
        </div>
        <p className="text-caption leading-relaxed text-muted-foreground" data-testid="agent-approval-note">
          {approval
            ? 'Nothing is applied until you confirm the proposal above.'
            : 'Nothing is applied without your approval when it touches more than 10 tasks.'}
        </p>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local presentational pieces
// ---------------------------------------------------------------------------

function ContextChip({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="rounded-lg border border-border-subtle bg-muted px-1.5 py-0.5 font-mono text-caption text-muted-foreground">
      {label}: {value}
    </span>
  );
}

/** P15.2 tool running: the step is named and specific, with no progress bar. */
function ToolLine({ tool }: { tool: ToolCall }) {
  return (
    <p
      className="flex items-center gap-1.5 text-caption text-muted-foreground"
      data-testid="agent-tool-line"
    >
      <Wrench size={11} className="shrink-0 text-ai" aria-hidden="true" />
      {TOOL_PAST[tool.name] ?? tool.name.replace(/_/g, ' ')}
    </p>
  );
}

/** One `agent_action_log` row rendered as a full §P15.1 card. */
function LogCard({
  entry,
  task,
  onUndo,
  undoBusy,
}: {
  entry: AgentAction;
  task: Task | undefined;
  onUndo?: () => void;
  undoBusy: boolean;
}) {
  const known = LOG_VERB[entry.action];
  const objectName =
    task?.title ??
    (entry.targetId == null ? (entry.targetType ?? 'Item') : `Task #${entry.targetId}`);
  const undone = entry.undone === true;
  const when = formatClock(entry.createdAt);

  return (
    <AgentActionCard
      state={undone ? 'undone' : 'executed'}
      verb={known?.verb ?? (entry.action.replace(/_/g, ' ').trim() || 'Changed')}
      objectCount={1}
      objectNoun={known?.noun ?? { one: 'item', many: 'items' }}
      changeVerb={LOG_CHANGE_VERB[entry.action] ?? 'Changed'}
      changes={[
        {
          id: String(entry.id),
          object: objectName,
          to: task?.status === 'completed' ? 'Marked completed' : null,
          note: entry.summary ?? null,
        },
      ]}
      notChanged={
        task?.automation === 'off'
          ? ['Set to Off — left alone', 'Fixed events (never moved automatically)']
          : ['Fixed events (never moved automatically)']
      }
      dataUsed={['The action log', 'Your task list']}
      provenance="agent"
      stateDetail={when}
      why={`Recorded in the action log${when ? ` at ${when}` : ''}. ${
        undone
          ? 'It has been undone, and the original entry is kept here.'
          : 'Undo the most recent change with the button above.'
      }`}
      onUndo={onUndo}
      labels={{ undo: 'Undo this' }}
      busy={undoBusy}
    />
  );
}
