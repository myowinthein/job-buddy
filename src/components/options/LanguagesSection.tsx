import { useState } from 'react';
import type { Profile, LanguageEntry, LanguageProficiency } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { RemoveButton } from './shared/RemoveButton';
import { SearchableLanguageSelect } from './shared/SearchableLanguageSelect';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const PROFICIENCY_OPTIONS: { value: LanguageProficiency; label: string }[] = [
  { value: 'native_bilingual',    label: 'Native or bilingual proficiency' },
  { value: 'full_professional',   label: 'Full professional proficiency (C1–C2)' },
  { value: 'professional_working',label: 'Professional working proficiency (B2–C1)' },
  { value: 'limited_working',     label: 'Limited working proficiency (B1–B2)' },
  { value: 'elementary',          label: 'Elementary proficiency (A1–A2)' },
];

// Back-compat: old profiles used basic/conversational/professional/native.
const PROFICIENCY_MIGRATION: Record<string, LanguageProficiency> = {
  basic:         'elementary',
  conversational:'limited_working',
  professional:  'professional_working',
  native:        'native_bilingual',
};

function migrateProficiency(raw: string): LanguageProficiency {
  return PROFICIENCY_MIGRATION[raw] ?? (PROFICIENCY_OPTIONS.some((o) => o.value === raw)
    ? (raw as LanguageProficiency)
    : 'professional_working');
}

type Row = { language: string; proficiency: LanguageProficiency };

function initRow(raw: LanguageEntry): Row {
  return { language: raw.language, proficiency: migrateProficiency(raw.proficiency) };
}

function emptyRow(): Row {
  return { language: '', proficiency: '' as LanguageProficiency };
}

export function LanguagesSection({ profile, onSave }: Props) {
  const [entries, setEntries] = useState<Row[]>(
    profile.languages?.length ? profile.languages.map(initRow) : [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (idx: number, key: keyof Row, value: string) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    const err = key === 'language' && !value.trim() ? 'Language is required' : '';
    setErrors((e) => ({ ...e, [ek]: err }));
  };

  const addEntry = () => setEntries((rows) => [...rows, emptyRow()]);

  const removeEntry = (idx: number) =>
    setEntries((rows) => rows.filter((_, i) => i !== idx));

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
      languages: entries.map((r) => ({
        language: r.language,
        proficiency: r.proficiency || 'professional_working',
      })),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Languages</h2>
        <p className="text-sm text-gray-500 mt-1">Add the languages you can use professionally.</p>
      </div>

      <div className="mb-4">
        {entries.map((row, idx) => (
          <div key={idx} className="p-4 border border-gray-200 rounded-lg mb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-600">Entry {idx + 1}</span>
              <RemoveButton onClick={() => removeEntry(idx)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Language" required error={errors[`${idx}.language`]}>
                <SearchableLanguageSelect
                  value={row.language}
                  onChange={(code) => update(idx, 'language', code)}
                  error={errors[`${idx}.language`]}
                />
              </FormField>
              <FormField label="Proficiency">
                <select
                  className={cls()}
                  value={row.proficiency}
                  onChange={(e) => update(idx, 'proficiency', e.target.value)}
                >
                  <option value="">Select proficiency…</option>
                  {PROFICIENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </FormField>
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
