import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Send,
  Undo2,
  Loader2,
  Wrench,
  History,
  Zap,
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
  getListTasksQueryKey,
  type Task,
} from '@workspace/api-client-react';
import { today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';

interface Turn {
  id: string;
  role: 'user' | 'agent';
  text: string;
  tools?: string[];
  requiresConfirmation?: boolean;
  failed?: boolean;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Request failed';
}

const SUGGESTIONS = [
  'What is on my plate today?',
  'Reschedule task 1 to tomorrow',
  'Undo my last change',
];

/**
 * Conversational agent surface.
 *
 * Every mutation the agent performs is listed in the action log below the
 * transcript with a working "undo last action", so the agent can never change
 * the plan invisibly (locked decision D-26).
 */
export function AgentPanel({ tasks }: { tasks: Task[] }) {
  const queryClient = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [showLog, setShowLog] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const chat = useAgentChat();
  const undo = useAgentUndo();
  const { data: actions } = useListAgentActions();
  const { data: usage } = useGetAgentUsage();
  const momentumParams = { date: today(), timezone: timezone() };
  const { data: momentum } = useGetMomentum(momentumParams);
  const { data: summary } = useGetTaskSummary(momentumParams);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  const refreshDerived = () => {
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMomentumQueryKey(momentumParams) });
    queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(momentumParams) });
  };

  const send = (text: string) => {
    const message = text.trim();
    if (!message || chat.isPending) return;

    const userTurn: Turn = { id: `u-${Date.now()}`, role: 'user', text: message };
    setTurns((prev) => [...prev, userTurn]);
    setInput('');

    chat.mutate(
      { data: { message, channel: 'app' } },
      {
        onSuccess: (res) => {
          soundFX.playCompletion();
          setTurns((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'agent',
              text: res.reply,
              tools: (res.toolCallsExecuted ?? []).map(
                (t) => (t as { name?: string }).name ?? 'tool',
              ),
              requiresConfirmation: res.requiresConfirmation,
            },
          ]);
          refreshDerived();
        },
        onError: (err) => {
          setTurns((prev) => [
            ...prev,
            { id: `a-${Date.now()}`, role: 'agent', text: errorMessage(err), failed: true },
          ]);
        },
      },
    );
  };

  const handleUndo = () => {
    soundFX.playTactileClick();
    undo.mutate(
      { data: {} },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          refreshDerived();
          toast.success('Last agent action reverted');
        },
        onError: (err) =>
          toast.error('Nothing to undo', { description: errorMessage(err) }),
      },
    );
  };

  const lastAction = actions?.actions?.[0];

  return (
    <div className="space-y-4" data-testid="agent-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-[#5E5CE6]" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#5E5CE6]">Assistant</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLog((v) => !v)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-xs font-medium text-zinc-300 hover:text-white transition-all active:scale-[0.98]"
          >
            <History className="size-3.5 text-zinc-400" />
            Log
            {actions?.actions?.length ? ` (${actions.actions.length})` : ''}
          </button>
          <button
            onClick={handleUndo}
            disabled={undo.isPending}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-xs font-medium text-zinc-300 hover:text-white transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {undo.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Undo2 className="size-3.5 text-zinc-400" />
            )}
            Undo last
          </button>
        </div>
      </div>

      {/* Live context so the assistant is not guessing about your day. */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
        <span className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-muted-foreground">
          tasks today: {summary?.total ?? 0}
        </span>
        <span className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-muted-foreground">
          open: {summary?.open ?? 0}
        </span>
        <span className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-muted-foreground">
          rounds: {momentum?.roundsCompleted ?? 0}/{momentum?.roundTarget ?? 0}
        </span>
        <span className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-muted-foreground">
          streak: {momentum?.streakDays ?? 0}d
        </span>
        {usage?.usage && (
          <span className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-muted-foreground">
            llm calls: {usage.usage.totalCalls}
          </span>
        )}
      </div>

      {showLog && (
        <div className="rounded-2xl bg-[#1C1C1E] border border-white/[0.08] p-4 space-y-2 max-h-64 overflow-y-auto">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Agent action log
          </p>
          {actions?.actions?.length ? (
            actions.actions.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 text-xs border-b border-white/[0.04] pb-2 last:border-0"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Wrench className="size-3 shrink-0 text-zinc-500" />
                  <span className="font-mono truncate">{a.action}</span>
                  {a.targetId != null && (
                    <span className="text-muted-foreground shrink-0">#{a.targetId}</span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {a.undone ? 'undone' : new Date(a.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              No agent actions recorded yet.
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-[#1C1C1E] border border-white/[0.08] p-4 space-y-3 max-h-80 overflow-y-auto">
        {turns.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Ask about your day, or ask for a change. Every change is logged and reversible.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-2.5 py-1 rounded-lg text-[11px] bg-white/[0.04] border border-white/[0.06] text-muted-foreground hover:text-foreground hover:border-white/[0.14] transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t) => (
            <div key={t.id} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {t.role === 'user' ? 'You' : 'Cadence'}
                </span>
                {t.tools && t.tools.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-[#5E5CE6]">
                    <Zap className="size-2.5" />
                    {t.tools.join(', ')}
                  </span>
                )}
              </div>
              <p
                className={`text-sm leading-relaxed ${
                  t.failed ? 'text-destructive' : 'text-foreground'
                }`}
              >
                {t.text}
              </p>
              {t.requiresConfirmation && (
                <p className="text-[11px] text-[#FF9F0A]">
                  Confirmation required before this runs.
                </p>
              )}
            </div>
          ))
        )}
        {chat.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Thinking…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            lastAction
              ? `Last action: ${lastAction.action}${lastAction.targetId ? ` #${lastAction.targetId}` : ''}`
              : 'Ask the assistant...'
          }
          className="flex-1 h-10 rounded-xl border border-white/[0.08] bg-[#111113] px-3.5 text-sm outline-none focus:border-[#5E5CE6] text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!input.trim() || chat.isPending}
          className="grid size-10 place-items-center rounded-xl bg-[#5E5CE6] hover:bg-[#5E5CE6]/90 text-white transition-all active:scale-95 disabled:opacity-50 shrink-0"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
