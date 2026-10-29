import type { Profile } from '../types/profile';
import { findCountryByNameOrCode } from '../data/countries';
import { findLanguage } from '../data/languages';
import { CURRENCIES } from '../data/currencies';
import { ETHNICITIES } from '../data/ethnicities';
import { WORK_AUTH_STATUS_LABELS } from '../data/workAuthorization';
import { LANGUAGE_PROFICIENCY_LABELS } from '../data/languages';
import {
  MAX_DOCUMENT_FILE_BYTES,
  MAX_DOCUMENT_BASE64_LENGTH,
  DOCUMENT_FILE_SIZE_ERROR,
} from './documentLimits';
import {
  isLinkedInUrl,
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

const RE_YYYYMM = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_YYYY_OR_YYYYMM = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

const VALID_GENDERS = new Set(['male', 'female', 'other', 'prefer_not_to_say']);
const VALID_YES_NO_PNTS = new Set(['yes', 'no', 'prefer_not_to_say']);
// PersonalSection.tsx's <select> offers every ETHNICITIES value plus an
// explicit "Prefer not to say" option not itself in that list.
const VALID_ETHNICITIES = new Set<string>([...ETHNICITIES, 'prefer_not_to_say']);
const VALID_AUTH_STATUS = new Set(Object.keys(WORK_AUTH_STATUS_LABELS));
const VALID_PROFICIENCY = new Set(Object.keys(LANGUAGE_PROFICIENCY_LABELS));

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
    else err(`${fieldPrefix}.url`, 'expected a valid URL, max 2048 chars');
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

function validatePersonal(
  data: Record<string, unknown>,
  err: ErrFn,
): Profile['personal'] | undefined {
  if (!('personal' in data) || typeof data.personal !== 'object' || data.personal === null)
    return undefined;
  const p = data.personal as Record<string, unknown>;
  const sp: Record<string, unknown> = {};

  if (p.firstName !== undefined) {
    if (typeof p.firstName === 'string' && p.firstName.length <= 100) sp.firstName = p.firstName;
    else err('personal.firstName', 'expected string, max 100 chars');
  }
  if (p.lastName !== undefined) {
    if (typeof p.lastName === 'string' && p.lastName.length <= 100) sp.lastName = p.lastName;
    else err('personal.lastName', 'expected string, max 100 chars');
  }
  if (p.nickname !== undefined) {
    if (typeof p.nickname === 'string' && p.nickname.length <= 100) sp.nickname = p.nickname;
    else err('personal.nickname', 'expected string, max 100 chars');
  }
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
    if (typeof p.gender === 'string' && VALID_GENDERS.has(p.gender)) sp.gender = p.gender;
    else err('personal.gender', 'expected male | female | other | prefer_not_to_say');
  }
  if (p.ethnicity !== undefined) {
    if (typeof p.ethnicity === 'string' && VALID_ETHNICITIES.has(p.ethnicity))
      sp.ethnicity = p.ethnicity;
    else
      err(
        'personal.ethnicity',
        'expected one of the known ETHNICITIES values or prefer_not_to_say',
      );
  }
  if (p.veteranStatus !== undefined) {
    if (typeof p.veteranStatus === 'string' && VALID_YES_NO_PNTS.has(p.veteranStatus))
      sp.veteranStatus = p.veteranStatus;
    else err('personal.veteranStatus', 'expected yes | no | prefer_not_to_say');
  }
  if (p.disabilityStatus !== undefined) {
    if (typeof p.disabilityStatus === 'string' && VALID_YES_NO_PNTS.has(p.disabilityStatus))
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

  if (a.city !== undefined) {
    if (typeof a.city === 'string' && a.city.length <= 100) sa.city = a.city;
    else err('address.city', 'expected string, max 100 chars');
  }
  if (a.country !== undefined) {
    if (typeof a.country === 'string' && a.country.length <= 100) sa.country = a.country;
    else err('address.country', 'expected string, max 100 chars');
  }
  if (a.street !== undefined) {
    if (typeof a.street === 'string' && a.street.length <= 255) sa.street = a.street;
    else err('address.street', 'expected string, max 255 chars');
  }
  if (a.state !== undefined) {
    if (typeof a.state === 'string' && a.state.length <= 100) sa.state = a.state;
    else err('address.state', 'expected string, max 100 chars');
  }
  if (a.postalCode !== undefined) {
    if (typeof a.postalCode === 'string' && a.postalCode.length <= 20) sa.postalCode = a.postalCode;
    else err('address.postalCode', 'expected string, max 20 chars');
  }

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
  if (typeof pr.summary === 'string' && pr.summary.length <= 2000) sp.summary = pr.summary;
  else if (pr.summary !== undefined) err('professional.summary', 'expected string, max 2000 chars');
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

function validateSalary(data: Record<string, unknown>, err: ErrFn): Profile['salary'] | undefined {
  if (!('salary' in data) || typeof data.salary !== 'object' || data.salary === null)
    return undefined;
  const sal = data.salary as Record<string, unknown>;
  const ss: Partial<Profile['salary']> = {};

  if ('current' in sal && typeof sal.current === 'object' && sal.current !== null) {
    const cur = sal.current as Record<string, unknown>;
    if (
      typeof cur.amount === 'number' &&
      isValidAmount(cur.amount) &&
      typeof cur.currency === 'string' &&
      CURRENCIES.some((currency) => currency.code === cur.currency)
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
      if (
        typeof cur.currency !== 'string' ||
        !CURRENCIES.some((currency) => currency.code === cur.currency)
      )
        err('salary.current.currency', 'expected 3-letter uppercase currency code');
    }
  }

  if ('expected' in sal && Array.isArray(sal.expected)) {
    const expected: Profile['salary']['expected'] = [];
    (sal.expected as unknown[]).forEach((entry, index) => {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        if (
          typeof e.currency === 'string' &&
          CURRENCIES.some((currency) => currency.code === e.currency) &&
          (e.amount === undefined || (typeof e.amount === 'number' && isValidAmount(e.amount)))
        ) {
          // Current shape: { country?, currency, amount?, period? }
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
): Profile['workAuthorization'] | undefined {
  if (!('workAuthorization' in data) || !Array.isArray(data.workAuthorization)) return undefined;
  const valid: Profile['workAuthorization'] = [];
  const countries = new Set<string>();
  (data.workAuthorization as unknown[]).forEach((entry, i) => {
    if (typeof entry === 'object' && entry !== null) {
      const e = entry as Record<string, unknown>;
      if (
        typeof e.country === 'string' &&
        typeof e.status === 'string' &&
        VALID_AUTH_STATUS.has(e.status)
      ) {
        const country = findCountryByNameOrCode(e.country);
        if (!country || countries.has(country.code)) {
          err(
            `workAuthorization[${i}].country`,
            country ? 'duplicate country' : 'select a valid country',
          );
          return;
        }
        countries.add(country.code);
        if (typeof e.visaType === 'string' && e.visaType.length > 100) {
          err(`workAuthorization[${i}].visaType`, 'max 100 chars');
          return;
        }
        if (
          e.expiryDate &&
          (typeof e.expiryDate !== 'string' || !isValidCalendarDate(e.expiryDate))
        ) {
          err(`workAuthorization[${i}].expiryDate`, 'invalid calendar date');
          return;
        }
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
): Profile['workHistory'] | undefined {
  if (!('workHistory' in data) || !Array.isArray(data.workHistory)) return undefined;
  const valid: Profile['workHistory'] = [];
  (data.workHistory as unknown[]).forEach((entry, i) => {
    if (typeof entry === 'object' && entry !== null) {
      const e = entry as Record<string, unknown>;
      if (
        typeof e.company === 'string' &&
        typeof e.title === 'string' &&
        typeof e.startDate === 'string' &&
        RE_YYYYMM.test(e.startDate) &&
        typeof e.isCurrent === 'boolean'
      ) {
        const dateErrors = profileDateRangeErrors(e as unknown as Profile['workHistory'][number]);
        if (Object.keys(dateErrors).length) {
          for (const [key, reason] of Object.entries(dateErrors))
            err(`workHistory[${i}].${key}`, reason);
          return;
        }
        if (
          String(e.company).length > 150 ||
          String(e.title).length > 150 ||
          (typeof e.description === 'string' && e.description.length > 3000)
        ) {
          err(`workHistory[${i}]`, 'text exceeds editor limits');
          return;
        }
        valid.push({
          company: e.company,
          title: e.title,
          startDate: e.startDate,
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
        typeof e.startDate === 'string' &&
        RE_YYYY_OR_YYYYMM.test(e.startDate)
      ) {
        if (
          String(e.institution).length > 150 ||
          String(e.degree).length > 150 ||
          String(e.fieldOfStudy).length > 150 ||
          (typeof e.grade === 'string' && e.grade.length > 100) ||
          (typeof e.description === 'string' && e.description.length > 3000)
        ) {
          err(`education[${i}]`, 'text exceeds editor limits');
          return;
        }
        const dateErrors = profileDateRangeErrors(
          e as unknown as Profile['education'][number],
          true,
        );
        if (Object.keys(dateErrors).length) {
          for (const [key, reason] of Object.entries(dateErrors))
            err(`education[${i}].${key}`, reason);
          return;
        }
        const endDate =
          typeof e.endDate === 'string' && RE_YYYY_OR_YYYYMM.test(e.endDate)
            ? e.endDate
            : undefined;
        valid.push({
          institution: e.institution,
          degree: e.degree,
          fieldOfStudy: e.fieldOfStudy,
          startDate: e.startDate,
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
        typeof e.proficiency === 'string' &&
        VALID_PROFICIENCY.has(e.proficiency)
      ) {
        const key = findLanguage(e.language)?.code ?? e.language.trim().toLowerCase();
        if (languages.has(key)) {
          err(`languages[${i}].language`, 'duplicate language');
          return;
        }
        languages.add(key);
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

function validateLinks(data: Record<string, unknown>, err: ErrFn): Profile['links'] | undefined {
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
  if (lnk.portfolio !== undefined) {
    if (
      typeof lnk.portfolio === 'string' &&
      (!lnk.portfolio.trim() || isValidProfileUrl(lnk.portfolio))
    )
      sl.portfolio = lnk.portfolio;
    else err('links.portfolio', 'expected a valid URL');
  }
  if (lnk.github !== undefined) {
    if (typeof lnk.github === 'string' && (!lnk.github.trim() || isValidProfileUrl(lnk.github)))
      sl.github = lnk.github;
    else err('links.github', 'expected a valid URL');
  }
  if (lnk.twitter !== undefined) {
    if (typeof lnk.twitter === 'string' && (!lnk.twitter.trim() || isValidProfileUrl(lnk.twitter)))
      sl.twitter = lnk.twitter;
    else err('links.twitter', 'expected a valid URL');
  }
  if (lnk.dribbble !== undefined) {
    if (
      typeof lnk.dribbble === 'string' &&
      (!lnk.dribbble.trim() || isValidProfileUrl(lnk.dribbble))
    )
      sl.dribbble = lnk.dribbble;
    else err('links.dribbble', 'expected a valid URL');
  }
  if (lnk.behance !== undefined) {
    if (typeof lnk.behance === 'string' && (!lnk.behance.trim() || isValidProfileUrl(lnk.behance)))
      sl.behance = lnk.behance;
    else err('links.behance', 'expected a valid URL');
  }
  if (Array.isArray(lnk.custom)) {
    const validCustom: NonNullable<Profile['links']['custom']> = [];
    (lnk.custom as unknown[]).forEach((entry, i) => {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        if (
          typeof e.label === 'string' &&
          !!e.label.trim() &&
          e.label.length <= 100 &&
          typeof e.url === 'string' &&
          isValidProfileUrl(e.url)
        ) {
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

export function validateImportedProfile(raw: unknown): ValidationResult {
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

  const personal = validatePersonal(data, err);
  if (personal) s.personal = personal;

  const address = validateAddress(data, err);
  if (address) s.address = address;

  const professional = validateProfessional(data, err);
  if (professional) s.professional = professional;

  const salary = validateSalary(data, err);
  if (salary) s.salary = salary;

  const workAuthorization = validateWorkAuthorization(data, err);
  if (workAuthorization) s.workAuthorization = workAuthorization;

  const workHistory = validateWorkHistory(data, err);
  if (workHistory) s.workHistory = workHistory;

  const education = validateEducation(data, err);
  if (education) s.education = education;

  const languages = validateLanguages(data, err);
  if (languages) s.languages = languages;

  const links = validateLinks(data, err);
  if (links) s.links = links;

  const documents = validateDocuments(data, err);
  if (documents) s.documents = documents;

  return { valid: errors.length === 0, invalidFields: errors, sanitized: s };
}
