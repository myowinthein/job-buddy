import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import { extractSignals, bestLabel } from './signals';
import { normalize } from './normalizer';
import { controlForm } from './dom';
import { ADJUSTABLE_LAYERS } from './ruleContext';

/** A translated generic "Name" can mean surname beside a separate first name. */
export function adjustNameMatches(matches: FieldMatch[], profile: Profile): void {
  for (const match of matches) {
    const element = match.element;
    if (
      !element ||
      match.fieldPath !== 'derived.fullName' ||
      !ADJUSTABLE_LAYERS.has(match.matchLayer)
    )
      continue;
    const signals = extractSignals(element);
    if (!['name', 'nom'].includes(normalize(bestLabel(signals)))) continue;
    // A separate first-name field alone is insufficient: some forms also ask
    // for a full/legal name. Require an explicit surname identifier as well.
    if (
      ![signals.name, signals.id].some((value) =>
        ['lastname', 'surname', 'familyname'].includes(normalize(value)),
      )
    )
      continue;
    const form = controlForm(element);
    if (!form) continue;
    const scope = matches.filter(
      (item) =>
        item.element &&
        item.element.getRootNode() === element.getRootNode() &&
        controlForm(item.element) === form &&
        item.element.closest('fieldset,[role="group"]') ===
          element.closest('fieldset,[role="group"]'),
    );
    if (
      scope.filter((item) => item.fieldPath === 'personal.firstName').length !== 1 ||
      scope.some((item) => item.fieldPath === 'personal.lastName')
    )
      continue;
    match.fieldPath = 'personal.lastName';
    match.value = profile.personal.lastName || null;
  }
}
