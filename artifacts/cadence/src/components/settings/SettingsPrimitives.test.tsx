import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsRow, TimeRangeControl, type TimeRangeControlProps } from './SettingsPrimitives';

/**
 * P11.1 CRITICAL: "time ranges validate on change, and an overnight range is
 * VALID." P13 repeats it. The failure mode this guards is a range whose END is
 * BEFORE its START being reported as an error — quiet hours of 23:00 → 06:00 are
 * the normal case, not a mistake.
 *
 * The geometry itself (`rangeSegments`, `rangeLengthHours`, `isOvernight`) is
 * unit-tested in `src/lib/settings/timeRange.test.ts`. These tests cover the
 * decision the COMPONENT makes: accept and commit an overnight range, reject a
 * zero-length one unless the caller opted in, and never hand the server an
 * invalid range.
 */
const base: TimeRangeControlProps = {
  label: 'Working hours',
  start: 9,
  end: 17,
  onChange: vi.fn(),
  timezone: 'Asia/Kolkata',
};

const renderRange = (props: Partial<TimeRangeControlProps> = {}) => {
  const onChange = vi.fn();
  const result = render(<TimeRangeControl {...base} onChange={onChange} {...props} />);
  return {
    ...result,
    onChange,
    start: () => screen.getByTestId('time-range-control-start') as HTMLSelectElement,
    end: () => screen.getByTestId('time-range-control-end') as HTMLSelectElement,
    summary: () => screen.getByTestId('time-range-control-summary'),
  };
};

