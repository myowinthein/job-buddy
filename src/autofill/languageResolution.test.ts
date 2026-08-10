import { describe, it, expect } from 'vitest';
import { adjustLanguageMatches } from './languageResolution';
import type { FieldMatch } from './mapper';
import type { Profile } from '../types/profile';

const PROFILE: Profile = {
  id: 'test-id',
  personal: {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
  },
  address: { city: 'Bangkok', country: 'TH' },
  professional: {},
  salary: { current: { amount: 80000, currency: 'THB', period: 'monthly' }, expected: [] },
  workAuthorization: [],
  workHistory: [],
  education: [],
  languages: [
    { language: 'en', proficiency: 'native_bilingual' },
    { language: 'th', proficiency: 'full_professional' },
  ],
  links: { linkedin: 'https://linkedin.com/in/jane' },
  documents: { cv: {} },
};

function marker(fieldPath: string, matchLayer: FieldMatch['matchLayer']): FieldMatch {
  return { fieldPath, confidence: 0.85, value: null, matchLayer };
}

describe('adjustLanguageMatches — single field', () => {
  it('assigns the first language marker to languages.0.language', () => {
    const matches = [marker('languages.language', 'dictionary_exact')];
    adjustLanguageMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('languages.0.language');
    expect(matches[0].value).toBe('English');
  });

  it('assigns the first proficiency marker to languages.0.proficiency', () => {
    const matches = [marker('languages.proficiency', 'dictionary_exact')];
    adjustLanguageMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('languages.0.proficiency');
    expect(matches[0].value).toBe('Native');
  });
});

describe('adjustLanguageMatches — multiple entries of the same marker', () => {
  it('assigns sequential indices to repeated language markers, in scan order', () => {
    const matches = [
      marker('languages.language', 'dictionary_exact'),
      marker('languages.language', 'dictionary_exact'),
    ];
    adjustLanguageMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('languages.0.language');
    expect(matches[0].value).toBe('English');
    expect(matches[1].fieldPath).toBe('languages.1.language');
    expect(matches[1].value).toBe('Thai');
  });

  it('assigns sequential indices to repeated proficiency markers, in scan order', () => {
    const matches = [
      marker('languages.proficiency', 'fuzzy'),
      marker('languages.proficiency', 'fuzzy'),
    ];
    adjustLanguageMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('languages.0.proficiency');
    expect(matches[0].value).toBe('Native');
    expect(matches[1].fieldPath).toBe('languages.1.proficiency');
    expect(matches[1].value).toBe('Fluent');
  });
});

describe('adjustLanguageMatches — interleaved language/proficiency pairs', () => {
  it('pairs each language with its proficiency independently, by marker type', () => {
    const matches = [
      marker('languages.language', 'dictionary_exact'),
      marker('languages.proficiency', 'dictionary_exact'),
      marker('languages.language', 'dictionary_exact'),
      marker('languages.proficiency', 'dictionary_exact'),
    ];
    adjustLanguageMatches(matches, PROFILE);
    expect(matches.map((m) => [m.fieldPath, m.value])).toEqual([
      ['languages.0.language', 'English'],
      ['languages.0.proficiency', 'Native'],
      ['languages.1.language', 'Thai'],
      ['languages.1.proficiency', 'Fluent'],
    ]);
  });
});

describe('adjustLanguageMatches — index beyond the applicant\'s language count', () => {
  it('leaves value null rather than throwing, for a form with more rows than profile entries', () => {
    const matches = [
      marker('languages.language', 'dictionary_exact'),
      marker('languages.language', 'dictionary_exact'),
      marker('languages.language', 'dictionary_exact'),
    ];
    adjustLanguageMatches(matches, PROFILE);
    expect(matches[2].fieldPath).toBe('languages.2.language');
    expect(matches[2].value).toBeNull();
  });
});

describe('adjustLanguageMatches — explicit signals are never overridden', () => {
  it('leaves a learned mapping alone', () => {
    const matches = [{ fieldPath: 'languages.0.language', confidence: 0.97, value: 'English', matchLayer: 'learned' as const }];
    adjustLanguageMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('languages.0.language');
    expect(matches[0].value).toBe('English');
  });
});

describe('adjustLanguageMatches — unrelated fields', () => {
  it('ignores fields that are not language-related', () => {
    const matches = [
      { fieldPath: 'personal.firstName', confidence: 0.85, value: 'Jane', matchLayer: 'dictionary_exact' as const },
    ];
    adjustLanguageMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.firstName');
    expect(matches[0].value).toBe('Jane');
  });

  it('ignores an unmatched field (null fieldPath)', () => {
    const matches: FieldMatch[] = [{ fieldPath: null, confidence: 0, value: null, matchLayer: 'none' }];
    expect(() => adjustLanguageMatches(matches, PROFILE)).not.toThrow();
    expect(matches[0].fieldPath).toBeNull();
  });
});
