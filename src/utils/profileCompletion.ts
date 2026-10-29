import {
  isValidProfileEmail,
  isValidProfilePhone,
  isValidAmount,
  isLinkedInUrl,
  isValidProfileUrl,
  noticeDurationError,
  profileDateRangeErrors,
  birthDateError,
  isValidPersonalOption,
} from './profileInputValidation';
import { findCountryByNameOrCode } from '../data/countries';
import { primaryCountryForCurrency, COUNTRY_TO_CURRENCY } from '../data/currencies';
import { WORK_AUTH_STATUS_LABELS } from '../data/workAuthorization';
import { LANGUAGE_PROFICIENCY_LABELS } from '../data/languages';
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
  Nickname: 'field-nickname',
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

const TOTAL_CHECKS = 15;

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
    'Personal Information',
    'First Name',
  );
  check(
    validText(profile.personal?.lastName, 100),
    'personal',
    'Personal Information',
    'Last Name',
  );
  check(
    isValidProfileEmail(profile.personal?.email ?? ''),
    'personal',
    'Personal Information',
    'Email',
  );
  check(
    isValidProfilePhone(resolvePhoneNumber(profile.personal?.phone)),
    'personal',
    'Personal Information',
    'Phone',
  );

  // Address (2)
  check(validText(profile.address?.city, 100), 'address', 'Address', 'City');
  check(validCountry(profile.address?.country), 'address', 'Address', 'Country');

  // Salary (2 mandatory; Expected Salary is optional and tracked below)
  check(
    typeof profile.salary?.current?.amount === 'number' &&
      isValidAmount(profile.salary.current.amount),
    'salary',
    'Salary',
    'Current Salary Amount',
  );
  check(
    !!profile.salary?.current?.currency &&
      COUNTRY_TO_CURRENCY[
        findCountryByNameOrCode(profile.salary.current.country ?? '')?.code ??
          primaryCountryForCurrency(profile.salary.current.currency) ??
          ''
      ] === profile.salary.current.currency,
    'salary',
    'Salary',
    'Current Salary Currency',
  );

  // Work Authorization (1)
  const waEntries = profile.workAuthorization ?? [];
  check(
    waEntries.length >= 1 &&
      waEntries.every(
        (e) => validCountry(e.country) && Object.hasOwn(WORK_AUTH_STATUS_LABELS, e.status),
      ),
    'workAuthorization',
    'Work Authorization',
    'At least one valid entry',
  );

  // Work History (2)
  const whEntries = profile.workHistory ?? [];
  check(
    whEntries.length >= 1 && whEntries.every((e) => Object.keys(workErrors(e)).length === 0),
    'workHistory',
    'Work History',
    'At least one complete entry',
  );
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
      profile.languages!.every((e) => !!e.language?.trim() && validProficiency(e.proficiency)),
    'languages',
    'Languages',
    'At least one language',
  );

  // Links (1)
  check(isLinkedInUrl(profile.links?.linkedin ?? ''), 'links', 'Links & Profiles', 'LinkedIn URL');

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

  optCheck(
    validText(profile.personal?.nickname, 100),
    'personal',
    'Personal Information',
    'Nickname',
  );
  optCheck(
    !!profile.personal?.dateOfBirth && !birthDateError(profile.personal.dateOfBirth),
    'personal',
    'Personal Information',
    'Date of Birth',
  );
  optCheck(
    !!profile.personal?.gender?.trim() && isValidPersonalOption('gender', profile.personal.gender),
    'personal',
    'Personal Information',
    'Gender',
  );
  optCheck(
    !!profile.personal?.ethnicity?.trim() &&
      isValidPersonalOption('ethnicity', profile.personal.ethnicity),
    'personal',
    'Personal Information',
    'Ethnicity',
  );
  optCheck(
    !!profile.personal?.veteranStatus?.trim() &&
      isValidPersonalOption('veteranStatus', profile.personal.veteranStatus),
    'personal',
    'Personal Information',
    'Veteran Status',
  );
  optCheck(
    !!profile.personal?.disabilityStatus?.trim() &&
      isValidPersonalOption('disabilityStatus', profile.personal.disabilityStatus),
    'personal',
    'Personal Information',
    'Disability Status',
  );
  optCheck(validText(profile.address?.street, 255), 'address', 'Address', 'Street Address');
  optCheck(validText(profile.address?.state, 100), 'address', 'Address', 'State / Province');
  optCheck(validText(profile.address?.postalCode, 20), 'address', 'Address', 'Postal Code');
  optCheck(
    (profile.salary?.expected?.length ?? 0) >= 1 &&
      profile.salary!.expected.every(
        (e) =>
          e.amount != null &&
          isValidAmount(e.amount) &&
          (validCountry(e.country) || !!primaryCountryForCurrency(e.currency ?? '')),
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

  optCheck(
    isValidProfileUrl(profile.links?.portfolio ?? ''),
    'links',
    'Links & Profiles',
    'Portfolio URL',
  );

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
    salary: !missing.has('salary'),
    workAuthorization: !missing.has('workAuthorization'),
    workHistory: !missing.has('workHistory'),
    education: !missing.has('education'),
    languages: !missing.has('languages'),
    links: !missing.has('links'),
    documents: !missing.has('documents'),
  };
}

export interface CompletionTarget {
  id: string;
  cardId?: string;
  fallbackId?: string;
  revealId?: string;
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
    const idx = Math.max(
      0,
      rows.findIndex(
        (e) => !validCountry(e.country) || !Object.hasOwn(WORK_AUTH_STATUS_LABELS, e.status),
      ),
    );
    const key = !validCountry(rows[idx]?.country) ? 'country' : 'status';
    return { id: `field-workAuthorization-${idx}-${key}`, fallbackId: 'add-workAuthorization' };
  }
  if (section === 'languages') {
    const rows = profile.languages ?? [];
    const idx = Math.max(
      0,
      rows.findIndex((e) => !e.language?.trim() || !validProficiency(e.proficiency)),
    );
    return {
      id: `field-languages-${idx}-${!rows[idx]?.language?.trim() ? 'language' : 'proficiency'}`,
      fallbackId: 'add-languages',
    };
  }
  if (field === 'Notice Period')
    return {
      id:
        profile.professional?.noticePeriod?.immediate === false
          ? 'field-noticeValue'
          : 'field-noticePeriod',
    };
  if (field === 'CV / Résumé') return { id: 'field-cv', revealId: 'show-cv-url' };
  if (field === 'Expected Salary') {
    const rows = profile.salary?.expected ?? [];
    const idx = Math.max(
      0,
      rows.findIndex(
        (e) => e.amount == null || !isValidAmount(e.amount) || !validCountry(e.country),
      ),
    );
    const key = !validCountry(rows[idx]?.country) ? 'country' : 'amount';
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
