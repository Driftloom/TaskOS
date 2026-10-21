import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentPage } from './AgentPage';

interface UsagePayload {
  usage: {
    totalTokensIn: number;
    totalTokensOut: number;
    totalCostEstimateCents: number;
    totalCalls: number;
    spendCeilingCents: number;
  };
}

/**
 * The usage response is mutable so a test can make the query fail. When it
 * does, the card must say the spend is unknown — a "$0.00 / $0.00 · 0% used"
 * reading is a MEASURED zero, and the server did not measure one.
 */
const { usageState } = vi.hoisted(() => ({
  usageState: {
    data: undefined as UsagePayload | undefined,
  },
}));

const KNOWN_USAGE: UsagePayload = {
  usage: {
    totalTokensIn: 100,
    totalTokensOut: 50,
    totalCostEstimateCents: 25,
    totalCalls: 3,
    spendCeilingCents: 500,
  },
};

vi.mock('@workspace/api-client-react', () => ({
  useListTasks: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useGetAgentUsage: () => ({ data: usageState.data }),
  useListAgentActions: () => ({ data: { actions: [] } }),
  useGetTaskSummary: () => ({ data: { total: 0, completed: 0 } }),
  useGetMomentum: () => ({ data: { tasksCompleted: 0 } }),
  useAgentChat: () => ({ mutate: vi.fn() }),
  useAgentUndo: () => ({ mutate: vi.fn() }),
  useListAgentCredentials: () => ({
    data: {
      credentials: [
        { provider: 'gemini', keyHint: '...1234', model: 'gemini-2.0-flash' },
      ],
    },
  }),
  useSaveAgentCredential: () => ({ mutateAsync: vi.fn() }),
  customFetch: vi.fn(() => Promise.resolve({ provider: 'gemini', models: [] })),
  getListTasksQueryKey: () => ['tasks'],
  getListAgentActionsQueryKey: () => ['agent-actions'],
  getGetMomentumQueryKey: () => ['momentum'],
  getGetTaskSummaryQueryKey: () => ['task-summary'],
  getListAgentCredentialsQueryKey: () => ['agent-credentials'],
}));

describe('AgentPage', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    usageState.data = KNOWN_USAGE;
  });

  it('renders page header and trust boundary cards', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentPage />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('Assistant').length).toBeGreaterThan(0);
    expect(screen.getByText('Trust Boundary')).toBeInTheDocument();
    expect(screen.getByText('LLM Safety Ceiling')).toBeInTheDocument();
    expect(screen.getByText('Reversible by Design')).toBeInTheDocument();
  });

  it('displays spend and quota metrics accurately', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText('3 calls')).toBeInTheDocument();
    expect(screen.getByText('$0.25 / $5.00')).toBeInTheDocument();
  });

  it('reads the monthly ceiling from the server, not from a client-side copy', () => {
    // A client that carried its own ceiling literal could not show $9.00.
    usageState.data = {
      usage: { ...KNOWN_USAGE.usage, spendCeilingCents: 900 },
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AgentPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText('$0.25 / $9.00')).toBeInTheDocument();
    expect(screen.getByText('3% used')).toBeInTheDocument();
  });

  it('renders an unknown state, never a measured zero, when the usage query fails', () => {
    usageState.data = undefined;

    render(
      <QueryClientProvider client={queryClient}>
        <AgentPage />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('agent-spend-unknown')).toBeInTheDocument();
    expect(screen.getByText('Spend unknown')).toBeInTheDocument();
    expect(screen.queryByText('$0.00 / $0.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/% used/)).not.toBeInTheDocument();
    expect(screen.queryByText('0 calls')).not.toBeInTheDocument();
  });

  it('displays the active AI model selector in the assistant panel', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentPage />
      </QueryClientProvider>,
    );

    const switcher = screen.getByTestId('agent-model-switcher');
    expect(switcher).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Active AI Model' })).toBeInTheDocument();
  });
});
