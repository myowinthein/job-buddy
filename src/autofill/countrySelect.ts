import { findCountryByNameOrCode } from '../data/countries';
import type { FieldSignals } from './signals';
import { normalize, isSkippableOption } from './normalizer';
import { sectionFamily } from './ruleContext';

const MIN_COUNTRY_CHOICES = 3;
const MIN_COUNTRY_SHARE = 0.6;

/** A generic Location label can agree with country metadata when its own
 * choices establish the meaning. Never treat Location alone as a country. */
export function countrySelectSupportsIdentifier(signals: FieldSignals): boolean {
  const element = signals.element;
  if (
    !(element instanceof HTMLSelectElement) ||
    element.multiple ||
    normalize(signals.label || signals.ariaLabel) !== 'location' ||
    [signals.label, signals.ariaLabel]
      .filter(Boolean)
      .some((label) => !['location', 'country', 'countryofresidence'].includes(normalize(label))) ||
    sectionFamily(element)
  )
    return false;
  const options = [...element.options].filter((option) => !isSkippableOption(option));
  const countries = options.map((option) => findCountryByNameOrCode(option.text.trim()));
  const known = countries.filter((country) => country !== undefined);
  return (
    new Set(known.map((country) => country.code)).size >= MIN_COUNTRY_CHOICES &&
    known.length / options.length >= MIN_COUNTRY_SHARE
  );
}
