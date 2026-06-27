import { describe, it, expect } from 'vitest';
import { fmtYearMonth } from './dateFormat';

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
