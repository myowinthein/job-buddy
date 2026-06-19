import { useToast } from '@/src/components/ui/Toast';
import { useState, useRef, useEffect } from 'react';
import type { Profile, EducationEntry } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { ExpandableCard } from './shared/ExpandableCard';
import { MonthYearPicker } from './shared/MonthYearPicker';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const CURRENT_YEAR = new Date().getFullYear();
// Match the same year bounds used for Date of Birth in Personal Information.
const EDU_MIN_YEAR = CURRENT_YEAR - 100;
const EDU_MAX_YEAR = CURRENT_YEAR;

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

type Row = EducationEntry;

// Ensure all fields have sensible defaults when loading old profile data that
// may predate the isCurrent field.
function initRow(raw: EducationEntry): Row {
  return {
    ...raw,
    isCurrent: raw.isCurrent ?? false,
    endDate: raw.endDate ?? '',
    grade: raw.grade ?? '',
    description: raw.description ?? '',
  };
}

const emptyRow = (): Row => ({
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
  row.institution && row.degree
    ? `${row.institution} — ${row.degree}`
    : `Entry ${idx + 1}`;

export function EducationSection({ profile, onSave }: Props) {
  const [entries, setEntries] = useState<Row[]>(
    profile.education?.length ? profile.education.map(initRow) : [emptyRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const [newEntryTick, setNewEntryTick] = useState(0);
  const entriesContainerRef = useRef<HTMLDivElement>(null);
  const dropCreatedRef = useRef(new Set<number>());

  // Listen for structured-drop events when the education section is active.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{
        section: string;
        parsedData: Record<string, string>;
        rawText: string;
      }>;
      if (ce.detail.section !== 'education') return;
      const { parsedData } = ce.detail;
      const newEntry: Row = {
        ...emptyRow(),
        institution: parsedData.institution ?? '',
        degree: parsedData.degree ?? '',
        fieldOfStudy: parsedData.fieldOfStudy ?? '',
        startDate: parsedData.startDate ?? '',
        endDate: parsedData.endDate ?? '',
        isCurrent: false,
      };
      setEntries((prev) => {
        dropCreatedRef.current.add(prev.length);
        return [...prev, newEntry];
      });
      setNewEntryTick((t) => t + 1);
    };
    window.addEventListener('job-buddy-add-entry', handler);
    return () => window.removeEventListener('job-buddy-add-entry', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const update = (idx: number, key: keyof Row, value: string | boolean) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    let err = '';
    if (key === 'institution' && !String(value).trim()) err = 'Institution is required';
    else if (key === 'degree' && !String(value).trim()) err = 'Degree is required';
    else if (key === 'fieldOfStudy' && !String(value).trim()) err = 'Field of study is required';
    else if (key === 'startDate' && !String(value).trim()) err = 'Start date is required';
    else if (key === 'isCurrent' && value === true) {
      setErrors((e) => ({ ...e, [`${idx}.endDate`]: '' }));
    }
    setErrors((e) => ({ ...e, [ek]: err }));
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
        isCurrent: r.isCurrent,
        endDate: r.isCurrent ? undefined : r.endDate || undefined,
        // Preserve grade and description from storage; they are no longer editable
        // via the form but should not be silently deleted from existing profiles.
        grade: r.grade || undefined,
        description: r.description || undefined,
      })),
    }).then(() => showToast('success', 'Education saved'))
      .catch(() => showToast('error', 'Failed to save. Please try again.'));
    setSaving(false);
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

      <div ref={entriesContainerRef}>
      {entries.map((row, idx) => (
        <ExpandableCard
          key={idx}
          summary={entrySummary(row, idx)}
          subtitle={row.fieldOfStudy || undefined}
          onDelete={() => setEntries((rows) => rows.filter((_, i) => i !== idx))}
          defaultExpanded={!row.institution || dropCreatedRef.current.has(idx)}
        >
          <FormField label="Institution" required error={errors[`${idx}.institution`]}>
            <input
              className={cls(errors[`${idx}.institution`])}
              value={row.institution}
              onChange={(e) => update(idx, 'institution', e.target.value)}
              placeholder="University of California, Berkeley"
              maxLength={150}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Degree" required error={errors[`${idx}.degree`]}>
              <input
                className={cls(errors[`${idx}.degree`])}
                value={row.degree}
                onChange={(e) => update(idx, 'degree', e.target.value)}
                placeholder="Bachelor of Science"
                maxLength={150}
              />
            </FormField>
            <FormField label="Field of Study" required error={errors[`${idx}.fieldOfStudy`]}>
              <input
                className={cls(errors[`${idx}.fieldOfStudy`])}
                value={row.fieldOfStudy}
                onChange={(e) => update(idx, 'fieldOfStudy', e.target.value)}
                placeholder="Computer Science"
                maxLength={150}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required error={errors[`${idx}.startDate`]}>
              <MonthYearPicker
                value={row.startDate}
                onChange={(v) => update(idx, 'startDate', v)}
                error={errors[`${idx}.startDate`]}
                minYear={EDU_MIN_YEAR}
                maxYear={EDU_MAX_YEAR}
              />
            </FormField>
            <FormField label="End Date">
              <MonthYearPicker
                value={row.endDate ?? ''}
                onChange={(v) => update(idx, 'endDate', v)}
                disabled={row.isCurrent}
                minYear={EDU_MIN_YEAR}
                maxYear={EDU_MAX_YEAR}
              />
            </FormField>
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={row.isCurrent ?? false}
              onChange={(e) => update(idx, 'isCurrent', e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Currently active</span>
          </label>
        </ExpandableCard>
      ))}
      </div>{/* entriesContainerRef */}

      <button
        type="button"
        onClick={() => { setEntries((rows) => [...rows, emptyRow()]); setNewEntryTick((t) => t + 1); }}
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
      </div>
    </div>
  );
}
