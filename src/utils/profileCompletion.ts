import { profileTextLimit, WORK_ARRANGEMENTS } from '../profile/fieldPolicies';
import {
  CORE_COMPLETION_IDS,
  completionItem,
  completionFieldId,
  completionSectionLabel,
} from '../profile/completionItems';
import { PROFILE_SECTION_DEFINITIONS } from '../profile/fieldCatalog';
import {
  catalogProfileTarget,
  catalogSectionStartTarget,
  profileReviewMetadata,
  type ProfileInputTarget,
} from '../profile/fieldMetadata';
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
    ...(!validText(row.company, profileTextLimit('workHistory.$.company'))
      ? { company: 'required' }
      : {}),
    ...(!validText(row.title, profileTextLimit('workHistory.$.title'))
      ? { title: 'required' }
      : {}),
    ...profileDateRangeErrors(row),
  };
}
function educationErrors(row: EducationEntry): Record<string, string> {
  return {
    ...(!validText(row.institution, profileTextLimit('education.$.institution'))
      ? { institution: 'required' }
      : {}),
    ...(!validText(row.degree, profileTextLimit('education.$.degree'))
      ? { degree: 'required' }
      : {}),
    ...(!validText(row.fieldOfStudy, profileTextLimit('education.$.fieldOfStudy'))
      ? { fieldOfStudy: 'required' }
      : {}),
    ...profileDateRangeErrors(row, true),
  };
}
function optionalWorkFieldValid(
  row: WorkHistoryEntry,
  field: 'location' | 'arrangement' | 'description',
): boolean {
  if (field === 'description')
    return validText(row.description, profileTextLimit('workHistory.$.description'));
  if (field === 'arrangement') return WORK_ARRANGEMENTS.some((value) => value === row.arrangement);
  const location = row.location;
  if (typeof location === 'string')
    return validText(location, profileTextLimit('workHistory.$.location.city'));
  return (
    !!location &&
    (validText(location.city, profileTextLimit('workHistory.$.location.city')) ||
      validCountry(location.countryCode))
  );
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
  fieldIds?: string[];
}

export interface CompletionResult {
  percentage: number;
  missingFields: string[];
  missingGroups: CompletionGroup[];
  isCoreComplete: boolean;
  optionalFieldsRemaining: number;
  optionalGroups: CompletionGroup[];
}

const TOTAL_CHECKS = CORE_COMPLETION_IDS.length;

function makeChecker(target: CompletionGroup[]) {
  return (condition: boolean, id: string) => {
    if (condition) return;
    const item = completionItem(id);
    let group = target.find((entry) => entry.sectionId === item.section);
    if (!group) {
      group = {
        sectionId: item.section,
        sectionLabel: completionSectionLabel(item.section),
        fields: [],
        fieldIds: [],
      };
      target.push(group);
    }
    group.fields.push(item.label);
    group.fieldIds!.push(id);
  };
}
function sortGroups(groups: CompletionGroup[]): CompletionGroup[] {
  return groups
    .sort(
      (left, right) =>
        PROFILE_SECTION_DEFINITIONS.findIndex((item) => item.id === left.sectionId) -
        PROFILE_SECTION_DEFINITIONS.findIndex((item) => item.id === right.sectionId),
    )
    .map((group) => {
      const items = group
        .fieldIds!.map((id, index) => ({
          id,
          label: group.fields[index],
          order: profileReviewMetadata(id.replaceAll('$', '0'))?.order ?? 0,
        }))
        .sort((left, right) => left.order - right.order);
      return {
        ...group,
        fields: items.map((item) => item.label),
        fieldIds: items.map((item) => item.id),
      };
    });
}

