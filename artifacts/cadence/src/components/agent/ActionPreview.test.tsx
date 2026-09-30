import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  ActionPreview,
  BULK_CONFIRM_THRESHOLD,
  type ActionPreviewChange,
} from './ActionPreview';

/**
 * D-05 / spec §agent-and-memory-subsystem.md §5: "Confirm before any bulk agent
 * action touching more than 10 tasks."
 *
 * The threshold itself is `BULK_CONFIRM_THRESHOLD = 10` and the comparison is
 * STRICTLY GREATER THAN, so 10 does not trip it and 11 does. The subtle part,
 * and the reason this file exists, is WHICH list is measured. It must be the
 * EFFECTIVE list: items the user has unticked, and items marked `fixed`, are
 * both excluded — so dropping from 12 to 9 must clear the bulk notice and
 * rewrite the button before the user commits.
 */
const changes = (count: number, prefix = 'Task'): ActionPreviewChange[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    title: `${prefix} ${i + 1}`,
    from: 'Tue 2 Nov 9:00 AM',
    to: 'Thu 4 Nov 3:00 PM',
    kind: 'move' as const,
  }));

const renderPreview = (props: Partial<React.ComponentProps<typeof ActionPreview>> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <ActionPreview
      verb="Reschedule"
      changes={[]}
      notChanged={['2 fixed events']}
      dataUsed={['Tasks', 'Calendar']}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { ...result, onConfirm, onCancel };
};

describe('BULK_CONFIRM_THRESHOLD', () => {
  it('is 10, matching D-05', () => {
    expect(BULK_CONFIRM_THRESHOLD).toBe(10);
  });

  it('is overridable without forking the component', () => {
    renderPreview({ changes: changes(3), threshold: 2 });
    expect(screen.getByTestId('action-preview-threshold')).toBeInTheDocument();
  });
});

