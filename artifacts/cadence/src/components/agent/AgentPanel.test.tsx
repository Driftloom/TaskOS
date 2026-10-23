import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AgentPanel } from './AgentPanel';

/**
 * The panel used to fire `toast.success("N tasks moved")` SYNCHRONOUSLY, the
 * moment the user pressed Confirm on a bulk proposal — before the server had
 * answered. If the server then rejected the request, the user had already been
 * told the change happened (AGENTS.md §5 rule 3: never silently reschedule, and
 * never claim a change the server has not confirmed).
 *
 * These tests drive the real panel: propose a bulk move, press Confirm, and
 * check that the announcement waits for the server and quotes the server's own
 * count rather than the locally-computed one.
 */
const h = vi.hoisted(() => ({
  chatOutcomes: [] as Array<{ ok: true; payload: unknown } | { ok: false; error: unknown }>,
  chatMutate: vi.fn(),
  /** Mirrors `useAgentChat().isPending`, so a test can drive the Stop control. */
  chatPending: false,
  /** When true the mocked reply is held back until the test delivers it. */
  deferReply: false,
  deliverReply: null as null | (() => void),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@workspace/api-client-react', () => ({
  useAgentChat: () => ({
    isPending: h.chatPending,
    mutate: (
      vars: unknown,
      opts: { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void },
    ) => {
      h.chatMutate(vars, opts);
      const next = h.chatOutcomes.shift();
      if (!next) return;
      const deliver = () => {
        if (next.ok) opts.onSuccess?.(next.payload);
        else opts.onError?.(next.error);
      };
      if (h.deferReply) {
        h.deliverReply = deliver;
        return;
      }
      deliver();
    },
  }),
  useAgentUndo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useListAgentActions: () => ({ data: { actions: [] } }),
  useGetAgentUsage: () => ({ data: undefined }),
  useGetAgentMessages: () => ({ data: { messages: [] } }),
  useGetMomentum: () => ({ data: undefined }),
  useGetTaskSummary: () => ({ data: undefined }),
  useListAgentCredentials: () => ({ data: { credentials: [] }, isPending: false }),
  useSaveAgentCredential: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useListAgentModels: () => ({ data: { models: [] } }),
  customFetch: vi.fn(() => Promise.resolve({ provider: 'gemini', models: [] })),
  getListAgentCredentialsQueryKey: () => ['mock', 'agent-credentials'],
  getGetMomentumQueryKey: () => ['mock', 'momentum'],
  getGetTaskSummaryQueryKey: () => ['mock', 'task-summary'],
  getListAgentActionsQueryKey: () => ['mock', 'agent-actions'],
  getListTasksQueryKey: () => ['mock', 'tasks'],
  getGetAgentMessagesQueryKey: () => ['mock', 'agent-messages'],
}));

/** The server asking for confirmation before it moves anything. */
const CONFIRMATION_REQUIRED = {
  reply: 'I need your confirmation before I move these.',
  toolCallsExecuted: [
    {
      name: 'bulk_reschedule',
      arguments: { taskIds: [1, 2, 3], targetDate: '2026-11-02' },
      result: {
        success: false,
        requiresConfirmation: true,
        error: 'CONFIRMATION_REQUIRED',
        data: { affectedTaskCount: 3, targetDate: '2026-11-02' },
      },
    },
  ],
  requiresConfirmation: true,
  memoryApplied: [],
};

/** The server confirming the move — and reporting TWO of the THREE tasks moved. */
const CONFIRMED = {
  reply: 'Done.',
  toolCallsExecuted: [
    {
      name: 'bulk_reschedule',
      arguments: { taskIds: [1, 2, 3], targetDate: '2026-11-02' },
      result: {
        success: true,
        data: {
          movedCount: 2,
          targetDue: '2026-11-02T00:00:00.000Z',
          tasks: [{ id: 1 }, { id: 2 }],
        },
      },
    },
  ],
  requiresConfirmation: false,
  memoryApplied: [],
};

const renderPanel = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentPanel tasks={[]} />
    </QueryClientProvider>,
  );
};

const proposeBulkMove = () => {
  fireEvent.change(screen.getByTestId('agent-composer'), {
    target: { value: 'move tasks 1, 2 and 3 to 2026-11-02' },
  });
  fireEvent.click(screen.getByTestId('agent-send'));
};

const confirmProposal = () => {
  fireEvent.click(screen.getByTestId('action-preview-confirm'));
};

const successMessages = (): string[] =>
  (toast.success as Mock).mock.calls.map(([message]) =>
    typeof message === 'string' ? message : '',
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.chatOutcomes.length = 0;
  h.chatPending = false;
  h.deferReply = false;
  h.deliverReply = null;
});

