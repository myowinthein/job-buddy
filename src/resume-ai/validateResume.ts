import { profileShape, type ProfileShape } from '../profile/profileShape';
import { RESUME_PROFILE_PATHS, profileFieldPolicy } from '../profile/fieldPolicies';
import { feedback } from '@/src/ui/feedback';
import type { Profile } from '@/src/types/profile';
import { findCountryByNameOrCode } from '@/src/data/countries';
import { normalizeProfile } from '@/src/utils/migrate';
import { validateImportedProfile } from '@/src/utils/profileValidator';
import { normalizeExtractedProfile } from './normalize';

type Shape = ProfileShape<'string' | 'number' | 'boolean'>;
// IDs, derived values, documents and expected salary have explicit local-only extraction policies.
const shape: Shape = profileShape(RESUME_PROFILE_PATHS, (path) => profileFieldPolicy(path).type);

const invalid = () => new Error(feedback.resumeInvalidData);

function read(value: unknown, expected: Shape): unknown {
  if (value == null) return undefined;
  if (typeof expected === 'string') {
    if (typeof value !== expected || (typeof value === 'number' && !Number.isFinite(value)))
      throw invalid();
    return value;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(value) || value.some((entry) => entry == null)) throw invalid();
    return value.map((entry) => read(entry, expected[0]));
  }
  if (typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(expected)
      .filter(([key]) => source[key] != null)
      .map(([key, child]) => [key, read(source[key], child)]),
  );
}

export function validateResumeProfile(raw: unknown): Partial<Profile> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid();
  const clean = read(raw, shape) as Partial<Profile>;
  // Unknown dates stay blank; never invent education dates to satisfy editor requirements.
  const workStatuses = clean.workHistory?.map((entry) => entry.isCurrent);
  for (const entry of clean.workHistory ?? []) entry.isCurrent ??= false;
  for (const entry of clean.education ?? []) entry.fieldOfStudy ??= '';
  const normalized = normalizeProfile(clean as Profile);
  const result = validateImportedProfile(normalized, { allowMissingDates: true });
  if (!result.valid) throw invalid();
  if (clean.address?.country && !findCountryByNameOrCode(clean.address.country)) throw invalid();
  for (const entry of result.sanitized.workHistory ?? []) {
    if (entry.location?.countryCode && !findCountryByNameOrCode(entry.location.countryCode))
      throw invalid();
  }
  // Keep unknown status absent until matched entries restore their saved status.
  result.sanitized.workHistory?.forEach((entry, index) => {
    if (workStatuses?.[index] == null) Reflect.deleteProperty(entry, 'isCurrent');
  });
  result.sanitized.education?.forEach((entry, index) => {
    if (clean.education?.[index]?.isCurrent == null) Reflect.deleteProperty(entry, 'isCurrent');
  });
  return normalizeExtractedProfile(result.sanitized);
}
