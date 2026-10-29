// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Profile } from '../types/profile';

vi.mock('../utils/storage', () => ({
  getProfile: vi.fn(),
  getLearnedMappings: vi.fn().mockResolvedValue({}),
  saveLearnedMappings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./scanner', () => ({
  scanRadioGroups: vi.fn().mockReturnValue([]),
  scanFields: vi.fn().mockReturnValue([]),
  scanAriaFields: vi.fn().mockReturnValue([]),
  scanCheckboxGroups: vi.fn().mockReturnValue([]),
}));
vi.mock('./signals', () => ({
  extractSignals: vi.fn().mockReturnValue({ label: '', ariaLabel: '', placeholder: '', name: 'field', id: '', type: 'text' }),
  bestLabel: vi.fn().mockReturnValue('Test Field'),
}));
vi.mock('./mapper', () => ({ mapField: vi.fn() }));
vi.mock('./filler', () => ({
  fillField: vi.fn().mockResolvedValue(true),
  fillFileField: vi.fn().mockResolvedValue(true),
  fillCheckboxInput: vi.fn(),
  clearFieldValue: vi.fn(),
}));
vi.mock('./highlighter', () => ({
  applyHighlight: vi.fn(),
  clearElementHighlight: vi.fn(),
  clearHighlights: vi.fn(),
}));
// flattenProfileValues is left as the real implementation (pure, no chrome
// deps) so the learned-mapping-linking tests exercise real matching logic;
// only resolveProfileValue (used by the silent-refill tests) is mocked.
vi.mock('./resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./resolver')>();
  return { ...actual, resolveProfileValue: vi.fn() };
});
vi.mock('./mappings', () => ({
  refreshLearnedLabels: vi.fn().mockReturnValue(false),
  saveElementMappings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./ai', () => ({ runAIAutofill: vi.fn().mockResolvedValue(false) }));

import { scanAutofill, executeAutofill, undoAutofill, getLastResult, EMPTY_AUTOFILL_RESULT } from './index';
import { getProfile, saveLearnedMappings } from '../utils/storage';
import { scanFields, scanAriaFields, scanCheckboxGroups } from './scanner';
import { mapField } from './mapper';
import { clearFieldValue, fillField, fillCheckboxInput, fillFileField } from './filler';
import { clearElementHighlight, clearHighlights, applyHighlight } from './highlighter';
import { resolveProfileValue } from './resolver';
import { refreshLearnedLabels, saveElementMappings } from './mappings';
import { runAIAutofill } from './ai';
import { CONF_CONFIRMED } from './constants';

function makeProfile(): Profile {
  return {
    personal: { firstName: 'Jane', lastName: 'Doe' },
    links: { linkedin: 'https://linkedin.com/in/janedoe', portfolio: 'https://myportfolio.com' },
  } as unknown as Profile;
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

  it('does not write learned mappings when no field label needed backfilling', async () => {
    vi.mocked(scanFields).mockReturnValue([makeInput(), makeInput()]);
    vi.mocked(refreshLearnedLabels).mockReturnValue(false);

    await scanAutofill();
    expect(saveLearnedMappings).not.toHaveBeenCalled();
  });

  it('batches label backfills from multiple fields into a single write', async () => {
    vi.mocked(scanFields).mockReturnValue([makeInput(), makeInput(), makeInput()]);
    vi.mocked(refreshLearnedLabels).mockReturnValue(true);

    await scanAutofill();
    expect(refreshLearnedLabels).toHaveBeenCalledTimes(3);
    expect(saveLearnedMappings).toHaveBeenCalledTimes(1);
  });

  it('resolves a label-matched phone field to the full number when no calling-code sibling is present', async () => {
    const phoneEl = makeInput();
    vi.mocked(scanFields).mockReturnValue([phoneEl]);
    vi.mocked(mapField).mockReturnValueOnce({
      confidence: 0.85, value: '812345678', fieldPath: 'personal.phone.number', matchLayer: 'dictionary_exact',
    });
    vi.mocked(resolveProfileValue).mockReturnValueOnce('+66 812345678');

    await scanAutofill();
    await executeAutofill('overwrite');
    expect(fillField).toHaveBeenCalledWith(phoneEl, '+66 812345678', expect.any(Function));
  });

  it('resolves a label-matched phone field to the local number when a calling-code sibling is present', async () => {
    const phoneEl = makeInput();
    const codeEl  = makeInput();
    vi.mocked(scanFields).mockReturnValue([phoneEl, codeEl]);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.85, value: '+66 812345678', fieldPath: 'personal.phone.full', matchLayer: 'dictionary_exact' })
      .mockReturnValueOnce({ confidence: 0.85, value: '+66', fieldPath: 'personal.phone.callingCode', matchLayer: 'dictionary_exact' });
    vi.mocked(resolveProfileValue).mockReturnValueOnce('812345678');

    await scanAutofill();
    await executeAutofill('overwrite');
    expect(fillField).toHaveBeenCalledWith(phoneEl, '812345678', expect.any(Function));
  });

  it('does not override an autocomplete-matched phone field even with a calling-code sibling present', async () => {
    const phoneEl = makeInput();
    const codeEl  = makeInput();
    vi.mocked(scanFields).mockReturnValue([phoneEl, codeEl]);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.95, value: '+66 812345678', fieldPath: 'personal.phone.full', matchLayer: 'autocomplete' })
      .mockReturnValueOnce({ confidence: 0.85, value: '+66', fieldPath: 'personal.phone.callingCode', matchLayer: 'dictionary_exact' });

    await scanAutofill();
    await executeAutofill('overwrite');
    expect(fillField).toHaveBeenCalledWith(phoneEl, '+66 812345678', expect.any(Function));
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

  it('sends a needReview field to the AI layer as a text candidate', async () => {
    const el = makeInput();
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValue({ confidence: 0.7, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'dictionary_exact' });
    await scanAutofill();
    await executeAutofill('overwrite');

    expect(runAIAutofill).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ element: el, originalState: 'needReview' }),
      ]),
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(),
    );
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

