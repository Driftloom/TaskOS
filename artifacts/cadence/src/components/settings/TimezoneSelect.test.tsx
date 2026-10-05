import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimezoneSelect } from './TimezoneSelect';

describe('TimezoneSelect', () => {
  it('renders input with expected testId and id', () => {
    const onChange = vi.fn();
    render(<TimezoneSelect value="Asia/Kolkata" onChange={onChange} />);

    const input = screen.getByTestId('input-timezone');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Asia/Kolkata');
    expect(input).toHaveAttribute('id', 'settings-input-timezone');
  });

  it('opens dropdown when chevron button is clicked', () => {
    const onChange = vi.fn();
    render(<TimezoneSelect value="Asia/Kolkata" onChange={onChange} />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    const chevron = screen.getByLabelText(/Open timezone selector/i);
    fireEvent.click(chevron);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search city, country, or code/i)).toBeInTheDocument();
  });

  it('filters timezones when typing in search box', () => {
    const onChange = vi.fn();
    render(<TimezoneSelect value="Asia/Kolkata" onChange={onChange} />);

    const chevron = screen.getByLabelText(/Open timezone selector/i);
    fireEvent.click(chevron);

    const searchInput = screen.getByPlaceholderText(/Search city, country, or code/i);
    fireEvent.change(searchInput, { target: { value: 'London' } });

    expect(screen.getByText('Europe/London')).toBeInTheDocument();
  });

  it('calls onChange and onSave when selecting a timezone option', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(<TimezoneSelect value="Asia/Kolkata" onChange={onChange} onSave={onSave} />);

    const chevron = screen.getByLabelText(/Open timezone selector/i);
    fireEvent.click(chevron);

    const searchInput = screen.getByPlaceholderText(/Search city, country, or code/i);
    fireEvent.change(searchInput, { target: { value: 'Tokyo' } });

    const tokyoOption = screen.getByText('Asia/Tokyo');
    fireEvent.click(tokyoOption);

    expect(onChange).toHaveBeenCalledWith('Asia/Tokyo');
    expect(onSave).toHaveBeenCalled();
  });

  it('auto-resolves abbreviation alias like IST to Asia/Kolkata on Enter', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(<TimezoneSelect value="IST" onChange={onChange} onSave={onSave} />);

    const input = screen.getByTestId('input-timezone');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('Asia/Kolkata');
    expect(onSave).toHaveBeenCalled();
  });

  it('displays alias suggestion hint when abbreviation is in value', () => {
    const onChange = vi.fn();
    render(<TimezoneSelect value="IST" onChange={onChange} />);

    expect(screen.getByText(/Did you mean/i)).toBeInTheDocument();
    expect(screen.getByText('Asia/Kolkata')).toBeInTheDocument();

    const applyBtn = screen.getByRole('button', { name: /Apply/i });
    fireEvent.click(applyBtn);

    expect(onChange).toHaveBeenCalledWith('Asia/Kolkata');
  });
});