describe('the >10 rule', () => {
  it('10 changes is NOT bulk — the threshold is strictly greater than 10', () => {
    renderPreview({ changes: changes(10) });
    expect(screen.queryByTestId('action-preview-threshold')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-preview')).toHaveAttribute('data-bulk', 'false');
    expect(screen.getByTestId('action-preview')).toHaveAttribute('data-effective-count', '10');
  });

  it('11 changes IS bulk and names the threshold and the count in words', () => {
    renderPreview({ changes: changes(11) });
    const notice = screen.getByTestId('action-preview-threshold');
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveTextContent('More than 10 tasks');
    expect(notice).toHaveTextContent('All 11 are listed below before anything changes.');
    expect(screen.getByTestId('action-preview')).toHaveAttribute('data-bulk', 'true');
    // Announced assertively — this is the one thing on the card that must not
    // be missed.
    expect(notice).toHaveAttribute('role', 'alert');
  });

  it('0 changes is not bulk, and Confirm is disabled with a visible reason', () => {
    renderPreview({ changes: [] });
    expect(screen.queryByTestId('action-preview-threshold')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-preview')).toHaveAttribute('data-effective-count', '0');
    expect(screen.getByTestId('action-preview-confirm')).toBeDisabled();
    expect(screen.getByTestId('action-preview-disabled-reason')).toHaveTextContent(
      'Every listed change is excluded',
    );
  });

  it('names the real count and verb on the button, never a bare "Confirm" (P13)', () => {
    renderPreview({ changes: changes(11) });
    expect(screen.getByTestId('action-preview-confirm')).toHaveTextContent('Reschedule 11 tasks');
  });

  it('uses the singular for exactly one change', () => {
    renderPreview({ changes: changes(1) });
    expect(screen.getByTestId('action-preview-count')).toHaveTextContent('This would Reschedule 1 task.');
    expect(screen.getByTestId('action-preview-confirm')).toHaveTextContent('Reschedule 1 task');
  });

  it('never offers a bare "Confirm" or an "OK"', () => {
    renderPreview({ changes: changes(11) });
    expect(screen.queryByRole('button', { name: /^confirm$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ok$/i })).not.toBeInTheDocument();
  });
});

describe('the threshold is measured against the EFFECTIVE list', () => {
  it('unticking one item from 11 to 10 clears the bulk notice and the button label', () => {
    renderPreview({ changes: changes(11) });
    expect(screen.getByTestId('action-preview')).toHaveAttribute('data-bulk', 'true');

    const toggles = screen.getAllByTestId('action-preview-item-toggle');
    fireEvent.click(toggles[0]);

    expect(screen.queryByTestId('action-preview-threshold')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-preview')).toHaveAttribute('data-bulk', 'false');
    expect(screen.getByTestId('action-preview')).toHaveAttribute('data-effective-count', '10');
    expect(screen.getByTestId('action-preview-confirm')).toHaveTextContent('Reschedule 10 tasks');
    expect(screen.getByTestId('action-preview-skipped-count')).toHaveTextContent(
      '1 change is excluded and will be left alone',
    );
  });

  it('unticking back down to 1 from 11 clears the bulk notice entirely', () => {
    renderPreview({ changes: changes(11) });
    for (const toggle of screen.getAllByTestId('action-preview-item-toggle').slice(0, 10)) {
      fireEvent.click(toggle);
    }
    expect(screen.queryByTestId('action-preview-threshold')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-preview')).toHaveAttribute('data-effective-count', '1');
  });

  it('onConfirm receives the EFFECTIVE list, not the full one', () => {
    const { onConfirm } = renderPreview({ changes: changes(11) });
    fireEvent.click(screen.getAllByTestId('action-preview-item-toggle')[0]);
    fireEvent.click(screen.getByTestId('action-preview-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toHaveLength(10);
    expect(onConfirm.mock.calls[0][0].map((c: ActionPreviewChange) => c.id)).not.toContain('c0');
  });

  it('`fixed` items are excluded from the count, so 10 movable + 2 fixed is not bulk', () => {
    // Rule 1 (spec/auto-reschedule-engine.md): fixed events are listed for
    // completeness but are never applied, so they must not inflate the count
    // into a bulk action the user has to confirm.
    const list: ActionPreviewChange[] = [
      ...changes(10),
      { id: 'f1', title: 'Client call', kind: 'move', fixed: true },
      { id: 'f2', title: 'Dentist', kind: 'move', fixed: true },
    ];
    renderPreview({ changes: list });
    expect(screen.getByTestId('action-preview')).toHaveAttribute('data-effective-count', '10');
    expect(screen.queryByTestId('action-preview-threshold')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-preview-fixed-note')).toHaveTextContent(
      '2 of these items are marked as not movable',
    );
  });

  it('11 movable + fixed items IS still bulk', () => {
    const list: ActionPreviewChange[] = [
      ...changes(11),
      { id: 'f1', title: 'Client call', kind: 'move', fixed: true },
    ];
    renderPreview({ changes: list });
    expect(screen.getByTestId('action-preview')).toHaveAttribute('data-effective-count', '11');
    expect(screen.getByTestId('action-preview-threshold')).toBeInTheDocument();
  });

  it('a fixed item can never be unticked into (or out of) the effective list', () => {
    const { onConfirm } = renderPreview({
      changes: [
        ...changes(1),
        { id: 'f1', title: 'Client call', kind: 'move', fixed: true },
      ],
    });
    const fixedToggle = screen.getAllByTestId('action-preview-item-toggle')[1];
    expect(fixedToggle).toBeDisabled();
    fireEvent.click(fixedToggle);
    fireEvent.click(screen.getByTestId('action-preview-confirm'));
    expect(onConfirm.mock.calls[0][0].map((c: ActionPreviewChange) => c.id)).toEqual(['c0']);
  });
});

describe('degraded / unavailable path', () => {
  it('with an unavailableReason the changes are not presented as actionable and Confirm is off', () => {
    renderPreview({
      changes: changes(11),
      unavailableReason: 'The assistant could not list the affected tasks.',
    });
    expect(screen.getByTestId('action-preview-unavailable')).toHaveTextContent(
      'The assistant could not list the affected tasks.',
    );
    expect(screen.getByTestId('action-preview-unavailable')).toHaveTextContent('Nothing was changed.');
    expect(screen.getByTestId('action-preview-confirm')).toBeDisabled();
    for (const toggle of screen.getAllByTestId('action-preview-item-toggle')) {
      expect(toggle).toBeDisabled();
    }
  });

  it('names an explicit confirmDisabledReason verbatim (P12: disabled is never silent)', () => {
    renderPreview({ changes: changes(2), confirmDisabledReason: 'Undo is not wired up yet.' });
    expect(screen.getByTestId('action-preview-disabled-reason')).toHaveTextContent(
      'Undo is not wired up yet.',
    );
    expect(screen.getByTestId('action-preview-confirm')).toBeDisabled();
  });

  it('busy blocks Confirm and sets aria-busy without losing the button', () => {
    renderPreview({ changes: changes(3), busy: true });
    const confirm = screen.getByTestId('action-preview-confirm');
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
  });
});

describe('explainability (P15.1) on the pending action', () => {
  it('always states what was not changed and what data was used', () => {
    renderPreview({ changes: changes(2) });
    expect(screen.getByTestId('action-preview-not-changed')).toHaveTextContent('2 fixed events');
    expect(screen.getByTestId('action-preview-data-used')).toHaveTextContent('Tasks');
  });

  it('says "nothing else" / "not recorded" rather than rendering an empty row', () => {
    renderPreview({ changes: changes(2), notChanged: [], dataUsed: [] });
    expect(screen.getByTestId('action-preview-not-changed')).toHaveTextContent('nothing else');
    expect(screen.getByTestId('action-preview-data-used')).toHaveTextContent(
      'not recorded for this action',
    );
  });

  it('lists the exact old -> new transition for each change', () => {
    renderPreview({ changes: changes(2) });
    const items = screen.getAllByTestId('action-preview-item');
    expect(within(items[0]).getByText('Tue 2 Nov 9:00 AM')).toBeInTheDocument();
    expect(within(items[0]).getByText('Thu 4 Nov 3:00 PM')).toBeInTheDocument();
  });

  it('"Why?" is collapsed until asked, then explains in words', () => {
    renderPreview({ changes: changes(2), why: 'Two tasks had conflicts, so they moved to the next free slot.' });
    expect(screen.queryByTestId('action-preview-why')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('action-preview-why-toggle'));
    expect(screen.getByTestId('action-preview-why')).toHaveTextContent('next free slot');
  });

  it('offers no "Why?" control when there is no explanation to give', () => {
    renderPreview({ changes: changes(2) });
    expect(screen.queryByTestId('action-preview-why-toggle')).not.toBeInTheDocument();
  });

  it('always says it is awaiting approval — nothing has happened yet', () => {
    renderPreview({ changes: changes(11) });
    expect(screen.getByTestId('action-preview-state')).toHaveTextContent('Awaiting your approval');
  });
});