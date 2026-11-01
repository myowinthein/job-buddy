// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAutofill, getFillLog, getLastResult, scanAutofill, undoAutofill } from './index';
import { scanFields, scanAriaFields, scanRadioGroups, scanCheckboxGroups } from './scanner';
import { resolveFieldsWithAI } from '@/src/resume-ai/gemini';
import { summarizeFillFields } from './fillLog';
import { extractSignals } from './signals';
import type { Profile } from '@/src/types/profile';

vi.mock('@/src/utils/storage', () => ({
  getProfile: vi.fn(),
  getLearnedMappings: vi.fn().mockResolvedValue({}),
  saveLearnedMappings: vi.fn(),
  getGeminiApiKey: vi.fn().mockResolvedValue('synthetic-secret-key'),
  getGeminiModel: vi.fn().mockResolvedValue('gemini-3.8-flash'),
}));
vi.mock('./scanner', async (original) => {
  const actual = await original<typeof import('./scanner')>();
  const scanners = {
    scanFields: vi.fn(), scanAriaFields: vi.fn(),
    scanRadioGroups: vi.fn(), scanCheckboxGroups: vi.fn(),
  };
  return {
    ...actual, ...scanners,
    scanForm: () => ({
      fields: [...scanners.scanFields(), ...scanners.scanAriaFields()],
      radioGroups: scanners.scanRadioGroups(), checkboxGroups: scanners.scanCheckboxGroups(),
      signals: extractSignals,
    }),
  };
});
vi.mock('./mappings', () => ({
  refreshLearnedLabels: vi.fn().mockReturnValue(false),
  saveElementMappings: vi.fn(),
}));
vi.mock('./signals', async (original) => ({
  ...await original<typeof import('./signals')>(),
  bestLabel: (signals: { label: string }) => signals.label,
  extractSignals: (element: HTMLInputElement) => ({
    element,
    name: element.name,
    label: element.name,
    type: element.type,
    id: '',
    ariaLabel: '',
    placeholder: '',
    autocomplete: '',
    nearbyText: '',
  }),
}));
vi.mock('./mapper', () => ({
  mapField: (signals: { name: string }) =>
    signals.name === 'Name'
      ? {
          confidence: 0.95,
          fieldPath: 'personal.firstName',
          value: 'Jane',
          matchLayer: 'dictionary_exact',
        }
      : signals.name === 'Summary'
        ? {
            confidence: 0.7,
            fieldPath: 'professional.summary',
            value: 'Rule summary',
            matchLayer: 'fuzzy',
          }
        : signals.name === 'CV'
          ? {
              confidence: 0.95,
              fieldPath: 'documents.cv.file',
              value: 'resume.pdf',
              matchLayer: 'dictionary_exact',
            }
          : { confidence: 0, fieldPath: null, value: '', matchLayer: 'none' },
}));
vi.mock('@/src/resume-ai/gemini', () => ({ resolveFieldsWithAI: vi.fn() }));
vi.mock('./filler', async (original) => ({
  ...(await original<typeof import('./filler')>()),
  fillFileField: vi.fn().mockResolvedValue(false),
}));

import { getProfile } from '@/src/utils/storage';
const profile = {
  id: 'synthetic',
  personal: { firstName: 'Jane', lastName: '', email: 'private@example.test' },
  professional: { summary: 'Stored summary' },
  workHistory: [{ company: 'Test', position: 'Engineer', startDate: '2020-01', isCurrent: true }],
} as unknown as Profile;
function input(name: string, value = '') {
  const element = document.createElement('input');
  element.name = name;
  element.value = value;
  document.body.append(element);
  return element;
}
function group(kind: 'radio' | 'checkbox', label: string, consent = false) {
  const options = ['Yes', 'No'].map((name, index) => {
    const element = input(label);
    element.type = kind;
    element.value = String(index);
    element.name = label;
    return { element, label: name, value: String(index) };
  });
  return { name: label, groupLabel: label, isConsent: consent, options };
}
beforeEach(() => {
  undoAutofill();
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 30 } as DOMRect);
  vi.mocked(getProfile).mockResolvedValue(profile);
  vi.mocked(scanFields).mockReturnValue([]);
  vi.mocked(scanAriaFields).mockReturnValue([]);
  vi.mocked(scanRadioGroups).mockReturnValue([]);
  vi.mocked(scanCheckboxGroups).mockReturnValue([]);
  vi.mocked(resolveFieldsWithAI).mockResolvedValue([]);
});
afterEach(() => undoAutofill());

