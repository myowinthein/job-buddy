import { getProfile, getLearnedMappings, saveLearnedMapping } from '../utils/storage';
import { scanFields } from './scanner';
import { extractSignals } from './signals';
import type { FieldSignals } from './signals';
import { mapField } from './mapper';
import { fillField, clearFieldValue } from './filler';
import { applyHighlight, clearElementHighlight, clearHighlights } from './highlighter';
import { attachPickerListeners } from './picker';
import { normalize } from './normalizer';

export { clearHighlights } from './highlighter';

export interface AutofillResult {
  filled:       number;
  review:       number;
  unmatched:    number;
  totalScanned: number;
}

// All elements touched during the current autofill session (mapper + picker).
// Reset on each runAutofill() call.
let filledElements: HTMLElement[] = [];

export function undoAutofill(): void {
  console.log('[undo] filledElements count:', filledElements.length);
  for (const element of filledElements) {
    console.log('[undo] clearing element:', (element as HTMLInputElement).name || element.id);
    clearFieldValue(element);
    console.log('[undo] value clear result:', (element as HTMLInputElement).value);
    clearElementHighlight(element);
  }
  filledElements = [];
  clearHighlights();
}

export async function runAutofill(): Promise<AutofillResult> {
  filledElements = [];

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
      filledElements.push(element);
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

    filledElements.push(element);

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
