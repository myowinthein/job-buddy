import { withScheme } from './url';
import type { NoticePeriodUnit } from '../types/profile';
import { ETHNICITIES } from '../data/ethnicities';

export function isValidPersonalOption(key: string, value: string): boolean {
  if (!value) return true;
  if (key === 'gender') return ['male', 'female', 'other', 'prefer_not_to_say'].includes(value);
  if (key === 'ethnicity')
    return value === 'prefer_not_to_say' || ETHNICITIES.some((ethnicity) => ethnicity === value);
  if (key === 'veteranStatus' || key === 'disabilityStatus')
    return ['yes', 'no', 'prefer_not_to_say'].includes(value);
  return true;
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
  return /^\d{4,15}$/.test(value);
}

export function isValidAmount(value: string | number): boolean {
  return String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function isValidProfileUrl(value: string): boolean {
  if (value.length > 2048) return false;
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
  const pattern = yearOnly ? /^\d{4}(-(?:0[1-9]|1[0-2]))?$/ : /^\d{4}-(?:0[1-9]|1[0-2])$/;
  for (const key of ['startDate', 'endDate'] as const) {
    if (key === 'endDate' && row.isCurrent) continue;
    const value = row[key] ?? '';
    const label = key === 'startDate' ? 'Start date' : 'End date';
    if (!value.trim()) errors[key] = `${label} is required`;
    else if (!pattern.test(value))
      errors[key] = `Enter ${yearOnly ? 'a year or month and year' : 'a month and year'}`;
    else if (Number(value.slice(0, 4)) < year - 100 || Number(value.slice(0, 4)) > year)
      errors[key] = `Year must be between ${year - 100} and ${year}`;
  }
  if (!row.isCurrent && !errors.startDate && !errors.endDate) {
    const start = row.startDate!.length === 4 ? `${row.startDate}-01` : row.startDate!;
    const end = row.endDate!.length === 4 ? `${row.endDate}-12` : row.endDate!;
    if (end < start) errors.endDate = 'End date cannot be before start date';
  }
  return errors;
}

export function isValidProfileEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