describe('shared fill tracking with the real AI and native filling pipeline', () => {
  it('counts unanswered radio groups even when AI returns no response for them', async () => {
    vi.mocked(scanRadioGroups).mockReturnValue([group('radio', 'Work eligibility')]);
    await scanAutofill('run');
    expect(await executeAutofill('overwrite')).toMatchObject({
      totalScanned: 1,
      lowConfidence: 1,
      noReview: 0,
    });
    expect(getFillLog()?.fields[0]).toMatchObject({
      kind: 'radio',
      ai: { outcome: 'no_response' },
      outcome: 'not_matched',
    });
    expect(summarizeFillFields(getFillLog()!.fields).sentToAI).toBe(1);
  });

  it('keeps existing answers and excludes consent without labelling either as a successful fill', async () => {
    vi.mocked(scanFields).mockReturnValue([input('Name', 'Existing')]);
    const eligibility = group('radio', 'Work eligibility');
    eligibility.options[1].element.checked = true;
    vi.mocked(scanRadioGroups).mockReturnValue([
      eligibility,
      group('radio', 'Privacy consent', true),
    ]);
    expect(await scanAutofill('run')).toMatchObject({ preFilledCount: 2 });
    expect(await executeAutofill('merge')).toMatchObject({
      totalScanned: 3,
      kept: 2,
      excluded: 1,
      noReview: 0,
      lowConfidence: 0,
    });
    expect(resolveFieldsWithAI).not.toHaveBeenCalled();
  });

  it('records failed handoffs while preserving real rule fills', async () => {
    const name = input('Name');
    vi.mocked(scanFields).mockReturnValue([name]);
    vi.mocked(scanRadioGroups).mockReturnValue([group('radio', 'Work eligibility')]);
    vi.mocked(resolveFieldsWithAI).mockRejectedValueOnce(new Error('provider unavailable'));
    await scanAutofill('run');
    expect(await executeAutofill('overwrite')).toMatchObject({
      noReview: 1,
      lowConfidence: 1,
      totalScanned: 2,
      aiStatus: 'unavailable',
    });
    expect(name.value).toBe('Jane');
    expect(getFillLog()?.fields[1].ai.outcome).toBe('failed');
    expect(summarizeFillFields(getFillLog()!.fields)).toMatchObject({
      sentToAI: 1,
      aiFailed: 1,
      ruleFilled: 1,
    });
  });

  it('counts an AI refinement once and preserves both processing stages', async () => {
    const summary = input('Summary');
    vi.mocked(scanFields).mockReturnValue([summary]);
    vi.mocked(resolveFieldsWithAI).mockResolvedValueOnce([
      { fieldId: 'field_001', confidence: 'high', profilePath: 'professional.summary' },
    ]);
    await scanAutofill('run');
    expect(await executeAutofill('overwrite')).toMatchObject({
      noReview: 1,
      needReview: 0,
      totalScanned: 1,
    });
    expect(summary.value).toBe('Stored summary');
    expect(summarizeFillFields(getFillLog()!.fields)).toMatchObject({
      detected: 1,
      filled: 1,
      ruleFilled: 1,
      sentToAI: 1,
      aiFilled: 0,
      aiRefined: 1,
    });
  });

  it('records missing profile values separately from no match', async () => {
    const missing = input('Unknown');
    vi.mocked(scanFields).mockReturnValue([missing]);
    vi.mocked(resolveFieldsWithAI).mockResolvedValueOnce([
      { fieldId: 'field_001', confidence: 'high', profilePath: 'personal.lastName' },
    ]);
    await scanAutofill('run');
    expect(await executeAutofill('overwrite')).toMatchObject({ noData: 1, lowConfidence: 0 });
    expect(getFillLog()?.fields[0].ai.outcome).toBe('missing_data');
    expect(missing.dataset.jbMissingData).toBe('1');
    expect(missing.style.backgroundColor).toBe('rgba(107, 114, 128, 0.12)');
    undoAutofill();
    expect(missing.style.outline).toBe('');
    expect(missing.style.backgroundColor).toBe('');
  });

  it('reports an unsuccessful file fill as failed rather than filled or missing data', async () => {
    const file = input('CV');
    file.type = 'file';
    vi.mocked(scanFields).mockReturnValue([file]);
    await scanAutofill('run');
    expect(await executeAutofill('overwrite')).toMatchObject({
      totalScanned: 1,
      noReview: 0,
      failed: 1,
      noData: 0,
    });
    expect(getFillLog()?.fields[0]).toMatchObject({
      kind: 'file',
      rule: { outcome: 'failed' },
      outcome: 'failed',
    });
  });

  it('updates shared outcomes after repeated edits and clears without changing rule attribution', async () => {
    const name = input('Name');
    vi.mocked(scanFields).mockReturnValue([name]);
    await scanAutofill('run');
    await executeAutofill('overwrite');
    name.value = 'Edited';
    name.dispatchEvent(new Event('input'));
    expect(getLastResult()).toMatchObject({ noReview: 1, manual: 1 });
    expect(getFillLog()?.fields[0]).toMatchObject({
      source: 'manual',
      outcome: 'manual',
      rule: { outcome: 'filled' },
    });
    name.value = '';
    name.dispatchEvent(new Event('input'));
    expect(getLastResult()).toMatchObject({ noReview: 0, lowConfidence: 1, manual: 0 });
    expect(getFillLog()?.fields[0].reason).toBe('manual_clear');
    name.value = 'Again';
    name.dispatchEvent(new Event('change'));
    expect(getLastResult()).toMatchObject({ noReview: 1, lowConfidence: 0, manual: 1 });
  });

  it('retains an explicitly undone snapshot without putting profile values or keys in the log', async () => {
    vi.mocked(scanFields).mockReturnValue([input('Name')]);
    await scanAutofill('run');
    await executeAutofill('overwrite');
    undoAutofill();
    expect(getLastResult()).toBeNull();
    expect(getFillLog()?.status).toBe('undone');
    const serialized = JSON.stringify(getFillLog());
    expect(serialized).not.toContain('synthetic-secret-key');
    expect(serialized).not.toContain('private@example.test');
    expect(serialized).not.toContain('Jane');
  });

  it('does not hand a rule-filled current-job checkbox to AI a second time', async () => {
    const current = input('Current job');
    current.type = 'checkbox';
    vi.mocked(scanCheckboxGroups).mockReturnValue([
      {
        name: 'current',
        groupLabel: 'Current job',
        isConsent: false,
        options: [{ element: current, label: 'Currently working here', value: 'on' }],
      },
    ]);
    await scanAutofill('run');
    const result = await executeAutofill('overwrite');
    expect(current.checked).toBe(true);
    expect(result).toMatchObject({ totalScanned: 1, noReview: 1 });
    expect(resolveFieldsWithAI).not.toHaveBeenCalled();
  });
});
