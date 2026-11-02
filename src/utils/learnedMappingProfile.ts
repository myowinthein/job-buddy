import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, LearnedMappingValue } from '@/src/types/storage';
import { matchedEntryIndex } from '@/src/resume-ai/entryComparison';
import { equalJsonValues } from './equalJsonValues';
import { readableMappings } from './learnedMappingData';

type Entry = Record<string, unknown>;
function entries(profile: Partial<Profile>, family: string): Entry[] {
  const value =
    family === 'links.custom'
      ? profile.links?.custom
      : family === 'salary.expected'
        ? profile.salary?.expected
        : profile[family as 'education' | 'workHistory' | 'languages' | 'workAuthorization'];
  return (value ?? []) as unknown as Entry[];
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
      const path = typeof mapping === 'string' ? mapping : mapping.path;
      const match =
        /^(education|workHistory|languages|workAuthorization|links\.custom|salary\.expected)\.(\d+)(\..*)?$/.exec(
          path,
        );
      if (!match) continue;
      const [, family, rawIndex, suffix = ''] = match;
      const before = entries(source, family),
        after = entries(target, family);
      if (equalJsonValues(before, after)) continue;
      const original = before[Number(rawIndex)];
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
