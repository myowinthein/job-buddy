import { useState } from 'react';
import { fieldCls } from './fieldCls';
import { daysInMonth, parseDOB, buildDOB, computePartial } from './dateOfBirthMath';

const MONTHS = [
  { value: 1,  label: 'January' },
  { value: 2,  label: 'February' },
  { value: 3,  label: 'March' },
  { value: 4,  label: 'April' },
  { value: 5,  label: 'May' },
  { value: 6,  label: 'June' },
  { value: 7,  label: 'July' },
  { value: 8,  label: 'August' },
  { value: 9,  label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = CURRENT_YEAR - 100;

interface Props {
  value: string;      // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  // Fires when partial-state changes. true = some but not all of day/month/year
  // have content; false = either all three filled or all three empty. Lets the
  // parent show a "must complete if started" error without making DOB required.
  onPartialChange?: (isPartial: boolean) => void;
  error?: string;
  id?: string;
}

export function DateOfBirthPicker({ value, onChange, onPartialChange, error, id }: Props) {
  const parsed = parseDOB(value);
  const [month, setMonth] = useState(parsed.month);
  const [day,   setDay]   = useState(parsed.day);
  const [year,  setYear]  = useState(parsed.year);

  const [dayStr,  setDayStr]  = useState(parsed.day  ? String(parsed.day)  : '');
  const [yearStr, setYearStr] = useState(parsed.year ? String(parsed.year) : '');

  // Resync when `value` changes on an already-mounted instance (e.g. a list
  // index shift after a sibling entry is deleted elsewhere in the profile) —
  // the useState initializers above only run once, on mount. Adjusted during
  // render (React's recommended pattern for this) rather than in an effect,
  // so there's no extra commit/flicker between the stale and resynced values.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setMonth(parsed.month);
    setDay(parsed.day);
    setYear(parsed.year);
    setDayStr(parsed.day  ? String(parsed.day)  : '');
    setYearStr(parsed.year ? String(parsed.year) : '');
  }

  // Inline range errors shown below the entire row, not inside individual inputs
  const [dayError,  setDayError]  = useState('');
  const [yearError, setYearError] = useState('');

  const hasAnyError = !!error || !!dayError || !!yearError;
  const inputCls = fieldCls(hasAnyError ? 'error' : undefined);

  const handleDayInput = (raw: string) => {
    const cleaned = raw.replace(/\D/g, '').slice(0, 2);
    setDayStr(cleaned);
    const n = parseInt(cleaned, 10);
    const inRange = cleaned.length > 0 && !isNaN(n) && n >= 1 && n <= 31;
    const d = inRange ? n : 0;
    setDay(d);
    setDayError(cleaned.length > 0 && !inRange ? 'Day must be between 1 and 31' : '');
    onChange(buildDOB(month, d, year));
    onPartialChange?.(computePartial(cleaned, month, yearStr));
  };

  const handleMonth = (m: number) => {
    setMonth(m);
    const max = daysInMonth(m, year);
    const d = day > max ? max : day;
    const nextDayStr = d !== day ? (d ? String(d) : '') : dayStr;
    if (d !== day) { setDay(d); setDayStr(nextDayStr); }
    onChange(buildDOB(m, d, year));
    onPartialChange?.(computePartial(nextDayStr, m, yearStr));
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
    const max = daysInMonth(month, y);
    const d = day > max ? max : day;
    const nextDayStr = d !== day ? (d ? String(d) : '') : dayStr;
    if (d !== day) { setDay(d); setDayStr(nextDayStr); }
    onChange(buildDOB(month, d, y));
    onPartialChange?.(computePartial(nextDayStr, month, cleaned));
  };

  // Show the first active error; the outer FormField may also supply one
  const inlineError = dayError || yearError;

  return (
    <div>
      <div className="flex gap-2">
        {/* Day — text input, digits only, 1–31 */}
        <div className="w-16">
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
        <div className="flex-1 flex gap-2">
          <div className="flex-1">
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
          <div className="w-20">
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
