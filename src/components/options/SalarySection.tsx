import { feedback } from '@/src/ui/feedback';
import { SALARY_PERIOD_OPTIONS } from '@/src/profile/fieldPolicies';
import { ProfileFields } from './shared/ProfileFields';
import { findCountryByNameOrCode } from '@/src/data/countries';
import { SectionHeader } from './shared/SectionHeader';
import { useState, useRef } from 'react';
import type { Profile, SalaryPeriod } from '@/src/types/profile';
import { useToast } from '@/src/components/ui/useToast';
import { isValidAmount, isValidProfileCurrency } from '@/src/utils/profileInputValidation';
import { FormField } from './shared/FormField';
import { SearchableCurrencySelect } from './shared/SearchableCurrencySelect';
import { ConfirmRemoveButton } from './shared/ConfirmRemoveButton';
import { ExpandableCard } from './shared/ExpandableCard';
import { removeEntryErrors } from './shared/entryErrors';
import { saveSection } from './shared/saveSection';
import { SaveButton } from './shared/SaveButton';
import { EntryListHeader } from './shared/EntryListHeader';
import { fieldCls } from './shared/fieldCls';
import { useScrollToNewEntry } from './shared/useScrollToNewEntry';
import { useSectionDraft } from './shared/useSectionDraft';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}
type SalaryRow = {
  rowId: string;
  country: string;
  currency: string;
  amount: string;
  period: SalaryPeriod;
};
const emptyRow = (): SalaryRow => ({
  rowId: crypto.randomUUID(),
  country: '',
  currency: '',
  amount: '',
  period: 'monthly',
});
function initRow(raw?: {
  country?: string;
  currency?: string;
  amount?: number;
  period?: SalaryPeriod;
}): SalaryRow {
  if (!raw) return emptyRow();
  return {
    rowId: crypto.randomUUID(),
    country: findCountryByNameOrCode(raw.country ?? '')?.code ?? '',
    currency: raw.currency ?? '',
    amount: raw.amount != null ? String(raw.amount) : '',
    period: raw.period ?? 'monthly',
  };
}
const started = (row: SalaryRow) => !!(row.currency || row.amount.trim());
function expectedSalarySummary(row: SalaryRow) {
  const amount = row.amount.trim();
  if (!started(row) && row.period === 'monthly') return 'New entry';
  return (
    <>
      {[
        row.currency,
        amount && isValidAmount(amount)
          ? Number(amount).toLocaleString('en-US', { maximumFractionDigits: 20 })
          : amount,
      ].filter(Boolean).join(' ') || 'New entry'}
      <span className="font-normal text-gray-500 dark:text-gray-400">
        {row.period === 'annual' ? ' per year' : ' per month'}
      </span>
    </>
  );
}
function rowErrors(row: SalaryRow): Record<string, string> {
  if (!started(row)) return {};
  const errors: Record<string, string> = {};
  if (!row.amount.trim()) errors.amount = 'Enter an amount';
  else if (!isValidAmount(row.amount)) errors.amount = 'Enter a valid amount';
  if (!row.currency) errors.currency = 'Choose a currency';
  else if (!isValidProfileCurrency(row.currency))
    errors.currency = 'Select a valid currency';
  return errors;
}
function serialize(row: SalaryRow) {
  return {
    amount: Number(row.amount),
    currency: row.currency,
    country: row.country || undefined,
    period: row.period,
  };
}