export function calculateCompletion(profile: Partial<Profile>): CompletionResult {
  const groups: CompletionGroup[] = [];
  const check = makeChecker(groups);

  // Personal (3)
  check(
    validText(profile.personal?.firstName, profileTextLimit('personal.firstName')),
    'personal.firstName',
  );
  check(isValidProfileEmail(profile.personal?.email ?? ''), 'personal.email');
  check(isValidProfilePhone(resolvePhoneNumber(profile.personal?.phone)), 'personal.phone');

  // Address (2)
  check(validText(profile.address?.city, profileTextLimit('address.city')), 'address.city');
  check(validCountry(profile.address?.country), 'address.country');

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
  );

  // Availability (1); employment history is optional.
  check(isNoticePeriodValid(profile.professional?.noticePeriod), 'professional.noticePeriod');

  // Education (1)
  const eduEntries = profile.education ?? [];
  check(
    eduEntries.length >= 1 && eduEntries.every((e) => Object.keys(educationErrors(e)).length === 0),
    'education',
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
  );

  // Documents (1)
  check(
    !!(profile.documents?.cv?.url?.trim() || profile.documents?.cv?.file?.base64) &&
      (!profile.documents?.cv?.url?.trim() || isValidProfileUrl(profile.documents.cv.url)),
    'documents.cv',
  );

  const sortedGroups = sortGroups(groups);
  const totalMissing = sortedGroups.reduce((sum, g) => sum + g.fields.length, 0);
  const percentage = Math.round(((TOTAL_CHECKS - totalMissing) / TOTAL_CHECKS) * 100);
  const missingFields = sortedGroups.flatMap((g) => g.fields);
  const isCoreComplete = percentage === 100;

  // Optional fields — count unfilled; also build groups for the dropdown
  const optGroups: CompletionGroup[] = [];
  const optCheck = makeChecker(optGroups);

  optCheck(
    validText(profile.address?.street, profileTextLimit('address.street')),
    'address.street',
  );
  optCheck(validText(profile.address?.state, profileTextLimit('address.state')), 'address.state');
  optCheck(
    validText(profile.address?.postalCode, profileTextLimit('address.postalCode')),
    'address.postalCode',
  );
  optCheck(
    (profile.salary?.expected?.length ?? 0) >= 1 &&
      profile.salary!.expected.every(
        (e) =>
          e.amount != null &&
          isValidAmount(e.amount) &&
          CURRENCIES.some((currency) => currency.code === e.currency),
      ),
    'salary.expected',
  );
  optCheck(
    validText(profile.professional?.summary, profileTextLimit('professional.summary')),
    'professional.summary',
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
      'workHistory.$.location',
    );
    optCheck(
      whFilled.every((e) => optionalWorkFieldValid(e, 'arrangement')),
      'workHistory.$.arrangement',
    );
    optCheck(
      whFilled.every((e) => optionalWorkFieldValid(e, 'description')),
      'workHistory.$.description',
    );
  }

  optCheck(hasProfileLink(profile), 'links');
  optCheck(validSalary(profile.salary?.current), 'salary.current');

  const optionalFieldsRemaining = optGroups.reduce((sum, g) => sum + g.fields.length, 0);

  return {
    percentage,
    missingFields,
    missingGroups: sortedGroups,
    isCoreComplete,
    optionalFieldsRemaining,
    optionalGroups: sortGroups(optGroups),
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

export type CompletionTarget = ProfileInputTarget;

/** Category links follow the same first-field order as the editor. */
export function getSectionStartTarget(section: string): CompletionTarget | undefined {
  return catalogSectionStartTarget(section);
}

/** Resolve aggregate checklist items to the first row/input that needs attention. */
export function getCompletionTarget(
  profile: Partial<Profile>,
  section: string,
  field: string,
): CompletionTarget | undefined {
  const id = completionFieldId(section, field);
  const direct = id.includes('$') ? null : catalogProfileTarget(profile, id);
  if (direct) return direct.target;
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
  if (id === 'documents.cv') return { id: 'field-cv' };
  if (id === 'links') return { id: 'field-linkedin' };
  if (id === 'salary.current')
    return {
      id: profile.salary?.current?.amount == null ? 'field-currentAmount' : 'field-currentCurrency',
    };
  if (id === 'salary.expected') {
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
      ['workHistory.$.location', 'workHistory.$.arrangement', 'workHistory.$.description'].includes(
        id,
      )
    ) {
      const property =
        id === 'workHistory.$.location'
          ? 'location'
          : id === 'workHistory.$.arrangement'
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
