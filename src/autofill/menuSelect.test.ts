// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { menuSelect } from './menuSelect';
import { scanFields, scanAriaFields } from './scanner';
import { extractSignals } from './signals';
import { readFieldValue } from './fieldValue';
import { fieldIdentity } from './fieldState';
import { fileInputProxy } from './dom';
import { mapField } from './mapper';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { resolveProfileValue } from './resolver';
import { resolveRuleValue } from './ruleValue';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 40,
  } as DOMRect);
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function fixture() {
  document.body.innerHTML =
    '<form><label for="native">Country *</label><div><div><div><button type="button" data-menu-id="country-menu" aria-haspopup="true" aria-expanded="false" aria-label="Country United States">United States</button></div></div><select id="native" name="countryId.value" aria-hidden="true" readonly style="opacity:0;width:0;height:0"><option value="1"></option></select></div></form>';
  return document.querySelector('button')!;
}
it('scans the visible button, reads its committed answer and keeps a stable question identity', () => {
  const button = fixture();
  const identity = fieldIdentity(button);
  expect(scanAriaFields()).toEqual([button]);
  expect(extractSignals(button)).toMatchObject({
    label: 'Country',
    ariaLabel: 'Country',
    name: 'countryId.value',
    type: 'select',
  });
  expect(readFieldValue(button)).toBe('United States');
  button.textContent = 'Thailand';
  button.setAttribute('aria-label', 'Country Thailand');
  document.querySelector('option')!.value = '209';
  expect(readFieldValue(button)).toBe('Thailand');
  expect(fieldIdentity(button)).toBe(identity);
});
it.each([
  'missing backing select',
  'ordinary native select',
  'ambiguous selects',
  'disabled select',
])('does not expand an unrelated menu button: %s', (scenario) => {
  const button = fixture();
  const select = document.querySelector('select')!;
  if (scenario === 'missing backing select') select.remove();
  if (scenario === 'ordinary native select') select.removeAttribute('readonly');
  if (scenario === 'ambiguous selects') select.parentElement!.append(select.cloneNode(true));
  if (scenario === 'disabled select') select.disabled = true;
  expect(menuSelect(button)).toBeNull();
  expect(scanAriaFields()).not.toContain(button);
});
it('discovers an overlay file input through its unique local chooser and explicit Resume prompt', () => {
  document.body.innerHTML =
    '<form><div><p>Resume*</p><div><button type="button">Choose File*</button><span>No file selected</span><input type="file" aria-label="file-input" tabindex="-1" style="opacity:0"></div><input type="hidden" name="resumeFileId"></div></form>';
  const input = document.querySelector('input')!;
  expect(fileInputProxy(input)).toBe(input.parentElement);
  expect(scanFields({ allowFileInputs: true })).toEqual([input]);
  expect(mapField(extractSignals(input), RULE_PROFILE, {}, 'example.test')).toMatchObject({
    fieldPath: 'documents.cv.file',
    value: 'sample.pdf',
  });
});
it.each(['another input', 'two files', 'unrelated action'])(
  'does not expose an ambiguous hidden file widget: %s',
  (scenario) => {
    document.body.innerHTML =
      '<form><div><button type="button">Choose File</button><input type="file" tabindex="-1" style="opacity:0"></div></form>';
    const input = document.querySelector('input')!;
    if (scenario === 'another input') input.parentElement!.append(document.createElement('input'));
    if (scenario === 'two files') input.parentElement!.append(input.cloneNode());
    if (scenario === 'unrelated action') document.querySelector('button')!.textContent = 'Purchase';
    expect(fileInputProxy(input)).toBeUndefined();
    expect(scanFields({ allowFileInputs: true })).not.toContain(input);
  },
);
it('refreshes a pending available date at write time instead of using yesterday’s scan value', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 1, 1, 0, 1));
  document.body.innerHTML =
    '<label for="available">Date Available</label><input id="available" placeholder="mm/dd/yyyy">';
  const profile = { ...RULE_PROFILE, professional: { noticePeriod: { immediate: true } } };
  expect(
    resolveRuleValue(
      profile,
      'professional.noticePeriod.availableDate',
      extractSignals(document.querySelector('input')!),
      '2026-01-31',
    ),
  ).toBe('2026-02-01');
});
it.each([
  [{ immediate: true }, '2026-01-31'],
  [{ immediate: false, value: 2, unit: 'day' }, '2026-02-02'],
  [{ immediate: false, value: 2, unit: 'week' }, '2026-02-14'],
  [{ immediate: false, value: 1, unit: 'month' }, '2026-02-28'],
] as const)('computes local available dates for %j', (notice, expected) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 31, 12));
  expect(
    resolveProfileValue(
      { ...RULE_PROFILE, professional: { noticePeriod: notice } },
      'professional.noticePeriod.availableDate',
    ),
  ).toBe(expected);
});
