import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveProfileValue } from './resolver';
import type { Profile } from '../types/profile';

const PROFILE: Profile = {
  id: 'test-id',
  personal: {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
    dateOfBirth: '1990-03-15',
  },
  address: { city: 'Bangkok', country: 'TH', street: '123 Main St' },
  professional: { noticePeriod: { immediate: false, value: 2, unit: 'week' } },
  salary: {
    current: { amount: 80000, currency: 'THB', period: 'monthly' },
    expected: [{ country: 'SG', currency: 'SGD', amount: 120000, period: 'monthly' }],
  },
  workAuthorization: [
    { country: 'TH', status: 'citizen_or_pr' },
    { country: 'SG', status: 'requires_sponsorship' },
  ],
  workHistory: [
    {
      company: 'Acme',
      title: 'Senior Engineer',
      startDate: '2020-01',
      isCurrent: true,
      arrangement: 'remote',
      location: { city: 'Bangkok', countryCode: 'TH' },
    },
    {
      company: 'Beta Corp',
      title: 'Junior Dev',
      startDate: '2018-06',
      endDate: '2019-12',
      isCurrent: false,
    },
  ],
  education: [
    {
      institution: 'MIT',
      degree: 'B.Sc.',
      fieldOfStudy: 'CS',
      startDate: '2015-09',
      endDate: '2019-05',
      isCurrent: false,
    },
    {
      institution: 'Stanford',
      degree: 'M.Sc.',
      fieldOfStudy: 'AI',
      startDate: '2023-09',
      isCurrent: true,
    },
  ],
  languages: [{ language: 'English', proficiency: 'native_bilingual' }],
  links: { linkedin: 'https://linkedin.com/in/jane', portfolio: 'https://jane.dev' },
  documents: {
    cv: { url: 'https://example.com/cv.pdf', file: { name: 'jane-cv.pdf', size: 1024, base64: 'abc' } },
  },
  derived: {
    fullName: 'Jane Doe',
    currentTitle: 'Senior Engineer',
    currentCompany: 'Acme',
    totalExperience: { totalMonths: 50, years: 4, months: 2, label: '4 years 2 months' },
    age: 35,
  },
};

