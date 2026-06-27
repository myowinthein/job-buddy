import { describe, it, expect } from 'vitest';
import { normalize, similarity } from './normalizer';

describe('normalize', () => {
  it('lowercases the input', () => {
    expect(normalize('FirstName')).toBe('firstname');
  });

  it('strips spaces', () => {
    expect(normalize('First Name')).toBe('firstname');
  });

  it('strips hyphens and underscores', () => {
    expect(normalize('first-name_label')).toBe('firstnamelabel');
  });

  it('strips punctuation', () => {
    expect(normalize('first-name!')).toBe('firstname');
  });

  it('returns empty string for empty input', () => {
    expect(normalize('')).toBe('');
  });

  it('returns empty string for special-characters-only input', () => {
    expect(normalize('---')).toBe('');
  });

  it('preserves digits', () => {
    expect(normalize('field123')).toBe('field123');
  });

  it('handles already-normalised input unchanged', () => {
    expect(normalize('email')).toBe('email');
  });
});

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('email', 'email')).toBe(1);
  });

  it('returns 1 for two empty strings', () => {
    expect(similarity('', '')).toBe(1);
  });

  it('returns 0 for completely different strings of the same length', () => {
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('returns a value between 0 and 1 for similar strings', () => {
    const s = similarity('firstname', 'firstnam');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it('is higher for closer strings', () => {
    const close = similarity('firstname', 'firstnam');
    const far   = similarity('firstname', 'zzz');
    expect(close).toBeGreaterThan(far);
  });

  it('is symmetric', () => {
    expect(similarity('email', 'emails')).toBe(similarity('emails', 'email'));
  });
});
