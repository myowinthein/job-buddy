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

export interface CompletionResult {
  percentage: number;
  missingFields: string[];
  missingGroups: CompletionGroup[];
}

const TOTAL_CHECKS = 14;

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

  // Work History (1)
  const whEntries = profile.workHistory ?? [];
  check(
    whEntries.length >= 1 &&
      whEntries.every((e) => !!e.company?.trim() && !!e.title?.trim() && !!e.startDate?.trim()),
    'workHistory', 'Work History', 'At least one complete entry',
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
    (profile.languages ?? []).some((l) => l.language.toLowerCase() === 'english'),
    'languages', 'Languages', 'English Language Entry',
  );

  // Links (1)
  check(!!profile.links?.linkedin?.trim(), 'links', 'Links & Profiles', 'LinkedIn URL');

  const totalMissing = groups.reduce((sum, g) => sum + g.fields.length, 0);
  const percentage = Math.round(((TOTAL_CHECKS - totalMissing) / TOTAL_CHECKS) * 100);
  const missingFields = groups.flatMap((g) => g.fields);

  return { percentage, missingFields, missingGroups: groups };
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

    workHistory:
      whEntries.length >= 1 &&
      whEntries.every((e) => !!e.company?.trim() && !!e.title?.trim() && !!e.startDate?.trim()),

    education:
      eduEntries.length >= 1 &&
      eduEntries.every(
        (e) =>
          !!e.institution?.trim() &&
          !!e.degree?.trim() &&
          !!e.fieldOfStudy?.trim() &&
          !!e.startDate?.trim(),
      ),

    languages: (profile.languages ?? []).some((l) => l.language.toLowerCase() === 'english'),

    links: !!profile.links?.linkedin?.trim(),

    documents: !!(profile.documents?.cv?.url?.trim() || profile.documents?.cv?.file),
  };
}
