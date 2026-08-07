// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchableProfileFieldSelect } from './SearchableProfileFieldSelect';
import type { Profile } from '@/src/types/profile';

afterEach(cleanup);

const PROFILE = {
  personal: { firstName: 'Jane', lastName: 'Doe' },
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

  it('auto-expands the section and subgroup that currently holds the selected value on open', () => {
    renderSelect('workHistory.0.company'); // "Old Co", the collapsed-by-default entry
    fireEvent.click(screen.getByRole('button', { name: /Old Co/ }));
    // Its subgroup should already be expanded since it holds the current value,
    // making the "Old Co" value cell (rendered only when its rows are shown) visible.
    expect(screen.getByText('Old Co')).toBeTruthy();
  });
});
