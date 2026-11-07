import type { ProfileStoragePath } from '../profile/fieldCatalog';
import { profileTextLimit, URL_MAX_LENGTH } from '../profile/fieldPolicies';
import { profileData } from './profileData';
import type { Profile } from '../types/profile';
import { findCountryByNameOrCode } from '../data/countries';
import { findLanguage } from '../data/languages';
import {
  MAX_DOCUMENT_FILE_BYTES,
  MAX_DOCUMENT_BASE64_LENGTH,
  DOCUMENT_FILE_SIZE_ERROR,
} from './documentLimits';
import {
  isLinkedInUrl,
  isValidProfileOption,
  isValidProfileCurrency,
  isValidProfileYearMonth,
  isValidProfileEmail,
  isValidProfilePhone,
  birthDateError,
  isValidAmount,
  isValidCalendarDate,
  noticeDurationError,
  profileDateRangeErrors,
  isValidProfileUrl,
} from './profileInputValidation';

export interface InvalidField {
  path: string;
  reason: string;
}

export interface ValidationResult {
  valid: boolean;
  invalidFields: InvalidField[];
  sanitized: Partial<Profile>;
}

export type EntryIndexMap = Record<string, Record<number, number>>;
type AcceptedEntry = (originalIndex: number, keptIndex: number) => void;
type ErrFn = (path: string, reason: string) => void;

// Shared shape validation for documents.cv and documents.coverLetter —
// both are DocumentEntry (optional url, optional file).
function validateDocumentEntry(
  fieldPrefix: string,
  value: Record<string, unknown>,
  err: ErrFn,
): Profile['documents']['cv'] {
  const entry: Profile['documents']['cv'] = {};

  if (value.url !== undefined) {
    if (typeof value.url === 'string' && (!value.url.trim() || isValidProfileUrl(value.url)))
      entry.url = value.url;
    else err(`${fieldPrefix}.url`, `expected a valid URL, max ${URL_MAX_LENGTH} chars`);
  }
  if (value.file !== undefined && typeof value.file === 'object' && value.file !== null) {
    const f = value.file as Record<string, unknown>;
    if (typeof f.name === 'string' && typeof f.size === 'number' && typeof f.base64 === 'string') {
      if (f.size > MAX_DOCUMENT_FILE_BYTES || f.base64.length > MAX_DOCUMENT_BASE64_LENGTH) {
        err(`${fieldPrefix}.file`, DOCUMENT_FILE_SIZE_ERROR);
      } else {
        entry.file = { name: f.name, size: f.size, base64: f.base64 };
      }
    } else {
      err(
        `${fieldPrefix}.file`,
        'expected object with name (string), size (number), base64 (string)',
      );
    }
  }

  return entry;
}

/** Copies a text field that must stay within its policy length, or reports the limit. */
function copyText(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  path: ProfileStoragePath,
  err: ErrFn,
): void {
  const key = path.slice(path.lastIndexOf('.') + 1);
  const value = source[key];
  if (value === undefined) return;
  const max = profileTextLimit(path);
  if (typeof value === 'string' && value.length <= max) target[key] = value;
  else err(path, `expected string, max ${max} chars`);
}

/** Copies a link that is empty or a valid URL, or reports it. */
function copyUrl(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  path: ProfileStoragePath,
  err: ErrFn,
): void {
  const key = path.slice(path.lastIndexOf('.') + 1);
  const value = source[key];
  if (value === undefined) return;
  if (typeof value === 'string' && (!value.trim() || isValidProfileUrl(value))) target[key] = value;
  else err(path, 'expected a valid URL');
}

