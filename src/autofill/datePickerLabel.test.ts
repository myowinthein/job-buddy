// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { extractSignals } from './signals';
import { fieldIdentity } from './fieldState';
import { fillField } from './filler';

afterEach(() => {
  document.body.innerHTML = '';
});

it.each(['role="dialog"', 'role="grid"', 'aria-hidden="true"', 'hidden'])(
  'keeps a date field identity stable when focus opens a nested calendar with %s',
  async (attributes) => {
    document.body.innerHTML =
      '<form><label>Start date (Optional)<input name="start_date" inputmode="tel" placeholder="MM/YYYY"></label></form>';
    const input = document.querySelector('input')!;
    const before = fieldIdentity(input);
    input.addEventListener('focus', () => {
      input.parentElement!.insertAdjacentHTML(
        'beforeend',
        `<div ${attributes}>2026<span>Jan</span><span>Feb</span><button type="button">Next year</button></div>`,
      );
    });
    expect(await fillField(input, '07/2023')).toBe(true);
    expect(input.value).toBe('07/2023');
    expect(extractSignals(input).label).toBe('Start date (Optional)');
    expect(fieldIdentity(input)).toBe(before);
  },
);

it('still rejects a field whose real question changes on focus', async () => {
  document.body.innerHTML =
    '<label><span>Start date</span><input name="date" placeholder="MM/YYYY"></label>';
  const input = document.querySelector('input')!;
  input.addEventListener('focus', () => {
    input.parentElement!.querySelector('span')!.textContent = 'Birth date';
  });
  expect(await fillField(input, '07/2023')).toBe(false);
  expect(input.value).toBe('');
});
