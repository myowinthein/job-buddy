// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { extractSignals } from './signals';
import { mapField } from './mapper';
import {
  adjustWorkAuthorizationMatches,
  authorizationContextAvailable,
} from './workAuthorizationResolution';
import { resolveRuleValue } from './ruleValue';
import type { WorkAuthorizationStatus } from '../types/profile';

afterEach(() => {
  document.body.innerHTML = '';
});
function fixture(status: WorkAuthorizationStatus = 'requires_sponsorship', middle = '') {
  const profile = {
    ...RULE_PROFILE,
    workAuthorization: [
      { country: 'CA', status: 'requires_sponsorship' as const },
      { country: 'US', status },
    ],
  };
  document.body.innerHTML = `<form><label for="auth">Are you legally authorized to work in the United States?</label><select id="auth"><option></option></select>${middle}<label for="sponsor">Will you now or in the future require sponsorship for employment visa status? We do not sponsor visas.</label><select id="sponsor"><option></option></select><label for="generic">Are you legally authorized to work in the country where this position is located?</label><select id="generic"><option></option></select></form>`;
  const matches = [...document.querySelectorAll<HTMLElement>('input,select')].map((element) => ({
    ...mapField(extractSignals(element), profile, {}, 'example.test'),
    element,
  }));
  adjustWorkAuthorizationMatches(matches, profile);
  return { profile, matches };
}
it.each([
  ['citizen_or_pr', 'Yes', 'No'],
  ['requires_sponsorship', 'No', 'Yes'],
  ['work_visa', 'Yes', ''],
] as const)(
  'answers from the US row with status %s, independently of Canada',
  (status, authorized, sponsor) => {
    const { profile, matches } = fixture(status);
    expect(
      resolveRuleValue(profile, matches[0].fieldPath!, extractSignals(matches[0].element)),
    ).toBe(authorized);
    expect(matches[1].fieldPath).toBe('workAuthorization.1');
    expect(matches[1].value ?? '').toBe(sponsor);
    expect(matches[2].fieldPath).toBe('workAuthorization');
    expect(matches[2].authorizationContext).toBeUndefined();
  },
);
it('does not borrow a country past an intervening control', () => {
  const { matches } = fixture(
    'citizen_or_pr',
    '<label for="other">Email</label><input id="other">',
  );
  expect(matches[2].fieldPath).toBe('workAuthorization');
  expect(matches[2].authorizationContext).toBeUndefined();
});
it('rejects a changed or detached country source before filling', () => {
  const { profile, matches } = fixture();
  expect(authorizationContextAvailable(matches[1], profile)).toBe(true);
  document.querySelector('label')!.textContent = 'Are you authorized to work in Canada?';
  expect(authorizationContextAvailable(matches[1], profile)).toBe(false);
  matches[0].element.remove();
  expect(authorizationContextAvailable(matches[1], profile)).toBe(false);
});
it('rejects indexed entries that conflict with an explicit country', () => {
  const { profile, matches } = fixture('citizen_or_pr');
  expect(resolveRuleValue(profile, 'workAuthorization.0', extractSignals(matches[0].element))).toBe(
    '',
  );
});
