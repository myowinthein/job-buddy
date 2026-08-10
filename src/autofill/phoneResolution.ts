import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import { resolveProfileValue } from './resolver';

// Only these two paths are ambiguous from label text alone — mapField() has
// no way to know whether a sibling calling-code field exists elsewhere on
// the page, since it only ever sees one field's signals at a time.
const AMBIGUOUS_PHONE_PATHS = new Set(['personal.phone.number', 'personal.phone.full']);

// Layer 0 (learned) and Layer 1 (autocomplete) are already explicit and
// unambiguous — autocomplete="tel-national" means the site itself asked for
// the local number specifically, and a learned mapping is a confirmed user
// choice. Only label-derived matches (dictionary/fuzzy) get overridden.
const ADJUSTABLE_LAYERS = new Set(['dictionary_exact', 'fuzzy']);

// Mutates `matches` in place: if any field on the page resolved to
// personal.phone.callingCode (evidence the form splits phone into a
// separate country-code input), ambiguous phone-number-shaped matches
// resolve to the local number only; otherwise they resolve to the full
// number (calling code + number combined), since there's no sibling field
// to supply the calling code separately.
export function adjustPhoneMatches(matches: FieldMatch[], profile: Profile): void {
  const hasCallingCodeSibling = matches.some((m) => m.fieldPath === 'personal.phone.callingCode');
  const targetPath = hasCallingCodeSibling ? 'personal.phone.number' : 'personal.phone.full';

  for (const match of matches) {
    if (!match.fieldPath) continue;
    if (!AMBIGUOUS_PHONE_PATHS.has(match.fieldPath)) continue;
    if (!ADJUSTABLE_LAYERS.has(match.matchLayer)) continue;
    if (match.fieldPath === targetPath) continue;

    match.fieldPath = targetPath;
    match.value = resolveProfileValue(profile, targetPath) || null;
  }
}