describe('edit-watcher promotion (blur)', () => {
  it('promotes a lowConfidence field to noReview on blur when its value changed', async () => {
    const el = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.3, value: null, fieldPath: 'a.b', matchLayer: 'fuzzy' });

    await scanAutofill();
    const result = await executeAutofill('merge');
    expect(result.lowConfidence).toBe(1);

    el.value = 'user typed this';
    el.dispatchEvent(new Event('blur'));

    expect(applyHighlight).toHaveBeenCalledWith(el, CONF_CONFIRMED);
    const live = getLastResult();
    expect(live?.noReview).toBe(1);
    expect(live?.lowConfidence).toBe(0);
  });

  it('promotes a needReview field to noReview on blur and decrements needReview', async () => {
    const el = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.7, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'context' });

    await scanAutofill();
    const result = await executeAutofill('merge');
    expect(result.needReview).toBe(1);

    el.value = 'user changed this';
    el.dispatchEvent(new Event('blur'));

    const live = getLastResult();
    expect(live?.noReview).toBe(1);
    expect(live?.needReview).toBe(0);
  });

  it('promotes a noData field to noReview on blur, decrements noData, and removes it from the silent-refill registry', async () => {
    const el = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.7, value: null, fieldPath: 'personal.email', matchLayer: 'context' });

    await scanAutofill();
    const result = await executeAutofill('merge');
    expect(result.noData).toBe(1);

    el.value = 'user typed this';
    el.dispatchEvent(new Event('blur'));

    const live = getLastResult();
    expect(live?.noReview).toBe(1);
    expect(live?.noData).toBe(0);

    // The field left the silent-refill registry — a later visibilitychange
    // must not touch it again (getProfile would be called again by
    // runSilentRefill if the entry were still tracked).
    vi.mocked(getProfile).mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('does not fire the promotion when blurring without any value change', async () => {
    const el = makeInput('unchanged');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.3, value: null, fieldPath: 'a.b', matchLayer: 'fuzzy' });

    await scanAutofill();
    await executeAutofill('overwrite');
    vi.mocked(applyHighlight).mockClear();

    el.dispatchEvent(new Event('blur'));

    expect(applyHighlight).not.toHaveBeenCalled();
    expect(getLastResult()?.lowConfidence).toBe(1);
  });

  it('ignores a stale blur after undo resets the session', async () => {
    const el = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.3, value: null, fieldPath: 'a.b', matchLayer: 'fuzzy' });

    await scanAutofill();
    await executeAutofill('merge');
    undoAutofill();
    vi.mocked(applyHighlight).mockClear();

    el.value = 'typed after undo';
    el.dispatchEvent(new Event('blur'));

    expect(applyHighlight).not.toHaveBeenCalled();
  });
});

