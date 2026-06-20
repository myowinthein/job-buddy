import type { Profile } from '../types/profile';
import { COUNTRIES } from '../data/countries';

const WORK_AUTH_LABELS: Record<string, string> = {
  citizen_or_pr:        'Citizen / PR',
  work_visa:            'Work Visa',
  requires_sponsorship: 'Requires Sponsorship',
};

function formatAmount(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function resolveProfileValue(profile: Profile, fieldPath: string): string {
  if (!fieldPath) return '';

  // Special cases that need non-trivial handling
  switch (fieldPath) {
    case 'personal.phone.number':
      return profile.personal?.phone?.number ?? '';

    case 'personal.phone.callingCode':
      return profile.personal?.phone?.callingCode ?? '';

    case 'personal.phone.full': {
      const phone = profile.personal?.phone;
      const cc  = phone?.callingCode ?? '';
      const num = phone?.number ?? '';
      if (!cc && !num) return '';
      if (!cc) return num;
      if (!num) return cc;
      return `${cc} ${num}`;
    }

    case 'personal.dateOfBirth.day': {
      const dob = profile.personal?.dateOfBirth;
      return dob ? (dob.split('-')[2] ?? '') : '';
    }

    case 'personal.dateOfBirth.month': {
      const dob = profile.personal?.dateOfBirth;
      return dob ? (dob.split('-')[1] ?? '') : '';
    }

    case 'personal.dateOfBirth.year': {
      const dob = profile.personal?.dateOfBirth;
      return dob ? (dob.split('-')[0] ?? '') : '';
    }

    case 'address.countryName': {
      const code = profile.address?.country;
      if (!code) return '';
      return COUNTRIES.find(c => c.code === code)?.name ?? code;
    }

    case 'salary.current.formatted': {
      const cur = profile.salary?.current;
      if (!cur?.amount) return '';
      return cur.currency ? `${formatAmount(cur.amount)} ${cur.currency}` : formatAmount(cur.amount);
    }

    case 'derived.totalExperience.years': {
      const years = profile.derived?.totalExperience?.years;
      return years != null ? String(years) : '';
    }

    case 'workAuthorization': {
      // Legacy path used by autofill dictionary / learned mappings for the first entry.
      const entry = profile.workAuthorization?.[0];
      if (!entry) return '';
      return entry.status === 'requires_sponsorship'
        ? 'Requires sponsorship'
        : 'Yes, authorized to work';
    }
  }

  // Handle workAuthorization.N — indexed entry, returns specific status label.
  const waMatch = fieldPath.match(/^workAuthorization\.(\d+)$/);
  if (waMatch) {
    const entry = profile.workAuthorization?.[parseInt(waMatch[1], 10)];
    if (!entry) return '';
    return WORK_AUTH_LABELS[entry.status] ?? entry.status;
  }

  // Handle salary.expected.N.formatted — formatted amount + currency for the Nth expected entry.
  const expMatch = fieldPath.match(/^salary\.expected\.(\d+)\.formatted$/);
  if (expMatch) {
    const entry = profile.salary?.expected?.[parseInt(expMatch[1], 10)];
    if (!entry?.amount) return '';
    return entry.currency ? `${formatAmount(entry.amount)} ${entry.currency}` : formatAmount(entry.amount);
  }

  // Generic dot-notation traversal for all other paths
  const parts = fieldPath.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = profile;
  for (const part of parts) {
    if (current == null) return '';
    current = current[part];
  }

  if (current == null) return '';
  if (typeof current === 'number') return String(current);
  if (typeof current === 'string') return current;
  return '';
}
