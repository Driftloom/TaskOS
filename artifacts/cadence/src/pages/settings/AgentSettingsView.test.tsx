import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentSettingsView } from './AgentSettingsView';

/**
 * The settings page and the agent page are both lazily loaded, so a settings
 * view that imported the agent PANEL would hoist the whole panel — and
 * everything it pulls in (ActionPreview, the agent query hooks, sonner,
 * sound-fx) — into a chunk both routes download, against the cold-load JS
 * budget.
 *
 * The mock factory below only runs if the settings view's module graph
 * actually reaches the panel. A `import type` would be erased at build time
 * and never reach it, which is why this checks the module graph rather than
 * the source text.
 */
const h = vi.hoisted(() => ({ agentPanelLoaded: false }));

vi.mock('@/components/agent/AgentPanel', async (importOriginal) => {
  h.agentPanelLoaded = true;
  return await importOriginal();
});

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

  it('does not pull the agent panel into the settings route', () => {
    expect(h.agentPanelLoaded).toBe(false);
  });
});