describe('learned-mapping linking on blur (content-based, all tiers)', () => {
  it('saves the profile path whose value best matches the edit, even when it differs from the mapper\'s guess', async () => {
    // Guessed path ('a.b') is unrelated/wrong — the save should still find
    // links.linkedin by matching the typed content, not the guess.
    const el = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.3, value: null, fieldPath: 'a.b', matchLayer: 'fuzzy' });

    await scanAutofill();
    await executeAutofill('merge');

    el.value = 'https://linkedin.com/in/janedoe';
    el.dispatchEvent(new Event('blur'));

    await vi.waitFor(() =>
      expect(saveElementMappings).toHaveBeenCalledWith(window.location.hostname, el, 'links.linkedin'),
    );
  });

  it('saves for needReview, lowConfidence, and noData alike — not just one tier', async () => {
    const elYellow = makeInput('');
    const elRed    = makeInput('');
    const elGray   = makeInput('');
    vi.mocked(scanFields).mockReturnValue([elYellow, elRed, elGray]);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.7, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'context' })
      .mockReturnValueOnce({ confidence: 0.3, value: null, fieldPath: null, matchLayer: 'none' })
      .mockReturnValueOnce({ confidence: 0.65, value: null, fieldPath: 'personal.email', matchLayer: 'context' });

    await scanAutofill();
    await executeAutofill('merge');

    elYellow.value = 'Jane Doe';
    elYellow.dispatchEvent(new Event('blur'));
    elRed.value = 'https://myportfolio.com';
    elRed.dispatchEvent(new Event('blur'));
    elGray.value = 'https://linkedin.com/in/janedoe';
    elGray.dispatchEvent(new Event('blur'));

    await vi.waitFor(() => expect(saveElementMappings).toHaveBeenCalledTimes(3));
    expect(saveElementMappings).toHaveBeenCalledWith(window.location.hostname, elRed, 'links.portfolio');
    expect(saveElementMappings).toHaveBeenCalledWith(window.location.hostname, elGray, 'links.linkedin');
  });

  it('matches an edited value against a profile value in a different case', async () => {
    // Profile stores 'Jane' (personal.firstName); typing the same text in a
    // different case should still be recognized as a match — Levenshtein
    // distance is case-sensitive, so this requires normalizing both sides
    // before comparing, not just the caller's mapper-guess fallback.
    const el = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.3, value: null, fieldPath: null, matchLayer: 'none' });

    await scanAutofill();
    await executeAutofill('merge');

    el.value = 'JANE';
    el.dispatchEvent(new Event('blur'));

    await vi.waitFor(() =>
      expect(saveElementMappings).toHaveBeenCalledWith(window.location.hostname, el, 'personal.firstName'),
    );
  });

  it('does not save when nothing in the profile resembles the edited value', async () => {
    const el = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.3, value: null, fieldPath: null, matchLayer: 'none' });

    await scanAutofill();
    await executeAutofill('merge');

    el.value = 'I want to work here because of the great company culture';
    el.dispatchEvent(new Event('blur'));

    await Promise.resolve();
    await Promise.resolve();
    expect(saveElementMappings).not.toHaveBeenCalled();
  });

  it('does not save when the edited value is shorter than the minimum length', async () => {
    const el = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.3, value: null, fieldPath: null, matchLayer: 'none' });

    await scanAutofill();
    await executeAutofill('merge');

    el.value = 'Doe'; // 3 chars, below EDIT_LEARN_MIN_VALUE_LENGTH
    el.dispatchEvent(new Event('blur'));

    await Promise.resolve();
    await Promise.resolve();
    expect(saveElementMappings).not.toHaveBeenCalled();
  });

  it('does not save when the field is cleared to empty', async () => {
    const el = makeInput('Jane');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.7, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'context' });

    await scanAutofill();
    await executeAutofill('overwrite');

    el.value = '';
    el.dispatchEvent(new Event('blur'));

    await Promise.resolve();
    await Promise.resolve();
    expect(saveElementMappings).not.toHaveBeenCalled();
  });
});

