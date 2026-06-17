import { useState } from 'react';
import type { Profile, EducationEntry } from '@/src/types/profile';
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

type Row = EducationEntry;

const emptyRow = (): Row => ({
  institution: '',
  degree: '',
  fieldOfStudy: '',
  startDate: '',
  endDate: '',
  grade: '',
  description: '',
});

const summary = (row: Row) =>
  row.institution && row.degree
    ? `${row.institution} — ${row.degree}`
    : 'New Entry';

export function EducationSection({ profile, onSave }: Props) {
  const [entries, setEntries] = useState<Row[]>(
    profile.education?.length ? profile.education : [emptyRow()],
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
    if (entries.length === 0) e.general = 'At least one education entry is required';
    entries.forEach((row, idx) => {
      if (!row.institution.trim()) e[`${idx}.institution`] = 'Institution is required';
      if (!row.degree.trim()) e[`${idx}.degree`] = 'Degree is required';
      if (!row.fieldOfStudy.trim()) e[`${idx}.fieldOfStudy`] = 'Field of study is required';
      if (!row.startDate.trim()) e[`${idx}.startDate`] = 'Start date is required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      education: entries.map((r) => ({
        institution: r.institution.trim(),
        degree: r.degree.trim(),
        fieldOfStudy: r.fieldOfStudy.trim(),
        startDate: r.startDate,
        endDate: r.endDate || undefined,
        grade: r.grade || undefined,
        description: r.description || undefined,
      })),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Education</h2>
        <p className="text-sm text-gray-500 mt-1">Your academic qualifications</p>
      </div>

      {errors.general && (
        <p className="text-sm text-red-500 mb-4 p-3 bg-red-50 rounded-lg">{errors.general}</p>
      )}

      {entries.map((row, idx) => (
        <ExpandableCard
          key={idx}
          summary={summary(row)}
          subtitle={row.fieldOfStudy || undefined}
          onDelete={() => setEntries((rows) => rows.filter((_, i) => i !== idx))}
          defaultExpanded={!row.institution}
        >
          <FormField label="Institution" required error={errors[`${idx}.institution`]}>
            <input
              className={cls(errors[`${idx}.institution`])}
              value={row.institution}
              onChange={(e) => update(idx, 'institution', e.target.value)}
              placeholder="Massachusetts Institute of Technology"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Degree" required error={errors[`${idx}.degree`]}>
              <input
                className={cls(errors[`${idx}.degree`])}
                value={row.degree}
                onChange={(e) => update(idx, 'degree', e.target.value)}
                placeholder="Bachelor of Science"
              />
            </FormField>
            <FormField label="Field of Study" required error={errors[`${idx}.fieldOfStudy`]}>
              <input
                className={cls(errors[`${idx}.fieldOfStudy`])}
                value={row.fieldOfStudy}
                onChange={(e) => update(idx, 'fieldOfStudy', e.target.value)}
                placeholder="Computer Science"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Start Date" required error={errors[`${idx}.startDate`]}>
              <input
                type="month"
                className={cls(errors[`${idx}.startDate`])}
                value={row.startDate}
                onChange={(e) => update(idx, 'startDate', e.target.value)}
              />
            </FormField>
            <FormField label="End Date">
              <input
                type="month"
                className={cls()}
                value={row.endDate ?? ''}
                onChange={(e) => update(idx, 'endDate', e.target.value)}
              />
            </FormField>
            <FormField label="Grade / GPA">
              <input
                className={cls()}
                value={row.grade ?? ''}
                onChange={(e) => update(idx, 'grade', e.target.value)}
                placeholder="3.8 / 4.0"
              />
            </FormField>
          </div>

          <FormField label="Description">
            <textarea
              className={`${cls()} min-h-[80px] resize-y`}
              value={row.description ?? ''}
              onChange={(e) => update(idx, 'description', e.target.value)}
              placeholder="Relevant coursework, thesis, honours..."
            />
          </FormField>
        </ExpandableCard>
      ))}

      <button
        type="button"
        onClick={() => setEntries((rows) => [...rows, emptyRow()])}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 text-sm text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors mb-4"
      >
        + Add Education
      </button>

      <div className="mt-2 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Education'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
