import {
  isValidProfileEmail,
  isValidProfilePhone,
  isValidAmount,
  isLinkedInUrl,
  isValidProfileUrl,
  noticeDurationError,
  profileDateRangeErrors,
} from './profileInputValidation';
import { findCountryByNameOrCode } from '../data/countries';
import { CURRENCIES } from '../data/currencies';
import { WORK_AUTH_STATUS_LABELS } from '../data/workAuthorization';
import { findLanguage, LANGUAGE_PROFICIENCY_LABELS } from '../data/languages';
import type {
  Profile,
  PhoneNumber,
  NoticePeriod,
  WorkHistoryEntry,
  EducationEntry,
} from '../types/profile';

function resolvePhoneNumber(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  const ph = raw as Partial<PhoneNumber>;
  return ph.number ?? '';
}

function isNoticePeriodValid(np: NoticePeriod | undefined): boolean {
  return (
    !!np &&
    (np.immediate === true ||
      (np.immediate === false &&
        !!np.unit &&
        !noticeDurationError(String(np.value ?? ''), np.unit)))
  );
}

function validText(value: string | undefined, max: number): boolean {
  return !!value?.trim() && value.length <= max;
}
function validCountry(value: string | undefined): boolean {
  return !!value && !!findCountryByNameOrCode(value);
}
function workErrors(row: WorkHistoryEntry): Record<string, string> {
  return {
    ...(!validText(row.company, 150) ? { company: 'required' } : {}),
    ...(!validText(row.title, 150) ? { title: 'required' } : {}),
    ...profileDateRangeErrors(row),
  };
}
function educationErrors(row: EducationEntry): Record<string, string> {
  return {
    ...(!validText(row.institution, 150) ? { institution: 'required' } : {}),
    ...(!validText(row.degree, 150) ? { degree: 'required' } : {}),
    ...(!validText(row.fieldOfStudy, 150) ? { fieldOfStudy: 'required' } : {}),
    ...profileDateRangeErrors(row, true),
  };
}
function optionalWorkFieldValid(
  row: WorkHistoryEntry,
  field: 'location' | 'arrangement' | 'description',
): boolean {
  if (field === 'description') return validText(row.description, 3000);
  if (field === 'arrangement')
    return ['onsite', 'remote', 'hybrid'].includes(row.arrangement ?? '');
  const location = row.location;
  if (typeof location === 'string') return validText(location, 100);
  return !!location && (validText(location.city, 100) || validCountry(location.countryCode));
}
function validProficiency(value: string): boolean {
  return (
    Object.hasOwn(LANGUAGE_PROFICIENCY_LABELS, value) ||
    ['basic', 'conversational', 'professional', 'native'].includes(value)
  );
}

function validSalary(row?: { amount?: number; currency?: string }): boolean {
  return (
    !!row &&
    row.amount != null &&
    isValidAmount(row.amount) &&
    CURRENCIES.some((currency) => currency.code === row.currency)
  );
}
function hasProfileLink(profile: Partial<Profile>): boolean {
  const links = profile.links;
  return (
    (!!links &&
      (['linkedin', 'portfolio', 'github', 'twitter', 'dribbble', 'behance'] as const).some(
        (key) =>
          key === 'linkedin'
            ? isLinkedInUrl(links[key] ?? '')
            : isValidProfileUrl(links[key] ?? ''),
      )) ||
    (links?.custom ?? []).some((link) => !!link.label.trim() && isValidProfileUrl(link.url))
  );
}

export interface CompletionGroup {
  sectionId: string;
  sectionLabel: string;
  fields: string[];
}

