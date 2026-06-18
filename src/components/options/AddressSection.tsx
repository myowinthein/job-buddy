import { useState } from 'react';
import type { Profile } from '@/src/types/profile';
import { findCountryByNameOrCode } from '@/src/data/countries';
import { FormField } from './shared/FormField';
import { SearchableCountryDropdown } from './shared/SearchableCountryDropdown';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fieldError = (key: string, value: string): string => {
    if (key === 'city') return !value.trim() ? 'City is required' : '';
    if (key === 'countryCode') return !value ? 'Country is required' : '';
    return '';
  };

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: fieldError(key, value) }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.city.trim()) e.city = 'City is required';
    if (!form.countryCode) e.countryCode = 'Country is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      address: {
        city: form.city.trim(),
        country: form.countryCode,           // stores ISO code, e.g. "TH"
        street: form.street || undefined,
        state: form.state || undefined,
        postalCode: form.postalCode || undefined,
      },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Address</h2>
        <p className="text-sm text-gray-500 mt-1">Your current residential address</p>
      </div>

      <FormField label="Street Address">
        <input
          className={cls()}
          value={form.street}
          onChange={(e) => set('street', e.target.value)}
          placeholder="123 Main Street, Apt 4B"
          maxLength={255}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="City" required error={errors.city}>
          <input
            className={cls(errors.city)}
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            placeholder="San Francisco"
            maxLength={100}
          />
        </FormField>
        <FormField label="State / Province">
          <input
            className={cls()}
            value={form.state}
            onChange={(e) => set('state', e.target.value)}
            placeholder="CA"
            maxLength={100}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Country" required error={errors.countryCode}>
          <SearchableCountryDropdown
            value={form.countryCode}
            onChange={(code) => set('countryCode', code)}
            error={errors.countryCode}
          />
        </FormField>
        <FormField label="Postal Code">
          <input
            className={cls()}
            value={form.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
            placeholder="94105"
            maxLength={20}
          />
        </FormField>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Address'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
