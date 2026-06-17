import type { Profile } from '../types/profile';

export interface CompletionResult {
  percentage: number;
  missingFields: string[];
}

const TOTAL_CHECKS = 17;

export function calculateCompletion(profile: Partial<Profile>): CompletionResult {
  const missing: string[] = [];

  const check = (condition: boolean, label: string) => {
    if (!condition) missing.push(label);
  };

  // Personal (4)
  check(!!profile.personal?.firstName?.trim(), 'First Name');
  check(!!profile.personal?.lastName?.trim(), 'Last Name');
  check(!!profile.personal?.email?.trim(), 'Email');
  check(!!profile.personal?.phone?.trim(), 'Phone');

  // Address (2)
  check(!!profile.address?.city?.trim(), 'City');
  check(!!profile.address?.country?.trim(), 'Country');

  // Professional (3)
  check(!!profile.professional?.currentTitle?.trim(), 'Current Title');
  check(!!profile.professional?.currentCompany?.trim(), 'Current Company');
  check(typeof profile.professional?.yearsOfExperience === 'number', 'Years of Experience');

  // Salary (3)
  check(
    typeof profile.salary?.current?.amount === 'number' && profile.salary.current.amount >= 0,
    'Current Salary Amount',
  );
  check(!!profile.salary?.current?.currency?.trim(), 'Current Salary Currency');
  check((profile.salary?.expected?.length ?? 0) >= 1, 'Expected Salary (at least one entry)');

  // Work Authorization (1)
  const waEntries = profile.workAuthorization ?? [];
  check(
    waEntries.length >= 1 && waEntries.every((e) => !!e.country?.trim() && !!e.status),
    'Work Authorization',
  );

  // Work History (1)
  const whEntries = profile.workHistory ?? [];
  check(
    whEntries.length >= 1 &&
      whEntries.every((e) => !!e.company?.trim() && !!e.title?.trim() && !!e.startDate?.trim()),
    'Work History',
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
    'Education',
  );

  // Languages (1) — English mandatory
  check(
    (profile.languages ?? []).some((l) => l.language.toLowerCase() === 'english'),
    'English Language Entry',
  );

  // Links (1)
  check(!!profile.links?.linkedin?.trim(), 'LinkedIn URL');

  const percentage = Math.round(((TOTAL_CHECKS - missing.length) / TOTAL_CHECKS) * 100);

  return { percentage, missingFields: missing };
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
      !!profile.personal?.phone?.trim(),

    address: !!profile.address?.city?.trim() && !!profile.address?.country?.trim(),

    professional:
      !!profile.professional?.currentTitle?.trim() &&
      !!profile.professional?.currentCompany?.trim() &&
      typeof profile.professional?.yearsOfExperience === 'number',

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
