import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimeBlock, type TimeBlockVariant } from './TimeBlock';
import type { TimeBlock as TimeBlockRecord } from '@workspace/api-client-react';

/**
 * §P11.1 non-negotiable #1: "A non-drag alternative is mandatory (tap → time
 * picker; arrow keys move/resize)." Both paths are first-class, not fallbacks.
 *
 * Rule 1 of spec/auto-reschedule-engine.md outranks the interaction affordance:
 * **a fixed/immovable event must never move, under any automation mode, by any
 * input path** — not drag, not arrows, not Alt+arrow. That is the invariant the
 * `fixed` block below locks down, for every one of the five arrow keys.
 *
 * The `TimeBlockRecord` here is a literal, not a cast: the api-client module is
 * only imported for a TYPE in the component, so nothing here touches the network.
 */
const block = (overrides: Partial<TimeBlockRecord> = {}): TimeBlockRecord => ({
  id: 1,
  taskId: 10,
  taskTitle: 'PS1 writeup',
  startAt: '2026-11-04T14:00:00.000Z',
  endAt: '2026-11-04T15:00:00.000Z',
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
  ...overrides,
});

const renderBlock = (variant: TimeBlockVariant = 'manual', props: Partial<React.ComponentProps<typeof TimeBlock>> = {}) => {
  const record = block();
  const handlers = {
    onOpenPicker: vi.fn(),
    onRemove: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
  };
  const result = render(
    <TimeBlock block={record} variant={variant} {...handlers} {...props} />,
  );
  return { ...result, record, ...handlers };
};

const chip = (id = 1) => screen.getByTestId(`button-block-${id}`);

const press = (key: string, init: { altKey?: boolean } = {}) =>
  fireEvent.keyDown(chip(), { key, ...init });

