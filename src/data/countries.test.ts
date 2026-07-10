import { describe, it, expect } from 'vitest';
import { getFlag, COUNTRIES, findCountry, findCountryByNameOrCode } from './countries';

describe('getFlag', () => {
  it('returns a two-codepoint regional indicator string', () => {
    // Each letter maps to one Unicode regional indicator symbol (U+1F1E6–U+1F1FF)
    expect([...getFlag('US')].length).toBe(2);
  });

  it('is case-insensitive', () => {
    expect(getFlag('us')).toBe(getFlag('US'));
  });
});

describe('COUNTRIES', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(COUNTRIES)).toBe(true);
  });

  it('is sorted alphabetically by name', () => {
    const names = COUNTRIES.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});

describe('findCountry', () => {
  it('returns the matching country when the code exists', () => {
    const c = findCountry('SG');
    expect(c.code).toBe('SG');
    expect(c.name).toBe('Singapore');
  });

  it('falls back to COUNTRIES[0] (alphabetically first) when code is not found', () => {
    const result = findCountry('ZZ');
    expect(result).toBe(COUNTRIES[0]);
  });
});

describe('findCountryByNameOrCode', () => {
  it('returns undefined for an empty string', () => {
    expect(findCountryByNameOrCode('')).toBeUndefined();
  });

  it('finds by ISO alpha-2 code (case-insensitive)', () => {
    expect(findCountryByNameOrCode('JP')?.code).toBe('JP');
    expect(findCountryByNameOrCode('jp')?.code).toBe('JP');
  });

  it('finds by full country name (case-insensitive backward-compat)', () => {
    expect(findCountryByNameOrCode('Singapore')?.code).toBe('SG');
    expect(findCountryByNameOrCode('singapore')?.code).toBe('SG');
    expect(findCountryByNameOrCode('SINGAPORE')?.code).toBe('SG');
  });

  it('returns undefined for an unrecognised value', () => {
    expect(findCountryByNameOrCode('Neverland')).toBeUndefined();
  });
});
