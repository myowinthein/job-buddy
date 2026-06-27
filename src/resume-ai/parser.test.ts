import { describe, it, expect } from 'vitest';
import { generateDiff, applyChanges } from './parser';
import type { Profile } from '@/src/types/profile';

const EMPTY: Partial<Profile> = {};

const FULL: Partial<Profile> = {
  personal: {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: { countryCode: 'US', callingCode: '+1', number: '555' },
  },
  address: { city: 'Bangkok', country: 'TH' },
  links: { linkedin: 'https://linkedin.com/in/jane' },
};

describe('generateDiff', () => {
  it('marks a field as "new" when current is empty and suggested is not', () => {
    const diff = generateDiff(EMPTY, FULL);
    const change = diff.find((c) => c.id === 'personal.firstName');
    expect(change?.status).toBe('new');
    expect(change?.accepted).toBe(true);
  });

  it('marks a field as "unchanged" when the suggested value is empty', () => {
    const diff = generateDiff(FULL, EMPTY);
    const change = diff.find((c) => c.id === 'personal.firstName');
    expect(change?.status).toBe('unchanged');
    expect(change?.accepted).toBe(false);
  });

  it('marks a field as "unchanged" when both values are equal', () => {
    const diff = generateDiff(FULL, FULL);
    const change = diff.find((c) => c.id === 'personal.firstName');
    expect(change?.status).toBe('unchanged');
  });

  it('marks a field as "conflict" when both have different non-empty values', () => {
    const extracted: Partial<Profile> = {
      personal: { ...(FULL.personal as Profile['personal']), firstName: 'Joan' },
    };
    const diff = generateDiff(FULL, extracted);
    const change = diff.find((c) => c.id === 'personal.firstName');
    expect(change?.status).toBe('conflict');
    expect(change?.accepted).toBe(true);
    expect(change?.currentValue).toBe('Jane');
    expect(change?.suggestedValue).toBe('Joan');
  });

  it('produces a change entry for every field definition', () => {
    const diff = generateDiff(EMPTY, EMPTY);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every((c) => c.status === 'unchanged')).toBe(true);
  });

  it('populates display strings for current and suggested values', () => {
    const diff = generateDiff(EMPTY, FULL);
    const change = diff.find((c) => c.id === 'personal.firstName');
    expect(change?.displaySuggested).toBe('Jane');
    expect(change?.displayCurrent).toBe('');
  });
});

describe('applyChanges', () => {
  it('applies accepted new changes onto the base profile', () => {
    const diff = generateDiff(EMPTY, FULL);
    const result = applyChanges(EMPTY, diff);
    expect(result.personal?.firstName).toBe('Jane');
    expect(result.personal?.email).toBe('jane@example.com');
  });

  it('leaves the base profile unchanged when all fields are unchanged', () => {
    const diff = generateDiff(FULL, EMPTY);
    const result = applyChanges(FULL, diff);
    expect(result.personal?.firstName).toBe('Jane');
  });

  it('does not apply declined changes', () => {
    const diff = generateDiff(EMPTY, FULL).map((c) => ({ ...c, accepted: false }));
    const result = applyChanges(EMPTY, diff);
    expect(result.personal?.firstName).toBeUndefined();
  });

  it('applies only the accepted changes from a mixed diff', () => {
    const diff = generateDiff(EMPTY, FULL).map((c) =>
      c.id === 'personal.firstName' ? { ...c, accepted: false } : c,
    );
    const result = applyChanges(EMPTY, diff);
    expect(result.personal?.firstName).toBeUndefined();
    expect(result.personal?.email).toBe('jane@example.com');
  });

  it('uses the suggested value when a conflict is accepted', () => {
    const extracted: Partial<Profile> = {
      personal: { ...(FULL.personal as Profile['personal']), firstName: 'Joan' },
    };
    const diff = generateDiff(FULL, extracted);
    const result = applyChanges(FULL, diff);
    expect(result.personal?.firstName).toBe('Joan');
  });

  it('retains the current value when a conflict is declined', () => {
    const extracted: Partial<Profile> = {
      personal: { ...(FULL.personal as Profile['personal']), firstName: 'Joan' },
    };
    const diff = generateDiff(FULL, extracted).map((c) =>
      c.id === 'personal.firstName' ? { ...c, accepted: false } : c,
    );
    const result = applyChanges(FULL, diff);
    expect(result.personal?.firstName).toBe('Jane');
  });
});
