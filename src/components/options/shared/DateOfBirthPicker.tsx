import { useState } from 'react';

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
  error?: string;
  id?: string;
}

function daysInMonth(month: number, year: number): number {
  if (!month) return 31;
  if (!year) return month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return new Date(year, month, 0).getDate();
}

function parseDOB(raw: string): { month: number; day: number; year: number } {
  if (!raw) return { month: 0, day: 0, year: 0 };
  const parts = raw.split('-');
  return {
    year:  parseInt(parts[0] ?? '', 10) || 0,
    month: parseInt(parts[1] ?? '', 10) || 0,
    day:   parseInt(parts[2] ?? '', 10) || 0,
  };
}

function buildDOB(month: number, day: number, year: number): string {
  if (!month || !day || !year) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function DateOfBirthPicker({ value, onChange, error, id }: Props) {
  const parsed = parseDOB(value);
  const [month, setMonth] = useState(parsed.month);
  const [day,   setDay]   = useState(parsed.day);
  const [year,  setYear]  = useState(parsed.year);

  // Separate string states so the user can type partial values without the
  // controlled inputs snapping back on every keystroke.
  const [dayStr,  setDayStr]  = useState(parsed.day  ? String(parsed.day)  : '');
  const [yearStr, setYearStr] = useState(parsed.year ? String(parsed.year) : '');

  const borderCls = error
    ? 'border-red-300 focus:ring-red-500'
    : 'border-gray-300 focus:ring-blue-500';
  const fieldCls = `w-full px-3 py-2 text-sm border ${borderCls} rounded-lg focus:outline-none focus:ring-2 bg-white`;

  const handleDayInput = (raw: string) => {
    // Strip non-digits, cap at 2 chars
    const cleaned = raw.replace(/\D/g, '').slice(0, 2);
    setDayStr(cleaned);
    const n = parseInt(cleaned, 10);
    const valid = cleaned.length > 0 && !isNaN(n) && n >= 1 && n <= 31;
    const d = valid ? n : 0;
    setDay(d);
    onChange(buildDOB(month, d, year));
  };

  const handleMonth = (m: number) => {
    setMonth(m);
    const max = daysInMonth(m, year);
    const d = day > max ? max : day;
    if (d !== day) { setDay(d); setDayStr(d ? String(d) : ''); }
    onChange(buildDOB(m, d, year));
  };

  const handleYearInput = (raw: string) => {
    // Strip non-digits, cap at 4 chars
    const cleaned = raw.replace(/\D/g, '').slice(0, 4);
    setYearStr(cleaned);
    const n = parseInt(cleaned, 10);
    const valid = cleaned.length === 4 && !isNaN(n) && n >= MIN_YEAR && n <= CURRENT_YEAR;
    const y = valid ? n : 0;
    setYear(y);
    // Re-clamp day when year changes (e.g., Feb 29 → Feb 28 for non-leap years)
    const max = daysInMonth(month, y);
    const d = day > max ? max : day;
    if (d !== day) { setDay(d); setDayStr(d ? String(d) : ''); }
    onChange(buildDOB(month, d, y));
  };

  return (
    <div className="flex gap-2">
      {/* Day — text input, digits only, 1–31 */}
      <div className="w-16">
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{1,2}"
          maxLength={2}
          className={fieldCls}
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
            className={fieldCls}
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

        {/* Year — text input restricted to 4 digits in valid range */}
        <div className="w-20">
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            className={fieldCls}
            value={yearStr}
            onChange={(e) => handleYearInput(e.target.value)}
            placeholder="YYYY"
            aria-label="Year"
          />
        </div>
      </div>
    </div>
  );
}
