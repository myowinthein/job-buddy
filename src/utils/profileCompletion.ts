import type { Profile, PhoneNumber, NoticePeriod } from '../types/profile';

function resolvePhoneNumber(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  const ph = raw as Partial<PhoneNumber>;
  return ph.number ?? '';
}

function isNoticePeriodValid(np: NoticePeriod | undefined): boolean {
  if (np === undefined) return false;
  return (
    np.immediate === true ||
    (np.immediate === false && typeof np.value === 'number' && np.value >= 1 && !!np.unit)
  );
}

export interface CompletionGroup {
  sectionId: string;
  sectionLabel: string;
  fields: string[];
}

// Maps a dot-notation profile path (as used by the autofill resolver/picker)
// to the matching options section and DOM input id, so the "Go to Profile"
// CTA on a gray noData picker can deep-link the user to the exact missing
// field. Prefix-matched in resolvePathFocusTarget(); the longest matching
// path wins so e.g. `personal.dateOfBirth` is preferred over `personal.*`.
export const PATH_FOCUS_TARGETS: Record<string, { section: string; fieldId?: string }> = {
  'personal.firstName':            { section: 'personal', fieldId: 'field-firstName' },
  'personal.lastName':             { section: 'personal', fieldId: 'field-lastName' },
  'personal.email':                { section: 'personal', fieldId: 'field-email' },
  'personal.phone':                { section: 'personal', fieldId: 'field-phone' },
  'personal.dateOfBirth':          { section: 'personal', fieldId: 'field-dateOfBirth' },
  'personal.gender':               { section: 'personal', fieldId: 'field-gender' },
  'personal.ethnicity':            { section: 'personal', fieldId: 'field-ethnicity' },
  'personal.veteranStatus':        { section: 'personal', fieldId: 'field-veteranStatus' },
  'personal.disabilityStatus':     { section: 'personal', fieldId: 'field-disabilityStatus' },
  'address.street':                { section: 'address',  fieldId: 'field-street' },
  'address.city':                  { section: 'address',  fieldId: 'field-city' },
  'address.state':                 { section: 'address',  fieldId: 'field-state' },
  'address.postalCode':            { section: 'address',  fieldId: 'field-postalCode' },
  'address.country':               { section: 'address',  fieldId: 'field-country' },
  'salary.current.amount':         { section: 'salary',   fieldId: 'field-currentAmount' },
  'salary.current.currency':       { section: 'salary',   fieldId: 'field-currentCurrency' },
  'salary.expected':               { section: 'salary' },
  'professional.summary':          { section: 'personal', fieldId: 'field-summary' },
  'professional.noticePeriod':     { section: 'personal' },
  'workAuthorization':             { section: 'workAuthorization' },
  'workHistory':                   { section: 'workHistory' },
  'education':                     { section: 'education' },
  'languages':                     { section: 'languages' },
  'links.linkedin':                { section: 'links',    fieldId: 'field-linkedin' },
  'links.portfolio':               { section: 'links',    fieldId: 'field-portfolio' },
  'links':                         { section: 'links' },
  'documents':                     { section: 'documents' },
  'derived.fullName':              { section: 'personal', fieldId: 'field-firstName' },
  'derived.currentTitle':          { section: 'workHistory' },
  'derived.currentCompany':        { section: 'workHistory' },
};

/** Resolves a dot-notation path to its target section + DOM id by longest-prefix match. */
export function resolvePathFocusTarget(path: string): { section: string; fieldId?: string } | null {
  if (!path) return null;
  if (PATH_FOCUS_TARGETS[path]) return PATH_FOCUS_TARGETS[path];
  const segments = path.split('.');
  while (segments.length > 1) {
    segments.pop();
    const prefix = segments.join('.');
    if (PATH_FOCUS_TARGETS[prefix]) return PATH_FOCUS_TARGETS[prefix];
  }
  return null;
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
};

export interface CompletionResult {
  percentage:              number;
  missingFields:           string[];
  missingGroups:           CompletionGroup[];
  isCoreComplete:          boolean;
  optionalFieldsRemaining: number;
  optionalGroups:          CompletionGroup[];
}

const TOTAL_CHECKS = 15;

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

  // Salary (2 mandatory; Expected Salary is optional and tracked below)
  check(
    typeof profile.salary?.current?.amount === 'number' && profile.salary.current.amount >= 0,
    'salary', 'Salary', 'Current Salary Amount',
  );
  check(!!profile.salary?.current?.currency?.trim(), 'salary', 'Salary', 'Current Salary Currency');

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
  check(
    isNoticePeriodValid(profile.professional?.noticePeriod),
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
  optCheck((profile.salary?.expected?.length ?? 0) >= 1, 'salary',    'Salary',               'Expected Salary');
  optCheck(!!profile.professional?.summary?.trim(),    'workHistory', 'Work History',         'Career Summary');

  // Work History entry-level optional fields: report once per missing field
  // across any entry that has the core fields filled. Skips empty/placeholder
  // entries (no company AND no title) so blank skeleton rows don't trigger
  // false positives.
  const whFilled = (profile.workHistory ?? []).filter(
    (e) => !!e.company?.trim() || !!e.title?.trim(),
  );
  if (whFilled.length > 0) {
    optCheck(whFilled.every((e) => !!e.location?.city?.trim() || !!e.location?.countryCode?.trim()),
      'workHistory', 'Work History', 'Location');
    optCheck(whFilled.every((e) => !!e.arrangement),
      'workHistory', 'Work History', 'Work Arrangement');
    optCheck(whFilled.every((e) => !!e.description?.trim()),
      'workHistory', 'Work History', 'Description');
  }

  optCheck(!!profile.links?.portfolio?.trim(),         'links',       'Links & Profiles',     'Portfolio URL');

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
      !!profile.salary?.current?.currency?.trim(),

    workAuthorization:
      waEntries.length >= 1 && waEntries.every((e) => !!e.country?.trim() && !!e.status),

    workHistory:
      whEntries.length >= 1 &&
      whEntries.every((e) => !!e.company?.trim() && !!e.title?.trim() && !!e.startDate?.trim()) &&
      isNoticePeriodValid(profile.professional?.noticePeriod),

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