describe('queueMappingSave serialization', () => {
  it('does not start the next queued save until the previous one settles', async () => {
    const el1 = makeInput('');
    const el2 = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el1, el2]);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.7, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'context' })
      .mockReturnValueOnce({ confidence: 0.7, value: null, fieldPath: 'links.linkedin', matchLayer: 'context' });

    await scanAutofill();
    await executeAutofill('merge');

    let resolveFirst: () => void = () => {};
    let callCount = 0;
    vi.mocked(saveElementMappings).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return new Promise((resolve) => { resolveFirst = resolve; });
      return Promise.resolve();
    });

    el1.value = 'Jane Doe'; // similar to profile firstName — qualifies
    el1.dispatchEvent(new Event('blur'));
    el2.value = 'https://linkedin.com/in/janedoe'; // similar to profile linkedin — qualifies
    el2.dispatchEvent(new Event('blur'));

    // Both blur handlers ran synchronously, but the second save must not have
    // started yet — it's chained behind the still-pending first save.
    await Promise.resolve();
    await Promise.resolve();
    expect(saveElementMappings).toHaveBeenCalledTimes(1);

    resolveFirst();
    await vi.waitFor(() => expect(saveElementMappings).toHaveBeenCalledTimes(2));
  });

  it('continues processing later queued saves after an earlier one rejects', async () => {
    const el1 = makeInput('');
    const el2 = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el1, el2]);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.7, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'context' })
      .mockReturnValueOnce({ confidence: 0.7, value: null, fieldPath: 'links.linkedin', matchLayer: 'context' });

    await scanAutofill();
    await executeAutofill('merge');

    vi.mocked(saveElementMappings)
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce(undefined);

    el1.value = 'Jane Doe';
    el1.dispatchEvent(new Event('blur'));
    el2.value = 'https://linkedin.com/in/janedoe';
    el2.dispatchEvent(new Event('blur'));

    await vi.waitFor(() => expect(saveElementMappings).toHaveBeenCalledTimes(2));
  });
});

describe('AI green-filled elements are excluded from edit-watching', () => {
  it('does not promote an AI-green-filled element on a later blur', async () => {
    const el = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.7, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'context' });
    vi.mocked(runAIAutofill).mockImplementation(async (_c, _p, _r, _s, _dbg, options) => {
      options?.onTextFilled?.(el, 'green');
      return true;
    });

    await scanAutofill();
    await executeAutofill('overwrite');

    vi.mocked(applyHighlight).mockClear();
    vi.mocked(saveElementMappings).mockClear();

    el.value = 'something the user typed afterward';
    el.dispatchEvent(new Event('blur'));

    await Promise.resolve();
    await Promise.resolve();
    // No edit-watcher was attached for this element (it was filtered out of
    // editableFields before attachEditWatchers ran), so blurring it now does
    // nothing — no promotion highlight, no learned-mapping save.
    expect(applyHighlight).not.toHaveBeenCalled();
    expect(saveElementMappings).not.toHaveBeenCalled();
  });

  it('still edit-watches a needReview field AI did not resolve to green', async () => {
    const el = makeInput('');
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.7, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'context' });
    vi.mocked(runAIAutofill).mockResolvedValue(false); // AI unavailable — no text outcomes reported

    await scanAutofill();
    await executeAutofill('overwrite');
    vi.mocked(applyHighlight).mockClear();

    el.value = 'Jane Smith';
    el.dispatchEvent(new Event('blur'));

    expect(applyHighlight).toHaveBeenCalledWith(el, CONF_CONFIRMED);
  });
});

describe('all three tiers reach the AI layer', () => {
  it('sends lowConfidence and noData fields to runAIAutofill as text candidates', async () => {
    const elRed  = makeInput();
    const elGray = makeInput();
    vi.mocked(scanFields).mockReturnValue([elRed, elGray]);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.3, value: null, fieldPath: 'a.b', matchLayer: 'fuzzy' })
      .mockReturnValueOnce({ confidence: 0.65, value: null, fieldPath: 'personal.email', matchLayer: 'context' });

    await scanAutofill();
    await executeAutofill('overwrite');

    expect(runAIAutofill).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ element: elRed, originalState: 'lowConfidence' }),
        expect.objectContaining({ element: elGray, originalState: 'noData' }),
      ]),
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(),
    );
  });
});

