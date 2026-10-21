import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityPage } from './ActivityPage';

/**
 * The activity log lives in this browser only. These tests hold the page to
 * that: it may never claim a zero-data-loss record, and it may not offer a
 * filter for an activity type nothing ever writes.
 */
describe('ActivityPage — a device-local log', () => {
  beforeEach(() => {
    window.localStorage.clear();
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

  it('blames the filters only when filters are what hid the events', () => {
    render(<ActivityPage />);

    fireEvent.change(screen.getByPlaceholderText(/Search activity/i), {
      target: { value: 'nothing matches this' },
    });

    expect(screen.getByText(/Adjust your filters/i)).toBeInTheDocument();
  });
});