function validatePersonal(
  data: Record<string, unknown>,
  err: ErrFn,
): Profile['personal'] | undefined {
  if (!('personal' in data) || typeof data.personal !== 'object' || data.personal === null)
    return undefined;
  const p = data.personal as Record<string, unknown>;
  const sp: Record<string, unknown> = {};

  copyText(p, sp, 'personal.firstName', err);
  copyText(p, sp, 'personal.lastName', err);
  copyText(p, sp, 'personal.nickname', err);
  if (p.email !== undefined) {
    if (typeof p.email === 'string' && (!p.email || isValidProfileEmail(p.email)))
      sp.email = p.email;
    else err('personal.email', 'invalid email format');
  }
  if (p.phone !== undefined) {
    if (
      typeof p.phone === 'object' &&
      p.phone !== null &&
      typeof (p.phone as Record<string, unknown>).countryCode === 'string' &&
      typeof (p.phone as Record<string, unknown>).callingCode === 'string' &&
      typeof (p.phone as Record<string, unknown>).number === 'string' &&
      (!(p.phone as Record<string, string>).number ||
        (isValidProfilePhone((p.phone as Record<string, string>).number) &&
          !!findCountryByNameOrCode((p.phone as Record<string, string>).countryCode) &&
          /^\+\d{1,4}$/.test((p.phone as Record<string, string>).callingCode)))
    ) {
      sp.phone = p.phone;
    } else {
      err('personal.phone', 'expected object with countryCode, callingCode, number strings');
    }
  }
  if (p.dateOfBirth !== undefined) {
    if (typeof p.dateOfBirth === 'string' && !birthDateError(p.dateOfBirth))
      sp.dateOfBirth = p.dateOfBirth;
    else err('personal.dateOfBirth', 'invalid date format, expected YYYY-MM-DD');
  }
  if (p.gender !== undefined) {
    if (isValidProfileOption('personal.gender', p.gender)) sp.gender = p.gender;
    else err('personal.gender', 'expected male | female | other | prefer_not_to_say');
  }
  if (p.ethnicity !== undefined) {
    if (isValidProfileOption('personal.ethnicity', p.ethnicity)) sp.ethnicity = p.ethnicity;
    else
      err(
        'personal.ethnicity',
        'expected one of the known ETHNICITIES values or prefer_not_to_say',
      );
  }
  if (p.veteranStatus !== undefined) {
    if (isValidProfileOption('personal.veteranStatus', p.veteranStatus))
      sp.veteranStatus = p.veteranStatus;
    else err('personal.veteranStatus', 'expected yes | no | prefer_not_to_say');
  }
  if (p.disabilityStatus !== undefined) {
    if (isValidProfileOption('personal.disabilityStatus', p.disabilityStatus))
      sp.disabilityStatus = p.disabilityStatus;
    else err('personal.disabilityStatus', 'expected yes | no | prefer_not_to_say');
  }

  return Object.keys(sp).length > 0 ? (sp as Profile['personal']) : undefined;
}

function validateAddress(
  data: Record<string, unknown>,
  err: ErrFn,
): Profile['address'] | undefined {
  if (!('address' in data) || typeof data.address !== 'object' || data.address === null)
    return undefined;
  const a = data.address as Record<string, unknown>;
  const sa: Record<string, unknown> = {};

  copyText(a, sa, 'address.city', err);
  copyText(a, sa, 'address.country', err);
  copyText(a, sa, 'address.street', err);
  copyText(a, sa, 'address.state', err);
  copyText(a, sa, 'address.postalCode', err);

  return Object.keys(sa).length > 0 ? (sa as Profile['address']) : undefined;
}

function validateProfessional(
  data: Record<string, unknown>,
  err: ErrFn,
): Profile['professional'] | undefined {
  if (
    !('professional' in data) ||
    typeof data.professional !== 'object' ||
    data.professional === null
  )
    return undefined;
  const pr = data.professional as Record<string, unknown>;
  const sp: Profile['professional'] = {};
  if (
    typeof pr.summary === 'string' &&
    pr.summary.length <= profileTextLimit('professional.summary')
  )
    sp.summary = pr.summary;
  else if (pr.summary !== undefined)
    err(
      'professional.summary',
      `expected string, max ${profileTextLimit('professional.summary')} chars`,
    );
  if (pr.noticePeriod && typeof pr.noticePeriod === 'object') {
    const notice = pr.noticePeriod as Record<string, unknown>;
    if (notice.immediate === true) sp.noticePeriod = { immediate: true };
    else if (
      notice.immediate === false &&
      typeof notice.value === 'number' &&
      typeof notice.unit === 'string' &&
      !noticeDurationError(String(notice.value), notice.unit as 'day' | 'week' | 'month')
    )
      sp.noticePeriod = notice as unknown as NonNullable<Profile['professional']['noticePeriod']>;
    else
      err(
        'professional.noticePeriod',
        'expected explicit availability and a valid whole-number duration',
      );
  }
  return sp;
}

