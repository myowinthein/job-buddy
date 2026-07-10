import { describe, it, expect } from 'vitest';
import { fieldCls } from './fieldCls';

describe('fieldCls', () => {
  it('returns a non-error class string when called with no argument', () => {
    const cls = fieldCls();
    expect(cls).toContain('border-gray-300');
    expect(cls).not.toContain('border-red');
  });

  it('returns a non-error class string when called with undefined', () => {
    const cls = fieldCls(undefined);
    expect(cls).toContain('border-gray-300');
  });

  it('returns an error class string when called with a non-empty string', () => {
    const cls = fieldCls('Required field');
    expect(cls).toContain('border-red');
    expect(cls).not.toContain('border-gray-300');
  });

  it('returns different strings for error vs no-error', () => {
    expect(fieldCls('err')).not.toBe(fieldCls());
  });
});
