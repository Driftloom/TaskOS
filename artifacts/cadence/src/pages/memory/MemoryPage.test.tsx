import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryPage } from './MemoryPage';

/**
 * The "Add Memory Fact" form writes a fact the USER typed. It is not an
 * inference, so the client has no measured confidence to send — claiming
 * `confidence: 100` told the user (and every later screen) that Cadence had
 * measured something it had not.
 *
 * The create payload is asserted through the real mutation hook, so the test
 * sees exactly what would go over the wire.
 */
const { createMutate } = vi.hoisted(() => ({ createMutate: vi.fn() }));

vi.mock('@workspace/api-client-react', () => ({
  useListMemoryFacts: () => ({
    data: { facts: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useListMemoryConfirmations: () => ({
    data: { confirmations: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useCreateMemoryFact: () => ({ mutate: createMutate, isPending: false }),
  useUpdateMemoryFact: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMemoryFact: () => ({ mutate: vi.fn(), isPending: false }),
  useApproveMemoryConfirmation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeclineMemoryConfirmation: () => ({ mutate: vi.fn(), isPending: false }),
}));

function renderMemoryPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryPage />
    </QueryClientProvider>,
  );
}

/** Opens the "Add Memory Fact" modal and submits a title. */
function submitNewFact(title: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add Memory Fact' }));
  fireEvent.change(screen.getByPlaceholderText(/Sunday evening sprint sessions/i), {
    target: { value: title },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Fact' }));
}

describe('MemoryPage — adding a fact you wrote yourself', () => {
  beforeEach(() => {
    createMutate.mockReset();
  });

  it('does not claim a confidence nobody measured', () => {
    renderMemoryPage();
    submitNewFact('Sunday evening sprints');

    expect(createMutate).toHaveBeenCalledTimes(1);
    const payload = createMutate.mock.calls[0][0];
    expect(payload.data.confidence).not.toBe(100);
  });

  it('marks the fact as the user\u2019s own, and keeps it out of the inference lane', () => {
    renderMemoryPage();
    submitNewFact('Sunday evening sprints');

    const payload = createMutate.mock.calls[0][0];
    expect(payload.data.value.createdByUser).toBe(true);
    expect(payload.data.source).toBe('conversational');
  });

  it('sends the title the user typed', () => {
    renderMemoryPage();
    submitNewFact('Sunday evening sprints');

    const payload = createMutate.mock.calls[0][0];
    expect(payload.data.title).toBe('Sunday evening sprints');
  });
});
