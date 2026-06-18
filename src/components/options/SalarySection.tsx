import { useState, useRef, useEffect } from 'react';
import type { Profile } from '@/src/types/profile';
import { findCountryByNameOrCode } from '@/src/data/countries';
import { COUNTRY_TO_CURRENCY, findCurrency, primaryCountryForCurrency } from '@/src/data/currencies';
import { FormField } from './shared/FormField';
import { SearchableCurrencySelect } from './shared/SearchableCurrencySelect';
import { SearchableCountryWithCurrencyDropdown } from './shared/SearchableCountryWithCurrencyDropdown';
import { RemoveButton } from './shared/RemoveButton';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

// ── Expected-salary row ───────────────────────────────────────────────────────
type ExpectedRow = { countryCode: string; amount: string };

function emptyExpected(): ExpectedRow {
  return { countryCode: '', amount: '' };
}

// Migration: old rows stored only `currency` (e.g. "SGD"). New rows store
// `country` (ISO code). On load:
//   1. Use `country` directly if present.
//   2. Fall back to reverse-looking up `currency` — but only if the currency
//      maps to exactly one country (unambiguous). EUR/USD/XOF etc. are left
//      empty so the user explicitly picks.
function initExpectedRow(raw: { country?: string; amount?: number; currency?: string }): ExpectedRow {
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
          country: r.countryCode || undefined,
          currency: r.countryCode ? (COUNTRY_TO_CURRENCY[r.countryCode] || undefined) : undefined,
          amount: r.amount !== '' ? Number(r.amount) : undefined,
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
                id="field-currentCurrency"
                value={currentCurrency}
                onChange={(code) => {
                  setCurrentCurrency(code);
                  setErrors((err) => ({ ...err, currentCurrency: code ? '' : 'Currency is required' }));
                }}
                error={errors.currentCurrency}
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
          </div>
        </div>
      </div>

      {/* ── Expected Salary ────────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Expected Salary</h3>
          <button
            type="button"
            onClick={() => { setExpected((r) => [...r, emptyExpected()]); setNewEntryTick((t) => t + 1); }}
            className="text-xs px-3 py-1.5 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
          >
            + Add Entry
          </button>
        </div>
        {errors.expectedList && (
          <p className="text-xs text-red-500 mb-2">{errors.expectedList}</p>
        )}

        <div ref={entriesContainerRef}>
        {expected.map((row, idx) => (
          <div key={idx} className="p-4 border border-gray-200 rounded-lg mb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-600">Entry {idx + 1}</span>
              <RemoveButton
                onClick={() => setExpected((rows) => rows.filter((_, i) => i !== idx))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Country">
                <SearchableCountryWithCurrencyDropdown
                  value={row.countryCode}
                  onChange={(code) => setExpectedField(idx, 'countryCode', code)}
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
        </div>{/* entriesContainerRef */}
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
