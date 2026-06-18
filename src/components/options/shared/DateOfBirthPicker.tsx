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

interface Props {
  value: string;      // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  error?: string;
}

function daysInMonth(month: number, year: number): number {
  if (!month) return 31;
  if (!year) {
    // Feb without known year: allow 29 (leap years exist)
    return month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  }
  // new Date(year, month, 0) gives last day of the given month (1-indexed month)
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

export function DateOfBirthPicker({ value, onChange, error }: Props) {
  const parsed = parseDOB(value);
  const [month, setMonth] = useState(parsed.month);
  const [day,   setDay]   = useState(parsed.day);
  const [year,  setYear]  = useState(parsed.year);

  const maxDay = daysInMonth(month, year);

  const borderCls = error
    ? 'border-red-300 focus:ring-red-500'
    : 'border-gray-300 focus:ring-blue-500';
  const selectCls = `w-full px-3 py-2 text-sm border ${borderCls} rounded-lg focus:outline-none focus:ring-2 bg-white`;

  const handleMonth = (m: number) => {
    setMonth(m);
    const max = daysInMonth(m, year);
    const d = day > max ? max : day;
    setDay(d);
    onChange(buildDOB(m, d, year));
  };

  const handleDay = (d: number) => {
    setDay(d);
    onChange(buildDOB(month, d, year));
  };

  const handleYear = (y: number) => {
    setYear(y);
    const max = daysInMonth(month, y);
    const d = day > max ? max : day;
    setDay(d);
    onChange(buildDOB(month, d, y));
  };

  const years: number[] = [];
  for (let y = CURRENT_YEAR; y >= CURRENT_YEAR - 100; y--) years.push(y);

  const days: number[] = [];
  for (let d = 1; d <= maxDay; d++) days.push(d);

  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <select
          className={selectCls}
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
      <div className="w-20">
        <select
          className={selectCls}
          value={day || ''}
          onChange={(e) => handleDay(Number(e.target.value))}
          aria-label="Day"
        >
          <option value="">Day</option>
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="w-24">
        <select
          className={selectCls}
          value={year || ''}
          onChange={(e) => handleYear(Number(e.target.value))}
          aria-label="Year"
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
