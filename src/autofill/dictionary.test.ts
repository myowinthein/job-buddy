import { describe, it, expect } from 'vitest';
import { FIELD_DICTIONARY } from './dictionary';

describe('FIELD_DICTIONARY', () => {
  it('covers all essential profile paths', () => {
    const keys = Object.keys(FIELD_DICTIONARY);
    for (const path of [
      'personal.firstName',
      'personal.lastName',
      'personal.email',
      'derived.fullName',
      'address.city',
      'address.country',
      'links.linkedin',
      'documents.cv.file',
    ]) {
      expect(keys, `missing path: ${path}`).toContain(path);
    }
  });

  it('every value is a non-empty array of strings', () => {
    for (const [key, terms] of Object.entries(FIELD_DICTIONARY)) {
      expect(Array.isArray(terms), `${key} must be an array`).toBe(true);
      expect(terms.length, `${key} must not be empty`).toBeGreaterThan(0);
      for (const term of terms) {
        expect(typeof term, `term in ${key} must be a string`).toBe('string');
        expect(term.length, `term in ${key} must not be empty string`).toBeGreaterThan(0);
      }
    }
  });

  it('all terms are lowercase (must match normalizer output)', () => {
    for (const [key, terms] of Object.entries(FIELD_DICTIONARY)) {
      for (const term of terms) {
        expect(term, `"${term}" in ${key} must be lowercase`).toBe(term.toLowerCase());
      }
    }
  });

  it('no duplicate terms within a field entry', () => {
    for (const [key, terms] of Object.entries(FIELD_DICTIONARY)) {
      const unique = new Set(terms);
      expect(unique.size, `${key} contains duplicate terms`).toBe(terms.length);
    }
  });

  it('no term appears in more than one field (ambiguous match risk)', () => {
    const seen = new Map<string, string>();
    for (const [key, terms] of Object.entries(FIELD_DICTIONARY)) {
      for (const term of terms) {
        if (seen.has(term)) {
          throw new Error(`term "${term}" appears in both "${seen.get(term)}" and "${key}"`);
        }
        seen.set(term, key);
      }
    }
  });
});
