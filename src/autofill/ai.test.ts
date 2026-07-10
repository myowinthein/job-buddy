// @vitest-environment jsdom
import { vi, beforeEach, describe, it, expect } from 'vitest';

// Mock chrome-dependent modules before any import of ai.ts
vi.mock('../utils/storage', () => ({
  getGeminiApiKey:  vi.fn(),
  getGeminiModel:   vi.fn(),
  saveLearnedMapping: vi.fn(),
}));
vi.mock('./filler', () => ({
  fillField:        vi.fn(),
  fillRadioInput:   vi.fn(),
  fillCheckboxInput: vi.fn(),
}));
vi.mock('./highlighter', () => ({ applyHighlight: vi.fn() }));
vi.mock('./picker',      () => ({ attachPickerListeners: vi.fn() }));
vi.mock('./mappings',    () => ({ saveElementMappings: vi.fn() }));
vi.mock('../resume-ai/gemini', () => ({ resolveFieldsWithAI: vi.fn() }));
// Control the radio/checkbox candidate lists independently of the DOM.
vi.mock('./scanner', () => ({
  scanRadioGroups:    vi.fn(() => []),
  scanCheckboxGroups: vi.fn(() => []),
}));

import { extractSelectOptions, runAIAutofill } from './ai';
import type { AITextCandidate } from './ai';
import { getGeminiApiKey, getGeminiModel } from '../utils/storage';
import { resolveFieldsWithAI } from '../resume-ai/gemini';
import { scanRadioGroups, scanCheckboxGroups } from './scanner';
import { fillField, fillRadioInput, fillCheckboxInput } from './filler';
import { attachPickerListeners } from './picker';
import type { Profile } from '../types/profile';
import type { FieldSignals } from './signals';
import type { RadioGroup, CheckboxGroup } from './scanner';
import type { AIFieldResponse } from '../resume-ai/types';

// ── runAIAutofill helpers ─────────────────────────────────────────────────────

const PROFILE = {
  personal: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
  links: { linkedin: 'https://linkedin.com/in/jane' },
} as unknown as Profile;

function makeSignals(overrides: Partial<FieldSignals> = {}): FieldSignals {
  return {
    element: document.createElement('input'),
    type: 'text', name: '', id: '', placeholder: '', autocomplete: '',
    ariaLabel: '', label: '', nearbyText: '',
    ...overrides,
  } as FieldSignals;
}

function textCandidate(
  originalState: 'lowConfidence' | 'noData',
  labelText: string,
): AITextCandidate {
  const element = document.createElement('input');
  element.type = 'text';
  document.body.appendChild(element);
  return {
    type: 'text',
    element,
    signals: makeSignals({ label: labelText, element }),
    originalState,
    originalFieldPath: null,
  };
}

function freshResult() {
  return { noReview: 0, needReview: 0, lowConfidence: 0, noData: 0 };
}

