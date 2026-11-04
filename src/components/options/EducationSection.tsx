import { profileTextLimit } from '@/src/profile/fieldPolicies';
import { ProfileFields } from './shared/ProfileFields';
import { SectionHeader } from './shared/SectionHeader';
import { profileDateRangeErrors } from '@/src/utils/profileInputValidation';
import { useSectionDraft } from './shared/useSectionDraft';
import { useToast } from '@/src/components/ui/useToast';
import { useState, useRef } from 'react';
import type { Profile, EducationEntry } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { ExpandableCard } from './shared/ExpandableCard';
import { MonthYearPicker } from './shared/MonthYearPicker';
import { saveSection } from './shared/saveSection';
import { SaveButton } from './shared/SaveButton';
import { EntryListHeader } from './shared/EntryListHeader';
import { fieldCls as cls } from './shared/fieldCls';
import { useScrollToNewEntry } from './shared/useScrollToNewEntry';
import { useDateRangeValidation } from './shared/useDateRangeValidation';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const CURRENT_YEAR = new Date().getFullYear();
// Match the same year bounds used for Date of Birth in Personal Information.
const EDU_MIN_YEAR = CURRENT_YEAR - 100;
const EDU_MAX_YEAR = CURRENT_YEAR;

type Row = EducationEntry & { rowId: string };

// Ensure all fields have sensible defaults when loading old profile data that
// may predate the isCurrent field.
function initRow(raw: EducationEntry): Row {
  return {
    ...raw,
    rowId: crypto.randomUUID(),
    isCurrent: raw.isCurrent ?? false,
    endDate: raw.endDate ?? '',
    grade: raw.grade ?? '',
    description: raw.description ?? '',
  };
}

const emptyRow = (): Row => ({
  rowId: crypto.randomUUID(),
  institution: '',
  degree: '',
  fieldOfStudy: '',
  startDate: '',
  isCurrent: false,
  endDate: '',
  grade: '',
  description: '',
});

const entrySummary = (row: Row, idx: number) =>
  row.institution && row.degree ? `${row.institution}: ${row.degree}` : `Entry ${idx + 1}`;

