import { describe, it, expect } from 'vitest';
import { normalize } from './normalizer';

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
