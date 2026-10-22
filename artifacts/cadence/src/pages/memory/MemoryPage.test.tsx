import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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

/** jsdom lays nothing out, so getClientRects reports empty rects and nothing
   is "reachable" per useModalFocus. Report a non-empty rect so the focus trap
   can move focus into the overlay the way a real browser would. */
const RECT_SHIM = { length: 1 } as unknown as DOMRectList;
let realGetClientRects: typeof Element.prototype.getClientRects;
beforeEach(() => {
  realGetClientRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = function getClientRects() {
    return RECT_SHIM;
  };
});
afterEach(() => {
  Element.prototype.getClientRects = realGetClientRects;
});

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
    // Omitted, not minted: the client has no measurement to report, so it
    // sends no number at all. (A "not 100" assertion would also have passed
    // for 75 or 0, which are both still claims.)
    expect(payload.data.confidence).toBeUndefined();
    expect('confidence' in payload.data).toBe(false);
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

describe('MemoryPage — Add Fact modal accessibility', () => {
  beforeEach(() => {
    createMutate.mockReset();
  });

  it('associates every Add Fact label with its control', () => {
    renderMemoryPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add Memory Fact' }));

    expect(screen.getByLabelText('Fact Title')).toHaveAttribute('id', 'memory-fact-title');
    expect(screen.getByLabelText('Key Identifier')).toHaveAttribute(
      'id',
      'memory-key-identifier',
    );
    expect(screen.getByLabelText('Category')).toHaveAttribute('id', 'memory-category');
    expect(screen.getByLabelText('Details / Notes')).toHaveAttribute('id', 'memory-details-notes');
  });

  it('declares the Add Fact dialog and keeps focus inside it', () => {
    renderMemoryPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add Memory Fact' }));

    const dialog = screen.getByRole('dialog', { name: 'Record Custom Work Fact' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'memory-add-fact-heading');
    expect(document.getElementById('memory-add-fact-heading')).toBeInTheDocument();

    // The close button in the modal header is the first focusable descendant;
    // the Save Fact button is the last.
    const first = screen.getByRole('button', { name: 'Close' });
    const last = screen.getByRole('button', { name: /Save Fact/ });

    // Place focus inside the overlay (as the hook does on open in a real browser).
    first.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab in either direction never moves focus out of the overlay.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Shift+Tab from the first control wraps to the last; Tab wraps back.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