describe('a NORMAL range', () => {
  it('renders the value in words, not just as a bar', () => {
    const { summary } = renderRange();
    expect(summary()).toHaveTextContent('09:00 – 17:00 · 8h');
  });

  it('is not marked overnight', () => {
    renderRange();
    expect(screen.getByTestId('time-range-control')).toHaveAttribute('data-overnight', 'false');
    expect(screen.queryByTestId('time-range-control-overnight')).not.toBeInTheDocument();
  });

  it('is valid', () => {
    renderRange();
    expect(screen.getByTestId('time-range-control')).toHaveAttribute('data-valid', 'true');
    expect(screen.queryByTestId('time-range-control-error')).not.toBeInTheDocument();
  });

  it('always names the timezone the range is evaluated in (P11.1)', () => {
    renderRange();
    expect(screen.getByTestId('time-range-control-timezone')).toHaveTextContent('Asia/Kolkata');
  });

  it('changing the end commits the new range', () => {
    const { end, onChange } = renderRange();
    fireEvent.change(end(), { target: { value: '18' } });
    expect(onChange).toHaveBeenCalledWith({ start: 9, end: 18 });
  });

  it('changing the start commits the new range', () => {
    const { start, onChange } = renderRange();
    fireEvent.change(start(), { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith({ start: 8, end: 17 });
  });
});

describe('an OVERNIGHT range is LEGAL, not an error', () => {
  it('renders an existing overnight range as valid with no error', () => {
    renderRange({ start: 23, end: 6 });
    const control = screen.getByTestId('time-range-control');
    expect(control).toHaveAttribute('data-overnight', 'true');
    expect(control).toHaveAttribute('data-valid', 'true');
    expect(screen.queryByTestId('time-range-control-error')).not.toBeInTheDocument();
  });

  it('reports the true length across midnight, not a negative one', () => {
    const { summary } = renderRange({ start: 23, end: 6 });
    expect(summary()).toHaveTextContent('23:00 – 06:00 · 7h overnight');
  });

  it('says in words that it ends the next day', () => {
    renderRange({ start: 23, end: 6 });
    expect(screen.getByTestId('time-range-control-overnight')).toHaveTextContent(
      'Crosses midnight — ends the next day at 06:00.',
    );
  });

  it('setting the end BEFORE the start is committed, not rejected', () => {
    // This is the assertion the whole file exists for: 09:00 → 06:00 must be
    // accepted as a 21-hour overnight window, not flagged as "end before start".
    const { end, onChange } = renderRange();
    fireEvent.change(end(), { target: { value: '6' } });
    expect(onChange).toHaveBeenCalledWith({ start: 9, end: 6 });
    expect(screen.queryByTestId('time-range-control-error')).not.toBeInTheDocument();
  });

  it('a committed overnight range still renders as valid, with no inline error', () => {
    const { end, onChange } = renderRange();
    fireEvent.change(end(), { target: { value: '6' } });
    expect(onChange).toHaveBeenCalledWith({ start: 9, end: 6 });
    expect(screen.getByTestId('time-range-control')).toHaveAttribute('data-valid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a 24-hour wrap (23:00 -> 00:00) is legal', () => {
    const { end, onChange } = renderRange({ start: 23 });
    fireEvent.change(end(), { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith({ start: 23, end: 0 });
    expect(screen.queryByTestId('time-range-control-error')).not.toBeInTheDocument();
  });
});

describe('a SAME-TIME range', () => {
  it('is REJECTED when the caller did not opt in', () => {
    const { end, onChange } = renderRange();
    fireEvent.change(end(), { target: { value: '9' } });
    expect(onChange).not.toHaveBeenCalled();
    const error = screen.getByTestId('time-range-control-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('must be different');
    expect(screen.getByTestId('time-range-control')).toHaveAttribute('data-valid', 'false');
  });

  it('shows the rejected pick but never hands it to the parent', () => {
    const { end, onChange } = renderRange();
    fireEvent.change(end(), { target: { value: '9' } });
    // The user can see what they chose…
    expect(screen.getByTestId('time-range-control-summary')).toHaveTextContent(
      'No window — start and end match',
    );
    // …but the server never sees it.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is LEGAL when the caller passes allowEqual (quiet hours use this to disable the window)', () => {
    const { end, onChange } = renderRange({ start: 23, end: 23, allowEqual: true });
    expect(screen.getByTestId('time-range-control-equal-note')).toHaveTextContent(
      'Start equals end, so this window is inactive.',
    );
    fireEvent.change(end(), { target: { value: '23' } });
    expect(onChange).toHaveBeenCalledWith({ start: 23, end: 23 });
    expect(screen.queryByTestId('time-range-control-error')).not.toBeInTheDocument();
  });

  it('shows a caller-supplied equalValueNote', () => {
    renderRange({
      start: 0,
      end: 0,
      allowEqual: true,
      equalValueNote: 'No quiet hours set.',
    });
    expect(screen.getByTestId('time-range-control-equal-note')).toHaveTextContent(
      'No quiet hours set.',
    );
  });

  it('clears the inline error once a valid range is picked again', () => {
    const { end } = renderRange();
    fireEvent.change(end(), { target: { value: '9' } });
    expect(screen.getByTestId('time-range-control-error')).toBeInTheDocument();
    fireEvent.change(end(), { target: { value: '18' } });
    expect(screen.queryByTestId('time-range-control-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('time-range-control')).toHaveAttribute('data-valid', 'true');
  });
});

describe('server errors and lifecycle', () => {
  it('surfaces a server error and keeps the inline error path distinct', () => {
    renderRange({ error: 'The server rejected that range.' });
    expect(screen.getByTestId('settings-row-status')).toHaveTextContent(
      'The server rejected that range.',
    );
    expect(screen.getByTestId('time-range-control')).toHaveAttribute('data-valid', 'false');
  });

  it('offers a Retry when the caller supplied one', () => {
    const onRetry = vi.fn();
    renderRange({ error: 'Nope.', onRetry });
    fireEvent.click(screen.getByTestId('settings-row-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disabled shows the reason rather than silently greying out', () => {
    renderRange({ disabled: true, disabledReason: 'Set your home timezone first.' });
    expect(screen.getByTestId('time-range-control-start')).toBeDisabled();
    expect(screen.getByTestId('time-range-control-end')).toBeDisabled();
    expect(screen.getByText('Set your home timezone first.')).toBeInTheDocument();
  });

  it('uses caller-supplied start/end labels so quiet hours read correctly', () => {
    renderRange({ startLabel: 'Quiet from', endLabel: 'Quiet until' });
    expect(screen.getByText('Quiet from')).toBeInTheDocument();
    expect(screen.getByText('Quiet until')).toBeInTheDocument();
  });
});

describe('SettingsRow — the P13 lifecycle the range control is built on', () => {
  it('exposes its state so it is assertable', () => {
    render(<SettingsRow label="Quiet hours" testId="settings-row" />);
    expect(screen.getByTestId('settings-row')).toHaveAttribute('data-state', 'idle');
  });

  it('shows the quiet "Saved" confirmation while saving completes', () => {
    const { rerender } = render(<SettingsRow label="Quiet hours" testId="settings-row" />);
    rerender(<SettingsRow label="Quiet hours" testId="settings-row" state="saving" />);
    expect(screen.getByTestId('settings-row-status')).toHaveTextContent('Saving…');

    rerender(<SettingsRow label="Quiet hours" testId="settings-row" state="saved" />);
    expect(screen.getByTestId('settings-row-status')).toHaveTextContent('Saved');
  });

  it('a disabled toggle states why (P12)', () => {
    render(<SettingsRow label="Reminders" control="toggle" disabled disabledReason="Telegram is not linked." testId="settings-row" />);
    expect(screen.getByText('Telegram is not linked.')).toBeInTheDocument();
  });

  it('renders no status element while idle, so the row carries no permanent gap', () => {
    render(<SettingsRow label="Quiet hours" testId="settings-row" />);
    expect(screen.queryByTestId('settings-row-status')).not.toBeInTheDocument();
  });
});