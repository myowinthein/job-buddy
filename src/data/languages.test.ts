import { describe, it, expect } from 'vitest';
import { LANGUAGES, findLanguage } from './languages';

describe('LANGUAGES', () => {
  it('contains entries with code, name, and country fields', () => {
    expect(LANGUAGES.length).toBeGreaterThan(0);
    for (const lang of LANGUAGES) {
      expect(lang.code).toBeTruthy();
      expect(lang.name).toBeTruthy();
      expect(lang.country).toBeTruthy();
    }
  });
});

describe('findLanguage', () => {
  it('finds a language by ISO 639-1 code', () => {
    const lang = findLanguage('en');
    expect(lang?.code).toBe('en');
    expect(lang?.name).toBe('English');
  });

  it('code lookup is case-insensitive', () => {
    expect(findLanguage('EN')?.code).toBe('en');
    expect(findLanguage('JA')?.code).toBe('ja');
  });

  it('finds a language by full English name (backward-compat for legacy free-text values)', () => {
    expect(findLanguage('English')?.code).toBe('en');
    expect(findLanguage('Japanese')?.code).toBe('ja');
  });

  it('name lookup is case-insensitive', () => {
    expect(findLanguage('english')?.code).toBe('en');
    expect(findLanguage('JAPANESE')?.code).toBe('ja');
  });

  it('returns undefined for an unrecognised code', () => {
    expect(findLanguage('xx')).toBeUndefined();
  });

  it('returns undefined for an unrecognised name', () => {
    expect(findLanguage('Klingon')).toBeUndefined();
  });
});
