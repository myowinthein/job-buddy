import { describe, it, expect } from 'vitest';
import { adjustSalaryMatches } from './salaryResolution';
import type { FieldMatch } from './mapper';
import type { Profile } from '../types/profile';

const PROFILE: Profile = {
  id: 'test-id',
  personal: {
    firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
    phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
  },
  address: { city: 'Bangkok', country: 'TH' },
  professional: {},
  salary: {
    current: { amount: 80000, currency: 'THB', period: 'monthly' },
    expected: [
      { amount: 90000, currency: 'THB', period: 'monthly', country: 'TH' },
      { amount: 3000, currency: 'USD', period: 'monthly', country: 'US' },
    ],
  },
  workAuthorization: [],
  workHistory: [],
  education: [],
  languages: [],
  links: { linkedin: 'https://linkedin.com/in/jane' },
  documents: { cv: {} },
};

function marker(fieldPath: string, matchLayer: FieldMatch['matchLayer']): FieldMatch {
  return { fieldPath, confidence: 0.85, value: null, matchLayer };
}

describe('adjustSalaryMatches — single occurrence', () => {
  it('assigns a single marker to the first expected-salary entry (no isCurrent/startDate to prefer)', () => {
    const matches = [marker('salary.expected.formatted', 'dictionary_exact')];
    adjustSalaryMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('salary.expected.0.formatted');
    expect(matches[0].value).toBe('90,000 THB');
  });
});

describe('adjustSalaryMatches — repeated occurrences use sequential indices', () => {
  it('assigns sequential indices to repeated markers, in scan order', () => {
    const matches = [
      marker('salary.expected.formatted', 'fuzzy'),
      marker('salary.expected.formatted', 'fuzzy'),
    ];
    adjustSalaryMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('salary.expected.0.formatted');
    expect(matches[0].value).toBe('90,000 THB');
    expect(matches[1].fieldPath).toBe('salary.expected.1.formatted');
    expect(matches[1].value).toBe('3,000 USD');
  });
});

describe('adjustSalaryMatches — index beyond the applicant\'s expected-salary count', () => {
  it('leaves value null rather than throwing, for a form with more rows than profile entries', () => {
    const matches = [
      marker('salary.expected.formatted', 'dictionary_exact'),
      marker('salary.expected.formatted', 'dictionary_exact'),
      marker('salary.expected.formatted', 'dictionary_exact'),
    ];
    adjustSalaryMatches(matches, PROFILE);
    expect(matches[2].fieldPath).toBe('salary.expected.2.formatted');
    expect(matches[2].value).toBeNull();
  });
});

describe('adjustSalaryMatches — no expected-salary entries', () => {
  it('resolves to null rather than throwing when the applicant has none saved', () => {
    const emptyProfile: Profile = { ...PROFILE, salary: { ...PROFILE.salary, expected: [] } };
    const matches = [marker('salary.expected.formatted', 'dictionary_exact')];
    adjustSalaryMatches(matches, emptyProfile);
    expect(matches[0].fieldPath).toBe('salary.expected.0.formatted');
    expect(matches[0].value).toBeNull();
  });
});

describe('adjustSalaryMatches — explicit signals are never overridden', () => {
  it('leaves a learned mapping alone', () => {
    const matches = [{ fieldPath: 'salary.expected.0.formatted', confidence: 0.97, value: '90,000 THB', matchLayer: 'learned' as const }];
    adjustSalaryMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('salary.expected.0.formatted');
  });
});

describe('adjustSalaryMatches — unrelated fields', () => {
  it('ignores fields that are not salary-related', () => {
    const matches = [{ fieldPath: 'personal.firstName', confidence: 0.85, value: 'Jane', matchLayer: 'dictionary_exact' as const }];
    adjustSalaryMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.firstName');
  });

  it('ignores an unmatched field (null fieldPath)', () => {
    const matches: FieldMatch[] = [{ fieldPath: null, confidence: 0, value: null, matchLayer: 'none' }];
    expect(() => adjustSalaryMatches(matches, PROFILE)).not.toThrow();
    expect(matches[0].fieldPath).toBeNull();
  });
});
