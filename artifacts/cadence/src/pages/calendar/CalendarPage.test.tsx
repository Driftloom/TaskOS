import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CalendarPage } from './CalendarPage';

/**
 * The day view's count line prints two MEASURED numbers: how many tasks are
 * scheduled, and how many blocks exist. A query that failed sends nothing,
 * and nothing is not zero -- so the page has to be able to render the
 * unknown state. The mocked hooks below hand it a server that answered with
 * an empty list, a server that is still answering, and a server that could
 * not be reached at all.
 */
const calendar = vi.hoisted(() => ({
  tasksFailed: false,
  tasksLoading: false,
  blocksFailed: false,
}));

/** jsdom lays nothing out, so getClientRects reports empty rects and nothing
   is "reachable" per useModalFocus. Report a non-empty rect so the focus trap
   can move focus into the overlay the way a real browser would. */
const RECT_SHIM = { length: 1 } as unknown as DOMRectList;
let realGetClientRects: typeof Element.prototype.getClientRects;
beforeEach(() => {
  realGetClientRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = function getClientRects() {
    return RECT_SHIM;
  };
});
afterEach(() => {
  Element.prototype.getClientRects = realGetClientRects;
});

vi.mock('@workspace/api-client-react', () => ({
  getListTasksQueryKey: (params?: { scope?: string }) => ['tasks', params?.scope],
  getGetTaskSummaryQueryKey: () => ['summary'],
  getListTagsQueryKey: () => ['tags'],
  getListBlocksQueryKey: () => ['blocks'],
  createTag: vi.fn(),
  useListTasks: (params?: { scope?: string }) =>
    // The page reads the day through one query and the whole backlog through
    // another; only the day query feeds the count line.
    params?.scope === 'all'
      ? { data: [], isLoading: false, isError: false, refetch: vi.fn() }
      : {
          // A failed read is NOT an empty list: the page has to be able to
          // tell "nothing scheduled" apart from "we could not read the day".
          data: calendar.tasksFailed ? undefined : [],
          isLoading: calendar.tasksLoading,
          isError: calendar.tasksFailed,
          refetch: vi.fn(),
        },
  useListBlocks: () => ({
    data: calendar.blocksFailed ? undefined : [],
    isLoading: false,
    isError: calendar.blocksFailed,
    refetch: vi.fn(),
  }),
  useListTaskFiles: () => ({ data: [] }),
  useCreateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useCreateTaskBlock: () => ({ mutate: vi.fn() }),
  useDeleteTaskBlock: () => ({ mutate: vi.fn() }),
  useUpdateTaskBlock: () => ({ mutate: vi.fn() }),
}));

function renderCalendarPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarPage />
    </QueryClientProvider>,
  );
}

describe('CalendarPage — the day-view count line', () => {
  beforeEach(() => {
    calendar.tasksFailed = false;
    calendar.tasksLoading = false;
    calendar.blocksFailed = false;
  });

  it('states the count when the task query answered, even when the answer was empty', () => {
    renderCalendarPage();

    const counts = screen.getByTestId('calendar-day-counts');
    // The query answered, so zero is the honest answer to a question that
    // WAS asked. An empty day must not be confused with an unread one.
    expect(counts).toHaveTextContent('0 scheduled');
    expect(counts).toHaveTextContent('0 blocked');
    expect(counts).not.toHaveTextContent('—');
  });

  /**
   * The count line used to read `dayTasks?.length ?? 0`, so a failed
   * GET /api/tasks rendered "0 scheduled" -- a measured zero over a request
   * that never answered. The same class this branch exists to remove.
   */
  it('never turns an unreadable task list into "0 scheduled"', () => {
    calendar.tasksFailed = true;
    renderCalendarPage();

    const counts = screen.getByTestId('calendar-day-counts');
    expect(counts).not.toHaveTextContent('0 scheduled');
    // The em dash is the marker Profile's momentum tiles and RitualDialog's
    // counters already use for a value nobody sent.
    expect(counts).toHaveTextContent('— scheduled');
  });

  it('reports the failed task read with an error surface and a retry, never a count', () => {
    calendar.tasksFailed = true;
    renderCalendarPage();

    expect(screen.getByTestId('status-error')).toBeInTheDocument();
    expect(screen.getByTestId('button-retry')).toBeInTheDocument();
    // The section copy, not the workspace copy: the Time Blocks hour grid
    // beside it comes from a separate query and is still on screen.
    expect(screen.getByText('This section could not load.')).toBeInTheDocument();
    expect(screen.queryByText('The workspace could not load.')).not.toBeInTheDocument();
  });

  it('never claims a count while the task query is still in flight', () => {
    calendar.tasksLoading = true;
    renderCalendarPage();

    const counts = screen.getByTestId('calendar-day-counts');
    expect(counts).not.toHaveTextContent('0 scheduled');
    expect(counts).toHaveTextContent('— scheduled');
  });

  it('never turns an unreadable block list into "0 blocked"', () => {
    calendar.blocksFailed = true;
    renderCalendarPage();

    const counts = screen.getByTestId('calendar-day-counts');
    expect(counts).not.toHaveTextContent('0 blocked');
    expect(counts).toHaveTextContent('— blocked');
  });

  it('declares and traps focus in the schedule-hour picker dialog', () => {
    renderCalendarPage();
    fireEvent.click(screen.getByTestId('button-add-block-9'));

    const dialog = screen.getByRole('dialog', { name: 'Schedule Block at 09:00' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'schedule-hour-picker-heading');
    expect(document.getElementById('schedule-hour-picker-heading')).toBeInTheDocument();

    const first = screen.getByRole('button', { name: 'Close' });

    // Place focus inside the overlay (as the hook does on open in a real browser).
    first.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab in either direction never moves focus out of the overlay.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
