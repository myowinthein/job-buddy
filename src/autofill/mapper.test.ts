import { describe, it, expect } from 'vitest';
import { mapField } from './mapper';
import type { Profile } from '../types/profile';
import type { LearnedMappings } from '../types/storage';

// Avoids importing signals.ts (DOM-dependent); mapField never reads the element field.
function sig(overrides: Partial<{
  name: string; id: string; placeholder: string; autocomplete: string;
  ariaLabel: string; label: string; nearbyText: string; type: string;
}> = {}) {
  return {
    element: null,
    name: '', id: '', placeholder: '', autocomplete: '',
    ariaLabel: '', label: '', nearbyText: '', type: 'text',
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

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
  salary: { current: { amount: 80000, currency: 'THB' }, expected: [] },
  workAuthorization: [],
  workHistory: [{ company: 'Acme', title: 'Senior Engineer', startDate: '2020-01', isCurrent: true }],
  education: [],
  languages: [],
  links: { linkedin: 'https://linkedin.com/in/jane' },
  documents: { cv: {} },
  derived: {
    fullName: 'Jane Doe',
    currentTitle: 'Senior Engineer',
    currentCompany: 'Acme',
    totalExperience: { totalMonths: 50, years: 4, months: 2, label: '4 years 2 months' },
  },
};

const NO_MAPPINGS: LearnedMappings = {};
const DOMAIN = 'example.com';

describe('mapField — Layer 0: Learned mappings', () => {
  it('returns a learned mapping with 0.97 confidence', () => {
    const mappings: LearnedMappings = { 'example.com': { 'customlabel': 'personal.firstName' } };
    const result = mapField(sig({ name: 'customlabel' }), PROFILE, mappings, DOMAIN);
    expect(result.matchLayer).toBe('learned');
    expect(result.confidence).toBe(0.97);
    expect(result.fieldPath).toBe('personal.firstName');
    expect(result.value).toBe('Jane');
  });

  it('does not apply learned mappings from a different domain', () => {
    const mappings: LearnedMappings = { 'other.com': { 'firstname': 'personal.lastName' } };
    const result = mapField(sig({ name: 'firstname' }), PROFILE, mappings, DOMAIN);
    expect(result.matchLayer).not.toBe('learned');
  });

  it('learned mapping takes priority over autocomplete', () => {
    const mappings: LearnedMappings = { 'example.com': { 'givenname': 'personal.lastName' } };
    const result = mapField(sig({ name: 'givenname', autocomplete: 'given-name' }), PROFILE, mappings, DOMAIN);
    expect(result.matchLayer).toBe('learned');
    expect(result.fieldPath).toBe('personal.lastName');
  });
});

describe('mapField — Layer 1: Autocomplete attribute', () => {
  it('maps given-name → personal.firstName at 0.95', () => {
    const result = mapField(sig({ autocomplete: 'given-name' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('personal.firstName');
    expect(result.confidence).toBe(0.95);
    expect(result.value).toBe('Jane');
  });

  it('maps family-name → personal.lastName', () => {
    const result = mapField(sig({ autocomplete: 'family-name' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('personal.lastName');
  });

  it('maps email → personal.email', () => {
    const result = mapField(sig({ autocomplete: 'email' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.value).toBe('jane@example.com');
  });

  it('maps tel → personal.phone.number', () => {
    const result = mapField(sig({ autocomplete: 'tel' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('personal.phone.number');
  });

  it('maps country → address.country', () => {
    const result = mapField(sig({ autocomplete: 'country' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('address.country');
  });

  it('maps postal-code → address.postalCode', () => {
    const result = mapField(sig({ autocomplete: 'postal-code' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('address.postalCode');
  });
});

describe('mapField — Layer 2: Dictionary exact match', () => {
  it('matches "firstname" name signal → personal.firstName at 0.85', () => {
    const result = mapField(sig({ name: 'firstname' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.firstName');
    expect(result.confidence).toBe(0.85);
    expect(result.value).toBe('Jane');
  });

  it('matches "email" label signal → personal.email', () => {
    const result = mapField(sig({ label: 'Email' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.email');
  });

  it('matches "city" placeholder signal → address.city', () => {
    const result = mapField(sig({ placeholder: 'City' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('address.city');
    expect(result.value).toBe('Bangkok');
  });

  it('matches "linkedin" aria-label → links.linkedin', () => {
    const result = mapField(sig({ ariaLabel: 'LinkedIn' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('links.linkedin');
  });

  it('matches "phone" → personal.phone.number', () => {
    const result = mapField(sig({ name: 'phone' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.phone.number');
  });
});

describe('mapField — Layer 3: Fuzzy match', () => {
  it('fuzzy-matches a near-miss signal to the correct profile field', () => {
    // "firstnam" is close to "firstname" in the dictionary
    const result = mapField(sig({ name: 'firstnam' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('personal.firstName');
    expect(result.matchLayer).toBe('fuzzy');
    expect(result.confidence).toBeGreaterThan(0);
  });
});

describe('mapField — Layer 4: Context (nearbyText)', () => {
  it('matches via nearbyText when primary signals produce no match', () => {
    const result = mapField(sig({ name: 'field1', nearbyText: 'city' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('context');
    expect(result.fieldPath).toBe('address.city');
    expect(result.confidence).toBe(0.70);
  });
});

describe('mapField — no match', () => {
  it('returns confidence 0 and null path when no signal matches', () => {
    const result = mapField(sig({ name: 'xyzcompletely123random' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('none');
    expect(result.confidence).toBe(0);
    expect(result.fieldPath).toBeNull();
    expect(result.value).toBeNull();
  });

  it('returns null value when profile value is empty for a matched path', () => {
    const p = { ...PROFILE, links: { ...PROFILE.links, linkedin: '' } };
    const result = mapField(sig({ name: 'linkedin' }), p, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('links.linkedin');
    expect(result.value).toBeNull();
  });
});
