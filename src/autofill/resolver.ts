import type { Profile } from '../types/profile';
import { COUNTRIES } from '../data/countries';
import { WORK_AUTH_STATUS_LABELS } from '../data/workAuthorization';
import { fmtYearMonth, fmtAmount } from '../utils/dateFormat';

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
      return cur.currency ? `${fmtAmount(cur.amount)} ${cur.currency}` : fmtAmount(cur.amount);
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

    case 'documents.cv.file': {
      // Returns the filename for pipeline / mapper purposes only — used to
      // ensure match.value is non-empty so a file input doesn't fall into the
      // noData bucket. The actual upload reads the file payload from the
      // profile directly via filler.fillFileField().
      return profile.documents?.cv?.file?.name ?? '';
    }
  }

  // Handle workAuthorization.N — indexed entry, returns specific status label.
  const waMatch = fieldPath.match(/^workAuthorization\.(\d+)$/);
  if (waMatch) {
    const entry = profile.workAuthorization?.[parseInt(waMatch[1], 10)];
    if (!entry) return '';
    return WORK_AUTH_STATUS_LABELS[entry.status] ?? entry.status;
  }

  // Handle salary.expected.N.formatted — formatted amount + currency for the Nth expected entry.
  const expMatch = fieldPath.match(/^salary\.expected\.(\d+)\.formatted$/);
  if (expMatch) {
    const entry = profile.salary?.expected?.[parseInt(expMatch[1], 10)];
    if (!entry?.amount) return '';
    return entry.currency ? `${fmtAmount(entry.amount)} ${entry.currency}` : fmtAmount(entry.amount);
  }

  // Handle workHistory.N.* — virtual / computed sub-fields.
  // Simple string fields (title, company, description, startDate, endDate) fall
  // through to the generic traversal below; only non-string fields need cases.
  const whMatch = fieldPath.match(/^workHistory\.(\d+)\.(.+)$/);
  if (whMatch) {
    const entry = profile.workHistory?.[parseInt(whMatch[1], 10)];
    if (!entry) return '';
    switch (whMatch[2]) {
      case 'isCurrent':           return entry.isCurrent ? 'Yes' : '';
      case 'arrangement':         return entry.arrangement ? entry.arrangement.charAt(0).toUpperCase() + entry.arrangement.slice(1) : '';
      case 'startDate.formatted': return fmtYearMonth(entry.startDate ?? '');
      case 'endDate.formatted':   return entry.isCurrent ? 'Present' : fmtYearMonth(entry.endDate ?? '');
      case 'location': {
        const parts: string[] = [];
        if (entry.location?.city) parts.push(entry.location.city);
        if (entry.location?.countryCode) parts.push(COUNTRIES.find(c => c.code === entry.location!.countryCode)?.name ?? entry.location.countryCode);
        return parts.join(', ');
      }
    }
    // Other sub-fields fall through to generic traversal.
  }

  // Handle education.N.* — virtual / computed sub-fields.
  const eduMatch = fieldPath.match(/^education\.(\d+)\.(.+)$/);
  if (eduMatch) {
    const entry = profile.education?.[parseInt(eduMatch[1], 10)];
    if (!entry) return '';
    switch (eduMatch[2]) {
      case 'isCurrent':           return entry.isCurrent ? 'Yes' : '';
      case 'startDate.formatted': return fmtYearMonth(entry.startDate ?? '');
      case 'endDate.formatted':   return entry.isCurrent ? 'Present' : fmtYearMonth(entry.endDate ?? '');
    }
    // Other sub-fields fall through to generic traversal.
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