function mockResponses(responses: AIFieldResponse[]) {
  vi.mocked(resolveFieldsWithAI).mockResolvedValue(responses);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGeminiApiKey).mockResolvedValue('key-123');
  vi.mocked(getGeminiModel).mockResolvedValue('gemini-1.5-flash' as never);
  vi.mocked(scanRadioGroups).mockReturnValue([]);
  vi.mocked(scanCheckboxGroups).mockReturnValue([]);
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSelect(
  options: Array<{ text: string; value: string; disabled?: boolean }>,
): HTMLSelectElement {
  const sel = document.createElement('select');
  for (const { text, value, disabled } of options) {
    const opt = document.createElement('option');
    opt.text  = text;
    opt.value = value;
    if (disabled) opt.disabled = true;
    sel.add(opt);
  }
  return sel;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ── extractSelectOptions ──────────────────────────────────────────────────────

describe('extractSelectOptions — basic extraction', () => {
  it('returns label and value for each real option', () => {
    const sel = makeSelect([
      { text: 'Thailand',      value: 'TH' },
      { text: 'United Kingdom', value: 'GB' },
    ]);
    expect(extractSelectOptions(sel)).toEqual([
      { label: 'Thailand',       value: 'TH' },
      { label: 'United Kingdom', value: 'GB' },
    ]);
  });

  it('trims whitespace from option text', () => {
    const sel = makeSelect([{ text: '  Germany  ', value: 'DE' }]);
    expect(extractSelectOptions(sel)[0].label).toBe('Germany');
  });

  it('returns an empty array when the select has no options', () => {
    const sel = document.createElement('select');
    expect(extractSelectOptions(sel)).toEqual([]);
  });
});

describe('extractSelectOptions — disabled option filtering', () => {
  it('ignores disabled options', () => {
    const sel = makeSelect([
      { text: 'Thailand', value: 'TH', disabled: true },
      { text: 'Germany',  value: 'DE' },
    ]);
    const result = extractSelectOptions(sel);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('DE');
  });

  it('returns empty array when all options are disabled', () => {
    const sel = makeSelect([
      { text: 'Option A', value: 'a', disabled: true },
      { text: 'Option B', value: 'b', disabled: true },
    ]);
    expect(extractSelectOptions(sel)).toEqual([]);
  });
});

describe('extractSelectOptions — placeholder option filtering', () => {
  it('ignores options with an empty value attribute', () => {
    const sel = makeSelect([
      { text: 'Please select a country', value: '' },
      { text: 'Germany', value: 'DE' },
    ]);
    expect(extractSelectOptions(sel)).toHaveLength(1);
    expect(extractSelectOptions(sel)[0].value).toBe('DE');
  });

  it('ignores option whose text normalises to "select"', () => {
    const sel = makeSelect([
      { text: 'Select',   value: 'placeholder' },
      { text: 'Germany',  value: 'DE' },
    ]);
    const result = extractSelectOptions(sel);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('DE');
  });

  it('ignores option whose text normalises to "pleaseselect"', () => {
    const sel = makeSelect([
      { text: 'Please Select', value: 'x' },
      { text: 'Thailand',      value: 'TH' },
    ]);
    const result = extractSelectOptions(sel);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('TH');
  });

  it('ignores option whose text normalises to "selectone"', () => {
    const sel = makeSelect([
      { text: 'Select one', value: 'x' },
      { text: 'Germany',    value: 'DE' },
    ]);
    expect(extractSelectOptions(sel).map((o) => o.value)).toEqual(['DE']);
  });

  it('ignores option whose text normalises to "choose"', () => {
    const sel = makeSelect([
      { text: 'Choose',  value: 'x' },
      { text: 'Germany', value: 'DE' },
    ]);
    expect(extractSelectOptions(sel).map((o) => o.value)).toEqual(['DE']);
  });

  it('ignores option whose text normalises to "chooseone"', () => {
    const sel = makeSelect([
      { text: 'Choose one', value: 'x' },
      { text: 'Germany',    value: 'DE' },
    ]);
    expect(extractSelectOptions(sel).map((o) => o.value)).toEqual(['DE']);
  });

  it('ignores "-- Select --" (normalises to "select")', () => {
    const sel = makeSelect([
      { text: '-- Select --', value: 'x' },
      { text: 'Germany',      value: 'DE' },
    ]);
    expect(extractSelectOptions(sel).map((o) => o.value)).toEqual(['DE']);
  });

  it('preserves real options that share a word with placeholder patterns', () => {
    // "Select Plan" does NOT normalise to any of the placeholder norms exactly
    const sel = makeSelect([
      { text: 'Select Plan', value: 'select-plan' },
      { text: 'Basic Plan',  value: 'basic' },
    ]);
    // 'selectplan' is not in PLACEHOLDER_NORMS, so it should be included
    const result = extractSelectOptions(sel);
    expect(result).toHaveLength(2);
  });
});

describe('extractSelectOptions — combined filters', () => {
  it('filters out disabled and placeholder options together', () => {
    const sel = makeSelect([
      { text: 'Choose',   value: 'x' },
      { text: 'Thailand', value: 'TH', disabled: true },
      { text: '',         value: '' },
      { text: 'Germany',  value: 'DE' },
    ]);
    expect(extractSelectOptions(sel)).toEqual([{ label: 'Germany', value: 'DE' }]);
  });
});

// ── runAIAutofill ─────────────────────────────────────────────────────────────

describe('runAIAutofill — key gating', () => {
  it('returns false and does nothing when no API key is available', async () => {
    vi.mocked(getGeminiApiKey).mockResolvedValue('');
    const result = freshResult();
    const ran = await runAIAutofill([], PROFILE, result, [], 'example.com');
    expect(ran).toBe(false);
    expect(resolveFieldsWithAI).not.toHaveBeenCalled();
  });

  it('returns true without calling the AI when there are no candidates', async () => {
    const result = freshResult();
    const ran = await runAIAutofill([], PROFILE, result, [], 'example.com');
    expect(ran).toBe(true);
    expect(resolveFieldsWithAI).not.toHaveBeenCalled();
  });
});

describe('runAIAutofill — high-confidence text fills', () => {
  it('fills, decrements lowConfidence, increments noReview, and records the element', async () => {
    const cand = textCandidate('lowConfidence', 'First Name');
    const result = { ...freshResult(), lowConfidence: 1 };
    const sessionElements: HTMLElement[] = [];
    const aiGreenFilled = new Set<HTMLElement>();

    mockResponses([
      { fieldId: 'field_001', profilePath: 'personal.firstName', confidence: 'high' },
    ]);

    const ran = await runAIAutofill(
      [cand], PROFILE, result, sessionElements, 'example.com', undefined, aiGreenFilled,
    );

    expect(ran).toBe(true);
    expect(fillField).toHaveBeenCalledWith(cand.element, 'Jane');
    expect(result.lowConfidence).toBe(0);
    expect(result.noReview).toBe(1);
    expect(sessionElements).toContain(cand.element);
    expect(aiGreenFilled.has(cand.element)).toBe(true);
    // A green fill never queues a picker entry.
    expect(attachPickerListeners).not.toHaveBeenCalled();
  });

  it('decrements noData (not lowConfidence) for a noData-origin candidate', async () => {
    const cand = textCandidate('noData', 'Email');
    const result = { ...freshResult(), noData: 1 };
    const aiGreenFilled = new Set<HTMLElement>();

    mockResponses([
      { fieldId: 'field_001', profilePath: 'personal.email', confidence: 'high' },
    ]);

    await runAIAutofill([cand], PROFILE, result, [], 'example.com', undefined, aiGreenFilled);

    expect(result.noData).toBe(0);
    expect(result.noReview).toBe(1);
    expect(aiGreenFilled.has(cand.element)).toBe(true);
  });

  it('does not underflow counters below zero', async () => {
    const cand = textCandidate('lowConfidence', 'First Name');
    const result = freshResult(); // lowConfidence already 0
    mockResponses([
      { fieldId: 'field_001', profilePath: 'personal.firstName', confidence: 'high' },
    ]);
    await runAIAutofill([cand], PROFILE, result, [], 'example.com');
    expect(result.lowConfidence).toBe(0);
  });
});

describe('runAIAutofill — low-confidence text fills', () => {
  it('fills, increments needReview, and queues a picker entry', async () => {
    const cand = textCandidate('lowConfidence', 'First Name');
    const result = { ...freshResult(), lowConfidence: 1 };
    const aiGreenFilled = new Set<HTMLElement>();

    mockResponses([
      { fieldId: 'field_001', profilePath: 'personal.firstName', confidence: 'low' },
    ]);

    await runAIAutofill([cand], PROFILE, result, [], 'example.com', undefined, aiGreenFilled);

    expect(fillField).toHaveBeenCalledWith(cand.element, 'Jane');
    expect(result.lowConfidence).toBe(0);
    expect(result.needReview).toBe(1);
    expect(result.noReview).toBe(0);
    // Low confidence is NOT a green fill.
    expect(aiGreenFilled.has(cand.element)).toBe(false);
    // A picker entry is queued for the low-confidence field.
    expect(attachPickerListeners).toHaveBeenCalledTimes(1);
    const [fields] = vi.mocked(attachPickerListeners).mock.calls[0];
    expect(fields).toHaveLength(1);
    expect(fields[0].element).toBe(cand.element);
    expect(fields[0].state).toBe('lowConfidence');
  });

  it('does not fill or count when the resolved profile value is empty', async () => {
    const cand = textCandidate('lowConfidence', 'Nonexistent');
    const result = { ...freshResult(), lowConfidence: 1 };
    mockResponses([
      { fieldId: 'field_001', profilePath: 'personal.doesNotExist', confidence: 'high' },
    ]);
    await runAIAutofill([cand], PROFILE, result, [], 'example.com');
    expect(fillField).not.toHaveBeenCalled();
    expect(result.lowConfidence).toBe(1); // unchanged
    expect(result.noReview).toBe(0);
  });

  it('leaves counters untouched when confidence is null', async () => {
    const cand = textCandidate('lowConfidence', 'First Name');
    const result = { ...freshResult(), lowConfidence: 1 };
    mockResponses([{ fieldId: 'field_001', profilePath: 'personal.firstName', confidence: null }]);
    await runAIAutofill([cand], PROFILE, result, [], 'example.com');
    expect(fillField).not.toHaveBeenCalled();
    expect(result.lowConfidence).toBe(1);
  });
});

describe('runAIAutofill — radio fills', () => {
  function radioGroup(): { group: RadioGroup; el: HTMLInputElement } {
    const el = document.createElement('input');
    el.type = 'radio';
    return {
      el,
      group: {
        name: 'gender',
        groupLabel: 'Gender',
        options: [
          { element: el, label: 'Female', value: 'female' },
          { element: document.createElement('input'), label: 'Male', value: 'male' },
        ],
      },
    };
  }

  it('checks the matching radio and increments noReview for a high-confidence pick', async () => {
    const { group, el } = radioGroup();
    vi.mocked(scanRadioGroups).mockReturnValue([group]);
    const result = freshResult();
    const sessionElements: HTMLElement[] = [];

    mockResponses([{ fieldId: 'field_001', selectedOption: 'Female', confidence: 'high' }]);

    await runAIAutofill([], PROFILE, result, sessionElements, 'example.com');

    expect(fillRadioInput).toHaveBeenCalledWith(el);
    expect(result.noReview).toBe(1);
    expect(sessionElements).toContain(el);
  });

  it('does nothing when the AI-selected option is not found in the group', async () => {
    const { group } = radioGroup();
    vi.mocked(scanRadioGroups).mockReturnValue([group]);
    const result = freshResult();
    mockResponses([{ fieldId: 'field_001', selectedOption: 'Nonbinary', confidence: 'high' }]);
    await runAIAutofill([], PROFILE, result, [], 'example.com');
    expect(fillRadioInput).not.toHaveBeenCalled();
    expect(result.noReview).toBe(0);
  });
});

describe('runAIAutofill — checkbox fills', () => {
  function checkboxGroup(): { group: CheckboxGroup; a: HTMLInputElement; b: HTMLInputElement } {
    const a = document.createElement('input');
    const b = document.createElement('input');
    a.type = 'checkbox'; b.type = 'checkbox';
    return {
      a, b,
      group: {
        name: 'skills',
        groupLabel: 'Skills',
        isConsent: false,
        options: [
          { element: a, label: 'JavaScript', value: 'js' },
          { element: b, label: 'TypeScript', value: 'ts' },
        ],
      },
    };
  }

  it('checks every selected checkbox and increments noReview once for the group', async () => {
    const { group, a, b } = checkboxGroup();
    vi.mocked(scanCheckboxGroups).mockReturnValue([group]);
    const result = freshResult();
    const sessionElements: HTMLElement[] = [];

    mockResponses([
      { fieldId: 'field_001', selectedOptions: ['JavaScript', 'TypeScript'], confidence: 'high' },
    ]);

    await runAIAutofill([], PROFILE, result, sessionElements, 'example.com');

    expect(fillCheckboxInput).toHaveBeenCalledWith(a);
    expect(fillCheckboxInput).toHaveBeenCalledWith(b);
    expect(result.noReview).toBe(1); // once for the whole group
    expect(sessionElements).toContain(a);
    expect(sessionElements).toContain(b);
  });

  it('excludes consent checkbox groups from AI candidates', async () => {
    const { group } = checkboxGroup();
    const consent: CheckboxGroup = { ...group, isConsent: true };
    vi.mocked(scanCheckboxGroups).mockReturnValue([consent]);
    // No text candidates + only a consent group → filtered out → no candidates.
    const result = freshResult();
    await runAIAutofill([], PROFILE, result, [], 'example.com');
    expect(resolveFieldsWithAI).not.toHaveBeenCalled();
    expect(fillCheckboxInput).not.toHaveBeenCalled();
  });
});

describe('runAIAutofill — AI failure', () => {
  it('returns true and mutates nothing when resolveFieldsWithAI throws', async () => {
    const cand = textCandidate('lowConfidence', 'First Name');
    const result = { ...freshResult(), lowConfidence: 1 };
    vi.mocked(resolveFieldsWithAI).mockRejectedValue(new Error('network down'));

    const ran = await runAIAutofill([cand], PROFILE, result, [], 'example.com');

    expect(ran).toBe(true);
    expect(fillField).not.toHaveBeenCalled();
    expect(result.lowConfidence).toBe(1);
    expect(result.noReview).toBe(0);
  });
});
