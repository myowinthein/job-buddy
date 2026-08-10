// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchableProfileFieldSelect } from './SearchableProfileFieldSelect';
import type { Profile } from '@/src/types/profile';

// jsdom doesn't implement Element.scrollIntoView; the keyboard-highlight
// effect calls it whenever the highlighted row changes.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

const PROFILE = {
  personal: {
    firstName: 'Jane', lastName: 'Doe',
    phone: { countryCode: 'US', callingCode: '+1', number: '5551234567' },
  },
  address: { city: 'Austin', country: 'US' },
  workHistory: [
    { company: 'Old Co', title: 'Analyst', startDate: '2015-01', endDate: '2018-01', isCurrent: false },
    { company: 'New Co', title: 'Engineer', startDate: '2020-01', isCurrent: true },
  ],
} as Partial<Profile>;

function renderSelect(value = '', onChange = vi.fn()) {
  render(<SearchableProfileFieldSelect profile={PROFILE} value={value} onChange={onChange} />);
  return { onChange };
}

describe('SearchableProfileFieldSelect — open/close toggling', () => {
  it('opens the dropdown on click, showing the search input', () => {
    renderSelect();
    expect(screen.queryByPlaceholderText('Search profile fields…')).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Search profile fields…')).toBeTruthy();
  });

  it('closes the dropdown when clicking the trigger button again', () => {
    renderSelect();
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByPlaceholderText('Search profile fields…')).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByPlaceholderText('Search profile fields…')).toBeNull();
  });

  it('closes the dropdown on an outside click and clears the search text', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search profile fields…'), { target: { value: 'First' } });
    fireEvent.mouseDown(document.body);
    expect(screen.queryByPlaceholderText('Search profile fields…')).toBeNull();

    fireEvent.click(screen.getByRole('button'));
    expect((screen.getByPlaceholderText('Search profile fields…') as HTMLInputElement).value).toBe('');
  });
});

describe('SearchableProfileFieldSelect — search filtering', () => {
  it('filters rows to only those matching the search text, case-insensitively', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search profile fields…'), { target: { value: 'first' } });
    expect(screen.getByText('First Name')).toBeTruthy();
    expect(screen.queryByText('Last Name')).toBeNull();
    expect(screen.queryByText('City')).toBeNull();
  });

  it('shows "No matching fields." when nothing matches', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search profile fields…'), { target: { value: 'zzzznomatch' } });
    expect(screen.getByText('No matching fields.')).toBeTruthy();
  });

  it('auto-expands a collapsed subgroup when one of its rows matches the search (matched by label, not value)', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    // "Old Co" is not the most recent entry, so it starts collapsed — but
    // searching for one of its fields by label should surface it anyway.
    fireEvent.change(screen.getByPlaceholderText('Search profile fields…'), { target: { value: 'Job' } });
    expect(screen.getByText('Analyst')).toBeTruthy();
  });

  it('filters a cluster (Phone) to only its matching row, keyed by row label not cluster heading', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Personal')); // expand the section holding the Phone cluster
    fireEvent.change(screen.getByPlaceholderText('Search profile fields…'), { target: { value: 'Country Code' } });
    expect(screen.getByText('Country Code')).toBeTruthy();
    expect(screen.queryByText('Full Phone')).toBeNull();
    expect(screen.queryByText('Phone Number')).toBeNull();
  });
});

describe('SearchableProfileFieldSelect — selecting a row', () => {
  it('calls onChange with the field path and closes the dropdown', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Personal')); // expand the section first
    fireEvent.click(screen.getByText('First Name'));
    expect(onChange).toHaveBeenCalledWith('personal.firstName');
    expect(screen.queryByPlaceholderText('Search profile fields…')).toBeNull();
  });
});

