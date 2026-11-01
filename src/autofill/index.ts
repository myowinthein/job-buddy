import { ruleQuestionBlocked, fieldDomain } from './ruleContext';
import { resolveRuleValue, ruleValuePath } from './ruleValue';
import { readFieldValue as getFieldValue } from './fieldValue';
import type { Profile } from '../types/profile';
import { getProfile, getLearnedMappings, saveLearnedMappings } from '../utils/storage';
import { CONF_FILL, CONF_GREEN, CONF_CONFIRMED, CONF_DICT_EXACT, EDIT_LEARN_SIMILARITY_THRESHOLD, EDIT_LEARN_MIN_VALUE_LENGTH } from './constants';
import { scanForm, isChoiceGroupAvailable } from './scanner';
import { isChoice, isChoiceChecked, isControlAvailable } from './dom';
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
import { applyHighlight, applyMissingDataHighlight, clearMissingDataHighlights, clearElementHighlight, clearHighlights } from './highlighter';
import { confirmFieldFeedback } from './fieldFeedback';
import { flattenProfileValues } from './resolver';
import type { FlatProfileValue } from './resolver';
import { normalize, similarity } from './normalizer';
import { refreshLearnedLabels, saveElementMappings } from './mappings';
import { runAIAutofill } from './ai';
import type { AITextCandidate, AIAutofillStatus } from './ai';
import type { DebugSession, DebugScanField, DebugMappingField, DebugAIField, FieldFinalState } from './debug';
import { summarizeFillFields } from './fillLog';
import type { FillLogField, FrameFillLog } from './fillLog';
import type { RadioGroup, CheckboxGroup } from './scanner';
import { isConsentGroup } from './consent';

export { clearHighlights } from './highlighter';

export interface AutofillResult {
  noReview:      number;  // filled, confidence >= 0.85 (green)
  needReview:    number;  // filled, 0.60 <= confidence < 0.85 (yellow)
  lowConfidence: number;  // not filled, confidence < 0.60 — red highlight
  noData:        number;  // not filled, confidence >= 0.60 but profile value is empty
  totalScanned:  number;  // every field found by the scanner, regardless of outcome
  aiStatus?: AIAutofillStatus;
  kept?: number;
  excluded?: number;
  failed?: number;
  manual?: number;
  runId?: string;
  startedAt?: number;
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
// scan/fill cycle: only actual rule/AI fills and subsequent manual edits
// belong to Undo. Highlighting an unfilled field never grants ownership.
let sessionElements: HTMLElement[] = [];
let sessionGeneration = 0;
let sessionAbort = new AbortController();
let removeProfileWatcher = () => {};

function invalidateSession(): void {
  sessionGeneration++;
  sessionAbort.abort(new DOMException('Autofill cancelled', 'AbortError'));
  removeProfileWatcher();
}

function watchRunProfile(): void {
  removeProfileWatcher();
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (
      area === 'local' &&
      changes.profile &&
      JSON.stringify(changes.profile.oldValue) !== JSON.stringify(changes.profile.newValue)
    )
      cancelAutofillRun();
  };
  chrome.storage.onChanged.addListener(listener);
  const remove = () => {
    chrome.storage.onChanged.removeListener(listener);
    if (removeProfileWatcher === remove) removeProfileWatcher = () => {};
  };
  removeProfileWatcher = remove;
}

let refillInFlight: Promise<void> | null = null;
let pendingReady = false;
let fillLog: FrameFillLog | null = null;
let fieldRecords = new Map<HTMLElement, FillLogField>();
let recordElements = new Map<FillLogField, HTMLElement[]>();
let recordValues = new Map<FillLogField, string>();
const writingElements = new Set<HTMLElement>();
let removeReportWatchers = () => {};
let pendingRadioGroups: RadioGroup[] = [];
let pendingCheckboxGroups: CheckboxGroup[] = [];

function bindRecord(record: FillLogField, elements: HTMLElement[]): void {
  recordElements.set(record, elements);
  for (const element of elements) fieldRecords.set(element, record);
  recordValues.set(record, recordValue(record));
}

function recordValue(record: FillLogField): string {
  const elements = recordElements.get(record) ?? [];
  if (record.kind === 'radio' || record.kind === 'checkbox') {
    return elements.flatMap((e, index) => isChoiceChecked(e) ? [String(index)] : []).join(',');
  }
  return elements[0] ? getFieldValue(elements[0]).trim() : '';
}

