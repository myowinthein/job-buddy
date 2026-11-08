import { describe, it, expect } from 'vitest';
import { findCurrency } from './currencies';

describe('findCurrency', () => {
  it('finds a currency by ISO 4217 code', () => {
    const c = findCurrency('USD');
    expect(c?.code).toBe('USD');
    expect(c?.name).toBe('US Dollar');
  });

  it('is case-insensitive', () => {
    expect(findCurrency('usd')?.code).toBe('USD');
    expect(findCurrency('Gbp')?.code).toBe('GBP');
  });

  it('returns undefined for an unknown code', () => {
    expect(findCurrency('XYZ')).toBeUndefined();
  });
});
