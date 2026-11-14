// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { mapField } from './mapper';
import { extractSignals } from './signals';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { CONF_DICT_EXACT, CONF_FILL } from './constants';

afterEach(() => {
  document.body.innerHTML = '';
});

function match(label = 'Location', id = 'country', options = ['Canada', 'Thailand', 'Germany']) {
  document.body.innerHTML = `<label for="${id}">${label}</label><select id="${id}"><option value="">Please Select</option>${options.map((name, i) => `<option value="country-${i}">${name}</option>`).join('')}</select>`;
  const element = document.querySelector('select')!;
  return mapField(extractSignals(element), RULE_PROFILE, {}, 'example.test');
}

it('trusts a country identifier corroborated by the Location dropdown’s country choices', () => {
  expect(match()).toMatchObject({ fieldPath: 'address.country', confidence: CONF_DICT_EXACT });
});
it('does not infer a country from Location or country choices without country metadata', () => {
  expect(match('Location', 'location').confidence).toBeLessThan(CONF_FILL);
});
it.each([
  { choices: ['Bangkok', 'Toronto', 'Berlin'] },
  { choices: ['Georgia', 'Alabama', 'Indiana'] },
  { choices: ['Canada', 'Thailand', 'Berlin', 'Toronto', 'Remote'] },
])('does not promote ambiguous Location choices: $choices', ({ choices }) => {
  expect(match('Location', 'country', choices).confidence).toBeLessThan(CONF_FILL);
});
it('preserves explicit office and birthplace meanings', () => {
  expect(match('Preferred office').confidence).toBeLessThan(CONF_FILL);
  expect(match('Country of birth')).toMatchObject({ ruleBlocked: true });
});
it('preserves a conflicting accessible question beside the generic visible label', () => {
  match();
  const element = document.querySelector('select')!;
  element.setAttribute('aria-label', 'Preferred office');
  expect(
    mapField(extractSignals(element), RULE_PROFILE, {}, 'example.test').confidence,
  ).toBeLessThan(CONF_FILL);
});
it('does not promote a history-entry location to the current address', () => {
  match();
  document.body.innerHTML = `<fieldset><legend>Work experience</legend>${document.body.innerHTML}</fieldset>`;
  expect(
    mapField(extractSignals(document.querySelector('select')!), RULE_PROFILE, {}, 'example.test')
      .confidence,
  ).toBeLessThan(CONF_FILL);
});
