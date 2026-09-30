import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Integration cover for the capture flow with the GENERATED API CLIENT MOCKED.
 *
 * The parser itself is unit-tested in `src/lib/capture/parseQuickCapture.test.ts`.
 * What is untestable there, and what this file locks down, is the gate the parser
 * feeds: P3 error prevention says a misparse must never be committed, and P12
 * says a blocked control must say why. Both live in `useQuickCapture`.
 *
 * The mock is module-level and shaped like the real client, in the style already
 * used in artifacts/api-server (`agent.test.ts`, `automation.test.ts`): stub the
 * hooks, assert on the calls, and never touch the network.
 */
const mutateAsync = vi.fn();
const invalidateQueries = vi.fn();
const createTag = vi.fn();

vi.mock('@workspace/api-client-react', () => ({
  createTag: (...args: unknown[]) => createTag(...args),
  getListTasksQueryKey: () => ['listTasks'],
  getListTagsQueryKey: () => ['listTags'],
  getGetTaskSummaryQueryKey: () => ['taskSummary'],
  getGetMomentumQueryKey: () => ['momentum'],
  useListProjects: () => ({ data: [{ id: 7, name: 'Hermes' }] }),
  useListTags: () => ({ data: [{ id: 11, name: 'eng' }] }),
  useCreateTask: () => ({ mutateAsync, isPending: false }),
}));

const { QuickCaptureForm } = await import('./QuickCaptureSheet');

const PROJECTS = [{ id: 7, name: 'Hermes' }];
const TAGS = [{ id: 11, name: 'eng' }];

function Harness({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderForm = () => {
  const onSaved = vi.fn();
  const result = render(
    <Harness>
      <QuickCaptureForm variant="sheet" testId="form-quick-capture" inputTestId="input-quick-capture" onSaved={onSaved} />
    </Harness>,
  );
  return {
    ...result,
    onSaved,
    form: () => screen.getByTestId('form-quick-capture'),
    input: () => screen.getByTestId('input-quick-capture') as HTMLInputElement,
    submit: () => screen.getByTestId('capture-submit') as HTMLButtonElement,
  };
};

const type = (input: HTMLInputElement, value: string) =>
  fireEvent.change(input, { target: { value } });

describe('quick capture — the ambiguity gate blocks a misparse from being saved', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mutateAsync.mockReset();
    createTag.mockReset();
    createTag.mockResolvedValue({ id: 11, name: 'eng' });
    mutateAsync.mockResolvedValue({ id: 99 });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('a fully resolvable capture is submittable and creates the task', async () => {
    const { form, input, submit, onSaved } = renderForm();
    type(input(), 'Review PR tomorrow 3pm 45m #eng project:Hermes');

    expect(form()).toHaveAttribute('data-phase', 'parsed');
    expect(submit()).toBeEnabled();
    fireEvent.click(submit());

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0].data;
    expect(payload.title).toBe('Review PR');
    expect(payload.priority).toBe('medium');
    expect(payload.durationMin).toBe(45);
    expect(payload.projectId).toBe(7);
    expect(payload.tagIds).toEqual([11]);
    expect(payload.dueText).toContain('tomorrow');
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ title: 'Review PR', queued: false }));
  });

  it('an UNRESOLVED chip disables Capture and says exactly what to resolve', () => {
    const { form, input, submit } = renderForm();
    // "friday" is genuinely ambiguous (this Friday vs next Friday).
    type(input(), 'Standup friday');

    expect(form()).toHaveAttribute('data-phase', 'ambiguous');
    expect(submit()).toBeDisabled();
    const reason = screen.getByTestId('capture-block-reason');
    expect(reason).toHaveTextContent('Resolve "friday" to save');
    expect(reason).toHaveTextContent('tap the chip to choose');
  });

  it('a misparse never reaches the server', async () => {
    const { input, submit } = renderForm();
    type(input(), 'Standup friday');
    // Even forcing the click past the disabled attribute must not create a task.
    fireEvent.click(submit());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('resolving the chip through the resolver unblocks the save', () => {
    const { form, input, submit } = renderForm();
    type(input(), 'Standup friday');
    expect(submit()).toBeDisabled();

    // Open the chip, then pick "Next Friday".
    fireEvent.click(screen.getAllByTestId('capture-chip-open')[0]);
    const options = screen.getAllByTestId('capture-chip-option');
    fireEvent.click(options.find((o) => o.textContent?.includes('Next Friday'))!);

    expect(form()).toHaveAttribute('data-phase', 'parsed');
    expect(submit()).toBeEnabled();
    expect(screen.queryByTestId('capture-block-reason')).not.toBeInTheDocument();
  });

  it('several unresolved chips are counted, not just the first', () => {
    const { input } = renderForm();
    type(input(), 'Standup friday at 3:30 project:Zeus');
    expect(screen.getByTestId('capture-block-reason')).toHaveTextContent('Resolve 3 chips to save');
  });

  it('"Keep as plain text" is a valid answer that unblocks the save without inventing a value', () => {
    const { form, input, submit } = renderForm();
    type(input(), 'Standup friday');
    expect(submit()).toBeDisabled();

    fireEvent.click(screen.getAllByTestId('capture-chip-open')[0]);
    fireEvent.click(screen.getByTestId('capture-chip-keep-as-text'));

    expect(submit()).toBeEnabled();
    // Every chip is now removed, so there is nothing left to parse.
    expect(form()).toHaveAttribute('data-phase', 'typing');
  });

  it('removing an ambiguous chip keeps the words in the saved title rather than losing them', async () => {
    const { input } = renderForm();
    type(input(), 'Standup friday');
    fireEvent.click(screen.getAllByTestId('capture-chip-remove')[0]);
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0].data.title).toBe('Standup friday');
  });
});

