import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import type { CheckboxOption } from './scanner';
import { adjustRepeatingEntryMatches, matchCurrentEntryCheckboxes } from './repeatingEntryResolution';

const WORK_HISTORY_MARKERS = [
  'workHistory.company',
  'workHistory.title',
  'workHistory.location',
  'workHistory.location.city',
  'workHistory.location.countryName',
  'workHistory.startDate.formatted',
  'workHistory.endDate.formatted',
  'workHistory.isCurrent',
  'workHistory.description',
  'workHistory.arrangement',
] as const;

// Mutates `matches` in place — same pattern as adjustEducationMatches, see
// there for the single-vs-sequential reasoning. Deliberately separate from
// derived.currentCompany/derived.currentTitle (dictionary.ts), which stay
// scoped to explicitly "current"-qualified labels ("Current Employer") and
// correctly resolve to empty when the applicant has no active job — these
// generic markers (plain "Company"/"Job Title") fall back to the most
// recent entry either way via mostRecentIdx, which is the right behavior
// for an unqualified field but would be wrong for one that specifically
// asks about current employment.
export function adjustWorkHistoryMatches(matches: FieldMatch[], profile: Profile): void {
  adjustRepeatingEntryMatches(matches, profile.workHistory ?? [], WORK_HISTORY_MARKERS, 'workHistory.', profile);
}

// Deliberately exact-match only — same safety reasoning as
// matchCurrentEducationCheckboxes in educationResolution.ts.
const CURRENT_WORK_HISTORY_CHECKBOX_TERMS = new Set([
  'currentlyworkinghere', 'currentlyworking', 'currentlyemployed', 'currentlyemployedhere',
  'stillworkinghere', 'stillworking', 'stillemployed',
  'presentlyemployed', 'presentlyworking', 'currentjob', 'currentemployment',
  'iamcurrentlyemployed', 'iamcurrentlyworkinghere', 'thisismycurrentjob',
  'currentlyinthisrole', 'noenddate',
]);

export function matchCurrentWorkHistoryCheckboxes(
  candidates: CheckboxOption[],
  profile: Profile,
): { element: HTMLInputElement; fieldPath: string }[] {
  return matchCurrentEntryCheckboxes(candidates, profile.workHistory ?? [], CURRENT_WORK_HISTORY_CHECKBOX_TERMS, 'workHistory.');
}
