import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RitualDialog } from './RitualDialog';
import type { Task } from '@workspace/api-client-react';

/**
 * The evening ritual's whole job is to tell the user what is still open.
 * It can only do that if it read the tasks. A failed or unanswered query
 * used to arrive here as `tasks: []`, and the dialog then printed
 * "Inbox Zero! Everything scheduled for today is complete." -- a success
 * claim made out of a request that never answered. This is the same claim
 * class the Dashboard fix removed, reachable from /review.
 */
vi.mock('@workspace/api-client-react', () => ({
  usePlanDay: () => ({
    data: {
      todayTasks: [],
      overdueTasks: [],
      todayBlocks: [],
      dailyFocusTarget: 4,
    },
    isLoading: false,
  }),
  useCloseDay: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/sound-fx', () => ({
  soundFX: {
    playClick: vi.fn(),
    playTactileClick: vi.fn(),
    playFocusStart: vi.fn(),
    playCelebration: vi.fn(),
  },
}));

vi.mock('@/lib/activity-history', () => ({ recordActivity: vi.fn() }));

const OPEN_TASK: Task = {
  id: 7,
  title: 'Ship the truthfulness batch',
  status: 'open',
  priority: 'high',
  durationMin: 30,
  notes: null,
  dueAt: null,
  projectId: null,
  tags: [],
  parentId: null,
  rescheduleCount: 0,
  needsAttention: false,
  automation: null,
  completedAt: null,
  rrule: null,
  createdAt: '2026-10-21T09:00:00Z',
  updatedAt: '2026-10-21T09:00:00Z',
};

function renderEveningRitual(props: {
  tasks?: Task[];
  tasksLoading?: boolean;
  tasksError?: boolean;
}) {
  return render(
    <RitualDialog
      type="evening"
      tasks={props.tasks ?? []}
      tasksLoading={props.tasksLoading}
      tasksError={props.tasksError}
      onClose={vi.fn()}
      onUpdateTask={vi.fn()}
    />,
  );
}

describe('RitualDialog — what the evening ritual may claim', () => {
  it('never turns a failed tasks query into "everything is complete"', () => {
    renderEveningRitual({ tasksError: true });

    expect(screen.queryByText(/Inbox Zero/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Everything scheduled for today is complete/i)).not.toBeInTheDocument();
    // It says what it knows instead.
    expect(screen.getByTestId('ritual-tasks-unknown')).toBeInTheDocument();
    expect(screen.getByText('Your tasks could not be loaded')).toBeInTheDocument();
  });

  it('never turns an unanswered tasks query into "everything is complete"', () => {
    renderEveningRitual({ tasksLoading: true });

    expect(screen.queryByText(/Inbox Zero/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Everything scheduled for today is complete/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('ritual-tasks-loading')).toBeInTheDocument();
  });

  it('states the absence of open tasks instead of a verdict on the day', () => {
    renderEveningRitual({ tasks: [] });

    expect(screen.getByText('No incomplete tasks.')).toBeInTheDocument();
    // The celebratory copy is gone: an empty list is an absence, not a win.
    expect(screen.queryByText(/Inbox Zero/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Everything scheduled for today is complete/i)).not.toBeInTheDocument();
  });

  it('lists the open tasks it actually read', () => {
    renderEveningRitual({ tasks: [OPEN_TASK] });

    expect(screen.getByText('Ship the truthfulness batch')).toBeInTheDocument();
    expect(screen.queryByText('No incomplete tasks.')).not.toBeInTheDocument();
  });
});
