import { PROFILE_MAPPING_PATH_TEMPLATES } from '../profile/fieldCatalog';
import type { LearnedMappingValue, LearnedMappings } from '../types/storage';

/** The profile path of a legacy string mapping or a counted entry. */
export const mappingPath = (value: LearnedMappingValue): string =>
  typeof value === 'string' ? value : value.path;

export const safeMappingKey = (key: string): boolean =>
  !!key.trim() && !['__proto__', 'constructor', 'prototype'].includes(key);

const learnedPathPattern = new RegExp(
  `^(?:${PROFILE_MAPPING_PATH_TEMPLATES.map((template) =>
    template
      .split('.')
      .map((part) => (part === '$' ? '(?:0|[1-9]\\d*)' : part))
      .join('\\.'),
  ).join('|')})$`,
);

/** Schema paths, not values: empty/deleted array entries remain valid mappings. */
export function isLearnedPath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 200 && learnedPathPattern.test(path);
}

function mappingShape(value: unknown): value is LearnedMappingValue {
  const pathShape = (path: unknown) =>
    typeof path === 'string' &&
    path.length <= 200 &&
    /^[a-zA-Z]+(?:\.(?:[a-zA-Z]+|\d+))*$/.test(path) &&
    path.split('.').every((part) => !['__proto__', 'constructor', 'prototype'].includes(part));
  if (typeof value === 'string') return pathShape(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    pathShape(entry.path) &&
    Number.isSafeInteger(entry.count) &&
    Number(entry.count) >= 0 &&
    (entry.label === undefined || typeof entry.label === 'string') &&
    (entry.question === undefined || typeof entry.question === 'string') &&
    (entry.scope === undefined || entry.scope === 'field' || entry.scope === 'entry') &&
    (entry.inactive === undefined || entry.inactive === true)
  );
}

export function validMapping(value: unknown): value is LearnedMappingValue {
  return mappingShape(value) && isLearnedPath(mappingPath(value));
}

/** Unknown historical paths may travel as inert metadata, never executable mappings. */
export function inactiveMapping(value: unknown): value is Exclude<LearnedMappingValue, string> {
  return mappingShape(value) && typeof value !== 'string' && value.inactive === true;
}

/** Ignore malformed records in memory without deleting stored stale mappings. */
export function readableMappings(raw: unknown, retainStalePaths = false): LearnedMappings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([domain, signals]) => {
      if (
        !safeMappingKey(domain) ||
        !signals ||
        typeof signals !== 'object' ||
        Array.isArray(signals)
      )
        return [];
      const entries = Object.entries(signals)
        .filter(
          (entry): entry is [string, LearnedMappingValue] =>
            safeMappingKey(entry[0]) &&
            (retainStalePaths
              ? mappingShape(entry[1])
              : validMapping(entry[1]) || inactiveMapping(entry[1])),
        )
        .map(([key, value]): [string, LearnedMappingValue] => [
          key,
          !isLearnedPath(mappingPath(value))
            ? typeof value === 'string'
              ? { path: value, count: 2, inactive: true }
              : { ...value, inactive: true }
            : value,
        ]);
      return entries.length ? [[domain, Object.fromEntries(entries)]] : [];
    }),
  );
}