describe('silent re-fill on visibilitychange', () => {
  // jsdom's default document.visibilityState is 'prerender', not 'visible' —
  // the handler no-ops unless the tab is actually visible.
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('fills a noData field silently once the profile value becomes available', async () => {
    const el = makeInput('');
    document.body.appendChild(el);
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.7, value: null, fieldPath: 'personal.email', matchLayer: 'context' });

    await scanAutofill();
    const result = await executeAutofill('merge');
    expect(result.noData).toBe(1);

    vi.mocked(resolveProfileValue).mockReturnValue('jane@example.com');
    vi.mocked(fillField).mockClear();

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(fillField).toHaveBeenCalledWith(el, 'jane@example.com', expect.any(Function)));

    expect(applyHighlight).toHaveBeenCalledWith(el, CONF_CONFIRMED);
    const live = getLastResult();
    expect(live?.noData).toBe(0);
    expect(live?.noReview).toBe(1);

    // The blur watcher was torn down as part of the silent refill — a later
    // edit must not re-fire the promotion logic a second time.
    vi.mocked(applyHighlight).mockClear();
    el.value = 'something else the user typed';
    el.dispatchEvent(new Event('blur'));
    expect(applyHighlight).not.toHaveBeenCalled();
    expect(getLastResult()?.noReview).toBe(1); // unchanged, not double-counted

    el.remove();
  });

  it('leaves a noData field untouched and keeps watching when the profile value is still empty', async () => {
    const el = makeInput('');
    document.body.appendChild(el);
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.7, value: null, fieldPath: 'personal.email', matchLayer: 'context' });

    await scanAutofill();
    await executeAutofill('merge');

    vi.mocked(resolveProfileValue).mockReturnValue('');
    vi.mocked(fillField).mockClear();

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();

    expect(fillField).not.toHaveBeenCalled();
    expect(getLastResult()?.noData).toBe(1);

    el.remove();
  });

  it('drops a noData entry silently if its element has been removed from the DOM', async () => {
    const el = makeInput('');
    document.body.appendChild(el);
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.7, value: null, fieldPath: 'personal.email', matchLayer: 'context' });

    await scanAutofill();
    await executeAutofill('merge');

    el.remove();
    vi.mocked(resolveProfileValue).mockReturnValue('jane@example.com');
    vi.mocked(fillField).mockClear();

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();

    expect(fillField).not.toHaveBeenCalled();
  });

  it('does not silently re-fill a noData field AI already resolved to green', async () => {
    // A field that starts noData (confidence >= CONF_FILL, but the rule
    // pipeline's profile value is empty) and is then AI-green-filled must be
    // purged from the noData registry — otherwise a later tab refocus would
    // silently overwrite AI's answer with whatever the profile value has
    // become in the meantime, even though AI's decision was meant to be final.
    const el = makeInput('');
    document.body.appendChild(el);
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.7, value: null, fieldPath: 'personal.email', matchLayer: 'context' });
    vi.mocked(runAIAutofill).mockImplementation(async (_c, _p, _r, _s, _dbg, options) => {
      options?.onTextFilled?.(el, 'green');
      return true;
    });

    await scanAutofill();
    await executeAutofill('merge');

    vi.mocked(resolveProfileValue).mockReturnValue('jane@example.com');
    vi.mocked(fillField).mockClear();

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();

    expect(fillField).not.toHaveBeenCalled();

    el.remove();
  });
});

describe('scanAutofill + executeAutofill — currently-studying checkbox', () => {
  it('checks a matched checkbox when the resolved education entry is current', async () => {
    const checkboxEl = document.createElement('input');
    checkboxEl.type = 'checkbox';

    vi.mocked(getProfile).mockResolvedValue({
      ...makeProfile(),
      education: [{ institution: 'MIT', degree: 'MSc', fieldOfStudy: 'CS', startDate: '2023-09', isCurrent: true }],
    } as unknown as Profile);
    vi.mocked(scanCheckboxGroups).mockReturnValue([
      { name: 'current', groupLabel: '', isConsent: false, options: [{ element: checkboxEl, label: 'Currently studying here', value: 'on' }] },
    ]);

    await scanAutofill();
    await executeAutofill('overwrite');

    expect(fillCheckboxInput).toHaveBeenCalledWith(checkboxEl);
  });

  it('does not check a checkbox whose resolved education entry is not current', async () => {
    const checkboxEl = document.createElement('input');
    checkboxEl.type = 'checkbox';

    vi.mocked(getProfile).mockResolvedValue({
      ...makeProfile(),
      education: [{ institution: 'MIT', degree: 'MSc', fieldOfStudy: 'CS', startDate: '2018-09', endDate: '2022-05' }],
    } as unknown as Profile);
    vi.mocked(scanCheckboxGroups).mockReturnValue([
      { name: 'current', groupLabel: '', isConsent: false, options: [{ element: checkboxEl, label: 'Currently studying here', value: 'on' }] },
    ]);

    await scanAutofill();
    await executeAutofill('overwrite');

    expect(fillCheckboxInput).not.toHaveBeenCalled();
  });

  it('never checks an unrelated (e.g. consent) checkbox', async () => {
    const checkboxEl = document.createElement('input');
    checkboxEl.type = 'checkbox';

    vi.mocked(scanCheckboxGroups).mockReturnValue([
      { name: 'consent', groupLabel: '', isConsent: true, options: [{ element: checkboxEl, label: 'I agree to the Terms of Service', value: 'on' }] },
    ]);

    await scanAutofill();
    await executeAutofill('overwrite');

    expect(fillCheckboxInput).not.toHaveBeenCalled();
  });
});

