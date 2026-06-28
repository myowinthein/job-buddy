import { useToast } from '@/src/components/ui/Toast';
import { useState, useRef, useEffect } from 'react';
import type { Profile, LanguageEntry, LanguageProficiency } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { RemoveButton } from './shared/RemoveButton';
import { SearchableLanguageSelect } from './shared/SearchableLanguageSelect';
import { saveSection } from './shared/saveSection';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 dark:border-red-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

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
    profile.languages?.length ? profile.languages.map(initRow) : [emptyRow()],
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

  const update = (idx: number, key: keyof Row, value: string) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    let err = '';
    if (key === 'language' && !value.trim()) err = 'Language is required';
    else if (key === 'proficiency' && !value) err = 'Proficiency is required';
    setErrors((e) => ({ ...e, [ek]: err }));
  };

  const handleProficiencyBlur = (idx: number) => {
    const err = !entries[idx].proficiency ? 'Proficiency is required' : '';
    setErrors((e) => ({ ...e, [`${idx}.proficiency`]: err }));
  };

  const addEntry = () => { setEntries((rows) => [...rows, emptyRow()]); setNewEntryTick((t) => t + 1); };

  const removeEntry = (idx: number) =>
    setEntries((rows) => rows.filter((_, i) => i !== idx));

  const validate = () => {
    const e: Record<string, string> = {};
    entries.forEach((row, idx) => {
      if (!row.language.trim()) e[`${idx}.language`] = 'Language is required';
      if (!row.proficiency) e[`${idx}.proficiency`] = 'Proficiency is required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await saveSection(onSave, {
      languages: entries.map((r) => ({
        language: r.language,
        proficiency: r.proficiency || 'professional_working',
      })),
    }, showToast, 'Languages saved');
    setSaving(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Languages</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Add the languages you can use professionally.</p>
      </div>

      <div className="mb-4" ref={entriesContainerRef}>
        {entries.map((row, idx) => (
          <div key={idx} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Entry {idx + 1}</span>
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
              <FormField label="Proficiency" required error={errors[`${idx}.proficiency`]}>
                <select
                  className={cls(errors[`${idx}.proficiency`])}
                  value={row.proficiency}
                  onChange={(e) => update(idx, 'proficiency', e.target.value)}
                  onBlur={() => handleProficiencyBlur(idx)}
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
        className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 active:scale-95 transition-colors mb-4"
      >
        + Add Language
      </button>

      <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Languages'}
        </button>
      </div>
    </div>
  );
}
