import { useState } from 'react';
import { fieldCls } from './fieldCls';
import { MONTH_NAMES } from './months';
import { useResyncOnExternalChange } from './useResyncOnExternalChange';
import { useDraftFlag } from './draftStatus';

const MONTHS = MONTH_NAMES.map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));

interface Props {
  id?: string;
  value: string;      // "YYYY", "YYYY-MM", or ""
  onChange: (value: string) => void;
  // Fires with the raw 4-digit year string whenever the year input changes,
  // even when month is not yet selected. Use this to validate year range
  // independently of the full YYYY-MM value.
  onPartialChange?: (partial: boolean) => void;
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

function isValidYear(s: string): boolean {
  if (s.length !== 4) return false;
  const n = parseInt(s, 10);
  return !isNaN(n);
}

function parseValue(v: string): { month: string; year: string } {
  return {
    month: v ? (v.split('-')[1] ?? '') : '',
    year:  v ? (v.split('-')[0] ?? '') : '',
  };
}

export function MonthYearPicker({
  id,
  value,
  onChange,
  onYearChange,
  onPartialChange,
  onBlur,
  error,
  disabled = false,
  monthOptional = false,
}: Props) {
  const parsed = parseValue(value);
  const [month, setMonth] = useState(parsed.month);
  // yearStr tracks what the user has typed (may be partial, e.g. "199")
  const [yearStr, setYearStr] = useState(parsed.year);
  // A started date is partial until its year is valid and, when required, its month is set.
  const isPartial = (m: string, y: string) => !!(m || y) && (!isValidYear(y) || (!monthOptional && !m));
  useDraftFlag(!disabled && isPartial(month, yearStr));

  // Without this, deleting a non-last Work History/Education entry shifts
  // every later row's index — since these pickers are keyed by index, React
  // reuses the same instance for a different entry's date, and the useState
  // initializers above (which only run once, on mount) would otherwise leave
  // it showing stale month/year until the user retypes it. emit() itself
  // returns '' the moment the year is only partially typed (the documented
  // onChange('') trap — see CLAUDE.md's Known Traps), which is why
  // useResyncOnExternalChange deliberately doesn't treat an empty value as
  // an external reset.
  useResyncOnExternalChange(value, () => {
    setMonth(parsed.month);
    setYearStr(parsed.year);
  });

  const emit = (m: string, y: string) => {
    if (m && y) onChange(`${y}-${m}`);
    else if (monthOptional && y) onChange(y);
    else onChange('');
  };

  const handleMonth = (m: string) => {
    setMonth(m);
    onPartialChange?.(isPartial(m, yearStr));
    emit(m, isValidYear(yearStr) ? yearStr : '');
  };

  const handleYearInput = (raw: string) => {
    // Strip non-digits, cap at 4 chars
    const cleaned = raw.replace(/\D/g, '').slice(0, 4);
    setYearStr(cleaned);
    onPartialChange?.(isPartial(month, cleaned));
    emit(month, isValidYear(cleaned) ? cleaned : '');
    onYearChange?.(cleaned);
  };

  const inputCls = fieldCls(error, disabled);

  const handleGroupBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Only fire when focus moves outside the entire month+year group,
    // not when tabbing between month and year within the picker.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      onBlur?.(month, yearStr);
    }
  };

  return (
    <div className="flex gap-2" onBlur={handleGroupBlur}>
      <div className="flex-1 min-w-0">
        <select
          id={!monthOptional ? id : undefined}
          className={inputCls}
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
      <div className="w-18 sm:w-20 shrink-0">
        <input
          id={monthOptional ? id : undefined}
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          className={inputCls}
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
