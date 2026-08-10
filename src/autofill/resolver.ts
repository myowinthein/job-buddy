import type { Profile } from '../types/profile';
import { COUNTRIES } from '../data/countries';
import { WORK_AUTH_STATUS_LABELS } from '../data/workAuthorization';
import { languageName, LANGUAGE_PROFICIENCY_LABELS } from '../data/languages';
import { fmtYearMonth, fmtAmount, formatISODate } from '../utils/dateFormat';

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

    case 'languages.formatted': {
      const langs = profile.languages ?? [];
      return langs
        .filter(l => l.language)
        .map(l => `${languageName(l.language)} (${LANGUAGE_PROFICIENCY_LABELS[l.proficiency] ?? l.proficiency})`)
        .join(', ');
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

    case 'professional.noticePeriod.availableDate': {
      const np = profile.professional?.noticePeriod;
      if (!np) return '';
      const today = new Date();
      if (np.immediate) return formatISODate(today);
      if (!np.value || !np.unit) return '';
      const target = new Date(today);
      switch (np.unit) {
        case 'day':   target.setDate(target.getDate() + np.value); break;
        case 'week':  target.setDate(target.getDate() + np.value * 7); break;
        case 'month': target.setMonth(target.getMonth() + np.value); break;
      }
      return formatISODate(target);
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
      // Separate city/country sub-fields — for a form that splits location
      // into its own City and Country inputs rather than one combined field.
      case 'location.city': return entry.location?.city ?? '';
      case 'location.countryName': {
        const code = entry.location?.countryCode;
        if (!code) return '';
        return COUNTRIES.find(c => c.code === code)?.name ?? code;
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

  // Handle languages.N.* — language is stored as an ISO code, proficiency as
  // a CEFR-derived key; both need display-name resolution rather than the
  // raw stored value the generic traversal below would return.
  const langMatch = fieldPath.match(/^languages\.(\d+)\.(.+)$/);
  if (langMatch) {
    const entry = profile.languages?.[parseInt(langMatch[1], 10)];
    if (!entry) return '';
    switch (langMatch[2]) {
      case 'language':    return entry.language ? languageName(entry.language) : '';
      case 'proficiency': return entry.proficiency ? (LANGUAGE_PROFICIENCY_LABELS[entry.proficiency] ?? entry.proficiency) : '';
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

export interface FlatProfileValue {
  path:  string;
  value: string;
}

// Reverse of resolveProfileValue: walks the raw Profile object and returns
// every non-empty string/number leaf as a (path, value) pair — used to match
// a manually-typed value back to whichever profile field it most resembles,
// independent of any prior field-match guess. Skips 'id' (not a real
// answerable field) and documents.cv.file (a multi-MB base64 blob — never a
// meaningful comparison target). Only raw stored values; does not include
// virtual/computed paths (phone.full, address.countryName, formatted salary,
// etc.) that resolveProfileValue can produce.
export function flattenProfileValues(profile: Profile): FlatProfileValue[] {
  const out: FlatProfileValue[] = [];

  function walk(node: unknown, path: string): void {
    if (node == null) return;
    if (path === 'id' || path === 'documents.cv.file') return;

    if (typeof node === 'string') {
      if (node) out.push({ path, value: node });
      return;
    }
    if (typeof node === 'number') {
      out.push({ path, value: String(node) });
      return;
    }
    if (typeof node === 'boolean') return; // not a comparable text value
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}.${i}`));
      return;
    }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    }
  }

  walk(profile, '');
  return out;
}
