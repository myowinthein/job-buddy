// Browser-only probe for the website examples. Uses production matching and writing.
import { mapField, type FieldMatch } from '../../autofill/mapper';
import { extractSignals } from '../../autofill/signals';
import { matchCurrentWorkHistoryCheckboxes } from '../../autofill/workHistoryResolution';
import { fillField, fillCheckboxInput } from '../../autofill/filler';
import { applyHighlight } from '../../autofill/highlighter';
import { CONF_DICT_EXACT, CONF_FILL } from '../../autofill/constants';
import type { Profile } from '../../types/profile';
import sample from './demo-profile.json';

export async function runRuleExample() {
  const profile = structuredClone(sample.profile) as Profile;
  profile.links.custom = [{ label: 'Design journal', url: 'https://example.com/alex/journal' }];
  const element = document.querySelector<HTMLInputElement>('input')!;
  const signals = extractSignals(element);
  let match: FieldMatch;
  if (element.type === 'checkbox') {
    const matches = matchCurrentWorkHistoryCheckboxes(
      [{ element, label: signals.label, value: element.value }],
      profile,
    );
    if (matches.length !== 1) throw new Error('Expected one current-job checkbox match');
    // Same score assignment as scanAutofill's checkbox-status post-pass.
    match = {
      ...matches[0],
      confidence: CONF_DICT_EXACT,
      value: 'Yes',
      matchLayer: 'checkbox_status',
    };
  } else match = mapField(signals, profile, {}, 'example.test');
  const filled =
    match.confidence >= CONF_FILL &&
    !!match.value &&
    (element.type === 'checkbox'
      ? await fillCheckboxInput(element)
      : await fillField(element, match.value));
  if (filled) applyHighlight(element, match.confidence);
  return {
    layer: match.matchLayer,
    path: match.fieldPath,
    confidence: match.confidence,
    score: Math.round(match.confidence * 100),
    value: match.value,
    filled,
    label: signals.label,
    nearbyText: signals.nearbyText,
    autocomplete: signals.autocomplete,
  };
}
