import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import type { CheckboxOption } from './scanner';
import { adjustRepeatingEntryMatches, matchCurrentEntryCheckboxes } from './repeatingEntryResolution';

const EDUCATION_MARKERS = [
  'education.institution',
  'education.degree',
  'education.fieldOfStudy',
  'education.startDate.formatted',
  'education.endDate.formatted',
  'education.isCurrent',
] as const;

// Mutates `matches` in place: rewrites the unindexed education.* markers
// (see dictionary.ts) to a concrete education.N.* path.
//
// Unlike languages (always sequential — there's no "which language is more
// important" concept), education has a real single-field case: a form that
// only ever asks for ONE Institution/Degree/etc. (no "Add education" repeat
// button) should still get the applicant's most relevant entry, not
// arbitrarily index 0 — see adjustRepeatingEntryMatches.
export function adjustEducationMatches(matches: FieldMatch[], profile: Profile): void {
  adjustRepeatingEntryMatches(matches, profile.education ?? [], EDUCATION_MARKERS, 'education.', profile);
}

// Deliberately exact-match only (no fuzzy, no shared FIELD_DICTIONARY entry)
// — checking a box the applicant never asked to have checked is a materially
// worse outcome than leaving it unfilled, so this trades recall for safety
// unlike every other matching layer in the pipeline. Kept fully separate
// from mapper.ts's Layers 2-4 so a fuzzy match elsewhere on the page can
// never redirect an unrelated field into checking this box.
const CURRENT_EDUCATION_CHECKBOX_TERMS = new Set([
  'currentlystudyinghere', 'currentlystudying', 'currentlyenrolled', 'currentlyattending',
  'stillstudyinghere', 'stillstudying', 'stillattending', 'stillenrolled',
  'presentlyenrolled', 'presentlyattending', 'currentstudent',
  'iamcurrentlyenrolled', 'iamcurrentlystudyinghere', 'currentlypursuing',
  'thisismycurrenteducation', 'currentlyinprogress', 'noenddate',
]);

// Reuses scanner.ts's scanCheckboxGroups() output (already excludes
// non-visible checkboxes upstream — callers still filter isConsent
// defensively) rather than a dedicated scan, since a standalone checkbox is
// already just a size-1 group there.
export function matchCurrentEducationCheckboxes(
  candidates: CheckboxOption[],
  profile: Profile,
): { element: HTMLInputElement; fieldPath: string }[] {
  return matchCurrentEntryCheckboxes(candidates, profile.education ?? [], CURRENT_EDUCATION_CHECKBOX_TERMS, 'education.');
}
