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
    ? 'w-full px-3 py-2 border border-red-300 dark:border-red-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

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

  const handleEntryBlur = (idx: number, key: 'institution' | 'degree' | 'fieldOfStudy') => {
    const value = String(entries[idx][key]);
    const ek = `${idx}.${key}`;
    let err = '';
    if (key === 'institution' && !value.trim()) err = 'Institution is required';
    else if (key === 'degree' && !value.trim()) err = 'Degree is required';
    else if (key === 'fieldOfStudy' && !value.trim()) err = 'Field of study is required';
    setErrors((e) => ({ ...e, [ek]: err }));
  };

  // Year-only validation (fires on every year keystroke via onYearChange).
  const handleYearChange = (idx: number, key: 'startDate' | 'endDate', year: string) => {
    const ek = `${idx}.${key}`;
    if (year.length < 4) {
      setErrors((e) => {
        const cur = e[ek] ?? '';
        return cur.startsWith('Year must be') ? { ...e, [ek]: '' } : e;
      });
      return;
    }
    const y = parseInt(year, 10);
    if (isNaN(y)) return;
    const err = y > EDU_MAX_YEAR || y < EDU_MIN_YEAR
      ? `Year must be between ${EDU_MIN_YEAR} and ${EDU_MAX_YEAR}`
      : '';
    setErrors((e) => ({ ...e, [ek]: err }));
  };

  // Blur handler for the full month+year group.
  // Validation order: required (both empty) → year range (year present).
  const handleDateBlur = (idx: number, key: 'startDate' | 'endDate', month: string, year: string) => {
    const ek = `${idx}.${key}`;
    const isRequired = key === 'startDate' || !entries[idx].isCurrent;

    if (!month && !year.trim()) {
      setErrors((e) => ({
        ...e,
        [ek]: isRequired
          ? (key === 'startDate' ? 'Start date is required' : 'End date is required')
          : '',
      }));
      return;
    }

    if (year.length === 4) {
      const y = parseInt(year, 10);
      if (!isNaN(y) && (y > EDU_MAX_YEAR || y < EDU_MIN_YEAR)) {
        setErrors((e) => ({ ...e, [ek]: `Year must be between ${EDU_MIN_YEAR} and ${EDU_MAX_YEAR}` }));
        return;
      }
      // End date before start date (only when endDate has a complete month+year)
      if (key === 'endDate' && month) {
        const startDate = entries[idx].startDate;
        if (startDate && `${year}-${month}` < startDate) {
          setErrors((e) => ({ ...e, [ek]: 'End date cannot be before start date' }));
          return;
        }
      }
      setErrors((e) => {
        const cur = e[ek] ?? '';
        return (cur === 'Start date is required' || cur === 'End date is required')
          ? { ...e, [ek]: '' }
          : e;
      });
      return;
    }

    // Partial / in-progress — clear stale required errors only
    setErrors((e) => {
      const cur = e[ek] ?? '';
      return (cur === 'Start date is required' || cur === 'End date is required')
        ? { ...e, [ek]: '' }
        : e;
    });
  };

  const update = (idx: number, key: keyof Row, value: string | boolean) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    let err = '';
    if (key === 'institution' && !String(value).trim()) err = 'Institution is required';
    else if (key === 'degree' && !String(value).trim()) err = 'Degree is required';
    else if (key === 'fieldOfStudy' && !String(value).trim()) err = 'Field of study is required';
    else if (key === 'startDate') {
      if (!String(value).trim()) err = 'Start date is required';
      else {
        const y = parseInt((value as string).split('-')[0] ?? '', 10);
        if (!isNaN(y) && (y > EDU_MAX_YEAR || y < EDU_MIN_YEAR))
          err = `Year must be between ${EDU_MIN_YEAR} and ${EDU_MAX_YEAR}`;
      }
    } else if (key === 'endDate' && typeof value === 'string' && value) {
      const y = parseInt(value.split('-')[0] ?? '', 10);
      if (!isNaN(y) && (y > EDU_MAX_YEAR || y < EDU_MIN_YEAR))
        err = `Year must be between ${EDU_MIN_YEAR} and ${EDU_MAX_YEAR}`;
    } else if (key === 'isCurrent' && value === true) {
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
      if (!row.startDate.trim()) {
        e[`${idx}.startDate`] = 'Start date is required';
      } else {
        const sy = parseInt(row.startDate.split('-')[0] ?? '', 10);
        if (sy > EDU_MAX_YEAR || sy < EDU_MIN_YEAR)
          e[`${idx}.startDate`] = `Year must be between ${EDU_MIN_YEAR} and ${EDU_MAX_YEAR}`;
      }
      if (!row.isCurrent) {
        if (!row.endDate?.trim()) {
          e[`${idx}.endDate`] = 'End date is required';
        } else {
          const ey = parseInt(row.endDate.split('-')[0] ?? '', 10);
          if (ey > EDU_MAX_YEAR || ey < EDU_MIN_YEAR)
            e[`${idx}.endDate`] = `Year must be between ${EDU_MIN_YEAR} and ${EDU_MAX_YEAR}`;
          else if (row.startDate.trim() && row.endDate < row.startDate)
            e[`${idx}.endDate`] = 'End date cannot be before start date';
        }
      }
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
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Education</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your academic qualifications</p>
      </div>

      {errors.general && (
        <p className="text-sm text-red-500 dark:text-red-400 mb-4 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">{errors.general}</p>
      )}

      <div ref={entriesContainerRef}>
      {entries.map((row, idx) => (
        <ExpandableCard
          key={idx}
          summary={entrySummary(row, idx)}
          subtitle={row.fieldOfStudy || undefined}
          onDelete={() => setEntries((rows) => rows.filter((_, i) => i !== idx))}
          defaultExpanded={!row.institution}
        >
          <FormField label="Institution" required error={errors[`${idx}.institution`]}>
            <input
              className={cls(errors[`${idx}.institution`])}
              value={row.institution}
              onChange={(e) => update(idx, 'institution', e.target.value)}
              onBlur={() => handleEntryBlur(idx, 'institution')}
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
                onBlur={() => handleEntryBlur(idx, 'degree')}
                placeholder="Bachelor of Science"
                maxLength={150}
              />
            </FormField>
            <FormField label="Field of Study" required error={errors[`${idx}.fieldOfStudy`]}>
              <input
                className={cls(errors[`${idx}.fieldOfStudy`])}
                value={row.fieldOfStudy}
                onChange={(e) => update(idx, 'fieldOfStudy', e.target.value)}
                onBlur={() => handleEntryBlur(idx, 'fieldOfStudy')}
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
                onYearChange={(y) => handleYearChange(idx, 'startDate', y)}
                onBlur={(m, y) => handleDateBlur(idx, 'startDate', m, y)}
                error={errors[`${idx}.startDate`]}
              />
            </FormField>
            <FormField label="End Date" required={!row.isCurrent} error={errors[`${idx}.endDate`]}>
              <MonthYearPicker
                value={row.endDate ?? ''}
                onChange={(v) => update(idx, 'endDate', v)}
                onYearChange={(y) => handleYearChange(idx, 'endDate', y)}
                onBlur={(m, y) => handleDateBlur(idx, 'endDate', m, y)}
                error={errors[`${idx}.endDate`]}
                disabled={row.isCurrent}
              />
            </FormField>
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={row.isCurrent ?? false}
              onChange={(e) => update(idx, 'isCurrent', e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400"
            />
            <span className="text-sm text-gray-700">Currently active</span>
          </label>
        </ExpandableCard>
      ))}
      </div>{/* entriesContainerRef */}

      <button
        type="button"
        onClick={() => { setEntries((rows) => [...rows, emptyRow()]); setNewEntryTick((t) => t + 1); }}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 active:scale-95 transition-colors mb-4"
      >
        + Add Education
      </button>

      <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Education'}
        </button>
      </div>
    </div>
  );
}
