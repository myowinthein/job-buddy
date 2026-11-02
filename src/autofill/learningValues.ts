import type { Profile } from '../types/profile';
import { calculateDerivedFields } from '../utils/derivedFields';
import { isLearnedPath } from '../utils/learnedMappingData';
import { flattenProfileValues, resolveProfileValue } from './resolver';
import { mostRecentIdx } from './entryRecency';

const text = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
function comparable(value: string, path: string): string {
  if (/^personal\.phone\./.test(path))
    return /^[+\d\s().-]+$/.test(value) ? value.replace(/[^\d]/g, '') : value;
  if (/^(links\.|documents\..*\.url)/.test(path)) {
    try {
      return new URL(value).href;
    } catch {
      return value.trim();
    }
  }
  if (/\.amount$/.test(path) && /^[\d,]+(?:\.\d+)?$/.test(value)) return value.replace(/,/g, '');
  return text(value); // Email and URL punctuation is meaningful.
}

export function learningValues(profile: Profile): Array<{ path: string; value: string }> {
  let derived = profile.derived;
  try {
    derived = calculateDerivedFields(profile);
  } catch {
    /* Partial profiles remain usable. */
  }
  const fresh = { ...profile, derived };
  const current = mostRecentIdx(profile.workHistory ?? []);
  const canonical = (path: string): string => {
    if (path === 'derived.currentTitle' && profile.workHistory?.[current]?.isCurrent)
      return `workHistory.${current}.title`;
    if (path === 'derived.currentCompany' && profile.workHistory?.[current]?.isCurrent)
      return `workHistory.${current}.company`;
    if (path === 'derived.fullName' && !profile.personal?.lastName) return 'personal.firstName';
    if (path === 'derived.fullName' && !profile.personal?.firstName) return 'personal.lastName';
    if (path === 'address.countryName') return 'address.country';
    if (path === 'personal.phone.full' && !profile.personal?.phone?.callingCode)
      return 'personal.phone.number';
    if (/^(education|workHistory)\.\d+\.(startDate|endDate)$/.test(path))
      return `${path}.formatted`;
    return path;
  };
  const values = flattenProfileValues(fresh).filter((entry) => isLearnedPath(entry.path));
  const virtual = [
    'personal.phone.full',
    'address.countryName',
    'languages.formatted',
    'professional.noticePeriod.formatted',
    'professional.noticePeriod.availableDate',
    'salary.current.formatted',
  ];
  for (const family of ['workHistory', 'education', 'languages'] as const)
    (profile[family] ?? []).forEach((_entry, i) => {
      if (family === 'languages')
        virtual.push(`languages.${i}.language`, `languages.${i}.proficiency`);
      else virtual.push(`${family}.${i}.startDate.formatted`, `${family}.${i}.endDate.formatted`);
    });
  (profile.salary?.expected ?? []).forEach((_entry, i) =>
    virtual.push(`salary.expected.${i}.formatted`),
  );
  for (const path of virtual) {
    const value = resolveProfileValue(fresh, path);
    if (value) values.push({ path, value });
  }
  return values.map(({ path, value }) => ({ path: canonical(path), value }));
}

/** Canonical aliases collapse; two genuinely different answers remain ambiguous. */
export function matchLearningValue(
  values: ReturnType<typeof learningValues>,
  value: string,
): string | null {
  const paths = new Set(
    values
      .filter(
        (candidate) =>
          comparable(candidate.value, candidate.path) === comparable(value, candidate.path),
      )
      .map((candidate) => candidate.path),
  );
  return paths.size === 1 ? [...paths][0] : null;
}
