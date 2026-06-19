import { getProfile, getLearnedMappings, saveLearnedMapping } from '../utils/storage';
import { scanFields } from './scanner';
import { extractSignals } from './signals';
import type { FieldSignals } from './signals';
import { mapField } from './mapper';
import { fillField } from './filler';
import { applyHighlight } from './highlighter';
import { attachPickerListeners } from './picker';
import { normalize } from './normalizer';

export { clearHighlights } from './highlighter';

export interface AutofillResult {
  filled:       number;
  review:       number;
  unmatched:    number;
  totalScanned: number;
}

export async function runAutofill(): Promise<AutofillResult> {
  const profile = await getProfile();
  if (!profile) {
    console.warn('[Job Buddy] Profile not found — skipping autofill');
    return { filled: 0, review: 0, unmatched: 0, totalScanned: 0 };
  }

  const learnedMappings = await getLearnedMappings();
  const domain = window.location.hostname;
  const fields = scanFields();
  const totalScanned = fields.length;

  const result: AutofillResult = { filled: 0, review: 0, unmatched: 0, totalScanned };
  const redFields: Array<{ element: HTMLElement; signals: FieldSignals }> = [];

  for (const element of fields) {
    const signals = extractSignals(element);
    const match   = mapField(signals, profile, learnedMappings, domain);

    if (match.confidence > 0 && match.value) {
      await fillField(element, match.value);
    }

    applyHighlight(element, match.confidence);

    if (match.confidence >= 0.85) {
      result.filled++;
    } else if (match.confidence >= 0.60) {
      result.review++;
    } else {
      result.unmatched++;
      redFields.push({ element, signals });
    }
  }

  attachPickerListeners(redFields, profile, async (element, fieldPath, value) => {
    await fillField(element, value);
    applyHighlight(element, 0.97);

    // Persist learned mapping for every normalized signal on this element
    const sigs = extractSignals(element);
    const signalTexts = [
      sigs.name, sigs.id, sigs.placeholder,
      sigs.ariaLabel, sigs.label, sigs.nearbyText,
    ].filter(Boolean);

    for (const text of signalTexts) {
      const norm = normalize(text);
      if (norm) await saveLearnedMapping(domain, norm, fieldPath);
    }

    result.filled++;
    result.unmatched = Math.max(0, result.unmatched - 1);
  });

  return result;
}