// Maps the human-readable field label used in CompletionGroup.fields to the
// DOM id of the corresponding input, so the banner can scroll+focus it.
export const FIELD_FOCUS_IDS: Record<string, string> = {
  // Mandatory
  'First Name': 'field-firstName',
  'Last Name': 'field-lastName',
  Email: 'field-email',
  Phone: 'field-phone',
  City: 'field-city',
  Country: 'field-country',
  'Current Salary Amount': 'field-currentAmount',
  'Current Salary Currency': 'field-currentCountry',
  'LinkedIn URL': 'field-linkedin',
  // Optional
  'Preferred name': 'field-nickname',
  'Date of Birth': 'field-dateOfBirth',
  Gender: 'field-gender',
  Ethnicity: 'field-ethnicity',
  'Veteran Status': 'field-veteranStatus',
  'Disability Status': 'field-disabilityStatus',
  'Street Address': 'field-street',
  'State / Province': 'field-state',
  'Postal Code': 'field-postalCode',
  'Career Summary': 'field-summary',
  'Portfolio URL': 'field-portfolio',
};

export interface CompletionResult {
  percentage: number;
  missingFields: string[];
  missingGroups: CompletionGroup[];
  isCoreComplete: boolean;
  optionalFieldsRemaining: number;
  optionalGroups: CompletionGroup[];
}

const TOTAL_CHECKS = 10;

function makeChecker(target: CompletionGroup[]) {
  return (condition: boolean, sectionId: string, sectionLabel: string, field: string) => {
    if (!condition) {
      let g = target.find((x) => x.sectionId === sectionId);
      if (!g) {
        g = { sectionId, sectionLabel, fields: [] };
        target.push(g);
      }
      g.fields.push(field);
    }
  };
}

export function calculateCompletion(profile: Partial<Profile>): CompletionResult {
  const groups: CompletionGroup[] = [];
  const check = makeChecker(groups);

  // Personal (4)
  check(
    validText(profile.personal?.firstName, 100),
    'personal',
    'Personal',
    'First Name',
  );
  check(
    isValidProfileEmail(profile.personal?.email ?? ''),
    'personal',
    'Personal',
    'Email',
  );
  check(
    isValidProfilePhone(resolvePhoneNumber(profile.personal?.phone)),
    'personal',
    'Personal',
    'Phone',
  );

  // Address (2)
  check(validText(profile.address?.city, 100), 'address', 'Address', 'City');
  check(validCountry(profile.address?.country), 'address', 'Address', 'Country');

  // Work Authorization (1)
  const waEntries = profile.workAuthorization ?? [];
  check(
    waEntries.length >= 1 &&
      new Set(
        waEntries.map((entry) => findCountryByNameOrCode(entry.country)?.code ?? entry.country),
      ).size === waEntries.length &&
      waEntries.every(
        (e) => validCountry(e.country) && Object.hasOwn(WORK_AUTH_STATUS_LABELS, e.status),
      ),
    'workAuthorization',
    'Work Authorization',
    'At least one valid entry',
  );

  // Availability (1); employment history is optional.
  check(
    isNoticePeriodValid(profile.professional?.noticePeriod),
    'workHistory',
    'Work History',
    'Notice Period',
  );

  // Education (1)
  const eduEntries = profile.education ?? [];
  check(
    eduEntries.length >= 1 && eduEntries.every((e) => Object.keys(educationErrors(e)).length === 0),
    'education',
    'Education',
    'At least one complete entry',
  );

  // Languages (1)
  check(
    (profile.languages ?? []).length >= 1 &&
      new Set(
        profile.languages!.map(
          (entry) => findLanguage(entry.language)?.code ?? entry.language.trim().toLowerCase(),
        ),
      ).size === profile.languages!.length &&
      profile.languages!.every((e) => !!e.language?.trim() && validProficiency(e.proficiency)),
    'languages',
    'Languages',
    'At least one language',
  );

  // Documents (1)
  check(
    !!(profile.documents?.cv?.url?.trim() || profile.documents?.cv?.file?.base64) &&
      (!profile.documents?.cv?.url?.trim() || isValidProfileUrl(profile.documents.cv.url)),
    'documents',
    'Documents',
    'CV / Résumé',
  );

  const totalMissing = groups.reduce((sum, g) => sum + g.fields.length, 0);
  const percentage = Math.round(((TOTAL_CHECKS - totalMissing) / TOTAL_CHECKS) * 100);
  const missingFields = groups.flatMap((g) => g.fields);
  const isCoreComplete = percentage === 100;

  // Optional fields — count unfilled; also build groups for the dropdown
  const optGroups: CompletionGroup[] = [];
  const optCheck = makeChecker(optGroups);

  optCheck(validText(profile.address?.street, 255), 'address', 'Address', 'Street Address');
  optCheck(validText(profile.address?.state, 100), 'address', 'Address', 'State / Province');
  optCheck(validText(profile.address?.postalCode, 20), 'address', 'Address', 'Postal Code');
  optCheck(
    (profile.salary?.expected?.length ?? 0) >= 1 &&
      profile.salary!.expected.every(
        (e) =>
          e.amount != null &&
          isValidAmount(e.amount) &&
          CURRENCIES.some((currency) => currency.code === e.currency),
      ),
    'salary',
    'Salary',
    'Expected Salary',
  );
  optCheck(
    validText(profile.professional?.summary, 2000),
    'workHistory',
    'Work History',
    'Career Summary',
  );

  // Work History entry-level optional fields: report once per missing field
  // across any entry that has the core fields filled. Skips empty/placeholder
  // entries (no company AND no title) so blank skeleton rows don't trigger
  // false positives.
  const whFilled = (profile.workHistory ?? []).filter(
    (e) => !!e.company?.trim() || !!e.title?.trim(),
  );
  if (whFilled.length > 0) {
    optCheck(
      whFilled.every((e) => optionalWorkFieldValid(e, 'location')),
      'workHistory',
      'Work History',
      'Location',
    );
    optCheck(
      whFilled.every((e) => optionalWorkFieldValid(e, 'arrangement')),
      'workHistory',
      'Work History',
      'Work Arrangement',
    );
    optCheck(
      whFilled.every((e) => optionalWorkFieldValid(e, 'description')),
      'workHistory',
      'Work History',
      'Description',
    );
  }

  optCheck(hasProfileLink(profile), 'links', 'Links', 'Profile links');
  optCheck(validSalary(profile.salary?.current), 'salary', 'Salary', 'Current Salary');

  const optionalFieldsRemaining = optGroups.reduce((sum, g) => sum + g.fields.length, 0);

  return {
    percentage,
    missingFields,
    missingGroups: groups,
    isCoreComplete,
    optionalFieldsRemaining,
    optionalGroups: optGroups,
  };
}

