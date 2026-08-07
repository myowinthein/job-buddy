import { describe, it, expect } from 'vitest';
import { daysInMonth, computePartial, buildDOB, parseDOB } from './dateOfBirthMath';

describe('daysInMonth', () => {
  it('returns 31 when month is not yet set', () => {
    expect(daysInMonth(0, 2024)).toBe(31);
  });

  it('assumes a leap year (29) for February when year is not yet set', () => {
    expect(daysInMonth(2, 0)).toBe(29);
  });

  it('returns 30 for the other short months when year is not yet set', () => {
    expect(daysInMonth(4, 0)).toBe(30);
    expect(daysInMonth(6, 0)).toBe(30);
    expect(daysInMonth(9, 0)).toBe(30);
    expect(daysInMonth(11, 0)).toBe(30);
  });

  it('returns 31 for long months when year is not yet set', () => {
    expect(daysInMonth(1, 0)).toBe(31);
    expect(daysInMonth(7, 0)).toBe(31);
  });

  it('returns 29 for February in a real leap year', () => {
    expect(daysInMonth(2, 2024)).toBe(29);
  });

  it('returns 28 for February in a real non-leap year', () => {
    expect(daysInMonth(2, 2023)).toBe(28);
  });

  it('returns the correct day count once both month and year are known', () => {
    expect(daysInMonth(4, 2024)).toBe(30);
    expect(daysInMonth(1, 2024)).toBe(31);
  });
});

describe('computePartial', () => {
  it('returns false when nothing is filled', () => {
    expect(computePartial('', 0, '')).toBe(false);
  });

  it('returns true when only one of day/month/year is filled', () => {
    expect(computePartial('15', 0, '')).toBe(true);
    expect(computePartial('', 6, '')).toBe(true);
    expect(computePartial('', 0, '1990')).toBe(true);
  });

  it('returns true when exactly two of day/month/year are filled', () => {
    expect(computePartial('15', 6, '')).toBe(true);
  });

  it('returns false when all three are filled', () => {
    expect(computePartial('15', 6, '1990')).toBe(false);
  });
});

describe('parseDOB', () => {
  it('parses a well-formed ISO date into its numeric components', () => {
    expect(parseDOB('1990-06-05')).toEqual({ year: 1990, month: 6, day: 5 });
  });

  it('returns all zeros for an empty string', () => {
    expect(parseDOB('')).toEqual({ month: 0, day: 0, year: 0 });
  });

  it('defaults missing or non-numeric parts to 0 rather than NaN', () => {
    expect(parseDOB('1990')).toEqual({ year: 1990, month: 0, day: 0 });
    expect(parseDOB('1990-06')).toEqual({ year: 1990, month: 6, day: 0 });
    expect(parseDOB('abcd-ef-gh')).toEqual({ year: 0, month: 0, day: 0 });
  });

  it('round-trips through buildDOB for a well-formed date', () => {
    const parsed = parseDOB('2000-12-25');
    expect(buildDOB(parsed.month, parsed.day, parsed.year)).toBe('2000-12-25');
  });
});

describe('buildDOB', () => {
  it('returns an ISO date string with zero-padded month and day', () => {
    expect(buildDOB(6, 5, 1990)).toBe('1990-06-05');
  });

  it('does not need padding for double-digit month/day', () => {
    expect(buildDOB(12, 25, 2000)).toBe('2000-12-25');
  });

  it('returns "" when month is missing', () => {
    expect(buildDOB(0, 5, 1990)).toBe('');
  });

  it('returns "" when day is missing', () => {
    expect(buildDOB(6, 0, 1990)).toBe('');
  });

  it('returns "" when year is missing', () => {
    expect(buildDOB(6, 5, 0)).toBe('');
  });
});