describe('SearchableProfileFieldSelect — keyboard navigation', () => {
  it('Enter selects the first highlighted row without clicking', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText('Search profile fields…');
    fireEvent.change(input, { target: { value: 'Name' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(['personal.firstName', 'personal.lastName']).toContain(onChange.mock.calls[0][0]);
    expect(screen.queryByPlaceholderText('Search profile fields…')).toBeNull();
  });

  it('ArrowDown moves the highlight to the next visible row before Enter selects it', () => {
    const onChangeA = vi.fn();
    render(<SearchableProfileFieldSelect profile={PROFILE} value="" onChange={onChangeA} />);
    fireEvent.click(screen.getByRole('button'));
    const inputA = screen.getByPlaceholderText('Search profile fields…');
    fireEvent.change(inputA, { target: { value: 'Name' } });
    fireEvent.keyDown(inputA, { key: 'Enter' });
    cleanup();

    const onChangeB = vi.fn();
    render(<SearchableProfileFieldSelect profile={PROFILE} value="" onChange={onChangeB} />);
    fireEvent.click(screen.getByRole('button'));
    const inputB = screen.getByPlaceholderText('Search profile fields…');
    fireEvent.change(inputB, { target: { value: 'Name' } });
    fireEvent.keyDown(inputB, { key: 'ArrowDown' });
    fireEvent.keyDown(inputB, { key: 'Enter' });

    expect(['personal.firstName', 'personal.lastName']).toContain(onChangeB.mock.calls[0][0]);
    expect(onChangeB.mock.calls[0][0]).not.toBe(onChangeA.mock.calls[0][0]);
  });

  it('ArrowUp moves the highlight back to the previous visible row', () => {
    const onChangeBaseline = vi.fn();
    render(<SearchableProfileFieldSelect profile={PROFILE} value="" onChange={onChangeBaseline} />);
    fireEvent.click(screen.getByRole('button'));
    const inputBaseline = screen.getByPlaceholderText('Search profile fields…');
    fireEvent.change(inputBaseline, { target: { value: 'Name' } });
    fireEvent.keyDown(inputBaseline, { key: 'Enter' }); // no arrow key — selects the 1st result
    cleanup();

    const onChangeRoundTrip = vi.fn();
    render(<SearchableProfileFieldSelect profile={PROFILE} value="" onChange={onChangeRoundTrip} />);
    fireEvent.click(screen.getByRole('button'));
    const inputRoundTrip = screen.getByPlaceholderText('Search profile fields…');
    fireEvent.change(inputRoundTrip, { target: { value: 'Name' } });
    fireEvent.keyDown(inputRoundTrip, { key: 'ArrowDown' }); // move to the 2nd row
    fireEvent.keyDown(inputRoundTrip, { key: 'ArrowUp' });   // then back to the 1st
    fireEvent.keyDown(inputRoundTrip, { key: 'Enter' });

    // ArrowDown-then-Up should land back on the same field a plain Enter
    // selects — proving Up actually moved the highlight back, not just
    // no-opped past the top.
    expect(onChangeRoundTrip.mock.calls[0][0]).toBe(onChangeBaseline.mock.calls[0][0]);
  });

  it('Escape closes the dropdown without selecting a field', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText('Search profile fields…');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Search profile fields…')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SearchableProfileFieldSelect — selected-value display', () => {
  it('shows the resolved label and path for a top-level option field', () => {
    renderSelect('personal.firstName');
    expect(screen.getByText('First Name', { exact: false })).toBeTruthy();
    expect(screen.getByText('(personal.firstName)')).toBeTruthy();
  });

  it('shows "Heading · Label" for a value nested inside a subgroup', () => {
    renderSelect('workHistory.1.company');
    expect(screen.getByText(/New Co · Engineer · Company/)).toBeTruthy();
  });

  it('falls back to showing the raw path when it does not resolve to any known field', () => {
    renderSelect('some.made.up.path');
    expect(screen.getByText('some.made.up.path')).toBeTruthy();
  });
});

describe('SearchableProfileFieldSelect — defaultCollapsed subgroups', () => {
  it('starts the non-most-recent work history entry collapsed', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Work History'));
    // "Old Co" subgroup is collapsed by default -> its rows are not rendered yet.
    expect(screen.queryByText('Analyst')).toBeNull();
    fireEvent.click(screen.getByText(/Old Co · Analyst/));
    expect(screen.getByText('Analyst')).toBeTruthy();
  });

  it('re-collapses a subgroup on a second click, hiding its rows again', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Work History'));
    // "New Co" is the most recent entry, so it starts expanded.
    expect(screen.getByText('Engineer')).toBeTruthy();

    fireEvent.click(screen.getByText(/New Co · Engineer/));
    expect(screen.queryByText('Engineer')).toBeNull();

    fireEvent.click(screen.getByText(/New Co · Engineer/));
    expect(screen.getByText('Engineer')).toBeTruthy();
  });

  it('auto-expands the section and subgroup that currently holds the selected value on open', () => {
    renderSelect('workHistory.0.company'); // "Old Co", the collapsed-by-default entry
    fireEvent.click(screen.getByRole('button', { name: /Old Co/ }));
    // Its subgroup should already be expanded since it holds the current value,
    // making the "Old Co" value cell (rendered only when its rows are shown) visible.
    expect(screen.getByText('Old Co')).toBeTruthy();
  });
});