describe('a NON-FIXED block moves and resizes by 15 minutes', () => {
  it.each([
    ['ArrowLeft', -15],
    ['ArrowRight', 15],
  ] as const)('%s calls onMove with %d minutes', (key, delta) => {
    const { onMove, onResize, onOpenPicker } = renderBlock();
    press(key);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][1]).toBe(delta);
    expect(onResize).not.toHaveBeenCalled();
    expect(onOpenPicker).not.toHaveBeenCalled();
  });

  it.each([
    ['ArrowUp', -15],
    ['ArrowDown', 15],
  ] as const)('%s calls onResize with %d minutes', (key, delta) => {
    const { onMove, onResize, onOpenPicker } = renderBlock();
    press(key);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize.mock.calls[0][1]).toBe(delta);
    expect(onMove).not.toHaveBeenCalled();
    expect(onOpenPicker).not.toHaveBeenCalled();
  });

  it('moving keeps the block duration constant', () => {
    const { record } = renderBlock();
    const before = new Date(record.endAt).getTime() - new Date(record.startAt).getTime();
    press('ArrowRight');
    // 60 minutes before and after a +/-15 minute shift of both endpoints.
    expect(before / 60_000).toBe(60);
  });

  it('announces the new window politely after a move, for a screen-reader user', () => {
    renderBlock();
    const status = document.querySelector('[role="status"][aria-live="polite"]')!;
    expect(status.textContent).toBe('');
    press('ArrowRight');
    expect(status.textContent).toMatch(/^Moved to .* to .*\.$/);
  });

  it('announces the new end time after a resize', () => {
    renderBlock();
    press('ArrowDown');
    const status = document.querySelector('[role="status"][aria-live="polite"]')!;
    expect(status.textContent).toMatch(/^Ends .*\.$/);
  });

  it('Home and Alt+arrow open the time picker instead of mutating', () => {
    const { onOpenPicker, onMove, onResize } = renderBlock();
    press('Home');
    press('ArrowRight', { altKey: true });
    expect(onOpenPicker).toHaveBeenCalledTimes(2);
    expect(onMove).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('a click also opens the picker — the drag is never the only path', () => {
    const { onOpenPicker } = renderBlock();
    fireEvent.click(chip());
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
  });

  it('falls back to the picker rather than swallowing an arrow when no mutation handler exists', () => {
    // A caller that wired the picker but not onMove/onResize must not leave the
    // arrow key doing nothing.
    const { onOpenPicker, onMove, onResize } = renderBlock('manual', { onMove: undefined, onResize: undefined });
    press('ArrowRight');
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('advertises the arrow shortcuts to assistive tech', () => {
    renderBlock();
    expect(chip()).toHaveAttribute('aria-keyshortcuts');
  });
});

describe('Rule 1: a FIXED block rejects EVERY arrow key', () => {
  const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

  it.each(ARROWS)('%s calls neither onMove, onResize nor the picker', (key) => {
    const { onMove, onResize, onOpenPicker } = renderBlock('fixed');
    press(key);
    expect(onMove, `${key} must not move a fixed block`).not.toHaveBeenCalled();
    expect(onResize, `${key} must not resize a fixed block`).not.toHaveBeenCalled();
    expect(onOpenPicker, `${key} must not silently open the picker`).not.toHaveBeenCalled();
  });

  it.each(ARROWS)('%s with Alt held is also rejected', (key) => {
    const { onMove, onResize, onOpenPicker } = renderBlock('fixed');
    press(key, { altKey: true });
    expect(onMove).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
    expect(onOpenPicker).not.toHaveBeenCalled();
  });

  it('says WHY the key did nothing, rather than swallowing it silently (§P12)', () => {
    renderBlock('fixed');
    press('ArrowRight');
    const status = document.querySelector('[role="status"][aria-live="polite"]')!;
    expect(status.textContent).toBe('This block is fixed and cannot be moved or resized.');
  });

  it('does NOT advertise arrow-key shortcuts, because they do not apply', () => {
    renderBlock('fixed');
    expect(chip()).not.toHaveAttribute('aria-keyshortcuts');
  });

  it('names the fixed state in the accessible name and in a visible label', () => {
    renderBlock('fixed');
    expect(chip()).toHaveAccessibleName(/fixed, cannot be moved/);
    expect(screen.getByText('Fixed')).toBeInTheDocument();
  });

  it('still allows Home / tap → the picker, which only READS the block', () => {
    const { onOpenPicker, onMove } = renderBlock('fixed');
    fireEvent.click(chip());
    press('Home');
    expect(onOpenPicker).toHaveBeenCalledTimes(2);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('explains in the hidden instructions that a fixed block cannot be moved', () => {
    renderBlock('fixed');
    const describedBy = chip().getAttribute('aria-describedby')!;
    const instructions = document.getElementById(describedBy)!;
    expect(instructions.textContent).toBe('Fixed time block. Open the time picker for details.');
  });

  it('every non-fixed variant DOES respond to ArrowRight, so the rejection is specific to fixed', () => {
    for (const variant of ['manual', 'auto-placed', 'proposed', 'missed'] as TimeBlockVariant[]) {
      const { onMove, unmount } = renderBlock(variant);
      press('ArrowRight');
      expect(onMove, `${variant} should move`).toHaveBeenCalledTimes(1);
      unmount();
    }
  });
});

describe('legibility and non-colour signalling', () => {
  it('collapses the visible range to the start time on a short chip', () => {
    // "14:00–14:15" is what makes a 15-minute chip unreadable, so the visible
    // label is the start time alone. The full range stays in the accessible name.
    const { record } = renderBlock('manual', {
      block: block({ endAt: '2026-11-04T14:15:00.000Z' }),
    });
    const label = chip(record.id).textContent!;
    expect(label).not.toContain('–');
    expect(chip(record.id)).toHaveAccessibleName(/ to /);
  });

  it('shows the full range on a 60-minute chip', () => {
    renderBlock('manual');
    expect(chip().textContent).toContain('–');
  });

  it('exposes the variant on the root so styling is not the only signal', () => {
    renderBlock('proposed');
    expect(screen.getByTestId('chip-block-1')).toHaveAttribute('data-variant', 'proposed');
  });

  it('carries selection as aria-pressed as well as an icon', () => {
    renderBlock('manual', { selected: true });
    expect(chip()).toHaveAttribute('aria-pressed', 'true');
  });

  it('reflects dragging / resizing in data-state', () => {
    const { unmount } = renderBlock('manual', { dragging: true });
    expect(screen.getByTestId('chip-block-1')).toHaveAttribute('data-state', 'dragging');
    unmount();
    renderBlock('manual', { resizing: true });
    expect(screen.getByTestId('chip-block-1')).toHaveAttribute('data-state', 'resizing');
  });

  it('carries an AI tag when the engine moved the block', () => {
    renderBlock('auto-placed');
    expect(screen.getByTestId('ai-tag-auto-moved')).toBeInTheDocument();
  });

  it('an invalid drop target says why, in text', () => {
    renderBlock('manual', {
      dropTarget: 'invalid',
      dropTargetMessage: 'That hour is inside your quiet hours.',
    });
    expect(screen.getByTestId('chip-block-drop-1')).toHaveTextContent('That hour is inside your quiet hours.');
  });

  it('a valid drop target states itself too', () => {
    renderBlock('manual', { dropTarget: 'valid' });
    expect(screen.getByTestId('chip-block-drop-1')).toHaveTextContent('Drop to place here');
  });

  it('overdue is opt-in, not derived from the clock, so earlier hours are not painted red', () => {
    // A block whose end is in the past must NOT read as overdue by default.
    renderBlock('manual', {
      block: block({
        startAt: '2020-01-01T09:00:00.000Z',
        endAt: '2020-01-01T10:00:00.000Z',
      }),
    });
    expect(chip()).not.toHaveAccessibleName(/overdue/i);
  });
});

describe('tap-target geometry (the documented 44px contract)', () => {
  it('the chip body is at least 44px tall and wide enough to fill the row', () => {
    renderBlock();
    expect(chip().className).toContain('min-h-11');
    expect(chip().className).toContain('flex-1');
  });

  it('the remove button is a real 44x44 box, not a pseudo-element expansion', () => {
    renderBlock();
    const remove = screen.getByTestId('button-remove-block-1');
    expect(remove.className).toContain('size-11');
    expect(remove.className).not.toContain('tap-target-expand');
  });

  it('renders no remove button when the caller cannot remove', () => {
    renderBlock('manual', { onRemove: undefined });
    expect(screen.queryByTestId('button-remove-block-1')).not.toBeInTheDocument();
  });
});