import { composedParent } from './dom';
import { extractSignals } from './signals';
import { ADJUSTABLE_LAYERS, visibleQuestion, containsControl, scopeRoot } from './ruleContext';
import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import { resolveProfileValue } from './resolver';
import { ariaName, ownText } from './labels';

// Only these two paths are ambiguous from label text alone — mapField() has
// no way to know whether a sibling calling-code field exists elsewhere on
// the page, since it only ever sees one field's signals at a time.
const AMBIGUOUS_PHONE_PATHS = new Set(['personal.phone.number', 'personal.phone.full']);

export function callingCodeSibling(match: FieldMatch, matches: FieldMatch[]): FieldMatch | null {
  if (!match.element)
    return matches.find((item) => item.fieldPath === 'personal.phone.callingCode') ?? null;
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
    if (codes.length === 1) return codes[0];
  }
  return null;
}

// Layer 0 (learned) and Layer 1 (autocomplete) are already explicit and
// unambiguous — autocomplete="tel-national" means the site itself asked for
// the local number specifically, and a learned mapping is a confirmed user
// choice. Only label-derived matches (ADJUSTABLE_LAYERS) get overridden.

// Use a calling-code selector only within this contact's structural group.
// Explicit local/full wording wins; learned/autocomplete paths stay unchanged.
export function adjustPhoneMatches(matches: FieldMatch[], profile: Profile): void {
  // Some telephone widgets call their dial-code selector only "Country".
  // Require an explicitly named phone group and one phone; residence countries
  // and explicit learned/autocomplete destinations retain their own meaning.
  for (const match of matches) {
    const element = match.element;
    if (
      !element ||
      !ADJUSTABLE_LAYERS.has(match.matchLayer) ||
      match.fieldPath !== 'address.country'
    )
      continue;
    const signals = extractSignals(element);
    if (!/^country\s*\*?$/i.test((signals.label || signals.ariaLabel).trim())) continue;
    const group = element.closest('fieldset,[role="group"]');
    if (!group) continue;
    const legend = group.querySelector(':scope > legend');
    if (
      !/^(?:phone|telephone|mobile)(?: number)?\s*\*?$/i.test(
        (ariaName(group) || (legend ? ownText(legend) : '')).trim(),
      )
    )
      continue;
    const siblings = matches.filter(
      (item) =>
        item.element &&
        scopeRoot(item.element) === scopeRoot(element) &&
        containsControl(group, item.element),
    );
    const phones = siblings.filter(
      (item) =>
        item.element instanceof HTMLInputElement &&
        item.element.type === 'tel' &&
        AMBIGUOUS_PHONE_PATHS.has(item.fieldPath ?? ''),
    );
    if (
      phones.length !== 1 ||
      siblings.filter(
        (item) =>
          item.fieldPath === 'address.country' || item.fieldPath === 'personal.phone.callingCode',
      ).length !== 1
    )
      continue;
    match.fieldPath = 'personal.phone.callingCode';
    match.value = resolveProfileValue(profile, match.fieldPath) || null;
  }
  for (const match of matches) {
    if (!match.fieldPath) continue;
    if (!AMBIGUOUS_PHONE_PATHS.has(match.fieldPath)) continue;
    if (!ADJUSTABLE_LAYERS.has(match.matchLayer)) continue;
    const hasCode = !!callingCodeSibling(match, matches);
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
