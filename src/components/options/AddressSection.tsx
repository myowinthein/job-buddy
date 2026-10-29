import { SectionHeader } from './shared/SectionHeader';
import { useSectionDraft } from './shared/useSectionDraft';
import { useState } from 'react';
import { useToast } from '@/src/components/ui/useToast';
import type { Profile } from '@/src/types/profile';
import { findCountryByNameOrCode } from '@/src/data/countries';
import { FormField } from './shared/FormField';
import { saveSection } from './shared/saveSection';
import { SaveButton } from './shared/SaveButton';
import { SearchableCountryDropdown } from './shared/SearchableCountryDropdown';
import { fieldCls as cls } from './shared/fieldCls';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

// Back-compat: old profiles stored a country name ("Thailand"); new ones store
// an ISO code ("TH"). Normalise to the ISO code on load.
function initCountryCode(raw: string | undefined): string {
  if (!raw) return '';
  const found = findCountryByNameOrCode(raw);
  return found ? found.code : raw;
}

export function AddressSection({ profile, onSave }: Props) {
  const a = profile.address;
  const [form, setForm] = useState({
    city: a?.city ?? '',
    countryCode: initCountryCode(a?.country),
    street: a?.street ?? '',
    state: a?.state ?? '',
    postalCode: a?.postalCode ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const fieldError = (key: string, value: string): string => {
    if (key === 'city' && !value.trim()) return 'City is required';
    const max = ({ city: 100, state: 100, street: 255, postalCode: 20 } as Record<string, number>)[
      key
    ];
    if (max && value.length > max) return `Use ${max} characters or fewer`;
    if (key === 'countryCode')
      return !value
        ? 'Country is required'
        : !findCountryByNameOrCode(value)
          ? 'Select a valid country'
          : '';
    return '';
  };

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: fieldError(key, value) }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    for (const key of ['city', 'countryCode', 'street', 'state', 'postalCode'] as const) {
      const err = fieldError(key, form[key]);
      if (err) e[key] = err;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveDraft = useSectionDraft(form, onSave);

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await saveSection(
      saveDraft,
      {
        address: {
          city: form.city.trim(),
          country: form.countryCode, // stores ISO code, e.g. "TH"
          street: form.street || undefined,
          state: form.state || undefined,
          postalCode: form.postalCode || undefined,
        },
      },
      showToast,
      'Address saved',
    );
    setSaving(false);
  };

  return (
    <div>
      <SectionHeader sectionId="address" />

      <FormField label="Country" required error={errors.countryCode}>
        <SearchableCountryDropdown
          id="field-country"
          value={form.countryCode}
          onChange={(code) => set('countryCode', code)}
          error={errors.countryCode}
        />
      </FormField>

      <FormField label="Street Address" error={errors.street}>
        <input
          className={cls(errors.street)}
          id="field-street"
          value={form.street}
          onChange={(e) => set('street', e.target.value)}
          placeholder="123 Main Street, Apt 4B"
          maxLength={255}
        />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="City" required error={errors.city}>
          <input
            className={cls(errors.city)}
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            id="field-city"
            placeholder="San Francisco"
            maxLength={100}
          />
        </FormField>
        <FormField label="State / Province" error={errors.state}>
          <input
            className={cls(errors.state)}
            id="field-state"
            value={form.state}
            onChange={(e) => set('state', e.target.value)}
            placeholder="CA"
            maxLength={100}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Postal Code" error={errors.postalCode}>
          <input
            className={cls(errors.postalCode)}
            id="field-postalCode"
            value={form.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
            placeholder="94105"
            maxLength={20}
          />
        </FormField>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <SaveButton onClick={handleSave} saving={saving} label="Save Address" />
      </div>
    </div>
  );
}
