import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ConfirmationPrompt,
  FADING_FLOOR,
  MemoryFactCard,
  confidenceBand,
  confidenceBandLabel,
  effectiveConfidence,
  isFadingFact,
  relativeTime,
} from './MemoryFactCard';
import type { MemoryFact } from '@workspace/api-client-react';

/**
 * P15.4 is the contract, and it turns on one locked decision — D-10, the
 * Source A / Source B split:
 *
 *   Source A `behavioral`    -> "Measured from your data" -> updates AUTOMATICALLY
 *   Source B `conversational` -> "Inferred from chat"     -> ALWAYS PROMPTS
 *
 * Getting that backwards would silently rewrite a user's model of themselves,
 * so the split, the read-time decay, and the confirm-before-use gate are all
 * locked down here. The decay maths (`e^(-0.02 x days)`) comes from
 * spec/agent-and-memory-subsystem.md §2.3.
 */
const NOW = Date.parse('2026-10-05T09:00:00.000Z');
const DAY = 86_400_000;

const fact = (overrides: Partial<MemoryFact> = {}): MemoryFact =>
  ({
    id: 1,
    key: 'sunday_sprint_rhythm',
    title: 'You plan your heaviest work for Sunday mornings.',
    statement: 'You plan your heaviest work for Sunday mornings.',
    category: 'work_pattern',
    source: 'behavioral',
    confidence: 90,
    evidenceCount: 12,
    value: {},
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    lastReinforcedAt: '2026-10-05T09:00:00.000Z',
    archived: false,
    ...overrides,
  }) as MemoryFact;

