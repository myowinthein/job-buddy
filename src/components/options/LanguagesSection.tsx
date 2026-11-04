import { ProfileFields } from './shared/ProfileFields';
import { stableDisclosureFocus } from './shared/stableControlFocus';
import { Info } from 'lucide-react';
import { SectionHeader } from './shared/SectionHeader';
import { useSectionDraft } from './shared/useSectionDraft';
import { useToast } from '@/src/components/ui/useToast';
import { useState, useRef } from 'react';
import type { Profile, LanguageEntry, LanguageProficiency } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { RemoveButton } from './shared/RemoveButton';
import { SearchableLanguageSelect } from './shared/SearchableLanguageSelect';
import { saveSection } from './shared/saveSection';
import { SaveButton } from './shared/SaveButton';
import { EntryListHeader } from './shared/EntryListHeader';
import { findLanguage } from '@/src/data/languages';
import { fieldCls as cls } from './shared/fieldCls';
import { useScrollToNewEntry } from './shared/useScrollToNewEntry';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const PROFICIENCY_OPTIONS: { value: LanguageProficiency; label: string }[] = [
  { value: 'native_bilingual', label: 'Native or bilingual proficiency' },
  { value: 'full_professional', label: 'Full professional proficiency (C1–C2)' },
  { value: 'professional_working', label: 'Professional working proficiency (B2–C1)' },
  { value: 'limited_working', label: 'Limited working proficiency (B1–B2)' },
  { value: 'elementary', label: 'Elementary proficiency (A1–A2)' },
];

const PROFICIENCY_HELP: Record<string, string> = {
  native_bilingual: 'You use this language naturally in most situations.',
  full_professional: 'You can handle complex discussions, negotiation, and detailed writing.',
  professional_working:
    'You can work independently and communicate about familiar professional topics.',
  limited_working:
    'You can manage routine conversations and tasks, with support for complex topics.',
  elementary: 'You can introduce yourself and exchange basic information.',
};

// Back-compat: old profiles used basic/conversational/professional/native.
const PROFICIENCY_MIGRATION: Record<string, LanguageProficiency> = {
  basic: 'elementary',
  conversational: 'limited_working',
  professional: 'professional_working',
  native: 'native_bilingual',
};

function migrateProficiency(raw: string): LanguageProficiency {
  return (
    PROFICIENCY_MIGRATION[raw] ??
    (PROFICIENCY_OPTIONS.some((o) => o.value === raw)
      ? (raw as LanguageProficiency)
      : 'professional_working')
  );
}

type Row = { language: string; proficiency: LanguageProficiency | '' };

function initRow(raw: LanguageEntry): Row {
  return { language: raw.language, proficiency: migrateProficiency(raw.proficiency) };
}

function emptyRow(): Row {
  return { language: '', proficiency: '' };
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
  useScrollToNewEntry(entriesContainerRef, newEntryTick);

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

  const addEntry = () => {
    setEntries((rows) => [...rows, emptyRow()]);
    setNewEntryTick((t) => t + 1);
  };

  const removeEntry = (idx: number) => setEntries((rows) => rows.filter((_, i) => i !== idx));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!entries.length) e.general = 'At least one language is required';
    const seen = new Set<string>();
    entries.forEach((row, idx) => {
      const language = findLanguage(row.language)?.code ?? row.language.trim().toLowerCase();
      if (seen.has(language)) e[`${idx}.language`] = 'This language is already listed';
      seen.add(language);
      if (!row.language.trim()) e[`${idx}.language`] = 'Language is required';
      if (!row.proficiency) e[`${idx}.proficiency`] = 'Proficiency is required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveDraft = useSectionDraft(entries, onSave);

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await saveSection(
      saveDraft,
      {
        languages: entries.map((r) => ({
          language: r.language,
          proficiency: r.proficiency || 'professional_working',
        })),
      },
      showToast,
      'Languages saved',
    );
    setSaving(false);
  };

  return (
    <div>
      <SectionHeader sectionId="languages" />

      <EntryListHeader id="add-languages" onAdd={addEntry} label="+ Add Language" />

      {errors.general && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400 mb-4">
          {errors.general}
        </p>
      )}
      <div className="mb-4" ref={entriesContainerRef}>
        {entries.map((row, idx) => (
          <div
            key={idx}
            className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Entry {idx + 1}
              </span>
              <RemoveButton onClick={() => removeEntry(idx)} />
            </div>
            <ProfileFields
              index={idx}
              scope="languages"
              renderers={{
                language: (field) => (
                  <FormField
                    label={field.label}
                    required={field.required}
                    error={errors[`${idx}.language`]}
                  >
                    <SearchableLanguageSelect
                      id={field.inputId}
                      value={row.language}
                      onChange={(code) => update(idx, 'language', code)}
                      error={errors[`${idx}.language`]}
                    />
                  </FormField>
                ),
                proficiency: (field) => (
                  <FormField
                    label={field.label}
                    required={field.required}
                    error={errors[`${idx}.proficiency`]}
                  >
                    <select
                      id={field.inputId}
                      className={cls(errors[`${idx}.proficiency`])}
                      value={row.proficiency}
                      onChange={(e) => update(idx, 'proficiency', e.target.value)}
                      onBlur={() => handleProficiencyBlur(idx)}
                    >
                      <option value="">Select proficiency…</option>
                      {PROFICIENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                ),
              }}
            />
          </div>
        ))}
      </div>

      <details className="mb-4">
        <summary
          {...stableDisclosureFocus}
          className="flex cursor-pointer items-center gap-2 py-1 text-xs font-medium text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
        >
          <Info aria-hidden="true" className="h-3.5 w-3.5" />
          Proficiency guide
        </summary>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
          {PROFICIENCY_OPTIONS.map((level) => (
            <div key={level.value}>
              <dt className="font-medium text-gray-700 dark:text-gray-200">{level.label}</dt>
              <dd className="mt-1 text-gray-500 dark:text-gray-400">
                {PROFICIENCY_HELP[level.value]}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <SaveButton onClick={handleSave} saving={saving} label="Save Languages" />
      </div>
    </div>
  );
}
