// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WorkHistorySection } from './WorkHistorySection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile, WorkHistoryEntry } from '@/src/types/profile';

afterEach(cleanup);

function renderSection(profile: Partial<Profile>, onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ToastProvider>
      <WorkHistorySection profile={profile} onSave={onSave} />
    </ToastProvider>,
  );
  return { onSave };
}

describe('WorkHistorySection — initRow location backward-compat loader', () => {
  it('migrates a legacy plain-string location into the city field', () => {
    const { onSave } = renderSection({
      workHistory: [{
        company: 'Acme', title: 'Engineer', startDate: '2020-01', isCurrent: true,
        location: 'San Francisco, CA' as unknown as WorkHistoryEntry['location'],
      }],
    });
    fireEvent.click(screen.getByText('Save Work History'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      workHistory: [expect.objectContaining({ location: { countryCode: undefined, city: 'San Francisco, CA' } })],
    }));
  });

  it('reads a modern {countryCode, city} location object unchanged', () => {
    const { onSave } = renderSection({
      workHistory: [{
        company: 'Acme', title: 'Engineer', startDate: '2020-01', isCurrent: true,
        location: { countryCode: 'US', city: 'Austin' },
      }],
    });
    fireEvent.click(screen.getByText('Save Work History'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      workHistory: [expect.objectContaining({ location: { countryCode: 'US', city: 'Austin' } })],
    }));
  });

  it('omits location entirely when neither country nor city is set', () => {
    const { onSave } = renderSection({
      workHistory: [{ company: 'Acme', title: 'Engineer', startDate: '2020-01', isCurrent: true }],
    });
    fireEvent.click(screen.getByText('Save Work History'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      workHistory: [expect.objectContaining({ location: undefined })],
    }));
  });
});

