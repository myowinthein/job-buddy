import { feedback } from '@/src/ui/feedback';
import { ProfileFields } from './shared/ProfileFields';
import { HelpPopover } from '@/src/components/ui/HelpPopover';
import { SectionHeader } from './shared/SectionHeader';
import { useSectionDraft } from './shared/useSectionDraft';
import { useToast } from '@/src/components/ui/useToast';
import { useState, useRef } from 'react';
import type { Profile, LanguageEntry, LanguageProficiency } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { ConfirmRemoveButton } from './shared/ConfirmRemoveButton';
import { removeEntryErrors } from './shared/entryErrors';
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
  { value: 'native_bilingual', label: 'Native or bilingual' },
  { value: 'full_professional', label: 'Full professional (C1–C2)' },
  { value: 'professional_working', label: 'Professional working (B2–C1)' },
  { value: 'limited_working', label: 'Limited working (B1–B2)' },
  { value: 'elementary', label: 'Elementary (A1–A2)' },
];

const PROFICIENCY_HELP: Record<string, string> = {
  native_bilingual: 'You use this language naturally in most situations.',
  full_professional: 'You can handle complex discussions and detailed writing.',
  professional_working: 'You can work independently in this language.',
  limited_working: 'You can handle routine tasks and simple conversations.',
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

type Row = { rowId: string; language: string; proficiency: LanguageProficiency | '' };

function initRow(raw: LanguageEntry): Row {
  return { rowId: crypto.randomUUID(), language: raw.language, proficiency: migrateProficiency(raw.proficiency) };
}

function emptyRow(): Row {
  return { rowId: crypto.randomUUID(), language: '', proficiency: '' };
}

export function LanguagesSection({ profile, onSave }: Props) {
  const [entries, setEntries] = useState<Row[]>(() =>
    profile.languages?.length ? profile.languages.map(initRow) : [emptyRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const entriesContainerRef = useRef<HTMLDivElement>(null);
  const { focusEntry } = useScrollToNewEntry(entriesContainerRef);

  const update = (idx: number, key: keyof Row, value: string) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    let err = '';
    if (key === 'language' && !value.trim()) err = 'Choose a language';
    else if (key === 'proficiency' && !value) err = 'Choose a proficiency level';
    setErrors((e) => ({ ...e, [ek]: err }));
  };

  const handleProficiencyBlur = (idx: number) => {
    const err = !entries[idx].proficiency ? 'Choose a proficiency level' : '';
    setErrors((e) => ({ ...e, [`${idx}.proficiency`]: err }));
  };

  const addEntry = () => {
    const existing = entries.find((row) => !row.language && !row.proficiency);
    const row = existing ?? emptyRow();
    if (!existing) setEntries((rows) => [...rows, row]);
    focusEntry(row.rowId);
  };


  const validate = () => {
    const e: Record<string, string> = {};
    if (!entries.length) e.general = 'Add at least one language';
    const seen = new Set<string>();
    entries.forEach((row, idx) => {
      const language = findLanguage(row.language)?.code ?? row.language.trim().toLowerCase();
      if (seen.has(language)) e[`${idx}.language`] = 'This language is already listed';
      seen.add(language);
      if (!row.language.trim()) e[`${idx}.language`] = 'Choose a language';
      if (!row.proficiency) e[`${idx}.proficiency`] = 'Choose a proficiency level';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveDraft = useSectionDraft(
    entries.map(({ rowId: _rowId, ...row }) => row),
    onSave,
  );

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
      feedback.profileSaved,
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
            key={row.rowId}
            data-entry-id={row.rowId}
            className="profile-entry-fields @container/profile-entry relative p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3"
          >
            <div className="absolute right-4 top-4">
              <ConfirmRemoveButton
                compact
                confirm={!!(row.language || row.proficiency)}
                action={entries.length === 1 ? 'Clear' : 'Delete'}
                onConfirm={() => {
                  setEntries((rows) =>
                    rows.length === 1 ? [emptyRow()] : rows.filter((_, i) => i !== idx),
                  );
                  setErrors((errors) => removeEntryErrors(errors, idx, ''));
                }}
              />
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
                    labelAccessory={
                      <HelpPopover label="Proficiency guide" compact>
                        <dl className="space-y-3">
                          {PROFICIENCY_OPTIONS.map((level) => (
                            <div key={level.value}>
                              <dt className="font-medium text-gray-900 dark:text-gray-100">
                                {level.label}
                              </dt>
                              <dd className="mt-1">{PROFICIENCY_HELP[level.value]}</dd>
                            </div>
                          ))}
                        </dl>
                      </HelpPopover>
                    }
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

      <SaveButton onClick={handleSave} saving={saving} label="Save" />
    </div>
  );
}
