import { findCountryByNameOrCode } from '@/src/data/countries';
import { SectionHeader } from './shared/SectionHeader';
import { useState, useRef } from 'react';
import type { Profile, SalaryPeriod } from '@/src/types/profile';
import { useToast } from '@/src/components/ui/useToast';
import { CURRENCIES } from '@/src/data/currencies';
import { isValidAmount } from '@/src/utils/profileInputValidation';
import { FormField } from './shared/FormField';
import { SearchableCurrencySelect } from './shared/SearchableCurrencySelect';
import { RemoveButton } from './shared/RemoveButton';
import { saveSection } from './shared/saveSection';
import { SaveButton } from './shared/SaveButton';
import { AddEntryButton } from './shared/AddEntryButton';
import { fieldCls } from './shared/fieldCls';
import { useScrollToNewEntry } from './shared/useScrollToNewEntry';
import { useSectionDraft } from './shared/useSectionDraft';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}
type SalaryRow = { country: string; currency: string; amount: string; period: SalaryPeriod };
const emptyRow = (): SalaryRow => ({ country: '', currency: '', amount: '', period: 'monthly' });
function initRow(raw?: {
  country?: string;
  currency?: string;
  amount?: number;
  period?: SalaryPeriod;
}): SalaryRow {
  if (!raw) return emptyRow();
  return {
    country: findCountryByNameOrCode(raw.country ?? '')?.code ?? '',
    currency: raw.currency ?? '',
    amount: raw.amount != null ? String(raw.amount) : '',
    period: raw.period ?? 'monthly',
  };
}
const started = (row: SalaryRow) => !!(row.currency || row.amount.trim());
function rowErrors(row: SalaryRow): Record<string, string> {
  if (!started(row)) return {};
  const errors: Record<string, string> = {};
  if (!row.amount.trim()) errors.amount = 'Amount is required';
  else if (!isValidAmount(row.amount)) errors.amount = 'Enter a valid amount';
  if (!row.currency) errors.currency = 'Currency is required';
  else if (!CURRENCIES.some((currency) => currency.code === row.currency))
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
  const [newEntryTick, setNewEntryTick] = useState(0);
  const entriesContainerRef = useRef<HTMLDivElement>(null);
  useScrollToNewEntry(entriesContainerRef, newEntryTick);
  const saveDraft = useSectionDraft({ current, expected }, onSave);

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
      'Salary saved',
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
        <FormField label="Amount" error={errors[`${prefix}.amount`]}>
          <input
            id={isCurrent ? 'field-currentAmount' : `field-expected-${expectedIndex}-amount`}
            type="number"
            min={0}
            step="any"
            className={fieldCls(errors[`${prefix}.amount`])}
            value={row.amount}
            onChange={(e) => change('amount', e.target.value)}
            placeholder={isCurrent ? '80000' : '100000'}
          />
        </FormField>
        <FormField label="Currency" error={errors[`${prefix}.currency`]}>
          <SearchableCurrencySelect
            id={isCurrent ? 'field-currentCurrency' : `field-expected-${expectedIndex}-currency`}
            value={row.currency}
            onChange={(value) => change('currency', value)}
            error={errors[`${prefix}.currency`]}
          />
        </FormField>
        <FormField label="Period">
          <select
            className={fieldCls()}
            value={row.period}
            onChange={(e) => change('period', e.target.value)}
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </FormField>
      </div>
    );
  };
  return (
    <div>
      <SectionHeader sectionId="salary" />
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
          Expected Salary
        </h3>
        <div ref={entriesContainerRef}>
          {expected.map((row, index) => (
            <div
              key={index}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3"
            >
              <div className="flex justify-between mb-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">Entry {index + 1}</span>
                <RemoveButton
                  onClick={() => setExpected((rows) => rows.filter((_, i) => i !== index))}
                />
              </div>
              {renderRow(
                row,
                `expected.${index}`,
                (key, value) => changeExpected(index, key, value),
                index,
              )}
            </div>
          ))}
        </div>
        <AddEntryButton
          id="add-expected"
          onClick={() => {
            setExpected((rows) => [...rows, emptyRow()]);
            setNewEntryTick((value) => value + 1);
          }}
          label="+ Add Entry"
        />
      </section>
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
          Current Salary
        </h3>
        {started(current) && (
          <button
            type="button"
            onClick={() => {
              setCurrent(emptyRow());
              checkRow('current', emptyRow());
            }}
            className="mb-3 text-xs text-red-600 dark:text-red-400 hover:underline"
          >
            Remove current salary
          </button>
        )}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          {renderRow(current, 'current', changeCurrent)}
        </div>
      </section>
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <SaveButton onClick={handleSave} saving={saving} label="Save Salary" />
      </div>
    </div>
  );
}
