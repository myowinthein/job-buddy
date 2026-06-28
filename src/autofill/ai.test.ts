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

import { extractSelectOptions } from './ai';

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
