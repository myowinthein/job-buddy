import { getProfile, getLearnedMappings, saveLearnedMapping } from '../utils/storage';
import { scanFields } from './scanner';
import { extractSignals } from './signals';
import type { FieldSignals } from './signals';
import { mapField } from './mapper';
import type { FieldMatch } from './mapper';
import { fillField, fillFileField, clearFieldValue } from './filler';
import { applyHighlight, clearElementHighlight, clearHighlights } from './highlighter';
import { attachPickerListeners, removePickerListener } from './picker';
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

// Tracks the blur handler currently registered on each picker-eligible element so
// we can remove stale handlers on re-run and during undo.
const editWatchers = new WeakMap<HTMLElement, () => void>();

// Attaches a blur listener to each non-green field. On blur, if the value
// changed since autofill ran, the field transitions to No Review (green) and
// the popup counts are updated. No learned mapping is saved — manual edits are
// intentionally kept separate from the learning mechanism.
function attachEditWatchers(fields: PickerField[], result: AutofillResult): void {
  for (const { element, state } of fields) {
    const prev = editWatchers.get(element);
    if (prev) element.removeEventListener('blur', prev);

    const valueAtAttach  = getFieldValue(element);
    const capturedResult = result;

    const handler = () => {
      // Guard against stale sessions (undo or re-scan resets lastResult).
      if (lastResult !== capturedResult) {
        element.removeEventListener('blur', handler);
        editWatchers.delete(element);
        return;
      }

      const currentValue = getFieldValue(element);
      if (currentValue === valueAtAttach) return; // nothing actually changed

      // User has handled this field — promote to No Review (green).
      applyHighlight(element, 0.97);

      // noData fields were not yet in sessionElements; register now so Undo covers them.
      if (state === 'noData') sessionElements.push(element);

      result.noReview++;
      if (state === 'lowConfidence') result.lowConfidence = Math.max(0, result.lowConfidence - 1);
      if (state === 'needReview')    result.needReview    = Math.max(0, result.needReview    - 1);
      if (state === 'noData')        result.noData        = Math.max(0, result.noData        - 1);

      // Field is resolved — tear down both the edit watcher and the picker listener
      // so focusing the now-green field no longer opens the picker.
      element.removeEventListener('blur', handler);
      editWatchers.delete(element);
      removePickerListener(element);
    };

    element.addEventListener('blur', handler);
    editWatchers.set(element, handler);
  }
}

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
    const watcher = editWatchers.get(element);
    if (watcher) {
      element.removeEventListener('blur', watcher);
      editWatchers.delete(element);
    }
  }
  sessionElements = [];
  lastResult = null;  // also self-invalidates any noData watchers not in sessionElements
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

  // File inputs are only relevant when the user actually has a CV file to
  // upload. Gating in the scanner keeps file inputs out of pendingMatches
  // entirely when no CV is saved, so they never contribute to result counters.
  const allowFileInputs = !!profile.documents?.cv?.file;
  const fields = scanFields({ allowFileInputs });

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

    const isFileInput = element instanceof HTMLInputElement && element.type === 'file';

    if (match.confidence >= 0.60 && match.value) {
      // Confident match with profile data → fill and highlight.
      let filled = true;
      if (isFileInput) {
        const fileData = profile.documents?.cv?.file;
        // Scanner gating means fileData should always be present here, but
        // guard defensively — if reconstruction fails, skip without counting.
        filled = fileData ? await fillFileField(element as HTMLInputElement, fileData) : false;
      } else {
        await fillField(element, match.value);
      }

      if (!filled) {
        // Reconstruction failed (corrupt base64, etc.). Log already emitted by
        // fillFileField; silently skip this element so the rest of the run
        // continues uninterrupted.
        continue;
      }

      applyHighlight(element, match.confidence); // green >=0.85, yellow 0.60–0.84
      sessionElements.push(element);

      if (match.confidence >= 0.85) {
        result.noReview++;
        // No picker for green (No Review) fields.
      } else {
        result.needReview++;
        // File inputs are deliberately excluded from the picker overlay —
        // file selection is handled silently by Auto Fill, not the picker.
        if (!isFileInput) pickerFields.push({ element, state: 'needReview' });
      }

    } else if (match.confidence < 0.60) {
      // Low or no confidence — red highlight, picker for manual resolution.
      applyHighlight(element, 0);
      sessionElements.push(element);
      result.lowConfidence++;
      if (!isFileInput) pickerFields.push({ element, state: 'lowConfidence' });

    } else {
      // confidence >= 0.60 but profile value is empty — nothing to write.
      // No highlight; picker is offered so the user can choose an alternative value.
      result.noData++;
      if (!isFileInput) pickerFields.push({ element, state: 'noData' });
    }
  }

  pendingMatches = [];

  // Store before attaching picker listeners — the result object is mutated in
  // place by picker callbacks, so the reference remains accurate after those run.
  lastResult = result;

  attachEditWatchers(pickerFields, result);

  attachPickerListeners(pickerFields, async (element, fieldPath, value, originalState: PickerFieldState) => {
    await fillField(element, value);
    applyHighlight(element, 0.97); // green — user-confirmed, high confidence

    // noData fields are not in sessionElements yet; add them now so undo covers them.
    // needReview and lowConfidence fields are already tracked — don't double-push.
    if (originalState === 'noData') {
      sessionElements.push(element);
    }

    // Remove the edit watcher so the blur that follows picker selection (when the
    // user clicks elsewhere) doesn't trigger a second state transition.
    const watcher = editWatchers.get(element);
    if (watcher) {
      element.removeEventListener('blur', watcher);
      editWatchers.delete(element);
    }

    const sigs = extractSignals(element);
    const signalTexts = [
      sigs.name, sigs.id, sigs.placeholder,
      sigs.ariaLabel, sigs.label, sigs.nearbyText,
    ].filter(Boolean);

    // Learned-mapping saves are best-effort: a storage quota error must not
    // prevent the result counts from updating or produce an unhandled rejection.
    try {
      for (const text of signalTexts) {
        const norm = normalize(text);
        if (norm) await saveLearnedMapping(domain, norm, fieldPath);
      }
    } catch {
      // Non-critical — mapping will be re-learned on the next picker selection.
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
