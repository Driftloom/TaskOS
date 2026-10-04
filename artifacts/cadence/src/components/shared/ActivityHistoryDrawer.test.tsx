import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityHistoryDrawer } from './ActivityHistoryDrawer';
import { recordActivity } from '@/lib/activity-history';

describe('ActivityHistoryDrawer', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing when isOpen is false', () => {
    render(<ActivityHistoryDrawer isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('Activity History')).not.toBeInTheDocument();
  });

  it('renders empty state when there are no activities', () => {
    render(<ActivityHistoryDrawer isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Activity History')).toBeInTheDocument();
    expect(screen.getByText('No activity recorded yet')).toBeInTheDocument();
  });

  it('renders recorded activities properly', () => {
    recordActivity({
      type: 'task_created',
      title: 'Design high-res icon',
      description: 'Created new task',
    });

    render(<ActivityHistoryDrawer isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Design high-res icon')).toBeInTheDocument();
    expect(screen.getByText('Created new task')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });
});
