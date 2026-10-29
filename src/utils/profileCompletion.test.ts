import { describe, it, expect } from 'vitest';
import { calculateCompletion, getSectionCompletion, getCompletionTarget } from './profileCompletion';
import type { Profile } from '../types/profile';

const COMPLETE: Profile = {
  id: 'test-id',
  personal: {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
  },
  address: { city: 'Bangkok', country: 'TH' },
  professional: {
    noticePeriod: { immediate: false, value: 2, unit: 'week' },
  },
  salary: { current: { amount: 60000, currency: 'THB', period: 'monthly' }, expected: [] },
  workAuthorization: [{ country: 'TH', status: 'citizen_or_pr' }],
  workHistory: [{ company: 'Acme', title: 'Engineer', startDate: '2020-01', isCurrent: true }],
  education: [{ institution: 'MIT', degree: 'B.Sc.', fieldOfStudy: 'CS', startDate: '2015-09', endDate: '2019-06' }],
  languages: [{ language: 'English', proficiency: 'native_bilingual' }],
  links: { linkedin: 'https://linkedin.com/in/jane' },
  documents: { cv: { url: 'https://example.com/cv.pdf' } },
};

describe('calculateCompletion', () => {
  it('returns 0% for an empty profile', () => {
    const result = calculateCompletion({});
    expect(result.percentage).toBe(0);
    expect(result.isCoreComplete).toBe(false);
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it('returns 100% for a fully complete profile', () => {
    const result = calculateCompletion(COMPLETE);
    expect(result.percentage).toBe(100);
    expect(result.isCoreComplete).toBe(true);
    expect(result.missingFields).toEqual([]);
    expect(result.missingGroups).toEqual([]);
  });

  it('reports missing first name', () => {
    const result = calculateCompletion({ ...COMPLETE, personal: { ...COMPLETE.personal, firstName: '' } });
    expect(result.missingFields).toContain('First Name');
  });

  it('reports missing email', () => {
    const result = calculateCompletion({ ...COMPLETE, personal: { ...COMPLETE.personal, email: '  ' } });
    expect(result.missingFields).toContain('Email');
  });

  it('accepts salary amount of 0', () => {
    const result = calculateCompletion({
      ...COMPLETE,
      salary: { current: { amount: 0, currency: 'THB', period: 'monthly' }, expected: [] },
    });
    expect(result.missingFields).not.toContain('Current Salary Amount');
  });

  it('reports missing salary when amount is negative', () => {
    const result = calculateCompletion({
      ...COMPLETE,
      salary: { current: { amount: -1, currency: 'THB', period: 'monthly' }, expected: [] },
    });
    expect(result.optionalGroups.find((group) => group.sectionId === 'salary')?.fields).toContain('Current Salary');
  });

  it('accepts notice period immediate', () => {
    const result = calculateCompletion({
      ...COMPLETE,
      professional: { noticePeriod: { immediate: true } },
    });
    expect(result.missingFields).not.toContain('Notice Period');
  });

  it('reports missing notice period when value is 0', () => {
    const result = calculateCompletion({
      ...COMPLETE,
      professional: { noticePeriod: { immediate: false, value: 0, unit: 'week' } },
    });
    expect(result.missingFields).toContain('Notice Period');
  });

  it('reports missing notice period when unit is absent', () => {
    const result = calculateCompletion({
      ...COMPLETE,
      professional: { noticePeriod: { immediate: false, value: 2 } },
    });
    expect(result.missingFields).toContain('Notice Period');
  });

  it('requires all work auth entries to have a valid country', () => {
    const result = calculateCompletion({
      ...COMPLETE,
      workAuthorization: [{ country: '', status: 'citizen_or_pr' }],
    });
    expect(result.missingFields).toContain('At least one valid entry');
  });

  it('accepts CV file as document', () => {
    const result = calculateCompletion({
      ...COMPLETE,
      documents: { cv: { file: { name: 'cv.pdf', size: 1024, base64: 'abc' } } },
    });
    expect(result.missingFields).not.toContain('CV / Résumé');
  });

  it('reports missing cv when neither url nor file present', () => {
    const result = calculateCompletion({ ...COMPLETE, documents: { cv: {} } });
    expect(result.missingFields).toContain('CV / Résumé');
  });

  it('handles legacy phone as string via backward compat', () => {
    const result = calculateCompletion({
      ...COMPLETE,
      personal: { ...COMPLETE.personal, phone: '812345678' as unknown as Profile['personal']['phone'] },
    });
    expect(result.missingFields).not.toContain('Phone');
  });

  it('groups missing fields by section', () => {
    const result = calculateCompletion({
      ...COMPLETE,
      personal: { ...COMPLETE.personal, firstName: '', email: '' },
    });
    const personalGroup = result.missingGroups.find((g) => g.sectionId === 'personal');
    expect(personalGroup?.fields).toContain('First Name');
    expect(personalGroup?.fields).toContain('Email');
  });

  it('percentage rounds correctly for one missing check out of 10', () => {
    // 9/10 = 90
    const result = calculateCompletion({ ...COMPLETE, languages: [] });
    expect(result.percentage).toBe(90);
  });
});

describe('getSectionCompletion', () => {
  it('returns all true for a complete profile', () => {
    const result = getSectionCompletion(COMPLETE);
    expect(result.personal).toBe(true);
    expect(result.address).toBe(true);
    expect(result.salary).toBe(true);
    expect(result.workAuthorization).toBe(true);
    expect(result.workHistory).toBe(true);
    expect(result.education).toBe(true);
    expect(result.languages).toBe(true);
    expect(result.links).toBe(true);
    expect(result.documents).toBe(true);
  });

  it('returns false for personal when first name is missing', () => {
    const result = getSectionCompletion({ ...COMPLETE, personal: { ...COMPLETE.personal, firstName: '' } });
    expect(result.personal).toBe(false);
  });

  it('returns false for salary when currency is missing', () => {
    const result = getSectionCompletion({
      ...COMPLETE,
      salary: { current: { amount: 1000, currency: '', period: 'monthly' }, expected: [] },
    });
    expect(result.salary).toBe(false);
  });

  it('returns false for languages when array is empty', () => {
    expect(getSectionCompletion({ ...COMPLETE, languages: [] }).languages).toBe(false);
  });

  it('returns false for documents when cv is empty', () => {
    expect(getSectionCompletion({ ...COMPLETE, documents: { cv: {} } }).documents).toBe(false);
  });

  it('returns false for workHistory when notice period is missing', () => {
    const result = getSectionCompletion({ ...COMPLETE, professional: {} });
    expect(result.workHistory).toBe(false);
  });
});


describe('optional completion calculation', () => {
  it('ignores placeholder roles and reports missing optional role fields once each', () => {
    const profile = structuredClone(COMPLETE);
    profile.workHistory = [
      { company: '', title: '', startDate: '', isCurrent: false },
      { company: 'A', title: 'Dev', startDate: '2020-01', isCurrent: true, location: { countryCode: 'TH' } },
      { company: 'B', title: 'Dev', startDate: '2021-01', isCurrent: true },
    ];
    const result = calculateCompletion(profile);
    const fields = result.optionalGroups.find((g) => g.sectionId === 'workHistory')!.fields;
    expect(fields).toEqual(['Career Summary', 'Location', 'Work Arrangement', 'Description']);
    expect(result.optionalFieldsRemaining).toBe(result.optionalGroups.reduce((n, g) => n + g.fields.length, 0));
    profile.workHistory = [profile.workHistory[1]];
    expect(calculateCompletion(profile).optionalGroups.find((g) => g.sectionId === 'workHistory')!.fields).not.toContain('Location');
    expect(calculateCompletion(profile).isCoreComplete).toBe(true);
    profile.workHistory = [{ company: '', title: '', startDate: '', isCurrent: false }];
    expect(calculateCompletion(profile).optionalGroups.find((g) => g.sectionId === 'workHistory')!.fields).toEqual(['Career Summary']);
  });
});

describe('saved progress validates the required values', () => {
  it.each([
    ['Email', { personal: { ...COMPLETE.personal, email: 'invalid' } }],
    ['Phone', { personal: { ...COMPLETE.personal, phone: { ...COMPLETE.personal.phone, number: '12' } } }],
    ['At least one complete entry', { education: [{ ...COMPLETE.education[0], endDate: '2000-01' }] }],
    ['At least one language', { languages: [{ language: '', proficiency: 'native_bilingual' }] }],
    ['Notice Period', { professional: { noticePeriod: { immediate: false, value: 1.5, unit: 'week' } } }],
    ['CV / Résumé', { documents: { cv: { url: 'invalid' } } }],
  ] as [string, Partial<Profile>][] )('keeps %s incomplete for invalid saved data', (field, patch) => {
    const result = calculateCompletion({ ...COMPLETE, ...patch });
    expect(result.missingFields).toContain(field);
    expect(result.isCoreComplete).toBe(false);
    expect(result.percentage).toBe(90);
  });

  it('focuses the invalid field in a later collapsed work entry', () => {
    const profile = { ...COMPLETE, workHistory: [COMPLETE.workHistory[0], { ...COMPLETE.workHistory[0], isCurrent: false }] };
    expect(getCompletionTarget(profile, 'workHistory', 'At least one complete entry')).toEqual({ id: 'field-workHistory-1-endDate', cardId: 'entry-workHistory-1', fallbackId: 'add-workHistory' });
  });

  it('keeps optional details separate from the 10 required checks', () => {
    const result = calculateCompletion(COMPLETE);
    expect(result.percentage).toBe(100);
    expect(result.optionalFieldsRemaining).toBeGreaterThan(0);
  });
});

it('allows 100% without last name, salary, LinkedIn, employment history or demographics', () => {
  const profile: Profile = { ...COMPLETE, personal: { firstName: 'Jane', lastName: '', email: 'jane@example.com', phone: COMPLETE.personal.phone }, salary: { expected: [] }, links: { linkedin: '' }, workHistory: [] };
  const result = calculateCompletion(profile);
  expect(result.percentage).toBe(100);
  expect(result.optionalGroups.some((group) => group.sectionId === 'personal')).toBe(false);
  expect(getSectionCompletion(profile).personal).toBe(true);
});

it('targets the duplicate row when an imported profile repeats a country or language', () => {
  const profile = { ...COMPLETE, workAuthorization: [COMPLETE.workAuthorization[0], { ...COMPLETE.workAuthorization[0] }], languages: [COMPLETE.languages[0], { ...COMPLETE.languages[0], language: 'en' }] };
  expect(calculateCompletion(profile).missingFields).toContain('At least one valid entry');
  expect(getCompletionTarget(profile, 'workAuthorization', 'At least one valid entry')?.id).toBe('field-workAuthorization-1-country');
  expect(getCompletionTarget(profile, 'languages', 'At least one language')?.id).toBe('field-languages-1-language');
});