function validateSalary(
  data: Record<string, unknown>,
  err: ErrFn,
  accepted?: AcceptedEntry,
): Profile['salary'] | undefined {
  if (!('salary' in data) || typeof data.salary !== 'object' || data.salary === null)
    return undefined;
  const sal = data.salary as Record<string, unknown>;
  const ss: Partial<Profile['salary']> = {};

  if ('current' in sal && typeof sal.current === 'object' && sal.current !== null) {
    const cur = sal.current as Record<string, unknown>;
    if (
      typeof cur.amount === 'number' &&
      isValidAmount(cur.amount) &&
      isValidProfileCurrency(cur.currency)
    ) {
      ss.current = {
        amount: cur.amount,
        currency: cur.currency,
        country: typeof cur.country === 'string' ? cur.country : undefined,
        period: cur.period === 'annual' ? 'annual' : 'monthly',
      };
    } else {
      if (typeof cur.amount !== 'number' || !isValidAmount(cur.amount))
        err('salary.current.amount', 'expected non-negative number');
      if (!isValidProfileCurrency(cur.currency))
        err('salary.current.currency', 'expected 3-letter uppercase currency code');
    }
  }

  if ('expected' in sal && Array.isArray(sal.expected)) {
    const expected: Profile['salary']['expected'] = [];
    (sal.expected as unknown[]).forEach((entry, index) => {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        if (
          isValidProfileCurrency(e.currency) &&
          (e.amount === undefined || (typeof e.amount === 'number' && isValidAmount(e.amount)))
        ) {
          // Current shape: { country?, currency, amount?, period? }
          accepted?.(index, expected.length);
          expected.push({
            country: typeof e.country === 'string' ? e.country : undefined,
            currency: e.currency,
            amount: typeof e.amount === 'number' ? e.amount : undefined,
            period: e.period === 'annual' ? 'annual' : 'monthly',
          });
        } else
          err(
            `salary.expected[${index}]`,
            'expected a known currency and, when supplied, a finite non-negative amount',
          );
      }
    });
    if (expected.length > 0) ss.expected = expected;
  }

  return Object.keys(ss).length > 0 ? (ss as Profile['salary']) : undefined;
}

function validateWorkAuthorization(
  data: Record<string, unknown>,
  err: ErrFn,
  accepted?: AcceptedEntry,
): Profile['workAuthorization'] | undefined {
  if (!('workAuthorization' in data) || !Array.isArray(data.workAuthorization)) return undefined;
  const valid: Profile['workAuthorization'] = [];
  const countries = new Set<string>();
  (data.workAuthorization as unknown[]).forEach((entry, i) => {
    if (typeof entry === 'object' && entry !== null) {
      const e = entry as Record<string, unknown>;
      if (
        typeof e.country === 'string' &&
        isValidProfileOption('workAuthorization.$.status', e.status)
      ) {
        const country = findCountryByNameOrCode(e.country);
        if (!country || countries.has(country.code)) {
          err(
            `workAuthorization[${i}].country`,
            country ? 'duplicate country' : 'select a valid country',
          );
          return;
        }
        if (
          typeof e.visaType === 'string' &&
          e.visaType.length > profileTextLimit('workAuthorization.$.visaType')
        ) {
          err(
            `workAuthorization[${i}].visaType`,
            `max ${profileTextLimit('workAuthorization.$.visaType')} chars`,
          );
          return;
        }
        if (
          e.expiryDate &&
          (typeof e.expiryDate !== 'string' || !isValidCalendarDate(e.expiryDate))
        ) {
          err(`workAuthorization[${i}].expiryDate`, 'invalid calendar date');
          return;
        }
        countries.add(country.code);
        accepted?.(i, valid.length);
        valid.push({
          country: country.code,
          status: e.status as Profile['workAuthorization'][0]['status'],
          visaType: typeof e.visaType === 'string' ? e.visaType : undefined,
          expiryDate: typeof e.expiryDate === 'string' ? e.expiryDate : undefined,
        });
      } else {
        err(`workAuthorization[${i}]`, 'missing country string or invalid status');
      }
    }
  });
  return valid.length > 0 ? valid : undefined;
}

