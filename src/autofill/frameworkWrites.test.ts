// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { fillField, resetDropdownBudget } from './filler';
import { resetWriteSession, undoWrites } from './writeSession';

beforeEach(() => {
  document.body.innerHTML = '';
  resetWriteSession();
  resetDropdownBudget();
});
afterEach(() => resetWriteSession());

it('rejects and rolls back a text value changed by a scheduled framework effect', async () => {
  document.body.innerHTML = '<label>Name<input value="Original"></label>';
  const input = document.querySelector('input')!;
  input.addEventListener('input', () => {
    if (input.value === 'Replacement')
      setTimeout(() => {
        input.value = 'Reconciled';
      }, 0);
  });
  expect(await fillField(input, 'Replacement')).toBe(false);
  expect(input.value).toBe('Original');
  expect((await undoWrites()).success).toBe(true);
});

it('waits for a scheduled dropdown selection and closure before checking or toggling it', async () => {
  document.body.innerHTML =
    '<button type="button" role="combobox" aria-label="Country" aria-expanded="false" aria-controls="options"></button>';
  const trigger = document.querySelector('button')!;
  let opens = 0;
  trigger.addEventListener('click', () => {
    opens++;
    trigger.setAttribute('aria-expanded', 'true');
    const list = document.createElement('div');
    list.id = 'options';
    list.setAttribute('role', 'listbox');
    const option = document.createElement('div');
    option.setAttribute('role', 'option');
    option.textContent = 'Thailand';
    option.addEventListener('click', () =>
      setTimeout(() => {
        trigger.dataset.value = 'Thailand';
        trigger.setAttribute('aria-expanded', 'false');
        list.remove();
      }, 0),
    );
    list.append(option);
    document.body.append(list);
  });
  expect(await fillField(trigger, 'Thailand')).toBe(true);
  expect(trigger.dataset.value).toBe('Thailand');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(opens).toBe(1);
});

it('still rejects a control replaced during framework reconciliation', async () => {
  document.body.innerHTML = '<label>Name<input name="firstName"></label>';
  const input = document.querySelector('input')!;
  input.addEventListener('input', () => setTimeout(() => input.replaceWith(input.cloneNode()), 0));
  expect(await fillField(input, 'Replacement')).toBe(false);
  expect(input.isConnected).toBe(false);
});
