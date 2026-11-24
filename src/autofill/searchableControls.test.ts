// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { searchableSelect, searchableSelectOptions } from './reactSelect';
import { readFieldValue } from './fieldValue';
import { isControlAvailable } from './dom';
import { applyHighlight, clearHighlights } from './highlighter';
import { mapField } from './mapper';
import { extractSignals } from './signals';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { adjustPhoneMatches } from './phoneResolution';

afterEach(() => {
  clearHighlights();
  document.body.innerHTML = '';
});
function select(value = '') {
  document.body.innerHTML = `<div class="select__control"><div class="select__value-container">${value ? `<div class="select__single-value">${value}</div>` : ''}<div><input role="combobox"></div></div></div>`;
  return document.querySelector('input')!;
}
it('reads the committed single selection and ignores the transient search query', () => {
  const input = select('Male');
  input.value = 'Female';
  input.style.opacity = '0';
  expect(readFieldValue(input)).toBe('Male');
  expect(isControlAvailable(input)).toBe(true);
  input.closest('.select__control')!.setAttribute('hidden', '');
  expect(isControlAvailable(input)).toBe(false);
});
it('does not mistake an uncommitted search for a selected answer', () => {
  const input = select();
  input.value = 'Bangkok';
  expect(readFieldValue(input)).toBe('');
});
it('reads legacy options only inside the linked menu of a recognized single select', () => {
  const input = select();
  const menu = document.createElement('div');
  menu.innerHTML =
    '<div class="select__option" id="legacy">Male</div><div role="option" id="modern">Female</div><div class="select__options-heading">Heading</div>';
  document.body.append(menu);
  document.body.insertAdjacentHTML('beforeend', '<div class="select__option">Unrelated</div>');
  expect(searchableSelectOptions(input, menu)?.map((option) => option.id)).toEqual([
    'legacy',
    'modern',
  ]);
  input.removeAttribute('role');
  expect(searchableSelectOptions(input, menu)).toBeNull();
});
it('rejects ambiguous editors, multi-selection and unrelated controls', () => {
  const input = select('Male');
  input.parentElement!.append(document.createElement('input'));
  expect(searchableSelect(input)).toBeNull();
  input.parentElement!.lastElementChild!.remove();
  const multi = document.createElement('div');
  multi.className = 'select__multi-value';
  input.parentElement!.append(multi);
  expect(searchableSelect(input)).toBeNull();
  input.removeAttribute('role');
  expect(searchableSelect(input)).toBeNull();
});
it('tints the visible control without changing query input or text styles', () => {
  const input = select('Male');
  const control = input.closest<HTMLElement>('.select__control')!;
  input.style.color = 'black';
  control.style.backgroundColor = 'white';
  applyHighlight(input, 0);
  expect(input.style.backgroundColor).toBe('');
  expect(input.style.color).toBe('black');
  expect(control.style.backgroundColor).not.toBe('white');
  clearHighlights();
  expect(control.style.backgroundColor).toBe('white');
});
it.each([
  ['Resume/CV *', 'cv'],
  ['Cover Letter', 'coverLetter'],
])('uses a named file group around a generic Attach label: %s', (label, kind) => {
  document.body.innerHTML = `<div role="group" aria-labelledby="heading"><div id="heading">${label}</div><div><label for="upload">Attach</label><input id="upload" type="file"></div></div>`;
  const match = mapField(
    extractSignals(document.querySelector('input')!),
    RULE_PROFILE,
    {},
    'example.test',
  );
  expect(match.fieldPath).toBe(`documents.${kind}.file`);
  expect(match.confidence).toBeGreaterThanOrEqual(0.6);
});
it('recognizes Location (City) without treating it as an unspecified location', () => {
  document.body.innerHTML =
    '<label for="city">Location (City)</label><input id="city" role="combobox">';
  expect(
    mapField(extractSignals(document.querySelector('input')!), RULE_PROFILE, {}, 'example.test')
      .fieldPath,
  ).toBe('address.city');
});
it.each(['Phone', 'Residence', 'Phone and address'])(
  'interprets Country as a dial code only in a named Phone group: %s',
  (legend) => {
    document.body.innerHTML = `<form><fieldset><legend>${legend}</legend><label for="country">Country</label><input id="country" role="combobox"><label for="phone">Phone</label><input id="phone" type="tel"></fieldset><label for="home">Country</label><input id="home"></form>`;
    const matches = [...document.querySelectorAll('input')].map((element) => ({
      ...mapField(extractSignals(element), RULE_PROFILE, {}, 'example.test'),
      element,
    }));
    adjustPhoneMatches(matches, RULE_PROFILE);
    expect(matches[0].fieldPath).toBe(
      legend === 'Phone' ? 'personal.phone.callingCode' : 'address.country',
    );
    expect(matches[2].fieldPath).toBe('address.country');
  },
);
