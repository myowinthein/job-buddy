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
