// @vitest-environment jsdom
import { vi, beforeEach, describe, it, expect } from 'vitest';

// Mock chrome-dependent modules before any import of ai.ts
vi.mock('../utils/storage', () => ({
  getGeminiApiKey:  vi.fn(),
  getGeminiModel:   vi.fn(),
  saveLearnedMapping: vi.fn(),
}));
vi.mock('./filler', async (importOriginal) => {
  // Real findBestMatch (used by ai.ts's findBestOption) — these tests verify
  // its actual matching behavior, not a stub. Only the DOM-touching fill
  // functions are mocked.
  const actual = await importOriginal<typeof import('./filler')>();
  return {
    findBestMatch:     actual.findBestMatch,
    fillField:         vi.fn(),
    fillRadioInput:    vi.fn(),
    fillCheckboxInput: vi.fn(),
  };
});
vi.mock('./highlighter', () => ({ applyHighlight: vi.fn() }));
vi.mock('../resume-ai/gemini', () => ({ resolveFieldsWithAI: vi.fn() }));
// Control the radio/checkbox candidate lists independently of the DOM.
vi.mock('./scanner', () => ({
  scanRadioGroups:    vi.fn(() => []),
  scanCheckboxGroups: vi.fn(() => []),
}));

import { extractSelectOptions, runAIAutofill } from './ai';
import type { AITextCandidate } from './ai';
import { getGeminiApiKey, getGeminiModel, saveLearnedMapping } from '../utils/storage';
import { resolveFieldsWithAI } from '../resume-ai/gemini';
import { scanRadioGroups, scanCheckboxGroups } from './scanner';
import { fillField, fillRadioInput, fillCheckboxInput } from './filler';
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
  originalState: 'needReview' | 'lowConfidence' | 'noData',
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
    // The candidate's label ("First Name") is passed through so the Learned
    // Mappings UI can show something readable instead of the normalised key.
    expect(saveLearnedMapping).toHaveBeenCalledWith(
      'example.com', expect.any(String), 'personal.firstName', 'First Name',
    );
    expect(aiGreenFilled.has(cand.element)).toBe(true);
  });

  it('saves each signal\'s learned mapping sequentially, never overlapping', async () => {
    // Regression test: saveLearnedMapping does a read-modify-write against
    // chrome.storage.local, so firing multiple calls without awaiting each
    // one first (the previous bug) races and silently loses all but the
    // last write. Two candidates with two non-empty signals each means four
    // total saveLearnedMapping calls; none may overlap in-flight.
    const cand1 = textCandidate('lowConfidence', 'First Name');
    cand1.signals.name = 'firstName';
    const cand2 = textCandidate('lowConfidence', 'Last Name');
    cand2.signals.name = 'lastName';

    let inFlight = 0;
    let maxConcurrent = 0;
    vi.mocked(saveLearnedMapping).mockImplementation(async () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight--;
    });

    mockResponses([
      { fieldId: 'field_001', profilePath: 'personal.firstName', confidence: 'high' },
      { fieldId: 'field_002', profilePath: 'personal.lastName',  confidence: 'high' },
    ]);

    await runAIAutofill(
      [cand1, cand2], PROFILE, freshResult(), [], 'example.com', undefined, new Set(),
    );

    expect(saveLearnedMapping).toHaveBeenCalledTimes(4);
    expect(maxConcurrent).toBe(1);
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

  it('decrements needReview (not lowConfidence or noData) for a needReview-origin candidate, overwriting its rule-pipeline value', async () => {
    const cand = textCandidate('needReview', 'LinkedIn URL');
    (cand.element as HTMLInputElement).value = 'https://old-value.example'; // already filled by the rule pipeline
    const result = { ...freshResult(), needReview: 1 };
    const aiGreenFilled = new Set<HTMLElement>();

    mockResponses([
      { fieldId: 'field_001', profilePath: 'links.linkedin', confidence: 'high' },
    ]);

    await runAIAutofill([cand], PROFILE, result, [], 'example.com', undefined, aiGreenFilled);

    expect(fillField).toHaveBeenCalledWith(cand.element, 'https://linkedin.com/in/jane');
    expect(result.needReview).toBe(0);
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

describe('runAIAutofill — native <select> candidates', () => {
  function selectCandidate(
    options: Array<{ text: string; value: string }>,
    originalState: 'needReview' | 'lowConfidence' | 'noData' = 'lowConfidence',
  ): AITextCandidate {
    const element = makeSelect(options);
    document.body.appendChild(element);
    return {
      type: 'text',
      element,
      signals: makeSignals({ label: 'Country of Residence', element }),
      originalState,
      originalFieldPath: null,
    };
  }

  it('sends a native select as type "select" with its extracted options in the payload', async () => {
    const cand = selectCandidate([{ text: 'Thailand', value: 'TH' }, { text: 'Germany', value: 'DE' }]);
    mockResponses([{ fieldId: 'field_001', selectedOption: 'Germany', confidence: 'high' }]);

    await runAIAutofill([cand], PROFILE, freshResult(), [], 'example.com');

    expect(resolveFieldsWithAI).toHaveBeenCalledWith(
      'key-123', expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          type: 'select',
          options: [{ label: 'Thailand', value: 'TH' }, { label: 'Germany', value: 'DE' }],
        }),
      ]),
      expect.anything(),
    );
  });

  it('fills with the AI-selected option label, not a resolved profile path', async () => {
    const cand = selectCandidate([{ text: 'Thailand', value: 'TH' }, { text: 'Germany', value: 'DE' }]);
    mockResponses([{ fieldId: 'field_001', selectedOption: 'Germany', confidence: 'high' }]);

    await runAIAutofill([cand], PROFILE, freshResult(), [], 'example.com');

    expect(fillField).toHaveBeenCalledWith(cand.element, 'Germany');
  });

  it('sends an ARIA combobox as type "select" with no options (unavailable until the dropdown opens)', async () => {
    const element = document.createElement('div');
    element.setAttribute('role', 'combobox');
    document.body.appendChild(element);
    const cand: AITextCandidate = {
      type: 'text', element,
      signals: makeSignals({ label: 'Country', element }),
      originalState: 'lowConfidence', originalFieldPath: null,
    };
    mockResponses([{ fieldId: 'field_001', profilePath: 'personal.email', confidence: null }]);

    await runAIAutofill([cand], PROFILE, freshResult(), [], 'example.com');

    expect(resolveFieldsWithAI).toHaveBeenCalledWith(
      'key-123', expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ type: 'select', label: 'Country' }),
      ]),
      expect.anything(),
    );
    const sentPayload = vi.mocked(resolveFieldsWithAI).mock.calls[0][2];
    expect(sentPayload[0]).not.toHaveProperty('options');
  });

  it('never fills a select from an unresolvable profile path when no selectedOption is given', async () => {
    // isSelect only reads value from resp.selectedOption (line ~172) — a
    // profilePath that resolves to nothing leaves value empty, so this must
    // fall into the !value guard and never call fillField.
    const cand = selectCandidate([{ text: 'Thailand', value: 'TH' }]);
    mockResponses([{ fieldId: 'field_001', profilePath: 'address.country', confidence: 'high' }]);

    await runAIAutofill([cand], PROFILE, freshResult(), [], 'example.com');

    expect(fillField).not.toHaveBeenCalled();
  });
});

