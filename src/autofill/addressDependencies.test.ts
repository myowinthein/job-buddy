// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addressDependencies } from './addressDependencies';
import { extractSignals } from './signals';
import { mapField } from './mapper';
import { RULE_PROFILE } from './ruleMatching.fixture';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 40,
  } as DOMRect);
  document.body.innerHTML = `<form><label>Country<select id="country"><option>Canada</option><option>Thailand</option></select></label>
    <div id="region"><label>Province or Territory<select id="address.region"><option value="">Please Select</option><option>Ontario</option></select></label></div></form>`;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function dependencies() {
  const profile = { ...RULE_PROFILE, address: { ...RULE_PROFILE.address, state: 'Bangkok' } };
  return addressDependencies(
    [...document.querySelectorAll('select')].map((element) => {
      const signals = extractSignals(element);
      return { element, signals, match: mapField(signals, profile, {}, 'example.test') };
    }),
  );
}

it('follows the same id after delayed country replacement and a region-label change', async () => {
  const [dependency] = dependencies();
  expect(dependency.region.match.fieldPath).toBe('address.state');
  expect(dependency.region.match.value).toBe('Bangkok');
  let finished = false;
  const wait = dependency
    .waitForReplacement(() => true)
    .then(() => {
      finished = true;
    });
  await vi.advanceTimersByTimeAsync(100);
  expect(finished).toBe(false);
  document.querySelector('#region')!.innerHTML =
    '<label>Province<select id="address.region"><option>Bangkok</option></select></label>';
  await vi.advanceTimersByTimeAsync(50);
  await wait;
  expect(dependency.replacement()).toBe(document.getElementById('address.region'));
});

it('waits for new options when the select itself is retained', async () => {
  const [dependency] = dependencies();
  let finished = false;
  const wait = dependency
    .waitForReplacement(() => true)
    .then(() => {
      finished = true;
    });
  await vi.advanceTimersByTimeAsync(100);
  expect(finished).toBe(false);
  document.getElementById('address.region')!.innerHTML = '<option>Bangkok</option>';
  await vi.advanceTimersByTimeAsync(50);
  await wait;
  expect(finished).toBe(true);
  expect(dependency.replacement()).toBeNull();
});

it('waits through a replacement that initially contains only a loading placeholder', async () => {
  const [dependency] = dependencies();
  let finished = false;
  const wait = dependency
    .waitForReplacement(() => true)
    .then(() => {
      finished = true;
    });
  document.querySelector('#region')!.innerHTML =
    '<label>Province<select id="address.region"><option value="">Please Select</option></select></label>';
  await vi.advanceTimersByTimeAsync(100);
  expect(finished).toBe(false);
  document
    .getElementById('address.region')!
    .insertAdjacentHTML('beforeend', '<option>Bangkok</option>');
  await vi.advanceTimersByTimeAsync(50);
  await wait;
  expect(finished).toBe(true);
});

it('does not wait when the country already matches, or when cancelled', async () => {
  document.querySelector<HTMLSelectElement>('#country')!.value = 'Thailand';
  await dependencies()[0].waitForReplacement(() => true);
  document.querySelector<HTMLSelectElement>('#country')!.value = 'Canada';
  await dependencies()[0].waitForReplacement(() => false);
  expect(vi.getTimerCount()).toBe(0);
});

it('bounds its wait when no replacement arrives', async () => {
  let finished = false;
  const wait = dependencies()[0]
    .waitForReplacement(() => true)
    .then(() => {
      finished = true;
    });
  await vi.advanceTimersByTimeAsync(2_000);
  await wait;
  expect(finished).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not follow an id into another form', () => {
  const [dependency] = dependencies();
  document.getElementById('address.region')!.remove();
  document.body.insertAdjacentHTML(
    'beforeend',
    '<form><label>Province<select id="address.region"><option>Bangkok</option></select></label></form>',
  );
  expect(dependency.replacement()).toBeNull();
});
