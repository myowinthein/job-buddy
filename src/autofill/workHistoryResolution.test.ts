import { describe, it, expect } from 'vitest';
import { adjustWorkHistoryMatches, matchCurrentWorkHistoryCheckboxes } from './workHistoryResolution';
import type { FieldMatch } from './mapper';
import type { CheckboxOption } from './scanner';
import type { Profile } from '../types/profile';

const PROFILE: Profile = {
  id: 'test-id',
  personal: {
    firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
    phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
  },
  address: { city: 'Bangkok', country: 'TH' },
  professional: {},
  salary: { current: { amount: 80000, currency: 'THB', period: 'monthly' }, expected: [] },
  workAuthorization: [],
  // Entry 0 is older and not current; entry 1 is the applicant's current
  // role — mostRecentIdx() should prefer index 1.
  workHistory: [
    { company: 'Beta Corp', title: 'Junior Dev', startDate: '2018-06', endDate: '2019-12', isCurrent: false,
      location: { city: 'Chiang Mai', countryCode: 'TH' }, arrangement: 'onsite', description: 'Built things.' },
    { company: 'Acme', title: 'Senior Engineer', startDate: '2020-01', isCurrent: true,
      location: { city: 'Bangkok', countryCode: 'TH' }, arrangement: 'remote', description: 'Leads the platform team.' },
  ],
  education: [],
  languages: [],
  links: { linkedin: 'https://linkedin.com/in/jane' },
  documents: { cv: {} },
};

function marker(fieldPath: string, matchLayer: FieldMatch['matchLayer']): FieldMatch {
  return { fieldPath, confidence: 0.85, value: null, matchLayer };
}

describe('adjustWorkHistoryMatches — single occurrence uses the most recent entry', () => {
  it('assigns a single company marker to the applicant\'s current role', () => {
    const matches = [marker('workHistory.company', 'dictionary_exact')];
    adjustWorkHistoryMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('workHistory.1.company');
    expect(matches[0].value).toBe('Acme');
  });

  it('resolves the single-occurrence location.city marker', () => {
    const matches = [marker('workHistory.location.city', 'dictionary_exact')];
    adjustWorkHistoryMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('workHistory.1.location.city');
    expect(matches[0].value).toBe('Bangkok');
  });

  it('resolves the single-occurrence endDate marker to "Present" for the current role', () => {
    const matches = [marker('workHistory.endDate.formatted', 'fuzzy')];
    adjustWorkHistoryMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('workHistory.1.endDate.formatted');
    expect(matches[0].value).toBe('Present');
  });

  it('resolves the single-occurrence arrangement marker capitalized', () => {
    const matches = [marker('workHistory.arrangement', 'dictionary_exact')];
    adjustWorkHistoryMatches(matches, PROFILE);
    expect(matches[0].value).toBe('Remote');
  });

  it('resolves the single-occurrence description marker', () => {
    const matches = [marker('workHistory.description', 'dictionary_exact')];
    adjustWorkHistoryMatches(matches, PROFILE);
    expect(matches[0].value).toBe('Leads the platform team.');
  });
});

describe('adjustWorkHistoryMatches — repeated occurrences use sequential indices', () => {
  it('assigns sequential indices to repeated company markers, in scan order', () => {
    const matches = [
      marker('workHistory.company', 'dictionary_exact'),
      marker('workHistory.company', 'dictionary_exact'),
    ];
    adjustWorkHistoryMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('workHistory.0.company');
    expect(matches[0].value).toBe('Beta Corp');
    expect(matches[1].fieldPath).toBe('workHistory.1.company');
    expect(matches[1].value).toBe('Acme');
  });

  it('pairs company and title independently, by marker type', () => {
    const matches = [
      marker('workHistory.company', 'dictionary_exact'),
      marker('workHistory.title', 'dictionary_exact'),
      marker('workHistory.company', 'dictionary_exact'),
      marker('workHistory.title', 'dictionary_exact'),
    ];
    adjustWorkHistoryMatches(matches, PROFILE);
    expect(matches.map((m) => [m.fieldPath, m.value])).toEqual([
      ['workHistory.0.company', 'Beta Corp'],
      ['workHistory.0.title', 'Junior Dev'],
      ['workHistory.1.company', 'Acme'],
      ['workHistory.1.title', 'Senior Engineer'],
    ]);
  });
});

describe('adjustWorkHistoryMatches — explicit signals are never overridden', () => {
  it('leaves a learned mapping alone', () => {
    const matches = [{ fieldPath: 'workHistory.0.company', confidence: 0.97, value: 'Beta Corp', matchLayer: 'learned' as const }];
    adjustWorkHistoryMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('workHistory.0.company');
  });
});

describe('adjustWorkHistoryMatches — unrelated fields', () => {
  it('ignores fields that are not work-history-related', () => {
    const matches = [{ fieldPath: 'personal.firstName', confidence: 0.85, value: 'Jane', matchLayer: 'dictionary_exact' as const }];
    adjustWorkHistoryMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.firstName');
  });
});

function checkbox(label: string): CheckboxOption {
  return { element: {} as HTMLInputElement, label, value: 'on' };
}

describe('matchCurrentWorkHistoryCheckboxes', () => {
  it('checks a single matched checkbox when the most recent entry is current', () => {
    const result = matchCurrentWorkHistoryCheckboxes([checkbox('Currently working here')], PROFILE);
    expect(result).toEqual([{ element: expect.anything(), fieldPath: 'workHistory.1.isCurrent' }]);
  });

  it('does not check a matched checkbox when the resolved entry is not current', () => {
    const soleEntry: Profile = { ...PROFILE, workHistory: [PROFILE.workHistory[0]] };
    const result = matchCurrentWorkHistoryCheckboxes([checkbox('Currently working here')], soleEntry);
    expect(result).toEqual([]);
  });

  it('never matches a label outside the exact term allowlist (no fuzzy fallback)', () => {
    const result = matchCurrentWorkHistoryCheckboxes([checkbox('I agree to the Privacy Policy')], PROFILE);
    expect(result).toEqual([]);
  });

  it('assigns sequential indices across repeated checkboxes, checking only the current entry', () => {
    const result = matchCurrentWorkHistoryCheckboxes(
      [checkbox('Currently working here'), checkbox('Currently working here')],
      PROFILE,
    );
    expect(result).toEqual([{ element: expect.anything(), fieldPath: 'workHistory.1.isCurrent' }]);
  });
});
