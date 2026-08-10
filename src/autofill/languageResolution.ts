import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import { resolveProfileValue } from './resolver';

// Layer 0 (learned) and Layer 1 (autocomplete) are already explicit and
// unambiguous. Only label-derived matches (dictionary/fuzzy) hit the
// unindexed 'languages.language' / 'languages.proficiency' markers.
const ADJUSTABLE_LAYERS = new Set(['dictionary_exact', 'fuzzy']);

// Mutates `matches` in place: rewrites the unindexed 'languages.language' /
// 'languages.proficiency' markers (see dictionary.ts) to a concrete
// languages.N.* path, assigning indices in the order each marker type
// appears on the page — mapField() only ever sees one field at a time and
// has no way to know which profile language entry a given DOM field
// corresponds to, or that a sibling field for the same entry even exists.
//
// Assumes the form lists language/proficiency fields in the same relative
// order as the applicant's profile entries (true for the common "Language",
// "Proficiency", "Language 2", "Proficiency 2", ... builder pattern). A form
// that interleaves them differently may pair the wrong language with the
// wrong proficiency.
//
// An index beyond the applicant's actual language count resolves to an
// empty value via resolveProfileValue's own missing-entry guard, which
// naturally leaves that field unfilled (noData tier) rather than needing
// special-casing here.
export function adjustLanguageMatches(matches: FieldMatch[], profile: Profile): void {
  let languageIdx = 0;
  let proficiencyIdx = 0;

  for (const match of matches) {
    if (!match.fieldPath) continue;
    if (!ADJUSTABLE_LAYERS.has(match.matchLayer)) continue;

    if (match.fieldPath === 'languages.language') {
      match.fieldPath = `languages.${languageIdx++}.language`;
      match.value = resolveProfileValue(profile, match.fieldPath) || null;
    } else if (match.fieldPath === 'languages.proficiency') {
      match.fieldPath = `languages.${proficiencyIdx++}.proficiency`;
      match.value = resolveProfileValue(profile, match.fieldPath) || null;
    }
  }
}
