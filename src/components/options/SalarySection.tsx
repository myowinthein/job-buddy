import { useState } from 'react';
import type { Profile } from '@/src/types/profile';
import { findCountryByNameOrCode } from '@/src/data/countries';
import { findCurrency, currencyForCountry } from '@/src/data/currencies';
import { FormField } from './shared/FormField';
import { SearchableCurrencySelect } from './shared/SearchableCurrencySelect';
import { RemoveButton } from './shared/RemoveButton';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

// ── Expected-salary row ───────────────────────────────────────────────────────
type ExpectedRow = { currencyCode: string; amount: string };

function emptyExpected(): ExpectedRow {
  return { currencyCode: '', amount: '' };
}

// Back-compat: old rows may have country-derived currency or free-text values.
// Normalise to a direct currencyCode on load.
function initExpectedRow(raw: { country?: string; amount?: number; currency?: string }): ExpectedRow {
  let currencyCode = '';

  // Direct currency takes precedence
  if (raw.currency) {
    const found = findCurrency(raw.currency);
    currencyCode = found ? found.code : raw.currency.toUpperCase();
  }

  // Backward compat: no direct currency but has a stored country — derive it
  if (!currencyCode && raw.country) {
    const found = findCountryByNameOrCode(raw.country);
    if (found) currencyCode = currencyForCountry(found.code).code;
  }

  return {
    currencyCode,
    amount: raw.amount != null ? String(raw.amount) : '',
  };
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function SalarySection({ profile, onSave }: Props) {
  const s = profile.salary;

  // ── Current salary ──────────────────────────────────────────────────────────
  const initCurrentCurrency = s?.current?.currency
    ? (findCurrency(s.current.currency)?.code ?? s.current.currency)
    : '';

  const [currentCurrency, setCurrentCurrency] = useState(initCurrentCurrency);
  const [currentAmount, setCurrentAmount] = useState(
    s?.current?.amount != null ? String(s.current.amount) : '',
  );

  // ── Expected salary rows ────────────────────────────────────────────────────
  const [expected, setExpected] = useState<ExpectedRow[]>(
    s?.expected?.length ? s.expected.map(initExpectedRow) : [emptyExpected()],
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setExpectedField = (idx: number, key: keyof ExpectedRow, value: string) => {
    setExpected((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
    );
    if (errors[`expected.${idx}.${key}`])
      setErrors((e) => ({ ...e, [`expected.${idx}.${key}`]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (currentAmount.trim() === '') e.currentAmount = 'Current salary amount is required';
    else if (isNaN(Number(currentAmount)) || Number(currentAmount) < 0)
      e.currentAmount = 'Enter a valid amount';
    if (!currentCurrency) e.currentCurrency = 'Currency is required';
    if (expected.length === 0) e.expectedList = 'At least one expected salary entry is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      salary: {
        current: {
          amount: Number(currentAmount),
          currency: currentCurrency,
        },
        expected: expected.map((r) => ({
          amount: r.amount !== '' ? Number(r.amount) : undefined,
          currency: r.currencyCode || undefined,
        })),
      },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Salary</h2>
        <p className="text-sm text-gray-500 mt-1">Current compensation and expected salary</p>
      </div>

      {/* ── Current Salary ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Current Salary</h3>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Currency" required error={errors.currentCurrency}>
              <SearchableCurrencySelect
                value={currentCurrency}
                onChange={(code) => {
                  setCurrentCurrency(code);
                  if (errors.currentCurrency) setErrors((err) => ({ ...err, currentCurrency: '' }));
                }}
                error={errors.currentCurrency}
              />
            </FormField>
            <FormField label="Amount" required error={errors.currentAmount}>
              <input
                type="number"
                min={0}
                className={cls(errors.currentAmount)}
                value={currentAmount}
                onChange={(e) => {
                  setCurrentAmount(e.target.value);
                  if (errors.currentAmount) setErrors((err) => ({ ...err, currentAmount: '' }));
                }}
                placeholder="80000"
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* ── Expected Salary ────────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Expected Salary</h3>
          <button
            type="button"
            onClick={() => setExpected((r) => [...r, emptyExpected()])}
            className="text-xs px-3 py-1.5 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
          >
            + Add Entry
          </button>
        </div>
        {errors.expectedList && (
          <p className="text-xs text-red-500 mb-2">{errors.expectedList}</p>
        )}

        {expected.map((row, idx) => (
          <div key={idx} className="p-4 border border-gray-200 rounded-lg mb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-600">Entry {idx + 1}</span>
              {expected.length > 1 && (
                <RemoveButton
                  onClick={() => setExpected((rows) => rows.filter((_, i) => i !== idx))}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Currency">
                <SearchableCurrencySelect
                  value={row.currencyCode}
                  onChange={(code) => setExpectedField(idx, 'currencyCode', code)}
                />
              </FormField>
              <FormField label="Amount">
                <input
                  type="number"
                  min={0}
                  className={cls()}
                  value={row.amount}
                  onChange={(e) => setExpectedField(idx, 'amount', e.target.value)}
                  placeholder="100000"
                />
              </FormField>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Salary'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