export function getSectionCompletion(profile: Partial<Profile>): Record<string, boolean> {
  const { missingGroups } = calculateCompletion(profile);
  const missing = new Set(missingGroups.map((g) => g.sectionId));
  return {
    personal: !missing.has('personal'),
    address: !missing.has('address'),
    salary:
      validSalary(profile.salary?.current) || (profile.salary?.expected ?? []).some(validSalary),
    workAuthorization: !missing.has('workAuthorization'),
    workHistory: !missing.has('workHistory'),
    education: !missing.has('education'),
    languages: !missing.has('languages'),
    links: hasProfileLink(profile),
    documents: !missing.has('documents'),
  };
}

export interface CompletionTarget {
  id: string;
  cardId?: string;
  fallbackId?: string;
  revealId?: string;
}

const SECTION_START_TARGETS: Record<string, CompletionTarget> = {
  personal: { id: 'field-firstName' },
  address: { id: 'field-country' },
  workAuthorization: {
    id: 'field-workAuthorization-0-country',
    fallbackId: 'add-workAuthorization',
  },
  workHistory: { id: 'field-summary' },
  education: {
    id: 'field-education-0-institution',
    cardId: 'entry-education-0',
    fallbackId: 'add-education',
  },
  languages: { id: 'field-languages-0-language', fallbackId: 'add-languages' },
  links: { id: 'field-linkedin' },
  documents: { id: 'field-cv' },
  salary: { id: 'field-currentAmount' },
};

