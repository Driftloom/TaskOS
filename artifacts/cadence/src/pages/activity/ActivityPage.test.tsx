import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityPage } from './ActivityPage';

vi.mock('@workspace/api-client-react', () => ({
  useGetNotificationSettings: () => ({
    data: { timezone: 'Asia/Kolkata' },
    isLoading: false,
  }),
}));

/**
 * The activity log lives in this browser only. These tests hold the page to
 * that: it may never claim a zero-data-loss record, and it may not offer a
 * filter for an activity type nothing ever writes.
 */
describe('ActivityPage — a device-local log', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  /** One recorded event, so the page has history the filters can hide. */
  function seedHistory() {
    window.localStorage.setItem(
      'cadence_activity_history_v1',
      JSON.stringify([
        {
          id: 'act_test_1',
          type: 'task_completed',
          title: 'Ship the truthfulness batch',
          description: 'Marked as completed',
          timestamp: new Date().toISOString(),
        },
      ]),
    );
  }

  /**
   * The Inbox writes `task_archived` and `task_restored` for real
   * (pages/inbox/InboxPage.tsx). The badge map covered every type nothing
   * writes and missed these two, so they fell through to the generic
   * "Activity" badge and the type filter offered no chip for them.
   */
  function seedArchiveHistory() {
    window.localStorage.setItem(
      'cadence_activity_history_v1',
      JSON.stringify([
        {
          id: 'act_archived_1',
          type: 'task_archived',
          title: 'Old capture',
          description: 'Archived task from inbox',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'act_restored_1',
          type: 'task_restored',
          title: 'Old capture',
          description: 'Restored task to inbox',
          timestamp: new Date().toISOString(),
        },
      ]),
    );
  }

  it('labels the archive and restore events it actually records', () => {
    seedArchiveHistory();
    render(<ActivityPage />);

    expect(screen.getAllByText('Archived').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Restored').length).toBeGreaterThan(0);
    // The generic fallback badge is what these two used to land on.
    expect(screen.queryByText('Activity')).not.toBeInTheDocument();
  });

  it('offers a type filter for the archive and restore events', () => {
    render(<ActivityPage />);

    expect(screen.getByRole('button', { name: 'Archived' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restored' })).toBeInTheDocument();
  });

  it('filters the timeline down to the archived events', () => {
    seedArchiveHistory();
    render(<ActivityPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));

    expect(screen.getByText('Old capture')).toBeInTheDocument();
    expect(screen.getByText('Archived task from inbox')).toBeInTheDocument();
    // The restored event is filtered out.
    expect(screen.queryByText('Restored task to inbox')).not.toBeInTheDocument();
  });

  it('never claims a zero-data-loss record', () => {
    render(<ActivityPage />);

    expect(screen.queryByText(/Zero-data-loss record/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/this device/i).length).toBeGreaterThan(0);
  });

  it('says that nothing has been recorded yet when the device has no history', () => {
    render(<ActivityPage />);

    expect(screen.getByText('Nothing has been recorded on this device yet')).toBeInTheDocument();
    expect(screen.queryByText(/Adjust your filters/i)).not.toBeInTheDocument();
  });

  it('offers no filter for an activity type nothing ever writes', () => {
    render(<ActivityPage />);

    expect(screen.queryByRole('button', { name: 'Agent' })).not.toBeInTheDocument();
  });

  it('does not blame the filters on a device that never recorded anything', () => {
    render(<ActivityPage />);

    fireEvent.change(screen.getByPlaceholderText(/Search activity/i), {
      target: { value: 'nothing matches this' },
    });

    expect(screen.getByText('Nothing has been recorded on this device yet')).toBeInTheDocument();
    expect(screen.queryByText(/Adjust your filters/i)).not.toBeInTheDocument();
  });

  it('blames the filters when there is history for them to hide', () => {
    seedHistory();
    render(<ActivityPage />);

    expect(screen.getByText('Ship the truthfulness batch')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search activity/i), {
      target: { value: 'nothing matches this' },
    });

    expect(screen.getByText('No matching activity found')).toBeInTheDocument();
    expect(screen.getByText(/Adjust your filters/i)).toBeInTheDocument();
  });
});
