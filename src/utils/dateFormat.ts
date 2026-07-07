// Formats a Date object to a YYYY-MM-DD ISO string in local calendar arithmetic.
export function formatISODate(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

export function fmtAmount(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// Converts a "YYYY-MM" profile date string to "Month YYYY". Returns the raw
// value unchanged if it doesn't match the expected format.
export function fmtYearMonth(ym: string): string {
  if (!ym) return '';
  const [year, m] = ym.split('-');
  const month = m ? MONTHS[parseInt(m, 10) - 1] : undefined;
  if (month && year) return `${month} ${year}`;
  return year ?? ym;
}
