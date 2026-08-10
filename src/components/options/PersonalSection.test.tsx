// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PersonalSection } from './PersonalSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile } from '@/src/types/profile';

// jsdom doesn't implement Element.scrollIntoView; SearchableCallingCodeSelect's
// keyboard-highlight effect calls it whenever the panel opens.
Element.prototype.scrollIntoView = vi.fn();

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

describe('PersonalSection — email format validation', () => {
  it('shows "Enter a valid email address" for a malformed value', () => {
    renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'not-an-email' } });
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
  });

  it('clears the error once the value becomes valid', () => {
    renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'not-an-email' } });
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });
    expect(screen.queryByText('Enter a valid email address')).toBeNull();
  });
});

describe('PersonalSection — date of birth year-range validation at save time', () => {
  // DateOfBirthPicker enforces its own [CURRENT_YEAR-100, CURRENT_YEAR] bound
  // internally and never calls onChange with a non-empty value for an
  // out-of-range year typed live, so PersonalSection's own year-range checks
  // in fieldError/validate are only reachable through a stored profile value
  // that already carries an out-of-range date (e.g. a corrupted/imported
  // profile) — the two share the exact same messages and thresholds.
  const CURRENT_YEAR = new Date().getFullYear();

  it('rejects a stored date of birth after the current year on save', () => {
    const { onSave } = renderSection({
      personal: { dateOfBirth: `${CURRENT_YEAR + 1}-06-15` } as unknown as Profile['personal'],
    });
    fireEvent.change(document.getElementById('field-firstName')!, { target: { value: 'Jane' } });
    fireEvent.change(document.getElementById('field-lastName')!, { target: { value: 'Doe' } });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(phoneNumberInput(), { target: { value: '5551234567' } });
    fireEvent.click(screen.getByText('Save Personal Information'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(`Date of birth cannot be after ${CURRENT_YEAR}`)).toBeTruthy();
  });

  it('rejects a stored date of birth more than 100 years ago on save', () => {
    const { onSave } = renderSection({
      personal: { dateOfBirth: `${CURRENT_YEAR - 101}-06-15` } as unknown as Profile['personal'],
    });
    fireEvent.change(document.getElementById('field-firstName')!, { target: { value: 'Jane' } });
    fireEvent.change(document.getElementById('field-lastName')!, { target: { value: 'Doe' } });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(phoneNumberInput(), { target: { value: '5551234567' } });
    fireEvent.click(screen.getByText('Save Personal Information'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(`Year must be ${CURRENT_YEAR - 100} or later`)).toBeTruthy();
  });

  it('accepts a stored date of birth within range', () => {
    const { onSave } = renderSection({
      personal: { dateOfBirth: '1990-06-15' } as unknown as Profile['personal'],
    });
    fireEvent.change(document.getElementById('field-firstName')!, { target: { value: 'Jane' } });
    fireEvent.change(document.getElementById('field-lastName')!, { target: { value: 'Doe' } });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(phoneNumberInput(), { target: { value: '5551234567' } });
    fireEvent.click(screen.getByText('Save Personal Information'));

    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByText(/Date of birth cannot be after/)).toBeNull();
    expect(screen.queryByText(/Year must be.*or later/)).toBeNull();
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

  it('nickname is optional — saves successfully when left blank', async () => {
    const { onSave } = renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(document.getElementById('field-firstName')!, { target: { value: 'Jane' } });
    fireEvent.change(document.getElementById('field-lastName')!, { target: { value: 'Doe' } });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(phoneNumberInput(), { target: { value: '5551234567' } });

    fireEvent.click(screen.getByText('Save Personal Information'));

    expect(onSave).toHaveBeenCalledWith({
      personal: expect.objectContaining({ nickname: undefined }),
    });
  });

  it('saves a trimmed nickname when provided', async () => {
    const { onSave } = renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(document.getElementById('field-firstName')!, { target: { value: 'Jane' } });
    fireEvent.change(document.getElementById('field-lastName')!, { target: { value: 'Doe' } });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(phoneNumberInput(), { target: { value: '5551234567' } });
    fireEvent.change(document.getElementById('field-nickname')!, { target: { value: '  Janey  ' } });

    fireEvent.click(screen.getByText('Save Personal Information'));

    expect(onSave).toHaveBeenCalledWith({
      personal: expect.objectContaining({ nickname: 'Janey' }),
    });
  });

  it('rejects a nickname over 100 characters', () => {
    const { onSave } = renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(document.getElementById('field-firstName')!, { target: { value: 'Jane' } });
    fireEvent.change(document.getElementById('field-lastName')!, { target: { value: 'Doe' } });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(phoneNumberInput(), { target: { value: '5551234567' } });
    fireEvent.change(document.getElementById('field-nickname')!, { target: { value: 'a'.repeat(101) } });

    fireEvent.click(screen.getByText('Save Personal Information'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Nickname must be 100 characters or fewer')).toBeTruthy();
  });
});

describe('PersonalSection — handleCountryChange (phone calling code)', () => {
  it('updates the calling code sent on save when a different country is chosen', () => {
    const { onSave } = renderSection({ personal: { phone: { countryCode: 'US', callingCode: '+1', number: '5551234567' } } as unknown as Profile['personal'] });
    fireEvent.change(document.getElementById('field-firstName')!, { target: { value: 'Jane' } });
    fireEvent.change(document.getElementById('field-lastName')!, { target: { value: 'Doe' } });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });

    fireEvent.click(screen.getByLabelText('Select country calling code'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: 'Thailand' } });
    fireEvent.click(screen.getByText('Thailand'));

    fireEvent.click(screen.getByText('Save Personal Information'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      personal: expect.objectContaining({
        phone: expect.objectContaining({ countryCode: 'TH', callingCode: '+66' }),
      }),
    }));
  });

  it('clears an existing "required" phone error as soon as a country is picked, before typing a number', () => {
    const { onSave } = renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.click(screen.getByText('Save Personal Information')); // triggers "Phone number is required"
    expect(screen.getByText('Phone number is required')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Select country calling code'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: 'Thailand' } });
    fireEvent.click(screen.getByText('Thailand'));

    expect(screen.queryByText('Phone number is required')).toBeNull();
    expect(onSave).not.toHaveBeenCalled(); // country alone doesn't satisfy the phone number requirement
  });
});

describe('PersonalSection — Date of Birth partial entry blocks save', () => {
  it('blocks save and re-shows the partial-completion error when only Day is filled in', () => {
    const { onSave } = renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(document.getElementById('field-firstName')!, { target: { value: 'Jane' } });
    fireEvent.change(document.getElementById('field-lastName')!, { target: { value: 'Doe' } });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(phoneNumberInput(), { target: { value: '5551234567' } });
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '15' } });

    fireEvent.click(screen.getByText('Save Personal Information'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Complete day, month, and year, or leave blank')).toBeTruthy();
  });

  it('saves successfully when Date of Birth is left entirely blank', () => {
    const { onSave } = renderSection({ personal: {} as unknown as Profile['personal'] });
    fireEvent.change(document.getElementById('field-firstName')!, { target: { value: 'Jane' } });
    fireEvent.change(document.getElementById('field-lastName')!, { target: { value: 'Doe' } });
    fireEvent.change(document.getElementById('field-email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(phoneNumberInput(), { target: { value: '5551234567' } });

    fireEvent.click(screen.getByText('Save Personal Information'));

    expect(onSave).toHaveBeenCalled();
  });
});
