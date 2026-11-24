// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { mapField } from './mapper';
import { extractSignals } from './signals';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { allowedAIPath } from './aiSafety';

afterEach(() => {
  document.body.innerHTML = '';
});
it.each([
  ['Please provide your (legal) first name', 'personal.firstName'],
  ['Please provide your (legal) last name', 'personal.lastName'],
  [
    'Personal Summary This section is optional. Use it to tell us a little more about yourself.',
    'professional.summary',
  ],
  ['Do you have the Right to Work (RTW) in the UK?', 'workAuthorization'],
])('matches a literal profile request: %s', (label, path) => {
  document.body.innerHTML = `<label>${label}<textarea></textarea></label>`;
  const field = document.querySelector('textarea')!;
  expect(mapField(extractSignals(field), RULE_PROFILE, {}, 'example.test').fieldPath).toBe(path);
});
it.each(['Address Line 2', 'Address Line 3', 'Sex Assigned at Birth'])(
  'keeps unsupported question data manual even with an incorrect trusted mapping: %s',
  (label) => {
    document.body.innerHTML = `<label>${label}<input name="street"></label>`;
    const field = document.querySelector('input')!;
    expect(
      mapField(
        extractSignals(field),
        RULE_PROFILE,
        { 'example.test': { street: { path: 'address.street', count: 2 } } },
        'example.test',
      ).ruleBlocked,
    ).toBe(true);
    expect(
      allowedAIPath(RULE_PROFILE, { fieldId: 'x', type: 'text', label }, 'address.street'),
    ).toBe(false);
  },
);
it('does not treat another person’s name or a tailored summary as a literal profile request', () => {
  for (const label of [
    "Please provide your manager's name",
    'Personal Summary: describe your AWS production experience',
  ]) {
    document.body.innerHTML = `<label>${label}<textarea></textarea></label>`;
    expect(
      mapField(
        extractSignals(document.querySelector('textarea')!),
        RULE_PROFILE,
        {},
        'example.test',
      ).fieldPath,
    ).toBeNull();
  }
});

it('allows only a recognized non-searchable chooser through its internal read-only marker', async () => {
  const { isControlAvailable } = await import('./dom');
  document.body.innerHTML =
    '<input id="ordinary" aria-readonly="true"><input id="unrecognized" role="combobox" aria-readonly="true" inputmode="none"><div class="react-select__control"><div class="react-select__value-container"><input id="choice" role="combobox" inputmode="none" aria-readonly="true"></div></div>';
  expect(isControlAvailable(document.getElementById('ordinary')!)).toBe(false);
  expect(isControlAvailable(document.getElementById('unrecognized')!)).toBe(false);
  const choice = document.getElementById('choice')!;
  expect(isControlAvailable(choice)).toBe(true);
  choice.parentElement!.parentElement!.setAttribute('aria-readonly', 'true');
  expect(isControlAvailable(choice)).toBe(false);
});
