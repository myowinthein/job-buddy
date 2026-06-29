import { useToast } from '@/src/components/ui/useToast';
import { useState, useRef, useEffect } from 'react';
import type { Profile, WorkAuthorizationEntry, WorkAuthorizationStatus } from '@/src/types/profile';
import { findCountryByNameOrCode } from '@/src/data/countries';
import { WORK_AUTH_STATUS_OPTIONS } from '@/src/data/workAuthorization';
import { FormField } from './shared/FormField';
import { SearchableCountryDropdown } from './shared/SearchableCountryDropdown';
import { RemoveButton } from './shared/RemoveButton';
import { saveSection } from './shared/saveSection';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 dark:border-red-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// Local row allows empty status while the user hasn't selected yet.
type LocalRow = { country: string; status: WorkAuthorizationStatus | '' };


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
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const [newEntryTick, setNewEntryTick] = useState(0);
  const entriesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!newEntryTick) return;
    const raf = requestAnimationFrame(() => {
      const last = entriesContainerRef.current?.lastElementChild as HTMLElement | null;
      last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      last?.querySelector<HTMLElement>(
        'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([readonly]),' +
        ' select, button[aria-haspopup="listbox"]',
      )?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [newEntryTick]);

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
    await saveSection(onSave, {
      workAuthorization: entries.map((r) => ({
        country: r.country,
        status: r.status as WorkAuthorizationStatus,
      })),
    }, showToast, 'Work authorization saved');
    setSaving(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Work Authorization</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your eligibility to work in each country</p>
      </div>

      {errors.general && (
        <p className="text-sm text-red-500 dark:text-red-400 mb-4 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">{errors.general}</p>
      )}

      <div ref={entriesContainerRef}>
      {entries.map((row, idx) => (
        <div key={idx} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Entry {idx + 1}</span>
            <RemoveButton
              onClick={() => setEntries((rows) => rows.filter((_, i) => i !== idx))}
            />
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
                {WORK_AUTH_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FormField>
          </div>
        </div>
      ))}
      </div>{/* entriesContainerRef */}

      <button
        type="button"
        onClick={() => { setEntries((rows) => [...rows, emptyRow()]); setNewEntryTick((t) => t + 1); }}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 active:scale-95 transition-colors mb-4"
      >
        + Add Entry
      </button>

      <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Work Authorization'}
        </button>
      </div>
    </div>
  );
}