/** Category links start at the first field, even when it already has a value. */
export function getSectionStartTarget(section: string): CompletionTarget | undefined {
  const target = SECTION_START_TARGETS[section];
  return target ? { ...target } : undefined;
}

/** Resolve aggregate checklist items to the first row/input that needs attention. */
export function getCompletionTarget(
  profile: Partial<Profile>,
  section: string,
  field: string,
): CompletionTarget | undefined {
  if (FIELD_FOCUS_IDS[field]) return { id: FIELD_FOCUS_IDS[field] };
  if (section === 'workAuthorization') {
    const rows = profile.workAuthorization ?? [];
    const seen = new Set<string>();
    let key = 'country';
    const idx = Math.max(
      0,
      rows.findIndex((row) => {
        const country = findCountryByNameOrCode(row.country)?.code;
        if (!country || seen.has(country)) {
          key = 'country';
          return true;
        }
        seen.add(country);
        if (!Object.hasOwn(WORK_AUTH_STATUS_LABELS, row.status)) {
          key = 'status';
          return true;
        }
        return false;
      }),
    );
    return { id: `field-workAuthorization-${idx}-${key}`, fallbackId: 'add-workAuthorization' };
  }
  if (section === 'languages') {
    const rows = profile.languages ?? [];
    const seen = new Set<string>();
    let key = 'language';
    const idx = Math.max(
      0,
      rows.findIndex((row) => {
        const language = findLanguage(row.language)?.code ?? row.language.trim().toLowerCase();
        if (!language || seen.has(language)) {
          key = 'language';
          return true;
        }
        seen.add(language);
        if (!validProficiency(row.proficiency)) {
          key = 'proficiency';
          return true;
        }
        return false;
      }),
    );
    return { id: `field-languages-${idx}-${key}`, fallbackId: 'add-languages' };
  }
  if (field === 'Notice Period')
    return {
      id:
        profile.professional?.noticePeriod?.immediate === false
          ? 'field-noticeValue'
          : 'field-noticePeriod',
    };
  if (field === 'CV / Résumé') return { id: 'field-cv' };
  if (field === 'Profile links') return { id: 'field-linkedin' };
  if (field === 'Current Salary')
    return {
      id: profile.salary?.current?.amount == null ? 'field-currentAmount' : 'field-currentCurrency',
    };
  if (field === 'Expected Salary') {
    const rows = profile.salary?.expected ?? [];
    const idx = Math.max(
      0,
      rows.findIndex((e) => e.amount == null || !isValidAmount(e.amount) || !e.currency),
    );
    const key =
      rows[idx]?.amount == null || !isValidAmount(rows[idx]!.amount!) ? 'amount' : 'currency';
    return { id: `field-expected-${idx}-${key}`, fallbackId: 'add-expected' };
  }
  if (section === 'workHistory' || section === 'education') {
    const rows =
      section === 'workHistory' ? (profile.workHistory ?? []) : (profile.education ?? []);
    let idx = 0;
    let key = section === 'workHistory' ? 'company' : 'institution';
    if (
      section === 'workHistory' &&
      ['Location', 'Work Arrangement', 'Description'].includes(field)
    ) {
      const property =
        field === 'Location'
          ? 'location'
          : field === 'Work Arrangement'
            ? 'arrangement'
            : 'description';
      idx = Math.max(
        0,
        (profile.workHistory ?? []).findIndex(
          (e) => (e.company?.trim() || e.title?.trim()) && !optionalWorkFieldValid(e, property),
        ),
      );
      key = property;
    } else {
      const errors = rows.map((e) =>
        section === 'workHistory'
          ? workErrors(e as WorkHistoryEntry)
          : educationErrors(e as EducationEntry),
      );
      idx = Math.max(
        0,
        errors.findIndex((e) => Object.keys(e).length > 0),
      );
      key = Object.keys(errors[idx] ?? {})[0] ?? key;
    }
    return {
      id: `field-${section}-${idx}-${key}`,
      cardId: `entry-${section}-${idx}`,
      fallbackId: `add-${section}`,
    };
  }
}
