// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Profile } from '../types/profile';

vi.mock('../utils/storage', () => ({
  getProfile: vi.fn(),
  getLearnedMappings: vi.fn().mockResolvedValue({}),
}));
vi.mock('./scanner', () => ({
  scanFields: vi.fn().mockReturnValue([]),
  scanAriaFields: vi.fn().mockReturnValue([]),
}));
vi.mock('./signals', () => ({
  extractSignals: vi.fn().mockReturnValue({ label: '', ariaLabel: '', placeholder: '', name: 'field', id: '', type: 'text' }),
  bestLabel: vi.fn().mockReturnValue('Test Field'),
}));
vi.mock('./mapper', () => ({ mapField: vi.fn() }));
vi.mock('./filler', () => ({
  fillField: vi.fn().mockResolvedValue(undefined),
  fillFileField: vi.fn().mockResolvedValue(true),
  clearFieldValue: vi.fn(),
}));
vi.mock('./highlighter', () => ({
  applyHighlight: vi.fn(),
  clearElementHighlight: vi.fn(),
  clearHighlights: vi.fn(),
}));
vi.mock('./picker', () => ({
  attachPickerListeners: vi.fn(),
  removePickerListener: vi.fn(),
  closePickerIfOpenFor: vi.fn(),
}));
vi.mock('./resolver', () => ({ resolveProfileValue: vi.fn() }));
vi.mock('./mappings', () => ({ saveElementMappings: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./ai', () => ({ runAIAutofill: vi.fn().mockResolvedValue(false) }));

import { scanAutofill, executeAutofill, undoAutofill, getLastResult, EMPTY_AUTOFILL_RESULT } from './index';
import { getProfile } from '../utils/storage';
import { scanFields, scanAriaFields } from './scanner';
import { mapField } from './mapper';
import { clearFieldValue } from './filler';
import { clearElementHighlight, clearHighlights } from './highlighter';

function makeProfile(): Profile {
  return { personal: { firstName: 'Jane', lastName: 'Doe' } } as unknown as Profile;
}

function makeInput(value = ''): HTMLInputElement {
  const el = document.createElement('input');
  el.value = value;
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
  undoAutofill(); // reset sessionElements, noDataFields, lastResult
  vi.clearAllMocks(); // clear calls produced by undoAutofill itself
  vi.mocked(getProfile).mockResolvedValue(makeProfile());
  vi.mocked(scanFields).mockReturnValue([]);
  vi.mocked(scanAriaFields).mockReturnValue([]);
  vi.mocked(mapField).mockReturnValue({ confidence: 0.9, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'learned' });
});

describe('EMPTY_AUTOFILL_RESULT', () => {
  it('contains all zero counts', () => {
    expect(EMPTY_AUTOFILL_RESULT).toEqual({
      noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0,
    });
  });
});

describe('scanAutofill', () => {
  it('returns zeros when profile is not found', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    expect(await scanAutofill()).toEqual({ preFilledCount: 0, totalMatched: 0 });
  });

  it('returns zeros when no form fields are found', async () => {
    expect(await scanAutofill()).toEqual({ preFilledCount: 0, totalMatched: 0 });
  });

  it('counts fields with confidence ≥ 0.60 and a non-empty value in totalMatched', async () => {
    const el1 = makeInput(); // high-confidence match
    const el2 = makeInput(); // low-confidence → not matched
    vi.mocked(scanFields).mockReturnValue([el1, el2]);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.9, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'learned' })
      .mockReturnValueOnce({ confidence: 0.3, value: '',     fieldPath: null,                 matchLayer: 'none' });

    const result = await scanAutofill();
    expect(result.totalMatched).toBe(1);
    expect(result.preFilledCount).toBe(0);
  });

  it('counts fields whose DOM value is non-empty at scan time in preFilledCount', async () => {
    const elEmpty  = makeInput('');
    const elFilled = makeInput('existing');
    vi.mocked(scanFields).mockReturnValue([elEmpty, elFilled]);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.9, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'learned' })
      .mockReturnValueOnce({ confidence: 0.9, value: 'Doe',  fieldPath: 'personal.lastName',  matchLayer: 'learned' });

    const result = await scanAutofill();
    expect(result.totalMatched).toBe(2);
    expect(result.preFilledCount).toBe(1);
  });
});

