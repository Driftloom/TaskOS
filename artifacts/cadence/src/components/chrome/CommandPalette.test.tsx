import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommandPalette } from './CommandPalette';

vi.mock('@workspace/api-client-react', () => ({
  useListTasks: (params: { search?: string }) => {
    if (params?.search === 'groceries') {
      return {
        data: [
          {
            id: 99,
            title: 'Buy groceries',
            status: 'open',
            priority: 'high',
            durationMin: 30,
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isLoading: false,
      };
    }
    return { data: [], isLoading: false };
  },
}));

describe('CommandPalette task search', () => {
  const queryClient = new QueryClient();

  it('renders matching tasks when searching in palette', async () => {
    const handleSelectTask = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <CommandPalette
          open={true}
          onOpenChange={vi.fn()}
          onSelectNewTask={vi.fn()}
          onNavigate={vi.fn()}
          onSelectTask={handleSelectTask}
        />
      </QueryClientProvider>,
    );

    const input = screen.getByPlaceholderText(/Type a command or jump to page/i);
    fireEvent.change(input, { target: { value: 'groceries' } });

    expect(await screen.findByText('Buy groceries')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Buy groceries'));
    expect(handleSelectTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 99, title: 'Buy groceries' }),
    );
  });
});
