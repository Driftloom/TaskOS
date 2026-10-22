import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectsPage } from './ProjectsPage';
import { useListTasks } from '@workspace/api-client-react';

vi.mock('@workspace/api-client-react', () => ({
  useListProjects: () => ({
    data: [
      { id: 1, name: 'Core Engine', color: 'blue', createdAt: '', updatedAt: '' },
      { id: 2, name: 'Design Tokens', color: 'orange', createdAt: '', updatedAt: '' },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  // `useListTasks` is a spy so the scope assertion below can pin it: the server
  // defaults to `scope=today` and would silently hide off-today project tasks.
  useListTasks: vi.fn(() => ({
    data: [
      { id: 10, title: 'Refactor parser', status: 'open', projectId: 1, priority: 'high' },
      { id: 11, title: 'Token lint baseline', status: 'completed', projectId: 2, priority: 'medium' },
    ],
    isLoading: false,
    refetch: vi.fn(),
  })),
  useListTaskFiles: () => ({ data: [], isLoading: false }),
  useCreateProject: () => ({ mutate: vi.fn() }),
  useUpdateProject: () => ({ mutate: vi.fn() }),
  useDeleteProject: () => ({ mutate: vi.fn() }),
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  getListProjectsQueryKey: () => ['projects'],
  getListTasksQueryKey: () => ['tasks'],
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

describe('ProjectsPage', () => {
  const queryClient = new QueryClient();

  it('renders projects and per-project task view', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProjectsPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getAllByText('Core Engine').length).toBeGreaterThan(0);
    expect(screen.getByText('Design Tokens')).toBeInTheDocument();
    expect(screen.getByText('Refactor parser')).toBeInTheDocument();
    expect(screen.getByTestId('button-create-project')).toBeInTheDocument();

    // Scope regression (server defaults to `scope=today`, which would hide
    // off-today work here — the page must request every task).
    expect(useListTasks).toHaveBeenCalledWith({ scope: 'all' });
  });

  it('associates the Project Name label with its input', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProjectsPage />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId('button-create-project'));
    expect(screen.getByLabelText('Project Name')).toHaveAttribute('id', 'projects-project-name');
  });

  it('declares the Create Project dialog and keeps focus inside it', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProjectsPage />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId('button-create-project'));

    const dialog = screen.getByRole('dialog', { name: 'New Project' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'projects-modal-heading');
    expect(document.getElementById('projects-modal-heading')).toBeInTheDocument();

    // The close button in the modal header is the first focusable descendant.
    const first = screen.getByRole('button', { name: 'Close' });
    const input = screen.getByLabelText('Project Name');
    // Create Project is disabled while the name is empty, so type a name to
    // enable it and make it the last focusable descendant.
    const last = screen.getByRole('button', { name: 'Create Project' });

    // Place focus inside the overlay (as the hook does on open in a real browser).
    first.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab in either direction never moves focus out of the overlay.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Typing enables Create Project; Shift+Tab from the first control now wraps
    // to it; Tab wraps back to the first.
    fireEvent.change(input, { target: { value: 'Acme' } });
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
