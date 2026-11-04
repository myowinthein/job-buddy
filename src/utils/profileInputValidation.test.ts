import { describe, expect, it } from 'vitest';
import {
  isLinkedInUrl,
  isValidProfileEmail,
  birthDateError,
  isValidProfilePhone,
  isValidAmount,
  noticeDurationError,
  profileDateRangeErrors,
  isValidPersonalOption,
  isValidProfileOption,
  isValidProfileCurrency,
  isValidProfileYearMonth,
} from './profileInputValidation';
import { PROFILE_POLICY_PATHS, profileFieldPolicy } from '../profile/fieldPolicies';
import { validateImportedProfile } from './profileValidator';

describe('profile input and import validation agree', () => {
  it.each(["o'brien@example.com", 'jane+jobs@sub.example.co.uk'])(
    'preserves editor-valid email %s in imports',
    (email) => {
      expect(isValidProfileEmail(email)).toBe(true);
      expect(validateImportedProfile({ personal: { email } }).sanitized.personal?.email).toBe(
        email,
      );
    },
  );

  it.each(['not-an-email', 'has space@example.com', `${'a'.repeat(250)}@example.com`])(
    'rejects invalid email %s',
    (email) => {
      expect(isValidProfileEmail(email)).toBe(false);
      expect(validateImportedProfile({ personal: { email } }).valid).toBe(false);
    },
  );

  it.each([
    'linkedin.com/in/jane',
    'https://www.linkedin.com/in/jane',
    'https://uk.linkedin.com/in/jane',
  ])('accepts LinkedIn hostname %s', (url) => {
    expect(isLinkedInUrl(url)).toBe(true);
    expect(validateImportedProfile({ links: { linkedin: url } }).valid).toBe(true);
  });

  it.each([
    'https://linkedin.com.evil.test/in/jane',
    'https://example.com/linkedin.com',
    'https://linkedin.com@evil.test',
    'not linkedin.com',
  ])('rejects misleading LinkedIn URL %s', (url) => {
    expect(isLinkedInUrl(url)).toBe(false);
    expect(validateImportedProfile({ links: { linkedin: url } }).valid).toBe(false);
  });
});

describe('profile input boundaries', () => {
  it.each(['2024-02-30', '2023-02-29', '2020-13-01', '2020-00-01', '2020-01-00'])(
    'rejects impossible birthday %s',
    (value) => {
      expect(birthDateError(value)).toBe('Enter a valid date of birth');
    },
  );
  it('accepts a leap day and rejects a future date within the current year', () => {
    const today = new Date(2026, 0, 10);
    expect(birthDateError('2024-02-29', today)).toBe('');
    expect(birthDateError('2026-02-01', today)).toBe('Date of birth cannot be in the future');
  });
  it.each(['123', '1'.repeat(16), '12abc345', '+123456'])(
    'rejects invalid local phone %s',
    (value) => {
      expect(isValidProfilePhone(value)).toBe(false);
    },
  );
  it('accepts phone boundaries and finite non-negative amounts, including decimals and zero', () => {
    expect(isValidProfilePhone('1234')).toBe(true);
    expect(isValidProfilePhone('1'.repeat(15))).toBe(true);
    expect(isValidAmount(0)).toBe(true);
    expect(isValidAmount('1.50')).toBe(true);
    for (const value of [Infinity, NaN, '1e999', '', -1]) expect(isValidAmount(value)).toBe(false);
  });
  it('requires integer notice periods within the unit bounds', () => {
    expect(noticeDurationError('1.5', 'week')).toBe('Enter a whole number');
    expect(noticeDurationError('53', 'week')).toBe('Maximum is 52 weeks');
    expect(noticeDurationError('52', 'week')).toBe('');
  });
  it('checks date format, month validity, chronological order and ongoing entries', () => {
    expect(profileDateRangeErrors({ startDate: '2020-13', isCurrent: true })).toHaveProperty(
      'startDate',
    );
    expect(
      profileDateRangeErrors({ startDate: '2020-01', endDate: '2019-12', isCurrent: false }),
    ).toHaveProperty('endDate');
    expect(profileDateRangeErrors({ startDate: '2020', endDate: '2021' })).toHaveProperty(
      'startDate',
    );
    expect(profileDateRangeErrors({ startDate: '2020', endDate: '2021' }, true)).toEqual({});
    expect(profileDateRangeErrors({ startDate: '2020-01', isCurrent: true })).toEqual({});
  });
});

it('keeps optional personal choices optional and validates populated enum values', () => {
  for (const key of ['gender', 'ethnicity', 'veteranStatus', 'disabilityStatus']) {
    expect(isValidPersonalOption(key, '')).toBe(true);
    expect(isValidPersonalOption(key, 'prefer_not_to_say')).toBe(true);
    expect(isValidPersonalOption(key, 'unknown')).toBe(false);
  }
});

it('validates every declared option through the same field policy', () => {
  for (const path of PROFILE_POLICY_PATHS) {
    const options = profileFieldPolicy(path).options;
    if (!options) continue;
    for (const value of options) expect(isValidProfileOption(path, value), path).toBe(true);
    for (const value of ['', 'unknown', 0, false, null, undefined])
      expect(isValidProfileOption(path, value), path).toBe(false);
  }
});

it('shares exact currency codes and month/year formats across consumers', () => {
  expect(isValidProfileCurrency('USD')).toBe(true);
  for (const value of ['usd', ' USD', 'US', '', 123, undefined])
    expect(isValidProfileCurrency(value)).toBe(false);
  for (const value of ['2020-01', '2020-12']) {
    expect(isValidProfileYearMonth(value)).toBe(true);
    expect(isValidProfileYearMonth(value, true)).toBe(true);
  }
  expect(isValidProfileYearMonth('2020')).toBe(false);
  expect(isValidProfileYearMonth('2020', true)).toBe(true);
  for (const value of ['2020-00', '2020-13', '2020-1', '2020-01-01', '2020 ', 2020]) {
    expect(isValidProfileYearMonth(value)).toBe(false);
    expect(isValidProfileYearMonth(value, true)).toBe(false);
  }
});
