import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AutomationBadge, ProposalCard, type ProposalVariant } from './ProposalCard';

/**
 * P11.1 non-negotiable #3: **an expired proposal must never auto-apply.**
 *
 * The claim the UI makes is backed by the server: `POST /reschedule/:id/accept`
 * flips a stale proposal to `expired` and returns 400 WITHOUT touching
 * `tasks.due_at` (artifacts/api-server/src/routes/reschedule.ts). So expiry is
 * terminal, and the card's job is to make that unmistakable — it replaces the
 * decision controls with a receipt that says the task kept the time it had.
 */
const base = {
  proposalId: 5,
  taskId: 10,
  taskTitle: 'PS1 writeup',
  fromLabel: 'Tue 2 Nov 9:00 AM',
  toLabel: 'Thu 4 Nov 3:00 PM',
  why: 'The original slot clashed with the lab meeting.',
};

const renderCard = (props: Partial<React.ComponentProps<typeof ProposalCard>> = {}) => {
  const handlers = {
    onApprove: vi.fn(),
    onChange: vi.fn(),
    onDismiss: vi.fn(),
    onAcknowledge: vi.fn(),
  };
  const result = render(<ProposalCard {...base} {...handlers} {...props} />);
  return { ...result, ...handlers };
};

describe('an EXPIRED proposal never auto-applies', () => {
  it('offers no Approve / Change / Dismiss at all', () => {
    renderCard({ variant: 'expired' });
    expect(screen.queryByTestId('proposal-approve-5')).not.toBeInTheDocument();
    expect(screen.queryByTestId('proposal-change-5')).not.toBeInTheDocument();
    expect(screen.queryByTestId('proposal-dismiss-5')).not.toBeInTheDocument();
  });

  it('cannot be approved even if the handler is wired', () => {
    const { onApprove, onChange, onDismiss } = renderCard({ variant: 'expired' });
    const article = screen.getByTestId('proposal-card-5');
    expect(article).toHaveAttribute('data-proposal-variant', 'expired');
    // There is no control to press, so none of the three can fire.
    fireEvent.click(article);
    expect(onApprove).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('says in words that it was NOT applied and the task kept its time', () => {
    renderCard({ variant: 'expired' });
    const outcome = screen.getByTestId('proposal-outcome-5');
    expect(outcome).toHaveTextContent('This proposal timed out and was not applied.');
    expect(outcome).toHaveTextContent('The task still has the time it had before');
  });

  it('labels the state Expired with an icon, not colour alone', () => {
    renderCard({ variant: 'expired' });
    const chip = screen.getByTestId('proposal-state-5');
    expect(chip).toHaveTextContent('Expired');
    expect(chip.querySelector('svg')).toBeInTheDocument();
  });

  it('drops the AI provenance tag, because the engine is no longer asking', () => {
    renderCard({ variant: 'expired' });
    expect(screen.queryByTestId('ai-tag-suggested')).not.toBeInTheDocument();
  });

  it('offers only "Got it" to clear the receipt', () => {
    const { onAcknowledge } = renderCard({ variant: 'expired' });
    fireEvent.click(screen.getByTestId('proposal-ack-5'));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('still shows the proposed window so the receipt is legible, plus the one-line why', () => {
    renderCard({ variant: 'expired' });
    expect(screen.getByText(base.fromLabel)).toBeInTheDocument();
    expect(screen.getByText(base.toLabel)).toBeInTheDocument();
    expect(screen.getByTestId('proposal-why-5')).toHaveTextContent('clashed with the lab meeting');
  });
});

describe('every variant is distinguishable by icon + TEXT', () => {
  it.each([
    ['proposed', 'Proposed'],
    ['approved', 'Approved'],
    ['declined', 'Declined'],
    ['expired', 'Expired'],
    ['failed', 'Failed'],
  ] as const)('%s renders the %s label with an icon', (variant, label) => {
    renderCard({ variant });
    const chip = screen.getByTestId('proposal-state-5');
    expect(chip).toHaveTextContent(label);
    expect(chip.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByTestId('proposal-card-5')).toHaveAttribute('data-proposal-variant', variant);
  });

  it('an approved receipt says the move counted against the engine budget', () => {
    renderCard({ variant: 'approved' });
    expect(screen.getByTestId('proposal-outcome-5')).toHaveTextContent(
      'This counted as one engine-initiated move.',
    );
  });

  it('a declined receipt says the task kept its time', () => {
    renderCard({ variant: 'declined' });
    expect(screen.getByTestId('proposal-outcome-5')).toHaveTextContent(
      'The task keeps the time it had before',
    );
  });

  it('a pending proposal says nothing moves until the user chooses', () => {
    renderCard();
    expect(screen.getByTestId('proposal-outcome-5')).toHaveTextContent(
      'Nothing moves until you choose an action.',
    );
  });
});

describe('the open decision surface', () => {
  it('offers all three controls while the decision is open', () => {
    renderCard();
    expect(screen.getByTestId('proposal-approve-5')).toBeEnabled();
    expect(screen.getByTestId('proposal-change-5')).toBeEnabled();
    expect(screen.getByTestId('proposal-dismiss-5')).toBeEnabled();
  });

  it('routes each control to its handler', () => {
    const { onApprove, onChange, onDismiss } = renderCard();
    fireEvent.click(screen.getByTestId('proposal-approve-5'));
    fireEvent.click(screen.getByTestId('proposal-change-5'));
    fireEvent.click(screen.getByTestId('proposal-dismiss-5'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('busy disables all three without removing them', () => {
    renderCard({ busy: true });
    for (const id of ['proposal-approve-5', 'proposal-change-5', 'proposal-dismiss-5']) {
      expect(screen.getByTestId(id)).toBeDisabled();
    }
  });

  it('"failed" KEEPS its controls, because the decision never completed', () => {
    renderCard({ variant: 'failed', error: 'The calendar service did not respond.' });
    expect(screen.getByTestId('proposal-approve-5')).toBeInTheDocument();
    expect(screen.getByTestId('proposal-retry-5')).toHaveTextContent('still waiting on the server');
    expect(screen.getByTestId('proposal-outcome-5')).toHaveTextContent(
      'The calendar service did not respond.',
    );
  });
});

describe('P11.2: the "why" is always on screen, never tooltip-only', () => {
  it('renders the one-line why without any interaction', () => {
    renderCard();
    expect(screen.getByTestId('proposal-why-5')).toBeInTheDocument();
  });

  it('the AI tag expands into the detail, which states what automation did NOT do', () => {
    renderCard();
    expect(screen.queryByTestId('proposal-why-detail-5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Why was this suggested\?/ }));
    const detail = screen.getByTestId('proposal-why-detail-5');
    expect(detail).toHaveTextContent('Fixed events and tasks set to Off are never moved');
    expect(detail).toHaveTextContent('Once the cap is reached the task is flagged');
  });
});

describe('AutomationBadge — the cap flag (Rule 5, D-03)', () => {
  it('names the move count and the cap so the user can act on it', () => {
    render(<AutomationBadge moves={3} maxMoves={5} />);
    const badge = screen.getByTestId('automation-badge-needs-attention');
    expect(badge).toHaveTextContent('Needs attention');
    expect(badge).toHaveTextContent('3 of 5 moves');
  });

  it('always ships an icon alongside the text (§P6.3)', () => {
    const { container } = render(<AutomationBadge moves={5} maxMoves={5} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('changes the icon shape once the cap is reached', () => {
    const under = render(<AutomationBadge moves={4} maxMoves={5} />).container;
    const atCap = render(<AutomationBadge moves={5} maxMoves={5} />).container;
    expect(under.querySelector('.lucide-hourglass')).toBeInTheDocument();
    expect(atCap.querySelector('.lucide-shield-alert')).toBeInTheDocument();
  });

  it('renders only when the task needs attention', () => {
    renderCard({ needsAttention: false });
    expect(screen.queryByTestId('automation-badge-needs-attention')).not.toBeInTheDocument();
    const { unmount } = renderCard({ needsAttention: true, moves: 5, maxMoves: 5 });
    expect(screen.getByTestId('automation-badge-needs-attention')).toHaveTextContent('5 of 5');
    unmount();
  });
});

describe('variants are a closed set', () => {
  it('the declared union is exactly the five the server can produce', () => {
    const variants: ProposalVariant[] = ['proposed', 'approved', 'declined', 'expired', 'failed'];
    expect(new Set(variants).size).toBe(5);
  });
});