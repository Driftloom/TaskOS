import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentPanel } from './AgentPanel';

/**
 * The model dropdown reads `GET /api/agent/models/:provider`, whose payload is
 * the server's `DiscoveredModel` shape:
 *
 *   { id, label, badge?, description, tier }
 *   (artifacts/api-server/src/lib/agent/discovery.ts)
 *
 * The panel used to read `name` / `tierBadge`, which the server has never
 * sent, so every option rendered "undefined" and no badge at all. These tests
 * pin the dropdown to the fields the server actually sends.
 */
const h = vi.hoisted(() => {
  const credentials = {
    data: {
      credentials: [
        {
          provider: 'gemini',
          configured: true,
          keyHint: '••••1234',
          model: 'gemini-2.0-flash',
          baseUrl: null,
          updatedAt: null,
        },
      ],
    },
    isPending: false,
  };
  return { customFetch: vi.fn(), credentials };
});

vi.mock('@workspace/api-client-react', () => ({
  useAgentChat: () => ({ mutate: vi.fn(), isPending: false }),
  useAgentUndo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useListAgentActions: () => ({ data: { actions: [] } }),
  useGetAgentUsage: () => ({ data: undefined }),
  useGetMomentum: () => ({ data: undefined }),
  useGetTaskSummary: () => ({ data: undefined }),
  useListAgentCredentials: () => h.credentials,
  useSaveAgentCredential: () => ({ mutateAsync: vi.fn(), isPending: false }),
  customFetch: h.customFetch,
  getListAgentCredentialsQueryKey: () => ['mock', 'agent-credentials'],
  getGetMomentumQueryKey: () => ['mock', 'momentum'],
  getGetTaskSummaryQueryKey: () => ['mock', 'task-summary'],
  getListAgentActionsQueryKey: () => ['mock', 'agent-actions'],
  getListTasksQueryKey: () => ['mock', 'tasks'],
}));

const serverModels = (models: Array<Record<string, unknown>>) => ({
  provider: 'gemini',
  models,
});

const renderPanel = async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentPanel tasks={[]} />
      </QueryClientProvider>,
    );
  });
};

beforeEach(() => {
  h.customFetch.mockReset();
  h.customFetch.mockResolvedValue(
    serverModels([
      {
        id: 'gemini-3.8-flash',
        label: 'Gemini 3.8 Flash',
        badge: 'Recommended',
        description: 'Frontier workhorse.',
        tier: 'balanced',
      },
      {
        id: 'gemini-3.8-flash-lite',
        label: 'Gemini 3.8 Flash Lite',
        badge: 'Cheapest',
        description: 'Ultra-low cost.',
        tier: 'speed',
      },
    ]),
  );
});

describe('the agent model dropdown reads the server\'s own field names', () => {
  it('renders the label the server sent, with its badge', async () => {
    await renderPanel();
    const option = await screen.findByRole('option', {
      name: /Gemini 3\.8 Flash \(Recommended\)/,
    });
    expect(option).toHaveTextContent('Gemini 3.8 Flash');
    expect(option).toHaveTextContent('Recommended');
  });

  it('reads a badge the server sent in a different case', async () => {
    h.customFetch.mockResolvedValue(
      serverModels([
        {
          id: 'gemini-3.8-flash',
          label: 'Gemini 3.8 Flash',
          badge: 'recommended',
          description: 'Frontier workhorse.',
          tier: 'balanced',
        },
      ]),
    );
    await renderPanel();
    const option = await screen.findByRole('option', {
      name: /Gemini 3\.8 Flash \(Recommended\)/,
    });
    expect(option).toHaveTextContent('Recommended');
  });

  it('keeps a badge it does not recognise instead of dropping it', async () => {
    h.customFetch.mockResolvedValue(
      serverModels([
        {
          id: 'experimental-1',
          label: 'Experimental 1',
          badge: 'Experimental',
          description: 'A model the client has never heard of.',
          tier: 'balanced',
        },
      ]),
    );
    await renderPanel();
    const option = await screen.findByRole('option', { name: /Experimental 1/ });
    expect(option).toHaveTextContent('Experimental');
  });
});
