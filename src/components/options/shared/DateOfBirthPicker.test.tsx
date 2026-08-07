// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DateOfBirthPicker } from './DateOfBirthPicker';

afterEach(cleanup);

function renderPicker(value = '', onChange = vi.fn(), onPartialChange = vi.fn()) {
  render(<DateOfBirthPicker value={value} onChange={onChange} onPartialChange={onPartialChange} />);
  return { onChange, onPartialChange };
}

describe('DateOfBirthPicker — initial value parsing', () => {
  it('pre-fills day, month, and year from an existing ISO value', () => {
    renderPicker('1990-06-15');
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('15');
    expect((screen.getByLabelText('Month') as HTMLSelectElement).value).toBe('6');
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('1990');
  });

  it('starts empty for an empty value', () => {
    renderPicker('');
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('');
  });
});

describe('DateOfBirthPicker — day range validation', () => {
  it('shows an error for a day outside 1–31 and does not call onChange with a full date', () => {
    const { onChange } = renderPicker();
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '32' } });
    expect(screen.getByText('Day must be between 1 and 31')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(''); // day treated as 0 -> buildDOB returns ''
  });

  it('clears the day error once a valid day is entered', () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '32' } });
    expect(screen.getByText('Day must be between 1 and 31')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '15' } });
    expect(screen.queryByText('Day must be between 1 and 31')).toBeNull();
  });
});

describe('DateOfBirthPicker — year range validation', () => {
  it('shows an error for a year before the 100-year minimum', () => {
    const thisYear = new Date().getFullYear();
    renderPicker();
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: String(thisYear - 101) } });
    expect(screen.getByText(`Year must be between ${thisYear - 100} and ${thisYear}`)).toBeTruthy();
  });

  it('shows an error for a year in the future', () => {
    const thisYear = new Date().getFullYear();
    renderPicker();
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: String(thisYear + 1) } });
    expect(screen.getByText(`Year must be between ${thisYear - 100} and ${thisYear}`)).toBeTruthy();
  });

  it('accepts the current year as a valid boundary', () => {
    const thisYear = new Date().getFullYear();
    renderPicker();
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: String(thisYear) } });
    expect(screen.queryByText(/Year must be between/)).toBeNull();
  });
});

describe('DateOfBirthPicker — day clamping on month/year change', () => {
  it('clamps day 31 down to 28 when switching to February in a non-leap year', () => {
    renderPicker('2023-01-31');
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('31');
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2' } });
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('28');
  });

  it('clamps day 31 down to 29 when switching to February in a leap year', () => {
    renderPicker('2024-01-31');
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2' } });
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('29');
  });

  it('re-clamps day 29 down to 28 when the year changes from a leap year to a non-leap year', () => {
    renderPicker('2024-02-29');
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('29');
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2023' } });
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('28');
  });

  it('does not clamp a day that already fits the newly selected month', () => {
    renderPicker('2024-01-15');
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2' } });
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('15');
  });
});

describe('DateOfBirthPicker — onChange and onPartialChange wiring', () => {
  it('calls onChange with the full ISO date once day, month, and year are all valid', () => {
    const { onChange } = renderPicker();
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1990' } });
    expect(onChange).toHaveBeenLastCalledWith('1990-06-15');
  });

  it('reports partial=true after only one field is filled, and partial=false once empty again', () => {
    const { onPartialChange } = renderPicker();
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '15' } });
    expect(onPartialChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '' } });
    expect(onPartialChange).toHaveBeenLastCalledWith(false);
  });
});
