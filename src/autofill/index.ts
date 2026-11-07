import { fieldDomain } from './ruleContext';
import { resolveRuleValue, ruleValuePath } from './ruleValue';
import { readFieldValue as getFieldValue } from './fieldValue';
import {
  getProfile,
  getLearnedMappings,
  getLearningContext,
  repairLearnedMappings,
} from '../utils/storage';
import { learnedRepairField } from '../utils/learnedMappingRepair';
import { CONF_FILL, CONF_GREEN, CONF_CONFIRMED, CONF_DICT_EXACT } from './constants';
import { scanForm, isChoiceGroupAvailable } from './scanner';
import { isChoice, isChoiceChecked, isControlAvailable } from './dom';
import { extractSignals, bestLabel } from './signals';
import type { FieldSignals } from './signals';
import { mapField } from './mapper';
import type { FieldMatch } from './mapper';
import { adjustPhoneMatches } from './phoneResolution';
import { adjustLanguageMatches } from './languageResolution';
import { adjustEducationMatches, matchCurrentEducationCheckboxes } from './educationResolution';
import {
  adjustWorkHistoryMatches,
  matchCurrentWorkHistoryCheckboxes,
} from './workHistoryResolution';
import { adjustSalaryMatches } from './salaryResolution';
import { fillField, fillFileField, fillCheckboxInput, resetDropdownBudget } from './filler';
import { isOwnWriteEvent, getWriteConfidence, resetWriteSession, undoWrites } from './writeSession';
import { multiSelectValues } from './ruleValue';
import {
  applyHighlight,
  applyMissingDataHighlight,
  clearMissingDataHighlights,
  clearElementHighlight,
  clearHighlights,
} from './highlighter';
import { confirmFieldFeedback } from './fieldFeedback';
import { watchLearning } from './learning';
import { runAIAutofill } from './ai';
import { AUTOFILL_ERROR } from './errorCodes';
import type { AITextCandidate, AIAutofillStatus } from './ai';
import { summarizeFillFields, safeFormUrl } from './fillLog';
import { requiredField, reportTitle } from '@/src/fill-log/fieldMetadata';
import type { FillLogField, FrameFillLog, LearnedCheck } from './fillLog';
import type { RadioGroup, CheckboxGroup } from './scanner';
import { isConsentGroup } from './consent';
import { aiQuestionIdentity } from './aiSafety';
import { publishFillLog } from '@/src/fill-log/retention';

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

// Controls used by this fill and its edit watchers. writeSession owns the
// accepted-write snapshots for Undo; manual edits do not grant Undo ownership.
let sessionElements: HTMLElement[] = [];
let sessionGeneration = 0;
let sessionAbort = new AbortController();
let removeProfileWatcher = () => {};
let removeLearningWatchers = () => {};
let pendingCancelled = false;
let cancelledRunLog: FrameFillLog | null = null;
let completedProfileId: string | null = null;

function invalidateSession(): void {
  removeLearningWatchers();
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
    return elements.flatMap((e, index) => (isChoiceChecked(e) ? [String(index)] : [])).join(',');
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
}

