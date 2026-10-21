import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewPage } from './ReviewPage';
import type { Task, SlippageReport } from '@workspace/api-client-react';

const mockTasks: Task[] = [
  {
    id: 1,
    title: 'Audit database performance',
    notes: null,
    dueAt: null,
    durationMin: 45,
    priority: 'high',
    status: 'completed',
    projectId: null,
    tags: [],
    parentId: null,
    rescheduleCount: 0,
    needsAttention: false,
    automation: null,
    completedAt: '2026-10-18T10:00:00.000Z',
    rrule: null,
    createdAt: '2026-10-18T08:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
  },
];

const reviewState = vi.hoisted(() => ({ emptySample: false, tasksFailed: false }));

const mockSlippage: SlippageReport = {
  windowDays: 7,
  totalSlipped: 1,
  totalCompletedOnTime: 8,
  onTimeRate: 0.89,
  byReason: {
    capacityOverrun: 1,
    missedDeadline: 0,
    postponed: 0,
    flaggedCapExceeded: 0,
  },
  slippedTasks: [
    {
      id: 2,
      title: 'Draft quarterly product vision',
      rescheduleCount: 3,
      needsAttention: false,
      priority: 'high',
      status: 'open',
      dueAt: '2026-10-18T18:00:00.000Z',
      originalDueAt: '2026-10-15T18:00:00.000Z',
      reason: 'capacity_overrun',
      reasonLabel: 'Capacity Overrun (Multiple Moves)',
      recommendedAction: 'Allocate a dedicated 45m calendar focus block',
    },
  ],
  reconciliation: {
    rawProposalsCount: 2,
    autoMovedTasksCount: 1,
    flaggedTasksCount: 0,
    openOverdueCount: 0,
    agentRescheduledCount: 1,
  },
};

vi.mock('@workspace/api-client-react', () => ({
  useGetTaskSummary: () => ({
    data: {
      total: 10,
      completed: 8,
      open: 2,
      focusMinutes: 180,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useListTasks: () => ({
    // A failed read is NOT an empty list: the page has to be able to tell
    // "no open tasks" apart from "we could not read the task list".
    data: reviewState.tasksFailed ? undefined : mockTasks,
    isLoading: false,
    isError: reviewState.tasksFailed,
    refetch: vi.fn(),
  }),
  useUpdateTask: () => ({
    mutate: vi.fn(),
  }),
  useGetSlippageReport: () => ({
    data: reviewState.emptySample
      ? {
          ...mockSlippage,
          totalSlipped: 0,
          totalCompletedOnTime: 0,
          // The API reports null for a window with no completed tasks. It must
          // never report a perfect 1.0 there.
          onTimeRate: null,
          slippedTasks: [],
        }
      : mockSlippage,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGetMomentum: () => ({
    data: {
      streakDays: 5,
      completionRate: 0.85,
    },
    isLoading: false,
  }),
  getListTasksQueryKey: () => ['tasks'],
  getGetTaskSummaryQueryKey: () => ['summary'],
}));

vi.mock('@/components/task/WorkspacePanel', () => ({
  WorkspacePanel: () => <div data-testid="workspace-panel-mock" />,
}));

function renderReviewPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewPage />
    </QueryClientProvider>,
  );
}

describe('ReviewPage & What Slipped & Why Subsystem', () => {
  beforeEach(() => {
    reviewState.emptySample = false;
    reviewState.tasksFailed = false;
  });

  it('renders page header and core momentum sections', () => {
    renderReviewPage();
    expect(screen.getByText('Notice what moved.')).toBeInTheDocument();
    expect(screen.getByText("Today's Progress")).toBeInTheDocument();
    expect(screen.getByText('The Ledger')).toBeInTheDocument();
  });

  it('renders What Slipped & Why raw-table reconciliation card with metrics', () => {
    renderReviewPage();
    expect(screen.getByText('What Slipped & Why')).toBeInTheDocument();
    expect(screen.getByText('89%')).toBeInTheDocument();
    expect(screen.getByText('On-Time Rate')).toBeInTheDocument();
    expect(screen.getByText('Reconciled across raw tasks, reschedule proposals, and agent logs.')).toBeInTheDocument();
    expect(screen.getByText('Draft quarterly product vision')).toBeInTheDocument();
    expect(screen.getByText('Capacity Overrun (Multiple Moves)')).toBeInTheDocument();
  });

  it('never renders a 100% on-time rate or schedule-success claim from an empty sample', () => {
    reviewState.emptySample = true;
    renderReviewPage();

    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.queryByText('null%')).not.toBeInTheDocument();
    expect(screen.getByText('No completed tasks in the last 7 days, so there is no on-time sample yet.')).toBeInTheDocument();
    expect(screen.queryByText(/All tasks completed on schedule/i)).not.toBeInTheDocument();
  });

  /**
   * The ritual card's footer counted the open tasks from a query the page
   * never checked the state of. A failed `GET /api/tasks` therefore rendered
   * "0 tasks open in Today" -- a measured zero over a request that never
   * answered, the same class the rest of this branch exists to remove.
   */
  it('states the open-task count when the task list was read', () => {
    renderReviewPage();

    const count = screen.getByTestId('review-open-task-count');
    // The query answered, so the count is a fact (the fixture has no open
    // tasks, and zero is the honest answer to a question that WAS asked).
    expect(count).toHaveTextContent('0 tasks open in Today');
    expect(count).not.toHaveTextContent('Unknown');
  });

  it('never turns an unreadable task list into "0 tasks open in Today"', () => {
    reviewState.tasksFailed = true;
    renderReviewPage();

    const count = screen.getByTestId('review-open-task-count');
    expect(count).not.toHaveTextContent('0 tasks open in Today');
    expect(count).toHaveTextContent('Unknown number of tasks open in Today');
  });
});