describe('WorkHistorySection — date validation across the keystroke/blur/save-time paths', () => {
  it('shows a year-range error live while typing, before a month is even chosen (keystroke path)', () => {
    renderSection({ workHistory: [] });
    const yearInputs = screen.getAllByLabelText('Year'); // [0]=start, [1]=end
    fireEvent.change(yearInputs[0], { target: { value: '1800' } });
    expect(screen.getByText(/Year must be between/)).toBeTruthy();
  });

  it('the direct-update path (onChange with a complete date) independently agrees on an out-of-range year', () => {
    renderSection({ workHistory: [] });
    const yearInputs = screen.getAllByLabelText('Year');
    const monthSelects = screen.getAllByLabelText('Month');
    fireEvent.change(yearInputs[0], { target: { value: '1800' } });
    fireEvent.change(monthSelects[0], { target: { value: '06' } }); // completes "1800-06"
    expect(screen.getByText(/Year must be between/)).toBeTruthy();
  });

  it('requires company, title, and start date on save when left blank', () => {
    const { onSave } = renderSection({ workHistory: [] });
    fireEvent.click(screen.getByText('Save Work History'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Company name is required')).toBeTruthy();
    expect(screen.getByText('Job title is required')).toBeTruthy();
    expect(screen.getByText('Start date is required')).toBeTruthy();
  });

  it('shows a required company-name error on blur even without typing (blur path)', () => {
    renderSection({ workHistory: [] });
    const companyInput = screen.getByPlaceholderText('Acme Inc.');
    fireEvent.blur(companyInput);
    expect(screen.getByText('Company name is required')).toBeTruthy();
  });

  it('rejects an end date before the start date at save time', () => {
    const { onSave } = renderSection({
      workHistory: [{ company: 'Acme', title: 'Engineer', startDate: '2022-06', isCurrent: false, endDate: '2020-01' }],
    });
    // A populated entry starts collapsed (defaultExpanded={!row.company}) — the
    // error still gets set on save, but expand the card to see it rendered.
    fireEvent.click(screen.getByText('Acme — Engineer'));
    fireEvent.click(screen.getByText('Save Work History'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('End date cannot be before start date')).toBeTruthy();
  });

  it('does not require an end date when the entry is marked as currently active', () => {
    const { onSave } = renderSection({
      workHistory: [{ company: 'Acme', title: 'Engineer', startDate: '2020-01', isCurrent: true }],
    });
    fireEvent.click(screen.getByText('Save Work History'));
    expect(onSave).toHaveBeenCalled();
  });
});

describe('WorkHistorySection — Work Arrangement radio group', () => {
  // Regression coverage for a real bug: native radios only fire `change` when
  // the checked state actually flips (a genuinely new selection) — re-clicking
  // an already-checked radio, or arrow-key navigation onto a new one, both
  // rely on that same `change` event, distinct from `click`. A no-op onChange
  // previously meant a new selection never reached React state unless `click`
  // happened to also fire (which a keyboard-driven change does not). Selecting
  // 'remote' below exercises exactly that onChange path — the fix doesn't
  // distinguish click-driven from keyboard-driven changes, so this covers both.
  it('selects an option (via its change event) and deselects it on a second click of the same option', () => {
    const { onSave } = renderSection({
      workHistory: [{ company: 'Acme', title: 'Engineer', startDate: '2020-01', isCurrent: true }],
    });
    fireEvent.click(screen.getByText(/Acme — Engineer/)); // expand the collapsed card
    const remote = screen.getByDisplayValue('remote') as HTMLInputElement;

    fireEvent.click(remote);
    expect(remote.checked).toBe(true);

    fireEvent.click(remote);
    expect(remote.checked).toBe(false);

    fireEvent.click(screen.getByText('Save Work History'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      workHistory: [expect.objectContaining({ arrangement: undefined })],
    }));
  });

  it('switching between two different options keeps only the newly-selected one checked', () => {
    const { onSave } = renderSection({
      workHistory: [{ company: 'Acme', title: 'Engineer', startDate: '2020-01', isCurrent: true }],
    });
    fireEvent.click(screen.getByText(/Acme — Engineer/));
    const remote = screen.getByDisplayValue('remote') as HTMLInputElement;
    const hybrid = screen.getByDisplayValue('hybrid') as HTMLInputElement;

    fireEvent.click(remote);
    fireEvent.click(hybrid);
    expect(remote.checked).toBe(false);
    expect(hybrid.checked).toBe(true);

    fireEvent.click(screen.getByText('Save Work History'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      workHistory: [expect.objectContaining({ arrangement: 'hybrid' })],
    }));
  });
});

describe('WorkHistorySection — Notice Period validation', () => {
  it('shows the duration input only after selecting Available Later', () => {
    renderSection({ workHistory: [] });
    expect(screen.queryByPlaceholderText('3')).toBeNull();
    fireEvent.click(screen.getByText('Available Later'));
    expect(screen.getByPlaceholderText('3')).toBeTruthy();
  });

  it('shows "Enter a duration" when the value is cleared', () => {
    renderSection({ workHistory: [] });
    fireEvent.click(screen.getByText('Available Later'));
    const input = screen.getByPlaceholderText('3');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('Enter a duration')).toBeTruthy();
  });

  it('shows "Must be at least 1" for zero or negative values', () => {
    renderSection({ workHistory: [] });
    fireEvent.click(screen.getByText('Available Later'));
    fireEvent.change(screen.getByPlaceholderText('3'), { target: { value: '0' } });
    expect(screen.getByText('Must be at least 1')).toBeTruthy();
  });

  it('shows the per-unit maximum error when the value exceeds it', () => {
    renderSection({ workHistory: [] });
    fireEvent.click(screen.getByText('Available Later'));
    // Default unit is "week" (max 52).
    fireEvent.change(screen.getByPlaceholderText('3'), { target: { value: '53' } });
    expect(screen.getByText('Maximum is 52 weeks')).toBeTruthy();
  });

  it("re-validates against the new unit's max when the unit changes", () => {
    renderSection({ workHistory: [] });
    fireEvent.click(screen.getByText('Available Later'));
    fireEvent.change(screen.getByPlaceholderText('3'), { target: { value: '30' } });
    expect(screen.queryByText(/Maximum is/)).toBeNull();

    // Switch to "months" (max 24) — 30 now exceeds it.
    const unitSelect = screen.getByDisplayValue('weeks');
    fireEvent.change(unitSelect, { target: { value: 'month' } });
    expect(screen.getByText('Maximum is 24 months')).toBeTruthy();
  });

  it('accepts a valid duration with no error', () => {
    renderSection({ workHistory: [] });
    fireEvent.click(screen.getByText('Available Later'));
    fireEvent.change(screen.getByPlaceholderText('3'), { target: { value: '4' } });
    expect(screen.queryByText('Enter a duration')).toBeNull();
    expect(screen.queryByText('Must be at least 1')).toBeNull();
    expect(screen.queryByText(/Maximum is/)).toBeNull();
  });
});
