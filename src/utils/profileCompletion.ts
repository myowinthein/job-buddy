import type { Profile, PhoneNumber } from '../types/profile';

function resolvePhoneNumber(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  const ph = raw as Partial<PhoneNumber>;
  return ph.number ?? '';
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
  'First Name':              'field-firstName',
  'Last Name':               'field-lastName',
  'Email':                   'field-email',
  'Phone':                   'field-phone',
  'City':                    'field-city',
  'Country':                 'field-country',
  'Current Salary Amount':   'field-currentAmount',
  'Current Salary Currency': 'field-currentCurrency',
  // 'At least one language' has no single target field; navigation goes to the section
  'LinkedIn URL':            'field-linkedin',
  // Optional
  'Date of Birth':           'field-dateOfBirth',
  'Gender':                  'field-gender',
  'Ethnicity':               'field-ethnicity',
  'Veteran Status':          'field-veteranStatus',
  'Disability Status':       'field-disabilityStatus',
  'Street Address':          'field-street',
  'State / Province':        'field-state',
  'Postal Code':             'field-postalCode',
  'Career Summary':          'field-summary',
  'Portfolio URL':           'field-portfolio',
  // 'Custom Links' has no stable single input ID — section navigation only
};

export interface CompletionResult {
  percentage:              number;
  missingFields:           string[];
  missingGroups:           CompletionGroup[];
  isCoreComplete:          boolean;
  optionalFieldsRemaining: number;
  optionalGroups:          CompletionGroup[];
}

const TOTAL_CHECKS = 16;

