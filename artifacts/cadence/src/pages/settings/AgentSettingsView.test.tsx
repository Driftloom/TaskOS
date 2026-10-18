import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentSettingsView } from './AgentSettingsView';

vi.mock('@workspace/api-client-react', () => ({
  useListAgentCredentials: () => ({
    data: {
      credentials: [
        { provider: 'gemini', keyHint: '...1234', model: 'gemini-2.0-flash' },
      ],
    },
    isPending: false,
    refetch: vi.fn(),
  }),
  useSaveAgentCredential: () => ({ mutateAsync: vi.fn() }),
  useDeleteAgentCredential: () => ({ mutateAsync: vi.fn() }),
  customFetch: vi.fn(() =>
    Promise.resolve({
      provider: 'gemini',
      models: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', tierBadge: 'recommended' },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', tierBadge: 'cheapest' },
      ],
    }),
  ),
}));

describe('AgentSettingsView', () => {
  const queryClient = new QueryClient();

  it('renders provider rows and discovers models dynamically from backend', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentSettingsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Agent Provider Key')).toBeInTheDocument();
    expect(screen.getByTestId('agent-provider-row-gemini')).toBeInTheDocument();
    expect(await screen.findByTestId('agent-provider-model-select-gemini')).toBeInTheDocument();
  });
});