describe('a bulk change is announced only once the server has confirmed it', () => {
  it('claims nothing was moved when the server rejects the confirmation', () => {
    h.chatOutcomes.push(
      { ok: true, payload: CONFIRMATION_REQUIRED },
      { ok: false, error: { status: 500 } },
    );
    renderPanel();
    proposeBulkMove();
    confirmProposal();

    expect(successMessages().some((m) => m.includes('moved'))).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it('announces the count the server reported, not the number it proposed', () => {
    h.chatOutcomes.push(
      { ok: true, payload: CONFIRMATION_REQUIRED },
      { ok: true, payload: CONFIRMED },
    );
    renderPanel();
    proposeBulkMove();
    confirmProposal();

    expect(toast.success).toHaveBeenCalledWith('2 tasks moved', expect.anything());
    expect(toast.success).not.toHaveBeenCalledWith('3 tasks moved', expect.anything());
  });
});

describe('a bulk change that cannot be sent says so, and keeps the proposal', () => {
  it('reports that nothing was sent and leaves the proposal on screen when offline', () => {
    h.chatOutcomes.push({ ok: true, payload: CONFIRMATION_REQUIRED });
    renderPanel();
    proposeBulkMove();
    expect(screen.getByTestId('action-preview-confirm')).toBeInTheDocument();

    // The connection drops after the proposal was made.
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('agent-offline')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('action-preview-confirm'));

    // The user is told, rather than the panel silently doing nothing.
    expect(toast.error).toHaveBeenCalled();
    expect((toast.error as Mock).mock.calls[0][0]).toBe('Nothing was moved');
    // The proposal survives, so it can be retried when the connection is back.
    expect(screen.getByTestId('action-preview-confirm')).toBeInTheDocument();
    // And the confirmation was never sent: only the original request was.
    expect(h.chatMutate).toHaveBeenCalledTimes(1);
  });
});

/**
 * A reply that no model produced has to SAY SO on the bubble.
 *
 * The server is the only one that knows: a provider can be configured and
 * still fail on every call, so the panel must never infer degradation from
 * the credential list. And an absent flag is not a degraded reply — it must
 * render nothing, because "the field is missing" is not "the reply is fine".
 */
const replyFrom = (over: Record<string, unknown> = {}) => ({
  reply: 'Here is what I found.',
  toolCallsExecuted: [],
  requiresConfirmation: false,
  memoryApplied: [],
  ...over,
});

describe('a reply that no model produced says so', () => {
  beforeEach(() => {
    // Turns are persisted, so a stale turn from an earlier test would keep its
    // badge on screen and make the "renders nothing" cases meaningless.
    window.localStorage.clear();
  });

  it('labels the reply when the server says the local engine answered', () => {
    h.chatOutcomes.push({
      ok: true,
      payload: replyFrom({ provider: 'local-fallback', degraded: true }),
    });
    renderPanel();
    proposeBulkMove();

    const badge = screen.getByTestId('agent-degraded-badge');
    expect(badge).toBeInTheDocument();
    // The headline must not claim a provider is unconfigured: `degraded` also
    // covers a provider that IS configured and failed on every call.
    expect(badge).toHaveTextContent('Local fallback — no model response');
    expect(badge).not.toHaveTextContent('configured');
  });

  it('labels nothing when a provider answered', () => {
    h.chatOutcomes.push({
      ok: true,
      payload: replyFrom({ provider: 'gemini', degraded: false }),
    });
    renderPanel();
    proposeBulkMove();

    expect(screen.queryByTestId('agent-degraded-badge')).not.toBeInTheDocument();
  });

  it('labels nothing when the server did not report the reply as degraded', () => {
    h.chatOutcomes.push({
      ok: true,
      payload: replyFrom({ provider: 'gemini' }),
    });
    renderPanel();
    proposeBulkMove();

    expect(screen.queryByTestId('agent-degraded-badge')).not.toBeInTheDocument();
  });

  it('labels the assistant reply only, never the user turn', () => {
    h.chatOutcomes.push({
      ok: true,
      payload: replyFrom({ provider: 'local-fallback', degraded: true }),
    });
    renderPanel();
    proposeBulkMove();

    // One badge for the whole exchange: the user's own message is not the
    // assistant's reply and must never carry the label.
    expect(screen.getAllByTestId('agent-degraded-badge')).toHaveLength(1);
  });

  it('labels nothing when the request failed', () => {
    h.chatOutcomes.push({ ok: false, error: { status: 500 } });
    renderPanel();
    proposeBulkMove();

    // The failure IS shown — the badge is not what is missing here.
    expect(screen.getByTestId('agent-action-state')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-degraded-badge')).not.toBeInTheDocument();
  });

  it('labels nothing when the reply was discarded after Stop', () => {
    h.deferReply = true;
    h.chatOutcomes.push({
      ok: true,
      payload: replyFrom({ provider: 'local-fallback', degraded: true }),
    });
    renderPanel();
    proposeBulkMove();

    // The panel now looks busy: the Stop control appears.
    h.chatPending = true;
    fireEvent.change(screen.getByTestId('agent-composer'), {
      target: { value: 'still working' },
    });
    fireEvent.click(screen.getByTestId('agent-action-stop'));

    // The reply arrives after Stop, and is discarded.
    act(() => {
      h.deliverReply?.();
    });

    expect(screen.queryByTestId('agent-degraded-badge')).not.toBeInTheDocument();
    expect(screen.getByText(/The reply was discarded/)).toBeInTheDocument();
  });
});
