import { describe, expect, it } from 'vitest';
import { mappingPath } from './learnedMappingData';

describe('mappingPath', () => {
  it('returns a legacy string mapping unchanged', () => {
    expect(mappingPath('personal.firstName')).toBe('personal.firstName');
  });

  it('returns the path of a counted mapping', () => {
    expect(mappingPath({ path: 'personal.email', count: 2 })).toBe('personal.email');
  });

  it('returns the path of an inactive counted mapping', () => {
    expect(mappingPath({ path: 'personal.email', count: 2, inactive: true })).toBe(
      'personal.email',
    );
  });
});
