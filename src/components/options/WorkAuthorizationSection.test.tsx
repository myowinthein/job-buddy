// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WorkAuthorizationSection } from './WorkAuthorizationSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile } from '@/src/types/profile';
import '@/src/testing/scrollIntoViewStub';

afterEach(cleanup);

function renderSection(profile: Partial<Profile>, onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ToastProvider>
      <WorkAuthorizationSection profile={profile} onSave={onSave} />
    </ToastProvider>,
  );
  return { onSave };
}

it('loads saved authorizations collapsed with readable country and status summaries', () => {
  renderSection({ workAuthorization: [{ country: 'SG', status: 'work_visa', visaType: 'Employment Pass' }] });
  expect(screen.getByText('Singapore')).toBeTruthy();
  expect(screen.getByText(': Authorized to work without sponsorship')).toBeTruthy();
  expect(screen.getByText('🇸🇬').getAttribute('aria-hidden')).toBe('true');
  expect(screen.queryByLabelText('Visa type')).toBeNull();
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-entry-toggle][aria-expanded="false"]')!);
  expect((screen.getByLabelText('Visa type') as HTMLInputElement).value).toBe('Employment Pass');
});

describe('WorkAuthorizationSection — initRow country backward-compat loader', () => {
  it('preserves imported visa details when editing another entry and deleting its predecessor', () => {
    const kept = { country: 'SG', status: 'work_visa' as const, visaType: 'Employment Pass', expiryDate: '2028-06-15' };
    const { onSave } = renderSection({ workAuthorization: [{ country: 'US', status: 'citizen_or_pr' }, kept] });
    fireEvent.click(screen.getAllByTitle('Remove entry')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({ workAuthorization: [kept] });
  });

  it('passes an already-ISO country code through unchanged on save', () => {
    const { onSave } = renderSection({
      workAuthorization: [{ country: 'SG', status: 'citizen_or_pr' }],
    });
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({
      workAuthorization: [{ country: 'SG', status: 'citizen_or_pr' }],
    });
  });

  it('normalizes a legacy free-text country name to its ISO code', () => {
    const { onSave } = renderSection({
      workAuthorization: [{ country: 'Singapore', status: 'work_visa' }],
    });
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({
      workAuthorization: [{ country: 'SG', status: 'work_visa' }],
    });
  });

  it('keeps an unrecognized country visible and asks for a valid selection', () => {
    const { onSave } = renderSection({
      workAuthorization: [{ country: 'Atlantis', status: 'requires_sponsorship' }],
    });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getAllByText('Atlantis').length).toBeGreaterThan(0);
    expect(screen.getByText('Select a valid country')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('WorkAuthorizationSection — validation and entry management', () => {
  it('blocks save and shows required errors when a row is entirely empty', () => {
    const { onSave } = renderSection({ workAuthorization: [] });
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a country')).toBeTruthy();
    expect(screen.getByText('Choose a work authorization status')).toBeTruthy();
  });

  it('removes an entry when its remove button is clicked', () => {
    renderSection({
      workAuthorization: [
        { country: 'SG', status: 'citizen_or_pr' },
        { country: 'US', status: 'work_visa' },
      ],
    });
    expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(2);
    const removeButtons = screen.getAllByTitle('Remove entry');
    fireEvent.click(removeButtons[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(1);
  });

  it('editing one entry\'s status by index does not affect a different entry', () => {
    const { onSave } = renderSection({
      workAuthorization: [
        { country: 'SG', status: 'citizen_or_pr' },
        { country: 'US', status: 'work_visa' },
      ],
    });

    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-entry-toggle][aria-expanded="false"]')))
      fireEvent.click(button);
    const statusSelects = screen.getAllByRole('combobox');
    fireEvent.change(statusSelects[1], { target: { value: 'requires_sponsorship' } });
    fireEvent.click(screen.getByText('Save'));

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

    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-entry-toggle][aria-expanded="false"]')))
      fireEvent.click(button);
    const countryTriggers = document.querySelectorAll('button[aria-haspopup="listbox"]');
    fireEvent.click(countryTriggers[1]);
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: 'Thailand' } });
    fireEvent.click(screen.getByText('Thailand'));
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith({
      workAuthorization: [
        { country: 'SG', status: 'citizen_or_pr' },
        { country: 'TH', status: 'work_visa' },
      ],
    });
  });
});