describe('scanAutofill + executeAutofill — currently-working checkbox', () => {
  it('checks a matched checkbox when the resolved work history entry is current', async () => {
    const checkboxEl = document.createElement('input');
    checkboxEl.type = 'checkbox';

    vi.mocked(getProfile).mockResolvedValue({
      ...makeProfile(),
      workHistory: [{ company: 'Acme', title: 'Senior Engineer', startDate: '2020-01', isCurrent: true }],
    } as unknown as Profile);
    vi.mocked(scanCheckboxGroups).mockReturnValue([
      { name: 'current', groupLabel: '', isConsent: false, options: [{ element: checkboxEl, label: 'Currently working here', value: 'on' }] },
    ]);

    await scanAutofill();
    await executeAutofill('overwrite');

    expect(fillCheckboxInput).toHaveBeenCalledWith(checkboxEl);
  });

  it('does not check a checkbox whose resolved work history entry is not current', async () => {
    const checkboxEl = document.createElement('input');
    checkboxEl.type = 'checkbox';

    vi.mocked(getProfile).mockResolvedValue({
      ...makeProfile(),
      workHistory: [{ company: 'Beta Corp', title: 'Junior Dev', startDate: '2018-06', endDate: '2019-12', isCurrent: false }],
    } as unknown as Profile);
    vi.mocked(scanCheckboxGroups).mockReturnValue([
      { name: 'current', groupLabel: '', isConsent: false, options: [{ element: checkboxEl, label: 'Currently working here', value: 'on' }] },
    ]);

    await scanAutofill();
    await executeAutofill('overwrite');

    expect(fillCheckboxInput).not.toHaveBeenCalled();
  });

  it('checks both an education and a work-history checkbox on the same page independently', async () => {
    const eduCheckbox = document.createElement('input');
    eduCheckbox.type = 'checkbox';
    const workCheckbox = document.createElement('input');
    workCheckbox.type = 'checkbox';

    vi.mocked(getProfile).mockResolvedValue({
      ...makeProfile(),
      education: [{ institution: 'MIT', degree: 'MSc', fieldOfStudy: 'CS', startDate: '2023-09', isCurrent: true }],
      workHistory: [{ company: 'Acme', title: 'Senior Engineer', startDate: '2020-01', isCurrent: true }],
    } as unknown as Profile);
    vi.mocked(scanCheckboxGroups).mockReturnValue([
      { name: 'edu-current', groupLabel: '', isConsent: false, options: [{ element: eduCheckbox, label: 'Currently studying here', value: 'on' }] },
      { name: 'work-current', groupLabel: '', isConsent: false, options: [{ element: workCheckbox, label: 'Currently working here', value: 'on' }] },
    ]);

    await scanAutofill();
    await executeAutofill('overwrite');

    expect(fillCheckboxInput).toHaveBeenCalledWith(eduCheckbox);
    expect(fillCheckboxInput).toHaveBeenCalledWith(workCheckbox);
    expect(fillCheckboxInput).toHaveBeenCalledTimes(2);
  });
});

describe('executeAutofill — file input reconstruction failure', () => {
  it('skips the field without counting it as filled when file reconstruction fails', async () => {
    const el = document.createElement('input');
    el.type = 'file';
    vi.mocked(scanFields).mockReturnValue([el]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.85, value: 'resume.pdf', fieldPath: 'documents.cv.file', matchLayer: 'dictionary_exact' });
    vi.mocked(getProfile).mockResolvedValue({
      ...makeProfile(),
      documents: { cv: { file: { name: 'resume.pdf', size: 1024, base64: 'corrupt' } } },
    } as unknown as Profile);
    vi.mocked(fillFileField).mockResolvedValueOnce(false); // reconstruction failure (corrupt base64, etc.)

    await scanAutofill();
    const result = await executeAutofill('overwrite');

    // Neither counted as a successful fill (noReview/needReview) nor left
    // pending for manual resolution (lowConfidence/noData) — the field is
    // simply skipped, since fillFileField's own log already covers this case.
    expect(result.noReview).toBe(0);
    expect(result.needReview).toBe(0);
    expect(result.lowConfidence).toBe(0);
    expect(result.noData).toBe(0);
    expect(applyHighlight).not.toHaveBeenCalled();
  });
});