function validateWorkHistory(
  data: Record<string, unknown>,
  err: ErrFn,
  allowMissingDates = false,
  accepted?: AcceptedEntry,
): Profile['workHistory'] | undefined {
  if (!('workHistory' in data) || !Array.isArray(data.workHistory)) return undefined;
  const valid: Profile['workHistory'] = [];
  (data.workHistory as unknown[]).forEach((entry, i) => {
    if (typeof entry === 'object' && entry !== null) {
      const e = entry as Record<string, unknown>;
      if (
        typeof e.company === 'string' &&
        typeof e.title === 'string' &&
        (isValidProfileYearMonth(e.startDate) || (allowMissingDates && !e.startDate)) &&
        typeof e.isCurrent === 'boolean'
      ) {
        const dateErrors = profileDateRangeErrors(e as unknown as Profile['workHistory'][number]);
        if (allowMissingDates) {
          if (!e.startDate) delete dateErrors.startDate;
          if (!e.endDate) delete dateErrors.endDate;
        }
        if (Object.keys(dateErrors).length) {
          for (const [key, reason] of Object.entries(dateErrors))
            err(`workHistory[${i}].${key}`, reason);
          return;
        }
        const location =
          typeof e.location === 'object' && e.location !== null
            ? (e.location as Record<string, unknown>)
            : undefined;
        if (
          String(e.company).length > profileTextLimit('workHistory.$.company') ||
          String(e.title).length > profileTextLimit('workHistory.$.title') ||
          (typeof location?.city === 'string' &&
            location.city.length > profileTextLimit('workHistory.$.location.city')) ||
          (typeof e.description === 'string' &&
            e.description.length > profileTextLimit('workHistory.$.description'))
        ) {
          err(`workHistory[${i}]`, 'text exceeds editor limits');
          return;
        }
        if (e.arrangement && !isValidProfileOption('workHistory.$.arrangement', e.arrangement)) {
          err(`workHistory[${i}].arrangement`, 'expected onsite | remote | hybrid');
          return;
        }
        accepted?.(i, valid.length);
        valid.push({
          company: e.company,
          title: e.title,
          startDate: typeof e.startDate === 'string' ? e.startDate : '',
          isCurrent: e.isCurrent,
          endDate: typeof e.endDate === 'string' ? e.endDate : undefined,
          description: typeof e.description === 'string' ? e.description : undefined,
          arrangement:
            typeof e.arrangement === 'string'
              ? (e.arrangement as Profile['workHistory'][0]['arrangement'])
              : undefined,
          location:
            typeof e.location === 'object' && e.location !== null
              ? (e.location as Profile['workHistory'][0]['location'])
              : undefined,
        });
      } else {
        err(
          `workHistory[${i}]`,
          'missing company, title, startDate (YYYY-MM), or isCurrent boolean',
        );
      }
    }
  });
  return valid.length > 0 ? valid : undefined;
}

