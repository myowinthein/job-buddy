// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WorkAuthorizationSection } from './WorkAuthorizationSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile } from '@/src/types/profile';

// jsdom doesn't implement Element.scrollIntoView; SearchableCountryDropdown's
// keyboard-highlight effect calls it whenever the panel opens.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

function renderSection(profile: Partial<Profile>, onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ToastProvider>
      <WorkAuthorizationSection profile={profile} onSave={onSave} />
    </ToastProvider>,
  );
  return { onSave };
}

describe('WorkAuthorizationSection — initRow country backward-compat loader', () => {
  it('passes an already-ISO country code through unchanged on save', () => {
    const { onSave } = renderSection({
      workAuthorization: [{ country: 'SG', status: 'citizen_or_pr' }],
    });
    fireEvent.click(screen.getByText('Save Work Authorization'));
    expect(onSave).toHaveBeenCalledWith({
      workAuthorization: [{ country: 'SG', status: 'citizen_or_pr' }],
    });
  });

  it('normalizes a legacy free-text country name to its ISO code', () => {
    const { onSave } = renderSection({
      workAuthorization: [{ country: 'Singapore', status: 'work_visa' }],
    });
    fireEvent.click(screen.getByText('Save Work Authorization'));
    expect(onSave).toHaveBeenCalledWith({
      workAuthorization: [{ country: 'SG', status: 'work_visa' }],
    });
  });

  it('preserves an unrecognized raw country value as-is rather than dropping it', () => {
    const { onSave } = renderSection({
      workAuthorization: [{ country: 'Atlantis', status: 'requires_sponsorship' }],
    });
    fireEvent.click(screen.getByText('Save Work Authorization'));
    expect(onSave).toHaveBeenCalledWith({
      workAuthorization: [{ country: 'Atlantis', status: 'requires_sponsorship' }],
    });
  });
});

describe('WorkAuthorizationSection — validation and entry management', () => {
  it('blocks save and shows required errors when a row is entirely empty', () => {
    const { onSave } = renderSection({ workAuthorization: [] });
    fireEvent.click(screen.getByText('Save Work Authorization'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Country is required')).toBeTruthy();
    expect(screen.getByText('Status is required')).toBeTruthy();
  });

  it('removes an entry when its remove button is clicked', () => {
    renderSection({
      workAuthorization: [
        { country: 'SG', status: 'citizen_or_pr' },
        { country: 'US', status: 'work_visa' },
      ],
    });
    expect(screen.getByText('Entry 2')).toBeTruthy();
    const removeButtons = screen.getAllByTitle('Remove');
    fireEvent.click(removeButtons[1]);
    expect(screen.queryByText('Entry 2')).toBeNull();
  });

  it('editing one entry\'s status by index does not affect a different entry', () => {
    const { onSave } = renderSection({
      workAuthorization: [
        { country: 'SG', status: 'citizen_or_pr' },
        { country: 'US', status: 'work_visa' },
      ],
    });

    const statusSelects = screen.getAllByRole('combobox');
    fireEvent.change(statusSelects[1], { target: { value: 'requires_sponsorship' } });
    fireEvent.click(screen.getByText('Save Work Authorization'));

    expect(onSave).toHaveBeenCalledWith({
      workAuthorization: [
        { country: 'SG', status: 'citizen_or_pr' },
        { country: 'US', status: 'requires_sponsorship' },
      ],
    });
  });

  it('editing one entry\'s country via the dropdown does not affect a different entry', () => {
    const { onSave } = renderSection({
      workAuthorization: [
        { country: 'SG', status: 'citizen_or_pr' },
        { country: 'US', status: 'work_visa' },
      ],
    });

    const countryTriggers = document.querySelectorAll('button[aria-haspopup="listbox"]');
    fireEvent.click(countryTriggers[1]);
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: 'Thailand' } });
    fireEvent.click(screen.getByText('Thailand'));
    fireEvent.click(screen.getByText('Save Work Authorization'));

    expect(onSave).toHaveBeenCalledWith({
      workAuthorization: [
        { country: 'SG', status: 'citizen_or_pr' },
        { country: 'TH', status: 'work_visa' },
      ],
    });
  });
});
