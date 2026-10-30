import { SectionHeader } from './shared/SectionHeader';
import {
  NOTICE_MAX,
  noticeDurationError as validateNoticePeriod,
  profileDateRangeErrors,
} from '@/src/utils/profileInputValidation';
import { useSectionDraft } from './shared/useSectionDraft';
import { useToast } from '@/src/components/ui/useToast';
import { useState, useRef, useMemo } from 'react';
import type {
  Profile,
  WorkHistoryEntry,
  WorkArrangement,
  WorkLocation,
  NoticePeriodUnit,
} from '@/src/types/profile';
import { calculateExperience } from '@/src/utils/experience';
import { FormField } from './shared/FormField';
import { ExpandableCard } from './shared/ExpandableCard';
import { MonthYearPicker } from './shared/MonthYearPicker';
import { SearchableCountryDropdown } from './shared/SearchableCountryDropdown';
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
const MIN_YEAR = CURRENT_YEAR - 100;

// Flat UI state for each work entry — location is split into country/city,
// arrangement is kept as a string to allow the empty placeholder state.
type LocalRow = {
  rowId: string;
  company: string;
  title: string;
  startDate: string;
  isCurrent: boolean;
  endDate: string;
  locationCountry: string;
  locationCity: string;
  arrangement: string; // WorkArrangement | ''
  description: string;
};

const emptyRow = (): LocalRow => ({
  rowId: crypto.randomUUID(),
  company: '',
  title: '',
  startDate: '',
  isCurrent: false,
  endDate: '',
  locationCountry: '',
  locationCity: '',
  arrangement: '',
  description: '',
});

// Back-compat: old entries stored location as a plain string ("San Francisco, CA").
// New entries store { countryCode?, city? }. Normalise both on load.
function initRow(raw: WorkHistoryEntry): LocalRow {
  const loc = raw.location as WorkLocation | string | undefined;
  let locationCountry = '';
  let locationCity = '';
  if (typeof loc === 'string') {
    locationCity = loc;
  } else if (loc && typeof loc === 'object') {
    locationCountry = loc.countryCode ?? '';
    locationCity = loc.city ?? '';
  }
  return {
    rowId: crypto.randomUUID(),
    company: raw.company,
    title: raw.title,
    startDate: raw.startDate,
    isCurrent: raw.isCurrent,
    endDate: raw.endDate ?? '',
    locationCountry,
    locationCity,
    arrangement: raw.arrangement ?? '',
    description: raw.description ?? '',
  };
}

const cardSummary = (row: LocalRow, idx: number) =>
  row.company && row.title
    ? `${row.company}: ${row.title}`
    : `Entry ${idx + 1}`;

