import { describe, it, expect } from 'vitest';
import { toGeminiModel, DEFAULT_GEMINI_MODEL } from './types';

describe('toGeminiModel', () => {
  it('returns the stored value when it is a valid GeminiModel', () => {
    expect(toGeminiModel('gemini-3.6-flash')).toBe('gemini-3.6-flash');
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
