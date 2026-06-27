import type { Profile } from '../types/profile';
import type { FieldSignals } from './signals';
import { resolveProfileValue } from './resolver';
import { resolveFieldsWithAI } from '../resume-ai/gemini';
import type { AIFieldPayload, AIFieldResponse } from '../resume-ai/gemini';
import { scanRadioGroups, scanCheckboxGroups } from './scanner';
import type { RadioGroup, CheckboxGroup } from './scanner';
import { fillField, fillRadioInput, fillCheckboxInput } from './filler';
import { applyHighlight } from './highlighter';
import { CONF_CONFIRMED, CONF_AI_YELLOW } from './constants';
import { attachPickerListeners } from './picker';
import type { PickerField, PickerFieldState } from './picker';
import { getGeminiApiKey, getGeminiModel, saveLearnedMapping } from '../utils/storage';
import { normalize } from './normalizer';
import { saveElementMappings } from './mappings';
import type { DebugAIField } from './debug';

// Mutable result shape — matches the fields of AutofillResult that AI updates
interface MutableResult {
  noReview:      number;
  needReview:    number;
  lowConfidence: number;
  noData:        number;
}

export interface AITextCandidate {
  type:             'text';
  element:          HTMLElement;
  signals:          FieldSignals;
  originalState:    'lowConfidence' | 'noData';
  originalFieldPath: string | null;
  /** Debug-only: ID assigned during scanAutofill so the debug panel can join scanner → mapping → AI. */
  debugFieldId?:    string;
}

