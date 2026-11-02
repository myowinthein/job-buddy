// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { extractSignals } from './signals';
import { resolveRuleValue, ruleValuePath } from './ruleValue';

afterEach(() => {
  document.body.innerHTML = '';
});
function signals(label: string, hint = '', type = 'text', help = '') {
  document.body.innerHTML =
    '<label for="value"></label><input id="value" aria-describedby="help"><p id="help"></p>';
  document.querySelector('label')!.textContent = label;
  document.querySelector('p')!.textContent = help;
  const input = document.querySelector('input')!;
  input.placeholder = hint;
  input.type = type;
  return extractSignals(input);
}

it.each([
  ['Will you require sponsorship?', 'We do not sponsor visas.', 'No'],
  ['Work authorization', 'Will you require sponsorship? We do not sponsor visas.', 'No'],
  ['Are you authorized to work?', 'We do not sponsor visas.', 'Yes, authorized to work'],
  ['Are you authorized to work without employer sponsorship?', '', 'Yes'],
  ['I do not require sponsorship', '', 'Yes'],
])('reads sponsorship polarity from the applicant question: %s', (label, help, expected) => {
  const profile = {
    ...RULE_PROFILE,
    workAuthorization: [{ country: 'US', status: 'citizen_or_pr' as const }],
  };
  expect(resolveRuleValue(profile, 'workAuthorization', signals(label, '', 'text', help))).toBe(
    expected,
  );
});

it.each([
  'per hour',
  'hourly',
  'per week',
  'weekly',
  'per day',
  'daily',
  'fortnightly',
  '(k)',
  'in thousands',
  'in lakhs per annum',
])('does not invent a conversion for salary %s', (period) => {
  expect(
    resolveRuleValue(
      RULE_PROFILE,
      'salary.expected.0.formatted',
      signals(`Expected salary ${period}`),
    ),
  ).toBe('');
});
it.each(['€', '£', 'eur', 'gbp', 'USD EUR'])(
  'does not substitute a different currency for %s',
  (currency) => {
    expect(
      resolveRuleValue(
        RULE_PROFILE,
        'salary.expected.0.formatted',
        signals(`Expected salary ${currency}`),
      ),
    ).toBe('');
  },
);
it('recognizes lowercase currencies and keeps the selected profile path aligned', () => {
  const field = signals('Expected salary usd per year', '', 'number');
  expect(ruleValuePath(RULE_PROFILE, 'salary.expected.1.formatted', field)).toBe(
    'salary.expected.0.formatted',
  );
  expect(resolveRuleValue(RULE_PROFILE, 'salary.expected.1.formatted', field)).toBe('72000');
});
it('does not treat a year-end bonus as an annual salary request', () => {
  expect(
    resolveRuleValue(
      RULE_PROFILE,
      'salary.expected.0.formatted',
      signals('Expected salary excluding year-end bonus'),
    ),
  ).toBe('6,000 USD');
});
it('does not treat a monthly bonus as a monthly salary request', () => {
  expect(
    resolveRuleValue(
      RULE_PROFILE,
      'salary.expected.0.formatted',
      signals('Expected annual salary excluding monthly bonus'),
    ),
  ).toBe('72,000 USD');
});
it('uses an available symbol currency without converting between currencies', () => {
  const profile = {
    ...RULE_PROFILE,
    salary: {
      ...RULE_PROFILE.salary,
      expected: [
        ...RULE_PROFILE.salary.expected,
        { currency: 'EUR', amount: 4000, period: 'monthly' as const },
      ],
    },
  };
  const field = signals('Expected salary € per year');
  expect(ruleValuePath(profile, 'salary.expected.0.formatted', field)).toBe(
    'salary.expected.2.formatted',
  );
  expect(resolveRuleValue(profile, 'salary.expected.0.formatted', field)).toBe('48,000 EUR');
});
it.each([
  ['Year graduated', '', 'text', '2013'],
  ['Graduation year', '', 'text', '2013'],
  ['Graduation date', 'YYYY', 'text', '2013'],
  ['Graduation date', 'MM/YYYY', 'text', '01/2013'],
  ['Graduation date', 'YYYY.MM', 'text', '2013.01'],
  ['Graduation date', '', 'number', '2013'],
  ['Graduation date', '', 'month', '2013-01'],
  ['Graduation date', '', 'date', ''],
])('formats the represented date for %s %s %s', (label, hint, type, expected) => {
  expect(
    resolveRuleValue(RULE_PROFILE, 'education.0.endDate.formatted', signals(label, hint, type)),
  ).toBe(expected);
});
it('leaves a graduation year empty for a current education entry', () => {
  expect(
    resolveRuleValue(RULE_PROFILE, 'education.1.endDate.formatted', signals('Year graduated')),
  ).toBe('');
});
