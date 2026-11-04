import {
  PROFILE_FIELD_POLICIES,
  profileFieldPolicy,
  profileTextLimit,
  URL_MAX_LENGTH,
} from '../profile/fieldPolicies';
import type { ProfileStoragePath } from '../profile/fieldCatalog';
import { CURRENCIES } from '../data/currencies';
import { withScheme } from './url';
import type { NoticePeriodUnit } from '../types/profile';

export function isValidProfileOption(path: ProfileStoragePath, value: unknown): value is string {
  return typeof value === 'string' && !!profileFieldPolicy(path).options?.includes(value);
}

export function isValidProfileCurrency(value: unknown): value is string {
  return typeof value === 'string' && CURRENCIES.some((currency) => currency.code === value);
}

const MONTH_YEAR = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_OR_MONTH_YEAR = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

export function isValidProfileYearMonth(value: unknown, yearOnly = false): value is string {
  return typeof value === 'string' && (yearOnly ? YEAR_OR_MONTH_YEAR : MONTH_YEAR).test(value);
}

export function isValidPersonalOption(key: string, value: string): boolean {
  const path = `personal.${key}`;
  const policy = Object.hasOwn(PROFILE_FIELD_POLICIES, path)
    ? profileFieldPolicy(path as ProfileStoragePath)
    : undefined;
  return !value || !policy?.options || isValidProfileOption(path as ProfileStoragePath, value);
}

export const NOTICE_MAX: Record<NoticePeriodUnit, number> = { day: 365, week: 52, month: 24 };

export function noticeDurationError(raw: string, unit: NoticePeriodUnit): string {
  const value = Number(raw);
  const max = NOTICE_MAX[unit];
  if (!raw.trim() || !Number.isFinite(value)) return 'Enter a duration';
  if (!max) return 'Select a valid unit';
  if (value < 1) return 'Must be at least 1';
  if (!Number.isInteger(value)) return 'Enter a whole number';
  if (value > max) return `Maximum is ${max} ${unit}${max !== 1 ? 's' : ''}`;
  return '';
}

export function isValidProfilePhone(value: string): boolean {
  const policy = profileFieldPolicy('personal.phone.number');
  return (
    /^\d+$/.test(value) && value.length >= policy.minLength! && value.length <= policy.maxLength!
  );
}

export function isValidAmount(value: string | number): boolean {
  return String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function isValidProfileUrl(value: string): boolean {
  if (value.length > URL_MAX_LENGTH) return false;
  try {
    const url = new URL(withScheme(value.trim()));
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      url.hostname.includes('.') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function birthDateError(value: string, today = new Date()): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'Enter a valid date of birth';
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d)
    return 'Enter a valid date of birth';
  if (y > today.getFullYear()) return `Date of birth cannot be after ${today.getFullYear()}`;
  if (date > today) return 'Date of birth cannot be in the future';
  if (y < today.getFullYear() - 100) return `Year must be ${today.getFullYear() - 100} or later`;
  return '';
}

/** Required date rules shared by the editor and saved-profile progress. */
export function profileDateRangeErrors(
  row: { startDate?: string; endDate?: string; isCurrent?: boolean },
  yearOnly = false,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const year = new Date().getFullYear();
  for (const key of ['startDate', 'endDate'] as const) {
    if (key === 'endDate' && row.isCurrent && (!yearOnly || !row.endDate)) continue;
    const value = row[key] ?? '';
    const label = key === 'startDate' ? 'Start date' : 'End date';
    if (!value.trim()) errors[key] = `${label} is required`;
    else if (!isValidProfileYearMonth(value, yearOnly))
      errors[key] = `Enter ${yearOnly ? 'a year or month and year' : 'a month and year'}`;
    else {
      const maxYear = key === 'endDate' && yearOnly && row.isCurrent ? year + 10 : year;
      if (Number(value.slice(0, 4)) < year - 100 || Number(value.slice(0, 4)) > maxYear)
        errors[key] = `Year must be between ${year - 100} and ${maxYear}`;
    }
  }
  if (row.endDate && !errors.startDate && !errors.endDate && (!row.isCurrent || yearOnly)) {
    const start = row.startDate!.length === 4 ? `${row.startDate}-01` : row.startDate!;
    const end = row.endDate!.length === 4 ? `${row.endDate}-12` : row.endDate!;
    if (end < start) errors.endDate = 'End date cannot be before start date';
  }
  return errors;
}

export function isValidProfileEmail(value: string): boolean {
  return (
    value.length <= profileTextLimit('personal.email') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export function isLinkedInUrl(value: string): boolean {
  if (!isValidProfileUrl(value)) return false;
  try {
    const url = new URL(withScheme(value.trim()));
    return (
      (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