// Returns true if the AI layer ran (key was available), false if skipped (no key).
// Mutates `result` and `sessionElements` in-place.
export async function runAIAutofill(
  textCandidates: AITextCandidate[],
  profile: Profile,
  result: MutableResult,
  sessionElements: HTMLElement[],
  domain: string,
  debug?: DebugAIField[],
): Promise<boolean> {
  const [apiKey, model] = await Promise.all([getGeminiApiKey(), getGeminiModel()]);
  if (!apiKey || !model) return false;

  const radioGroups    = scanRadioGroups();
  const checkboxGroups = scanCheckboxGroups().filter((g) => !g.isConsent);

  type Candidate =
    | AITextCandidate
    | { type: 'radio';    group: RadioGroup }
    | { type: 'checkbox'; group: CheckboxGroup };

  const candidates: Candidate[] = [
    ...textCandidates,
    ...radioGroups.map((g) => ({ type: 'radio' as const, group: g })),
    ...checkboxGroups.map((g) => ({ type: 'checkbox' as const, group: g })),
  ];

  if (candidates.length === 0) return true;

  const candidateMap = new Map<string, Candidate>();
  // Debug-only: remember the synthetic AI fieldId per candidate so we can
  // surface the same identifier in both the AI debug record and the mapping
  // debug record (for text candidates that originated from the rule pipeline).
  const fieldIdByCandidate = new Map<Candidate, string>();
  const payload: AIFieldPayload[] = candidates.map((c, i) => {
    const fieldId = `field_${String(i + 1).padStart(3, '0')}`;
    candidateMap.set(fieldId, c);
    fieldIdByCandidate.set(c, fieldId);

    if (c.type === 'text') {
      const s = c.signals;
      return {
        fieldId,
        type:         'text',
        label:        s.label || s.ariaLabel || s.placeholder || s.name || '',
        ...(s.placeholder && { placeholder: s.placeholder }),
        ...(s.name       && { name:        s.name }),
        ...(s.nearbyText && { nearbyText:  s.nearbyText }),
      };
    }
    return {
      fieldId,
      type:    c.type,
      label:   c.group.groupLabel,
      options: c.group.options.map((o) => o.label),
    };
  });

  let responses: AIFieldResponse[];
  try {
    responses = await resolveFieldsWithAI(apiKey, model, payload, profile as object);
  } catch {
    return true; // AI available but failed — silent fallback
  }

  const pickerFields: PickerField[] = [];

  // Debug-only helper: append a debug record for an AI response.
  const recordDebug = (
    candidate: Candidate,
    fieldId: string,
    aiResult: string | null,
    aiConfidence: 'high' | 'low' | null,
    finalState: 'green' | 'yellow' | 'unchanged',
  ) => {
    if (!debug) return;
    const label = candidate.type === 'text'
      ? (candidate.signals.label || candidate.signals.ariaLabel
         || candidate.signals.placeholder || candidate.signals.name || '')
      : candidate.group.groupLabel;
    debug.push({ fieldId, label, type: candidate.type, aiResult, aiConfidence, finalState });
  };

  for (const resp of responses) {
    const candidate = candidateMap.get(resp.fieldId);
    if (!candidate) continue;
    const fieldId = fieldIdByCandidate.get(candidate)!;

    if (resp.confidence === null) {
      recordDebug(candidate, fieldId, null, null, 'unchanged');
      continue;
    }

    const isHigh    = resp.confidence === 'high';
    const confScore = isHigh ? CONF_CONFIRMED : CONF_AI_YELLOW;

    if (candidate.type === 'text' && resp.profilePath) {
      const value = resolveProfileValue(profile, resp.profilePath);
      if (!value) {
        recordDebug(candidate, fieldId, resp.profilePath, resp.confidence, 'unchanged');
        continue;
      }

      await fillField(candidate.element, value);
      applyHighlight(candidate.element, confScore);
      sessionElements.push(candidate.element);

      if (candidate.originalState === 'lowConfidence') {
        result.lowConfidence = Math.max(0, result.lowConfidence - 1);
      } else {
        result.noData = Math.max(0, result.noData - 1);
      }

      if (isHigh) {
        result.noReview++;
        // Save learned mappings for high-confidence fills so the picker skips
        // this field on the next autofill run on this domain.
        const sigs = [
          candidate.signals.name, candidate.signals.id,
          candidate.signals.placeholder, candidate.signals.ariaLabel, candidate.signals.label,
        ].filter(Boolean);
        for (const sig of sigs) {
          const norm = normalize(sig);
          if (norm) void saveLearnedMapping(domain, norm, resp.profilePath!);
        }
      } else {
        result.needReview++;
        pickerFields.push({
          element: candidate.element,
          state:   candidate.originalState as PickerFieldState,
          label:   candidate.signals.label || candidate.signals.ariaLabel
                || candidate.signals.placeholder || 'this field',
        });
      }
      recordDebug(candidate, fieldId, resp.profilePath, resp.confidence, isHigh ? 'green' : 'yellow');

    } else if (candidate.type === 'radio' && resp.selectedOption) {
      const group  = candidate.group as RadioGroup;
      const option = findBestOption(group.options, resp.selectedOption);
      if (!option) {
        recordDebug(candidate, fieldId, resp.selectedOption, resp.confidence, 'unchanged');
        continue;
      }

      fillRadioInput(option.element);
      applyHighlight(option.element, confScore);
      sessionElements.push(option.element);
      if (isHigh) result.noReview++;
      else        result.needReview++;
      recordDebug(candidate, fieldId, resp.selectedOption, resp.confidence, isHigh ? 'green' : 'yellow');

    } else if (candidate.type === 'checkbox' && Array.isArray(resp.selectedOptions)) {
      const group    = candidate.group as CheckboxGroup;
      let anyFilled  = false;
      for (const label of resp.selectedOptions) {
        const option = findBestOption(group.options, label);
        if (!option) continue;
        fillCheckboxInput(option.element);
        applyHighlight(option.element, confScore);
        sessionElements.push(option.element);
        anyFilled = true;
      }
      if (anyFilled) {
        if (isHigh) result.noReview++;
        else        result.needReview++;
      }
      recordDebug(candidate, fieldId, resp.selectedOptions.join(', '), resp.confidence, anyFilled ? (isHigh ? 'green' : 'yellow') : 'unchanged');

    } else {
      // No actionable response shape (e.g. text without profilePath)
      recordDebug(candidate, fieldId, null, resp.confidence, 'unchanged');
    }
  }

  if (pickerFields.length > 0) {
    attachPickerListeners(pickerFields, async (element, fieldPath, value, originalState: PickerFieldState) => {
      await fillField(element, value);
      applyHighlight(element, CONF_CONFIRMED);
      if (originalState === 'noData') sessionElements.push(element);

      result.noReview++;
      if (originalState === 'lowConfidence') result.lowConfidence = Math.max(0, result.lowConfidence - 1);
      if (originalState === 'needReview')    result.needReview    = Math.max(0, result.needReview    - 1);
      if (originalState === 'noData')        result.noData        = Math.max(0, result.noData        - 1);

      void saveElementMappings(domain, element, fieldPath);
    });
  }

  return true;
}

function findBestOption<T extends { label: string }>(options: T[], target: string): T | null {
  const norm = target.toLowerCase().trim();
  const exact = options.find((o) => o.label.toLowerCase().trim() === norm);
  if (exact) return exact;
  const partial = options.find(
    (o) => o.label.toLowerCase().includes(norm) || norm.includes(o.label.toLowerCase().trim()),
  );
  return partial ?? null;
}
