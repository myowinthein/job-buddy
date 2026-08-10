import type { Profile } from '../types/profile';
import { getProfile, getLearnedMappings, saveLearnedMappings } from '../utils/storage';
import { CONF_FILL, CONF_GREEN, CONF_CONFIRMED, CONF_DICT_EXACT, EDIT_LEARN_SIMILARITY_THRESHOLD, EDIT_LEARN_MIN_VALUE_LENGTH } from './constants';
import { scanFields, scanAriaFields, scanCheckboxGroups } from './scanner';
import { extractSignals, bestLabel } from './signals';
import type { FieldSignals } from './signals';
import { mapField } from './mapper';
import type { FieldMatch } from './mapper';
import { adjustPhoneMatches } from './phoneResolution';
import { adjustLanguageMatches } from './languageResolution';
import { adjustEducationMatches, matchCurrentEducationCheckboxes } from './educationResolution';
import { adjustWorkHistoryMatches, matchCurrentWorkHistoryCheckboxes } from './workHistoryResolution';
import { adjustSalaryMatches } from './salaryResolution';
import { fillField, fillFileField, fillCheckboxInput, clearFieldValue } from './filler';
import { applyHighlight, clearElementHighlight, clearHighlights } from './highlighter';
import { resolveProfileValue, flattenProfileValues } from './resolver';
import type { FlatProfileValue } from './resolver';
import { normalize, similarity } from './normalizer';
import { refreshLearnedLabels, saveElementMappings } from './mappings';
import { runAIAutofill } from './ai';
import type { AITextCandidate } from './ai';
import type { DebugSession, DebugScanField, DebugMappingField, DebugAIField, FieldFinalState } from './debug';

export { clearHighlights } from './highlighter';

export interface AutofillResult {
  noReview:      number;  // filled, confidence >= 0.85 (green)
  needReview:    number;  // filled, 0.60 <= confidence < 0.85 (yellow)
  lowConfidence: number;  // not filled, confidence < 0.60 — red highlight
  noData:        number;  // not filled, confidence >= 0.60 but profile value is empty
  totalScanned:  number;  // every field found by the scanner, regardless of outcome
  aiAvailable?:  boolean; // true if the AI layer ran (key configured), false/undefined if skipped
}

// Zero-valued result used as a safe fallback when a fill cycle throws before
// producing a real count. Kept here beside AutofillResult so new fields on the
// interface stay reflected in the fallback shape.
export const EMPTY_AUTOFILL_RESULT: AutofillResult = {
  noReview:      0,
  needReview:    0,
  lowConfidence: 0,
  noData:        0,
  totalScanned:  0,
};

export interface AutofillScanResult {
  preFilledCount: number;
  totalMatched:   number;
}

// Every element that should be cleared by undoAutofill(). Populated on each
// scan/fill cycle: initially noReview + needReview + lowConfidence (all get a
// highlight). noData fields are added here only if the user fills them in
// manually during the same session.
let sessionElements: HTMLElement[] = [];

// Tracks the noData fields from the most recent executeAutofill run.
// Used by the visibilitychange listener to silently re-fill fields whose
// profile value became available (e.g. user added the missing data in the
// Options page) while the form tab was hidden. Cleared on undo and on each
// new scan/fill cycle. Stores enough state to re-resolve the path without
// re-running scanner / signals / mapper / confidence scoring.
interface NoDataEntry {
  element:   HTMLElement;
  fieldPath: string;
  label:     string;
}
let noDataFields: NoDataEntry[] = [];

// Single document-level visibilitychange listener. Registered once when the
// first executeAutofill run produces tracked noData fields; torn down on undo.
// Reuse of the same handler reference keeps add/remove idempotent.
let visibilityHandler: (() => void) | null = null;

