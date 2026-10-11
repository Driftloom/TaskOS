import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentSettingsView, CURATED_MODELS, DEFAULT_MODELS } from './AgentSettingsView';

vi.mock('@workspace/api-client-react', () => ({
  useListAgentCredentials: () => ({
    data: {
      credentials: [
        { provider: 'gemini', keyHint: '...1234', model: 'gemini-3.8-flash' },
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
        { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', tierBadge: 'recommended' },
        { id: 'gemini-3.8-flash-lite', name: 'Gemini 3.8 Flash Lite', tierBadge: 'cheapest' },
      ],
    }),
  ),
}));

describe('AgentSettingsView', () => {
  const queryClient = new QueryClient();

  it('exports Gemini 3.8 Flash as the primary curated default model', () => {
    expect(DEFAULT_MODELS.gemini).toBe('gemini-3.8-flash');
    const geminiModels = CURATED_MODELS.gemini;
    expect(geminiModels[0].id).toBe('gemini-3.8-flash');
    expect(geminiModels[0].badge).toBe('Recommended');
    expect(geminiModels[1].id).toBe('gemini-3.8-flash-lite');
    expect(geminiModels[1].badge).toBe('Cheapest');
    expect(geminiModels[2].id).toBe('gemini-3.1-pro');
    expect(geminiModels[2].badge).toBe('Deep Reasoning');
  });

  it('renders provider rows and model selection dropdown', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentSettingsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Agent Provider Key')).toBeInTheDocument();
    expect(screen.getByTestId('agent-provider-row-gemini')).toBeInTheDocument();
    expect(screen.getByTestId('agent-provider-model-select-gemini')).toBeInTheDocument();
  });
});
