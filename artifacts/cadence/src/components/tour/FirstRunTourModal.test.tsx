import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FirstRunTourModal, TOUR_STORAGE_PREFIX, openFirstRunTour } from './FirstRunTourModal';

vi.mock('@clerk/react', () => ({
  useUser: () => ({
    user: { id: 'user_test_42' },
    isLoaded: true,
  }),
}));

describe('FirstRunTourModal component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders automatically if tour has not been completed', () => {
    render(<FirstRunTourModal />);
    expect(screen.getByText('Make room for the day.')).toBeInTheDocument();
    expect(screen.getByText('Single-Task Flow')).toBeInTheDocument();
  });

  it('does not render if tour was already completed', () => {
    localStorage.setItem(`${TOUR_STORAGE_PREFIX}user_test_42`, 'true');
    render(<FirstRunTourModal />);
    expect(screen.queryByText('Make room for the day.')).not.toBeInTheDocument();
  });

  it('allows stepping forward and marks completed at the end', () => {
    render(<FirstRunTourModal />);
    expect(screen.getByText('Make room for the day.')).toBeInTheDocument();

    // Step 1 -> Step 2
    fireEvent.click(screen.getByTestId('button-tour-next'));
    expect(screen.getByText('Built for speed.')).toBeInTheDocument();

    // Step 2 -> Step 3
    fireEvent.click(screen.getByTestId('button-tour-next'));
    expect(screen.getByText('Enable Device Alerts')).toBeInTheDocument();

    // Step 3 -> Step 4
    fireEvent.click(screen.getByTestId('button-tour-next'));
    expect(screen.getByText('You are ready.')).toBeInTheDocument();

    // Step 4 -> Enter Cadence
    fireEvent.click(screen.getByTestId('button-tour-next'));

    expect(screen.queryByText('You are ready.')).not.toBeInTheDocument();
    expect(localStorage.getItem(`${TOUR_STORAGE_PREFIX}user_test_42`)).toBe('true');
  });

  it('can be reopened via openFirstRunTour event', () => {
    localStorage.setItem(`${TOUR_STORAGE_PREFIX}user_test_42`, 'true');
    render(<FirstRunTourModal />);
    expect(screen.queryByText('Make room for the day.')).not.toBeInTheDocument();

    act(() => {
      openFirstRunTour();
    });
    expect(screen.getByText('Make room for the day.')).toBeInTheDocument();
  });
});
