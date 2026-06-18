import { useState } from 'react';
import type { Profile, WorkHistoryEntry, NoticePeriodUnit } from '@/src/types/profile';
import { calculateExperience } from '@/src/utils/experience';
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

const NOTICE_MAX: Record<NoticePeriodUnit, number> = {
  day: 365,
  week: 52,
  month: 24,
};

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
  // ── Work entries ────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<Row[]>(
    profile.workHistory?.length ? profile.workHistory : [emptyRow()],
  );

  // ── Career summary (from profile.professional.summary) ──────────────────────
  const [summary, setSummary] = useState(profile.professional?.summary ?? '');

  // ── Notice period (from profile.professional.noticePeriod) ──────────────────
  const np = profile.professional?.noticePeriod;
  const [noticeImmediate, setNoticeImmediate] = useState(np?.immediate ?? true);
  const [noticeValue, setNoticeValue] = useState(np?.value?.toString() ?? '');
  const [noticeUnit, setNoticeUnit] = useState<NoticePeriodUnit>(np?.unit ?? 'week');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Live experience calculation from local (potentially unsaved) entries
  const experience = calculateExperience(entries);

  const updateEntry = (idx: number, key: keyof Row, value: string | boolean) => {
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

    if (!noticeImmediate) {
      const val = Number(noticeValue);
      const max = NOTICE_MAX[noticeUnit];
      if (!noticeValue.trim() || isNaN(val)) {
        e.noticeValue = 'Enter a duration';
      } else if (val < 1) {
        e.noticeValue = 'Must be at least 1';
      } else if (val > max) {
        e.noticeValue = `Maximum is ${max} ${noticeUnit}${max !== 1 ? 's' : ''}`;
      }
    }

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
      professional: {
        summary: summary.trim() || undefined,
        noticePeriod: {
          immediate: noticeImmediate,
          value: noticeImmediate ? undefined : Number(noticeValue),
          unit: noticeImmediate ? undefined : noticeUnit,
        },
      },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Work History</h2>
        <p className="text-sm text-gray-500 mt-1">Your experience, career summary, and availability</p>
      </div>

      {/* ── Career Summary ──────────────────────────────────────────────────── */}
      <FormField label="Career Summary">
        <textarea
          className={`${cls()} min-h-[100px] resize-y`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="A brief overview of your background and key strengths..."
          maxLength={2000}
        />
      </FormField>

      {/* ── Work Entries ────────────────────────────────────────────────────── */}
      <p className="text-sm font-medium text-gray-700 mb-3 mt-2">Work Experience</p>

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
                onChange={(e) => updateEntry(idx, 'company', e.target.value)}
                placeholder="Acme Corp"
              />
            </FormField>
            <FormField label="Job Title" required error={errors[`${idx}.title`]}>
              <input
                className={cls(errors[`${idx}.title`])}
                value={row.title}
                onChange={(e) => updateEntry(idx, 'title', e.target.value)}
                placeholder="Software Engineer"
              />
            </FormField>
          </div>

          <FormField label="Location">
            <input
              className={cls()}
              value={row.location ?? ''}
              onChange={(e) => updateEntry(idx, 'location', e.target.value)}
              placeholder="San Francisco, CA"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required error={errors[`${idx}.startDate`]}>
              <MonthYearPicker
                value={row.startDate}
                onChange={(v) => updateEntry(idx, 'startDate', v)}
                error={errors[`${idx}.startDate`]}
              />
            </FormField>
            <FormField label="End Date" error={errors[`${idx}.endDate`]}>
              <MonthYearPicker
                value={row.endDate ?? ''}
                onChange={(v) => updateEntry(idx, 'endDate', v)}
                error={errors[`${idx}.endDate`]}
                disabled={row.isCurrent}
              />
            </FormField>
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={row.isCurrent}
              onChange={(e) => updateEntry(idx, 'isCurrent', e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">This is my current role</span>
          </label>

          <FormField label="Description">
            <textarea
              className={`${cls()} min-h-[100px] resize-y`}
              value={row.description ?? ''}
              onChange={(e) => updateEntry(idx, 'description', e.target.value)}
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

      {/* Total experience — updates live as the user edits dates */}
      {experience.totalMonths > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg mb-6 text-sm">
          <span className="text-gray-600">Total Experience</span>
          <span className="font-semibold text-blue-700">{experience.label}</span>
        </div>
      )}

      {/* ── Notice Period ────────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-gray-200 mb-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Notice Period</p>
        <div className="flex gap-4 mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="notice"
              checked={noticeImmediate}
              onChange={() => setNoticeImmediate(true)}
              className="text-blue-600"
            />
            <span className="text-sm text-gray-700">Available Now</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="notice"
              checked={!noticeImmediate}
              onChange={() => setNoticeImmediate(false)}
              className="text-blue-600"
            />
            <span className="text-sm text-gray-700">Available Later</span>
          </label>
        </div>

        {!noticeImmediate && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-600 shrink-0">Available after</span>
            <div className="w-20">
              <input
                type="number"
                min={1}
                max={NOTICE_MAX[noticeUnit]}
                className={cls(errors.noticeValue)}
                value={noticeValue}
                onChange={(e) => {
                  setNoticeValue(e.target.value);
                  if (errors.noticeValue) setErrors((err) => ({ ...err, noticeValue: '' }));
                }}
                placeholder="3"
              />
            </div>
            <div className="w-28">
              <select
                className={cls()}
                value={noticeUnit}
                onChange={(e) => {
                  setNoticeUnit(e.target.value as NoticePeriodUnit);
                  setErrors((err) => ({ ...err, noticeValue: '' }));
                }}
              >
                <option value="day">days</option>
                <option value="week">weeks</option>
                <option value="month">months</option>
              </select>
            </div>
            {errors.noticeValue && (
              <span className="text-xs text-red-500">{errors.noticeValue}</span>
            )}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-gray-200 flex items-center gap-3">
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
