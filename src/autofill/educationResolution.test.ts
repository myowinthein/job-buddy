import { describe, it, expect } from 'vitest';
import { adjustEducationMatches, matchCurrentEducationCheckboxes } from './educationResolution';
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
  workHistory: [],
  // Entry 0 is older and not current; entry 1 is the applicant's most
  // recent/current one — mostRecentIdx() should prefer index 1.
  education: [
    { institution: 'State U', degree: 'BSc', fieldOfStudy: 'Physics', startDate: '2014-09', endDate: '2018-05' },
    { institution: 'MIT', degree: 'MSc', fieldOfStudy: 'CS', startDate: '2023-09', isCurrent: true },
  ],
  languages: [],
  links: { linkedin: 'https://linkedin.com/in/jane' },
  documents: { cv: {} },
};

function marker(fieldPath: string, matchLayer: FieldMatch['matchLayer']): FieldMatch {
  return { fieldPath, confidence: 0.85, value: null, matchLayer };
}

describe('adjustEducationMatches — single occurrence uses the most recent entry', () => {
  it('assigns a single institution marker to the applicant\'s most recent entry', () => {
    const matches = [marker('education.institution', 'dictionary_exact')];
    adjustEducationMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('education.1.institution');
    expect(matches[0].value).toBe('MIT');
  });

  it('assigns a single degree marker to the same most-recent entry', () => {
    const matches = [marker('education.degree', 'dictionary_exact')];
    adjustEducationMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('education.1.degree');
    expect(matches[0].value).toBe('MSc');
  });

  it('resolves the single-occurrence startDate marker to the formatted date', () => {
    const matches = [marker('education.startDate.formatted', 'fuzzy')];
    adjustEducationMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('education.1.startDate.formatted');
    expect(matches[0].value).toBe('September 2023');
  });

  it('resolves the single-occurrence endDate marker to "Present" for a current entry', () => {
    const matches = [marker('education.endDate.formatted', 'dictionary_exact')];
    adjustEducationMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('education.1.endDate.formatted');
    expect(matches[0].value).toBe('Present');
  });

  it('resolves the single-occurrence isCurrent marker to "Yes"', () => {
    const matches = [marker('education.isCurrent', 'dictionary_exact')];
    adjustEducationMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('education.1.isCurrent');
    expect(matches[0].value).toBe('Yes');
  });
});

describe('adjustEducationMatches — repeated occurrences use sequential indices', () => {
  it('assigns sequential indices to repeated institution markers, in scan order', () => {
    const matches = [
      marker('education.institution', 'dictionary_exact'),
      marker('education.institution', 'dictionary_exact'),
    ];
    adjustEducationMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('education.0.institution');
    expect(matches[0].value).toBe('State U');
    expect(matches[1].fieldPath).toBe('education.1.institution');
    expect(matches[1].value).toBe('MIT');
  });

  it('pairs fieldOfStudy and degree independently, by marker type', () => {
    const matches = [
      marker('education.degree', 'dictionary_exact'),
      marker('education.fieldOfStudy', 'dictionary_exact'),
      marker('education.degree', 'dictionary_exact'),
      marker('education.fieldOfStudy', 'dictionary_exact'),
    ];
    adjustEducationMatches(matches, PROFILE);
    expect(matches.map((m) => [m.fieldPath, m.value])).toEqual([
      ['education.0.degree', 'BSc'],
      ['education.0.fieldOfStudy', 'Physics'],
      ['education.1.degree', 'MSc'],
      ['education.1.fieldOfStudy', 'CS'],
    ]);
  });
});

describe('adjustEducationMatches — explicit signals are never overridden', () => {
  it('leaves a learned mapping alone', () => {
    const matches = [{ fieldPath: 'education.0.institution', confidence: 0.97, value: 'State U', matchLayer: 'learned' as const }];
    adjustEducationMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('education.0.institution');
  });
});

describe('adjustEducationMatches — unrelated fields', () => {
  it('ignores fields that are not education-related', () => {
    const matches = [{ fieldPath: 'personal.firstName', confidence: 0.85, value: 'Jane', matchLayer: 'dictionary_exact' as const }];
    adjustEducationMatches(matches, PROFILE);
    expect(matches[0].fieldPath).toBe('personal.firstName');
  });

  it('ignores an unmatched field (null fieldPath)', () => {
    const matches: FieldMatch[] = [{ fieldPath: null, confidence: 0, value: null, matchLayer: 'none' }];
    expect(() => adjustEducationMatches(matches, PROFILE)).not.toThrow();
    expect(matches[0].fieldPath).toBeNull();
  });
});

function checkbox(label: string): CheckboxOption {
  return { element: {} as HTMLInputElement, label, value: 'on' };
}

describe('matchCurrentEducationCheckboxes', () => {
  it('checks a single matched checkbox when the most recent entry is current', () => {
    const result = matchCurrentEducationCheckboxes([checkbox('Currently studying here')], PROFILE);
    expect(result).toEqual([{ element: expect.anything(), fieldPath: 'education.1.isCurrent' }]);
  });

  it('does not check a matched checkbox when the resolved entry is not current', () => {
    const soleEducation: Profile = { ...PROFILE, education: [PROFILE.education[0]] }; // not current
    const result = matchCurrentEducationCheckboxes([checkbox('Currently studying here')], soleEducation);
    expect(result).toEqual([]);
  });

  it('never matches a label outside the exact term allowlist (no fuzzy fallback)', () => {
    const result = matchCurrentEducationCheckboxes([checkbox('I agree to the Privacy Policy')], PROFILE);
    expect(result).toEqual([]);
  });

  it('assigns sequential indices across repeated checkboxes, checking only current entries', () => {
    const threeEntryProfile: Profile = {
      ...PROFILE,
      education: [
        { institution: 'A', degree: 'BA', fieldOfStudy: 'Art', startDate: '2010-01' },        // not current
        { institution: 'B', degree: 'BA', fieldOfStudy: 'Art', startDate: '2015-01', isCurrent: true },
        { institution: 'C', degree: 'BA', fieldOfStudy: 'Art', startDate: '2020-01' },         // not current
      ],
    };
    const result = matchCurrentEducationCheckboxes(
      [checkbox('Currently studying here'), checkbox('Currently studying here'), checkbox('Currently studying here')],
      threeEntryProfile,
    );
    expect(result).toEqual([{ element: expect.anything(), fieldPath: 'education.1.isCurrent' }]);
  });

  it('returns an empty array when nothing on the page matches', () => {
    expect(matchCurrentEducationCheckboxes([], PROFILE)).toEqual([]);
  });
});
