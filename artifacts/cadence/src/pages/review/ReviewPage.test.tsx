import { describe, expect, it, vi } from 'vitest';
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
    data: mockTasks,
    isLoading: false,
  }),
  useUpdateTask: () => ({
    mutate: vi.fn(),
  }),
  useGetSlippageReport: () => ({
    data: mockSlippage,
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
    expect(screen.getByText('Rule 1 & Rule 7 Verified')).toBeInTheDocument();
  });
});
