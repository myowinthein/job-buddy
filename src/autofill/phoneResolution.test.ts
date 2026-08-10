import { describe, it, expect } from 'vitest';
import { adjustPhoneMatches } from './phoneResolution';
import type { FieldMatch } from './mapper';
import type { Profile } from '../types/profile';
import { resolveProfileValue } from './resolver';

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
  languages: [],
  links: { linkedin: 'https://linkedin.com/in/jane' },
  documents: { cv: {} },
};

// mapField() always resolves value for whatever fieldPath it picked — mirror
// that invariant here so "unchanged" assertions reflect real usage, not a
// stale/mismatched placeholder.
function phoneMatch(fieldPath: string, matchLayer: FieldMatch['matchLayer']): FieldMatch {
  return { fieldPath, confidence: 0.85, value: resolveProfileValue(PROFILE, fieldPath) || null, matchLayer };
}

describe('adjustPhoneMatches — no calling-code sibling on the page', () => {
  it('upgrades a label-matched "phonenumber" field to the full number', () => {
    const matches = [phoneMatch('personal.phone.number', 'dictionary_exact')];
    adjustPhoneMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.phone.full');
    expect(matches[0].value).toBe('+66 812345678');
  });

  it('leaves an already-full label match unchanged', () => {
    const matches = [phoneMatch('personal.phone.full', 'dictionary_exact')];
    adjustPhoneMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.phone.full');
    expect(matches[0].value).toBe('+66 812345678');
  });
});

describe('adjustPhoneMatches — calling-code sibling present on the page', () => {
  it('downgrades a label-matched "phone" (full) field to the local number', () => {
    const matches = [
      phoneMatch('personal.phone.full', 'dictionary_exact'),
      phoneMatch('personal.phone.callingCode', 'dictionary_exact'),
    ];
    adjustPhoneMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.phone.number');
    expect(matches[0].value).toBe('812345678');
  });

  it('leaves an already-number label match unchanged', () => {
    const matches = [
      phoneMatch('personal.phone.number', 'fuzzy'),
      phoneMatch('personal.phone.callingCode', 'autocomplete'),
    ];
    adjustPhoneMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.phone.number');
    expect(matches[0].value).toBe('812345678');
  });

  it('does not touch the calling-code field itself', () => {
    const matches = [phoneMatch('personal.phone.callingCode', 'dictionary_exact')];
    adjustPhoneMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.phone.callingCode');
  });
});

describe('adjustPhoneMatches — explicit signals are never overridden', () => {
  it('leaves an autocomplete="tel-national" match alone even with no calling-code sibling', () => {
    const matches = [phoneMatch('personal.phone.number', 'autocomplete')];
    adjustPhoneMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.phone.number');
  });

  it('leaves an autocomplete="tel" (full) match alone even with a calling-code sibling', () => {
    const matches = [
      phoneMatch('personal.phone.full', 'autocomplete'),
      phoneMatch('personal.phone.callingCode', 'dictionary_exact'),
    ];
    adjustPhoneMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.phone.full');
  });

  it('leaves a learned mapping alone regardless of sibling presence', () => {
    const matches = [
      phoneMatch('personal.phone.number', 'learned'),
      phoneMatch('personal.phone.callingCode', 'dictionary_exact'),
    ];
    adjustPhoneMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.phone.number');
  });
});

describe('adjustPhoneMatches — unrelated fields', () => {
  it('ignores fields that are not phone-related', () => {
    const matches = [
      { fieldPath: 'personal.firstName', confidence: 0.85, value: 'Jane', matchLayer: 'dictionary_exact' as const },
    ];
    adjustPhoneMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.firstName');
    expect(matches[0].value).toBe('Jane');
  });

  it('ignores an unmatched field (null fieldPath)', () => {
    const matches: FieldMatch[] = [{ fieldPath: null, confidence: 0, value: null, matchLayer: 'none' }];
    expect(() => adjustPhoneMatches(matches, PROFILE)).not.toThrow();
    expect(matches[0].fieldPath).toBeNull();
  });
});
