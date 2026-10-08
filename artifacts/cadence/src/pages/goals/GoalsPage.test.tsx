import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoalsPage } from './GoalsPage';
import type { Goal } from '@workspace/api-client-react';

const mockGoals: Goal[] = [
  {
    id: 1,
    title: 'Daily Deep Focus',
    month: '2026-10',
    metric: 'focus_minutes',
    target: 1200,
    actual: 800,
    progress: 66.7,
    onPace: true,
    expectedSoFar: 600,
    scopeKind: 'global',
    scopeProjectId: null,
    scopeTagId: null,
    scopeLabel: 'Global',
    scopeDeleted: false,
    status: 'open',
    carriedFromId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    title: 'Ship Release Features',
    month: '2026-10',
    metric: 'tasks_completed',
    target: 20,
    actual: 22,
    progress: 110,
    onPace: true,
    expectedSoFar: 15,
    scopeKind: 'project',
    scopeProjectId: 3,
    scopeTagId: null,
    scopeLabel: 'Cadence App',
    scopeDeleted: false,
    status: 'open',
    carriedFromId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

vi.mock('@workspace/api-client-react', () => ({
  useListGoals: () => ({
    data: mockGoals,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useGetGoalHistory: () => ({
    data: { snapshots: [] },
    isLoading: false,
  }),
  useGetGoalBaselines: () => ({
    data: {
      focus_minutes: { trailing30dMonthlyEquivalent: 1000, trailing90dMonthlyEquivalent: 950 },
      focus_sessions: { trailing30dMonthlyEquivalent: 30, trailing90dMonthlyEquivalent: 28 },
      focus_days: { trailing30dMonthlyEquivalent: 20, trailing90dMonthlyEquivalent: 18 },
      tasks_completed: { trailing30dMonthlyEquivalent: 25, trailing90dMonthlyEquivalent: 22 },
      tasks_completed_on_time: { trailing30dMonthlyEquivalent: 20, trailing90dMonthlyEquivalent: 19 },
    },
    isLoading: false,
  }),
  useGetMonthlyReview: () => ({
    data: {
      month: '2026-10',
      totalGoals: 2,
      achievedGoals: 1,
      missedGoals: 1,
      completionRate: 50,
      goals: mockGoals,
      carryCandidates: [mockGoals[0]],
    },
    isLoading: false,
  }),
  useListProjects: () => ({ data: [{ id: 3, name: 'Cadence App' }] }),
  useListTags: () => ({ data: [] }),
  useCreateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCarryGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getListGoalsQueryKey: () => ['goals'],
  getGetMonthlyReviewQueryKey: () => ['monthly-review'],
}));

describe('GoalsPage', () => {
  const queryClient = new QueryClient();

  it('renders goals page header and action buttons', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <GoalsPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Monthly Goals')).toBeInTheDocument();
    expect(screen.getByText('New Goal')).toBeInTheDocument();
    expect(screen.getByText('Review Month')).toBeInTheDocument();
  });

  it('renders goal cards with title, actual/target numbers, and scope tags', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <GoalsPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Daily Deep Focus')).toBeInTheDocument();
    expect(screen.getByText('Ship Release Features')).toBeInTheDocument();
    expect(screen.getByText('Cadence App')).toBeInTheDocument();
    expect(screen.getByText(/Target reached/i)).toBeInTheDocument();
    expect(screen.getByTestId('goal-card-1')).toHaveTextContent('800');
    expect(screen.getByTestId('goal-card-1')).toHaveTextContent('1200');
    expect(screen.getByTestId('goal-card-2')).toHaveTextContent('22');
    expect(screen.getByTestId('goal-card-2')).toHaveTextContent('/ 20');
  });

  it('opens monthly review dialog when clicking review month button', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(
      <QueryClientProvider client={queryClient}>
        <GoalsPage />
      </QueryClientProvider>,
    );

    const reviewBtn = screen.getByText('Review Month');
    fireEvent.click(reviewBtn);

    expect(await screen.findByText(/Monthly Review — 2026-10/)).toBeInTheDocument();
    expect(screen.getByText(/Goals Breakdown/)).toBeInTheDocument();
  });
});
