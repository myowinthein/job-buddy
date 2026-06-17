import { useState } from 'react';
import type { Profile } from '@/src/types/profile';
import { COUNTRIES, getFlag, findCountryByNameOrCode } from '@/src/data/countries';
import { CURRENCIES, getCurrencyLabel, findCurrency, currencyForCountry } from '@/src/data/currencies';
import { FormField } from './shared/FormField';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// ── Expected-salary row ───────────────────────────────────────────────────────
// country: ISO 3166-1 alpha-2 code ("TH")
// amount:  string for input
// currency: ISO 4217 code derived from country ("THB") — read-only
type ExpectedRow = { countryCode: string; amount: string; currencyCode: string };

function emptyExpected(): ExpectedRow {
  return { countryCode: '', amount: '', currencyCode: '' };
}

// Back-compat: old rows may have free-text country ("Thailand") and currency
// ("thb"). Normalise both to standard codes on load.
function initExpectedRow(raw: { country?: string; amount?: number; currency?: string }): ExpectedRow {
  const found = raw.country ? findCountryByNameOrCode(raw.country) : undefined;
  const countryCode = found ? found.code : (raw.country ?? '');
  const derivedCurrency = found ? currencyForCountry(found.code).code : '';
  const savedCurrency = raw.currency ? raw.currency.toUpperCase() : '';
  // Prefer saved currency only if it matches what the country derives; otherwise
  // use the derived value so old free-text entries don't persist.
  const currencyCode = savedCurrency && findCurrency(savedCurrency)
    ? savedCurrency
    : (derivedCurrency || savedCurrency);
  return { countryCode, amount: raw.amount?.toString() ?? '', currencyCode };
}

export function SalarySection({ profile, onSave }: Props) {
  const s = profile.salary;

  // ── Current salary ──────────────────────────────────────────────────────────
  const initCurrentCurrency = s?.current?.currency
    ? (findCurrency(s.current.currency)?.code ?? s.current.currency)
    : '';

  const [currentAmount, setCurrentAmount] = useState(s?.current?.amount?.toString() ?? '');
  const [currentCurrency, setCurrentCurrency] = useState(initCurrentCurrency);

  // ── Expected salary rows ────────────────────────────────────────────────────
  const [expected, setExpected] = useState<ExpectedRow[]>(
    s?.expected?.length ? s.expected.map(initExpectedRow) : [emptyExpected()],
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setExpectedField = (idx: number, key: keyof ExpectedRow, value: string) => {
    setExpected((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const updated = { ...r, [key]: value };
        // When country changes, auto-derive currency
        if (key === 'countryCode') {
          updated.currencyCode = value ? currencyForCountry(value).code : '';
        }
        return updated;
      }),
    );
    if (errors[`expected.${idx}.${key}`])
      setErrors((e) => ({ ...e, [`expected.${idx}.${key}`]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!currentAmount.trim()) e.currentAmount = 'Current salary amount is required';
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
          amount: r.amount ? Number(r.amount) : undefined,
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
        <p className="text-sm text-gray-500 mt-1">Current compensation and expected salary by country</p>
      </div>

      {/* ── Current Salary ─────────────────────────────────────────────────── */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mb-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Current Salary</h3>
        <div className="grid grid-cols-2 gap-4">
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
          <FormField label="Currency" required error={errors.currentCurrency}>
            <select
              className={cls(errors.currentCurrency)}
              value={currentCurrency}
              onChange={(e) => {
                setCurrentCurrency(e.target.value);
                if (errors.currentCurrency) setErrors((err) => ({ ...err, currentCurrency: '' }));
              }}
            >
              <option value="">Select currency…</option>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {getCurrencyLabel(c)}
                </option>
              ))}
            </select>
          </FormField>
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
            + Add Country
          </button>
        </div>
        {errors.expectedList && (
          <p className="text-xs text-red-500 mb-2">{errors.expectedList}</p>
        )}

        {expected.map((row, idx) => {
          const derivedCurrency = row.currencyCode
            ? findCurrency(row.currencyCode)
            : undefined;

          return (
            <div key={idx} className="p-4 border border-gray-200 rounded-lg mb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-600">Entry {idx + 1}</span>
                {expected.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExpected((rows) => rows.filter((_, i) => i !== idx))}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="Country">
                  <select
                    className={cls()}
                    value={row.countryCode}
                    onChange={(e) => setExpectedField(idx, 'countryCode', e.target.value)}
                  >
                    <option value="">Select country…</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {getFlag(c.code)}  {c.name}
                      </option>
                    ))}
                  </select>
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

              {/* Currency — read-only, derived from selected country */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-xs text-gray-500 shrink-0">Currency</span>
                {derivedCurrency ? (
                  <span className="text-sm font-medium text-gray-800">
                    {getCurrencyLabel(derivedCurrency)}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400 italic">
                    — select a country above
                  </span>
                )}
              </div>
            </div>
          );
        })}
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
