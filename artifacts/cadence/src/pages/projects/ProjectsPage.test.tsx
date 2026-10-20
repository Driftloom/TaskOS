import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
