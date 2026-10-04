import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentPage } from './AgentPage';

vi.mock('@workspace/api-client-react', () => ({
  useListTasks: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useGetAgentUsage: () => ({
    data: {
      usage: {
        totalTokensIn: 100,
        totalTokensOut: 50,
        totalCostEstimateCents: 25,
        totalCalls: 3,
        spendCeilingCents: 500,
      },
    },
  }),
  useListAgentActions: () => ({ data: { actions: [] } }),
  useGetTaskSummary: () => ({ data: { total: 0, completed: 0 } }),
  useGetMomentum: () => ({ data: { tasksCompleted: 0 } }),
  useAgentChat: () => ({ mutate: vi.fn() }),
  useAgentUndo: () => ({ mutate: vi.fn() }),
  getListTasksQueryKey: () => ['tasks'],
  getListAgentActionsQueryKey: () => ['agent-actions'],
  getGetMomentumQueryKey: () => ['momentum'],
  getGetTaskSummaryQueryKey: () => ['task-summary'],
}));

describe('AgentPage', () => {
  const queryClient = new QueryClient();

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
});
