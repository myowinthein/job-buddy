import { isChoiceChecked, isControlAvailable } from './dom';
import { getWriteConfidence } from './writeSession';
import { readFieldValue } from './fieldValue';
import { isConsentGroup } from './consent';
import type { Profile } from '../types/profile';
import type { FieldSignals } from './signals';
import { bestLabel, extractSignals } from './signals';
import { resolveRuleValue, ruleValuePath } from './ruleValue';
import { allowedAIPath, exactAIOption, aiQuestionIdentity, aiQuestionAllowed } from './aiSafety';
import { sectionFamily, scopeRoot, ruleQuestionBlocked } from './ruleContext';
import { resolveFieldsWithAI } from '../resume-ai/gemini';
import type { AIFieldPayload, AIFieldResponse, AIOptionPayload } from '../resume-ai/types';
import { toGeminiModel } from '../resume-ai/types';
import { scanRadioGroups, scanCheckboxGroups, isChoiceGroupAvailable, questionLabel } from './scanner';
import type { RadioGroup, CheckboxGroup } from './scanner';
import { fillField, fillRadioInput, fillCheckboxInput } from './filler';
import { applyHighlight, applyMissingDataHighlight } from './highlighter';
import { CONF_CONFIRMED, CONF_AI_YELLOW, CONF_GREEN, CONF_NO_MATCH } from './constants';
import { getGeminiApiKey, getGeminiModel } from '../utils/storage';
import { isSkippableOption } from './normalizer';
import type { AutofillResult } from './fillResult';
import type { AIOutcome, FillLogField } from './fillLog';

// Mutable result shape — the subset of AutofillResult's fields that AI updates
type MutableResult = Pick<AutofillResult, 'noReview' | 'needReview' | 'lowConfidence' | 'noData'>;

export interface AITextCandidate {
  type:             'text';
  element:          HTMLElement;
  signals:          FieldSignals;
  originalState:    'needReview' | 'lowConfidence' | 'noData';
}

// Extracts real (non-placeholder, non-disabled) options from a select element.
// Exported for testing only.
export function extractSelectOptions(select: HTMLSelectElement): AIOptionPayload[] {
  const opts: AIOptionPayload[] = [];
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    if (isSkippableOption(opt)) continue;
    opts.push({ label: opt.text.trim(), value: opt.value });
  }
  return opts;
}

export type AIAutofillStatus = 'not_needed' | 'succeeded' | 'unavailable';

export interface AIAutofillOptions {
  mode?: 'merge' | 'overwrite';
  isActive?: () => boolean;
  signal?: AbortSignal;
  isProfileCurrent?: () => Promise<boolean>;
  formFields?: FieldSignals[];
  onTextFilled?: (element: HTMLElement, state: 'green' | 'yellow') => void;
  onStatus?: (status: AIAutofillStatus) => void;
  fieldRecords?: Map<HTMLElement, FillLogField>;
  radioGroups?: RadioGroup[];
  checkboxGroups?: CheckboxGroup[];
}