describe('resolveProfileValue', () => {
  it('returns empty string for empty fieldPath', () => {
    expect(resolveProfileValue(PROFILE, '')).toBe('');
  });

  it('returns empty string for non-existent path', () => {
    expect(resolveProfileValue(PROFILE, 'personal.nonexistent')).toBe('');
  });

  // Simple dot-notation paths
  it('resolves personal.firstName', () => {
    expect(resolveProfileValue(PROFILE, 'personal.firstName')).toBe('Jane');
  });

  it('resolves personal.email', () => {
    expect(resolveProfileValue(PROFILE, 'personal.email')).toBe('jane@example.com');
  });

  // Phone virtual paths
  it('resolves personal.phone.number', () => {
    expect(resolveProfileValue(PROFILE, 'personal.phone.number')).toBe('812345678');
  });

  it('resolves personal.phone.callingCode', () => {
    expect(resolveProfileValue(PROFILE, 'personal.phone.callingCode')).toBe('+66');
  });

  it('resolves personal.phone.full with both parts', () => {
    expect(resolveProfileValue(PROFILE, 'personal.phone.full')).toBe('+66 812345678');
  });

  it('resolves personal.phone.full with only number when callingCode is empty', () => {
    const p = { ...PROFILE, personal: { ...PROFILE.personal, phone: { countryCode: '', callingCode: '', number: '123' } } };
    expect(resolveProfileValue(p, 'personal.phone.full')).toBe('123');
  });

  it('returns empty for personal.phone.full when both parts are empty', () => {
    const p = { ...PROFILE, personal: { ...PROFILE.personal, phone: { countryCode: '', callingCode: '', number: '' } } };
    expect(resolveProfileValue(p, 'personal.phone.full')).toBe('');
  });

  // Date of birth virtual paths
  it('resolves personal.dateOfBirth.year', () => {
    expect(resolveProfileValue(PROFILE, 'personal.dateOfBirth.year')).toBe('1990');
  });

  it('resolves personal.dateOfBirth.month', () => {
    expect(resolveProfileValue(PROFILE, 'personal.dateOfBirth.month')).toBe('03');
  });

  it('resolves personal.dateOfBirth.day', () => {
    expect(resolveProfileValue(PROFILE, 'personal.dateOfBirth.day')).toBe('15');
  });

  // Address
  it('resolves address.countryName to a non-empty string for a known code', () => {
    const name = resolveProfileValue(PROFILE, 'address.countryName');
    expect(name.length).toBeGreaterThan(0);
  });

  it('falls back to the country code itself for an unknown code', () => {
    const p = { ...PROFILE, address: { ...PROFILE.address, country: 'ZZ' } };
    expect(resolveProfileValue(p, 'address.countryName')).toBe('ZZ');
  });

  it('returns empty when country is absent', () => {
    const p = { ...PROFILE, address: { ...PROFILE.address, country: '' } };
    expect(resolveProfileValue(p, 'address.countryName')).toBe('');
  });

  // Salary
  it('resolves salary.current.formatted with thousands separator', () => {
    expect(resolveProfileValue(PROFILE, 'salary.current.formatted')).toBe('80,000 THB');
  });

  it('rounds fractional amounts in salary.current.formatted', () => {
    const p = { ...PROFILE, salary: { ...PROFILE.salary, current: { amount: 80000.7, currency: 'THB', period: 'monthly' as const } } };
    expect(resolveProfileValue(p, 'salary.current.formatted')).toBe('80,001 THB');
  });

  it('returns empty for salary.current.formatted when amount is 0', () => {
    const p = { ...PROFILE, salary: { ...PROFILE.salary, current: { amount: 0, currency: 'THB', period: 'monthly' as const } } };
    expect(resolveProfileValue(p, 'salary.current.formatted')).toBe('');
  });

  // Derived
  it('resolves derived.totalExperience.years as a string', () => {
    expect(resolveProfileValue(PROFILE, 'derived.totalExperience.years')).toBe('4');
  });

  it('resolves derived.fullName via generic traversal', () => {
    expect(resolveProfileValue(PROFILE, 'derived.fullName')).toBe('Jane Doe');
  });

  it('resolves derived.age (number) as a string', () => {
    expect(resolveProfileValue(PROFILE, 'derived.age')).toBe('35');
  });

  // Work authorization
  it('resolves legacy workAuthorization path as "Yes, authorized to work" for citizen', () => {
    expect(resolveProfileValue(PROFILE, 'workAuthorization')).toBe('Yes, authorized to work');
  });

  it('resolves legacy workAuthorization path as "Requires sponsorship"', () => {
    const p = { ...PROFILE, workAuthorization: [{ country: 'US', status: 'requires_sponsorship' as const }] };
    expect(resolveProfileValue(p, 'workAuthorization')).toBe('Requires sponsorship');
  });

  it('returns empty for workAuthorization when array is empty', () => {
    expect(resolveProfileValue({ ...PROFILE, workAuthorization: [] }, 'workAuthorization')).toBe('');
  });

  it('resolves workAuthorization.0 (indexed) to a status label', () => {
    const result = resolveProfileValue(PROFILE, 'workAuthorization.0');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty for out-of-bounds workAuthorization index', () => {
    expect(resolveProfileValue(PROFILE, 'workAuthorization.99')).toBe('');
  });

  // Expected salary
  it('resolves salary.expected.0.formatted', () => {
    expect(resolveProfileValue(PROFILE, 'salary.expected.0.formatted')).toBe('120,000 SGD');
  });

  it('returns empty for out-of-bounds expected salary', () => {
    expect(resolveProfileValue(PROFILE, 'salary.expected.5.formatted')).toBe('');
  });

  // Work history virtual paths
  it('resolves workHistory.0.isCurrent as "Yes" for a current role', () => {
    expect(resolveProfileValue(PROFILE, 'workHistory.0.isCurrent')).toBe('Yes');
  });

  it('resolves workHistory.1.isCurrent as empty for a past role', () => {
    expect(resolveProfileValue(PROFILE, 'workHistory.1.isCurrent')).toBe('');
  });

  it('resolves workHistory.0.arrangement capitalized', () => {
    expect(resolveProfileValue(PROFILE, 'workHistory.0.arrangement')).toBe('Remote');
  });

  it('resolves workHistory.0.startDate.formatted', () => {
    expect(resolveProfileValue(PROFILE, 'workHistory.0.startDate.formatted')).toBe('January 2020');
  });

  it('resolves workHistory.0.endDate.formatted as "Present" for a current role', () => {
    expect(resolveProfileValue(PROFILE, 'workHistory.0.endDate.formatted')).toBe('Present');
  });

  it('resolves workHistory.1.endDate.formatted for a past role', () => {
    expect(resolveProfileValue(PROFILE, 'workHistory.1.endDate.formatted')).toBe('December 2019');
  });

  it('resolves workHistory.0.location with city and country name', () => {
    const result = resolveProfileValue(PROFILE, 'workHistory.0.location');
    expect(result).toContain('Bangkok');
  });

  it('resolves workHistory.0.title via generic fallthrough', () => {
    expect(resolveProfileValue(PROFILE, 'workHistory.0.title')).toBe('Senior Engineer');
  });

  it('returns empty for out-of-bounds work history', () => {
    expect(resolveProfileValue(PROFILE, 'workHistory.99.title')).toBe('');
  });

  // Education virtual paths
  it('resolves education.0.isCurrent as empty for a non-current entry', () => {
    expect(resolveProfileValue(PROFILE, 'education.0.isCurrent')).toBe('');
  });

  it('resolves education.1.isCurrent as "Yes" for a current entry', () => {
    expect(resolveProfileValue(PROFILE, 'education.1.isCurrent')).toBe('Yes');
  });

  it('resolves education.0.startDate.formatted', () => {
    expect(resolveProfileValue(PROFILE, 'education.0.startDate.formatted')).toBe('September 2015');
  });

  it('resolves education.0.endDate.formatted for a non-current entry', () => {
    expect(resolveProfileValue(PROFILE, 'education.0.endDate.formatted')).toBe('May 2019');
  });

  it('resolves education.1.endDate.formatted as "Present" for a current entry', () => {
    expect(resolveProfileValue(PROFILE, 'education.1.endDate.formatted')).toBe('Present');
  });

  // Notice period — available date (date-independent assertions)
  it('returns empty for professional.noticePeriod.availableDate when noticePeriod is absent', () => {
    const p = { ...PROFILE, professional: {} };
    expect(resolveProfileValue(p, 'professional.noticePeriod.availableDate')).toBe('');
  });

  it('returns empty when value is undefined', () => {
    const p = { ...PROFILE, professional: { noticePeriod: { immediate: false, unit: 'week' as const } } };
    expect(resolveProfileValue(p, 'professional.noticePeriod.availableDate')).toBe('');
  });

  it('returns empty when unit is undefined', () => {
    const p = { ...PROFILE, professional: { noticePeriod: { immediate: false, value: 2 } } };
    expect(resolveProfileValue(p, 'professional.noticePeriod.availableDate')).toBe('');
  });

  it('returns empty when value is 0', () => {
    const p = { ...PROFILE, professional: { noticePeriod: { immediate: false, value: 0, unit: 'day' as const } } };
    expect(resolveProfileValue(p, 'professional.noticePeriod.availableDate')).toBe('');
  });

  // Documents
  it('resolves documents.cv.file to the filename', () => {
    expect(resolveProfileValue(PROFILE, 'documents.cv.file')).toBe('jane-cv.pdf');
  });

  it('returns empty for documents.cv.file when no file is stored', () => {
    const p = { ...PROFILE, documents: { cv: { url: 'https://example.com/cv.pdf' } } };
    expect(resolveProfileValue(p, 'documents.cv.file')).toBe('');
  });
});