export function calculateCompletion(profile: Partial<Profile>): CompletionResult {
  const groups: CompletionGroup[] = [];

  function check(condition: boolean, sectionId: string, sectionLabel: string, field: string) {
    if (!condition) {
      let g = groups.find((x) => x.sectionId === sectionId);
      if (!g) { g = { sectionId, sectionLabel, fields: [] }; groups.push(g); }
      g.fields.push(field);
    }
  }

  // Personal (4)
  check(!!profile.personal?.firstName?.trim(), 'personal', 'Personal Information', 'First Name');
  check(!!profile.personal?.lastName?.trim(), 'personal', 'Personal Information', 'Last Name');
  check(!!profile.personal?.email?.trim(), 'personal', 'Personal Information', 'Email');
  check(!!resolvePhoneNumber(profile.personal?.phone).trim(), 'personal', 'Personal Information', 'Phone');

  // Address (2)
  check(!!profile.address?.city?.trim(), 'address', 'Address', 'City');
  check(!!profile.address?.country?.trim(), 'address', 'Address', 'Country');

  // Salary (3)
  check(
    typeof profile.salary?.current?.amount === 'number' && profile.salary.current.amount >= 0,
    'salary', 'Salary', 'Current Salary Amount',
  );
  check(!!profile.salary?.current?.currency?.trim(), 'salary', 'Salary', 'Current Salary Currency');
  check((profile.salary?.expected?.length ?? 0) >= 1, 'salary', 'Salary', 'Expected Salary (at least one entry)');

  // Work Authorization (1)
  const waEntries = profile.workAuthorization ?? [];
  check(
    waEntries.length >= 1 && waEntries.every((e) => !!e.country?.trim() && !!e.status),
    'workAuthorization', 'Work Authorization', 'At least one valid entry',
  );

  // Work History (2)
  const whEntries = profile.workHistory ?? [];
  check(
    whEntries.length >= 1 &&
      whEntries.every((e) => !!e.company?.trim() && !!e.title?.trim() && !!e.startDate?.trim()),
    'workHistory', 'Work History', 'At least one complete entry',
  );
  const np = profile.professional?.noticePeriod;
  check(
    np !== undefined && (
      np.immediate === true ||
      (np.immediate === false && typeof np.value === 'number' && np.value >= 1 && !!np.unit)
    ),
    'workHistory', 'Work History', 'Notice Period',
  );

  // Education (1)
  const eduEntries = profile.education ?? [];
  check(
    eduEntries.length >= 1 &&
      eduEntries.every(
        (e) =>
          !!e.institution?.trim() &&
          !!e.degree?.trim() &&
          !!e.fieldOfStudy?.trim() &&
          !!e.startDate?.trim(),
      ),
    'education', 'Education', 'At least one complete entry',
  );

  // Languages (1)
  check(
    (profile.languages ?? []).length >= 1,
    'languages', 'Languages', 'At least one language',
  );

  // Links (1)
  check(!!profile.links?.linkedin?.trim(), 'links', 'Links & Profiles', 'LinkedIn URL');

  // Documents (1)
  check(
    !!(profile.documents?.cv?.url?.trim() || profile.documents?.cv?.file),
    'documents', 'Documents', 'CV / Résumé',
  );

  const totalMissing = groups.reduce((sum, g) => sum + g.fields.length, 0);
  const percentage = Math.round(((TOTAL_CHECKS - totalMissing) / TOTAL_CHECKS) * 100);
  const missingFields = groups.flatMap((g) => g.fields);
  const isCoreComplete = percentage === 100;

  // Optional fields — count unfilled; also build groups for the dropdown
  const optGroups: CompletionGroup[] = [];

  function optCheck(
    condition: boolean,
    sectionId: string,
    sectionLabel: string,
    field: string,
  ) {
    if (!condition) {
      let g = optGroups.find((x) => x.sectionId === sectionId);
      if (!g) { g = { sectionId, sectionLabel, fields: [] }; optGroups.push(g); }
      g.fields.push(field);
    }
  }

  optCheck(!!profile.personal?.dateOfBirth?.trim(),    'personal',    'Personal Information', 'Date of Birth');
  optCheck(!!profile.personal?.gender?.trim(),         'personal',    'Personal Information', 'Gender');
  optCheck(!!profile.personal?.ethnicity?.trim(),      'personal',    'Personal Information', 'Ethnicity');
  optCheck(!!profile.personal?.veteranStatus?.trim(),  'personal',    'Personal Information', 'Veteran Status');
  optCheck(!!profile.personal?.disabilityStatus?.trim(),'personal',   'Personal Information', 'Disability Status');
  optCheck(!!profile.address?.street?.trim(),          'address',     'Address',              'Street Address');
  optCheck(!!profile.address?.state?.trim(),           'address',     'Address',              'State / Province');
  optCheck(!!profile.address?.postalCode?.trim(),      'address',     'Address',              'Postal Code');
  optCheck(!!profile.professional?.summary?.trim(),    'workHistory', 'Work History',         'Career Summary');
  optCheck(!!profile.links?.portfolio?.trim(),         'links',       'Links & Profiles',     'Portfolio URL');
  optCheck((profile.links?.custom?.length ?? 0) >= 1, 'links',       'Links & Profiles',     'Custom Links');

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
  const waEntries = profile.workAuthorization ?? [];
  const whEntries = profile.workHistory ?? [];
  const eduEntries = profile.education ?? [];

  return {
    personal:
      !!profile.personal?.firstName?.trim() &&
      !!profile.personal?.lastName?.trim() &&
      !!profile.personal?.email?.trim() &&
      !!resolvePhoneNumber(profile.personal?.phone).trim(),

    address: !!profile.address?.city?.trim() && !!profile.address?.country?.trim(),

    salary:
      typeof profile.salary?.current?.amount === 'number' &&
      profile.salary.current.amount >= 0 &&
      !!profile.salary?.current?.currency?.trim() &&
      (profile.salary?.expected?.length ?? 0) >= 1,

    workAuthorization:
      waEntries.length >= 1 && waEntries.every((e) => !!e.country?.trim() && !!e.status),

    workHistory: (() => {
      const npCheck = profile.professional?.noticePeriod;
      const noticeValid = npCheck !== undefined && (
        npCheck.immediate === true ||
        (npCheck.immediate === false && typeof npCheck.value === 'number' && npCheck.value >= 1 && !!npCheck.unit)
      );
      return (
        whEntries.length >= 1 &&
        whEntries.every((e) => !!e.company?.trim() && !!e.title?.trim() && !!e.startDate?.trim()) &&
        noticeValid
      );
    })(),

    education:
      eduEntries.length >= 1 &&
      eduEntries.every(
        (e) =>
          !!e.institution?.trim() &&
          !!e.degree?.trim() &&
          !!e.fieldOfStudy?.trim() &&
          !!e.startDate?.trim(),
      ),

    languages: (profile.languages ?? []).length >= 1,

    links: !!profile.links?.linkedin?.trim(),

    documents: !!(profile.documents?.cv?.url?.trim() || profile.documents?.cv?.file),
  };
}