// Returns legacy setup availability. onStatus reports the actual request outcome.
// Mutates `result` and `sessionElements` in-place.
//
// All non-green candidates are eligible, including rule-filled yellow fields.
// Actual AI outcomes are reported so the caller can update edit/refill state.
export async function runAIAutofill(
  textCandidates: AITextCandidate[],
  profile: Profile,
  result: MutableResult,
  sessionElements: HTMLElement[],
  options: AIAutofillOptions = {},
): Promise<boolean> {
  let apiKey: string | null, storedModel: string | null;
  try {
    [apiKey, storedModel] = await Promise.all([getGeminiApiKey(), getGeminiModel()]);
  } catch {
    options.onStatus?.('unavailable');
    return false;
  } // Storage failures must leave rule-based fills intact.
  const isActive = () => !options.signal?.aborted && (options.isActive?.() ?? true);
  if (!isActive() || !apiKey || !storedModel) {
    options.onStatus?.('unavailable');
    return false;
  }
  const model = toGeminiModel(storedModel);

  const eligible = (group: RadioGroup | CheckboxGroup) =>
    isChoiceGroupAvailable(group) &&
    !ruleQuestionBlocked({ ...extractSignals(group.options[0].element),
      label: questionLabel(group.options[0].element) || group.groupLabel }) &&
    !group.isConsent &&
    !isConsentGroup(group) &&
    !isConsentGroup({ ...group, groupLabel: questionLabel(group.options[0].element) || group.groupLabel }) &&
    !(options.mode === 'merge' && group.options.some((option) => isChoiceChecked(option.element))) &&
    !group.options.some(option => {
      const record = options.fieldRecords?.get(option.element);
      return record && ['high_confidence', 'kept', 'excluded'].includes(record.outcome);
    });
  const radioGroups = (options.radioGroups ?? scanRadioGroups()).filter(eligible);
  const checkboxGroups = (options.checkboxGroups ?? scanCheckboxGroups()).filter(eligible);

  type Candidate =
    | AITextCandidate
    | { type: 'radio'; group: RadioGroup }
    | { type: 'checkbox'; group: CheckboxGroup };

  const candidates: Candidate[] = [
    ...textCandidates.filter(candidate => isControlAvailable(candidate.element) && aiQuestionAllowed(candidate.element)),
    ...radioGroups.map((g) => ({ type: 'radio' as const, group: g })),
    ...checkboxGroups.map((g) => ({ type: 'checkbox' as const, group: g })),
  ];

  if (candidates.length === 0) {
    options.onStatus?.('not_needed');
    return true;
  }

  const candidateMap = new Map<string, Candidate>();
  const candidateRecords = new Map<string, FillLogField>();
  const identified = (items: AIOptionPayload[]) => items.map((item, i) => ({ ...item, id: `option_${String(i + 1).padStart(3, '0')}` }));
  const payload: AIFieldPayload[] = candidates.map((c, i) => {
    const fieldId = `field_${String(i + 1).padStart(3, '0')}`;
    if (c.type === 'text' && options.formFields) c.signals = extractSignals(c.element);
    candidateMap.set(fieldId, c);
    const record = options.fieldRecords?.get(c.type === 'text' ? c.element : c.group.options[0].element);
    if (record) {
      record.ai.outcome = 'sent';
      candidateRecords.set(fieldId, record);
    }

    if (c.type === 'text') {
      const s = c.signals;
      const baseLabel = bestLabel(s);
      const family = sectionFamily(c.element);
      const repeats = (options.formFields ?? textCandidates.map(candidate => candidate.signals)).filter(other =>
        bestLabel(other) === baseLabel && sectionFamily(other.element) === family && scopeRoot(other.element) === scopeRoot(c.element));
      const native = c.element instanceof HTMLInputElement ? c.element : undefined;
      const base = {
        fieldId,
        visibleLabel: [s.label, s.ariaLabel, s.placeholder].filter(Boolean).join(' '),
        inputType: s.type,
        ...(family && { section: family }),
        ...(repeats.length > 1 && { entryIndex: repeats.findIndex(other => other.element === c.element) }),
        ...(s.autocomplete && { autocomplete: s.autocomplete }),
        ...(native && { constraints: { min: native.min || undefined, max: native.max || undefined, step: native.step || undefined, pattern: native.pattern || undefined, maxLength: native.maxLength >= 0 ? native.maxLength : undefined } }),
        label: baseLabel,
        ...(s.placeholder && { placeholder: s.placeholder }),
        ...(s.name && { name: s.name }),
        ...(s.nearbyText && { nearbyText: s.nearbyText }),
      };
      if (c.element instanceof HTMLSelectElement) {
        const options = identified(extractSelectOptions(c.element));
        return { ...base, type: 'select' as const, multiple: c.element.multiple, ...(options.length > 0 && { options }) };
      }
      // ARIA combobox/listbox: options are not available at scan time (dropdown
      // is closed). Send as 'select' so Gemini returns a profilePath; the fill
      // phase resolves the value and uses click-based option matching.
      const ariaRole = c.element.getAttribute('role');
      const ariaPopup = c.element.getAttribute('aria-haspopup');
      if (ariaRole === 'combobox' || ariaPopup === 'listbox') {
        return { ...base, type: 'select' as const };
      }
      return { ...base, type: 'text' as const };
    }
    return {
      fieldId,
      type: c.type,
      label: questionLabel(c.group.options[0].element) || c.group.groupLabel,
      visibleLabel: questionLabel(c.group.options[0].element),
      options: identified(c.group.options.map((o) => ({ label: o.label, value: o.value }))),
      section: sectionFamily(c.group.options[0].element),
    };
  });

  const valuesAtRequest = new Map(
    textCandidates.map((candidate) => [candidate.element, readFieldValue(candidate.element)]),
  );
  const identities = new Map<HTMLElement, string>();
  const choices = new Map<HTMLElement, boolean>();
  for (const candidate of candidates) {
    const elements = candidate.type === 'text' ? [candidate.element] : candidate.group.options.map(option => option.element);
    for (const element of elements) {
      identities.set(element, aiQuestionIdentity(element));
      if (candidate.type !== 'text') choices.set(element, isChoiceChecked(element));
    }
  }
  const unchanged = (element: HTMLElement) => isActive() && isControlAvailable(element) && identities.get(element) === aiQuestionIdentity(element);
  let requestIncomplete = false;
  let responses: AIFieldResponse[];
  try {
    responses = await resolveFieldsWithAI(apiKey, model, payload, profile as object, { signal: options.signal, isActive, onUnavailable: () => { requestIncomplete = true; } });
  } catch {
    for (const record of candidateRecords.values()) {
      record.ai.outcome = isActive() ? 'failed' : 'skipped';
      if (!isActive()) record.ai.skipReason = 'cancelled';
    }
    options.onStatus?.('unavailable');
    return true; // Keep the legacy availability result; report failure separately.
  }

  try {
    const activeBeforeCheck = isActive();
    if (!activeBeforeCheck || (options.isProfileCurrent && !await options.isProfileCurrent())) {
      for (const record of candidateRecords.values()) {
        record.ai.outcome = 'skipped';
        record.ai.skipReason = activeBeforeCheck ? 'profile_changed' : 'cancelled';
      }
      return true;
    }
  } catch {
    for (const record of candidateRecords.values()) record.ai.outcome = 'failed';
    options.onStatus?.('unavailable');
    return true;
  }

  // Records the AI outcome on the field's report record.
  const recordAIOutcome = (
    candidate: Candidate,
    fieldId: string,
    aiConfidence: 'high' | 'low' | null,
    finalState: 'green' | 'yellow' | 'unchanged',
    aiOutcome?: AIOutcome,
  ) => {
    const record = candidateRecords.get(fieldId);
    if (!record) return;
    record.ai.confidence = aiConfidence;
    if (finalState === 'unchanged') {
      record.ai.outcome = aiOutcome ?? 'not_matched';
      if (aiOutcome === 'missing_data' && record.rule.outcome !== 'filled') record.outcome = 'missing_data';
      if (aiOutcome === 'fill_failed' && record.rule.outcome !== 'filled') { record.outcome = 'failed'; record.reason = 'fill_failed'; }
    } else {
      record.ai.outcome = record.rule.outcome === 'filled' ? 'refined' : 'filled';
      record.ai.optionReview = candidate.type === 'text' && getWriteConfidence(candidate.element) < CONF_GREEN;
      record.outcome = finalState === 'green' ? 'high_confidence' : 'review';
      record.source = 'ai';
    }
  };

  const handled = new Set<string>();
  for (const resp of responses) {
    if (!isActive()) break;
    if (handled.has(resp.fieldId)) continue;
    handled.add(resp.fieldId);
    const candidate = candidateMap.get(resp.fieldId);
    if (!candidate) continue;
    if (candidate.type === 'text' && !isControlAvailable(candidate.element)) {
      const record = candidateRecords.get(resp.fieldId);
      if (record) { record.ai.outcome = 'fill_failed'; record.outcome = 'failed'; record.reason = 'fill_failed'; }
      continue;
    }
    const tracked = candidateRecords.get(resp.fieldId);
    const field = payload.find(item => item.fieldId === resp.fieldId)!;
    const elements = candidate.type === 'text' ? [candidate.element] : candidate.group.options.map(option => option.element);
    if (elements.some(element => !unchanged(element) || (candidate.type !== 'text' && isChoiceChecked(element) !== choices.get(element)))) {
      if (tracked) {
        const hasValue = candidate.type === 'text' ? !!readFieldValue(candidate.element).trim() : candidate.group.options.some(option => isChoiceChecked(option.element));
        tracked.ai.outcome = 'skipped'; tracked.ai.skipReason = 'answer_changed'; tracked.outcome = hasValue ? 'manual' : 'not_matched';
        tracked.source = hasValue ? 'manual' : null; tracked.reason = 'value_changed';
      }
      continue;
    }
    // Ignore malformed/unsafe answer shapes before touching the DOM.
    if ((resp.profilePath && !allowedAIPath(profile, field, resp.profilePath)) ||
        (candidate.type === 'text' && (resp.selectedOptions != null && !(candidate.element instanceof HTMLSelectElement && candidate.element.multiple) || (!(candidate.element instanceof HTMLSelectElement) && resp.selectedOption != null))) ||
        (candidate.type !== 'text' && resp.profilePath != null) ||
        (candidate.type === 'radio' && resp.selectedOptions != null) ||
        (candidate.type === 'checkbox' && resp.selectedOption != null)) {
      recordAIOutcome(candidate, resp.fieldId, resp.confidence, 'unchanged');
      continue;
    }
    if (tracked && resp.profilePath) tracked.ai.profilePath = resp.profilePath;
    if (candidate.type !== 'text' && !eligible(candidate.group)) {
      if (tracked) {
        const available = isChoiceGroupAvailable(candidate.group);
        tracked.ai.outcome = available ? 'skipped' : 'fill_failed';
        if (available) tracked.ai.skipReason = 'answer_changed';
        tracked.outcome = available ? 'manual' : 'failed';
        tracked.source = available ? 'manual' : null;
        tracked.reason = available ? 'value_changed' : 'fill_failed';
      }
      continue;
    }
    const fieldId = resp.fieldId;

    if (resp.confidence === null) {
      recordAIOutcome(candidate, fieldId, null, 'unchanged');
      continue;
    }

    let isHigh = resp.confidence === 'high';
    let confScore = isHigh ? CONF_CONFIRMED : CONF_AI_YELLOW;

    if (candidate.type === 'text') {
      const isSelect = candidate.element instanceof HTMLSelectElement;
      // For select elements, Gemini may return selectedOption (chosen from the options list)
      // instead of or in addition to profilePath. Prefer selectedOption for selects.
      const hasActionable = resp.profilePath || (isSelect && (resp.selectedOption || resp.selectedOptions));
      if (!hasActionable) {
        recordAIOutcome(candidate, fieldId, resp.confidence, 'unchanged');
        continue;
      }

      let value: string | string[] | null = null;
      let optionUnavailable = false;
      if (candidate.element instanceof HTMLSelectElement && candidate.element.multiple && resp.selectedOptions) {
        const selected = resp.selectedOptions.map(answer => exactAIOption(field.options ?? [], answer));
        if (selected.some(option => !option) || selected.some(option => field.options!.filter(item => item.value === option!.value).length !== 1)) {
          recordAIOutcome(candidate, fieldId, resp.confidence, 'unchanged'); continue;
        }
        value = [...new Set(selected.map(option => option!.value))];
      } else if (isSelect && resp.selectedOption) {
        const selected = exactAIOption(field.options ?? [], resp.selectedOption);
        // Duplicate native values cannot identify a particular option reliably.
        if (!selected || field.options!.filter(option => option.value === selected.value).length !== 1) {
          recordAIOutcome(candidate, fieldId, resp.confidence, 'unchanged'); continue;
        }
        value = [selected.value];
      } else if (resp.profilePath) {
        const signals = extractSignals(candidate.element);
        const path = ruleValuePath(profile, resp.profilePath, signals);
        value = allowedAIPath(profile, field, path) ? resolveRuleValue(profile, /^workAuthorization(?:\.\d+(?:\.status)?)?$/.test(path) ? 'workAuthorization' : path, signals) : '';
        if (isSelect && value) {
          const selected = exactAIOption(field.options ?? [], value);
          optionUnavailable = !selected || field.options!.filter(option => option.value === selected.value).length !== 1;
          value = selected && field.options!.filter(option => option.value === selected.value).length === 1 ? [selected.value] : '';
        }
      }

      const liveValue = readFieldValue(candidate.element);
      if (liveValue !== valuesAtRequest.get(candidate.element)) {
        if (tracked) { tracked.ai.outcome = 'skipped'; tracked.ai.skipReason = 'answer_changed'; tracked.outcome = liveValue.trim() ? 'manual' : 'not_matched'; tracked.source = 'manual'; tracked.reason = 'value_changed'; }
        continue;
      }
      if (!value) {
        if (!liveValue.trim()) {
          if (optionUnavailable) applyHighlight(candidate.element, CONF_NO_MATCH);
          else applyMissingDataHighlight(candidate.element);
        }
        recordAIOutcome(candidate, fieldId, resp.confidence, 'unchanged', optionUnavailable ? 'fill_failed' : 'missing_data');
        if (optionUnavailable && tracked && tracked.rule.outcome !== 'filled') tracked.reason = 'option_unavailable';
        continue;
      }

      if (options.mode === 'merge' && candidate.originalState !== 'needReview' && liveValue.trim())
        continue;
      const alreadyOwned = sessionElements.includes(candidate.element);
      if (!alreadyOwned) sessionElements.push(candidate.element);
      const filled = await fillField(
        candidate.element,
        value,
        isActive,
      );
      if (!isActive()) break;
      if (filled === false) {
        if (!alreadyOwned) sessionElements.splice(sessionElements.indexOf(candidate.element), 1);
        recordAIOutcome(candidate, fieldId, resp.confidence, 'unchanged', 'fill_failed');
        continue;
      }
      if (getWriteConfidence(candidate.element) < CONF_GREEN) { isHigh = false; confScore = CONF_AI_YELLOW; }
      applyHighlight(candidate.element, confScore);

      if (candidate.originalState === 'lowConfidence') {
        result.lowConfidence = Math.max(0, result.lowConfidence - 1);
      } else if (candidate.originalState === 'needReview') {
        result.needReview = Math.max(0, result.needReview - 1);
      } else {
        result.noData = Math.max(0, result.noData - 1);
      }

      if (isHigh) {
        result.noReview++;
        // Deliberately not saved to learned mappings — AI's own self-reported
        // confidence is not a trustworthy signal to permanently promote a
        // field to Layer 0 (mapper.ts). Only a human editing the field (the
        // rule-pipeline's own edit-watcher path) should teach a learned
        // mapping; see attachEditWatchers in index.ts.
      } else {
        result.needReview++;
      }
      options.onTextFilled?.(candidate.element, isHigh ? 'green' : 'yellow');
      recordAIOutcome(candidate, fieldId, resp.confidence, isHigh ? 'green' : 'yellow');
    } else if (candidate.type === 'radio' && resp.selectedOption) {
      const group = candidate.group as RadioGroup;
      const selected = exactAIOption(field.options ?? [], resp.selectedOption);
      const option = selected ? group.options[(field.options ?? []).indexOf(selected)] : null;
      if (!option) {
        recordAIOutcome(candidate, fieldId, resp.confidence, 'unchanged');
        continue;
      }

      if (await fillRadioInput(option.element) === false) {
        recordAIOutcome(candidate, fieldId, resp.confidence, 'unchanged', 'fill_failed');
        continue;
      }
      applyHighlight(option.element, confScore);
      sessionElements.push(option.element);
      if (isHigh) result.noReview++;
      else result.needReview++;
      recordAIOutcome(candidate, fieldId, resp.confidence, isHigh ? 'green' : 'yellow');
    } else if (candidate.type === 'checkbox' && Array.isArray(resp.selectedOptions)) {
      const group = candidate.group as CheckboxGroup;
      const selected = resp.selectedOptions.map(answer => exactAIOption(field.options ?? [], answer));
      if (selected.some(option => !option)) {
        recordAIOutcome(candidate, fieldId, resp.confidence, 'unchanged'); continue;
      }
      if (!selected.length && group.options.some(option => (option.element instanceof HTMLInputElement && option.element.required) || option.element.getAttribute('aria-required') === 'true')) {
        recordAIOutcome(candidate, fieldId, resp.confidence, 'unchanged'); continue;
      }
      const selectedIndices = new Set(selected.map(option => field.options!.indexOf(option!)));
      let allFilled = true;
      const targets = options.mode === 'merge'
        ? group.options.filter((_, i) => selectedIndices.has(i)) : [...group.options];
      targets.sort((a, b) => Number(selectedIndices.has(group.options.indexOf(b))) - Number(selectedIndices.has(group.options.indexOf(a))));
      for (const option of targets) {
        if (!isActive() || !isChoiceGroupAvailable(group)) { allFilled = false; break; }
        const checked = selectedIndices.has(group.options.indexOf(option));
        if (isChoiceChecked(option.element) !== checked) {
          const filled = checked ? await fillCheckboxInput(option.element) : await fillCheckboxInput(option.element, false);
          if (filled === false) { allFilled = false; continue; }
        }
        applyHighlight(option.element, confScore);
        if (!sessionElements.includes(option.element)) sessionElements.push(option.element);
      }
      if (allFilled) {
        if (isHigh) result.noReview++;
        else result.needReview++;
      }
      recordAIOutcome(candidate, fieldId, resp.confidence, allFilled ? (isHigh ? 'green' : 'yellow') : 'unchanged', allFilled ? undefined : 'fill_failed');
    } else {
      // No actionable response shape (e.g. text without profilePath)
      recordAIOutcome(candidate, fieldId, resp.confidence, 'unchanged');
    }
  }

  for (const record of candidateRecords.values()) if (record.ai.outcome === 'sent') {
    record.ai.outcome = isActive() ? 'no_response' : 'skipped';
    if (!isActive()) record.ai.skipReason = 'cancelled';
  }
  options.onStatus?.(requestIncomplete ? 'unavailable' : 'succeeded');
  return true;
}
