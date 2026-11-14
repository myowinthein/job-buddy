import { feedback } from '@/src/ui/feedback';
import { profileTextLimit } from '@/src/profile/fieldPolicies';
import { ProfileFields } from './shared/ProfileFields';
import { SectionHeader } from './shared/SectionHeader';
import { isValidCalendarDate, isValidProfileOption } from '@/src/utils/profileInputValidation';
import { useSectionDraft } from './shared/useSectionDraft';
import { useToast } from '@/src/components/ui/useToast';
import { useState, useRef } from 'react';
import type { Profile, WorkAuthorizationEntry, WorkAuthorizationStatus } from '@/src/types/profile';
import { findCountryByNameOrCode, getFlag } from '@/src/data/countries';
import { WORK_AUTH_STATUS_LABELS, WORK_AUTH_STATUS_OPTIONS } from '@/src/data/workAuthorization';
import { FormField } from './shared/FormField';
import { SearchableCountryDropdown } from './shared/SearchableCountryDropdown';
import { ExpandableCard } from './shared/ExpandableCard';
import { removeEntryErrors } from './shared/entryErrors';
import { saveSection } from './shared/saveSection';
import { SaveButton } from './shared/SaveButton';
import { EntryListHeader } from './shared/EntryListHeader';
import { fieldCls as cls } from './shared/fieldCls';
import { useScrollToNewEntry } from './shared/useScrollToNewEntry';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

// Local row allows empty status while the user hasn't selected yet.
type LocalRow = {
  rowId: string;
  country: string;
  status: WorkAuthorizationStatus | '';
  visaType?: string;
  expiryDate?: string;
};

function emptyRow(): LocalRow {
  return { rowId: crypto.randomUUID(), country: '', status: '' };
}

// Back-compat: old entries stored the country as a free-text name ("Singapore").
// New entries store the ISO code ("SG"). Normalise to ISO code on load.
function initRow(raw: WorkAuthorizationEntry): LocalRow {
  const found = findCountryByNameOrCode(raw.country);
  return {
    ...raw,
    rowId: crypto.randomUUID(),
    country: found ? found.code : raw.country,
    status: raw.status ?? '',
  };
}

