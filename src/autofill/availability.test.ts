// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveRuleValue, ruleValuePath } from './ruleValue';
import { extractSignals } from './signals';
import { RULE_PROFILE } from './ruleMatching.fixture';
import type { NoticePeriod, Profile } from '../types/profile';

const DATE = 'professional.noticePeriod.availableDate';
const DURATION = 'professional.noticePeriod.formatted';
const profile = (noticePeriod?: NoticePeriod): Profile => ({
  ...RULE_PROFILE,
  professional: { ...RULE_PROFILE.professional, noticePeriod },
});
function field(html: string) {
  document.body.innerHTML = `<label>When could you join our team?${html}</label>`;
  return extractSignals(document.querySelector<HTMLElement>('input,textarea,select')!);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 14, 12));
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});
it.each([DATE, DURATION])('formats free-text availability for either mapped path: %s', (path) => {
  const signals = field('<input type="text">');
  expect(ruleValuePath(RULE_PROFILE, path, signals)).toBe(DURATION);
  expect(resolveRuleValue(profile({ immediate: true }), path, signals, 'stale date')).toBe(
    'Available immediately.',
  );
  expect(
    resolveRuleValue(profile({ immediate: false, value: 1, unit: 'month' }), path, signals),
  ).toBe("Available after 1 month's notice.");
  expect(
    resolveRuleValue(profile({ immediate: false, value: 2, unit: 'week' }), path, signals),
  ).toBe("Available after 2 weeks' notice.");
  expect(resolveRuleValue(profile(), path, signals, 'stale date')).toBe('');
});
it.each([
  '<input type="date">',
  '<input placeholder="MM/DD/YYYY">',
  '<input placeholder="DD.MM.YYYY">',
  '<input placeholder="YYYY-MM-DD">',
  '<input data-datepicker>',
  '<input data-controller="forms--date-picker">',
])('keeps calendar and masked fields as dates: %s', (html) => {
  const signals = field(html);
  expect(ruleValuePath(RULE_PROFILE, DURATION, signals)).toBe(DATE);
  expect(resolveRuleValue(profile({ immediate: true }), DURATION, signals)).toBe('2026-11-14');
  expect(
    resolveRuleValue(profile({ immediate: false, value: 2, unit: 'week' }), DATE, signals),
  ).toBe('2026-11-28');
});
it('honors an explicit date request in an ordinary text input', () => {
  const signals = field('<input aria-label="Earliest start date">');
  expect(ruleValuePath(RULE_PROFILE, DURATION, signals)).toBe(DATE);
  expect(
    resolveRuleValue(profile({ immediate: false, value: 1, unit: 'month' }), DURATION, signals),
  ).toBe('2026-12-14');
});
it('formats a textarea availability answer', () => {
  expect(resolveRuleValue(profile({ immediate: true }), DATE, field('<textarea></textarea>'))).toBe(
    'Available immediately.',
  );
});
it.each(['input', 'select'])('preserves the duration for notice-period %s fields', (tag) => {
  const signals = field(`<${tag} aria-label="Notice period"></${tag}>`);
  signals.label = 'Notice period';
  expect(resolveRuleValue(profile({ immediate: true }), DURATION, signals)).toBe('Immediate');
  expect(resolveRuleValue(RULE_PROFILE, DURATION, signals)).toBe('1 Month');
});
it('keeps custom duration dropdown values unchanged', () => {
  const signals = field('<input role="combobox">');
  expect(ruleValuePath(RULE_PROFILE, DURATION, signals)).toBe(DURATION);
  expect(resolveRuleValue(RULE_PROFILE, DURATION, signals)).toBe('1 Month');
});
