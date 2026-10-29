import { useState } from 'react';
import { fieldCls } from './fieldCls';
import { daysInMonth, parseDOB, buildDOB } from './dateOfBirthMath';
import { MONTH_NAMES } from './months';
import { useResyncOnExternalChange } from './useResyncOnExternalChange';

const MONTHS = MONTH_NAMES.map((label, i) => ({ value: i + 1, label }));

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = CURRENT_YEAR - 100;

interface Props {
  value: string;      // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  // Reports incomplete or invalid typed components; false when valid or empty.
  // This lets the
  // parent show a "must complete if started" error without making DOB required.
  onPartialChange?: (isPartial: boolean) => void;
  error?: string;
  id?: string;
}

export function DateOfBirthPicker({ value, onChange, onPartialChange, error, id }: Props) {
  const parsed = parseDOB(value);
  const [month, setMonth] = useState(parsed.month);
  const [year,  setYear]  = useState(parsed.year);

  const [dayStr,  setDayStr]  = useState(parsed.day  ? String(parsed.day)  : '');
  const [yearStr, setYearStr] = useState(parsed.year ? String(parsed.year) : '');

  // buildDOB() returns '' the moment ANY one of month/day/year is cleared
  // mid-edit (see buildDOB below), and callers commonly echo onChange's
  // result straight back as this prop (see PersonalSection's `set()`) — see
  // useResyncOnExternalChange for why an empty value is deliberately not
  // treated as an external reset.
  useResyncOnExternalChange(value, () => {
    setMonth(parsed.month);
    setYear(parsed.year);
    setDayStr(parsed.day  ? String(parsed.day)  : '');
    setYearStr(parsed.year ? String(parsed.year) : '');
  });

  // Inline range errors shown below the entire row, not inside individual inputs
  const [dayError,  setDayError]  = useState('');
  const [yearError, setYearError] = useState('');

  const hasAnyError = !!error || !!dayError || !!yearError;
  const inputCls = fieldCls(hasAnyError ? 'error' : undefined);

  const emit = (m: number, d: number, y: number, dayText: string, yearText: string) => {
    const value = buildDOB(m, d, y);
    onChange(value);
    onPartialChange?.(!!(dayText || m || yearText) && !value);
  };

  // Revalidate raw day text when changing month/year, including a previously invalid day.
  const resyncDay = (m: number, y: number) => {
    const rawDay = Number(dayStr);
    const max = daysInMonth(m, y);
    const d = rawDay >= 1 && rawDay <= 31 ? Math.min(rawDay, max) : 0;
    const text = d ? String(d) : dayStr;
    setDayStr(text);
    setDayError(dayStr && !d ? `Day must be between 1 and ${max}` : '');
    return { d, text };
  };

  const handleDayInput = (raw: string) => {
    const cleaned = raw.replace(/\D/g, '').slice(0, 2);
    setDayStr(cleaned);
    const n = parseInt(cleaned, 10);
    const max = daysInMonth(month, year);
    const inRange = cleaned.length > 0 && !isNaN(n) && n >= 1 && n <= max;
    const d = inRange ? n : 0;
    setDayError(cleaned.length > 0 && !inRange ? `Day must be between 1 and ${max}` : '');
    emit(month, d, year, cleaned, yearStr);
  };

  const handleMonth = (m: number) => {
    setMonth(m);
    const { d, text } = resyncDay(m, year);
    emit(m, d, year, text, yearStr);
  };

  const handleYearInput = (raw: string) => {
    const cleaned = raw.replace(/\D/g, '').slice(0, 4);
    setYearStr(cleaned);
    const n = parseInt(cleaned, 10);
    const inRange = cleaned.length === 4 && !isNaN(n) && n >= MIN_YEAR && n <= CURRENT_YEAR;
    const y = inRange ? n : 0;
    setYear(y);
    setYearError(
      cleaned.length === 4 && !inRange
        ? `Year must be between ${MIN_YEAR} and ${CURRENT_YEAR}`
        : '',
    );
    const { d, text } = resyncDay(month, y);
    emit(month, d, y, text, cleaned);
  };

  // Show the first active error; the outer FormField may also supply one
  const inlineError = dayError || yearError;

  return (
    <div>
      <div className="flex gap-2">
        {/* Day — text input, digits only, 1–31 */}
        <div className="w-12 sm:w-16 shrink-0">
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{1,2}"
            maxLength={2}
            className={inputCls}
            value={dayStr}
            onChange={(e) => handleDayInput(e.target.value)}
            placeholder="DD"
            aria-label="Day"
            id={id}
          />
        </div>

        {/* Month + Year — same proportions as MonthYearPicker */}
        <div className="flex-1 min-w-0 flex gap-2">
          <div className="flex-1 min-w-0">
            <select
              className={inputCls}
              value={month || ''}
              onChange={(e) => handleMonth(Number(e.target.value))}
              aria-label="Month"
            >
              <option value="">Month</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Year — text input restricted to 4 digits */}
          <div className="w-18 sm:w-20 shrink-0">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              className={inputCls}
              value={yearStr}
              onChange={(e) => handleYearInput(e.target.value)}
              placeholder="YYYY"
              aria-label="Year"
            />
          </div>
        </div>
      </div>

      {/* Single error line spanning the full width of the date row */}
      {inlineError && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{inlineError}</p>}
    </div>
  );
}
