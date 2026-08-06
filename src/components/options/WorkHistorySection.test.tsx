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