function refreshTrackedField(element: HTMLElement): void {
  const record = fieldRecords.get(element);
  if (!record || record.outcome === 'excluded' || fillLog?.status !== 'completed') return;
  const elements = recordElements.get(record) ?? [];
  if (elements.some((e) => writingElements.has(e))) return;
  const value = recordValue(record);
  if (recordValues.get(record) === value) return;
  recordValues.set(record, value);
  record.outcome = value ? 'manual' : 'not_matched';
  record.source = 'manual';
  record.reason = value ? 'manual_edit' : 'manual_clear';
  if (value) for (const item of elements) confirmFieldFeedback(item);
  if (!value) for (const item of elements) clearElementHighlight(item);
  syncFillLogResult();
  if (fillLog) fillLog.modifiedAt = Date.now();
  void publishFillLog(fillLog, completedProfileId);
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
  removeReportWatchers = () => {
    removals.forEach((remove) => remove());
  };
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
  confidence: number;
  identity: string;
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

// Attaches a blur listener to each non-green field. On blur, if the value
// changed since autofill ran, the field transitions to No Review (green) and
// the popup counts are updated.
//
// Learning is independently observed across all tiers by watchLearning().
function attachEditWatchers(fields: EditableField[], result: AutofillResult): void {
  for (const { element, state } of fields) {
    const prev = editWatchers.get(element);
    if (prev) element.removeEventListener('blur', prev);

    const valueAtAttach  = getFieldValue(element);
    const capturedResult = result;

    const handler = () => {
      if (isOwnWriteEvent()) return;
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

// Scan results held between AUTOFILL_SCAN and AUTOFILL_FILL messages.
interface PendingMatch {
  element:          HTMLElement;
  signals:          FieldSignals;
  match:            FieldMatch;
  hasExistingValue: boolean;
}
let pendingMatches: PendingMatch[] = [];

// Re-resolves every tracked noData field's profile path against a freshly-read
// profile. Filled fields retain their match/write confidence and leave the registry.
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
    watchRunProfile();
    const stopWatching = removeProfileWatcher;
    try {
      const profile = await getProfile();
      if (!profile || !isActive()) return;
      if (profile.id !== completedProfileId) {
        noDataFields = [];
        teardownVisibilityListener();
        return;
      }
      for (const entry of entries) {
        if (!isActive()) return;
        if (!noDataFields.includes(entry)) continue;
        const { element, fieldPath } = entry;
        if (entry.identity !== aiQuestionIdentity(element)) {
          noDataFields = noDataFields.filter(item => item !== entry);
          clearElementHighlight(element);
          continue;
        }
        if (!element.isConnected || getFieldValue(element).trim()) {
          noDataFields = noDataFields.filter((item) => item !== entry);
          continue;
        }
        const value = resolveRuleValue(profile, fieldPath, extractSignals(element));
        if (!value) continue;
        if (!sessionElements.includes(element)) sessionElements.push(element);
        writingElements.add(element);
        let filled: boolean | void;
        try { filled = await fillField(element, value, isActive); }
        finally { writingElements.delete(element); }
        if (!isActive()) return;
        if (!noDataFields.includes(entry)) continue; // a manual blur resolved it while awaiting
        if (filled === false) {
          const index = sessionElements.indexOf(element);
          if (index >= 0) sessionElements.splice(index, 1);
          continue;
        }
        const confidence = Math.min(entry.confidence, getWriteConfidence(element));
        const green = confidence >= CONF_GREEN;
        applyHighlight(element, confidence);
        const record = fieldRecords.get(element);
        if (record) {
          record.rule.outcome = 'filled';
          record.rule.confidence = confidence;
          record.outcome = green ? 'high_confidence' : 'review';
          record.source = 'rules';
          record.reason = 'profile_updated';
          recordValues.set(record, recordValue(record));
        }
        result.noData = Math.max(0, result.noData - 1);
        if (green) result.noReview++;
        else result.needReview++;
        noDataFields = noDataFields.filter((item) => item !== entry);
        const watcher = editWatchers.get(element);
        if (watcher) {
          element.removeEventListener('blur', watcher);
          editWatchers.delete(element);
        }
      }
      if (noDataFields.length === 0) teardownVisibilityListener();
      syncFillLogResult(result);
      if (fillLog) fillLog.modifiedAt = Date.now();
      await publishFillLog(fillLog, completedProfileId);
    } catch {
      // Keep unresolved entries for the next visibility event.
    } finally {
      stopWatching();
    }
  })();
  refillInFlight = task;
  void task.finally(() => { if (refillInFlight === task) refillInFlight = null; });
  return task;
}

export async function undoAutofill(): Promise<boolean> {
  const reportProfileId = completedProfileId;
  getFillLog();
  removeReportWatchers();
  invalidateSession();
  cancelledRunLog = null;
  pendingCancelled = false;
  completedProfileId = null;
  const generation = sessionGeneration;
  refillInFlight = null;
  pendingReady = false;
  pendingMatches = [];
  noDataFields = [];
  teardownVisibilityListener();
  for (const element of new Set([...sessionElements, ...fieldRecords.keys()])) {
    const watcher = editWatchers.get(element);
    if (watcher) element.removeEventListener('blur', watcher);
    editWatchers.delete(element);
  }
  const outcome = await undoWrites(() => generation === sessionGeneration);
  if (generation !== sessionGeneration) return false;
  clearHighlights();
  if (outcome.success) {
    if (fillLog) fillLog.status = 'undone';
    sessionElements = [];
    lastResult = null;
  } else {
    completedProfileId = reportProfileId;
    for (const [record, elements] of recordElements) {
      if (elements.some((element) => outcome.remaining.has(element))) {
        record.outcome = 'review';
        for (const element of elements) applyHighlight(element, CONF_FILL);
      } else if (elements.some((element) => outcome.restored.has(element))) {
        record.outcome = recordValue(record) ? 'kept' : 'not_matched';
        record.source = null;
      }
      recordValues.set(record, recordValue(record));
    }
    syncFillLogResult();
    attachReportWatchers();
  }
  if (fillLog) fillLog.modifiedAt = Date.now();
  await publishFillLog(fillLog, reportProfileId);
  return outcome.success;
}

// Invalidate pending/async work without undoing already filled answers.
export function cancelAutofillRun(): void {
  pendingCancelled = true;
  cancelledRunLog = fillLog;
  invalidateSession();
  pendingReady = false;
  pendingMatches = [];
  noDataFields = [];
  teardownVisibilityListener();
}

// Phase 1: scan and map all fields; detect which matched fields already have values.
// Results are held in pendingMatches for executeAutofill().
export async function scanAutofill(
  runId: string = crypto.randomUUID(),
): Promise<AutofillScanResult> {
  pendingCancelled = false;
  cancelledRunLog = null;
  completedProfileId = null;
  removeReportWatchers();
  resetWriteSession();
  resetDropdownBudget();
  fieldRecords = new Map();
  recordElements = new Map();
  recordValues = new Map();
  pendingRadioGroups = [];
  pendingCheckboxGroups = [];
  fillLog = {
    version: 1,
    runId,
    startedAt: Date.now(),
    origin: location.origin,
    url: safeFormUrl(location.href),
    status: 'scanning',
    fields: [],
  };
  invalidateSession();
  sessionAbort = new AbortController();
  const generation = sessionGeneration;
  refillInFlight = null;
  pendingReady = false;
  noDataFields = [];
  teardownVisibilityListener();
  pendingMatches = [];
  sessionElements = [];
  lastResult      = null;

  const profile = await getProfile();
  if (generation !== sessionGeneration) return { preFilledCount: 0, totalMatched: 0 };
  if (!profile) {
    console.warn('[Job Buddy] Profile not found — skipping autofill');
    return { preFilledCount: 0, totalMatched: 0 };
  }

  watchRunProfile();
  let learnedMappings = await getLearnedMappings();
  if (generation !== sessionGeneration) return { preFilledCount: 0, totalMatched: 0 };
  const domain = fieldDomain();

  // File inputs are only relevant when the user actually has a CV file to
  // upload. Gating in the scanner keeps file inputs out of pendingMatches
  // entirely when no CV is saved, so they never contribute to result counters.
  const allowFileInputs = !!profile.documents?.cv?.file;
  const snapshot = scanForm({ allowFileInputs, scopeApplication: true });
  const fields = snapshot.fields;
  if (Object.keys(learnedMappings[domain] ?? {}).length) {
    const context = await getLearningContext(profile);
    if (context) {
      const evidence = fields
        .slice(0, 1000)
        .map((element) => learnedRepairField(snapshot.signals(element)));
      try {
        learnedMappings = await repairLearnedMappings(domain, evidence, context);
      } catch {
        // A failed write can retry on a later scan. Existing matching guards still apply.
      }
    }
    if (generation !== sessionGeneration) return { preFilledCount: 0, totalMatched: 0 };
  }

  let preFilledCount = 0;
  let totalMatched   = 0;
  const scanned = fields.map((element, i) => {
    const signals = snapshot.signals(element);
    const learned: LearnedCheck = { status: 'not_checked' };
    const match = mapField(signals, profile, learnedMappings, domain, (check) => Object.assign(learned, check));
    return {
      element,
      signals,
      match: { ...match, element },
      learned,
      recordId: `field_${String(i + 1).padStart(3, '0')}`,
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
  for (const { element, signals, match, learned, recordId } of scanned) {
    const record: FillLogField = {
      id: recordId,
      label: reportTitle(bestLabel(signals), 'text', fillLog!.fields.length + 1),
      required: requiredField([element], bestLabel(signals)),
      kind:
        element instanceof HTMLInputElement && element.type === 'file'
          ? 'file'
          : element instanceof HTMLSelectElement ||
              element.getAttribute('role') === 'combobox' ||
              element.getAttribute('aria-haspopup') === 'listbox'
            ? 'select'
            : 'text',
      rule: {
        outcome: 'not_applicable',
        ran: match.matchLayer !== 'learned' && !match.ruleBlocked,
        layer: match.matchLayer,
        confidence: match.confidence,
        matchConfidence: match.confidence,
        ...(match.fieldPath ? { profilePath: match.fieldPath } : {}),
      },
      learned: {
        ...learned,
        ...(learned.status === 'trusted' && match.fieldPath ? { profilePath: match.fieldPath } : {}),
      },
      ai: { outcome: 'not_sent' },
      outcome: 'not_matched',
      source: null,
    };
    fillLog!.fields.push(record);
    bindRecord(record, [element]);
  }
  for (const [kind, groups] of [
    ['radio', pendingRadioGroups],
    ['checkbox', checkboxGroups],
  ] as const) {
    groups.forEach((group, index) => {
      const excluded = !!group.isConsent || isConsentGroup(group);
      const record: FillLogField = {
        id: `${kind}_${index + 1}`,
        label: reportTitle(group.groupLabel || group.name, kind, index + 1),
        required: requiredField(
          group.options.map(option => option.element), group.groupLabel, group.question,
        ),
        kind,
        learned: { status: 'not_checked' },
        rule: { outcome: 'not_applicable', ran: false },
        ai: { outcome: 'not_sent' },
        outcome: excluded ? 'excluded' : 'not_matched',
        source: null,
        ...(excluded ? { reason: 'consent' as const } : {}),
      };
      fillLog!.fields.push(record);
      bindRecord(
        record,
        group.options.map((option) => option.element),
      );
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
    learned: { status: 'not_checked' } as LearnedCheck,
    signals: extractSignals(element),
    match: {
      fieldPath, element,
      confidence: CONF_DICT_EXACT,
      value:      'Yes',
      matchLayer: 'checkbox_status' as const,
    },
    recordId: `field_${String(fields.length + i + 1).padStart(3, '0')}`,
  }));
  scanned.push(...checkboxScanned);

  const prefilledRecords = new Set<FillLogField>();
  for (const group of [...pendingRadioGroups, ...checkboxGroups]) {
    if (!group.isConsent && !isConsentGroup(group)) for (const option of group.options) if (isChoiceChecked(option.element)) prefilledRecords.add(fieldRecords.get(option.element)!);
  }
  scanned.forEach(({ element, signals, match }) => {
    Object.assign(fieldRecords.get(element)!.rule, {
      ran: match.matchLayer !== 'learned' && !('ruleBlocked' in match && match.ruleBlocked),
      layer: match.matchLayer,
      confidence: match.confidence,
      matchConfidence: match.confidence,
      ...(match.fieldPath ? { profilePath: match.fieldPath } : {}),
    });
    const hasExistingValue = getFieldValue(element).trim() !== '';
    if (hasExistingValue) prefilledRecords.add(fieldRecords.get(element)!);

    if (match.confidence >= CONF_FILL && match.value) {
      totalMatched++;
    }

    pendingMatches.push({ element, signals, match, hasExistingValue });
  });

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
  if (!pendingReady && pendingCancelled) throw new Error(AUTOFILL_ERROR.failed);
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
  const runLog = fillLog;
  const abortSignal = sessionAbort.signal;
  const isActive = () => generation === sessionGeneration;
  const profile = await getProfile();
  if (!isActive()) throw new Error(AUTOFILL_ERROR.failed);
  if (!profile) throw new Error(AUTOFILL_ERROR.failed);

  const domain = fieldDomain();
  const learningContext = await getLearningContext(profile).catch(() => null);
  if (!isActive()) throw new Error(AUTOFILL_ERROR.failed);

  const result: AutofillResult = {
    noReview: 0, needReview: 0, lowConfidence: 0, noData: 0,
    totalScanned: matchesToFill.length,
  };
  const interrupted = (): AutofillResult => {
    // Keep accepted writes and their Undo path; never overwrite a newer scan or Undo.
    if (runLog && runLog === fillLog && cancelledRunLog === runLog &&
      runLog.fields.some(record => (record.source === 'rules' || record.source === 'ai') &&
        ['high_confidence','review'].includes(record.outcome))) {
      runLog.status = 'completed';
      runLog.completedAt = Date.now();
      runLog.aiStatus = 'unavailable';
      result.aiStatus = 'unavailable';
      lastResult = result;
      completedProfileId = profile.id;
      syncFillLogResult(result);
      attachReportWatchers();
      void publishFillLog(runLog, completedProfileId);
      return result;
    }
    throw new Error(AUTOFILL_ERROR.failed);
  };
  const editableFields: EditableField[] = [];
  const aiTextCandidates: AITextCandidate[] = [];
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

  for (const { element, signals, match, hasExistingValue } of matchesToFill) {
    if (!isActive()) return interrupted();
    const record = fieldRecords.get(element)!;
    const choiceGroup = isChoice(element)
      ? pendingCheckboxGroups.find((group) =>
          group.options.some((option) => option.element === element),
        )
      : undefined;
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
    Object.assign(record.rule, {
      layer: match.matchLayer,
      confidence: match.confidence,
      matchConfidence: match.confidence,
      ...(match.fieldPath ? { profilePath: match.fieldPath } : {}),
    });
    // Merge mode: skip pre-filled fields that would otherwise be overwritten.
    if (mode === 'merge' && (record.outcome === 'kept' || hasExistingValue || getFieldValue(element).trim() !== '')) {
      record.outcome = 'kept';
      record.rule.outcome = 'kept';
      record.reason = 'existing_value';
      continue;
    }

    const isFileInput = element instanceof HTMLInputElement && element.type === 'file';
    const isCheckboxInput = isChoice(element);
    // File and checkbox inputs are never edit-watched or sent to the text AI pass.
    const textual = !isFileInput && !isCheckboxInput;
    const addTextCandidate = (originalState: AITextCandidate['originalState']) =>
      aiTextCandidates.push({ type: 'text', element, signals, originalState });

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
        filled = (await fillCheckboxInput(element)) !== false;
      } else {
        const value = element instanceof HTMLSelectElement && element.multiple ? multiSelectValues(profile, match.fieldPath, element) : match.value;
        filled = value !== null && (await fillField(element, value, isActive)) !== false;
      }

      if (!isActive()) return interrupted();
      if (!filled) {
        record.rule.outcome = 'failed';
        record.outcome = 'failed';
        record.reason = 'fill_failed';
        ownedElements.splice(ownedElements.indexOf(element), 1);
        // Reconstruction failed (corrupt base64, etc.). Log already emitted by
        // fillFileField; silently skip this element so the rest of the run
        // continues uninterrupted.
        if (textual && !match.ruleBlocked) {
          applyHighlight(element, 0);
          editableFields.push({ element, state: 'lowConfidence' });
          addTextCandidate('lowConfidence');
        }
        continue;
      }

      const writtenConfidence = Math.min(match.confidence, getWriteConfidence(element));
      applyHighlight(element, writtenConfidence); // green >=CONF_GREEN, yellow CONF_FILL–0.84
      record.rule.outcome = 'filled';
      record.rule.confidence = writtenConfidence;
      record.outcome = writtenConfidence >= CONF_GREEN ? 'high_confidence' : 'review';
      record.source = 'rules';

      if (writtenConfidence >= CONF_GREEN) {
        result.noReview++;
      } else {
        result.needReview++;
        // File/checkbox inputs are excluded from edit-watching — file
        // selection and checkbox state are handled silently by Auto Fill,
        // not manual typing.
        if (textual) {
          editableFields.push({ element, state: 'needReview' });
          addTextCandidate('needReview');
        }
      }
    } else if (match.confidence < CONF_FILL) {
      record.rule.outcome = 'not_matched';
      record.outcome = 'not_matched';
      // Low or no confidence — red highlight; left for manual resolution.
      applyHighlight(element, 0);
      result.lowConfidence++;
      if (textual) editableFields.push({ element, state: 'lowConfidence' });
      if (textual && !match.ruleBlocked) addTextCandidate('lowConfidence');
    } else {
      record.rule.outcome = 'missing_data';
      record.outcome = 'missing_data';
      // confidence >= 0.60 but profile value is empty — nothing to write.
      // Mark the missing value with a neutral tint, using the same opacity as other statuses.
      applyMissingDataHighlight(element);
      result.noData++;
      if (textual) {
        editableFields.push({ element, state: 'noData' });
        // Track in the noData registry so silent re-fill on tab refocus can
        // re-resolve this field's profile path once the user updates it.
        // match.fieldPath is non-null when confidence >= 0.60 (only the
        // "no signal matched" branch leaves it null, and that takes the
        // lowConfidence path above), but check explicitly for type safety.
        if (match.fieldPath) {
          noDataFields.push({ element, fieldPath: match.fieldPath, confidence: match.confidence, identity: aiQuestionIdentity(element) });
          addTextCandidate('noData');
        }
      }
    }
  }

  pendingMatches = [];

  // Register the visibilitychange listener only when we actually have noData
  // fields to watch. Listener is idempotent and is torn down on undo or when
  // all entries are resolved.
  if (noDataFields.length > 0) ensureVisibilityListener();

  const aiStates = new Map<HTMLElement, 'green' | 'yellow'>();
  let aiStatus: AIAutofillStatus | undefined;
  const aiRan = await runAIAutofill(aiTextCandidates, profile, result, ownedElements, {
    mode,
    isActive,
    signal: abortSignal,
    formFields: matchesToFill.map((match) => match.signals),
    fieldRecords,
    radioGroups: pendingRadioGroups,
    checkboxGroups: pendingCheckboxGroups,
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
    onStatus: (status) => {
      aiStatus = status;
    },
  });
  if (!isActive()) return interrupted();
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
    const filteredEditableFields = editableFields.filter(
      (ef) => aiStates.get(ef.element) !== 'green',
    );
    editableFields.length = 0;
    editableFields.push(...filteredEditableFields);
  }

  // Store before attaching edit watchers — the result object is mutated in
  // place by those callbacks, so the reference remains accurate after they run.
  lastResult = result;
  completedProfileId = profile.id;

  attachReportWatchers();
  attachEditWatchers(editableFields, result);
  if (learningContext)
    removeLearningWatchers = watchLearning(
      matchesToFill
        .filter(
          ({ element }) =>
            !isChoice(element) && !(element instanceof HTMLInputElement && element.type === 'file'),
        )
        .map(({ element }) => element),
      profile,
      domain,
      learningContext,
      (element) => {
        noDataFields = noDataFields.filter((entry) => entry.element !== element);
        if (!noDataFields.length) teardownVisibilityListener();
      },
    );

  await publishFillLog(fillLog, completedProfileId);
  return result;
}
