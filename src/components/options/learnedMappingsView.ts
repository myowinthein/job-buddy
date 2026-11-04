import { catalogProfileTarget, catalogSectionStartTarget } from '@/src/profile/fieldMetadata';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, LearnedMappingValue } from '@/src/types/storage';
import { LEARNED_MAPPING_THRESHOLD } from '@/src/autofill/constants';
import { buildPickerTree } from '@/src/autofill/profileFieldTree';
import { profileFieldName } from '@/src/fill-log/presentation';
import type { CompletionTarget } from '@/src/utils/profileCompletion';
import type { ProfileSectionId } from './shared/profileSections';

export type MappingStatus = 'Trusted' | 'Learning' | 'Inactive';
export interface MappingGroup {
  id: string;
  title: string;
  path: string;
  status: MappingStatus;
  members: [string, LearnedMappingValue][];
}
export const mappingPath = (value: LearnedMappingValue): string =>
  typeof value === 'string' ? value : value.path;
export function mappingStatus(value: LearnedMappingValue): MappingStatus {
  if (typeof value !== 'string' && value.inactive) return 'Inactive';
  return typeof value === 'string' || value.count >= LEARNED_MAPPING_THRESHOLD
    ? 'Trusted'
    : 'Learning';
}

/** Group explicit equivalent questions. Preserve each alias's confirmation history. */
export function groupMappings(mappings: LearnedMappings): Map<string, MappingGroup[]> {
  return new Map(
    Object.entries(mappings).map(([domain, entries]) => {
      const groups = new Map<string, MappingGroup>();
      for (const [signal, value] of Object.entries(entries).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const metadata = typeof value === 'string' ? null : value;
        const key = metadata?.question?.trim()
          ? JSON.stringify([
              metadata.path,
              metadata.label ?? '',
              metadata.question,
              metadata.scope ?? '',
              !!metadata.inactive,
            ])
          : JSON.stringify(['signal', signal]);
        const existing = groups.get(key);
        if (existing) {
          existing.members.push([signal, value]);
          if (mappingStatus(value) === 'Trusted') existing.status = 'Trusted';
        } else
          groups.set(key, {
            id: signal,
            title: metadata?.label?.trim() || metadata?.question?.trim() || 'Unlabelled field',
            path: mappingPath(value),
            status: mappingStatus(value),
            members: [[signal, value]],
          });
      }
      return [domain, [...groups.values()]];
    }),
  );
}

export function profileFieldLabels(profile: Partial<Profile>): Map<string, string> {
  const labels = new Map<string, string>();
  for (const section of buildPickerTree(profile as Profile)) {
    for (const item of section.items) {
      if (item.kind === 'option') labels.set(item.fieldPath, `${section.label} → ${item.label}`);
      else
        for (const row of item.rows)
          labels.set(row.fieldPath, `${section.label} → ${item.heading} → ${row.label}`);
    }
  }
  return labels;
}
export function mappingDestination(path: string, labels: Map<string, string>): string {
  return labels.get(path) ?? profileFieldName(path) ?? 'Unavailable profile field';
}
export function matchesMapping(
  group: MappingGroup,
  domain: string,
  query: string,
  destination: string,
): boolean {
  const text = [
    domain,
    group.title,
    group.path,
    destination,
    ...group.members.flatMap(([signal, value]) => [
      signal,
      typeof value === 'string' ? '' : (value.question ?? ''),
    ]),
  ]
    .join(' ')
    .toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

/** Deep links reuse the options page's section/focus guard and fall back to an Add control for removed entries. */
export function mappingProfileTarget(
  profile: Partial<Profile>,
  path: string,
): { section: ProfileSectionId; target: CompletionTarget } | null {
  const target = catalogProfileTarget(profile, path);
  if (target) return target;
  const section =
    path.startsWith('derived.current') || path.startsWith('derived.totalExperience')
      ? 'workHistory'
      : 'personal';
  const fallback = catalogSectionStartTarget(section);
  return path.startsWith('derived.') && fallback ? { section, target: fallback } : null;
}
