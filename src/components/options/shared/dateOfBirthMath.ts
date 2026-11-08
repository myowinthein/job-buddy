export function daysInMonth(month: number, year: number): number {
  if (!month) return 31;
  if (!year) return month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return new Date(year, month, 0).getDate();
}

export function parseDOB(raw: string): { month: number; day: number; year: number } {
  if (!raw) return { month: 0, day: 0, year: 0 };
  const parts = raw.split('-');
  return {
    year:  parseInt(parts[0] ?? '', 10) || 0,
    month: parseInt(parts[1] ?? '', 10) || 0,
    day:   parseInt(parts[2] ?? '', 10) || 0,
  };
}

export function buildDOB(month: number, day: number, year: number): string {
  if (!month || !day || !year) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
