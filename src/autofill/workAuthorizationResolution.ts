import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import { controlForm, isControlAvailable } from './dom';
import { fieldIdentity } from './fieldState';
import { extractSignals } from './signals';
import { ADJUSTABLE_LAYERS, visibleQuestion } from './ruleContext';
import { mentionedCountries, resolveRuleValue } from './ruleValue';

const group = (element: HTMLElement) => element.closest('fieldset,[role="group"]');

/** An immediately preceding authorization question may name the sponsorship country. */
export function adjustWorkAuthorizationMatches(matches: FieldMatch[], profile: Profile): void {
  matches.forEach((match, index) => {
    const element = match.element;
    if (
      !element ||
      match.fieldPath !== 'workAuthorization' ||
      !ADJUSTABLE_LAYERS.has(match.matchLayer)
    )
      return;
    const signals = extractSignals(element);
    const question = visibleQuestion(signals).split(/(?<=[?!.])\s+/)[0];
    if (
      mentionedCountries(visibleQuestion(signals)).length ||
      !/\b(?:need|require)\b[^?.!]*\bsponsor(?:ship)?\b/i.test(question)
    )
      return;
    const source = matches[index - 1];
    if (!source?.element || source.fieldPath !== 'workAuthorization' || source.ruleBlocked) return;
    const previous = source.element;
    // No borrowing across documents, forms or explicit question sections.
    if (
      !controlForm(element) ||
      controlForm(element) !== controlForm(previous) ||
      element.getRootNode() !== previous.getRootNode() ||
      group(element) !== group(previous)
    )
      return;
    const sourceQuestion = visibleQuestion(extractSignals(previous));
    if (!/\b(?:authori[sz]ed|eligible)\s+to\s+work\b|\bright\s+to\s+work\b/i.test(sourceQuestion))
      return;
    const countries = mentionedCountries(sourceQuestion);
    if (countries.length !== 1) return;
    const country = countries[0].code;
    const indices = profile.workAuthorization.flatMap((entry, i) =>
      entry.country === country ? [i] : [],
    );
    if (indices.length !== 1) return;
    match.fieldPath = `workAuthorization.${indices[0]}`;
    match.value = resolveRuleValue(profile, match.fieldPath, signals) || null;
    match.authorizationContext = { element: previous, identity: fieldIdentity(previous), country };
  });
}

/** A changed source question cannot silently change an unnamed-country answer. */
export function authorizationContextAvailable(match: FieldMatch, profile: Profile): boolean {
  const source = match.authorizationContext;
  if (!source) return true;
  const element = match.element;
  const index = /^workAuthorization\.(\d+)$/.exec(match.fieldPath ?? '')?.[1];
  return (
    !!element &&
    index !== undefined &&
    profile.workAuthorization[Number(index)]?.country === source.country &&
    isControlAvailable(source.element) &&
    fieldIdentity(source.element) === source.identity &&
    controlForm(element) === controlForm(source.element) &&
    element.getRootNode() === source.element.getRootNode() &&
    group(element) === group(source.element) &&
    !!(source.element.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
  );
}
