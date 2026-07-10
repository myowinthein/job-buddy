import { describe, it, expect } from 'vitest';
import { fmtYearMonth, fmtAmount, formatISODate } from './dateFormat';

describe('formatISODate', () => {
  it('formats a plain local date as YYYY-MM-DD', () => {
    // Constructed with explicit local components (year, monthIndex, day).
    expect(formatISODate(new Date(2023, 5, 9))).toBe('2023-06-09');
  });

  it('zero-pads single-digit month and day', () => {
    expect(formatISODate(new Date(2024, 0, 1))).toBe('2024-01-01');
  });

  it('handles a two-digit month and day without padding artifacts', () => {
    expect(formatISODate(new Date(2020, 11, 31))).toBe('2020-12-31');
  });

  it('uses local calendar arithmetic, not UTC (late-evening local time)', () => {
    // 11:30 PM local on Jan 15. In many negative-offset UTC zones the UTC
    // date would already be Jan 16, so toISOString() could disagree. This
    // asserts the LOCAL calendar day is preserved regardless of timezone.
    const d = new Date(2023, 0, 15, 23, 30, 0);
    expect(formatISODate(d)).toBe('2023-01-15');
    // Guard the assertion: the local calendar day is what we format.
    expect(formatISODate(d)).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  });

  it('preserves the local day for an early-morning local time', () => {
    // 00:30 local on Jul 4. In positive-offset zones the UTC date could be
    // Jul 3; formatISODate must still report the local day.
    const d = new Date(2023, 6, 4, 0, 30, 0);
    expect(formatISODate(d)).toBe('2023-07-04');
  });
});

describe('fmtYearMonth', () => {
  it('returns empty string for empty input', () => {
    expect(fmtYearMonth('')).toBe('');
  });

  it('formats January correctly', () => {
    expect(fmtYearMonth('2020-01')).toBe('January 2020');
  });

  it('formats June correctly', () => {
    expect(fmtYearMonth('2023-06')).toBe('June 2023');
  });

  it('formats December correctly', () => {
    expect(fmtYearMonth('2020-12')).toBe('December 2020');
  });

  it('returns the year only when month part is absent', () => {
    expect(fmtYearMonth('2020')).toBe('2020');
  });

  it('returns the whole string as the year when no hyphen is present', () => {
    expect(fmtYearMonth('notadate')).toBe('notadate');
  });

  it('returns the first segment when the month part is not a valid number', () => {
    // 'not-a-date' splits to year='not', m='a'; parseInt('a') is NaN so month is
    // undefined → falls back to returning year ('not').
    expect(fmtYearMonth('not-a-date')).toBe('not');
  });
});

describe('fmtAmount', () => {
  it('formats a whole number with thousands separator', () => {
    expect(fmtAmount(80000)).toBe('80,000');
  });

  it('formats a million', () => {
    expect(fmtAmount(1000000)).toBe('1,000,000');
  });

  it('rounds fractional amounts', () => {
    expect(fmtAmount(80000.7)).toBe('80,001');
  });

  it('returns zero as "0"', () => {
    expect(fmtAmount(0)).toBe('0');
  });

  it('returns small numbers without separator', () => {
    expect(fmtAmount(999)).toBe('999');
  });
});
