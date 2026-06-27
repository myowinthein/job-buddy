import { describe, it, expect, vi } from 'vitest';
import { calculateDerivedFields } from './derivedFields';
import type { Profile } from '../types/profile';

const BASE: Profile = {
  id: 'test-id',
  personal: {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: { countryCode: 'US', callingCode: '+1', number: '5551234567' },
  },
  address: { city: 'Bangkok', country: 'TH' },
  professional: {},
  salary: { current: { amount: 80000, currency: 'THB' }, expected: [] },
  workAuthorization: [],
  workHistory: [
    { company: 'Acme', title: 'Senior Engineer', startDate: '2022-06', isCurrent: true },
    { company: 'Beta', title: 'Junior Dev', startDate: '2020-01', endDate: '2021-12', isCurrent: false },
  ],
  education: [],
  languages: [],
  links: { linkedin: 'https://linkedin.com/in/jane' },
  documents: { cv: {} },
};

describe('calculateDerivedFields', () => {
  it('computes fullName from firstName and lastName', () => {
    expect(calculateDerivedFields(BASE).fullName).toBe('Jane Doe');
  });

  it('computes fullName with only a first name', () => {
    const p = { ...BASE, personal: { ...BASE.personal, lastName: '' } };
    expect(calculateDerivedFields(p).fullName).toBe('Jane');
  });

  it('returns empty fullName when both names are absent', () => {
    const p = { ...BASE, personal: { ...BASE.personal, firstName: '', lastName: '' } };
    expect(calculateDerivedFields(p).fullName).toBe('');
  });

  it('picks currentTitle from the most recent isCurrent entry', () => {
    expect(calculateDerivedFields(BASE).currentTitle).toBe('Senior Engineer');
  });

  it('picks currentCompany from the most recent isCurrent entry', () => {
    expect(calculateDerivedFields(BASE).currentCompany).toBe('Acme');
  });

  it('returns empty currentTitle when no isCurrent entries exist', () => {
    const p = {
      ...BASE,
      workHistory: [{ company: 'Old', title: 'Dev', startDate: '2019-01', endDate: '2020-01', isCurrent: false }],
    };
    const result = calculateDerivedFields(p);
    expect(result.currentTitle).toBe('');
    expect(result.currentCompany).toBe('');
  });

  it('picks the latest entry when multiple isCurrent roles exist', () => {
    const p = {
      ...BASE,
      workHistory: [
        { company: 'Earlier', title: 'Role A', startDate: '2020-01', isCurrent: true },
        { company: 'Later',   title: 'Role B', startDate: '2022-06', isCurrent: true },
      ],
    };
    const result = calculateDerivedFields(p);
    expect(result.currentCompany).toBe('Later');
    expect(result.currentTitle).toBe('Role B');
  });

  it('sets totalExperience label to empty string when work history is absent', () => {
    const p = { ...BASE, workHistory: [] };
    const result = calculateDerivedFields(p);
    expect(result.totalExperience.totalMonths).toBe(0);
    expect(result.totalExperience.label).toBe('');
  });

  it('computes age correctly when birthday has already passed this year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15'));
    const p = { ...BASE, personal: { ...BASE.personal, dateOfBirth: '1990-03-10' } };
    expect(calculateDerivedFields(p).age).toBe(34);
    vi.useRealTimers();
  });

  it('computes age correctly before birthday in the current year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-01'));
    const p = { ...BASE, personal: { ...BASE.personal, dateOfBirth: '1990-03-10' } };
    expect(calculateDerivedFields(p).age).toBe(33);
    vi.useRealTimers();
  });

  it('omits age when dateOfBirth is absent', () => {
    expect(calculateDerivedFields(BASE).age).toBeUndefined();
  });

  it('omits age when dateOfBirth is unparseable', () => {
    const p = { ...BASE, personal: { ...BASE.personal, dateOfBirth: 'not-a-date' } };
    expect(calculateDerivedFields(p).age).toBeUndefined();
  });
});
