import { useState } from 'react';
import type { Profile, WorkHistoryEntry } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { ExpandableCard } from './shared/ExpandableCard';
import { MonthYearPicker } from './shared/MonthYearPicker';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

type Row = WorkHistoryEntry;

const emptyRow = (): Row => ({
  company: '',
  title: '',
  startDate: '',
  isCurrent: false,
  endDate: '',
  location: '',
  description: '',
});

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatMonthYear(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m] = dateStr.split('-');
  if (!y || !m) return dateStr;
  const abbr = MONTH_ABBR[parseInt(m, 10) - 1] ?? m;
  return `${abbr} ${y}`;
}

const cardSummary = (row: Row) =>
  row.company && row.title
    ? `${row.company} — ${row.title}${row.isCurrent ? ' (Current)' : ''}`
    : 'New Entry';

const cardSubtitle = (row: Row): string | undefined => {
  if (!row.startDate) return undefined;
  const end = row.isCurrent ? 'Present' : (row.endDate ? formatMonthYear(row.endDate) : '');
  return `${formatMonthYear(row.startDate)} – ${end}`;
};

export function WorkHistorySection({ profile, onSave }: Props) {
  const [entries, setEntries] = useState<Row[]>(
    profile.workHistory?.length ? profile.workHistory : [emptyRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (idx: number, key: keyof Row, value: string | boolean) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    if (errors[ek]) setErrors((e) => ({ ...e, [ek]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (entries.length === 0) e.general = 'At least one work history entry is required';
    entries.forEach((row, idx) => {
      if (!row.company.trim()) e[`${idx}.company`] = 'Company name is required';
      if (!row.title.trim()) e[`${idx}.title`] = 'Job title is required';
      if (!row.startDate.trim()) e[`${idx}.startDate`] = 'Start date is required';
      if (!row.isCurrent && !row.endDate?.trim()) e[`${idx}.endDate`] = 'End date is required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      workHistory: entries.map((r) => ({
        company: r.company.trim(),
        title: r.title.trim(),
        startDate: r.startDate,
        isCurrent: r.isCurrent,
        endDate: r.isCurrent ? undefined : r.endDate || undefined,
        location: r.location || undefined,
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
        <h2 className="text-xl font-semibold text-gray-900">Work History</h2>
        <p className="text-sm text-gray-500 mt-1">Your professional experience</p>
      </div>

      {errors.general && (
        <p className="text-sm text-red-500 mb-4 p-3 bg-red-50 rounded-lg">{errors.general}</p>
      )}

      {entries.map((row, idx) => (
        <ExpandableCard
          key={idx}
          summary={cardSummary(row)}
          subtitle={cardSubtitle(row)}
          onDelete={() => setEntries((rows) => rows.filter((_, i) => i !== idx))}
          defaultExpanded={!row.company}
        >
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Company" required error={errors[`${idx}.company`]}>
              <input
                className={cls(errors[`${idx}.company`])}
                value={row.company}
                onChange={(e) => update(idx, 'company', e.target.value)}
                placeholder="Acme Corp"
              />
            </FormField>
            <FormField label="Job Title" required error={errors[`${idx}.title`]}>
              <input
                className={cls(errors[`${idx}.title`])}
                value={row.title}
                onChange={(e) => update(idx, 'title', e.target.value)}
                placeholder="Software Engineer"
              />
            </FormField>
          </div>

          <FormField label="Location">
            <input
              className={cls()}
              value={row.location ?? ''}
              onChange={(e) => update(idx, 'location', e.target.value)}
              placeholder="San Francisco, CA"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required error={errors[`${idx}.startDate`]}>
              <MonthYearPicker
                value={row.startDate}
                onChange={(v) => update(idx, 'startDate', v)}
                error={errors[`${idx}.startDate`]}
              />
            </FormField>
            <FormField label="End Date" error={errors[`${idx}.endDate`]}>
              <MonthYearPicker
                value={row.endDate ?? ''}
                onChange={(v) => update(idx, 'endDate', v)}
                error={errors[`${idx}.endDate`]}
                disabled={row.isCurrent}
              />
            </FormField>
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={row.isCurrent}
              onChange={(e) => update(idx, 'isCurrent', e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">This is my current role</span>
          </label>

          <FormField label="Description">
            <textarea
              className={`${cls()} min-h-[100px] resize-y`}
              value={row.description ?? ''}
              onChange={(e) => update(idx, 'description', e.target.value)}
              placeholder="Key responsibilities and achievements..."
            />
          </FormField>
        </ExpandableCard>
      ))}

      <button
        type="button"
        onClick={() => setEntries((rows) => [...rows, emptyRow()])}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 text-sm text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors mb-4"
      >
        + Add Work Experience
      </button>

      <div className="mt-2 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Work History'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
