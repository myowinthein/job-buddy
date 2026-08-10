import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import type { CheckboxOption } from './scanner';
import { resolveProfileValue } from './resolver';
import { normalize } from './normalizer';
import { mostRecentIdx } from './profileFieldTree';

// Layer 0 (learned) and Layer 1 (autocomplete) are already explicit and
// unambiguous — same reasoning as phoneResolution.ts / languageResolution.ts.
const ADJUSTABLE_LAYERS = new Set(['dictionary_exact', 'fuzzy']);

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
// arbitrarily index 0 — reusing the same mostRecentIdx() heuristic already
// driving the Learned Mappings picker's default-expanded entry. A repeated
// marker (an actual multi-entry "Add education" builder) falls back to
// sequential index assignment in scan order, same as languages.
export function adjustEducationMatches(matches: FieldMatch[], profile: Profile): void {
  const entries = profile.education ?? [];

  for (const marker of EDUCATION_MARKERS) {
    const occurrences = matches.filter(
      (m) => m.fieldPath === marker && ADJUSTABLE_LAYERS.has(m.matchLayer),
    );
    if (occurrences.length === 0) continue;

    occurrences.forEach((match, i) => {
      const idx = occurrences.length === 1 ? mostRecentIdx(entries) : i;
      const fieldPath = marker.replace('education.', `education.${idx}.`);
      match.fieldPath = fieldPath;
      match.value = resolveProfileValue(profile, fieldPath) || null;
    });
  }
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
// non-visible/consent checkboxes upstream — callers still filter isConsent
// defensively) rather than a dedicated scan, since a standalone checkbox is
// already just a size-1 group there.
//
// Only returns checkboxes that should actually be checked — an
// isCurrent-labelled checkbox whose matched entry isn't current has nothing
// useful to report (unlike a genuinely unmatched field, there's no ambiguity
// needing the user's attention), so it's simply omitted rather than flowing
// through the noData/lowConfidence machinery built for editable text fields.
export function matchCurrentEducationCheckboxes(
  candidates: CheckboxOption[],
  profile: Profile,
): { element: HTMLInputElement; fieldPath: string }[] {
  const matched = candidates.filter((c) => CURRENT_EDUCATION_CHECKBOX_TERMS.has(normalize(c.label)));
  if (matched.length === 0) return [];

  const entries = profile.education ?? [];
  const result: { element: HTMLInputElement; fieldPath: string }[] = [];

  matched.forEach((c, i) => {
    const idx = matched.length === 1 ? mostRecentIdx(entries) : i;
    if (entries[idx]?.isCurrent) {
      result.push({ element: c.element, fieldPath: `education.${idx}.isCurrent` });
    }
  });

  return result;
}
