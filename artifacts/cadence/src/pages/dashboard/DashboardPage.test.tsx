import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './DashboardPage';

const mockUpdateMutate = vi.fn();
const dashboardState = vi.hoisted(() => ({ error: false }));

vi.mock('@workspace/api-client-react', () => ({
  useListTasks: (params: { scope?: string }) => {
    if (dashboardState.error) {
      return { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    }
    if (params?.scope === 'inbox') {
      return {
        data: [
          {
            id: 101,
            title: 'Review invoice from contractor',
            status: 'inbox',
            priority: 'medium',
            durationMin: 15,
            tags: [{ id: 1, name: 'finance' }],
            createdAt: '2026-10-18T10:00:00Z',
          },
          {
            id: 102,
            title: 'File weekly receipts',
            status: 'inbox',
            priority: 'low',
            durationMin: 10,
            tags: [{ id: 2, name: 'admin' }],
            createdAt: '2026-10-18T11:00:00Z',
          },
        ],
        isLoading: false,
      };
    }
    return {
      data: [
        {
          id: 201,
          title: 'Deep work: Architecture RFC Draft',
          status: 'open',
          priority: 'high',
          durationMin: 45,
          tags: [{ id: 3, name: 'focus' }],
          createdAt: '2026-10-18T09:00:00Z',
        },
        {
          id: 202,
          title: 'Review team pull requests',
          status: 'completed',
          priority: 'medium',
          durationMin: 30,
          tags: [{ id: 4, name: 'eng' }],
          createdAt: '2026-10-18T08:00:00Z',
        },
      ],
      isLoading: false,
    };
  },
  useGetMomentum: () =>
    dashboardState.error
      ? { data: undefined, isLoading: false, isError: true, refetch: vi.fn() }
      : {
          data: {
            date: '2026-10-18',
            tasksTotal: 6,
            tasksCompleted: 4,
            roundsCompleted: 3,
            roundTarget: 4,
            streakDays: 14,
          },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        },
  useGetTaskSummary: () =>
    dashboardState.error
      ? { data: undefined, isLoading: false, isError: true, refetch: vi.fn() }
      : {
          data: {
            total: 6,
            completed: 4,
            open: 2,
            focusMinutes: 120,
          },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        },
  useGetAutomationFlags: () => ({
    data: {
      flags: [
        { key: 'reminders', enabled: true },
        { key: 'reschedule', enabled: true },
      ],
      paused: false,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useListBlocks: () => ({
    data: [
      {
        id: 301,
        taskId: 201,
        taskTitle: 'Core Architecture Review',
        startAt: '2026-10-18T10:00:00.000Z',
        endAt: '2026-10-18T11:00:00.000Z',
        createdAt: '2026-10-18T09:00:00Z',
        updatedAt: '2026-10-18T09:00:00Z',
      },
      {
        id: 302,
        taskId: 202,
        taskTitle: 'Deep Coding Session',
        startAt: '2026-10-18T14:00:00.000Z',
        endAt: '2026-10-18T15:00:00.000Z',
        createdAt: '2026-10-18T09:00:00Z',
        updatedAt: '2026-10-18T09:00:00Z',
      },
    ],
    isLoading: false,
  }),
  useListGoals: () => ({
    data: [
      {
        id: 401,
        title: 'Complete 40 focus sessions',
        actual: 28,
        target: 40,
        progress: 70,
        month: '2026-10',
      },
    ],
    isLoading: false,
  }),
  useListRescheduleProposals: () => ({
    data: [],
    isLoading: false,
  }),
  useUpdateTask: () => ({
    mutate: mockUpdateMutate,
    isPending: false,
  }),
  getListTasksQueryKey: (p?: any) => ['tasks', p],
  getGetMomentumQueryKey: (p?: any) => ['momentum', p],
  getGetTaskSummaryQueryKey: (p?: any) => ['taskSummary', p],
  getListBlocksQueryKey: (p?: any) => ['blocks', p],
  getListGoalsQueryKey: (p?: any) => ['goals', p],
  getListRescheduleProposalsQueryKey: () => ['proposals'],
}));

describe('DashboardPage', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  it('renders command deck header, momentum card, and next up hero', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>,
    );

    // Header checks
    expect(screen.getByText(/Command Deck ·/i)).toBeInTheDocument();
    expect(screen.getByTestId('button-dashboard-capture')).toBeInTheDocument();
    expect(screen.getByTestId('button-dashboard-focus')).toBeInTheDocument();
    expect(screen.getByTestId('button-dashboard-today')).toBeInTheDocument();

    // Momentum Card checks
    expect(screen.getByTestId('card-dashboard-momentum')).toBeInTheDocument();
    expect(screen.getByText('14-day streak')).toBeInTheDocument();
    expect(screen.getByText('Strict · No freeze')).toBeInTheDocument();
    expect(screen.getByText('120m')).toBeInTheDocument();

    // Next Up Hero checks
    expect(screen.getByTestId('card-dashboard-next-up')).toBeInTheDocument();
    expect(screen.getByText('Deep work: Architecture RFC Draft')).toBeInTheDocument();
    expect(screen.getByText('Priority 1')).toBeInTheDocument();
    expect(screen.getByText('45 min planned')).toBeInTheDocument();

    // Secondary cards
    expect(screen.getByTestId('card-dashboard-inbox')).toBeInTheDocument();
    expect(screen.getByText('Review invoice from contractor')).toBeInTheDocument();

    expect(screen.getByTestId('card-dashboard-schedule')).toBeInTheDocument();
    expect(screen.getByText('Core Architecture Review')).toBeInTheDocument();
    expect(screen.getAllByText(/\d{2}:\d{2}–\d{2}:\d{2}/)).toHaveLength(2);

    expect(screen.getByTestId('card-dashboard-goals')).toBeInTheDocument();
    expect(screen.getByText('Complete 40 focus sessions')).toBeInTheDocument();
  });

  it('shows an error state instead of empty-success claims when core queries fail', () => {
    dashboardState.error = true;
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('status-error')).toBeInTheDocument();
    expect(screen.queryByText(/Inbox Zero/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/All queued tasks complete/i)).not.toBeInTheDocument();
    dashboardState.error = false;
  });

  it('triggers task completion when Mark Done is clicked on Next Up Hero', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>,
    );

    const markDoneBtn = screen.getByTestId('button-next-up-mark-done');
    fireEvent.click(markDoneBtn);

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 201,
        data: { status: 'completed' },
      }),
      expect.any(Object),
    );
  });
});
