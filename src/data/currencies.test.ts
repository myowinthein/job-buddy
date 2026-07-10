import { describe, it, expect } from 'vitest';
import { CURRENCIES, getCurrencyLabel, findCurrency, currencyForCountry, primaryCountryForCurrency } from './currencies';

describe('getCurrencyLabel', () => {
  it('includes the currency code, name, and " — " separator', () => {
    const usd = CURRENCIES.find((c) => c.code === 'USD')!;
    const label = getCurrencyLabel(usd);
    expect(label).toContain('USD');
    expect(label).toContain('US Dollar');
    expect(label).toContain(' — ');
  });
});

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

describe('currencyForCountry', () => {
  it('returns the primary currency for known country codes', () => {
    expect(currencyForCountry('SG').code).toBe('SGD');
    expect(currencyForCountry('JP').code).toBe('JPY');
    expect(currencyForCountry('GB').code).toBe('GBP');
  });

  it('is case-insensitive', () => {
    expect(currencyForCountry('sg').code).toBe('SGD');
  });

  it('falls back to USD for an unknown country code', () => {
    expect(currencyForCountry('ZZ').code).toBe('USD');
  });
});

describe('primaryCountryForCurrency', () => {
  it('returns the single country code when only one country maps to the currency', () => {
    expect(primaryCountryForCurrency('JPY')).toBe('JP');
    expect(primaryCountryForCurrency('SGD')).toBe('SG');
  });

  it('returns undefined when multiple countries share the currency', () => {
    // EUR is used by many EU member states
    expect(primaryCountryForCurrency('EUR')).toBeUndefined();
    // USD is adopted by several countries
    expect(primaryCountryForCurrency('USD')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(primaryCountryForCurrency('jpy')).toBe('JP');
  });
});
