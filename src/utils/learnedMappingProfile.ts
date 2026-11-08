import { indexedProfilePath, profileEntries } from '../profile/mappingMetadata';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, LearnedMappingValue } from '@/src/types/storage';
import { matchedEntryIndex } from '@/src/resume-ai/entryComparison';
import { equalJsonValues } from './equalJsonValues';
import { mappingPath, readableMappings } from './learnedMappingData';
import type { EntryIndexMap } from './profileValidator';

/** Backup paths use raw indices; validation may have discarded or deduplicated rows. */
export function validatedMappingIndices(
  mappings: LearnedMappings,
  indices: EntryIndexMap,
): LearnedMappings {
  const result = readableMappings(mappings, true);
  for (const group of Object.values(result))
    for (const [signal, mapping] of Object.entries(group)) {
      if (typeof mapping !== 'string' && mapping.inactive) continue;
      const path = mappingPath(mapping);
      const match = indexedProfilePath(path);
      if (!match || !Object.hasOwn(indices, match.family)) continue;
      const index =
        indices[match.family][match.index] ??
        (typeof mapping !== 'string' && mapping.scope === 'field' ? 0 : undefined);
      if (index === match.index) continue;
      const value = typeof mapping === 'string' ? { path, count: 2 } : { ...mapping };
      if (index === undefined) Object.assign(value, { inactive: true });
      else value.path = `${match.family}.${index}${match.suffix}`;
      group[signal] = value;
    }
  return result;
}

/** Keep entry-specific answers attached to their original entry, not its old index. */
export function rebaseLearnedMappings(
  mappings: LearnedMappings,
  source: Partial<Profile>,
  target: Partial<Profile>,
): LearnedMappings {
  const result = readableMappings(mappings, true);
  for (const group of Object.values(result))
    for (const [signal, mapping] of Object.entries(group)) {
      if (typeof mapping !== 'string' && (mapping.inactive || mapping.scope === 'field')) continue;
      const path = mappingPath(mapping);
      const match = indexedProfilePath(path);
      if (!match) continue;
      const { family, index: originalIndex, suffix } = match;
      const before = profileEntries(source, family),
        after = profileEntries(target, family);
      if (equalJsonValues(before, after)) continue;
      const original = before[originalIndex];
      let index = -1;
      if (original) {
        const exact = after
          .map((row, i) => (equalJsonValues(row, original) ? i : -1))
          .filter((i) => i >= 0);
        if (exact.length === 1) index = exact[0];
        else if (!exact.length && family === 'salary.expected') {
          const matches = after
            .map((row, i) =>
              ['currency', 'country', 'period'].every((key) => row[key] === original[key]) ? i : -1,
            )
            .filter((i) => i >= 0);
          if (matches.length === 1) index = matches[0];
        } else if (!exact.length) {
          index = matchedEntryIndex(
            family === 'links.custom' ? 'customLinks' : family,
            original,
            after,
          );
        }
      }
      const updated: LearnedMappingValue =
        typeof mapping === 'string' ? { path, count: 2 } : { ...mapping };
      if (index < 0) updated.inactive = true;
      else updated.path = `${family}.${index}${suffix}`;
      group[signal] = updated;
    }
  return result;
}

/** A local edit made while review was open wins over that review's snapshot. */
export function reviewedIncomingMappings(
  current: LearnedMappings,
  base: LearnedMappings,
  incoming: LearnedMappings,
): LearnedMappings {
  return Object.fromEntries(
    Object.entries(readableMappings(incoming, true)).flatMap(([domain, group]) => {
      const kept = Object.fromEntries(
        Object.entries(group).filter(
          ([signal]) =>
            !Object.hasOwn(base[domain] ?? {}, signal) ||
            (Object.hasOwn(current[domain] ?? {}, signal) &&
              equalJsonValues(base[domain][signal], current[domain][signal])),
        ),
      );
      return Object.keys(kept).length ? [[domain, kept]] : [];
    }),
  );
}
