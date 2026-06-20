import { getProfile, getLearnedMappings, saveLearnedMapping } from '../utils/storage';
import { scanFields } from './scanner';
import { extractSignals } from './signals';
import type { FieldSignals } from './signals';
import { mapField } from './mapper';
import type { FieldMatch } from './mapper';
import { fillField, clearFieldValue } from './filler';
import { applyHighlight, clearElementHighlight, clearHighlights } from './highlighter';
import { attachPickerListeners } from './picker';
import type { PickerField, PickerFieldState } from './picker';
import { normalize } from './normalizer';

export { clearHighlights } from './highlighter';

export interface AutofillResult {
  noReview:      number;  // filled, confidence >= 0.85 (green)
  needReview:    number;  // filled, 0.60 <= confidence < 0.85 (yellow)
  lowConfidence: number;  // not filled, confidence < 0.60 — red highlight, picker offered
  noData:        number;  // not filled, confidence >= 0.60 but profile value is empty
  totalScanned:  number;  // every field found by the scanner, regardless of outcome
}

export interface AutofillScanResult {
  preFilledCount: number;
  totalMatched:   number;
}

// Every element that should be cleared by undoAutofill(). Populated on each
// scan/fill cycle: initially noReview + needReview + lowConfidence (all get a
// highlight). noData fields are added here only if the user fills them via the
// picker during the same session.
let sessionElements: HTMLElement[] = [];

// The result of the most recent executeAutofill() call on this page.
// Persists for the content script's lifetime so the popup can restore its
// state after being closed and reopened. Reset at the start of each new
// scan cycle and when the user undoes.
let lastResult: AutofillResult | null = null;

export function getLastResult(): AutofillResult | null {
  return lastResult;
}

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
  lastResult = null;
  clearHighlights();
}

// Phase 1: scan and map all fields; detect which matched fields already have values.
// Results are held in pendingMatches for executeAutofill().
export async function scanAutofill(): Promise<AutofillScanResult> {
  pendingMatches  = [];
  sessionElements = [];
  lastResult      = null;

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

    if (match.confidence >= 0.60 && match.value) {
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
// Four-way outcome per field:
//   noReview      confidence >= 0.85, value present → fill, green highlight
//   needReview    0.60 <= confidence < 0.85, value present → fill, yellow highlight, picker offered
//   lowConfidence confidence < 0.60 (any value) → no fill, red highlight, picker offered
//   noData        confidence >= 0.60, value empty → no fill, no highlight, picker offered
//
// sessionElements tracks every highlighted element (noReview + needReview + lowConfidence)
// so undoAutofill can clear them all. noData fields are added to sessionElements only
// when filled through the picker.
export async function executeAutofill(mode: 'merge' | 'overwrite'): Promise<AutofillResult> {
  const profile = await getProfile();
  if (!profile) return { noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0 };

  const learnedMappings = await getLearnedMappings();
  const domain = window.location.hostname;

  const result: AutofillResult = {
    noReview: 0, needReview: 0, lowConfidence: 0, noData: 0,
    totalScanned: pendingMatches.length,
  };
  const pickerFields: PickerField[] = [];

  for (const { element, match, hasExistingValue } of pendingMatches) {
    // Merge mode: skip pre-filled fields that would otherwise be overwritten.
    // Only relevant when confidence >= 0.60 AND the profile has a value to fill.
    if (mode === 'merge' && hasExistingValue && match.confidence >= 0.60 && match.value) {
      continue;
    }

    if (match.confidence >= 0.60 && match.value) {
      // Confident match with profile data → fill and highlight.
      await fillField(element, match.value);
      applyHighlight(element, match.confidence); // green >=0.85, yellow 0.60–0.84
      sessionElements.push(element);

      if (match.confidence >= 0.85) {
        result.noReview++;
        // No picker for green (No Review) fields.
      } else {
        result.needReview++;
        pickerFields.push({ element, state: 'needReview' });
      }

    } else if (match.confidence < 0.60) {
      // Low or no confidence — red highlight, picker for manual resolution.
      applyHighlight(element, 0);
      sessionElements.push(element);
      result.lowConfidence++;
      pickerFields.push({ element, state: 'lowConfidence' });

    } else {
      // confidence >= 0.60 but profile value is empty — nothing to write.
      // No highlight; picker is offered so the user can choose an alternative value.
      result.noData++;
      pickerFields.push({ element, state: 'noData' });
    }
  }

  pendingMatches = [];

  // Store before attaching picker listeners — the result object is mutated in
  // place by picker callbacks, so the reference remains accurate after those run.
  lastResult = result;

  attachPickerListeners(pickerFields, profile, async (element, fieldPath, value, originalState: PickerFieldState) => {
    await fillField(element, value);
    applyHighlight(element, 0.97); // green — user-confirmed, high confidence

    // noData fields are not in sessionElements yet; add them now so undo covers them.
    // needReview and lowConfidence fields are already tracked — don't double-push.
    if (originalState === 'noData') {
      sessionElements.push(element);
    }

    const sigs = extractSignals(element);
    const signalTexts = [
      sigs.name, sigs.id, sigs.placeholder,
      sigs.ariaLabel, sigs.label, sigs.nearbyText,
    ].filter(Boolean);

    for (const text of signalTexts) {
      const norm = normalize(text);
      if (norm) await saveLearnedMapping(domain, norm, fieldPath);
    }

    result.noReview++;
    if (originalState === 'lowConfidence') result.lowConfidence = Math.max(0, result.lowConfidence - 1);
    if (originalState === 'needReview')    result.needReview    = Math.max(0, result.needReview    - 1);
    if (originalState === 'noData')        result.noData        = Math.max(0, result.noData        - 1);
  });

  return result;
}

// Legacy single-phase entry point (kept for internal use / backward compat).
export async function runAutofill(): Promise<AutofillResult> {
  await scanAutofill();
  return executeAutofill('overwrite');
}
