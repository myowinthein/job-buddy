import { useState } from 'react';
import type { Profile } from '@/src/types/profile';
import { FormField } from './shared/FormField';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

type ExpectedRow = { country: string; amount: string; currency: string };

const emptyExpected = (): ExpectedRow => ({ country: '', amount: '', currency: '' });

export function SalarySection({ profile, onSave }: Props) {
  const s = profile.salary;
  const [currentAmount, setCurrentAmount] = useState(s?.current?.amount?.toString() ?? '');
  const [currentCurrency, setCurrentCurrency] = useState(s?.current?.currency ?? '');
  const [expected, setExpected] = useState<ExpectedRow[]>(
    s?.expected?.length
      ? s.expected.map((e) => ({
          country: e.country ?? '',
          amount: e.amount?.toString() ?? '',
          currency: e.currency ?? '',
        }))
      : [emptyExpected()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setExpectedField = (idx: number, key: keyof ExpectedRow, value: string) => {
    setExpected((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const errKey = `expected.${idx}.${key}`;
    if (errors[errKey]) setErrors((e) => ({ ...e, [errKey]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!currentAmount.trim()) e.currentAmount = 'Current salary amount is required';
    else if (isNaN(Number(currentAmount)) || Number(currentAmount) < 0)
      e.currentAmount = 'Enter a valid amount';
    if (!currentCurrency.trim()) e.currentCurrency = 'Currency is required';
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
          currency: currentCurrency.trim().toUpperCase(),
        },
        expected: expected.map((r) => ({
          country: r.country || undefined,
          amount: r.amount ? Number(r.amount) : undefined,
          currency: r.currency ? r.currency.trim().toUpperCase() : undefined,
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
            <input
              className={cls(errors.currentCurrency)}
              value={currentCurrency}
              onChange={(e) => {
                setCurrentCurrency(e.target.value);
                if (errors.currentCurrency) setErrors((err) => ({ ...err, currentCurrency: '' }));
              }}
              placeholder="USD"
              maxLength={3}
            />
          </FormField>
        </div>
      </div>

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
        {errors.expectedList && <p className="text-xs text-red-500 mb-2">{errors.expectedList}</p>}

        {expected.map((row, idx) => (
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
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Country">
                <input
                  className={cls()}
                  value={row.country}
                  onChange={(e) => setExpectedField(idx, 'country', e.target.value)}
                  placeholder="US"
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
              <FormField label="Currency">
                <input
                  className={cls()}
                  value={row.currency}
                  onChange={(e) => setExpectedField(idx, 'currency', e.target.value)}
                  placeholder="USD"
                  maxLength={3}
                />
              </FormField>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-3">
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