describe('runAIAutofill — low-confidence text fills', () => {
  it('fills and increments needReview, leaving edit-watching to the caller', async () => {
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
  });

  it('leaves a needReview-origin candidate at needReview (net no count change) on a low-confidence AI response', async () => {
    const cand = textCandidate('needReview', 'LinkedIn URL');
    const result = { ...freshResult(), needReview: 1 };
    const aiGreenFilled = new Set<HTMLElement>();

    mockResponses([
      { fieldId: 'field_001', profilePath: 'links.linkedin', confidence: 'low' },
    ]);

    await runAIAutofill([cand], PROFILE, result, [], 'example.com', undefined, aiGreenFilled);

    expect(result.needReview).toBe(1);
    expect(result.noReview).toBe(0);
    expect(aiGreenFilled.has(cand.element)).toBe(false);
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

  it('still checks the matching radio for a low-confidence pick, but increments needReview instead of noReview', async () => {
    const { group, el } = radioGroup();
    vi.mocked(scanRadioGroups).mockReturnValue([group]);
    const result = freshResult();

    mockResponses([{ fieldId: 'field_001', selectedOption: 'Female', confidence: 'low' }]);

    await runAIAutofill([], PROFILE, result, [], 'example.com');

    expect(fillRadioInput).toHaveBeenCalledWith(el);
    expect(result.needReview).toBe(1);
    expect(result.noReview).toBe(0);
  });

  it('matches via the fuzzy fallback when the AI response is a close typo, not an exact label match', async () => {
    const { group, el } = radioGroup();
    vi.mocked(scanRadioGroups).mockReturnValue([group]);
    const result = freshResult();

    mockResponses([{ fieldId: 'field_001', selectedOption: 'Femal', confidence: 'high' }]);

    await runAIAutofill([], PROFILE, result, [], 'example.com');

    expect(fillRadioInput).toHaveBeenCalledWith(el);
    expect(result.noReview).toBe(1);
  });

  it('does not fill when the AI response is too dissimilar to any option (below the fuzzy threshold)', async () => {
    const { group } = radioGroup();
    vi.mocked(scanRadioGroups).mockReturnValue([group]);
    const result = freshResult();

    mockResponses([{ fieldId: 'field_001', selectedOption: 'Fem', confidence: 'high' }]);

    await runAIAutofill([], PROFILE, result, [], 'example.com');

    expect(fillRadioInput).not.toHaveBeenCalled();
    expect(result.noReview).toBe(0);
    expect(result.needReview).toBe(0);
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

  it('still checks matching checkboxes for a low-confidence pick, but increments needReview instead of noReview', async () => {
    const { group, a, b } = checkboxGroup();
    vi.mocked(scanCheckboxGroups).mockReturnValue([group]);
    const result = freshResult();

    mockResponses([
      { fieldId: 'field_001', selectedOptions: ['JavaScript', 'TypeScript'], confidence: 'low' },
    ]);

    await runAIAutofill([], PROFILE, result, [], 'example.com');

    expect(fillCheckboxInput).toHaveBeenCalledWith(a);
    expect(fillCheckboxInput).toHaveBeenCalledWith(b);
    expect(result.needReview).toBe(1);
    expect(result.noReview).toBe(0);
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
