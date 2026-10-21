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
      // The server's own DiscoveredModel shape
      // (artifacts/api-server/src/lib/agent/discovery.ts). A mock in any other
      // shape hides the fact that the client reads the wrong field names.
      models: [
        {
          id: 'gemini-2.0-flash',
          label: 'Gemini 2.0 Flash',
          badge: 'Recommended',
          description: 'Frontier multimodal workhorse.',
          tier: 'balanced',
        },
        {
          id: 'gemini-2.0-flash-lite',
          label: 'Gemini 2.0 Flash Lite',
          badge: 'Cheapest',
          description: 'Lightweight, ultra low latency.',
          tier: 'speed',
        },
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

  it('labels each discovered model with the label and badge the server sent', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentSettingsView />
      </QueryClientProvider>,
    );

    const option = await screen.findByRole('option', {
      name: /Gemini 2\.0 Flash \(Recommended\)/,
    });
    expect(option).toHaveTextContent('Gemini 2.0 Flash');
    expect(option).toHaveTextContent('Recommended');
  });
});
