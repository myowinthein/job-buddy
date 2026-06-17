import { useState } from 'react';
import type { Profile, LanguageEntry, LanguageProficiency } from '@/src/types/profile';
import { FormField } from './shared/FormField';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

type Row = LanguageEntry & { _isEnglish?: boolean };

const PROFICIENCY_LABELS: Record<LanguageProficiency, string> = {
  basic: 'Basic',
  conversational: 'Conversational',
  professional: 'Professional',
  native: 'Native / Bilingual',
};

function initEntries(profile: Partial<Profile>): Row[] {
  const existing = (profile.languages ?? []).map((l) => ({
    ...l,
    _isEnglish: l.language.toLowerCase() === 'english',
  }));
  const hasEnglish = existing.some((l) => l._isEnglish);
  if (!hasEnglish) {
    return [{ language: 'English', proficiency: 'native', _isEnglish: true }, ...existing];
  }
  const englishIdx = existing.findIndex((l) => l._isEnglish);
  if (englishIdx > 0) {
    const [eng] = existing.splice(englishIdx, 1);
    existing.unshift(eng);
  }
  return existing;
}

export function LanguagesSection({ profile, onSave }: Props) {
  const [entries, setEntries] = useState<Row[]>(initEntries(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (idx: number, key: keyof LanguageEntry, value: string) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    if (errors[ek]) setErrors((e) => ({ ...e, [ek]: '' }));
  };

  const addEntry = () => {
    setEntries((rows) => [...rows, { language: '', proficiency: 'conversational', _isEnglish: false }]);
  };

  const removeEntry = (idx: number) => {
    setEntries((rows) => rows.filter((_, i) => i !== idx));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    entries.forEach((row, idx) => {
      if (!row.language.trim()) e[`${idx}.language`] = 'Language is required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      languages: entries.map(({ _isEnglish: _, ...r }) => r),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Languages</h2>
        <p className="text-sm text-gray-500 mt-1">Languages you speak — English is required</p>
      </div>

      <div className="space-y-3 mb-4">
        {entries.map((row, idx) => (
          <div key={idx} className="flex gap-3 items-start p-3 border border-gray-200 rounded-lg">
            <div className="flex-1">
              <FormField
                label={row._isEnglish ? 'Language (required)' : 'Language'}
                error={errors[`${idx}.language`]}
              >
                <input
                  className={cls(errors[`${idx}.language`])}
                  value={row.language}
                  onChange={(e) => update(idx, 'language', e.target.value)}
                  placeholder="English"
                  readOnly={row._isEnglish}
                />
              </FormField>
            </div>
            <div className="flex-1">
              <FormField label="Proficiency">
                <select
                  className={cls()}
                  value={row.proficiency}
                  onChange={(e) => update(idx, 'proficiency', e.target.value as LanguageProficiency)}
                >
                  {Object.entries(PROFICIENCY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="pt-6">
              {row._isEnglish ? (
                <span
                  className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded"
                  title="English is required and cannot be removed"
                >
                  Required
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => removeEntry(idx)}
                  className="px-2.5 py-1.5 text-red-600 border border-red-200 rounded-lg text-xs hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addEntry}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 text-sm text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors mb-4"
      >
        + Add Language
      </button>

      <div className="mt-2 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Languages'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