function validateEducation(
  data: Record<string, unknown>,
  err: ErrFn,
  allowMissingDates = false,
  accepted?: AcceptedEntry,
): Profile['education'] | undefined {
  if (!('education' in data) || !Array.isArray(data.education)) return undefined;
  const valid: Profile['education'] = [];
  (data.education as unknown[]).forEach((entry, i) => {
    if (typeof entry === 'object' && entry !== null) {
      const e = entry as Record<string, unknown>;
      if (
        typeof e.institution === 'string' &&
        typeof e.degree === 'string' &&
        typeof e.fieldOfStudy === 'string' &&
        (isValidProfileYearMonth(e.startDate, true) || (allowMissingDates && !e.startDate))
      ) {
        if (
          String(e.institution).length > profileTextLimit('education.$.institution') ||
          String(e.degree).length > profileTextLimit('education.$.degree') ||
          String(e.fieldOfStudy).length > profileTextLimit('education.$.fieldOfStudy') ||
          (typeof e.grade === 'string' && e.grade.length > profileTextLimit('education.$.grade')) ||
          (typeof e.description === 'string' &&
            e.description.length > profileTextLimit('education.$.description'))
        ) {
          err(`education[${i}]`, 'text exceeds editor limits');
          return;
        }
        const dateErrors = profileDateRangeErrors(
          e as unknown as Profile['education'][number],
          true,
        );
        if (allowMissingDates) {
          if (!e.startDate) delete dateErrors.startDate;
          if (!e.endDate) delete dateErrors.endDate;
        }
        if (Object.keys(dateErrors).length) {
          for (const [key, reason] of Object.entries(dateErrors))
            err(`education[${i}].${key}`, reason);
          return;
        }
        const endDate = isValidProfileYearMonth(e.endDate, true) ? e.endDate : undefined;
        accepted?.(i, valid.length);
        valid.push({
          institution: e.institution,
          degree: e.degree,
          fieldOfStudy: e.fieldOfStudy,
          startDate: typeof e.startDate === 'string' ? e.startDate : '',
          isCurrent: typeof e.isCurrent === 'boolean' ? e.isCurrent : false,
          endDate,
          grade: typeof e.grade === 'string' ? e.grade : undefined,
          description: typeof e.description === 'string' ? e.description : undefined,
        });
      } else {
        err(
          `education[${i}]`,
          'missing institution, degree, fieldOfStudy, or startDate (YYYY or YYYY-MM)',
        );
      }
    }
  });
  return valid.length > 0 ? valid : undefined;
}

function validateLanguages(
  data: Record<string, unknown>,
  err: ErrFn,
  accepted?: AcceptedEntry,
): Profile['languages'] | undefined {
  if (!('languages' in data) || !Array.isArray(data.languages)) return undefined;
  const valid: Profile['languages'] = [];
  const languages = new Set<string>();
  (data.languages as unknown[]).forEach((entry, i) => {
    if (typeof entry === 'object' && entry !== null) {
      const e = entry as Record<string, unknown>;
      if (
        typeof e.language === 'string' &&
        !!e.language.trim() &&
        isValidProfileOption('languages.$.proficiency', e.proficiency)
      ) {
        const key = findLanguage(e.language)?.code ?? e.language.trim().toLowerCase();
        if (languages.has(key)) {
          err(`languages[${i}].language`, 'duplicate language');
          return;
        }
        languages.add(key);
        accepted?.(i, valid.length);
        valid.push({
          language: e.language,
          proficiency: e.proficiency as Profile['languages'][0]['proficiency'],
        });
      } else {
        err(`languages[${i}]`, 'missing language string or invalid proficiency');
      }
    }
  });
  return valid.length > 0 ? valid : undefined;
}

