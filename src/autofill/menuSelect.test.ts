// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { menuSelect } from './menuSelect';
import { scanAriaFields } from './scanner';
import { extractSignals } from './signals';
import { readFieldValue } from './fieldValue';
import { fieldIdentity } from './fieldState';

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
