import { getProfile, getLearnedMappings, saveLearnedMapping } from '../utils/storage';
import { scanFields } from './scanner';
import { extractSignals } from './signals';
import type { FieldSignals } from './signals';
import { mapField } from './mapper';
import type { FieldMatch } from './mapper';
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

export interface AutofillScanResult {
  preFilledCount: number;
  totalMatched:   number;
}

// Every element that received applyHighlight during the current session.
// Superset of "elements that were filled" — includes highlighted-but-unfilled
// fields (unmatched, matched-but-no-profile-value, low-confidence).
// Cleared and re-populated on each scan/fill cycle.
// undoAutofill uses this so that fields the user typed into after autofill
// (on any highlighted field) are also cleared on undo.
let sessionElements: HTMLElement[] = [];

// Scan results held between AUTOFILL_SCAN and AUTOFILL_FILL messages.
interface PendingMatch {
  element:          HTMLElement;
  signals:          FieldSignals;
  match:            FieldMatch;
  hasExistingValue: boolean;
}
let pendingMatches: PendingMatch[] = [];

function getFieldValue(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  if (element instanceof HTMLSelectElement) {
    return element.value;
  }
  return '';
}

export function undoAutofill(): void {
  for (const element of sessionElements) {
    clearFieldValue(element);
    clearElementHighlight(element);
  }
  sessionElements = [];
  clearHighlights();
}

// Phase 1: scan and map all fields; detect which matched fields already have values.
// Results are held in pendingMatches for executeAutofill().
export async function scanAutofill(): Promise<AutofillScanResult> {
  pendingMatches  = [];
  sessionElements = [];

  const profile = await getProfile();
  if (!profile) {
    console.warn('[Job Buddy] Profile not found — skipping autofill');
    return { preFilledCount: 0, totalMatched: 0 };
  }

  const learnedMappings = await getLearnedMappings();
  const domain = window.location.hostname;
  const fields = scanFields();

  let preFilledCount = 0;
  let totalMatched   = 0;

  for (const element of fields) {
    const signals = extractSignals(element);
    const match   = mapField(signals, profile, learnedMappings, domain);
    const hasExistingValue = getFieldValue(element) !== '';

    if (match.confidence > 0 && match.value) {
      totalMatched++;
      if (hasExistingValue) preFilledCount++;
    }

    pendingMatches.push({ element, signals, match, hasExistingValue });
  }

  return { preFilledCount, totalMatched };
}

// Phase 2: fill fields according to the chosen mode.
// 'merge'     — skip fields that already had a value (leave them untouched, no highlight).
// 'overwrite' — fill all matched fields regardless of existing content.
//
// Counting rules:
//   filled   = confidence >= 0.85 AND a non-empty profile value was actually written
//   review   = 0.60 <= confidence < 0.85 AND value was written
//   unmatched = no match OR matched but profile value is empty OR confidence < 0.60
//
// Only elements where applyHighlight is called are added to sessionElements,
// so undoAutofill can restore them all (not just the ones autofill wrote to).
export async function executeAutofill(mode: 'merge' | 'overwrite'): Promise<AutofillResult> {
  const profile = await getProfile();
  if (!profile) return { filled: 0, review: 0, unmatched: 0, totalScanned: 0 };

  const learnedMappings = await getLearnedMappings();
  const domain = window.location.hostname;

  const result: AutofillResult = {
    filled: 0, review: 0, unmatched: 0,
    totalScanned: pendingMatches.length,
  };
  const redFields: Array<{ element: HTMLElement; signals: FieldSignals }> = [];

  for (const { element, signals, match, hasExistingValue } of pendingMatches) {
    // Merge mode: pre-filled fields are left completely untouched — no highlight, no count.
    if (mode === 'merge' && hasExistingValue && match.confidence > 0 && match.value) {
      continue;
    }

    if (match.confidence > 0 && match.value) {
      // A match was found AND the profile has a non-empty value — actually fill the field.
      await fillField(element, match.value);
      applyHighlight(element, match.confidence);
      sessionElements.push(element);

      if (match.confidence >= 0.85) {
        result.filled++;
      } else if (match.confidence >= 0.60) {
        result.review++;
      } else {
        // Low-confidence fill: red highlight, offer picker so user can correct.
        result.unmatched++;
        redFields.push({ element, signals });
      }
    } else {
      // Nothing written: either no match (confidence === 0) or matched but the
      // profile field is empty.  In both cases highlight red so the user knows
      // these fields were not filled, and offer the picker.
      applyHighlight(element, 0);
      sessionElements.push(element);
      result.unmatched++;
      redFields.push({ element, signals });
    }
  }

  pendingMatches = [];

  attachPickerListeners(redFields, profile, async (element, fieldPath, value) => {
    await fillField(element, value);
    applyHighlight(element, 0.97);
    sessionElements.push(element);

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

// Legacy single-phase entry point (kept for internal use / backward compat).
export async function runAutofill(): Promise<AutofillResult> {
  await scanAutofill();
  return executeAutofill('overwrite');
}
