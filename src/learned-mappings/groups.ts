import type { LearnedMappings, LearnedMappingValue } from '@/src/types/storage';
import { LEARNED_MAPPING_THRESHOLD } from '@/src/autofill/constants';
import { mappingPath } from '@/src/utils/learnedMappingData';

export type MappingStatus = 'Trusted' | 'Learning' | 'Inactive';
export interface MappingGroup {
  id: string;
  title: string;
  path: string;
  status: MappingStatus;
  members: [string, LearnedMappingValue][];
}
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