describe('session ownership and asynchronous lifecycle', () => {
  beforeEach(() => {
    vi.mocked(runAIAutofill).mockReset().mockResolvedValue(false);
    vi.mocked(fillField).mockReset().mockResolvedValue(true);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('preserves prefilled red, gray and editable ARIA answers through merge and Undo', async () => {
    const red = makeInput('Existing red'); const gray = makeInput('Existing gray');
    const aria = document.createElement('div'); aria.setAttribute('role', 'textbox'); aria.textContent = 'Existing custom';
    vi.mocked(scanFields).mockReturnValue([red, gray]); vi.mocked(scanAriaFields).mockReturnValue([aria]);
    vi.mocked(mapField)
      .mockReturnValueOnce({ confidence: 0.2, value: null, fieldPath: null, matchLayer: 'none' })
      .mockReturnValueOnce({ confidence: 0.9, value: null, fieldPath: 'personal.email', matchLayer: 'dictionary_exact' })
      .mockReturnValueOnce({ confidence: 0.9, value: 'Jane', fieldPath: 'personal.firstName', matchLayer: 'dictionary_exact' });
    expect((await scanAutofill()).preFilledCount).toBe(3);
    await executeAutofill('merge');
    expect(fillField).not.toHaveBeenCalled();
    undoAutofill();
    expect(clearFieldValue).not.toHaveBeenCalled();
    expect([red.value, gray.value, aria.textContent]).toEqual(['Existing red', 'Existing gray', 'Existing custom']);
  });

  it('does not treat highlighting an unmatched existing answer as ownership to clear it', async () => {
    const input = makeInput('Keep me');
    vi.mocked(scanFields).mockReturnValue([input]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.2, value: null, fieldPath: null, matchLayer: 'none' });
    await scanAutofill(); await executeAutofill('overwrite'); undoAutofill();
    expect(clearFieldValue).not.toHaveBeenCalledWith(input);
    expect(input.value).toBe('Keep me');
  });

  it('consumes one scanned snapshot once without scanning again, even with concurrent fill requests', async () => {
    const input = makeInput(); vi.mocked(scanFields).mockReturnValue([input]);
    await scanAutofill();
    vi.mocked(scanFields).mockReturnValue([input, makeInput()]);
    const results = await Promise.all([executeAutofill('overwrite'), executeAutofill('overwrite')]);
    expect(scanFields).toHaveBeenCalledTimes(1); expect(mapField).toHaveBeenCalledTimes(1);
    expect(fillField).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.totalScanned).sort()).toEqual([0, 1]);
  });

  it('refills a connected shadow field only once across overlapping visibility events', async () => {
    const host = document.createElement('div'); const root = host.attachShadow({ mode: 'open' });
    const input = makeInput(); root.appendChild(input); document.body.appendChild(host);
    vi.mocked(scanFields).mockReturnValue([input]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.9, value: null, fieldPath: 'personal.email', matchLayer: 'dictionary_exact' });
    await scanAutofill(); await executeAutofill('merge');
    vi.mocked(resolveProfileValue).mockReturnValue('new@example.test');
    let finish!: () => void;
    vi.mocked(fillField).mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = () => resolve(true); }));
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(fillField).toHaveBeenCalledTimes(1));
    finish(); await vi.waitFor(() => expect(getLastResult()?.noReview).toBe(1));
    expect(getLastResult()?.noData).toBe(0); host.remove();
  });

  it('does not refill or restore counts when Undo happens during a profile read', async () => {
    const input = makeInput(); document.body.appendChild(input);
    vi.mocked(scanFields).mockReturnValue([input]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.9, value: null, fieldPath: 'personal.email', matchLayer: 'dictionary_exact' });
    await scanAutofill(); await executeAutofill('merge');
    let finish!: (p: Profile) => void;
    vi.mocked(getProfile).mockImplementationOnce(() => new Promise<Profile>((resolve) => { finish = resolve; }));
    vi.mocked(resolveProfileValue).mockReturnValue('new@example.test');
    document.dispatchEvent(new Event('visibilitychange'));
    undoAutofill(); finish(makeProfile());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(fillField).not.toHaveBeenCalled(); expect(getLastResult()).toBeNull(); input.remove();
  });

  it.each(['lowConfidence', 'noData'] as const)('tracks AI-yellow %s as yellow until the user edits it once', async (origin) => {
    const input = makeInput(); document.body.appendChild(input);
    vi.mocked(scanFields).mockReturnValue([input]);
    vi.mocked(mapField).mockReturnValueOnce({ confidence: origin === 'noData' ? 0.9 : 0.2, value: null, fieldPath: 'personal.email', matchLayer: 'dictionary_exact' });
    vi.mocked(runAIAutofill).mockImplementationOnce(async (_c, _p, result, owned, _dbg, options) => {
      result[origin]--; result.needReview++;
      input.value = 'AI answer'; owned.push(input); options?.onTextFilled?.(input, 'yellow');
      return true;
    });
    await scanAutofill(); await executeAutofill('overwrite');
    input.value = 'Human answer'; input.dispatchEvent(new Event('blur'));
    expect(getLastResult()).toMatchObject({ noReview: 1, needReview: 0, noData: 0, lowConfidence: 0 });
    input.dispatchEvent(new Event('blur'));
    expect(getLastResult()?.noReview).toBe(1); input.remove();
  });
});

