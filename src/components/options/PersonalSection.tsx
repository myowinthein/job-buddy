import { useState } from 'react';
import type { Profile, PhoneNumber } from '@/src/types/profile';
import { findCountry } from '@/src/data/countries';
import { SearchableCountrySelect } from './shared/SearchableCountrySelect';
import { ETHNICITIES } from '@/src/data/ethnicities';
import { FormField } from './shared/FormField';
import { DateOfBirthPicker } from './shared/DateOfBirthPicker';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const CURRENT_YEAR = new Date().getFullYear();

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// ── Backward-compat phone initialiser ──────────────────────────────────────
// Existing stored profiles may have phone as a plain string. Gracefully
// migrate: preserve the number digits in the number field, default to US (+1).
function initPhone(raw: unknown): { country: string; callingCode: string; number: string } {
  if (raw && typeof raw === 'object' && 'countryCode' in (raw as object)) {
    const ph = raw as Partial<PhoneNumber>;
    const country = findCountry(ph.countryCode ?? 'US');
    return {
      country: country.code,
      callingCode: country.callingCode,
      number: ph.number ?? '',
    };
  }
  return {
    country: 'US',
    callingCode: '+1',
    number: typeof raw === 'string' ? raw : '',
  };
}

export function PersonalSection({ profile, onSave }: Props) {
  const p = profile.personal;
  const initPh = initPhone(p?.phone);

  const [form, setForm] = useState({
    firstName: p?.firstName ?? '',
    lastName: p?.lastName ?? '',
    email: p?.email ?? '',
    phoneCountry: initPh.country,
    phoneCallingCode: initPh.callingCode,
    phoneNumber: initPh.number,
    dateOfBirth: p?.dateOfBirth ?? '',
    gender: p?.gender ?? '',
    ethnicity: p?.ethnicity ?? '',
    veteranStatus: p?.veteranStatus ?? '',
    disabilityStatus: p?.disabilityStatus ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fieldError = (key: string, value: string): string => {
    switch (key) {
      case 'firstName': return !value.trim() ? 'First name is required' : '';
      case 'lastName':  return !value.trim() ? 'Last name is required' : '';
      case 'email':
        if (!value.trim()) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
        return '';
      case 'phoneNumber':
        if (!value.trim()) return 'Phone number is required';
        if (value.length < 4) return 'Enter a valid phone number';
        return '';
      case 'dateOfBirth': {
        if (!value) return '';
        const year = parseInt(value.split('-')[0] ?? '', 10);
        if (year > CURRENT_YEAR) return `Date of birth cannot be after ${CURRENT_YEAR}`;
        if (year < CURRENT_YEAR - 100) return `Year must be ${CURRENT_YEAR - 100} or later`;
        return '';
      }
      default: return '';
    }
  };

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: fieldError(key, value) }));
  };

  const handleCountryChange = (code: string) => {
    const country = findCountry(code);
    setForm((f) => ({
      ...f,
      phoneCountry: country.code,
      phoneCallingCode: country.callingCode,
    }));
    if (errors.phoneNumber) setErrors((e) => ({ ...e, phoneNumber: '' }));
  };

  const handlePhoneNumberChange = (value: string) => {
    // Strip anything that isn't a digit
    set('phoneNumber', value.replace(/\D/g, ''));
  };

  const validate = () => {
    const e: Record<string, string> = {};

    if (!form.firstName.trim()) e.firstName = 'First name is required';
    else if (form.firstName.length > 100) e.firstName = 'First name must be 100 characters or fewer';

    if (!form.lastName.trim()) e.lastName = 'Last name is required';
    else if (form.lastName.length > 100) e.lastName = 'Last name must be 100 characters or fewer';

    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';
    else if (form.email.length > 254) e.email = 'Email must be 254 characters or fewer';

    if (!form.phoneNumber.trim()) {
      e.phoneNumber = 'Phone number is required';
    } else if (form.phoneNumber.length < 4) {
      e.phoneNumber = 'Enter a valid phone number';
    }

    if (form.dateOfBirth) {
      const year = parseInt(form.dateOfBirth.split('-')[0] ?? '', 10);
      if (!isNaN(year)) {
        if (year > CURRENT_YEAR) e.dateOfBirth = `Date of birth cannot be after ${CURRENT_YEAR}`;
        else if (year < CURRENT_YEAR - 100) e.dateOfBirth = `Year must be ${CURRENT_YEAR - 100} or later`;
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      personal: {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: {
          countryCode: form.phoneCountry,
          callingCode: form.phoneCallingCode,
          number: form.phoneNumber.trim(),
        },
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        ethnicity: form.ethnicity || undefined,
        veteranStatus: form.veteranStatus || undefined,
        disabilityStatus: form.disabilityStatus || undefined,
      },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
        <p className="text-sm text-gray-500 mt-1">Basic personal details used in job applications</p>
      </div>

      {/* Name */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="First Name" required error={errors.firstName}>
          <input
            className={cls(errors.firstName)}
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            id="field-firstName"
            placeholder="John"
            maxLength={100}
          />
        </FormField>
        <FormField label="Last Name" required error={errors.lastName}>
          <input
            className={cls(errors.lastName)}
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            id="field-lastName"
            placeholder="Smith"
            maxLength={100}
          />
        </FormField>
      </div>

      {/* Email */}
      <FormField label="Email" required error={errors.email}>
        <input
          type="email"
          className={cls(errors.email)}
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          id="field-email"
          placeholder="john.smith@example.com"
          maxLength={254}
        />
      </FormField>

      {/* Phone — searchable country selector + number input */}
      <FormField label="Phone" required error={errors.phoneNumber}>
        <div
          className={`flex items-stretch rounded-lg border ${
            errors.phoneNumber ? 'border-red-300' : 'border-gray-300'
          } focus-within:ring-2 ${
            errors.phoneNumber ? 'focus-within:ring-red-500' : 'focus-within:ring-blue-500'
          } focus-within:border-transparent`}
        >
          <SearchableCountrySelect
            value={form.phoneCountry}
            onChange={handleCountryChange}
          />
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={15}
            className="rounded-r-lg flex-1 px-3 py-2 text-sm focus:outline-none bg-white"
            value={form.phoneNumber}
            onChange={(e) => handlePhoneNumberChange(e.target.value)}
            id="field-phone"
            placeholder="5551234567"
          />
        </div>
      </FormField>

      {/* Date of Birth */}
      <FormField
        label="Date of Birth"
        hint="Optional — some applications request this"
        error={errors.dateOfBirth}
      >
        <DateOfBirthPicker
          value={form.dateOfBirth}
          onChange={(v) => set('dateOfBirth', v)}
          error={errors.dateOfBirth}
        />
      </FormField>

      {/* Gender & Ethnicity */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Gender">
          <select
            className={cls()}
            value={form.gender}
            onChange={(e) => set('gender', e.target.value)}
          >
            <option value="">Select gender…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </FormField>

        <FormField label="Ethnicity">
          <select
            className={cls()}
            value={form.ethnicity}
            onChange={(e) => set('ethnicity', e.target.value)}
          >
            <option value="">Select ethnicity…</option>
            {ETHNICITIES.map((eth) => (
              <option key={eth} value={eth}>
                {eth}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      {/* Veteran & Disability */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Veteran Status">
          <select
            className={cls()}
            value={form.veteranStatus}
            onChange={(e) => set('veteranStatus', e.target.value)}
          >
            <option value="">Select veteran status…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </FormField>
        <FormField label="Disability Status">
          <select
            className={cls()}
            value={form.disabilityStatus}
            onChange={(e) => set('disabilityStatus', e.target.value)}
          >
            <option value="">Select disability status…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </FormField>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Personal Information'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
