// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { scanForm } from './scanner';
import { extractSignals } from './signals';
import { mapField } from './mapper';
import { adjustPhoneMatches } from './phoneResolution';
import { fillField, resetDropdownBudget } from './filler';
import { readFieldValue } from './fieldValue';
import { resolveRuleValue } from './ruleValue';
import { educationChoiceAliases } from './educationChoices';
import { resetWriteSession } from './writeSession';
import { RULE_PROFILE } from './ruleMatching.fixture';

beforeEach(() => {
  resetWriteSession();
  resetDropdownBudget();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
});
afterEach(() => {
  resetWriteSession();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

it('associates an unbound label only inside a field with one editor', () => {
  document.body.innerHTML =
    '<div class="field"><label>Your level of education</label><ui-input><input></ui-input></div><div class="field"><label>Shared row</label><input><input></div><div class="field"><label for="elsewhere">Other question</label><input></div>';
  const inputs = [...document.querySelectorAll('input')];
  expect(extractSignals(inputs[0]).label).toBe('Your level of education');
  expect(inputs.slice(1).map((input) => extractSignals(input).label)).toEqual(['', '', '']);
});

it('discovers the local country toggle and resolves a separate national number', () => {
  document.body.innerHTML =
    '<form><div class="field"><label>Phone</label><ui-phone formcontrolname="phone"><button type="button">+33 keyboard_arrow_down</button><input type="text"></ui-phone></div></form>';
  const { fields, signals } = scanForm();
  const button = document.querySelector('button')!;
  const input = document.querySelector('input')!;
  expect(fields).toEqual([button, input]);
  const matches = fields.map((element) => ({
    ...mapField(signals(element), RULE_PROFILE, {}, 'example.test'),
    element,
  }));
  adjustPhoneMatches(matches, RULE_PROFILE);
  expect(matches.map((match) => match.fieldPath)).toEqual([
    'personal.phone.callingCode',
    'personal.phone.number',
  ]);
});

it('selects a level through a scoped new CDK menu and reads the committed label', async () => {
  document.body.innerHTML =
    '<div class="field"><label>Your level of education</label><ui-select data-searchable="true" class="dropdown-close"><ui-input><div class="trigger"><span class="value placeholder">Choose...</span></div><input placeholder="Search" style="opacity:0;width:1px"></ui-input></ui-select></div><div class="cdk-overlay-pane"><button type="button"><span class="option-label">Bachelor from another widget</span></button></div>';
  const input = document.querySelector('input')!;
  const widget = input.closest('ui-select')!;
  const answer = 'Licence, Bachelor or equivalent (bac +3)';
  widget.querySelector('.trigger')!.addEventListener('click', () => {
    const existing = document.getElementById('new-menu');
    if (existing) {
      existing.remove();
      widget.classList.add('dropdown-close');
      return;
    }
    widget.classList.remove('dropdown-close');
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="cdk-overlay-pane" id="new-menu"><button type="button"><span class="option-label">${answer}</span></button></div>`,
    );
    document.querySelector('#new-menu button')!.addEventListener('click', () => {
      widget.querySelector('.value')!.textContent = answer;
      widget.querySelector('.value')!.classList.remove('placeholder');
      document.getElementById('new-menu')!.remove();
      widget.classList.add('dropdown-close');
    });
  });
  expect(scanForm().fields).toContain(input);
  expect(extractSignals(input).type).toBe('select');
  expect(await fillField(input, 'Bachelor of Science')).toBe(true);
  expect(input.value).toBe('');
  expect(readFieldValue(input)).toBe(answer);
});

it('does not equate multiple degrees at the same education level', () => {
  document.body.innerHTML = '<label>Education level<input></label>';
  expect(
    educationChoiceAliases(
      extractSignals(document.querySelector('input')!),
      'Bachelor of Science',
      ['Bachelor of Arts', 'Bachelor of Science and Engineering'],
    ),
  ).toEqual([]);
});

it('keeps availability as an ISO date and accepts a valid Material display reformat', async () => {
  document.body.innerHTML =
    '<div class="field"><label>Availability for any position</label><ui-date class="ng-invalid"><input class="mat-datepicker-input" data-mat-calendar="calendar" aria-haspopup="dialog"></ui-date></div>';
  const input = document.querySelector('input')!;
  const profile = { ...RULE_PROFILE, professional: { noticePeriod: { immediate: true } } };
  const value = resolveRuleValue(
    profile,
    'professional.noticePeriod.availableDate',
    extractSignals(input),
  );
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  input.addEventListener('input', () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.value)) return;
    const [year, month, day] = input.value.split('-');
    input.value = `${day}/${month}/${year}`;
    input.parentElement!.classList.replace('ng-invalid', 'ng-valid');
  });
  expect(await fillField(input, value)).toBe(true);
  expect(input.value).toBe(value.split('-').reverse().join('/'));
});

it('rejects a Material input whose component retains an invalid value', async () => {
  document.body.innerHTML =
    '<ui-date class="ng-invalid"><input class="mat-datepicker-input" data-mat-calendar="calendar"></ui-date>';
  const input = document.querySelector('input')!;
  expect(input.validity.valid).toBe(true);
  expect(await fillField(input, '2026-11-25')).toBe(false);
  expect(input.value).toBe('');
});

it('preserves the discipline when a question asks for a degree rather than a level', () => {
  document.body.innerHTML = '<label>Highest Education Obtained<select></select></label>';
  expect(
    educationChoiceAliases(
      extractSignals(document.querySelector('select')!),
      'Bachelor of Science (Honours)',
      ['College - Bachelor of Arts'],
    ),
  ).toEqual(['Bachelor of Science', 'College - Bachelor of Science']);
});
