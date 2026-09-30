import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgentActionCard, type AgentActionCardProps } from './AgentActionCard';

/**
 * P15.1 (docs/13-master-design-system-prompt.md) is a six-clause contract, and
 * every clause is a REQUIRED prop or a rendered row on this card:
 *
 *   1. verb + object count   2. what changed   3. what was NOT changed
 *   4. data used             5. status         6. controls + Why?
 *
 * The product's core promise is "automation is never silent" (§P3). If a clause
 * silently stops rendering, an agent action becomes unexplainable and
 * unreversible — so these are asserted row by row, not just smoke-tested.
 */
const base: AgentActionCardProps = {
  verb: 'Rescheduled',
  objectCount: 4,
  objectNoun: { one: 'task', many: 'tasks' },
  changes: [
    {
      id: 'c1',
      object: 'PS1 writeup',
      from: 'Tue 2 Nov 9:00 AM',
      to: 'Thu 4 Nov 3:00 PM',
    },
    { id: 'c2', object: 'Lab meeting', from: 'Wed 3 Nov 11:00 AM', to: 'Fri 5 Nov 10:00 AM' },
    { id: 'c3', object: 'Dentist', from: 'Wed 3 Nov 14:00', to: 'Wed 3 Nov 16:00' },
    { id: 'c4', object: 'Grocery run', from: 'Wed 3 Nov 18:00', to: 'Wed 3 Nov 19:00' },
  ],
  notChanged: ['2 fixed events', '1 task set to Off'],
  dataUsed: ['Tasks', 'Calendar', '2 memory facts'],
  state: 'executed',
};

const renderCard = (props: Partial<AgentActionCardProps> = {}) => {
  const handlers = {
    onUndo: vi.fn(),
    onEdit: vi.fn(),
    onApprove: vi.fn(),
    onRetry: vi.fn(),
    onStop: vi.fn(),
    onCancel: vi.fn(),
    onAcknowledge: vi.fn(),
  };
  const result = render(<AgentActionCard {...base} {...handlers} {...props} />);
  return { ...result, ...handlers };
};

describe('P15.1 (1) verb + object count', () => {
  it('renders the verb, the count and the explicit noun', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Rescheduled 4 tasks' })).toBeInTheDocument();
  });

  it('uses the caller-supplied singular rather than guessing pluralisation', () => {
    renderCard({ objectCount: 1, objectNoun: { one: 'time block', many: 'time blocks' } });
    expect(screen.getByRole('heading', { name: 'Rescheduled 1 time block' })).toBeInTheDocument();
  });

  it('a headline escape hatch replaces the generated line for pre-action states', () => {
    renderCard({ state: 'thinking', headline: 'Reading your calendar…' });
    expect(screen.getByRole('heading', { name: 'Reading your calendar…' })).toBeInTheDocument();
  });
});

