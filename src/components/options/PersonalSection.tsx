import { ProfileFields } from './shared/ProfileFields';
import { SectionHeader } from './shared/SectionHeader';
import { useSectionDraft } from './shared/useSectionDraft';
import { useState, useRef } from 'react';
import { useToast } from '@/src/components/ui/useToast';
import type { Profile, PhoneNumber } from '@/src/types/profile';
import { findCountry } from '@/src/data/countries';
import { SearchableCallingCodeSelect } from './shared/SearchableCallingCodeSelect';
import { ETHNICITIES } from '@/src/data/ethnicities';
import { FormField } from './shared/FormField';
import { saveSection } from './shared/saveSection';
import { SaveButton } from './shared/SaveButton';
import { DateOfBirthPicker } from './shared/DateOfBirthPicker';
import { fieldCls as cls } from './shared/fieldCls';
import {
  isValidProfileEmail,
  isValidProfilePhone,
  birthDateError,
  isValidPersonalOption,
} from '@/src/utils/profileInputValidation';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

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
    nickname: p?.nickname ?? '',
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
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  // True when DateOfBirthPicker has some-but-not-all of day/month/year filled.
  const [dobIsPartial, setDobIsPartial] = useState(false);
  const optionalDetailsRef = useRef<HTMLDetailsElement>(null);

  const fieldError = (key: string, value: string): string => {
    switch (key) {
      case 'firstName':
        if (!value.trim()) return 'First name is required';
        if (value.length > 100) return 'First name must be 100 characters or fewer';
        return '';
      case 'lastName':
        if (value.length > 100) return 'Last name must be 100 characters or fewer';
        return '';
      case 'nickname':
        return value.length > 100 ? 'Preferred name must be 100 characters or fewer' : '';
      case 'email':
        if (!value.trim()) return 'Email is required';
        if (value.length > 254) return 'Email must be 254 characters or fewer';
        if (!isValidProfileEmail(value)) return 'Enter a valid email address';
        return '';
      case 'phoneNumber':
        if (!value.trim()) return 'Phone number is required';
        if (!isValidProfilePhone(value)) return 'Enter 4 to 15 digits';
        return '';
      case 'dateOfBirth':
        return birthDateError(value);
      default:
        return isValidPersonalOption(key, value) ? '' : 'Select a valid option';
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
  };

  const handlePhoneNumberChange = (value: string) => {
    // Strip anything that isn't a digit
    set('phoneNumber', value.replace(/\D/g, ''));
  };

  // Blur handler: validates the current stored value so that focusing a
  // required field and leaving it blank (without typing) still shows an error.
  const handleBlur = (key: string) => {
    setErrors((e) => ({
      ...e,
      [key]: fieldError(key, (form as Record<string, string>)[key] ?? ''),
    }));
  };

  const validate = () => {
    const e: Record<string, string> = {};

    for (const key of [
      'firstName',
      'lastName',
      'nickname',
      'email',
      'phoneNumber',
      'gender',
      'ethnicity',
      'veteranStatus',
      'disabilityStatus',
    ] as const) {
      const err = fieldError(key, form[key]);
      if (err) e[key] = err;
    }

    if (form.dateOfBirth) {
      const err = fieldError('dateOfBirth', form.dateOfBirth);
      if (err) e.dateOfBirth = err;
    }
    if (dobIsPartial) {
      // The picker also reports fully typed but invalid components as incomplete.
      e.dateOfBirth = 'Complete day, month, and year, or leave blank';
    }

    if (
      ['dateOfBirth', 'gender', 'ethnicity', 'veteranStatus', 'disabilityStatus'].some(
        (key) => e[key],
      ) &&
      optionalDetailsRef.current
    )
      optionalDetailsRef.current.open = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveDraft = useSectionDraft({ form, dobIsPartial }, onSave);

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await saveSection(
      saveDraft,
      {
        personal: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          nickname: form.nickname.trim() || undefined,
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
      },
      showToast,
      'Personal information saved',
    );
    setSaving(false);
  };

  return (
    <div>
      <SectionHeader sectionId="personal" />

      <ProfileFields
        scope="personal"
        disclosureProps={{ background: { ref: optionalDetailsRef } }}
        renderers={{
          firstName: (field) => (
            <FormField label={field.label} required={field.required} error={errors.firstName}>
              <input
                className={cls(errors.firstName)}
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                onBlur={() => handleBlur('firstName')}
                id="field-firstName"
                placeholder="John"
                maxLength={100}
              />
            </FormField>
          ),
          lastName: (field) => (
            <FormField label={field.label} required={field.required} error={errors.lastName}>
              <input
                className={cls(errors.lastName)}
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                onBlur={() => handleBlur('lastName')}
                id="field-lastName"
                placeholder="Smith"
                maxLength={100}
              />
            </FormField>
          ),
          nickname: (field) => (
            <FormField label={field.label} required={field.required} error={errors.nickname}>
              <input
                className={cls(errors.nickname)}
                value={form.nickname}
                onChange={(e) => set('nickname', e.target.value)}
                onBlur={() => handleBlur('nickname')}
                id="field-nickname"
                placeholder="Johnny"
                maxLength={100}
              />
            </FormField>
          ),
          email: (field) => (
            <FormField label={field.label} required={field.required} error={errors.email}>
              <input
                type="email"
                className={cls(errors.email)}
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                onBlur={() => handleBlur('email')}
                id="field-email"
                placeholder="john.smith@example.com"
                maxLength={254}
              />
            </FormField>
          ),
          phone: (field) => (
            <FormField label={field.label} required={field.required} error={errors.phoneNumber}>
              <div
                className={`flex items-stretch rounded-lg border ${
                  errors.phoneNumber
                    ? 'border-red-300 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                } focus-within:ring-2 ${
                  errors.phoneNumber ? 'focus-within:ring-red-500' : 'focus-within:ring-blue-500'
                } focus-within:border-transparent`}
              >
                <SearchableCallingCodeSelect
                  value={form.phoneCountry}
                  onChange={handleCountryChange}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={15}
                  className="rounded-r-lg min-w-0 w-0 flex-1 px-3 py-2 text-sm focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  value={form.phoneNumber}
                  onChange={(e) => handlePhoneNumberChange(e.target.value)}
                  onBlur={() => handleBlur('phoneNumber')}
                  id="field-phone"
                  aria-label="Phone number"
                  placeholder="5551234567"
                />
              </div>
            </FormField>
          ),
          dateOfBirth: (field) => (
            <FormField label={field.label} required={field.required} error={errors.dateOfBirth}>
              <DateOfBirthPicker
                id="field-dateOfBirth"
                value={form.dateOfBirth}
                onChange={(v) => set('dateOfBirth', v)}
                onPartialChange={(partial) => {
                  setDobIsPartial(partial);
                  // Live feedback: surface or clear the partial-completion error as
                  // the user types, but don't stomp on more specific range errors.
                  setErrors((e) => {
                    const existing = e.dateOfBirth;
                    if (partial) {
                      if (!existing)
                        return {
                          ...e,
                          dateOfBirth: 'Complete day, month, and year, or leave blank',
                        };
                      return e;
                    }
                    if (existing === 'Complete day, month, and year, or leave blank') {
                      return { ...e, dateOfBirth: '' };
                    }
                    return e;
                  });
                }}
                error={errors.dateOfBirth}
              />
            </FormField>
          ),
          gender: (field) => (
            <FormField label={field.label} required={field.required} error={errors.gender}>
              <select
                id="field-gender"
                className={cls(errors.gender)}
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
              >
                <option value="">Select gender…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </FormField>
          ),
          ethnicity: (field) => (
            <FormField label={field.label} required={field.required} error={errors.ethnicity}>
              <select
                id="field-ethnicity"
                className={cls(errors.ethnicity)}
                value={form.ethnicity}
                onChange={(e) => set('ethnicity', e.target.value)}
              >
                <option value="">Select ethnicity…</option>
                {ETHNICITIES.map((eth) => (
                  <option key={eth} value={eth}>
                    {eth}
                  </option>
                ))}
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </FormField>
          ),
          veteranStatus: (field) => (
            <FormField label={field.label} required={field.required} error={errors.veteranStatus}>
              <select
                id="field-veteranStatus"
                className={cls(errors.veteranStatus)}
                value={form.veteranStatus}
                onChange={(e) => set('veteranStatus', e.target.value)}
              >
                <option value="">Select veteran status…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </FormField>
          ),
          disabilityStatus: (field) => (
            <FormField
              label={field.label}
              required={field.required}
              error={errors.disabilityStatus}
            >
              <select
                id="field-disabilityStatus"
                className={cls(errors.disabilityStatus)}
                value={form.disabilityStatus}
                onChange={(e) => set('disabilityStatus', e.target.value)}
              >
                <option value="">Select disability status…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </FormField>
          ),
        }}
      />

      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <SaveButton onClick={handleSave} saving={saving} label="Save Personal" />
      </div>
    </div>
  );
}
