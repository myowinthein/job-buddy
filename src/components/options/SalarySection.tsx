import { useToast } from '@/src/components/ui/Toast';
import { useState, useRef, useEffect } from 'react';
import type { Profile, SalaryPeriod } from '@/src/types/profile';
import { findCountryByNameOrCode } from '@/src/data/countries';
import { COUNTRY_TO_CURRENCY, primaryCountryForCurrency } from '@/src/data/currencies';
import { FormField } from './shared/FormField';
import { SearchableCountryWithCurrencyDropdown } from './shared/SearchableCountryWithCurrencyDropdown';
import { RemoveButton } from './shared/RemoveButton';
import { saveSection } from './shared/saveSection';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

// ── Expected-salary row ───────────────────────────────────────────────────────
type ExpectedRow = { countryCode: string; amount: string; period: SalaryPeriod };

function emptyExpected(): ExpectedRow {
  return { countryCode: '', amount: '', period: 'monthly' };
}

// Migration: old rows stored only `currency` (e.g. "SGD"). New rows store
// `country` (ISO code). On load:
//   1. Use `country` directly if present.
//   2. Fall back to reverse-looking up `currency` — but only if the currency
//      maps to exactly one country (unambiguous). EUR/USD/XOF etc. are left
//      empty so the user explicitly picks.
// `period` defaults to 'monthly' for any row that doesn't have one stored.
function initExpectedRow(raw: { country?: string; amount?: number; currency?: string; period?: SalaryPeriod }): ExpectedRow {
  let countryCode = '';

  if (raw.country) {
    const found = findCountryByNameOrCode(raw.country);
    countryCode = found ? found.code : '';
  }

  if (!countryCode && raw.currency) {
    countryCode = primaryCountryForCurrency(raw.currency) ?? '';
  }

  return {
    countryCode,
    amount: raw.amount != null ? String(raw.amount) : '',
    period: raw.period ?? 'monthly',
  };
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 dark:border-red-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function SalarySection({ profile, onSave }: Props) {
  const s = profile.salary;

  // ── Current salary ──────────────────────────────────────────────────────────
  // Migrate old shape:
  //   1. Use `country` directly if present (new shape).
  //   2. Otherwise reverse-look up `currency` — only if it maps to exactly one
  //      country (unambiguous). EUR/USD/XOF etc. are left empty so the user
  //      picks explicitly.
  const initCurrentCountry = (() => {
    if (s?.current?.country) {
      const found = findCountryByNameOrCode(s.current.country);
      if (found) return found.code;
    }
    if (s?.current?.currency) {
      return primaryCountryForCurrency(s.current.currency) ?? '';
    }
    return '';
  })();

  const [currentCountry, setCurrentCountry] = useState(initCurrentCountry);
  const [currentAmount, setCurrentAmount] = useState(
    s?.current?.amount != null ? String(s.current.amount) : '',
  );
  const [currentPeriod, setCurrentPeriod] = useState<SalaryPeriod>(
    s?.current?.period ?? 'monthly',
  );

  // ── Expected salary rows ────────────────────────────────────────────────────
  const [expected, setExpected] = useState<ExpectedRow[]>(
    s?.expected?.length ? s.expected.map(initExpectedRow) : [emptyExpected()],
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

  // Per-row partial-entry validation: if either field is set, both are required.
  // Returns errors keyed as `expected.<idx>.countryCode` / `expected.<idx>.amount`.
  const expectedRowErrors = (row: ExpectedRow, idx: number): Record<string, string> => {
    const e: Record<string, string> = {};
    const hasCountry = !!row.countryCode;
    const hasAmount  = row.amount.trim() !== '';
    if (hasCountry && !hasAmount) e[`expected.${idx}.amount`] = 'Amount is required';
    if (!hasCountry && hasAmount) e[`expected.${idx}.countryCode`] = 'Country is required';
    if (hasAmount && (isNaN(Number(row.amount)) || Number(row.amount) < 0))
      e[`expected.${idx}.amount`] = 'Enter a valid amount';
    return e;
  };

  const recheckExpectedRow = (idx: number, nextRow: ExpectedRow) => {
    const rowErrs = expectedRowErrors(nextRow, idx);
    setErrors((e) => ({
      ...e,
      [`expected.${idx}.countryCode`]: rowErrs[`expected.${idx}.countryCode`] ?? '',
      [`expected.${idx}.amount`]:      rowErrs[`expected.${idx}.amount`]      ?? '',
    }));
  };

  const setExpectedField = (idx: number, key: keyof ExpectedRow, value: string) => {
    setExpected((rows) => {
      const next = rows.map((r, i) => {
        if (i !== idx) return r;
        if (key === 'period') return { ...r, period: value as SalaryPeriod };
        return { ...r, [key]: value };
      });
      recheckExpectedRow(idx, next[idx]);
      return next;
    });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (currentAmount.trim() === '') e.currentAmount = 'Current salary amount is required';
    else if (isNaN(Number(currentAmount)) || Number(currentAmount) < 0)
      e.currentAmount = 'Enter a valid amount';
    if (!currentCountry) e.currentCountry = 'Country is required';
    if (!currentPeriod) e.currentPeriod = 'Period is required';
    expected.forEach((row, idx) => Object.assign(e, expectedRowErrors(row, idx)));
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const currentCurrency = COUNTRY_TO_CURRENCY[currentCountry] || '';
    await saveSection(onSave, {
      salary: {
        current: {
          amount: Number(currentAmount),
          currency: currentCurrency,
          country: currentCountry || undefined,
          period: currentPeriod,
        },
        expected: expected
          // Drop fully-empty rows so the user can leave the form with no
          // expected salary entries without saving placeholder objects.
          .filter((r) => r.countryCode || r.amount.trim() !== '')
          .map((r) => ({
            country: r.countryCode || undefined,
            currency: r.countryCode ? (COUNTRY_TO_CURRENCY[r.countryCode] || undefined) : undefined,
            amount: r.amount !== '' ? Number(r.amount) : undefined,
            period: r.period,
          })),
      },
    }, showToast, 'Salary saved');
    setSaving(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Salary</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Current compensation and expected salary</p>
      </div>

      {/* ── Current Salary ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Current Salary</h3>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Country" required error={errors.currentCountry}>
              <SearchableCountryWithCurrencyDropdown
                value={currentCountry}
                onChange={(code) => {
                  setCurrentCountry(code);
                  setErrors((err) => ({ ...err, currentCountry: code ? '' : 'Country is required' }));
                }}
                error={errors.currentCountry}
              />
            </FormField>
            <FormField label="Amount" required error={errors.currentAmount}>
              <input
                id="field-currentAmount"
                type="number"
                min={0}
                className={cls(errors.currentAmount)}
                value={currentAmount}
                onChange={(e) => {
                  const raw = e.target.value;
                  setCurrentAmount(raw);
                  let amtErr = '';
                  if (raw.trim() === '') amtErr = 'Current salary amount is required';
                  else if (isNaN(Number(raw)) || Number(raw) < 0) amtErr = 'Enter a valid amount';
                  setErrors((err) => ({ ...err, currentAmount: amtErr }));
                }}
                placeholder="80000"
              />
            </FormField>
            <FormField label="Period" required error={errors.currentPeriod}>
              <select
                className={cls(errors.currentPeriod)}
                value={currentPeriod}
                onChange={(e) => setCurrentPeriod(e.target.value as SalaryPeriod)}
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </FormField>
          </div>
        </div>
      </div>

      {/* ── Expected Salary ────────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Expected Salary</h3>
          <button
            type="button"
            onClick={() => { setExpected((r) => [...r, emptyExpected()]); setNewEntryTick((t) => t + 1); }}
            className="text-xs px-3 py-1.5 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95 transition-colors"
          >
            + Add Entry
          </button>
        </div>
        <div ref={entriesContainerRef}>
        {expected.map((row, idx) => (
          <div key={idx} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Entry {idx + 1}</span>
              <RemoveButton
                onClick={() => setExpected((rows) => rows.filter((_, i) => i !== idx))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <FormField label="Country" error={errors[`expected.${idx}.countryCode`]}>
                <SearchableCountryWithCurrencyDropdown
                  value={row.countryCode}
                  onChange={(code) => setExpectedField(idx, 'countryCode', code)}
                />
              </FormField>
              <FormField label="Amount" error={errors[`expected.${idx}.amount`]}>
                <input
                  type="number"
                  min={0}
                  className={cls(errors[`expected.${idx}.amount`])}
                  value={row.amount}
                  onChange={(e) => setExpectedField(idx, 'amount', e.target.value)}
                  onBlur={() => recheckExpectedRow(idx, row)}
                  placeholder="100000"
                />
              </FormField>
              <FormField label="Period" required>
                <select
                  className={cls()}
                  value={row.period}
                  onChange={(e) => setExpectedField(idx, 'period', e.target.value)}
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </FormField>
            </div>
          </div>
        ))}
        </div>{/* entriesContainerRef */}
      </div>

      <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Salary'}
        </button>
      </div>
    </div>
  );
}
