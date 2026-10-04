import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectsPage } from './ProjectsPage';

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
  useListTasks: () => ({
    data: [
      { id: 10, title: 'Refactor parser', status: 'open', projectId: 1, priority: 'high' },
      { id: 11, title: 'Token lint baseline', status: 'completed', projectId: 2, priority: 'medium' },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
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
  });
});