export function SalarySection({ profile, onSave }: Props) {
  const [current, setCurrent] = useState(() => initRow(profile.salary?.current));
  const [expected, setExpected] = useState<SalaryRow[]>(() =>
    profile.salary?.expected?.length ? profile.salary.expected.map(initRow) : [emptyRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const entriesContainerRef = useRef<HTMLDivElement>(null);
  const { focusEntry, focusRequest } = useScrollToNewEntry(entriesContainerRef);
  const saveDraft = useSectionDraft(
    {
      current: { ...current, rowId: undefined },
      expected: expected.map(({ rowId: _rowId, ...row }) => row),
    },
    onSave,
  );

  const update = (row: SalaryRow, key: keyof SalaryRow, value: string): SalaryRow => ({
    ...row,
    [key]: value,
  });
  const checkRow = (prefix: string, row: SalaryRow) => {
    const nextErrors = rowErrors(row);
    setErrors((previous) => ({
      ...previous,
      ...Object.fromEntries(
        ['country', 'currency', 'amount'].map((key) => [`${prefix}.${key}`, nextErrors[key] ?? '']),
      ),
    }));
  };
  const changeCurrent = (key: keyof SalaryRow, value: string) => {
    const next = update(current, key, value);
    setCurrent(next);
    checkRow('current', next);
  };
  const changeExpected = (index: number, key: keyof SalaryRow, value: string) => {
    const next = update(expected[index], key, value);
    setExpected((rows) => rows.map((row, i) => (i === index ? next : row)));
    checkRow(`expected.${index}`, next);
  };
  const handleSave = async () => {
    const nextErrors: Record<string, string> = {};
    for (const [key, error] of Object.entries(rowErrors(current)))
      nextErrors[`current.${key}`] = error;
    expected.forEach((row, index) => {
      for (const [key, error] of Object.entries(rowErrors(row)))
        nextErrors[`expected.${index}.${key}`] = error;
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    await saveSection(
      saveDraft,
      {
        salary: {
          current: started(current) ? serialize(current) : undefined,
          expected: expected.filter(started).map(serialize),
        },
      },
      showToast,
      feedback.profileSaved,
    );
    setSaving(false);
  };

  const renderRow = (
    row: SalaryRow,
    prefix: string,
    change: (key: keyof SalaryRow, value: string) => void,
    expectedIndex?: number,
  ) => {
    const isCurrent = expectedIndex === undefined;
    return (
      <ProfileFields
        key={row.rowId}
        index={expectedIndex}
        scope={isCurrent ? 'currentSalary' : 'expectedSalary'}
        renderers={{
          amount: (field) => (
            <FormField
              label={field.label}
              required={field.required}
              error={errors[`${prefix}.amount`]}
            >
              <input
                id={field.inputId}
                type="number"
                min={0}
                step="any"
                className={fieldCls(errors[`${prefix}.amount`])}
                value={row.amount}
                onChange={(e) => change('amount', e.target.value)}
                placeholder={isCurrent ? '80000' : '100000'}
              />
            </FormField>
          ),
          currency: (field) => (
            <FormField
              label={field.label}
              required={field.required}
              error={errors[`${prefix}.currency`]}
            >
              <SearchableCurrencySelect
                id={field.inputId}
                value={row.currency}
                onChange={(value) => change('currency', value)}
                error={errors[`${prefix}.currency`]}
              />
            </FormField>
          ),
          period: (field) => (
            <FormField label={field.label} required={field.required}>
              <select
                id={field.inputId}
                className={fieldCls()}
                value={row.period}
                onChange={(e) => change('period', e.target.value)}
              >
                {SALARY_PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
          ),
        }}
      />
    );
  };
  return (
    <div>
      <SectionHeader sectionId="salary" />
      <ProfileFields
        scope="salary"
        renderers={{
          expected: (field) => (
            <section className="mb-6">
              <EntryListHeader
                title={field.label}
                id="add-expected"
                onAdd={() => {
                  const existing = expected.find(
                    (row) => !started(row) && row.period === 'monthly',
                  );
                  const row = existing ?? emptyRow();
                  if (!existing) setExpected((rows) => [...rows, row]);
                  focusEntry(row.rowId);
                }}
                label="+ Add Entry"
              />
              <div ref={entriesContainerRef}>
                {expected.map((row, index) => (
                  <ExpandableCard
                    id={`entry-salary-${index}`}
                    key={row.rowId}
                    entryId={row.rowId}
                    expandRequest={focusRequest.rowId === row.rowId ? focusRequest.tick : 0}
                    summary={expectedSalarySummary(row)}
                    defaultExpanded={!row.amount.trim() || !row.currency}
                    invalid={Object.entries(errors).some(
                      ([key, value]) => key.startsWith(`expected.${index}.`) && !!value,
                    )}
                    confirmDelete={started(row) || row.period !== 'monthly'}
                    deleteLabel={expected.length === 1 ? 'Clear' : 'Delete'}
                    onDelete={() => {
                      setExpected((rows) =>
                        rows.length === 1 ? [emptyRow()] : rows.filter((_, i) => i !== index),
                      );
                      setErrors((errors) => removeEntryErrors(errors, index, 'expected.'));
                    }}
                  >
                    {renderRow(
                      row,
                      `expected.${index}`,
                      (key, value) => changeExpected(index, key, value),
                      index,
                    )}
                  </ExpandableCard>
                ))}
              </div>
            </section>
          ),
          current: (field) => (
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
                {field.label}
              </h3>
              <div className="profile-entry-fields profile-entry-fields-salary @container/profile-entry relative p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="absolute right-4 top-4">
                  <ConfirmRemoveButton
                    compact
                    title="Clear salary"
                    action="Clear"
                    confirm={started(current)}
                    onConfirm={() => {
                      setCurrent(emptyRow());
                      checkRow('current', emptyRow());
                    }}
                  />
                </div>
                {renderRow(current, 'current', changeCurrent)}
              </div>
            </section>
          ),
        }}
      />
      <SaveButton onClick={handleSave} saving={saving} label="Save" />
    </div>
  );
}
