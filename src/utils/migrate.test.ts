import { describe, it, expect } from 'vitest';
import { normalizeProfile } from './migrate';
import type { Profile } from '@/src/types/profile';

function baseProfile(): Profile {
  return {
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
    documents: { cv: { url: 'https://example.com/cv.pdf' } },
  };
}

describe('normalizeProfile', () => {
  it('returns the same reference when nothing needs migrating', () => {
    const p = baseProfile();
    expect(normalizeProfile(p)).toBe(p);
  });

  it('defaults missing salary.current.period to "monthly"', () => {
    const p = baseProfile();
    // Simulate an old profile loaded from storage with no period
    p.salary.current = { amount: 80000, currency: 'THB' } as Profile['salary']['current'];
    const out = normalizeProfile(p);
    expect(out.salary.current.period).toBe('monthly');
  });

  it('preserves valid existing "annual" period on current salary', () => {
    const p = baseProfile();
    p.salary.current.period = 'annual';
    const out = normalizeProfile(p);
    expect(out.salary.current.period).toBe('annual');
    expect(out).toBe(p); // unchanged
  });

  it('preserves valid existing "monthly" period on current salary', () => {
    const p = baseProfile();
    p.salary.current.period = 'monthly';
    expect(normalizeProfile(p)).toBe(p);
  });

  it('replaces an invalid period string with "monthly"', () => {
    const p = baseProfile();
    p.salary.current = {
      amount: 80000,
      currency: 'THB',
      period: 'weekly',
    } as unknown as Profile['salary']['current'];
    const out = normalizeProfile(p);
    expect(out.salary.current.period).toBe('monthly');
  });

  it('preserves country, currency, and amount on current salary', () => {
    const p = baseProfile();
    p.salary.current = {
      amount: 99000,
      currency: 'USD',
      country: 'US',
    } as Profile['salary']['current'];
    const out = normalizeProfile(p);
    expect(out.salary.current.amount).toBe(99000);
    expect(out.salary.current.currency).toBe('USD');
    expect(out.salary.current.country).toBe('US');
    expect(out.salary.current.period).toBe('monthly');
  });

  it('defaults period for each expected salary entry that is missing it', () => {
    const p = baseProfile();
    p.salary.expected = [
      { country: 'SG', currency: 'SGD', amount: 100000 } as Profile['salary']['expected'][number],
      { country: 'US', currency: 'USD', amount: 120000, period: 'annual' },
    ];
    const out = normalizeProfile(p);
    expect(out.salary.expected[0].period).toBe('monthly');
    expect(out.salary.expected[1].period).toBe('annual'); // preserved
    expect(out.salary.expected[0].country).toBe('SG');
    expect(out.salary.expected[0].amount).toBe(100000);
  });

  it('returns same reference when expected entries already have valid periods', () => {
    const p = baseProfile();
    p.salary.expected = [
      { country: 'SG', currency: 'SGD', amount: 100000, period: 'monthly' },
      { country: 'US', currency: 'USD', amount: 120000, period: 'annual' },
    ];
    expect(normalizeProfile(p)).toBe(p);
  });

  it('does not mutate the input profile', () => {
    const p = baseProfile();
    p.salary.current = { amount: 80000, currency: 'THB' } as Profile['salary']['current'];
    const originalCurrentRef = p.salary.current;
    normalizeProfile(p);
    expect(p.salary.current).toBe(originalCurrentRef);
    expect((p.salary.current as { period?: string }).period).toBeUndefined();
  });

  it('handles a profile with no salary object at all', () => {
    const p = baseProfile();
    p.salary = undefined as unknown as Profile['salary'];
    expect(normalizeProfile(p)).toBe(p);
  });

  it('handles missing expected array gracefully', () => {
    const p = baseProfile();
    p.salary = {
      current: { amount: 80000, currency: 'THB', period: 'monthly' },
      expected: undefined as unknown as Profile['salary']['expected'],
    };
    expect(normalizeProfile(p)).toBe(p);
  });
});