const renderCard = (overrides: Partial<MemoryFact> = {}, props: Record<string, unknown> = {}) => {
  const handlers = { onEdit: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn() };
  const result = render(
    <MemoryFactCard
      fact={fact(overrides)}
      now={NOW}
      onEdit={handlers.onEdit}
      onArchive={handlers.onArchive}
      onDelete={handlers.onDelete}
      {...props}
    />,
  );
  return { ...result, ...handlers };
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('confidenceBand', () => {
  it('uses 80 / 50 as the documented cut-offs', () => {
    expect(confidenceBand(100)).toBe('high');
    expect(confidenceBand(80)).toBe('high');
    expect(confidenceBand(79)).toBe('medium');
    expect(confidenceBand(50)).toBe('medium');
    expect(confidenceBand(49)).toBe('low');
    expect(confidenceBand(0)).toBe('low');
  });

  it('has a text label for every band, so confidence is never colour alone', () => {
    for (const band of ['low', 'medium', 'high'] as const) {
      expect(confidenceBandLabel(band)).toMatch(/^(Low|Medium|High)$/);
    }
  });
});

describe('effectiveConfidence — read-time decay', () => {
  it('returns the stored value when there is no reinforcement date', () => {
    expect(effectiveConfidence(72, null, NOW)).toBe(72);
    expect(effectiveConfidence(72, undefined, NOW)).toBe(72);
  });

  it('returns the stored value for an unparseable date rather than NaN', () => {
    expect(effectiveConfidence(72, 'not a date', NOW)).toBe(72);
  });

  it('halves after roughly 35 days (0.02 per day, spec §2.3)', () => {
    // ln(2) / 0.02 = 34.66 days.
    const halfLifeDays = Math.log(2) / 0.02;
    const value = effectiveConfidence(100, new Date(NOW - halfLifeDays * DAY).toISOString(), NOW);
    expect(value).toBeGreaterThanOrEqual(49);
    expect(value).toBeLessThanOrEqual(51);
  });

  it('decays monotonically the longer a fact goes unreinforced', () => {
    const at = (days: number) =>
      effectiveConfidence(100, new Date(NOW - days * DAY).toISOString(), NOW);
    const series = [0, 7, 30, 90, 365].map(at);
    for (let i = 1; i < series.length; i++) {
      expect(series[i], `day ${i}`).toBeLessThan(series[i - 1]);
    }
  });

  it('never falls below 0 or rises above 100', () => {
    expect(effectiveConfidence(100, new Date(NOW - 100 * 365 * DAY).toISOString(), NOW)).toBe(0);
    expect(effectiveConfidence(100, new Date(NOW + 100 * DAY).toISOString(), NOW)).toBeLessThanOrEqual(100);
  });

  it('does not decay for a future reinforcement date', () => {
    expect(effectiveConfidence(80, new Date(NOW + DAY).toISOString(), NOW)).toBe(80);
  });

  it('returns a rounded integer, never a float', () => {
    const value = effectiveConfidence(83, new Date(NOW - 11 * DAY).toISOString(), NOW);
    expect(Number.isInteger(value)).toBe(true);
  });
});

describe('isFadingFact', () => {
  it('a freshly reinforced, confident fact is not fading', () => {
    expect(isFadingFact({ confidence: 90, lastReinforcedAt: new Date(NOW).toISOString() }, NOW)).toBe(false);
  });

  it('a fact that has decayed below the floor is fading', () => {
    const stale = { confidence: 90, lastReinforcedAt: new Date(NOW - 200 * DAY).toISOString() };
    expect(isFadingFact(stale, NOW)).toBe(true);
    expect(effectiveConfidence(90, stale.lastReinforcedAt, NOW)).toBeLessThan(FADING_FLOOR);
  });

  it('a fact that was born weak is fading immediately', () => {
    expect(isFadingFact({ confidence: 10, lastReinforcedAt: null }, NOW)).toBe(true);
  });
});

describe('relativeTime', () => {
  it('says "never" for a missing or unparseable date rather than "NaN ago"', () => {
    expect(relativeTime(null, NOW)).toBe('never');
    expect(relativeTime(undefined, NOW)).toBe('never');
    expect(relativeTime('', NOW)).toBe('never');
    expect(relativeTime('nonsense', NOW)).toBe('never');
  });

  it('formats the recent past in words', () => {
    expect(relativeTime(new Date(NOW - DAY).toISOString(), NOW)).toMatch(/yesterday|last day|1 day ago/i);
    expect(relativeTime(new Date(NOW - 5 * DAY).toISOString(), NOW)).toMatch(/5 days ago|last week/i);
  });

  it('formats minutes and hours', () => {
    expect(relativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toMatch(/5 minutes ago/i);
    expect(relativeTime(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toMatch(/3 hours ago|3 hours/i);
  });

  it('handles the future', () => {
    expect(relativeTime(new Date(NOW + 2 * DAY).toISOString(), NOW)).toMatch(/tomorrow|2 days|in 2 days/i);
  });
});

// ---------------------------------------------------------------------------
// D-10: the Source A / Source B split
// ---------------------------------------------------------------------------

describe('D-10 — the source split is visible and stated in words', () => {
  it('Source A (behavioral) reads "Measured from your data" and auto-updates', () => {
    renderCard({ source: 'behavioral' });
    expect(screen.getByTestId('memory-fact-source')).toHaveTextContent('Measured from your data');
    expect(screen.getByText(/Updates automatically as new evidence arrives/)).toBeInTheDocument();
    expect(screen.getByText('Auto-updates')).toBeInTheDocument();
  });

  it('Source B (conversational) reads "Inferred from chat" and confirms before use', () => {
    renderCard({ source: 'conversational' });
    const source = screen.getByTestId('memory-fact-source');
    expect(source).toHaveTextContent('Inferred from chat');
    expect(screen.getByText(/always asks before it changes anything/)).toBeInTheDocument();
    expect(screen.getByText('Confirm before use')).toBeInTheDocument();
  });

  it('Source B additionally carries the AI provenance tag; Source A does not', () => {
    const { unmount } = renderCard({ source: 'behavioral' });
    expect(screen.queryByTestId('ai-tag-suggested')).not.toBeInTheDocument();
    unmount();
    renderCard({ source: 'conversational' });
    expect(screen.getByTestId('ai-tag-suggested')).toBeInTheDocument();
  });

  it('the two sources are distinguishable in text alone, not by colour', () => {
    const { unmount } = renderCard({ source: 'behavioral' });
    expect(screen.getByTestId('memory-fact-source')).toHaveTextContent('Measured from your data');
    unmount();
    renderCard({ source: 'conversational' });
    expect(screen.getByTestId('memory-fact-source')).toHaveTextContent('Inferred from chat');
  });
});

describe('P15.4 — confidence, evidence and reinforcement are all visible', () => {
  it('renders confidence as a meter with a text value, not colour', () => {
    renderCard({ confidence: 90 });
    const meter = screen.getByRole('meter', { name: 'Confidence' });
    expect(meter).toHaveAttribute('aria-valuenow', '90');
    expect(meter).toHaveAttribute('aria-valuetext', 'High, 90 percent');
    expect(screen.getByTestId('memory-fact-confidence')).toHaveTextContent('High');
  });

  it('shows the DECAYED value, not the stored column', () => {
    renderCard({ confidence: 90, lastReinforcedAt: new Date(NOW - 120 * DAY).toISOString() });
    const effective = effectiveConfidence(90, new Date(NOW - 120 * DAY).toISOString(), NOW);
    expect(screen.getByRole('meter', { name: 'Confidence' })).toHaveAttribute(
      'aria-valuenow',
      String(effective),
    );
    expect(effective).toBeLessThan(90);
  });

  it('discloses both numbers when decay is material, so it is not a black box', () => {
    renderCard({ confidence: 90, lastReinforcedAt: new Date(NOW - 120 * DAY).toISOString() });
    expect(screen.getByText(/Stored confidence 90%, aged to/)).toBeInTheDocument();
  });

  it('omits the stored-vs-aged line when decay is negligible', () => {
    renderCard({ confidence: 90 });
    expect(screen.queryByText(/Stored confidence/)).not.toBeInTheDocument();
  });

  it('shows the evidence count, pluralised', () => {
    renderCard({ evidenceCount: 12 });
    expect(screen.getByText('12 observations')).toBeInTheDocument();
    renderCard({ evidenceCount: 1 });
    expect(screen.getAllByText('1 observation').length).toBeGreaterThan(0);
  });

  it('shows when it was last reinforced', () => {
    renderCard();
    expect(screen.getByText(/Last reinforced/)).toBeInTheDocument();
  });
});

describe('P15.4 — states and chips', () => {
  it('an active, confident fact is in the active state with no chip', () => {
    renderCard();
    expect(screen.getByTestId('memory-fact-card-1')).toHaveAttribute('data-fact-state', 'active');
    expect(screen.queryByTestId('memory-fact-fading-chip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('memory-fact-archived-chip')).not.toBeInTheDocument();
  });

  it('a decayed fact is marked Fading with an icon and a reason', () => {
    renderCard({ confidence: 90, lastReinforcedAt: new Date(NOW - 300 * DAY).toISOString() });
    expect(screen.getByTestId('memory-fact-card-1')).toHaveAttribute('data-fact-state', 'fading');
    const chip = screen.getByTestId('memory-fact-fading-chip');
    expect(chip).toHaveTextContent('Fading');
    expect(chip.querySelector('svg')).toBeInTheDocument();
  });

  it('a fading Source A fact says it will be ARCHIVED, never deleted', () => {
    renderCard({
      source: 'behavioral',
      confidence: 90,
      lastReinforcedAt: new Date(NOW - 300 * DAY).toISOString(),
    });
    const note = screen.getByTestId('memory-fact-fading-note');
    expect(note).toHaveTextContent('archives it');
    expect(note).toHaveTextContent('archived facts are kept, never deleted');
  });

  it('a fading Source B fact says Cadence will ASK first — nothing happens on its own', () => {
    renderCard({
      source: 'conversational',
      confidence: 90,
      lastReinforcedAt: new Date(NOW - 300 * DAY).toISOString(),
    });
    const note = screen.getByTestId('memory-fact-fading-note');
    expect(note).toHaveTextContent('ask you before it archives this');
    expect(note).toHaveTextContent('nothing happens on its own');
  });

  it('an archived fact is out of the active profile and can be restored', () => {
    renderCard({ archived: true });
    expect(screen.getByTestId('memory-fact-card-1')).toHaveAttribute('data-fact-state', 'archived');
    expect(screen.getByTestId('memory-fact-archived-chip')).toHaveTextContent('Archived');
    expect(screen.getByText(/Not used in scheduling/)).toBeInTheDocument();
    expect(screen.getByTestId('memory-fact-archive-1')).toHaveTextContent('Restore');
  });

  it('an archived fact is never ALSO marked fading', () => {
    renderCard({ archived: true, confidence: 90, lastReinforcedAt: new Date(NOW - 300 * DAY).toISOString() });
    expect(screen.queryByTestId('memory-fact-fading-chip')).not.toBeInTheDocument();
  });

  it('a Rule 9 duration multiplier is surfaced on the card', () => {
    renderCard({ rule9Multiplier: 1.5 });
    expect(screen.getByTestId('memory-fact-multiplier')).toHaveTextContent('1.5x duration');
  });

  it('renders no multiplier chip when the fact has none', () => {
    renderCard();
    expect(screen.queryByTestId('memory-fact-multiplier')).not.toBeInTheDocument();
  });
});

describe('P15.4 — Edit / Delete / Archive are all present', () => {
  it('renders all three actions', () => {
    renderCard();
    expect(screen.getByTestId('memory-fact-edit-1')).toBeInTheDocument();
    expect(screen.getByTestId('memory-fact-archive-1')).toBeInTheDocument();
    expect(screen.getByTestId('memory-fact-delete-1')).toBeInTheDocument();
  });

  it('Edit opens a textarea seeded with the current statement', () => {
    renderCard();
    fireEvent.click(screen.getByTestId('memory-fact-edit-1'));
    const input = screen.getByTestId('memory-fact-edit-input') as HTMLTextAreaElement;
    expect(input.value).toBe('You plan your heaviest work for Sunday mornings.');
  });

  it('saving a changed statement passes the trimmed text', () => {
    const { onEdit } = renderCard();
    fireEvent.click(screen.getByTestId('memory-fact-edit-1'));
    fireEvent.change(screen.getByTestId('memory-fact-edit-input'), {
      target: { value: '  You sprint on Sundays.  ' },
    });
    fireEvent.click(screen.getByTestId('memory-fact-edit-save'));
    expect(onEdit).toHaveBeenCalledWith(expect.anything(), 'You sprint on Sundays.');
  });

  it('an empty statement cannot be saved, and says why (P12)', () => {
    const { onEdit } = renderCard();
    fireEvent.click(screen.getByTestId('memory-fact-edit-1'));
    fireEvent.change(screen.getByTestId('memory-fact-edit-input'), { target: { value: '   ' } });
    expect(screen.getByTestId('memory-fact-edit-save')).toBeDisabled();
    expect(screen.getByText('A statement cannot be empty.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('memory-fact-edit-save'));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('an unchanged statement cannot be saved, and says why', () => {
    renderCard();
    fireEvent.click(screen.getByTestId('memory-fact-edit-1'));
    expect(screen.getByTestId('memory-fact-edit-save')).toBeDisabled();
    expect(screen.getByText('No change yet — edit the text to save.')).toBeInTheDocument();
  });

  it('Cancel abandons the edit and restores the original text', () => {
    const { onEdit } = renderCard();
    fireEvent.click(screen.getByTestId('memory-fact-edit-1'));
    fireEvent.change(screen.getByTestId('memory-fact-edit-input'), { target: { value: 'scratch' } });
    fireEvent.click(screen.getByTestId('memory-fact-edit-cancel'));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('memory-fact-edit')).not.toBeInTheDocument();
    expect(screen.getByText('You plan your heaviest work for Sunday mornings.')).toBeInTheDocument();
  });

  it('Delete is guarded: a second, explicit confirmation is required', () => {
    const { onDelete } = renderCard();
    fireEvent.click(screen.getByTestId('memory-fact-delete-1'));
    expect(onDelete).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: /Confirm delete/ });
    fireEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('Archive toggles to Restore when the fact is already archived', () => {
    const { onArchive } = renderCard({ archived: true });
    fireEvent.click(screen.getByTestId('memory-fact-archive-1'));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it('busy disables every action without removing it', () => {
    renderCard({}, { busy: true });
    expect(screen.getByTestId('memory-fact-edit-1')).toBeDisabled();
    expect(screen.getByTestId('memory-fact-archive-1')).toBeDisabled();
    expect(screen.getByTestId('memory-fact-delete-1')).toBeDisabled();
  });

  it('renders a host-supplied error inline', () => {
    renderCard({}, { error: 'The memory service did not respond.' });
    expect(screen.getByTestId('memory-fact-error')).toHaveTextContent(
      'The memory service did not respond.',
    );
  });
});

describe('P27 — the card shows what data the fact actually stores', () => {
  it('renders each value entry with a humanised key', () => {
    renderCard({ value: { medianDurationMin: 90, dayOfWeek: 'sunday' } });
    const details = screen.getByTestId('memory-fact-details');
    expect(details).toHaveTextContent('Median Duration Min');
    expect(details).toHaveTextContent('90');
    expect(details).toHaveTextContent('Day Of Week');
    expect(details).toHaveTextContent('sunday');
  });

  it('renders no details block when the fact stores nothing', () => {
    renderCard({ value: {} });
    expect(screen.queryByTestId('memory-fact-details')).not.toBeInTheDocument();
  });
});

describe('ConfirmationPrompt — the Source B review gate (P15.4)', () => {
  const promptProps = {
    fact: fact({ id: 7, source: 'conversational' }),
    prompt: 'I used to think you were not a morning person, but your last three weeks say otherwise',
    suggestedAction: 'morning sessions would be scheduled from 08:00 instead of 13:00.',
    onApprove: vi.fn(),
    onDismiss: vi.fn(),
  };

  it('states what approving would change, in plain words', () => {
    render(<ConfirmationPrompt {...promptProps} />);
    expect(screen.getByText(/morning sessions would be scheduled/)).toBeInTheDocument();
  });

  it('states that dismissing changes nothing — the safe default is named', () => {
    render(<ConfirmationPrompt {...promptProps} />);
    expect(screen.getByText(/nothing changes and/)).toBeInTheDocument();
  });

  it('both outcomes are available and neither is pre-selected', () => {
    const onApprove = vi.fn();
    const onDismiss = vi.fn();
    render(<ConfirmationPrompt {...promptProps} onApprove={onApprove} onDismiss={onDismiss} />);
    expect(screen.getByTestId('memory-confirmation-approve-7')).toBeEnabled();
    expect(screen.getByTestId('memory-confirmation-dismiss-7')).toBeEnabled();
    expect(onApprove).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('routes each decision to its handler', () => {
    const onApprove = vi.fn();
    const onDismiss = vi.fn();
    render(<ConfirmationPrompt {...promptProps} onApprove={onApprove} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('memory-confirmation-approve-7'));
    fireEvent.click(screen.getByTestId('memory-confirmation-dismiss-7'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('is labelled as chat-inferred, so the source of the claim is never hidden', () => {
    render(<ConfirmationPrompt {...promptProps} />);
    expect(screen.getByTestId('memory-confirmation-7')).toBeInTheDocument();
    expect(screen.getByText('Inferred from chat')).toBeInTheDocument();
    expect(screen.getByTestId('ai-tag-suggested')).toBeInTheDocument();
  });

  it('renders a host-supplied error so a failed confirmation is never silent', () => {
    render(<ConfirmationPrompt {...promptProps} error="That did not save." />);
    expect(screen.getByTestId('memory-fact-error')).toHaveTextContent('That did not save.');
  });
});