const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Converts a "YYYY-MM" profile date string to "Mon YYYY". Returns the raw
// value unchanged if it doesn't match the expected format.
export function fmtYearMonth(ym: string): string {
  if (!ym) return '';
  const [year, m] = ym.split('-');
  const month = m ? MONTHS[parseInt(m, 10) - 1] : undefined;
  if (month && year) return `${month} ${year}`;
  return year ?? ym;
}