describe('resolveProfileValue — notice period: availableDate (date-pinned)', () => {
  // Pin local time to 2024-06-15 so computed dates are deterministic.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15)); // June 15 2024 (month is 0-indexed)
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today for immediate availability', () => {
    const p = { ...PROFILE, professional: { noticePeriod: { immediate: true } } };
    expect(resolveProfileValue(p, 'professional.noticePeriod.availableDate')).toBe('2024-06-15');
  });

  it('adds days to today', () => {
    const p = { ...PROFILE, professional: { noticePeriod: { immediate: false, value: 14, unit: 'day' as const } } };
    expect(resolveProfileValue(p, 'professional.noticePeriod.availableDate')).toBe('2024-06-29');
  });

  it('adds weeks to today (2 weeks = 14 days)', () => {
    const p = { ...PROFILE, professional: { noticePeriod: { immediate: false, value: 2, unit: 'week' as const } } };
    expect(resolveProfileValue(p, 'professional.noticePeriod.availableDate')).toBe('2024-06-29');
  });

  it('adds months to today', () => {
    const p = { ...PROFILE, professional: { noticePeriod: { immediate: false, value: 1, unit: 'month' as const } } };
    expect(resolveProfileValue(p, 'professional.noticePeriod.availableDate')).toBe('2024-07-15');
  });

  it('adds multiple months to today', () => {
    const p = { ...PROFILE, professional: { noticePeriod: { immediate: false, value: 3, unit: 'month' as const } } };
    expect(resolveProfileValue(p, 'professional.noticePeriod.availableDate')).toBe('2024-09-15');
  });

  it('returns YYYY-MM-DD format', () => {
    const p = { ...PROFILE, professional: { noticePeriod: { immediate: true } } };
    const result = resolveProfileValue(p, 'professional.noticePeriod.availableDate');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
