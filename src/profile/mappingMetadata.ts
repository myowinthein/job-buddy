import type { Profile } from '../types/profile';
import { PROFILE_ENTRY_PATHS } from './fieldCatalog';
import { readProfilePath } from './fieldMetadata';

export function profileEntries(
  profile: Partial<Profile>,
  collection: string,
): Record<string, unknown>[] {
  const value = readProfilePath(profile, collection);
  return Array.isArray(value) ? value : [];
}

/** Preserve the collection name and suffix when moving a mapping with its entry. */
export function indexedProfilePath(path: string) {
  for (const family of PROFILE_ENTRY_PATHS) {
    if (!path.startsWith(`${family}.`)) continue;
    const match = /^(\d+)(\..*)?$/.exec(path.slice(family.length + 1));
    if (match) return { family, index: Number(match[1]), suffix: match[2] ?? '' };
  }
  return null;
}

export function expandMappingPaths(
  profile: Partial<Profile>,
  templates: readonly string[],
): string[] {
  function expand(path: string): string[] {
    const wildcard = path.indexOf('$');
    if (wildcard < 0) return [path];
    const collection = path.slice(0, wildcard - 1);
    return profileEntries(profile, collection).flatMap((_entry, index) =>
      expand(path.replace('$', String(index))),
    );
  }
  return templates.flatMap(expand);
}
