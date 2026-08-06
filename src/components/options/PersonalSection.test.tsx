// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PersonalSection } from './PersonalSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile } from '@/src/types/profile';

afterEach(cleanup);

function renderSection(profile: Partial<Profile>, onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ToastProvider>
      <PersonalSection profile={profile} onSave={onSave} />
    </ToastProvider>,
  );
  return { onSave };
}

function phoneNumberInput(): HTMLInputElement {
  return document.getElementById('field-phone') as HTMLInputElement;
}

describe('PersonalSection — initPhone backward-compat loader', () => {
  it('migrates a legacy plain-string phone into the number field, defaulting country to US', () => {
    renderSection({ personal: { phone: '5551234567' } as unknown as Profile['personal'] });
    expect(phoneNumberInput().value).toBe('5551234567');
  });

  it('reads a modern PhoneNumber object, preserving the stored number', () => {
    renderSection({
      personal: {
        phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
      } as unknown as Profile['personal'],
    });
    expect(phoneNumberInput().value).toBe('812345678');
  });

  it('defaults to an empty number when no phone is stored at all', () => {
    renderSection({ personal: {} as unknown as Profile['personal'] });
    expect(phoneNumberInput().value).toBe('');
  });
});

describe('PersonalSection — phone number input strips non-digits', () => {
  it('strips non-digit characters as the user types', () => {
    renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(phoneNumberInput(), { target: { value: '(555) 123-4567' } });
    expect(phoneNumberInput().value).toBe('5551234567');
  });
});

describe('PersonalSection — date of birth partial-entry error precedence', () => {
  it('shows the "complete or leave blank" message after typing only a day', () => {
    renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '15' } });
    expect(screen.getByText('Complete day, month, and year, or leave blank')).toBeTruthy();
  });

  it('clears the partial message once month and year are also filled in', () => {
    renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1990' } });
    expect(screen.queryByText('Complete day, month, and year, or leave blank')).toBeNull();
  });

  it('does not show the partial message when the field is left entirely blank', () => {
    renderSection({ personal: {} as unknown as Profile['personal'] });
    expect(screen.queryByText('Complete day, month, and year, or leave blank')).toBeNull();
  });

  it('clears the partial message again if the user erases back to fully blank', () => {
    renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '15' } });
    expect(screen.getByText('Complete day, month, and year, or leave blank')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '' } });
    expect(screen.queryByText('Complete day, month, and year, or leave blank')).toBeNull();
  });
});

describe('PersonalSection — save validation', () => {
  it('blocks save and shows required-field errors when mandatory fields are empty', () => {
    const { onSave } = renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.click(screen.getByText('Save Personal Information'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('First name is required')).toBeTruthy();
    expect(screen.getByText('Last name is required')).toBeTruthy();
    expect(screen.getByText('Email is required')).toBeTruthy();
    expect(screen.getByText('Phone number is required')).toBeTruthy();
  });

  it('saves successfully once all mandatory fields are valid', async () => {
    const { onSave } = renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(document.getElementById('field-firstName')!, { target: { value: 'Jane' } });
    fireEvent.change(document.getElementById('field-lastName')!, { target: { value: 'Doe' } });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(phoneNumberInput(), { target: { value: '5551234567' } });

    fireEvent.click(screen.getByText('Save Personal Information'));

    expect(onSave).toHaveBeenCalledWith({
      personal: expect.objectContaining({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: expect.objectContaining({ number: '5551234567' }),
      }),
    });
  });
});
