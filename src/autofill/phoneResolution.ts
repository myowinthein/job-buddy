import { composedParent } from './dom';
import { extractSignals } from './signals';
import { ADJUSTABLE_LAYERS, visibleQuestion, containsControl, scopeRoot } from './ruleContext';
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
// choice. Only label-derived matches (ADJUSTABLE_LAYERS) get overridden.

// Use a calling-code selector only within this contact's structural group.
// Explicit local/full wording wins; learned/autocomplete paths stay unchanged.
export function adjustPhoneMatches(matches: FieldMatch[], profile: Profile): void {
  for (const match of matches) {
    if (!match.fieldPath) continue;
    if (!AMBIGUOUS_PHONE_PATHS.has(match.fieldPath)) continue;
    if (!ADJUSTABLE_LAYERS.has(match.matchLayer)) continue;
    let hasCode = matches.some((item) => item.fieldPath === 'personal.phone.callingCode');
    if (match.element) {
      hasCode = false;
      const root = scopeRoot(match.element);
      for (
        let container = composedParent(match.element);
        container;
        container = composedParent(container)
      ) {
        const inGroup = matches.filter(
          (item) =>
            item.element &&
            scopeRoot(item.element) === root &&
            containsControl(container, item.element),
        );
        const phones = inGroup.filter((item) => AMBIGUOUS_PHONE_PATHS.has(item.fieldPath ?? ''));
        const codes = inGroup.filter((item) => item.fieldPath === 'personal.phone.callingCode');
        if (phones.length > 1) break;
        if (codes.length === 1) {
          hasCode = true;
          break;
        }
      }
    }
    const question = match.element ? visibleQuestion(extractSignals(match.element)) : '';
    const local =
      /\b(local|national)\b|(?:without|excluding|omit).*\b(?:country|calling|dial)\b/i.test(
        question,
      );
    const full = /(?:with|including|include).*\b(?:country|calling|dial)\b/i.test(question);
    const targetPath = local
      ? 'personal.phone.number'
      : full
        ? 'personal.phone.full'
        : hasCode
          ? 'personal.phone.number'
          : 'personal.phone.full';
    if (match.fieldPath === targetPath) continue;

    match.fieldPath = targetPath;
    match.value = resolveProfileValue(profile, targetPath) || null;
  }
}
