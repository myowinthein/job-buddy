import type { Profile } from '../types/profile';
import type { FieldSignals } from './signals';
import { extractSignals } from './signals';
import { resolveProfileValue } from './resolver';
import { resolveFieldsWithAI } from '../resume-ai/gemini';
import type { AIFieldPayload, AIFieldResponse } from '../resume-ai/gemini';
import { scanRadioGroups, scanCheckboxGroups } from './scanner';
import type { RadioGroup, CheckboxGroup } from './scanner';
import { fillField, fillRadioInput, fillCheckboxInput } from './filler';
import { applyHighlight } from './highlighter';
import { attachPickerListeners } from './picker';
import type { PickerField, PickerFieldState } from './picker';
import { getGeminiApiKey, getGeminiModel, saveLearnedMapping } from '../utils/storage';
import { normalize } from './normalizer';

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
}

// Returns true if the AI layer ran (key was available), false if skipped (no key).
// Mutates `result` and `sessionElements` in-place.
export async function runAIAutofill(
  textCandidates: AITextCandidate[],
  profile: Profile,
  result: MutableResult,
  sessionElements: HTMLElement[],
  domain: string,
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
  const payload: AIFieldPayload[] = candidates.map((c, i) => {
    const fieldId = `field_${String(i + 1).padStart(3, '0')}`;
    candidateMap.set(fieldId, c);

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

  for (const resp of responses) {
    const candidate = candidateMap.get(resp.fieldId);
    if (!candidate || resp.confidence === null) continue;

    const isHigh    = resp.confidence === 'high';
    const confScore = isHigh ? 0.97 : 0.70;

    if (candidate.type === 'text' && resp.profilePath) {
      const value = resolveProfileValue(profile, resp.profilePath);
      if (!value) continue;

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

    } else if (candidate.type === 'radio' && resp.selectedOption) {
      const group  = candidate.group as RadioGroup;
      const option = findBestOption(group.options, resp.selectedOption);
      if (!option) continue;

      fillRadioInput(option.element);
      applyHighlight(option.element, confScore);
      sessionElements.push(option.element);
      if (isHigh) result.noReview++;
      else        result.needReview++;

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
    }
  }

  if (pickerFields.length > 0) {
    attachPickerListeners(pickerFields, async (element, fieldPath, value, originalState: PickerFieldState) => {
      await fillField(element, value);
      applyHighlight(element, 0.97);
      if (originalState === 'noData') sessionElements.push(element);

      result.noReview++;
      if (originalState === 'lowConfidence') result.lowConfidence = Math.max(0, result.lowConfidence - 1);
      if (originalState === 'needReview')    result.needReview    = Math.max(0, result.needReview    - 1);
      if (originalState === 'noData')        result.noData        = Math.max(0, result.noData        - 1);

      const sigs = extractSignals(element);
      const sigTexts = [sigs.name, sigs.id, sigs.placeholder, sigs.ariaLabel, sigs.label, sigs.nearbyText].filter(Boolean);
      for (const t of sigTexts) {
        const norm = normalize(t);
        if (norm) void saveLearnedMapping(domain, norm, fieldPath);
      }
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