export function WorkHistorySection({ profile, onSave }: Props) {
  // ── Work entries ────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<LocalRow[]>(() =>
    profile.workHistory?.length ? profile.workHistory.map(initRow) : [emptyRow()],
  );

  // ── Career summary ──────────────────────────────────────────────────────────
  const [partialDates, setPartialDates] = useState<Record<string, boolean>>({});
  const rowStarted = (row: LocalRow) =>
    !!(
      row.company.trim() ||
      row.title.trim() ||
      row.startDate ||
      row.endDate ||
      row.isCurrent ||
      row.locationCountry ||
      row.locationCity.trim() ||
      row.arrangement ||
      row.description.trim() ||
      partialDates[`${row.rowId}.startDate`] ||
      partialDates[`${row.rowId}.endDate`]
    );
  const [summary, setSummary] = useState(profile.professional?.summary ?? '');

  // ── Notice period ────────────────────────────────────────────────────────────
  const np = profile.professional?.noticePeriod;
  const [noticeImmediate, setNoticeImmediate] = useState<boolean | null>(
    typeof np?.immediate === 'boolean' ? np.immediate : null,
  );
  const [noticeValue, setNoticeValue] = useState(np?.value?.toString() ?? '');
  const [noticeUnit, setNoticeUnit] = useState<NoticePeriodUnit>(np?.unit ?? 'week');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  // Scroll to and focus the first input of a newly added work entry.
  const [newEntryTick, setNewEntryTick] = useState(0);
  const entriesContainerRef = useRef<HTMLDivElement>(null);
  useScrollToNewEntry(entriesContainerRef, newEntryTick);

  // Experience calculation reads only startDate / isCurrent / endDate — safe cast.
  // Memoized on just those fields (not the whole `entries` reference, which
  // changes on every keystroke including unrelated fields like company/title)
  // so editing an unrelated field doesn't re-run date-parsing on every entry.
  const experienceKey = entries.map((e) => `${e.startDate}|${e.isCurrent}|${e.endDate}`).join(',');
  const experience = useMemo(
    () => calculateExperience(entries as unknown as WorkHistoryEntry[]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on experienceKey, a derived summary of the fields that actually affect the result
    [experienceKey],
  );

  // Shared by handleEntryBlur, updateEntry, and validate() — the one check
  // each required text field needs, regardless of when it fires.
  const textFieldError = (key: 'company' | 'title', value: string): string => {
    if (key === 'company' && !value.trim()) return 'Company name is required';
    if (key === 'title' && !value.trim()) return 'Job title is required';
    if (value.length > 150) return 'Use 150 characters or fewer';
    return '';
  };

  // Blur handler for text inputs — validates the current stored value so
  // focusing then leaving a blank required field shows an error.
  const handleEntryBlur = (idx: number, key: 'company' | 'title') => {
    const ek = `${idx}.${key}`;
    setErrors((e) => ({ ...e, [ek]: textFieldError(key, String(entries[idx][key])) }));
  };

  // Work history dates require a month for both start and end (no
  // allowYearOnlyEnd) — unlike EducationSection, which accepts YYYY-only.
  const { handleYearChange, handleDateBlur } = useDateRangeValidation(entries, setErrors, {
    minYear: MIN_YEAR,
    maxYear: CURRENT_YEAR,
  });

  const updateEntry = (idx: number, key: keyof LocalRow, value: string | boolean) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    let err = '';
    if (key === 'company' || key === 'title') err = textFieldError(key, String(value));
    else if (key === 'isCurrent' && value === true) {
      // Marking as ongoing clears any existing end-date error
      setErrors((e) => ({ ...e, [`${idx}.endDate`]: '' }));
    } else if ((key === 'startDate' || key === 'endDate') && typeof value === 'string' && value) {
      const y = parseInt(value.split('-')[0] ?? '', 10);
      if (!isNaN(y) && (y > CURRENT_YEAR || y < MIN_YEAR))
        err = `Year must be between ${MIN_YEAR} and ${CURRENT_YEAR}`;
    }
    setErrors((e) => ({ ...e, [ek]: err }));
  };

  const validate = () => {
    const e: Record<string, string> = {};

    if (summary.length > 2000) e.summary = 'Use 2000 characters or fewer';
    entries.forEach((row, idx) => {
      if (!rowStarted(row)) return;
      for (const key of ['company', 'title'] as const) {
        const err = textFieldError(key, row[key]);
        if (err) e[`${idx}.${key}`] = err;
      }
      if (row.locationCity.length > 100) e[`${idx}.locationCity`] = 'Use 100 characters or fewer';
      if (row.description.length > 3000) e[`${idx}.description`] = 'Use 3000 characters or fewer';
      for (const [key, error] of Object.entries(profileDateRangeErrors(row)))
        e[`${idx}.${key}`] = error;
      for (const key of ['startDate', 'endDate'])
        if (partialDates[`${row.rowId}.${key}`] && !(key === 'endDate' && row.isCurrent))
          e[`${idx}.${key}`] = 'Complete the month and year';
    });

    if (noticeImmediate === null) {
      e.noticePeriod = 'Select your availability';
    } else if (noticeImmediate === false) {
      const noticeErr = validateNoticePeriod(noticeValue, noticeUnit);
      if (noticeErr) e.noticeValue = noticeErr;
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveDraft = useSectionDraft(
    { entries, summary, noticeImmediate, noticeValue, noticeUnit },
    onSave,
  );

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await saveSection(
      saveDraft,
      {
        workHistory: entries.filter(rowStarted).map((r) => ({
          company: r.company.trim(),
          title: r.title.trim(),
          startDate: r.startDate,
          isCurrent: r.isCurrent,
          endDate: r.isCurrent ? undefined : r.endDate || undefined,
          location:
            r.locationCountry || r.locationCity.trim()
              ? {
                  countryCode: r.locationCountry || undefined,
                  city: r.locationCity.trim() || undefined,
                }
              : undefined,
          arrangement: (r.arrangement as WorkArrangement) || undefined,
          description: r.description.trim() || undefined,
        })),
        professional: {
          summary: summary.trim() || undefined,
          noticePeriod:
            noticeImmediate === null
              ? undefined
              : {
                  immediate: noticeImmediate === true,
                  value: noticeImmediate ? undefined : Number(noticeValue),
                  unit: noticeImmediate ? undefined : noticeUnit,
                },
        },
      },
      showToast,
      'Work history saved',
    );
    setSaving(false);
  };

  return (
    <div>
      <SectionHeader sectionId="workHistory" />

      {/* ── Career Summary ──────────────────────────────────────────────────── */}
      <FormField error={errors.summary} label="Career Summary" hint={`${summary.length} / 2000`}>
        <textarea
          id="field-summary"
          className={`${cls()} min-h-[100px] resize-y`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="A brief overview of your background and key strengths..."
          maxLength={2000}
        />
      </FormField>

      {/* ── Work Entries ────────────────────────────────────────────────────── */}
      <EntryListHeader
        title="Experience"
        id="add-workHistory"
        onAdd={() => {
          const row = emptyRow();
          setEntries((rows) => [...rows, row]);
          setNewEntryTick((t) => t + 1);
        }}
        label="+ Add Entry"
      />

      {errors.general && (
        <p className="text-sm text-red-500 dark:text-red-400 mb-4 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">
          {errors.general}
        </p>
      )}

      <div ref={entriesContainerRef}>
        {entries.map((row, idx) => (
          <ExpandableCard
            id={`entry-workHistory-${idx}`}
            key={row.rowId}
            summary={cardSummary(row, idx)}
            badge={row.isCurrent ? (
              <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Current
              </span>
            ) : undefined}
            onDelete={() => setEntries((rows) => rows.filter((_, i) => i !== idx))}
            defaultExpanded={!row.company}
            invalid={Object.entries(errors).some(
              ([key, value]) => key.startsWith(`${idx}.`) && !!value,
            )}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Company" required error={errors[`${idx}.company`]}>
                <input
                  className={cls(errors[`${idx}.company`])}
                  id={`field-workHistory-${idx}-company`}
                  value={row.company}
                  onChange={(e) => updateEntry(idx, 'company', e.target.value)}
                  onBlur={() => handleEntryBlur(idx, 'company')}
                  placeholder="Acme Inc."
                  maxLength={150}
                />
              </FormField>
              <FormField label="Job Title" required error={errors[`${idx}.title`]}>
                <input
                  className={cls(errors[`${idx}.title`])}
                  id={`field-workHistory-${idx}-title`}
                  value={row.title}
                  onChange={(e) => updateEntry(idx, 'title', e.target.value)}
                  onBlur={() => handleEntryBlur(idx, 'title')}
                  placeholder="Senior Software Engineer"
                  maxLength={150}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Country">
                <SearchableCountryDropdown
                  id={`field-workHistory-${idx}-location`}
                  value={row.locationCountry}
                  onChange={(code) => updateEntry(idx, 'locationCountry', code)}
                />
              </FormField>
              <FormField label="City" error={errors[`${idx}.locationCity`]}>
                <input
                  className={cls()}
                  value={row.locationCity}
                  onChange={(e) => updateEntry(idx, 'locationCity', e.target.value)}
                  placeholder="San Francisco"
                  maxLength={100}
                />
              </FormField>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Work Arrangement
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {(['onsite', 'remote', 'hybrid'] as const).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      id={opt === 'onsite' ? `field-workHistory-${idx}-arrangement` : undefined}
                      name={`arrangement-${idx}`}
                      value={opt}
                      checked={row.arrangement === opt}
                      // A native radio only fires `change` when its checked
                      // state actually flips — e.g. arrow-key navigation to a
                      // different option in the group — so that alone is
                      // enough to pick up a new selection. But re-clicking the
                      // already-selected radio never flips its checked state,
                      // so no `change` fires for that gesture; `click` still
                      // fires regardless, which is what lets deselect-by-
                      // reclick work.
                      onChange={(e) => {
                        if (e.target.checked) updateEntry(idx, 'arrangement', opt);
                      }}
                      onClick={() => {
                        if (row.arrangement === opt) updateEntry(idx, 'arrangement', '');
                      }}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                      {opt}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Start Date" required error={errors[`${idx}.startDate`]}>
                <MonthYearPicker
                  id={`field-workHistory-${idx}-startDate`}
                  onPartialChange={(partial) =>
                    setPartialDates((previous) => ({
                      ...previous,
                      [`${row.rowId}.startDate`]: partial,
                    }))
                  }
                  value={row.startDate}
                  onChange={(v) => updateEntry(idx, 'startDate', v)}
                  onYearChange={(y) => handleYearChange(idx, 'startDate', y)}
                  onBlur={(m, y) => handleDateBlur(idx, 'startDate', m, y)}
                  error={errors[`${idx}.startDate`]}
                />
              </FormField>
              <FormField
                label="End Date"
                required={!row.isCurrent}
                error={errors[`${idx}.endDate`]}
              >
                <MonthYearPicker
                  id={`field-workHistory-${idx}-endDate`}
                  onPartialChange={(partial) =>
                    setPartialDates((previous) => ({
                      ...previous,
                      [`${row.rowId}.endDate`]: partial,
                    }))
                  }
                  value={row.endDate}
                  onChange={(v) => updateEntry(idx, 'endDate', v)}
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
                checked={row.isCurrent}
                onChange={(e) => updateEntry(idx, 'isCurrent', e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                I currently work here
              </span>
            </label>

            <FormField
              label="Description"
              error={errors[`${idx}.description`]}
              hint={`${row.description.length} / 3000`}
            >
              <textarea
                className={`${cls()} min-h-[100px] resize-y`}
                id={`field-workHistory-${idx}-description`}
                value={row.description}
                onChange={(e) => updateEntry(idx, 'description', e.target.value)}
                placeholder="Key responsibilities and achievements..."
                maxLength={3000}
              />
            </FormField>
          </ExpandableCard>
        ))}
      </div>
      {/* entriesContainerRef */}

      {/* Total experience — updates live as the user edits dates */}
      {experience.totalMonths > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-lg mb-6 text-sm">
          <span className="text-gray-600 dark:text-gray-300">Total Experience</span>
          <span className="font-semibold text-blue-700 dark:text-blue-300">{experience.label}</span>
        </div>
      )}

      {/* ── Notice Period ────────────────────────────────────────────────────── */}
      <div className="pt-4 mb-4" data-field-error={!!errors.noticePeriod}>
        <p id="notice-period-label" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Notice Period<span className="text-red-500 ml-0.5">*</span>
        </p>
        <div
          role="radiogroup"
          aria-labelledby="notice-period-label"
          aria-required="true"
          aria-invalid={!!errors.noticePeriod}
          aria-describedby={errors.noticePeriod ? 'notice-period-error' : undefined}
          className="flex flex-wrap gap-4 mb-3"
        >
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              id="field-noticePeriod"
              name="notice"
              checked={noticeImmediate === true}
              onChange={() => {
                setNoticeImmediate(true);
                setErrors((e) => ({ ...e, noticePeriod: '' }));
              }}
              className="text-blue-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Available Now</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="notice"
              checked={noticeImmediate === false}
              onChange={() => {
                setNoticeImmediate(false);
                setErrors((e) => ({ ...e, noticePeriod: '' }));
              }}
              className="text-blue-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Available Later</span>
          </label>
        </div>

        {errors.noticePeriod && noticeImmediate === null && (
          <p id="notice-period-error" role="alert" className="text-xs text-red-500 mb-2">
            {errors.noticePeriod}
          </p>
        )}
        {noticeImmediate === false && (
          <div
            data-field-error={!!errors.noticeValue}
            className="flex flex-wrap items-center gap-2 mt-1"
          >
            <span className="text-sm text-gray-600 dark:text-gray-400 shrink-0">
              Available after
            </span>
            <div className="w-20">
              <input
                id="field-noticeValue"
                type="number"
                step={1}
                min={1}
                max={NOTICE_MAX[noticeUnit]}
                className={cls(errors.noticeValue)}
                value={noticeValue}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '' || Number(raw) <= 999) {
                    setNoticeValue(raw);
                    setErrors((prev) => ({
                      ...prev,
                      noticeValue: validateNoticePeriod(raw, noticeUnit),
                    }));
                  }
                }}
                placeholder="3"
              />
            </div>
            <div className="w-28">
              <select
                className={cls()}
                value={noticeUnit}
                onChange={(e) => {
                  const newUnit = e.target.value as NoticePeriodUnit;
                  setNoticeUnit(newUnit);
                  setErrors((prev) => ({
                    ...prev,
                    noticeValue: noticeValue.trim()
                      ? validateNoticePeriod(noticeValue, newUnit)
                      : '',
                  }));
                }}
              >
                <option value="day">days</option>
                <option value="week">weeks</option>
                <option value="month">months</option>
              </select>
            </div>
            {errors.noticeValue && (
              <span className="text-xs text-red-500 dark:text-red-400">{errors.noticeValue}</span>
            )}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <SaveButton onClick={handleSave} saving={saving} label="Save Work History" />
      </div>
    </div>
  );
}
