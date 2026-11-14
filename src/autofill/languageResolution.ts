import { extractSignals } from './signals';
import { proficiencyQuestion, questionLanguageCodes } from './languageChoices';
import { ADJUSTABLE_LAYERS } from './ruleContext';
import { CONF_CONTEXT } from './constants';
import { resolveProfileValue } from './resolver';
import { findLanguage } from '../data/languages';
import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import { adjustRepeatingEntryMatches } from './repeatingEntryResolution';

// Languages start at index 0. Repeated language/proficiency controls share
// their structural row, including partial rows and context-derived matches.
export function adjustLanguageMatches(matches: FieldMatch[], profile: Profile): void {
  for (const match of matches) {
    if (!match.element || (!ADJUSTABLE_LAYERS.has(match.matchLayer) && match.matchLayer !== 'none'))
      continue;
    const question = proficiencyQuestion(extractSignals(match.element));
    const codes = questionLanguageCodes(question);
    if (codes.length !== 1) continue;
    const indices = (profile.languages ?? []).flatMap((language, index) =>
      findLanguage(language.language)?.code === codes[0] ? [index] : [],
    );
    match.fieldPath = indices.length === 1 ? `languages.${indices[0]}.proficiency` : null;
    match.value = match.fieldPath ? resolveProfileValue(profile, match.fieldPath) || null : null;
    match.confidence = match.fieldPath ? CONF_CONTEXT : 0;
    match.matchLayer = match.fieldPath ? 'context' : 'none';
  }
  adjustRepeatingEntryMatches(matches, [], 'languages', profile);
}
