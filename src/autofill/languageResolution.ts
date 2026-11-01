import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import { adjustRepeatingEntryMatches } from './repeatingEntryResolution';

// Languages start at index 0. Repeated language/proficiency controls share
// their structural row, including partial rows and context-derived matches.
export function adjustLanguageMatches(matches: FieldMatch[], profile: Profile): void {
  adjustRepeatingEntryMatches(
    matches,
    [],
    ['languages.language', 'languages.proficiency'],
    'languages.',
    profile,
  );
}
