import { useState } from 'react';
import type { Profile, WorkAuthorizationEntry, WorkAuthorizationStatus } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { ExpandableCard } from './shared/ExpandableCard';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

type Row = WorkAuthorizationEntry;

const emptyRow = (): Row => ({ country: '', status: 'citizen_or_pr', visaType: '', expiryDate: '' });

const STATUS_LABELS: Record<WorkAuthorizationStatus, string> = {
  citizen_or_pr: 'Citizen / Permanent Resident',
  work_visa: 'Work Visa',
  requires_sponsorship: 'Requires Sponsorship',
};

const summary = (row: Row) =>
  row.country ? `${row.country} — ${STATUS_LABELS[row.status] ?? row.status}` : 'New Entry';

export function WorkAuthorizationSection({ profile, onSave }: Props) {
  const [entries, setEntries] = useState<Row[]>(
    profile.workAuthorization?.length ? profile.workAuthorization : [emptyRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (idx: number, key: keyof Row, value: string) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    if (errors[ek]) setErrors((e) => ({ ...e, [ek]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (entries.length === 0) {
      e.general = 'At least one work authorization entry is required';
    }
    entries.forEach((row, idx) => {
      if (!row.country.trim()) e[`${idx}.country`] = 'Country is required';
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
        country: r.country.trim(),
        status: r.status,
        visaType: r.visaType || undefined,
        expiryDate: r.expiryDate || undefined,
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
        <ExpandableCard
          key={idx}
          summary={summary(row)}
          onDelete={() => setEntries((rows) => rows.filter((_, i) => i !== idx))}
          defaultExpanded={!row.country}
        >
          <FormField label="Country" required error={errors[`${idx}.country`]}>
            <input
              className={cls(errors[`${idx}.country`])}
              value={row.country}
              onChange={(e) => update(idx, 'country', e.target.value)}
              placeholder="Singapore"
            />
          </FormField>

          <FormField label="Authorization Status" required error={errors[`${idx}.status`]}>
            <select
              className={cls(errors[`${idx}.status`])}
              value={row.status}
              onChange={(e) => update(idx, 'status', e.target.value as WorkAuthorizationStatus)}
            >
              <option value="citizen_or_pr">Citizen / Permanent Resident</option>
              <option value="work_visa">Work Visa</option>
              <option value="requires_sponsorship">Requires Sponsorship</option>
            </select>
          </FormField>

          {row.status === 'work_visa' && (
            <>
              <FormField label="Visa Type">
                <input
                  className={cls()}
                  value={row.visaType ?? ''}
                  onChange={(e) => update(idx, 'visaType', e.target.value)}
                  placeholder="H-1B, EP, etc."
                />
              </FormField>
              <FormField label="Visa Expiry Date">
                <input
                  type="date"
                  className={cls()}
                  value={row.expiryDate ?? ''}
                  onChange={(e) => update(idx, 'expiryDate', e.target.value)}
                />
              </FormField>
            </>
          )}
        </ExpandableCard>
      ))}

      <button
        type="button"
        onClick={() => setEntries((rows) => [...rows, emptyRow()])}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 text-sm text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors mb-4"
      >
        + Add Country
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