describe('executeAutofill', () => {
  it('returns zero result when profile is not found', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    await scanAutofill();
    const result = await executeAutofill('overwrite');
    expect(result.noReview).toBe(0);
    expect(result.totalScanned).toBe(0);
  });

  it('overwrite: confident match with value → noReview (green)', async () => {
    const el = makeInput();
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValue({ confidence: 0.9, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'learned' });
    await scanAutofill();
    const result = await executeAutofill('overwrite');
    expect(result.noReview).toBe(1);
    expect(result.needReview).toBe(0);
    expect(result.lowConfidence).toBe(0);
    expect(result.noData).toBe(0);
  });

  it('overwrite: mid-confidence match with value → needReview (yellow)', async () => {
    const el = makeInput();
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValue({ confidence: 0.7, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'dictionary_exact' });
    await scanAutofill();
    const result = await executeAutofill('overwrite');
    expect(result.needReview).toBe(1);
    expect(result.noReview).toBe(0);
  });

  it('overwrite: low-confidence field → lowConfidence (no fill, red highlight)', async () => {
    const el = makeInput();
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValue({ confidence: 0.3, value: '', fieldPath: null, matchLayer: 'none' });
    await scanAutofill();
    const result = await executeAutofill('overwrite');
    expect(result.lowConfidence).toBe(1);
    expect(result.noReview).toBe(0);
  });

  it('overwrite: confident match with empty profile value → noData (no fill, no highlight)', async () => {
    const el = makeInput();
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValue({ confidence: 0.7, value: '', fieldPath: 'personal.firstName', matchLayer: 'dictionary_exact' });
    await scanAutofill();
    const result = await executeAutofill('overwrite');
    expect(result.noData).toBe(1);
    expect(result.noReview).toBe(0);
  });

  it('totalScanned equals the number of fields found by the scanner regardless of confidence', async () => {
    const els = [makeInput(), makeInput(), makeInput()];
    vi.mocked(scanFields).mockReturnValue(els);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.9, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'learned' })
      .mockReturnValueOnce({ confidence: 0.7, value: 'Doe',  fieldPath: 'personal.lastName',  matchLayer: 'dictionary_exact' })
      .mockReturnValueOnce({ confidence: 0.3, value: '',     fieldPath: null,                 matchLayer: 'none' });
    await scanAutofill();
    const result = await executeAutofill('overwrite');
    expect(result.totalScanned).toBe(3);
  });

  it('merge: skips pre-filled fields and only fills empty ones', async () => {
    const elFilled = makeInput('existing');
    const elEmpty  = makeInput('');
    vi.mocked(scanFields).mockReturnValue([elFilled, elEmpty]);
    // Same high-confidence match for both — only elEmpty should be filled in merge mode
    vi.mocked(mapField).mockReturnValue({ confidence: 0.9, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'learned' });
    await scanAutofill();
    const result = await executeAutofill('merge');
    expect(result.noReview).toBe(1); // only elEmpty was filled
  });

  it('populates lastResult so getLastResult() reflects the fill outcome', async () => {
    const el = makeInput();
    vi.mocked(scanFields).mockReturnValue([el]);
    await scanAutofill();
    await executeAutofill('overwrite');
    const last = getLastResult();
    expect(last).not.toBeNull();
    expect(last!.noReview).toBe(1);
  });
});

describe('undoAutofill', () => {
  it('resets lastResult to null', async () => {
    const el = makeInput();
    vi.mocked(scanFields).mockReturnValue([el]);
    await scanAutofill();
    await executeAutofill('overwrite');
    expect(getLastResult()).not.toBeNull();
    undoAutofill();
    expect(getLastResult()).toBeNull();
  });

  it('calls clearHighlights', () => {
    undoAutofill();
    expect(clearHighlights).toHaveBeenCalledTimes(1);
  });

  it('calls clearFieldValue and clearElementHighlight for each highlighted session element', async () => {
    const el = makeInput();
    vi.mocked(scanFields).mockReturnValue([el]);
    // Green field gets pushed to sessionElements during executeAutofill
    await scanAutofill();
    await executeAutofill('overwrite');
    undoAutofill();
    expect(clearFieldValue).toHaveBeenCalledWith(el);
    expect(clearElementHighlight).toHaveBeenCalledWith(el);
  });
});

describe('two-phase sequence', () => {
  it('scan counts all matched fields; overwrite execute fills them all regardless of pre-fill', async () => {
    const el1 = makeInput('');
    const el2 = makeInput('existing');
    vi.mocked(scanFields).mockReturnValue([el1, el2]);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.9, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'learned' })
      .mockReturnValueOnce({ confidence: 0.9, value: 'Doe',  fieldPath: 'personal.lastName',  matchLayer: 'learned' });

    const scanResult = await scanAutofill();
    expect(scanResult.totalMatched).toBe(2);
    expect(scanResult.preFilledCount).toBe(1); // el2 had an existing value

    const fillResult = await executeAutofill('overwrite');
    expect(fillResult.noReview).toBe(2);     // overwrite fills both green
    expect(fillResult.totalScanned).toBe(2);
  });
});