export function WorkAuthorizationSection({ profile, onSave }: Props) {
  const [entries, setEntries] = useState<LocalRow[]>(
    profile.workAuthorization?.length ? profile.workAuthorization.map(initRow) : [emptyRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const entriesContainerRef = useRef<HTMLDivElement>(null);
  const { focusEntry, focusRequest } = useScrollToNewEntry(entriesContainerRef);

  const update = (idx: number, key: keyof LocalRow, value: string) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const ek = `${idx}.${key}`;
    let err = '';
    if (key === 'country' && !findCountryByNameOrCode(value)) err = 'Select a valid country';
    else if (key === 'status' && !isValidProfileOption('workAuthorization.$.status', value))
      err = 'Select a valid status';
    setErrors((e) => ({ ...e, [ek]: err }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (entries.length === 0) e.general = 'Add at least one work authorization entry';
    const seen = new Set<string>();
    entries.forEach((row, idx) => {
      if (seen.has(row.country.toUpperCase()))
        e[`${idx}.country`] = 'This country is already listed';
      seen.add(row.country.toUpperCase());
      if ((row.visaType?.length ?? 0) > profileTextLimit('workAuthorization.$.visaType'))
        e[`${idx}.visaType`] =
          `Use ${profileTextLimit('workAuthorization.$.visaType')} characters or fewer`;
      if (row.expiryDate && !isValidCalendarDate(row.expiryDate))
        e[`${idx}.expiryDate`] = 'Enter a valid expiry date';
      if (!row.country) e[`${idx}.country`] = 'Choose a country';
      else if (!findCountryByNameOrCode(row.country))
        e[`${idx}.country`] = 'Select a valid country';
      if (!row.status) e[`${idx}.status`] = 'Choose a work authorization status';
      else if (!isValidProfileOption('workAuthorization.$.status', row.status))
        e[`${idx}.status`] = 'Select a valid status';
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
        workAuthorization: entries.map((r) => ({
          ...(r.visaType !== undefined ? { visaType: r.visaType } : {}),
          ...(r.expiryDate !== undefined ? { expiryDate: r.expiryDate } : {}),
          country: r.country,
          status: r.status as WorkAuthorizationStatus,
        })),
      },
      showToast,
      feedback.profileSaved,
    );
    setSaving(false);
  };

  return (
    <div>
      <SectionHeader sectionId="workAuthorization" />

      <EntryListHeader
        id="add-workAuthorization"
        onAdd={() => {
          const existing = entries.find(
            (row) => !row.country && !row.status && !row.visaType && !row.expiryDate,
          );
          const row = existing ?? emptyRow();
          if (!existing) setEntries((rows) => [...rows, row]);
          focusEntry(row.rowId);
        }}
        label="+ Add Entry"
      />

      {errors.general && (
        <p className="text-sm text-red-700 dark:text-red-400 mb-4 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">
          {errors.general}
        </p>
      )}

      <div ref={entriesContainerRef}>
        {entries.map((row, idx) => {
          const country = findCountryByNameOrCode(row.country);
          const status = row.status ? WORK_AUTH_STATUS_LABELS[row.status] : undefined;
          return (
            <ExpandableCard
              id={`entry-workAuthorization-${idx}`}
              key={row.rowId}
              entryId={row.rowId}
              expandRequest={focusRequest.rowId === row.rowId ? focusRequest.tick : 0}
              summary={
                <>
                  {country && (
                    <span aria-hidden="true" className="mr-1.5">{getFlag(country.code)}</span>
                  )}
                  {country?.name || row.country || (status ? '' : 'New entry')}
                  {status && (
                    <span className="font-normal text-gray-500 dark:text-gray-400">
                      {row.country ? ': ' : ''}{status}
                    </span>
                  )}
                </>
              }
              defaultExpanded={!row.country || !row.status}
              invalid={Object.entries(errors).some(
                ([key, value]) => key.startsWith(`${idx}.`) && !!value,
              )}
              confirmDelete={!!(row.country || row.status || row.visaType || row.expiryDate)}
              deleteLabel={entries.length === 1 ? 'Clear' : 'Delete'}
              onDelete={() => {
                setEntries((rows) =>
                  rows.length === 1 ? [emptyRow()] : rows.filter((_, i) => i !== idx),
                );
                setErrors((errors) => removeEntryErrors(errors, idx, ''));
              }}
            >
              <ProfileFields
                index={idx}
                scope="workAuthorization"
                values={row}
                renderers={{
                  country: (field) => (
                    <FormField
                      label={field.label}
                      required={field.required}
                      error={errors[`${idx}.country`]}
                    >
                      <SearchableCountryDropdown
                        id={field.inputId}
                        value={row.country}
                        onChange={(code) => update(idx, 'country', code)}
                        error={errors[`${idx}.country`]}
                      />
                    </FormField>
                  ),
                  status: (field) => (
                    <FormField
                      label={field.label}
                      required={field.required}
                      error={errors[`${idx}.status`]}
                    >
                      <select
                        id={field.inputId}
                        className={cls(errors[`${idx}.status`])}
                        value={row.status}
                        onChange={(e) => update(idx, 'status', e.target.value)}
                      >
                        <option value="">Select authorization status…</option>
                        {WORK_AUTH_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  ),
                  visaType: (field) => (
                    <FormField
                      label={field.label}
                      required={field.required}
                      error={errors[`${idx}.visaType`]}
                    >
                      <input
                        id={field.inputId}
                        className={cls(errors[`${idx}.visaType`])}
                        value={row.visaType ?? ''}
                        onChange={(e) => update(idx, 'visaType', e.target.value)}
                        placeholder="Employment Pass"
                      />
                    </FormField>
                  ),
                  expiryDate: (field) => (
                    <FormField
                      label={field.label}
                      required={field.required}
                      error={errors[`${idx}.expiryDate`]}
                    >
                      <input
                        id={field.inputId}
                        type="date"
                        className={cls(errors[`${idx}.expiryDate`])}
                        value={row.expiryDate ?? ''}
                        onChange={(e) => update(idx, 'expiryDate', e.target.value)}
                      />
                    </FormField>
                  ),
                }}
              />
            </ExpandableCard>
          );
        })}
      </div>
      {/* entriesContainerRef */}

      <SaveButton onClick={handleSave} saving={saving} label="Save" />
    </div>
  );
}
