// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MonthYearPicker } from './MonthYearPicker';

afterEach(cleanup);

function renderPicker(props: Partial<React.ComponentProps<typeof MonthYearPicker>> = {}) {
  const onChange = vi.fn();
  const onYearChange = vi.fn();
  const onBlur = vi.fn();
  render(
    <MonthYearPicker value="" onChange={onChange} onYearChange={onYearChange} onBlur={onBlur} {...props} />,
  );
  return { onChange, onYearChange, onBlur };
}

// Mirrors how a real caller (e.g. WorkHistorySection's updateEntry) wires
// this up: onChange's result is written straight back as the controlled
// `value` prop.
function ControlledPicker({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <MonthYearPicker value={value} onChange={setValue} />;
}

describe('MonthYearPicker — initial value parsing', () => {
  it('splits an existing "YYYY-MM" value into month and year', () => {
    renderPicker({ value: '1990-06' });
    expect((screen.getByLabelText('Month') as HTMLSelectElement).value).toBe('06');
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('1990');
  });

  it('treats a year-only "YYYY" value as year with no month selected', () => {
    renderPicker({ value: '1990' });
    expect((screen.getByLabelText('Month') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('1990');
  });
});

describe('MonthYearPicker — resync when value changes to a different non-empty date', () => {
  it('picks up a genuinely different external value on an already-mounted instance', () => {
    const { rerender } = render(<MonthYearPicker value="1990-06" onChange={vi.fn()} />);
    expect((screen.getByLabelText('Month') as HTMLSelectElement).value).toBe('06');

    // Simulates a list-index shift: this instance now represents a
    // different work-history/education entry entirely.
    rerender(<MonthYearPicker value="2005-11" onChange={vi.fn()} />);
    expect((screen.getByLabelText('Month') as HTMLSelectElement).value).toBe('11');
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('2005');
  });
});

describe('MonthYearPicker — does not wipe the month when onChange(\'\') echoes back as value', () => {
  it('editing the year field down to a partial value on an existing date does not clear month', () => {
    render(<ControlledPicker initial="1990-06" />);

    // Partially retyping the year: emit('') fires and, in a real caller,
    // gets written straight back as this component's `value` prop.
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '19' } });

    // Month must survive — only the year was actually edited.
    expect((screen.getByLabelText('Month') as HTMLSelectElement).value).toBe('06');
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('19');

    // And the user can still complete a new year to get a valid date back.
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2010' } });
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('2010');
  });
});

describe('MonthYearPicker — the documented onChange(\'\') partial-entry trap', () => {
  it('emits \'\' when only a month is selected and no year yet', () => {
    const { onChange } = renderPicker();
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '06' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('emits \'\' while the year is still partially typed (fewer than 4 digits), even with a month selected', () => {
    const { onChange } = renderPicker();
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '06' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '199' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('emits the full "YYYY-MM" only once both month and a valid 4-digit year are present', () => {
    const { onChange } = renderPicker();
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '06' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1990' } });
    expect(onChange).toHaveBeenLastCalledWith('1990-06');
  });

  it('reverts to \'\' if the year is cleared back to partial after being complete', () => {
    const { onChange } = renderPicker({ value: '1990-06' });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '19' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});

describe('MonthYearPicker — monthOptional', () => {
  it('emits a bare "YYYY" once the year is valid, with no month, when monthOptional is true', () => {
    const { onChange } = renderPicker({ monthOptional: true });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1990' } });
    expect(onChange).toHaveBeenLastCalledWith('1990');
  });

  it('still emits \'\' for a partial year even with monthOptional true', () => {
    const { onChange } = renderPicker({ monthOptional: true });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '19' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('without monthOptional, a valid year alone (no month) still emits \'\'', () => {
    const { onChange } = renderPicker({ monthOptional: false });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1990' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});

describe('MonthYearPicker — year input sanitization', () => {
  it('strips non-digit characters and caps at 4 characters', () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1a9b9c0d5' } });
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('1990');
  });

  it('calls onYearChange with the raw partial string on every keystroke, independent of validity', () => {
    const { onYearChange } = renderPicker();
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '19' } });
    expect(onYearChange).toHaveBeenLastCalledWith('19');
  });
});

describe('MonthYearPicker — group blur detection', () => {
  it('does not fire onBlur when focus moves from month to year within the same picker', () => {
    const { onBlur } = renderPicker();
    const monthSelect = screen.getByLabelText('Month');
    const yearInput = screen.getByLabelText('Year');
    fireEvent.focusOut(monthSelect, { relatedTarget: yearInput });
    expect(onBlur).not.toHaveBeenCalled();
  });

  it('fires onBlur with the current month and year when focus leaves the group entirely', () => {
    const { onBlur } = renderPicker({ value: '1990-06' });
    const monthSelect = screen.getByLabelText('Month');
    const outsideEl = document.createElement('button');
    document.body.appendChild(outsideEl);
    fireEvent.focusOut(monthSelect, { relatedTarget: outsideEl });
    expect(onBlur).toHaveBeenCalledWith('06', '1990');
  });
});

describe('MonthYearPicker — disabled state', () => {
  it('disables both the month select and year input', () => {
    renderPicker({ disabled: true });
    expect((screen.getByLabelText('Month') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText('Year') as HTMLInputElement).disabled).toBe(true);
  });
});
