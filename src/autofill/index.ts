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

// Every element that received applyHighlight during the current session
// (noReview + needReview + lowConfidence). noData fields are NOT included
// because they are left completely untouched — no fill, no highlight, nothing
// to undo. Cleared and re-populated on each scan/fill cycle.
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
//   needReview    0.60 <= confidence < 0.85, value present → fill, yellow highlight
//   lowConfidence confidence < 0.60 (any value) → no fill, red highlight, picker
//   noData        confidence >= 0.60, value empty → no fill, no highlight, untouched
//
// sessionElements tracks every highlighted element (noReview + needReview +
// lowConfidence) so undoAutofill can clear them all. noData fields are never
// added because nothing was written to them.
export async function executeAutofill(mode: 'merge' | 'overwrite'): Promise<AutofillResult> {
  const profile = await getProfile();
  if (!profile) return { noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0 };

  const learnedMappings = await getLearnedMappings();
  const domain = window.location.hostname;

  const result: AutofillResult = {
    noReview: 0, needReview: 0, lowConfidence: 0, noData: 0,
    totalScanned: pendingMatches.length,
  };
  const redFields: Array<{ element: HTMLElement; signals: FieldSignals }> = [];

  for (const { element, signals, match, hasExistingValue } of pendingMatches) {
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

      if (match.confidence >= 0.85) result.noReview++;
      else                          result.needReview++;

    } else if (match.confidence < 0.60) {
      // Low or no confidence (includes confidence === 0).
      // Red highlight signals the field needs manual attention; picker lets the
      // user map it themselves.
      applyHighlight(element, 0);
      sessionElements.push(element);
      result.lowConfidence++;
      redFields.push({ element, signals });

    } else {
      // confidence >= 0.60 but profile value is empty — nothing to write.
      // Leave the field completely untouched (no highlight, not in sessionElements).
      result.noData++;
    }
  }

  pendingMatches = [];

  // Store before attaching picker listeners — the result object is mutated in
  // place by picker callbacks, so the reference remains accurate after those run.
  lastResult = result;

  attachPickerListeners(redFields, profile, async (element, fieldPath, value) => {
    await fillField(element, value);
    applyHighlight(element, 0.97); // green — learned mapping, high confidence
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

    result.noReview++;
    result.lowConfidence = Math.max(0, result.lowConfidence - 1);
  });

  return result;
}

// Legacy single-phase entry point (kept for internal use / backward compat).
export async function runAutofill(): Promise<AutofillResult> {
  await scanAutofill();
  return executeAutofill('overwrite');
}
