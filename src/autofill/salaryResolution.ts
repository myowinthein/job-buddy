import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import { adjustRepeatingEntryMatches } from './repeatingEntryResolution';

// Mutates `matches` in place: rewrites the unindexed 'salary.expected.formatted'
// marker (see dictionary.ts) to a concrete salary.expected.N.formatted path —
// mapField() only ever sees one field at a time and has no way to know which
// expected-salary entry a given DOM field corresponds to. Reuses the same
// single-field-gets-most-relevant-entry / multi-field-gets-sequential-index
// logic as education/workHistory via adjustRepeatingEntryMatches; salary
// entries have no startDate/isCurrent, so mostRecentIdx() naturally falls
// back to index 0 for the common single-field case.
const SALARY_MARKERS = ['salary.expected.formatted'] as const;

export function adjustSalaryMatches(matches: FieldMatch[], profile: Profile): void {
  // Expected-salary entries have no startDate/isCurrent (unlike education/work
  // history) — cast is safe, mostRecentIdx() treats both as simply absent.
  const entries = (profile.salary?.expected ?? []) as Array<{ startDate?: string; isCurrent?: boolean }>;
  adjustRepeatingEntryMatches(matches, entries, SALARY_MARKERS, 'salary.expected.', profile);
}