export function EducationSection({ profile, onSave }: Props) {
  const [entries, setEntries] = useState<Row[]>(() =>
    profile.education?.length ? profile.education.map(initRow) : [emptyRow()],
  );
  const [partialDates, setPartialDates] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const [newEntryTick, setNewEntryTick] = useState(0);
  const entriesContainerRef = useRef<HTMLDivElement>(null);
  useScrollToNewEntry(entriesContainerRef, newEntryTick);

  // Shared by handleEntryBlur, update, and validate() — the one check each
  // required text field needs, regardless of when it fires.
  const textFieldError = (
    key: 'institution' | 'degree' | 'fieldOfStudy',
    value: string,
  ): string => {
    if (key === 'institution' && !value.trim()) return 'Institution is required';
    if (key === 'degree' && !value.trim()) return 'Degree is required';
    if (key === 'fieldOfStudy' && !value.trim()) return 'Field of study is required';
    const limit = profileTextLimit(`education.$.${key}`);
    if (value.length > limit) return `Use ${limit} characters or fewer`;
    return '';
  };

  const handleEntryBlur = (idx: number, key: 'institution' | 'degree' | 'fieldOfStudy') => {
    const ek = `${idx}.${key}`;
    setErrors((e) => ({ ...e, [ek]: textFieldError(key, String(entries[idx][key])) }));
  };

  // Education dates accept either YYYY or YYYY-MM (allowYearOnlyEnd) — unlike
  // WorkHistorySection, which requires a month for both start and end.
  const { handleYearChange, handleDateBlur } = useDateRangeValidation(entries, setErrors, {
    minYear: EDU_MIN_YEAR,
    maxYear: EDU_MAX_YEAR,
    allowYearOnlyEnd: true,
    allowFutureEnd: true,
  });

  const update = (idx: number, key: keyof Row, value: string | boolean) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    let err = '';
    if (key === 'institution' || key === 'degree' || key === 'fieldOfStudy')
      err = textFieldError(key, String(value));
    else if (key === 'startDate') {
      if (!String(value).trim()) err = 'Start date is required';
      else {
        const y = parseInt((value as string).split('-')[0] ?? '', 10);
        if (!isNaN(y) && (y > EDU_MAX_YEAR || y < EDU_MIN_YEAR))
          err = `Year must be between ${EDU_MIN_YEAR} and ${EDU_MAX_YEAR}`;
      }
    } else if (key === 'endDate' && typeof value === 'string' && value) {
      const y = parseInt(value.split('-')[0] ?? '', 10);
      const maxEnd = entries[idx].isCurrent ? EDU_MAX_YEAR + 10 : EDU_MAX_YEAR;
      if (!isNaN(y) && (y > maxEnd || y < EDU_MIN_YEAR))
        err = `Year must be between ${EDU_MIN_YEAR} and ${maxEnd}`;
    } else if (key === 'isCurrent' && value === true) {
      setErrors((e) => ({ ...e, [`${idx}.endDate`]: '' }));
    }
    setErrors((e) => ({ ...e, [ek]: err }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (entries.length === 0) e.general = 'At least one education entry is required';
    entries.forEach((row, idx) => {
      for (const key of ['institution', 'degree', 'fieldOfStudy'] as const) {
        const err = textFieldError(key, row[key]);
        if (err) e[`${idx}.${key}`] = err;
      }
      for (const [key, error] of Object.entries(profileDateRangeErrors(row, true)))
        e[`${idx}.${key}`] = error;
      for (const key of ['startDate', 'endDate'])
        if (partialDates[`${row.rowId}.${key}`])
          e[`${idx}.${key}`] = 'Complete the year, or leave the optional date blank';
      if ((row.grade?.length ?? 0) > profileTextLimit('education.$.grade'))
        e[`${idx}.grade`] = `Use ${profileTextLimit('education.$.grade')} characters or fewer`;
      if ((row.description?.length ?? 0) > profileTextLimit('education.$.description'))
        e[`${idx}.description`] =
          `Use ${profileTextLimit('education.$.description')} characters or fewer`;
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
        education: entries.map((r) => ({
          institution: r.institution.trim(),
          degree: r.degree.trim(),
          fieldOfStudy: r.fieldOfStudy.trim(),
          startDate: r.startDate,
          isCurrent: r.isCurrent,
          endDate: r.endDate || undefined,
          // Optional details are editable and round-trip with JSON imports.
          grade: r.grade || undefined,
          description: r.description || undefined,
        })),
      },
      showToast,
      'Education saved',
    );
    setSaving(false);
  };

  return (
    <div>
      <SectionHeader sectionId="education" />

      <EntryListHeader
        id="add-education"
        onAdd={() => {
          const row = emptyRow();
          setEntries((rows) => [...rows, row]);
          setNewEntryTick((t) => t + 1);
        }}
        label="+ Add Education"
      />

      {errors.general && (
        <p className="text-sm text-red-700 dark:text-red-400 mb-4 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">
          {errors.general}
        </p>
      )}

      <div ref={entriesContainerRef}>
        {entries.map((row, idx) => (
          <ExpandableCard
            id={`entry-education-${idx}`}
            key={row.rowId}
            summary={entrySummary(row, idx)}
            subtitle={row.fieldOfStudy || undefined}
            onDelete={() => setEntries((rows) => rows.filter((_, i) => i !== idx))}
            defaultExpanded={!row.institution}
            invalid={Object.entries(errors).some(
              ([key, value]) => key.startsWith(`${idx}.`) && !!value,
            )}
          >
            <ProfileFields
              index={idx}
              scope="education"
              renderers={{
                institution: (field) => (
                  <FormField
                    label={field.label}
                    required={field.required}
                    error={errors[`${idx}.institution`]}
                  >
                    <input
                      className={cls(errors[`${idx}.institution`])}
                      id={field.inputId}
                      value={row.institution}
                      onChange={(e) => update(idx, 'institution', e.target.value)}
                      onBlur={() => handleEntryBlur(idx, 'institution')}
                      placeholder="University of California, Berkeley"
                      maxLength={field.maxLength}
                    />
                  </FormField>
                ),
                degree: (field) => (
                  <FormField
                    label={field.label}
                    required={field.required}
                    error={errors[`${idx}.degree`]}
                  >
                    <input
                      className={cls(errors[`${idx}.degree`])}
                      id={field.inputId}
                      value={row.degree}
                      onChange={(e) => update(idx, 'degree', e.target.value)}
                      onBlur={() => handleEntryBlur(idx, 'degree')}
                      placeholder="Bachelor of Science"
                      maxLength={field.maxLength}
                    />
                  </FormField>
                ),
                fieldOfStudy: (field) => (
                  <FormField
                    label={field.label}
                    required={field.required}
                    error={errors[`${idx}.fieldOfStudy`]}
                  >
                    <input
                      className={cls(errors[`${idx}.fieldOfStudy`])}
                      id={field.inputId}
                      value={row.fieldOfStudy}
                      onChange={(e) => update(idx, 'fieldOfStudy', e.target.value)}
                      onBlur={() => handleEntryBlur(idx, 'fieldOfStudy')}
                      placeholder="Computer Science"
                      maxLength={field.maxLength}
                    />
                  </FormField>
                ),
                startDate: (field) => (
                  <FormField
                    label={field.label}
                    required={field.required}
                    error={errors[`${idx}.startDate`]}
                  >
                    <MonthYearPicker
                      id={field.inputId}
                      onPartialChange={(partial) =>
                        setPartialDates((previous) => ({
                          ...previous,
                          [`${row.rowId}.startDate`]: partial,
                        }))
                      }
                      value={row.startDate}
                      onChange={(v) => update(idx, 'startDate', v)}
                      onYearChange={(y) => handleYearChange(idx, 'startDate', y)}
                      onBlur={(m, y) => handleDateBlur(idx, 'startDate', m, y)}
                      error={errors[`${idx}.startDate`]}
                      monthOptional
                    />
                  </FormField>
                ),
                endDate: (field) => (
                  <FormField
                    label={row.isCurrent ? (field.activeLabel ?? field.label) : field.label}
                    required={!row.isCurrent}
                    error={errors[`${idx}.endDate`]}
                  >
                    <MonthYearPicker
                      id={field.inputId}
                      onPartialChange={(partial) =>
                        setPartialDates((previous) => ({
                          ...previous,
                          [`${row.rowId}.endDate`]: partial,
                        }))
                      }
                      value={row.endDate ?? ''}
                      onChange={(v) => update(idx, 'endDate', v)}
                      onYearChange={(y) => handleYearChange(idx, 'endDate', y)}
                      onBlur={(m, y) => handleDateBlur(idx, 'endDate', m, y)}
                      error={errors[`${idx}.endDate`]}
                      monthOptional
                    />
                  </FormField>
                ),
                isCurrent: (field) => (
                  <label className="flex items-center gap-2 mb-4 cursor-pointer">
                    <input
                      id={field.inputId}
                      type="checkbox"
                      checked={row.isCurrent}
                      onChange={(e) => update(idx, 'isCurrent', e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{field.label}</span>
                  </label>
                ),
                grade: (field) => (
                  <FormField
                    label={field.label}
                    required={field.required}
                    error={errors[`${idx}.grade`]}
                  >
                    <input
                      id={field.inputId}
                      className={cls()}
                      value={row.grade ?? ''}
                      onChange={(e) => update(idx, 'grade', e.target.value)}
                      maxLength={field.maxLength}
                      placeholder="3.8 / 4.0"
                    />
                  </FormField>
                ),
                description: (field) => (
                  <FormField
                    label={field.label}
                    required={field.required}
                    error={errors[`${idx}.description`]}
                  >
                    <textarea
                      id={field.inputId}
                      className={`${cls()} min-h-24`}
                      value={row.description ?? ''}
                      onChange={(e) => update(idx, 'description', e.target.value)}
                      maxLength={field.maxLength}
                      placeholder="Honors, thesis, relevant coursework…"
                    />
                  </FormField>
                ),
              }}
            />
          </ExpandableCard>
        ))}
      </div>
      {/* entriesContainerRef */}

      <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <SaveButton onClick={handleSave} saving={saving} label="Save Education" />
      </div>
    </div>
  );
}
