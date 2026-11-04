import { BACKUP_PROFILE_PATHS, PROFILE_POLICY_PATHS } from '../profile/fieldPolicies';
import { profileShape, type ProfileShape } from '../profile/profileShape';
import type { ProfileStoragePath } from '../profile/fieldCatalog';
import type { Profile } from '../types/profile';

// Project known fields without revalidating older, still-supported values.
// Backups preserve document bytes and derived fields, never unknown properties.
type Shape = ProfileShape<true>;
const shape = profileShape(PROFILE_POLICY_PATHS, () => true as const);

function project(value: unknown, fields: Shape): unknown {
  if (value == null) return value;
  if (fields === true) return typeof value === 'object' ? undefined : value;
  if (Array.isArray(fields)) {
    return Array.isArray(value) ? value.map((item) => project(item, fields[0])) : undefined;
  }
  // Legacy phones and work locations can still be strings.
  if (Array.isArray(value)) return undefined;
  if (typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => Object.hasOwn(record, key))
      .map(([key, child]) => [key, project(record[key], child)]),
  );
}

export function profileData<T extends Partial<Profile>>(profile: T): T {
  return project(profile, shape) as T;
}

/** Warn about credential settings without ever rendering their values. */
export function hasCredentialSettings(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /^(geminiApiKey|geminiModel|geminiSettingsMeta|driveToken|apiKey)$/i.test(key) ||
      hasCredentialSettings(child),
  );
}

export function projectProfilePaths<T extends Partial<Profile>>(
  profile: T,
  paths: readonly ProfileStoragePath[],
): Partial<Profile> {
  return project(
    profile,
    profileShape(paths, () => true as const),
  ) as Partial<Profile>;
}

/** JSON and Drive share the explicitly approved backup projection. */
export function backupProfileData<T extends Partial<Profile>>(profile: T): T {
  return projectProfilePaths(profile, BACKUP_PROFILE_PATHS) as T;
}