it('does not double-count a manual resolution during an asynchronous refill', async () => {
  vi.mocked(runAIAutofill).mockReset().mockResolvedValue(false);
  vi.mocked(fillField).mockReset().mockResolvedValue(true);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  const input = makeInput(); document.body.appendChild(input);
  vi.mocked(scanFields).mockReturnValue([input]);
  vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.9, value: null, fieldPath: 'personal.email', matchLayer: 'dictionary_exact' });
  await scanAutofill(); await executeAutofill('merge');
  vi.mocked(resolveProfileValue).mockReturnValue('profile@example.test');
  vi.mocked(fillField).mockImplementationOnce(async () => {
    input.value = 'human@example.test'; input.dispatchEvent(new Event('blur'));
    return false;
  });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(fillField).toHaveBeenCalled());
  expect(getLastResult()).toMatchObject({ noReview: 1, noData: 0 });
  expect(input.value).toBe('human@example.test'); input.remove();
});

it('does not let an older scan replace the snapshot of a newer scan', async () => {
  vi.mocked(runAIAutofill).mockReset().mockResolvedValue(false);
  vi.mocked(fillField).mockReset().mockResolvedValue(true);
  let finishOld!: (profile: Profile) => void;
  vi.mocked(getProfile).mockImplementationOnce(() => new Promise<Profile>((resolve) => { finishOld = resolve; }));
  const olderScan = scanAutofill();
  const currentInput = makeInput();
  vi.mocked(scanFields).mockReturnValue([currentInput]);
  await scanAutofill();
  finishOld(makeProfile()); await olderScan;
  expect(mapField).toHaveBeenCalledTimes(1);
  const result = await executeAutofill('overwrite');
  expect(result.totalScanned).toBe(1);
  expect(fillField).toHaveBeenCalledTimes(1);
  expect(fillField).toHaveBeenCalledWith(currentInput, 'Jane', expect.any(Function));
});

it('removes AI-yellow former gray fields from visibility refill without overwriting the answer', async () => {
  vi.mocked(runAIAutofill).mockReset().mockResolvedValue(false);
  vi.mocked(fillField).mockReset().mockResolvedValue(true);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  const input = makeInput(); document.body.appendChild(input);
  vi.mocked(scanFields).mockReturnValue([input]);
  vi.mocked(mapField).mockReturnValueOnce({ confidence: 0.9, value: null, fieldPath: 'personal.email', matchLayer: 'dictionary_exact' });
  vi.mocked(runAIAutofill).mockImplementationOnce(async (_c, _p, result, owned, _dbg, options) => {
    input.value = 'ai@example.test'; owned.push(input); result.noData--; result.needReview++;
    options?.onTextFilled?.(input, 'yellow'); return true;
  });
  await scanAutofill(); await executeAutofill('overwrite');
  vi.mocked(getProfile).mockClear();
  document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  expect(getProfile).not.toHaveBeenCalled(); expect(fillField).not.toHaveBeenCalled();
  expect(input.value).toBe('ai@example.test');
  expect(getLastResult()).toMatchObject({ noData: 0, needReview: 1, noReview: 0 });
  input.remove();
});