function syncFillLogResult(result: AutofillResult | null = lastResult): void {
  if (!result || !fillLog) return;
  const counts = summarizeFillFields(fillLog.fields);
  Object.assign(result, {
    noReview: counts.highConfidence + counts.manual, needReview: counts.review,
    lowConfidence: counts.unmatched, noData: counts.missing, totalScanned: counts.detected,
    kept: counts.kept, excluded: counts.excluded, failed: counts.failed, manual: counts.manual,
    runId: fillLog.runId, startedAt: fillLog.startedAt,
  });
  if (debugSession) debugSession.summary = { green: result.noReview, yellow: result.needReview, red: result.lowConfidence, gray: result.noData };
}

function refreshTrackedField(element: HTMLElement): void {
  const record = fieldRecords.get(element);
  if (!record || record.outcome === 'excluded' || fillLog?.status !== 'completed') return;
  const elements = recordElements.get(record) ?? [];
  if (elements.some(e => writingElements.has(e))) return;
  const value = recordValue(record);
  if (recordValues.get(record) === value) return;
  recordValues.set(record, value);
  record.outcome = value ? 'manual' : 'not_matched';
  record.source = 'manual';
  record.reason = value ? 'manual_edit' : 'manual_clear';
  if (value) for (const item of elements) confirmFieldFeedback(item);
  if (!value) for (const item of elements) clearElementHighlight(item);
  syncFillLogResult();
}

function attachReportWatchers(): void {
  removeReportWatchers();
  const removals: (() => void)[] = [];
  for (const [record, elements] of recordElements) {
    recordValues.set(record, recordValue(record));
    if (record.outcome === 'excluded') continue;
    for (const element of elements) {
      const handler = () => refreshTrackedField(element);
      for (const name of ['input', 'change', 'blur']) element.addEventListener(name, handler);
      removals.push(() => { for (const name of ['input', 'change', 'blur']) element.removeEventListener(name, handler); });
    }
  }
  removeReportWatchers = () => { removals.forEach(remove => remove()); };
}

export function getFillLog(): FrameFillLog | null {
  if (fillLog?.status === 'completed') for (const element of fieldRecords.keys()) refreshTrackedField(element);
  syncFillLogResult();
  return fillLog;
}

// Tracks the noData fields from the most recent executeAutofill run.
// Used by the visibilitychange listener to silently re-fill fields whose
// profile value became available (e.g. user added the missing data in the
// Options page) while the form tab was hidden. Cleared on undo and on each
// new scan/fill cycle. Stores enough state to re-resolve the path without
// re-running scanner / signals / mapper / confidence scoring.
interface NoDataEntry {
  element:   HTMLElement;
  fieldPath: string;
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
  if (!normValue) return null;
  let best: { path: string; score: number } | null = null;
  for (const candidate of flatValues) {
    const score = similarity(normValue, normalize(candidate.value));
    if (!best || score > best.score) best = { path: candidate.path, score };
    else if (score === best.score && candidate.path !== best.path) best = { path: '', score };
  }
  return best?.path ? best : null;
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

      refreshTrackedField(element);

      // User has handled this field — promote to No Review (green).
      if (currentValue.trim()) applyHighlight(element, CONF_CONFIRMED, true);
      else clearElementHighlight(element);

      // Register a real manual edit; unfilled red/gray fields were not owned yet.
      if (!sessionElements.includes(element)) sessionElements.push(element);

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
      if (trimmed.length >= EDIT_LEARN_MIN_VALUE_LENGTH && !ruleQuestionBlocked(extractSignals(element))) {
        const best = findBestProfileMatch(flatProfileValues, trimmed);
        if (best && best.score >= EDIT_LEARN_SIMILARITY_THRESHOLD) {
          queueMappingSave(domain, element, best.path);
        }
      }

      // Field is resolved — tear down the edit watcher so it doesn't fire again.
      element.removeEventListener('blur', handler);
      editWatchers.delete(element);
      syncFillLogResult(result);
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
  getFillLog();
  return lastResult;
}

// In-memory debug session from the most recent scan/fill cycle. Cleared on
// each scanAutofill() call. Lost on tab close or page reload — not persisted.
let debugSession: DebugSession | null = null;