function validateLinks(
  data: Record<string, unknown>,
  err: ErrFn,
  accepted?: AcceptedEntry,
): Profile['links'] | undefined {
  if (!('links' in data) || typeof data.links !== 'object' || data.links === null) return undefined;
  const lnk = data.links as Record<string, unknown>;
  const sl: Partial<Profile['links']> = {};

  if (lnk.linkedin !== undefined) {
    if (typeof lnk.linkedin === 'string' && (lnk.linkedin === '' || isLinkedInUrl(lnk.linkedin))) {
      if (lnk.linkedin) sl.linkedin = lnk.linkedin;
    } else if (typeof lnk.linkedin === 'string' && lnk.linkedin !== '') {
      err('links.linkedin', 'expected a valid LinkedIn URL');
    } else {
      err('links.linkedin', 'expected string');
    }
  }
  copyUrl(lnk, sl, 'links.portfolio', err);
  copyUrl(lnk, sl, 'links.github', err);
  copyUrl(lnk, sl, 'links.twitter', err);
  copyUrl(lnk, sl, 'links.dribbble', err);
  copyUrl(lnk, sl, 'links.behance', err);
  if (Array.isArray(lnk.custom)) {
    const validCustom: NonNullable<Profile['links']['custom']> = [];
    (lnk.custom as unknown[]).forEach((entry, i) => {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        if (
          typeof e.label === 'string' &&
          !!e.label.trim() &&
          e.label.length <= profileTextLimit('links.custom.$.label') &&
          typeof e.url === 'string' &&
          isValidProfileUrl(e.url)
        ) {
          accepted?.(i, validCustom.length);
          validCustom.push({ label: e.label, url: e.url });
        } else {
          err(`links.custom[${i}]`, 'missing label string or url string');
        }
      } else {
        err(`links.custom[${i}]`, 'missing label string or url string');
      }
    });
    if (validCustom.length > 0) sl.custom = validCustom;
  }

  return Object.keys(sl).length > 0 ? (sl as Profile['links']) : undefined;
}

function validateDocuments(
  data: Record<string, unknown>,
  err: ErrFn,
): Profile['documents'] | undefined {
  if (!('documents' in data) || typeof data.documents !== 'object' || data.documents === null)
    return undefined;
  const docs = data.documents as Record<string, unknown>;
  const sd: Partial<Profile['documents']> = {};

  if ('cv' in docs && typeof docs.cv === 'object' && docs.cv !== null) {
    sd.cv = validateDocumentEntry('documents.cv', docs.cv as Record<string, unknown>, err);
  }

  if ('coverLetter' in docs && typeof docs.coverLetter === 'object' && docs.coverLetter !== null) {
    sd.coverLetter = validateDocumentEntry(
      'documents.coverLetter',
      docs.coverLetter as Record<string, unknown>,
      err,
    );
  }

  return Object.keys(sd).length > 0 ? (sd as Profile['documents']) : undefined;
}

export function validateImportedProfile(
  raw: unknown,
  options: { allowMissingDates?: boolean; entryIndices?: EntryIndexMap } = {},
): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return {
      valid: false,
      invalidFields: [{ path: 'root', reason: 'not an object' }],
      sanitized: {},
    };
  }

  const errors: InvalidField[] = [];
  const err: ErrFn = (path, reason) => errors.push({ path, reason });
  const data = raw as Record<string, unknown>;
  const s: Partial<Profile> = {};
  const kept = (family: string): AcceptedEntry => {
    const indices = options.entryIndices
      ? (options.entryIndices[family] = {} as Record<number, number>)
      : undefined;
    return (original, index) => {
      if (indices) indices[original] = index;
    };
  };
  if (data.id !== undefined) {
    if (typeof data.id === 'string' && data.id.trim() && data.id.length <= profileTextLimit('id'))
      s.id = data.id;
    else err('id', `expected a non-empty profile ID, max ${profileTextLimit('id')} chars`);
  }

  const personal = validatePersonal(data, err);
  if (personal) s.personal = personal;

  const address = validateAddress(data, err);
  if (address) s.address = address;

  const professional = validateProfessional(data, err);
  if (professional) s.professional = professional;

  const salary = validateSalary(data, err, kept('salary.expected'));
  if (salary) s.salary = salary;

  const workAuthorization = validateWorkAuthorization(data, err, kept('workAuthorization'));
  if (workAuthorization) s.workAuthorization = workAuthorization;

  const workHistory = validateWorkHistory(
    data,
    err,
    options.allowMissingDates,
    kept('workHistory'),
  );
  if (workHistory) s.workHistory = workHistory;

  const education = validateEducation(data, err, options.allowMissingDates, kept('education'));
  if (education) s.education = education;

  const languages = validateLanguages(data, err, kept('languages'));
  if (languages) s.languages = languages;

  const links = validateLinks(data, err, kept('links.custom'));
  if (links) s.links = links;

  const documents = validateDocuments(data, err);
  if (documents) s.documents = documents;

  return { valid: errors.length === 0, invalidFields: errors, sanitized: profileData(s) };
}
