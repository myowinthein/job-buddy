import { describe, it, expect } from 'vitest';
import { toGeminiModel, fallbackModels, DEFAULT_GEMINI_MODEL } from './types';

describe('fallbackModels', () => {
  it('tries the chosen model first', () => {
    expect(fallbackModels('gemini-3.8-flash')[0]).toBe('gemini-3.8-flash');
  });

  it('follows with every other model once, in priority order', () => {
    expect(fallbackModels('gemini-3.8-flash')).toEqual([
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
    ]);
  });

  it('keeps the priority order when the first model is chosen', () => {
    expect(fallbackModels('gemini-3.5-flash-lite')).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ]);
  });
});

describe('toGeminiModel', () => {
  it('returns the stored value when it is a valid GeminiModel', () => {
    expect(toGeminiModel('gemini-3.8-flash')).toBe('gemini-3.8-flash');
  });

  it('falls back to the default for a stale/unknown model id', () => {
    expect(toGeminiModel('gemini-2.5-flash')).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('falls back to the default for null', () => {
    expect(toGeminiModel(null)).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('falls back to the default for undefined', () => {
    expect(toGeminiModel(undefined)).toBe(DEFAULT_GEMINI_MODEL);
  });
});
