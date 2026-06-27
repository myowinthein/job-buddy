import { describe, it, expect } from 'vitest';
import { calculateCompletion, getSectionCompletion } from './profileCompletion';
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
  salary: { current: { amount: 60000, currency: 'THB' }, expected: [] },
  workAuthorization: [{ country: 'TH', status: 'citizen_or_pr' }],
  workHistory: [{ company: 'Acme', title: 'Engineer', startDate: '2020-01', isCurrent: true }],
  education: [{ institution: 'MIT', degree: 'B.Sc.', fieldOfStudy: 'CS', startDate: '2015-09' }],
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
      salary: { current: { amount: 0, currency: 'THB' }, expected: [] },
    });
    expect(result.missingFields).not.toContain('Current Salary Amount');
  });

  it('reports missing salary when amount is negative', () => {
    const result = calculateCompletion({
      ...COMPLETE,
      salary: { current: { amount: -1, currency: 'THB' }, expected: [] },
    });
    expect(result.missingFields).toContain('Current Salary Amount');
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

  it('percentage rounds correctly for one missing check out of 15', () => {
    // 14/15 = 93.33 → rounds to 93
    const result = calculateCompletion({ ...COMPLETE, languages: [] });
    expect(result.percentage).toBe(93);
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
      salary: { current: { amount: 1000, currency: '' }, expected: [] },
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
