import { PROFILE_MAPPING_PATH_TEMPLATES } from '../profile/fieldCatalog';
import type { LearnedMappingValue, LearnedMappings } from '../types/storage';
import { canonicalProfilePath } from './migrate';

/** The profile path of a legacy string mapping or a counted entry. */
export const mappingPath = (value: LearnedMappingValue): string =>
  canonicalProfilePath(typeof value === 'string' ? value : value.path);

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

/** Rename supported historical paths while preserving unrelated stored records. */
export function migrateLearnedMappingPaths(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  let result = raw;
  for (const [domain, signals] of Object.entries(raw)) {
    if (
      !safeMappingKey(domain) ||
      !signals ||
      typeof signals !== 'object' ||
      Array.isArray(signals)
    )
      continue;
    let group = signals;
    for (const [key, value] of Object.entries(signals)) {
      if (!safeMappingKey(key) || !mappingShape(value)) continue;
      const path = mappingPath(value);
      if (path === (typeof value === 'string' ? value : value.path)) continue;
      group = { ...group, [key]: typeof value === 'string' ? path : { ...value, path } };
    }
    if (group !== signals) result = { ...result, [domain]: group };
  }
  return result;
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
            : typeof value === 'string'
              ? mappingPath(value)
              : value.path === mappingPath(value)
                ? value
                : { ...value, path: mappingPath(value) },
        ]);
      return entries.length ? [[domain, Object.fromEntries(entries)]] : [];
    }),
  );
}

/** Conflicting historical counts cannot establish which answer is current.
 * Update keeps the local decision; Replace remains the explicit adoption path. */
export function mergeLearnedMappings(
  local: LearnedMappings,
  remote: LearnedMappings,
): LearnedMappings {
  const left = readableMappings(local, true),
    right = readableMappings(remote);
  return Object.fromEntries(
    [...new Set([...Object.keys(left), ...Object.keys(right)])].map((domain) => {
      const a = left[domain] ?? {},
        b = right[domain] ?? {};
      return [
        domain,
        Object.fromEntries(
          [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => {
            const l = a[key],
              r = b[key];
            if (!l) return [key, r];
            if (!r) return [key, l];
            const lp = mappingPath(l),
              rp = mappingPath(r);
            if (lp !== rp) return [key, l];
            // An inactive snapshot cannot promote, disable, or reactivate a local choice.
            if ((typeof l !== 'string' && l.inactive) || (typeof r !== 'string' && r.inactive))
              return [key, l];
            if (typeof l === 'string') return [key, l];
            if (typeof r === 'string') return [key, { ...l, count: Math.max(l.count, 2) }];
            // Same-path backups are snapshots, not independent confirmations.
            return [
              key,
              {
                ...r,
                ...l,
                count: Math.max(l.count, r.count),
                ...(l.label || r.label ? { label: l.label || r.label } : {}),
              },
            ];
          }),
        ),
      ];
    }),
  );
}
