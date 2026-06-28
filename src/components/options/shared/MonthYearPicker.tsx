import { useState } from 'react';

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

interface Props {
  value: string;      // "YYYY", "YYYY-MM", or ""
  onChange: (value: string) => void;
  // Fires with the raw 4-digit year string whenever the year input changes,
  // even when month is not yet selected. Use this to validate year range
  // independently of the full YYYY-MM value.
  onYearChange?: (year: string) => void;
  // Fires when focus leaves the entire month+year group (not when tabbing
  // between month and year within the picker). Receives the current internal
  // month and raw year strings so the parent can run blur-time validation.
  onBlur?: (month: string, year: string) => void;
  error?: string;
  disabled?: boolean;
  // When true, emit "YYYY" once the year is valid, even with no month.
  // Required (default false) emits only when both month and year are present.
  monthOptional?: boolean;
}

export function MonthYearPicker({
  value,
  onChange,
  onYearChange,
  onBlur,
  error,
  disabled = false,
  monthOptional = false,
}: Props) {
  const [month, setMonth] = useState<string>(() => (value ? (value.split('-')[1] ?? '') : ''));
  // yearStr tracks what the user has typed (may be partial, e.g. "199")
  const [yearStr, setYearStr] = useState<string>(() => (value ? (value.split('-')[0] ?? '') : ''));

  const emit = (m: string, y: string) => {
    if (m && y) onChange(`${y}-${m}`);
    else if (monthOptional && y) onChange(y);
    else onChange('');
  };

  const handleMonth = (m: string) => {
    setMonth(m);
    emit(m, isValidYear(yearStr) ? yearStr : '');
  };

  const isValidYear = (s: string): boolean => {
    if (s.length !== 4) return false;
    const n = parseInt(s, 10);
    return !isNaN(n);
  };

  const handleYearInput = (raw: string) => {
    // Strip non-digits, cap at 4 chars
    const cleaned = raw.replace(/\D/g, '').slice(0, 4);
    setYearStr(cleaned);
    emit(month, isValidYear(cleaned) ? cleaned : '');
    onYearChange?.(cleaned);
  };

  const borderCls = error
    ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500';
  const baseCls = `w-full px-3 py-2 text-sm border ${borderCls} rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`;
  const disabledCls = disabled ? ' opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-700' : '';
  const fieldCls = baseCls + disabledCls;

  const handleGroupBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Only fire when focus moves outside the entire month+year group,
    // not when tabbing between month and year within the picker.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      onBlur?.(month, yearStr);
    }
  };

  return (
    <div className="flex gap-2" onBlur={handleGroupBlur}>
      <div className="flex-1">
        <select
          className={fieldCls}
          value={month}
          disabled={disabled}
          onChange={(e) => handleMonth(e.target.value)}
          aria-label="Month"
        >
          <option value="">Month</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="w-20">
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          className={fieldCls}
          value={yearStr}
          disabled={disabled}
          onChange={(e) => handleYearInput(e.target.value)}
          placeholder="Year"
          aria-label="Year"
        />
      </div>
    </div>
  );
}