export function getDebugSession(): DebugSession | null {
  getFillLog();
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

// Re-resolves every tracked noData field's profile path against a freshly-read
// profile. Fields whose value is now non-empty get filled silently (green
// highlight, no popup notification) and removed from the noData registry.
// Fields still empty remain in the registry for the next refocus.
//
// Important: this does NOT re-run scanner / signals / mapper / confidence
// scoring. It only re-resolves already-matched profile paths. Fields outside
// the noData registry (noReview / needReview / lowConfidence / manually-edited)
// are never touched, even if their underlying profile value changed.
function runSilentRefill(): Promise<void> {
  if (refillInFlight) return refillInFlight;
  const result = lastResult;
  const generation = sessionGeneration;
  if (!result || noDataFields.length === 0) return Promise.resolve();
  const entries = [...noDataFields];
  const isActive = () => generation === sessionGeneration && result === lastResult;
  const task = (async () => {
    try {
      const profile = await getProfile();
      if (!profile || !isActive()) return;
      for (const entry of entries) {
        if (!isActive()) return;
        if (!noDataFields.includes(entry)) continue;
        const { element, fieldPath } = entry;
        if (!element.isConnected || getFieldValue(element).trim()) {
          noDataFields = noDataFields.filter((item) => item !== entry);
          continue;
        }
        const value = resolveRuleValue(profile, fieldPath, extractSignals(element));
        if (!value) continue;
        if (!sessionElements.includes(element)) sessionElements.push(element);
        writingElements.add(element);
        let filled: boolean | void;
        try { filled = await fillField(element, value, () => isActive() && !getFieldValue(element).trim()); }
        finally { writingElements.delete(element); }
        if (!isActive()) return;
        if (!noDataFields.includes(entry)) continue; // a manual blur resolved it while awaiting
        if (filled === false) {
          const index = sessionElements.indexOf(element);
          if (index >= 0) sessionElements.splice(index, 1);
          continue;
        }
        applyHighlight(element, CONF_CONFIRMED);
        const record = fieldRecords.get(element);
        if (record) {
          record.rule.outcome = 'filled';
          record.outcome = 'high_confidence';
          record.source = 'rules';
          record.reason = 'profile_updated';
          recordValues.set(record, recordValue(record));
        }
        result.noData = Math.max(0, result.noData - 1);
        result.noReview++;
        noDataFields = noDataFields.filter((item) => item !== entry);
        const watcher = editWatchers.get(element);
        if (watcher) {
          element.removeEventListener('blur', watcher);
          editWatchers.delete(element);
        }
      }
      if (noDataFields.length === 0) teardownVisibilityListener();
      syncFillLogResult(result);
    } catch {
      // Keep unresolved entries for the next visibility event.
    }
  })();
  refillInFlight = task;
  void task.finally(() => { if (refillInFlight === task) refillInFlight = null; });
  return task;
}

export function undoAutofill(): void {
  getFillLog();
  removeReportWatchers();
  if (fillLog) fillLog.status = 'undone';
  invalidateSession();
  refillInFlight = null;
  pendingReady = false;
  pendingMatches = [];
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

// Invalidate pending/async work without undoing already filled answers.
export function cancelAutofillRun(): void {
  invalidateSession();
  pendingReady = false;
  pendingMatches = [];
  noDataFields = [];
  teardownVisibilityListener();
}

// Phase 1: scan and map all fields; detect which matched fields already have values.
// Results are held in pendingMatches for executeAutofill().
export async function scanAutofill(runId: string = crypto.randomUUID()): Promise<AutofillScanResult> {
  removeReportWatchers();
  fieldRecords = new Map();
  recordElements = new Map();
  recordValues = new Map();
  pendingRadioGroups = [];
  pendingCheckboxGroups = [];
  fillLog = { version: 1, runId, startedAt: Date.now(), origin: location.origin, status: 'scanning', fields: [] };
  invalidateSession();
  sessionAbort = new AbortController();
  const generation = sessionGeneration;
  refillInFlight = null;
  pendingReady = false;
  noDataFields = [];
  teardownVisibilityListener();
  pendingMatches  = [];
  sessionElements = [];
  lastResult      = null;
  debugSession    = null;

  const profile = await getProfile();
  if (generation !== sessionGeneration) return { preFilledCount: 0, totalMatched: 0 };
  if (!profile) {
    console.warn('[Job Buddy] Profile not found — skipping autofill');
    return { preFilledCount: 0, totalMatched: 0 };
  }

  watchRunProfile();
  const learnedMappings = await getLearnedMappings();
  if (generation !== sessionGeneration) return { preFilledCount: 0, totalMatched: 0 };
  const domain = fieldDomain();

  // File inputs are only relevant when the user actually has a CV file to
  // upload. Gating in the scanner keeps file inputs out of pendingMatches
  // entirely when no CV is saved, so they never contribute to result counters.
  const allowFileInputs = !!profile.documents?.cv?.file;
  const snapshot = scanForm({ allowFileInputs, scopeApplication: true });
  const fields = snapshot.fields;

  let preFilledCount = 0;
  let totalMatched   = 0;
  const debugScanner: DebugScanField[] = [];
  // Opportunistic label backfill for existing learned-mapping entries — see
  // refreshLearnedLabels. Batched into one write after the loop rather than
  // one per field.
  let learnedLabelsDirty = false;

  const scanned = fields.map((element, i) => {
    const signals = snapshot.signals(element);
    return {
      element,
      signals,
      match:        { ...mapField(signals, profile, learnedMappings, domain), element },
      debugFieldId: `field_${String(i + 1).padStart(3, '0')}`,
    };
  });

  // Each adjust*Matches call below mutates the FieldMatch objects in place,
  // so one shared array of references is equivalent to (and cheaper than) a
  // fresh scanned.map() per call.
  const matches = scanned.map((s) => s.match);

  // Sibling-aware adjustment for phone.number vs phone.full — needs every
  // field's match already computed, since it depends on whether ANY field
  // on the page resolved to the calling-code path (see phoneResolution.ts).
  adjustPhoneMatches(matches, profile);

  // Sibling-aware index assignment for the unindexed languages.language /
  // languages.proficiency markers — see languageResolution.ts.
  adjustLanguageMatches(matches, profile);

  // Sibling-aware index assignment for the unindexed education.* markers —
  // see educationResolution.ts.
  adjustEducationMatches(matches, profile);

  // Sibling-aware index assignment for the unindexed workHistory.* markers —
  // see workHistoryResolution.ts.
  adjustWorkHistoryMatches(matches, profile);

  // Sibling-aware index assignment for the unindexed salary.expected.formatted
  // marker — see salaryResolution.ts.
  adjustSalaryMatches(matches, profile);

  // Current-status checkboxes use a narrow rule pass rather than the text
  // mapper. Other non-consent choices remain available to the AI pass.
  const checkboxGroups = snapshot.checkboxGroups;
  pendingRadioGroups = snapshot.radioGroups;
  pendingCheckboxGroups = checkboxGroups;
  for (const { element, signals, match, debugFieldId } of scanned) {
    const record: FillLogField = {
      id: debugFieldId, label: bestLabel(signals) || 'Unlabelled field',
      kind: element instanceof HTMLInputElement && element.type === 'file' ? 'file'
        : element instanceof HTMLSelectElement || element.getAttribute('role') === 'combobox' || element.getAttribute('aria-haspopup') === 'listbox' ? 'select' : 'text',
      rule: { outcome: 'not_applicable', layer: match.matchLayer, confidence: match.confidence, ...(match.fieldPath ? { profilePath: match.fieldPath } : {}) },
      ai: { outcome: 'not_sent' }, outcome: 'not_matched', source: null,
    };
    fillLog!.fields.push(record);
    bindRecord(record, [element]);
  }
  for (const [kind, groups] of [['radio', pendingRadioGroups], ['checkbox', checkboxGroups]] as const) {
    groups.forEach((group, index) => {
      const excluded = !!group.isConsent || isConsentGroup(group);
      const record: FillLogField = {
        id: `${kind}_${index + 1}`, label: group.groupLabel || group.name || `Unlabelled ${kind} group`, kind,
        rule: { outcome: 'not_applicable' }, ai: { outcome: 'not_sent' },
        outcome: excluded ? 'excluded' : 'not_matched', source: null,
        ...(excluded ? { reason: 'consent' as const } : {}),
      };
      fillLog!.fields.push(record);
      bindRecord(record, group.options.map(option => option.element));
    });
  }
  const checkboxCandidates = checkboxGroups
    .filter((g) => !g.isConsent && !isConsentGroup(g))
    .flatMap((g) => g.options);
  const checkboxMatches = [
    ...matchCurrentEducationCheckboxes(checkboxCandidates, profile, matches),
    ...matchCurrentWorkHistoryCheckboxes(checkboxCandidates, profile, matches),
  ];
  const checkboxScanned = checkboxMatches.map(({ element, fieldPath }, i) => ({
    element,
    signals: extractSignals(element),
    match: {
      fieldPath, element,
      confidence: CONF_DICT_EXACT,
      value:      'Yes',
      matchLayer: 'checkbox_status' as const,
    },
    debugFieldId: `field_${String(fields.length + i + 1).padStart(3, '0')}`,
  }));
  scanned.push(...checkboxScanned);

  const prefilledRecords = new Set<FillLogField>();
  for (const group of [...pendingRadioGroups, ...checkboxGroups]) {
    if (!group.isConsent && !isConsentGroup(group)) for (const option of group.options) if (isChoiceChecked(option.element)) prefilledRecords.add(fieldRecords.get(option.element)!);
  }
  scanned.forEach(({ element, signals, match, debugFieldId }) => {
    const hasExistingValue = getFieldValue(element).trim() !== '';
    if (hasExistingValue) prefilledRecords.add(fieldRecords.get(element)!);

    if (match.confidence >= CONF_FILL && match.value) {
      totalMatched++;
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

  if (learnedLabelsDirty) void saveLearnedMappings(learnedMappings, { labelsOnly: true }).catch(() => {});

  // Seed an initial debug session — mapping/ai/summary are populated by executeAutofill.
  debugSession = {
    timestamp: Date.now(),
    scanner:   debugScanner,
    mapping:   [],
    ai:        [],
    summary:   { green: 0, yellow: 0, red: 0, gray: 0 },
    aiSkipped: false,
  };

  preFilledCount = prefilledRecords.size;
  pendingReady = true;
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
//   noData        confidence >= 0.60, value empty → no fill, gray tint
//
// sessionElements tracks values actually filled during this session. Unfilled
// red/gray fields become owned only after a real manual edit.
//
// All three non-green tiers (needReview, lowConfidence, noData) get a follow-up
// AI pass below (runAIAutofill) when a Gemini key is configured — including
// needReview, which AI can overwrite with a different value if it disagrees
// with the rule pipeline's fill.
export async function executeAutofill(mode: 'merge' | 'overwrite'): Promise<AutofillResult> {
  if (!pendingReady) return { ...EMPTY_AUTOFILL_RESULT };
  const stopWatching = removeProfileWatcher;
  try {
    return await executePendingAutofill(mode);
  } finally {
    stopWatching();
  }
}

async function executePendingAutofill(mode: 'merge' | 'overwrite'): Promise<AutofillResult> {
  if (!pendingReady) return { ...EMPTY_AUTOFILL_RESULT };
  pendingReady = false;
  const matchesToFill = pendingMatches;
  pendingMatches = [];
  const ownedElements = sessionElements;
  const generation = sessionGeneration;
  const abortSignal = sessionAbort.signal;
  const isActive = () => generation === sessionGeneration;
  const profile = await getProfile();
  if (!isActive()) return { ...EMPTY_AUTOFILL_RESULT };
  if (!profile) return { noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0 };

  const domain = fieldDomain();

  const result: AutofillResult = {
    noReview: 0, needReview: 0, lowConfidence: 0, noData: 0,
    totalScanned: matchesToFill.length,
  };
  const editableFields: EditableField[] = [];
  const aiTextCandidates: AITextCandidate[] = [];
  const debugMapping: DebugMappingField[] = [];
  if (fillLog) fillLog.mode = mode;
  if (mode === 'merge') for (const [record, elements] of recordElements) {
    if (record.outcome !== 'excluded' && (recordValues.get(record) || recordValue(record))) {
      record.outcome = 'kept';
      record.rule.outcome = 'kept';
      record.reason = 'existing_value';
      // Includes an already-selected option elsewhere in the same group.
      for (const element of elements) fieldRecords.set(element, record);
    }
  }

  // Reset the noData registry — silent re-fill will only consider noData
  // fields from this fresh run, not stale ones from a previous session.
  clearMissingDataHighlights();
  noDataFields = [];

  for (const { element, signals, match, hasExistingValue, debugFieldId } of matchesToFill) {
    if (!isActive()) return { ...EMPTY_AUTOFILL_RESULT };
    const record = fieldRecords.get(element)!;
    const choiceGroup = isChoice(element) ? pendingCheckboxGroups.find(group => group.options.some(option => option.element === element)) : undefined;
    if (!isControlAvailable(element) || (choiceGroup && !isChoiceGroupAvailable(choiceGroup))) {
      record.rule.outcome = 'failed';
      record.outcome = 'failed';
      record.reason = 'fill_failed';
      continue;
    }
    if (match.fieldPath) {
      match.fieldPath = ruleValuePath(profile,match.fieldPath,signals);
      match.value = resolveRuleValue(profile, match.fieldPath, signals, match.value) || null;
    }
    Object.assign(record.rule, { layer: match.matchLayer, confidence: match.confidence, ...(match.fieldPath ? { profilePath: match.fieldPath } : {}) });
    // Merge mode: skip pre-filled fields that would otherwise be overwritten.
    if (mode === 'merge' && (record.outcome === 'kept' || hasExistingValue || getFieldValue(element).trim() !== '')) {
      record.outcome = 'kept';
      record.rule.outcome = 'kept';
      record.reason = 'existing_value';
      // For debug: pre-filled merge skip is reported as the would-have-been state.
      debugMapping.push({
        fieldId: debugFieldId, matchLayer: match.matchLayer, confidence: match.confidence,
        profilePath: match.fieldPath,
        finalState: match.confidence < CONF_FILL ? 'red' : !match.value ? 'gray' : match.confidence >= CONF_GREEN ? 'green' : 'yellow',
      });
      continue;
    }

    const isFileInput = element instanceof HTMLInputElement && element.type === 'file';
    const isCheckboxInput = isChoice(element);
    let finalState: FieldFinalState;

    if (match.confidence >= CONF_FILL && match.value) {
      // Confident match with profile data → fill and highlight.
      let filled = true;
      if (!ownedElements.includes(element)) ownedElements.push(element);
      if (isFileInput) {
        const fileData = profile.documents?.cv?.file;
        // Scanner gating means fileData should always be present here, but
        // guard defensively — if reconstruction fails, skip without counting.
        filled = fileData && match.fieldPath === 'documents.cv.file' ? await fillFileField(element as HTMLInputElement, fileData) : false;
      } else if (isCheckboxInput) {
        // matchCurrentEducationCheckboxes only ever produces a checkbox match
        // when the underlying entry is current — .value on a checkbox never
        // affects its checked state, so this needs its own dispatch.
        filled = fillCheckboxInput(element) !== false;
      } else {
        const beforeFill = getFieldValue(element);
        filled = (await fillField(element, match.value, () => isActive() && (mode !== 'merge' || getFieldValue(element) === beforeFill))) !== false;
      }

      if (!isActive()) return { ...EMPTY_AUTOFILL_RESULT };
      if (!filled) {
        record.rule.outcome = 'failed';
        record.outcome = 'failed';
        record.reason = 'fill_failed';
        ownedElements.splice(ownedElements.indexOf(element), 1);
        // Reconstruction failed (corrupt base64, etc.). Log already emitted by
        // fillFileField; silently skip this element so the rest of the run
        // continues uninterrupted.
        debugMapping.push({
          fieldId: debugFieldId, matchLayer: match.matchLayer, confidence: match.confidence,
          profilePath: match.fieldPath, finalState: 'gray',
        });
        if (!isFileInput && !isCheckboxInput && !match.ruleBlocked) {
          applyHighlight(element, 0);
          editableFields.push({element,state:'lowConfidence'});
          aiTextCandidates.push({type:'text',element,signals,originalState:'lowConfidence',debugFieldId});
        }
        continue;
      }

      applyHighlight(element, match.confidence); // green >=CONF_GREEN, yellow CONF_FILL–0.84
      record.rule.outcome = 'filled';
      record.outcome = match.confidence >= CONF_GREEN ? 'high_confidence' : 'review';
      record.source = 'rules';

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
          aiTextCandidates.push({ type: 'text', element, signals, originalState: 'needReview', debugFieldId });
        }
        finalState = 'yellow';
      }

    } else if (match.confidence < CONF_FILL) {
      record.rule.outcome = 'not_matched';
      record.outcome = 'not_matched';
      // Low or no confidence — red highlight; left for manual resolution.
      applyHighlight(element, 0);
      result.lowConfidence++;
      if (!isFileInput && !isCheckboxInput) editableFields.push({ element, state: 'lowConfidence' });
      if (!isFileInput && !isCheckboxInput && !match.ruleBlocked) {
        aiTextCandidates.push({ type: 'text', element, signals, originalState: 'lowConfidence', debugFieldId });
      }
      finalState = 'red';

    } else {
      record.rule.outcome = 'missing_data';
      record.outcome = 'missing_data';
      // confidence >= 0.60 but profile value is empty — nothing to write.
      // Mark the missing value with a neutral tint, using the same opacity as other statuses.
      applyMissingDataHighlight(element);
      result.noData++;
      if (!isFileInput && !isCheckboxInput) {
        editableFields.push({ element, state: 'noData' });
        // Track in the noData registry so silent re-fill on tab refocus can
        // re-resolve this field's profile path once the user updates it.
        // match.fieldPath is non-null when confidence >= 0.60 (only the
        // "no signal matched" branch leaves it null, and that takes the
        // lowConfidence path above), but check explicitly for type safety.
        if (match.fieldPath) {
          noDataFields.push({ element, fieldPath: match.fieldPath });
          aiTextCandidates.push({ type: 'text', element, signals, originalState: 'noData', debugFieldId });
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
  const aiStates = new Map<HTMLElement, 'green' | 'yellow'>();
  let aiStatus: AIAutofillStatus | undefined;
  const aiRan = await runAIAutofill(aiTextCandidates, profile, result, ownedElements, debugAI, {
    mode, isActive, signal: abortSignal, formFields: matchesToFill.map(match => match.signals), fieldRecords, radioGroups: pendingRadioGroups, checkboxGroups: pendingCheckboxGroups,
    isProfileCurrent: async () => {
      const current = await getProfile();
      if (JSON.stringify(current) === JSON.stringify(profile)) return true;
      cancelAutofillRun();
      return false;
    },
    onTextFilled: (element, state) => {
      aiStates.set(element, state);
      const record = fieldRecords.get(element);
      if (record) {
        record.ai.outcome = record.rule.outcome === 'filled' ? 'refined' : 'filled';
        record.outcome = state === 'green' ? 'high_confidence' : 'review';
        record.source = 'ai';
      }
    },
    onStatus: status => { aiStatus = status; },
  });
  if (!isActive()) return { ...EMPTY_AUTOFILL_RESULT };
  for (const field of editableFields) {
    if (aiStates.get(field.element) === 'yellow') field.state = 'needReview';
  }
  noDataFields = noDataFields.filter((entry) => !aiStates.has(entry.element));
  if (noDataFields.length === 0) teardownVisibilityListener();
  result.aiStatus = aiStatus ?? (aiRan ? 'not_needed' : 'unavailable');
  if (fillLog) {
    fillLog.aiStatus = result.aiStatus;
    fillLog.status = 'completed';
    fillLog.completedAt = Date.now();
    syncFillLogResult(result);
  }

  // Strip pre-AI entries for elements AI confirmed green. Without this, an
  // AI-filled green field would still get a blur watcher for its stale
  // pre-AI state (yellow/red/gray), causing incorrect count updates if the
  // user edits it further. AI's high-confidence decision is final; the field
  // should behave like any rule-pipeline green.
  if ([...aiStates.values()].includes('green')) {
    const filteredEditableFields = editableFields.filter((ef) => aiStates.get(ef.element) !== 'green');
    editableFields.length = 0;
    editableFields.push(...filteredEditableFields);
  }

  // Finalise debug session — scanner was seeded in scanAutofill; fill in the rest.
  if (debugSession) {
    debugSession.mapping   = debugMapping;
    debugSession.ai        = debugAI;
    debugSession.aiSkipped = !aiRan;
    debugSession.aiStatus = result.aiStatus;
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

  attachReportWatchers();
  attachEditWatchers(editableFields, result, domain, profile);

  return result;
}