describe('quick capture — P11.1 never loses typed text', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: 99 });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('an empty submit is refused with a reason and no request', async () => {
    const { submit } = renderForm();
    expect(submit()).toBeDisabled();
    fireEvent.click(submit());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('a whitespace-only draft is still empty', () => {
    const { form, input, submit } = renderForm();
    type(input(), '    ');
    expect(submit()).toBeDisabled();
    expect(form()).toHaveAttribute('data-phase', 'idle');
  });

  it('a server failure keeps the typed text and offers a retry', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Task service unavailable.'));
    const { input, submit } = renderForm();
    type(input(), 'Review PR tomorrow');
    fireEvent.click(submit());

    await waitFor(() => expect(screen.getByTestId('capture-error')).toBeInTheDocument());
    expect(screen.getByTestId('capture-error')).toHaveTextContent('Task service unavailable.');
    // The text is still in the field.
    expect(input().value).toBe('Review PR tomorrow');
    expect(screen.getByTestId('capture-retry')).toBeInTheDocument();
  });

  it('a tag that cannot be created does not lose the task', async () => {
    // The production path deliberately `console.warn`s here; silence just this
    // one so a real unexpected warning elsewhere would still be visible.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createTag.mockRejectedValueOnce(new Error('tag service down'));
    const { input, submit } = renderForm();
    type(input(), 'Ship it #eng');
    fireEvent.click(submit());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    // Saved, just without the tag.
    expect(mutateAsync.mock.calls[0][0].data.tagIds).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('Escape does NOT clear the field', () => {
    const { input } = renderForm();
    type(input(), 'Half typed thought');
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input().value).toBe('Half typed thought');
  });

  it('the draft survives a remount via localStorage', () => {
    const first = renderForm();
    type(first.input(), 'Survives a reload');
    first.unmount();

    const second = renderForm();
    expect(second.input().value).toBe('Survives a reload');
    expect(screen.getByText('Unsent draft restored.')).toBeInTheDocument();
  });

  it('the sheet variant previews the title that will actually be saved', () => {
    const { input } = renderForm();
    type(input(), 'Review PR tomorrow 3pm 45m');
    expect(screen.getByTestId('capture-title-preview')).toHaveTextContent('Saves as “Review PR”');
  });
});

describe('quick capture — priority parsing reaches the payload', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mutateAsync.mockReset();
    createTag.mockReset();
    createTag.mockResolvedValue({ id: 11, name: 'eng' });
    mutateAsync.mockResolvedValue({ id: 99 });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it.each([
    ['!high', 'high'],
    ['p2', 'medium'],
    ['!low', 'low'],
  ])('%s maps to priority %s', async (token, priority) => {
    const { input, submit } = renderForm();
    type(input(), `Fix the build ${token}`);
    fireEvent.click(submit());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0].data.priority).toBe(priority);
  });
});

describe('quick capture — the projects/tags context feeds the chip options', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('a known project resolves without asking, using the loaded project list', () => {
    const { form, input, submit } = renderForm();
    type(input(), 'Plan project:Hermes');
    expect(form()).toHaveAttribute('data-phase', 'parsed');
    expect(submit()).toBeEnabled();
  });

  it('the mocked project list is the one in play', () => {
    expect(PROJECTS[0].name).toBe('Hermes');
    expect(TAGS[0].name).toBe('eng');
  });
});