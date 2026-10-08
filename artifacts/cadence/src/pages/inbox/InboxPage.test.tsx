import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InboxPage } from './InboxPage';

const mockMutate = vi.fn();

vi.mock('@workspace/api-client-react', () => ({
  useListTasks: (params: { scope?: string }) => {
    if (params?.scope === 'archived') {
      return {
        data: [
          {
            id: 201,
            title: 'Old archived memo',
            status: 'archived',
            priority: 'low',
            durationMin: 15,
            tags: [],
            createdAt: new Date().toISOString(),
          },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    }
    return {
      data: [
        {
          id: 101,
          title: 'Active inbox task',
          status: 'inbox',
          priority: 'medium',
          durationMin: 30,
          tags: [],
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
  useCreateTask: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useUpdateTask: () => ({ mutate: mockMutate, isPending: false }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useListTaskFiles: () => ({ data: [], isLoading: false }),
  getListTasksQueryKey: (p: any) => ['tasks', p],
}));

describe('InboxPage archival support', () => {
  const queryClient = new QueryClient();

  it('renders active captures and allows switching to archived tab', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <InboxPage />
      </QueryClientProvider>,
    );

    // Active captures tab is displayed by default
    expect(screen.getByText('Active inbox task')).toBeInTheDocument();

    // Click on Archived tab
    const archivedTab = screen.getByRole('button', { name: /Archived/i });
    fireEvent.click(archivedTab);

    // Archived item should now be in view
    expect(await screen.findByText('Old archived memo')).toBeInTheDocument();
  });
});
