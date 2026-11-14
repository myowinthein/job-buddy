// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fillField } from './filler';
import { extractSignals } from './signals';
import { adjustRepeatingEntryMatches } from './repeatingEntryResolution';
import { fieldIdentity } from './fieldState';
import { RULE_PROFILE } from './ruleMatching.fixture';
import type { FieldMatch } from './mapper';
import { resetWriteSession } from './writeSession';

beforeEach(() => {
  resetWriteSession();
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

function widget(dialog = false) {
  document.body.innerHTML = `<form ${dialog ? 'role="dialog"' : ''}><label for="date">From</label><div><div class="react-datepicker-wrapper"><input id="date" aria-labelledby="live"></div><span class="react-datepicker__aria-live" id="live" aria-live="polite"></span></div></form>`;
  const input = document.querySelector('input')!;
  const area = input.parentElement!.parentElement!;
  input.addEventListener('focus', () => {
    document.getElementById('live')!.textContent = 'Date picker opened. No date selected.';
    area.insertAdjacentHTML(
      'beforeend',
      '<div class="react-datepicker-popper"><div class="react-datepicker__year-wrapper">2023 2024</div></div>',
    );
  });
  input.addEventListener('input', () => {
    document.getElementById('live')!.textContent = `Selected date ${input.value}`;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') area.querySelector('.react-datepicker-popper')?.remove();
  });
  return input;
}

it('writes a year into an unmasked year picker, closes it and keeps stable question identity', async () => {
  const input = widget();
  const identity = fieldIdentity(input);
  expect(await fillField(input, 'July 2023')).toBe(true);
  expect(input.value).toBe('2023');
  expect(document.querySelector('.react-datepicker-popper')).toBeNull();
  expect(fieldIdentity(input)).toBe(identity);
  expect(extractSignals(input).label).toBe('From');
});

it('does not send Escape into a containing application dialog', async () => {
  const input = widget(true);
  let dismissed = false;
  document.querySelector('form')!.addEventListener(
    'keydown',
    () => {
      dismissed = true;
    },
    true,
  );
  expect(await fillField(input, 'July 2023')).toBe(true);
  expect(dismissed).toBe(false);
});

it('uses the existing month/year representation without adding a day', async () => {
  const input = widget();
  input.value = '05/2000';
  input.addEventListener('focus', () => {
    document.querySelector('.react-datepicker__year-wrapper')!.className = 'react-datepicker__month-wrapper';
  });
  expect(await fillField(input, '2021-12')).toBe(true);
  expect(input.value).toBe('12/2021');
  expect(document.querySelector('.react-datepicker-popper')).toBeNull();
});

it('resolves From/To only for date widgets within a known history section', () => {
  document.body.innerHTML =
    '<form><section><h2>Education</h2><label>From<div class="react-datepicker-wrapper"><input id="start"></div></label><label>To (Actual or Expected)<div class="react-datepicker-wrapper"><input id="end"></div></label><label>From<input id="unrelated"></label></section><label>From<div class="react-datepicker-wrapper"><input id="outside"></div></label></form>';
  const matches: FieldMatch[] = ['start', 'end', 'unrelated', 'outside'].map((id) => ({
    element: document.getElementById(id)!,
    fieldPath: null,
    value: null,
    confidence: 0,
    matchLayer: 'none',
  }));
  adjustRepeatingEntryMatches(matches, RULE_PROFILE.education, 'education', RULE_PROFILE);
  expect(matches[0].fieldPath).toMatch(/^education\.\d+\.startDate\.formatted$/);
  expect(matches[1].fieldPath).toMatch(/^education\.\d+\.endDate\.formatted$/);
  expect(matches[2].fieldPath).toBeNull();
  expect(matches[3].fieldPath).toBeNull();
});

it('retains a real accessible label alongside a changing status reference', () => {
  document.body.innerHTML =
    '<label id="label">Employment start date</label><span role="status" id="status">Selected January 2023</span><input aria-labelledby="label status">';
  expect(extractSignals(document.querySelector('input')!).ariaLabel).toBe('Employment start date');
});