function ensureVisibilityListener(): void {
  if (visibilityHandler) return;
  visibilityHandler = () => {
    if (document.visibilityState !== 'visible') return;
    void runSilentRefill();
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

function teardownVisibilityListener(): void {
  if (!visibilityHandler) return;
  document.removeEventListener('visibilitychange', visibilityHandler);
  visibilityHandler = null;
}

// Picks the most human-readable label from a field's signals for the noData
// field registry.
function extractDisplayLabel(signals: FieldSignals): string {
  return bestLabel(signals) || signals.id || 'this field';
}

type EditableFieldState = 'lowConfidence' | 'needReview' | 'noData';

interface EditableField {
  element: HTMLElement;
  state:   EditableFieldState;
}

// Tracks the blur handler currently registered on each non-green field so we
// can remove stale handlers on re-run and during undo.
const editWatchers = new WeakMap<HTMLElement, () => void>();

// Serializes learned-mapping writes triggered by edit watchers. saveLearnedMapping
// does a read-modify-write against chrome.storage.local, so two blur events firing
// close together (e.g. tabbing quickly through fields) could otherwise race and
// silently lose one write — the same class of bug fixed in ai.ts's sequential save loop.
let mappingSaveChain: Promise<void> = Promise.resolve();
function queueMappingSave(domain: string, element: HTMLElement, fieldPath: string): void {
  mappingSaveChain = mappingSaveChain
    .then(() => saveElementMappings(domain, element, fieldPath))
    .catch(() => { /* best-effort — mapping will be re-learned on a future edit */ });
}

// Finds the profile value most similar to a manually-typed value. Used to
// link an edit to learned mappings without depending on any prior field-match
// guess — the guess (when one even exists) may be entirely wrong, so instead
// we ask independently: does this typed text resemble anything already in the
// profile? Returns null if flatValues is empty.
function findBestProfileMatch(flatValues: FlatProfileValue[], value: string): { path: string; score: number } | null {
  const normValue = normalize(value);
  let best: { path: string; score: number } | null = null;
  for (const candidate of flatValues) {
    const score = similarity(normValue, normalize(candidate.value));
    if (!best || score > best.score) best = { path: candidate.path, score };
  }
  return best;
}

// Attaches a blur listener to each non-green field. On blur, if the value
// changed since autofill ran, the field transitions to No Review (green) and
// the popup counts are updated.
//
// Every tier (yellow/red/gray) also feeds learned mappings, gated by content
// rather than by whichever field-match guess (if any) put the field in this
// list: the typed value is compared against every value already in the
// profile, and if the best match is similar enough, that path is saved —
// even if it differs from what the mapper originally guessed. This avoids
// trusting a weak or wrong guess just because the user typed something into
// that field; a wildly different value simply finds no good match and is
// left unlearned.
function attachEditWatchers(fields: EditableField[], result: AutofillResult, domain: string, profile: Profile): void {
  const flatProfileValues = flattenProfileValues(profile);

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
      applyHighlight(element, CONF_CONFIRMED);

      // noData fields were not yet in sessionElements; register now so Undo covers them.
      if (state === 'noData') sessionElements.push(element);

      result.noReview++;
      if (state === 'lowConfidence') result.lowConfidence = Math.max(0, result.lowConfidence - 1);
      if (state === 'needReview')    result.needReview    = Math.max(0, result.needReview    - 1);
      if (state === 'noData') {
        result.noData = Math.max(0, result.noData - 1);
        // Manually-resolved noData fields should also leave the silent-refill
        // registry so a later profile update doesn't overwrite the user's typing.
        noDataFields = noDataFields.filter((e) => e.element !== element);
        if (noDataFields.length === 0) teardownVisibilityListener();
      }

      const trimmed = currentValue.trim();
      if (trimmed.length >= EDIT_LEARN_MIN_VALUE_LENGTH) {
        const best = findBestProfileMatch(flatProfileValues, trimmed);
        if (best && best.score >= EDIT_LEARN_SIMILARITY_THRESHOLD) {
          queueMappingSave(domain, element, best.path);
        }
      }

      // Field is resolved — tear down the edit watcher so it doesn't fire again.
      element.removeEventListener('blur', handler);
      editWatchers.delete(element);
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

// In-memory debug session from the most recent scan/fill cycle. Cleared on
// each scanAutofill() call. Lost on tab close or page reload — not persisted.
let debugSession: DebugSession | null = null;

export function getDebugSession(): DebugSession | null {
  return debugSession;
}

// Scan results held between AUTOFILL_SCAN and AUTOFILL_FILL messages.
interface PendingMatch {
  element:          HTMLElement;
  signals:          FieldSignals;
  match:            FieldMatch;
  hasExistingValue: boolean;
  debugFieldId:     string;
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

// Re-resolves every tracked noData field's profile path against a freshly-read
// profile. Fields whose value is now non-empty get filled silently (green
// highlight, no popup notification) and removed from the noData registry.
// Fields still empty remain in the registry for the next refocus.
//
// Important: this does NOT re-run scanner / signals / mapper / confidence
// scoring. It only re-resolves already-matched profile paths. Fields outside
// the noData registry (noReview / needReview / lowConfidence / manually-edited)
// are never touched, even if their underlying profile value changed.
async function runSilentRefill(): Promise<void> {
  if (!lastResult) return;
  if (noDataFields.length === 0) return;

  const profile = await getProfile();
  if (!profile) return;

  const result = lastResult; // capture for closure-safety inside the loop
  const remaining: NoDataEntry[] = [];

  for (const entry of noDataFields) {
    const { element, fieldPath } = entry;

    // The element may have been removed from the DOM (e.g. SPA navigation
    // within the same tab). Drop the entry silently — no fill, no count change.
    if (!document.contains(element)) continue;

    const value = resolveProfileValue(profile, fieldPath);
    if (!value) {
      // Profile still missing this value — keep watching for next refocus.
      remaining.push(entry);
      continue;
    }

    // Value is now available — fill silently and promote to noReview.
    await fillField(element, value);
    applyHighlight(element, CONF_CONFIRMED); // green
    sessionElements.push(element);

    result.noData    = Math.max(0, result.noData - 1);
    result.noReview += 1;

    // Tear down any blur watcher — the field is now resolved, so an existing
    // blur watcher would erroneously re-promote it on blur.
    const watcher = editWatchers.get(element);
    if (watcher) {
      element.removeEventListener('blur', watcher);
      editWatchers.delete(element);
    }
  }

  noDataFields = remaining;
  if (noDataFields.length === 0) teardownVisibilityListener();
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
  noDataFields    = [];
  teardownVisibilityListener();
  lastResult = null;  // also self-invalidates any noData watchers not in sessionElements
  clearHighlights();
}

// Phase 1: scan and map all fields; detect which matched fields already have values.
// Results are held in pendingMatches for executeAutofill().
export async function scanAutofill(): Promise<AutofillScanResult> {
  pendingMatches  = [];
  sessionElements = [];
  lastResult      = null;
  debugSession    = null;

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
  const fields = [...scanFields({ allowFileInputs }), ...scanAriaFields()];

  let preFilledCount = 0;
  let totalMatched   = 0;
  const debugScanner: DebugScanField[] = [];
  // Opportunistic label backfill for existing learned-mapping entries — see
  // refreshLearnedLabels. Batched into one write after the loop rather than
  // one per field.
  let learnedLabelsDirty = false;

  const scanned = fields.map((element, i) => {
    const signals = extractSignals(element);
    return {
      element,
      signals,
      match:        mapField(signals, profile, learnedMappings, domain),
      debugFieldId: `field_${String(i + 1).padStart(3, '0')}`,
    };
  });

  // Sibling-aware adjustment for phone.number vs phone.full — needs every
  // field's match already computed, since it depends on whether ANY field
  // on the page resolved to the calling-code path (see phoneResolution.ts).
  adjustPhoneMatches(scanned.map((s) => s.match), profile);

  // Sibling-aware index assignment for the unindexed languages.language /
  // languages.proficiency markers — see languageResolution.ts.
  adjustLanguageMatches(scanned.map((s) => s.match), profile);

  // Sibling-aware index assignment for the unindexed education.* markers —
  // see educationResolution.ts.
  adjustEducationMatches(scanned.map((s) => s.match), profile);

  // Sibling-aware index assignment for the unindexed workHistory.* markers —
  // see workHistoryResolution.ts.
  adjustWorkHistoryMatches(scanned.map((s) => s.match), profile);

  // Sibling-aware index assignment for the unindexed salary.expected.formatted
  // marker — see salaryResolution.ts.
  adjustSalaryMatches(scanned.map((s) => s.match), profile);

  // "Currently studying/working here"-style checkboxes: excluded from
  // scanFields() entirely (standalone checkboxes are never scanned by the
  // main pipeline — see EXCLUDED_TYPES in scanner.ts), and matched through a
  // deliberately narrow, separate path rather than mapper.ts's normal layers
  // — see matchCurrentEducationCheckboxes for why. Reuses scanCheckboxGroups(),
  // the same source ai.ts already scans for checkbox groups.
  const checkboxCandidates = scanCheckboxGroups()
    .filter((g) => !g.isConsent)
    .flatMap((g) => g.options);
  const checkboxMatches = [
    ...matchCurrentEducationCheckboxes(checkboxCandidates, profile),
    ...matchCurrentWorkHistoryCheckboxes(checkboxCandidates, profile),
  ];
  const checkboxScanned = checkboxMatches.map(({ element, fieldPath }, i) => ({
    element,
    signals: extractSignals(element),
    match: {
      fieldPath,
      confidence: CONF_DICT_EXACT,
      value:      'Yes',
      matchLayer: 'checkbox_status' as const,
    },
    debugFieldId: `field_${String(fields.length + i + 1).padStart(3, '0')}`,
  }));
  scanned.push(...checkboxScanned);

  scanned.forEach(({ element, signals, match, debugFieldId }) => {
    const hasExistingValue = getFieldValue(element) !== '';

    if (match.confidence >= CONF_FILL && match.value) {
      totalMatched++;
      if (hasExistingValue) preFilledCount++;
    }

    if (refreshLearnedLabels(domain, signals, learnedMappings)) learnedLabelsDirty = true;

    debugScanner.push({
      fieldId: debugFieldId,
      label:   bestLabel(signals),
      type:    signals.type,
      name:    signals.name,
      id:      signals.id,
    });

    pendingMatches.push({ element, signals, match, hasExistingValue, debugFieldId });
  });

  if (learnedLabelsDirty) void saveLearnedMappings(learnedMappings);

  // Seed an initial debug session — mapping/ai/summary are populated by executeAutofill.
  debugSession = {
    timestamp: Date.now(),
    scanner:   debugScanner,
    mapping:   [],
    ai:        [],
    summary:   { green: 0, yellow: 0, red: 0, gray: 0 },
    aiSkipped: false,
  };

  return { preFilledCount, totalMatched };
}

// Phase 2: fill fields according to the chosen mode.
// 'merge'     — skip fields that already had a value (leave them untouched, no highlight).
// 'overwrite' — fill all matched fields regardless of existing content.
//
// Four-way outcome per field:
//   noReview      confidence >= 0.85, value present → fill, green highlight
//   needReview    0.60 <= confidence < 0.85, value present → fill, yellow highlight
//   lowConfidence confidence < 0.60 (any value) → no fill, red highlight
//   noData        confidence >= 0.60, value empty → no fill, no highlight
//
// sessionElements tracks every highlighted element (noReview + needReview + lowConfidence)
// so undoAutofill can clear them all. noData fields are added to sessionElements only
// when the user fills them in manually.
//
// All three non-green tiers (needReview, lowConfidence, noData) get a follow-up
// AI pass below (runAIAutofill) when a Gemini key is configured — including
// needReview, which AI can overwrite with a different value if it disagrees
// with the rule pipeline's fill.
export async function executeAutofill(mode: 'merge' | 'overwrite'): Promise<AutofillResult> {
  const profile = await getProfile();
  if (!profile) return { noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0 };

  const domain = window.location.hostname;

  const result: AutofillResult = {
    noReview: 0, needReview: 0, lowConfidence: 0, noData: 0,
    totalScanned: pendingMatches.length,
  };
  const editableFields: EditableField[] = [];
  const aiTextCandidates: AITextCandidate[] = [];
  const debugMapping: DebugMappingField[] = [];

  // Reset the noData registry — silent re-fill will only consider noData
  // fields from this fresh run, not stale ones from a previous session.
  noDataFields = [];

  for (const { element, signals, match, hasExistingValue, debugFieldId } of pendingMatches) {
    // Merge mode: skip pre-filled fields that would otherwise be overwritten.
    // Only relevant when confidence >= 0.60 AND the profile has a value to fill.
    if (mode === 'merge' && hasExistingValue && match.confidence >= CONF_FILL && match.value) {
      // For debug: pre-filled merge skip is reported as the would-have-been state.
      debugMapping.push({
        fieldId: debugFieldId, matchLayer: match.matchLayer, confidence: match.confidence,
        profilePath: match.fieldPath,
        finalState: match.confidence >= CONF_GREEN ? 'green' : 'yellow',
      });
      continue;
    }

    const isFileInput = element instanceof HTMLInputElement && element.type === 'file';
    const isCheckboxInput = element instanceof HTMLInputElement && element.type === 'checkbox';
    const displayLabel = extractDisplayLabel(signals);
    let finalState: FieldFinalState;

    if (match.confidence >= CONF_FILL && match.value) {
      // Confident match with profile data → fill and highlight.
      let filled = true;
      if (isFileInput) {
        const fileData = profile.documents?.cv?.file;
        // Scanner gating means fileData should always be present here, but
        // guard defensively — if reconstruction fails, skip without counting.
        filled = fileData ? await fillFileField(element as HTMLInputElement, fileData) : false;
      } else if (isCheckboxInput) {
        // matchCurrentEducationCheckboxes only ever produces a checkbox match
        // when the underlying entry is current — .value on a checkbox never
        // affects its checked state, so this needs its own dispatch.
        fillCheckboxInput(element as HTMLInputElement);
      } else {
        await fillField(element, match.value);
      }

      if (!filled) {
        // Reconstruction failed (corrupt base64, etc.). Log already emitted by
        // fillFileField; silently skip this element so the rest of the run
        // continues uninterrupted.
        debugMapping.push({
          fieldId: debugFieldId, matchLayer: match.matchLayer, confidence: match.confidence,
          profilePath: match.fieldPath, finalState: 'gray',
        });
        continue;
      }

      applyHighlight(element, match.confidence); // green >=CONF_GREEN, yellow CONF_FILL–0.84
      sessionElements.push(element);

      if (match.confidence >= CONF_GREEN) {
        result.noReview++;
        finalState = 'green';
      } else {
        result.needReview++;
        // File/checkbox inputs are excluded from edit-watching — file
        // selection and checkbox state are handled silently by Auto Fill,
        // not manual typing.
        if (!isFileInput && !isCheckboxInput) editableFields.push({ element, state: 'needReview' });
        if (!isFileInput && !isCheckboxInput) {
          aiTextCandidates.push({ type: 'text', element, signals, originalState: 'needReview', originalFieldPath: match.fieldPath, debugFieldId });
        }
        finalState = 'yellow';
      }

    } else if (match.confidence < CONF_FILL) {
      // Low or no confidence — red highlight; left for manual resolution.
      applyHighlight(element, 0);
      sessionElements.push(element);
      result.lowConfidence++;
      if (!isFileInput && !isCheckboxInput) editableFields.push({ element, state: 'lowConfidence' });
      if (!isFileInput && !isCheckboxInput) {
        aiTextCandidates.push({ type: 'text', element, signals, originalState: 'lowConfidence', originalFieldPath: match.fieldPath, debugFieldId });
      }
      finalState = 'red';

    } else {
      // confidence >= 0.60 but profile value is empty — nothing to write.
      // No highlight; the user can type the value in directly.
      result.noData++;
      if (!isFileInput && !isCheckboxInput) {
        editableFields.push({ element, state: 'noData' });
        // Track in the noData registry so silent re-fill on tab refocus can
        // re-resolve this field's profile path once the user updates it.
        // match.fieldPath is non-null when confidence >= 0.60 (only the
        // "no signal matched" branch leaves it null, and that takes the
        // lowConfidence path above), but check explicitly for type safety.
        if (match.fieldPath) {
          noDataFields.push({ element, fieldPath: match.fieldPath, label: displayLabel });
          aiTextCandidates.push({ type: 'text', element, signals, originalState: 'noData', originalFieldPath: match.fieldPath, debugFieldId });
        }
      }
      finalState = 'gray';
    }

    debugMapping.push({
      fieldId: debugFieldId, matchLayer: match.matchLayer, confidence: match.confidence,
      profilePath: match.fieldPath, finalState,
    });
  }

  pendingMatches = [];

  // Register the visibilitychange listener only when we actually have noData
  // fields to watch. Listener is idempotent and is torn down on undo or when
  // all entries are resolved.
  if (noDataFields.length > 0) ensureVisibilityListener();

  const debugAI: DebugAIField[] = [];
  const aiGreenFilled = new Set<HTMLElement>();
  const aiRan = await runAIAutofill(aiTextCandidates, profile, result, sessionElements, domain, debugAI, aiGreenFilled);
  result.aiAvailable = aiRan;

  // Strip pre-AI entries for elements AI confirmed green. Without this, an
  // AI-filled green field would still get a blur watcher for its stale
  // pre-AI state (yellow/red/gray), causing incorrect count updates if the
  // user edits it further. AI's high-confidence decision is final; the field
  // should behave like any rule-pipeline green.
  if (aiGreenFilled.size > 0) {
    const filteredEditableFields = editableFields.filter((ef) => !aiGreenFilled.has(ef.element));
    editableFields.length = 0;
    editableFields.push(...filteredEditableFields);
    // Also drop these from the noData registry so silent re-fill doesn't try
    // to overwrite AI's value when the user updates the related profile field.
    noDataFields = noDataFields.filter((nd) => !aiGreenFilled.has(nd.element));
  }

  // Finalise debug session — scanner was seeded in scanAutofill; fill in the rest.
  if (debugSession) {
    debugSession.mapping   = debugMapping;
    debugSession.ai        = debugAI;
    debugSession.aiSkipped = !aiRan;
    debugSession.summary   = {
      green:  result.noReview,
      yellow: result.needReview,
      red:    result.lowConfidence,
      gray:   result.noData,
    };
  }

  // Store before attaching edit watchers — the result object is mutated in
  // place by those callbacks, so the reference remains accurate after they run.
  lastResult = result;

  attachEditWatchers(editableFields, result, domain, profile);

  return result;
}

