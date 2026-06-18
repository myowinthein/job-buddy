import { useState } from 'react';
import type { Profile, WorkAuthorizationEntry, WorkAuthorizationStatus } from '@/src/types/profile';
import { findCountryByNameOrCode } from '@/src/data/countries';
import { FormField } from './shared/FormField';
import { SearchableCountryDropdown } from './shared/SearchableCountryDropdown';
import { RemoveButton } from './shared/RemoveButton';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// Local row allows empty status while the user hasn't selected yet.
type LocalRow = { country: string; status: WorkAuthorizationStatus | '' };

const STATUS_OPTIONS: { value: WorkAuthorizationStatus; label: string }[] = [
  { value: 'citizen_or_pr',        label: 'Citizen / Permanent Resident' },
  { value: 'work_visa',            label: 'Authorized to work without sponsorship' },
  { value: 'requires_sponsorship', label: 'Requires Sponsorship' },
];

function emptyRow(): LocalRow {
  return { country: '', status: '' };
}

// Back-compat: old entries stored the country as a free-text name ("Singapore").
// New entries store the ISO code ("SG"). Normalise to ISO code on load.
function initRow(raw: WorkAuthorizationEntry): LocalRow {
  const found = findCountryByNameOrCode(raw.country);
  return {
    country: found ? found.code : raw.country,
    status: raw.status ?? '',
  };
}

export function WorkAuthorizationSection({ profile, onSave }: Props) {
  const [entries, setEntries] = useState<LocalRow[]>(
    profile.workAuthorization?.length
      ? profile.workAuthorization.map(initRow)
      : [emptyRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (idx: number, key: keyof LocalRow, value: string) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    let err = '';
    if (key === 'country' && !value) err = 'Country is required';
    else if (key === 'status' && !value) err = 'Status is required';
    setErrors((e) => ({ ...e, [ek]: err }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (entries.length === 0) e.general = 'At least one work authorization entry is required';
    entries.forEach((row, idx) => {
      if (!row.country) e[`${idx}.country`] = 'Country is required';
      if (!row.status) e[`${idx}.status`] = 'Status is required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      workAuthorization: entries.map((r) => ({
        country: r.country,
        status: r.status as WorkAuthorizationStatus,
      })),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Work Authorization</h2>
        <p className="text-sm text-gray-500 mt-1">Your eligibility to work in each country</p>
      </div>

      {errors.general && (
        <p className="text-sm text-red-500 mb-4 p-3 bg-red-50 rounded-lg">{errors.general}</p>
      )}

      {entries.map((row, idx) => (
        <div key={idx} className="p-4 border border-gray-200 rounded-lg mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-600">Entry {idx + 1}</span>
            {entries.length > 1 && (
              <RemoveButton
                onClick={() => setEntries((rows) => rows.filter((_, i) => i !== idx))}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Country" required error={errors[`${idx}.country`]}>
              <SearchableCountryDropdown
                value={row.country}
                onChange={(code) => update(idx, 'country', code)}
                error={errors[`${idx}.country`]}
              />
            </FormField>
            <FormField label="Authorization Status" required error={errors[`${idx}.status`]}>
              <select
                className={cls(errors[`${idx}.status`])}
                value={row.status}
                onChange={(e) => update(idx, 'status', e.target.value)}
              >
                <option value="">Select authorization status…</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FormField>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setEntries((rows) => [...rows, emptyRow()])}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 text-sm text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors mb-4"
      >
        + Add Entry
      </button>

      <div className="mt-2 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Work Authorization'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