describe('P15.1 (2) what changed', () => {
  it('names the first change with its full before -> after transition', () => {
    renderCard({ changeVerb: 'Moved' });
    const row = screen.getByText(/PS1 writeup/).closest('p')!;
    expect(row).toHaveTextContent('Moved:');
    expect(row).toHaveTextContent('"PS1 writeup"');
    expect(row).toHaveTextContent('from Tue 2 Nov 9:00 AM to Thu 4 Nov 3:00 PM');
  });

  it('defaults the change verb to the neutral "Changed" rather than guessing', () => {
    renderCard();
    expect(screen.getByText(/PS1 writeup/).closest('p')).toHaveTextContent('Changed:');
  });

  it('collapses the overflow to "(+3 more)" instead of silently dropping the rest', () => {
    renderCard();
    expect(screen.getByText(/· \(\+3 more\)/)).toBeInTheDocument();
  });

  it('Details expands to every remaining change, one row each', () => {
    renderCard();
    expect(screen.queryByTestId('agent-action-details')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-action-details-toggle'));
    const details = screen.getByTestId('agent-action-details');
    expect(details).toHaveTextContent('Lab meeting');
    expect(details).toHaveTextContent('Dentist');
    expect(details).toHaveTextContent('Grocery run');
    expect(details).toHaveTextContent('from Wed 3 Nov 11:00 AM to Fri 5 Nov 10:00 AM');
  });

  it('a single change needs no Details control', () => {
    renderCard({ changes: [{ id: 'c1', object: 'Solo', from: 'A', to: 'B' }] });
    expect(screen.queryByTestId('agent-action-details-toggle')).not.toBeInTheDocument();
  });

  it('a created task (no prior value) reads "to <new>" and an unscheduled one is not implied', () => {
    renderCard({ changes: [{ id: 'c1', object: 'New task', to: 'Thu 4 Nov 3:00 PM' }] });
    expect(screen.getByText(/New task/).closest('p')).toHaveTextContent('to Thu 4 Nov 3:00 PM');
  });

  it('an optional per-change note is carried, not dropped', () => {
    renderCard({
      changes: [{ id: 'c1', object: 'PS1 writeup', from: 'A', to: 'B', note: 'move 2 of 5' }],
    });
    expect(screen.getByText(/PS1 writeup/).closest('p')).toHaveTextContent('(move 2 of 5)');
  });
});

describe('P15.1 (3) and (4) what was NOT changed, and what data was used', () => {
  it('always renders both rows, even for a single change', () => {
    renderCard({ changes: [{ id: 'c1', object: 'Solo', from: 'A', to: 'B' }] });
    const notChanged = screen.getByTestId('agent-action-not-changed');
    expect(notChanged).toHaveTextContent('Not changed:');
    expect(notChanged).toHaveTextContent('2 fixed events · 1 task set to Off');
    const dataUsed = screen.getByTestId('agent-action-data-used');
    expect(dataUsed).toHaveTextContent('Used:');
    expect(dataUsed).toHaveTextContent('Tasks · Calendar · 2 memory facts');
  });

  it('says "nothing else" rather than rendering an empty row', () => {
    renderCard({ notChanged: [] });
    expect(screen.getByTestId('agent-action-not-changed')).toHaveTextContent('nothing else');
  });

  it('says "not recorded for this action" rather than hiding the row', () => {
    renderCard({ dataUsed: [] });
    expect(screen.getByTestId('agent-action-data-used')).toHaveTextContent(
      'not recorded for this action',
    );
  });
});

describe('P15.1 (5) status — always icon + TEXT, never colour alone', () => {
  it.each([
    ['thinking', 'Thinking'],
    ['tool-running', 'Running'],
    ['awaiting-approval', 'Awaiting approval'],
    ['executed', 'Done'],
    ['partial-failure', 'Partly done'],
    ['failed', 'Failed'],
    ['undone', 'Undone'],
    ['queued', 'Queued'],
    ['blocked', 'Not performed'],
    ['offline', 'Offline'],
  ] as const)('renders %s as a %s label plus a non-colour signal', (state, label) => {
    renderCard({ state });
    expect(screen.getByTestId('agent-action-card')).toHaveAttribute('data-state', state);
    const status = screen.getByTestId('agent-action-state');
    expect(status).toHaveTextContent(label);
    // §P6.3: the state carries an icon as well as the label.
    expect(status.querySelector('svg')).toBeInTheDocument();
  });

  it('errors announce assertively; everything else politely (§P17.1)', () => {
    for (const state of ['failed', 'blocked', 'partial-failure'] as const) {
      const { unmount } = renderCard({ state });
      const status = screen.getByTestId('agent-action-state');
      expect(status).toHaveAttribute('role', 'alert');
      expect(status).toHaveAttribute('aria-live', 'assertive');
      unmount();
    }
    for (const state of ['executed', 'running-not-a-state', 'thinking'] as const) {
      if (state === 'running-not-a-state') continue;
      const { unmount } = renderCard({ state });
      const status = screen.getByTestId('agent-action-state');
      expect(status).toHaveAttribute('role', 'status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      unmount();
    }
  });

  it('shows the caller-supplied detail after the label', () => {
    renderCard({ stateDetail: '14:02' });
    expect(screen.getByTestId('agent-action-state')).toHaveTextContent('· 14:02');
  });
});

describe('§P15.2 per-state honesty', () => {
  it('failed states what failed AND that nothing changed', () => {
    renderCard({ state: 'failed', failureReason: 'The calendar service did not respond.' });
    expect(screen.getByTestId('agent-action-failed')).toHaveTextContent(
      'The calendar service did not respond.',
    );
    expect(screen.getByTestId('agent-action-failed')).toHaveTextContent('Nothing was changed.');
  });

  it('blocked says the request was not performed, in words', () => {
    renderCard({ state: 'blocked', blockedNotice: 'Two of those tasks are locked.' });
    expect(screen.getByTestId('agent-action-blocked')).toHaveTextContent(
      'Two of those tasks are locked.',
    );
    expect(screen.getByTestId('agent-action-blocked')).toHaveTextContent('Nothing was changed.');
  });

  it('partial-failure lists per-item success AND failure with reasons', () => {
    renderCard({
      state: 'partial-failure',
      outcomes: [
        { id: 'a', object: 'PS1 writeup', ok: true },
        { id: 'b', object: 'Dentist', ok: false, reason: 'the slot was taken' },
      ],
    });
    expect(screen.getByTestId('agent-action-outcome-ok')).toHaveTextContent('PS1 writeup — done');
    const failed = screen.getByTestId('agent-action-outcome-failed');
    expect(failed).toHaveTextContent('Dentist');
    expect(failed).toHaveTextContent('the slot was taken');
  });

  it('partial-failure offers "Undo N that worked" and "Retry M that failed"', () => {
    const { onUndo, onRetry } = renderCard({
      state: 'partial-failure',
      outcomes: [
        { id: 'a', object: 'A', ok: true },
        { id: 'b', object: 'B', ok: false, reason: 'nope' },
      ],
    });
    const undo = screen.getByTestId('agent-action-undo');
    const retry = screen.getByTestId('agent-action-retry');
    expect(undo).toHaveTextContent('Undo 1 that worked');
    expect(retry).toHaveTextContent('Retry 1 that failed');
    fireEvent.click(undo);
    fireEvent.click(retry);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('undone keeps the log visible instead of vanishing like a toast', () => {
    renderCard({ state: 'undone', undoneAt: '14:05' });
    expect(screen.getByTestId('agent-action-undone')).toHaveTextContent('Undone at 14:05');
    expect(screen.getByTestId('agent-action-undone')).toHaveTextContent(
      'The original entry is kept in the log.',
    );
  });

  it('thinking shows a NAMED step, never a fake progress bar (§P15.2)', () => {
    const { container } = renderCard({ state: 'thinking', step: 'Checking the calendar for conflicts' });
    expect(screen.getByTestId('agent-action-step')).toHaveTextContent('Checking the calendar for conflicts');
    expect(container.querySelector('[role="progressbar"]')).not.toBeInTheDocument();
  });

  it('offline says everything else in the app keeps working', () => {
    renderCard({ state: 'offline' });
    expect(screen.getByTestId('agent-action-offline')).toHaveTextContent('keep working');
  });

  it('queued says the request is queued, not lost', () => {
    renderCard({ state: 'queued' });
    expect(screen.getByTestId('agent-action-queued')).toHaveTextContent('queued');
  });

  it('a fallback provider is disclosed in Details, not silently swapped', () => {
    renderCard({ fallbackProvider: 'Groq' });
    fireEvent.click(screen.getByTestId('agent-action-details-toggle'));
    expect(screen.getByTestId('agent-action-fallback-provider')).toHaveTextContent(
      'Answered by Groq, a fallback provider. No other provider was available.',
    );
  });
});

describe('P15.1 (6) controls + Why?', () => {
  it('executed + onUndo offers Undo — this is how a change is reversed (D-26)', () => {
    const { onUndo } = renderCard();
    fireEvent.click(screen.getByTestId('agent-action-undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('renders no control the caller cannot actually perform', () => {
    renderCard({ onUndo: undefined, onEdit: undefined, onApprove: undefined });
    expect(screen.queryByTestId('agent-action-undo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-action-approve')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-action-edit')).not.toBeInTheDocument();
  });

  it('awaiting-approval offers Approve, never Undo', () => {
    renderCard({ state: 'awaiting-approval' });
    expect(screen.getByTestId('agent-action-approve')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-action-undo')).not.toBeInTheDocument();
  });

  it('thinking offers Stop; tool-running offers Cancel', () => {
    const a = renderCard({ state: 'thinking' });
    expect(screen.getByTestId('agent-action-stop')).toBeInTheDocument();
    a.unmount();
    renderCard({ state: 'tool-running' });
    expect(screen.getByTestId('agent-action-cancel')).toBeInTheDocument();
  });

  it('"Why?" is collapsed until asked, then explains in plain language', () => {
    renderCard({ why: 'Those slots clashed with two fixed events, so the sweep picked the next free window.' });
    expect(screen.queryByTestId('agent-action-why')).not.toBeInTheDocument();
    const toggle = screen.getByTestId('agent-action-why-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('agent-action-why')).toHaveTextContent('next free window');
  });

  it('offers no "Why?" when there is no explanation to give', () => {
    renderCard();
    expect(screen.queryByTestId('agent-action-why-toggle')).not.toBeInTheDocument();
  });

  it('a whitespace-only explanation does not produce an empty "Why?" control', () => {
    renderCard({ why: '   ' });
    expect(screen.queryByTestId('agent-action-why-toggle')).not.toBeInTheDocument();
  });
});

describe('§P12 loading and disabled-with-reason', () => {
  it('busy disables the controls, sets aria-busy, and keeps them rendered', () => {
    renderCard({ busy: true });
    const undo = screen.getByTestId('agent-action-undo');
    expect(undo).toBeDisabled();
    expect(undo).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('agent-action-undo')).toBeInTheDocument();
  });

  it('busyReason explains an in-flight request even when nothing is disabled', () => {
    renderCard({ busyReason: 'Still waiting on the calendar service.' });
    expect(screen.getByTestId('agent-action-busy-reason')).toHaveTextContent(
      'Still waiting on the calendar service.',
    );
  });
});

describe('§P15.3 anti-anthropomorphism', () => {
  it('renders a neutral Sparkles glyph and no avatar, name or image', () => {
    const { container } = renderCard();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    // No first-person copy anywhere on the card.
    expect(document.body.textContent).not.toMatch(/\bI\b|\bmy\b|\bme\b/);
  });

  it('carries the AI provenance tag for an agent-caused action', () => {
    renderCard();
    expect(screen.getByTestId('ai-tag-agent')).toHaveTextContent('Agent');
  });

  it('carries "auto-moved" provenance for an automation-caused action', () => {
    renderCard({ provenance: 'auto-moved' });
    expect(screen.getByTestId('ai-tag-auto-moved')).toBeInTheDocument();
  });

  it('renders NO tag for a user-made item', () => {
    const { container } = renderCard({ provenance: null });
    expect(container.querySelector('[data-testid^="ai-tag-"]')).not.toBeInTheDocument();
  });
});

describe('custom labels', () => {
  it('a caller can relabel the undo control without forking the card', () => {
    renderCard({ labels: { undo: 'Undo move' } });
    expect(screen.getByTestId('agent-action-undo')).toHaveTextContent('Undo move');
  });

  it('falls back to the built-in label for keys the caller did not override', () => {
    renderCard({ labels: { undo: 'Undo move' }, onEdit: vi.fn(), state: 'failed' });
    expect(screen.getByTestId('agent-action-retry')).toHaveTextContent('Retry');
    expect(screen.getByTestId('agent-action-edit')).toHaveTextContent('Edit request');
  });
});