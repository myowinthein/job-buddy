import type { LearnedMappingValue, LearnedMappings } from '../types/storage';

export const safeMappingKey = (key: string): boolean =>
  !!key.trim() && key.length <= 1000 && !['__proto__', 'constructor', 'prototype'].includes(key);

/** Schema paths, not values: empty/deleted array entries remain valid mappings. */
export function isLearnedPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length > 200) return false;
  return [
    /^personal\.(firstName|lastName|nickname|email|gender|ethnicity|veteranStatus|disabilityStatus)$/,
    /^personal\.phone\.(number|callingCode|countryCode|full)$/,
    /^personal\.dateOfBirth(?:\.(day|month|year))?$/,
    /^address\.(street|city|state|postalCode|country|countryName)$/,
    /^professional\.(summary|noticePeriod\.(immediate|value|unit|formatted|availableDate))$/,
    /^salary\.(current|expected\.(?:0|[1-9]\d*))\.(amount|currency|country|period|formatted)$/,
    /^salary\.expected\.formatted$/,
    /^workAuthorization(?:\.(?:0|[1-9]\d*)(?:\.(country|status|visaType|expiryDate))?)?$/,
    /^workHistory\.(?:0|[1-9]\d*)\.(company|title|description|arrangement|isCurrent|(?:startDate|endDate)(?:\.formatted)?|location(?:\.(city|countryCode|countryName))?)$/,
    /^education\.(?:0|[1-9]\d*)\.(institution|degree|fieldOfStudy|grade|description|isCurrent|(?:startDate|endDate)(?:\.formatted)?)$/,
    /^languages\.(?:formatted|(?:0|[1-9]\d*)\.(language|proficiency))$/,
    /^links\.(linkedin|portfolio|github|twitter|dribbble|behance|custom\.(?:0|[1-9]\d*)\.url)$/,
    /^documents\.(cv\.(url|file)|coverLetter\.url)$/,
    /^derived\.(fullName|currentTitle|currentCompany|age|totalExperience\.(years|months|totalMonths|label))$/,
  ].some((pattern) => pattern.test(path));
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
    (entry.label === undefined ||
      (typeof entry.label === 'string' && entry.label.length <= 1000)) &&
    (entry.question === undefined ||
      (typeof entry.question === 'string' && entry.question.length <= 1000)) &&
    (entry.scope === undefined || entry.scope === 'field' || entry.scope === 'entry') &&
    (entry.inactive === undefined || entry.inactive === true)
  );
}

export function validMapping(value: unknown): value is LearnedMappingValue {
  return mappingShape(value) && isLearnedPath(typeof value === 'string' ? value : value.path);
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
          !isLearnedPath(typeof value === 'string' ? value : value.path)
            ? typeof value === 'string'
              ? { path: value, count: 2, inactive: true }
              : { ...value, inactive: true }
            : value,
        ]);
      return entries.length ? [[domain, Object.fromEntries(entries)]] : [];
    }),
  );
}
