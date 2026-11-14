// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { fillField } from './filler';
import { captureField } from './fieldState';
import { restore } from './filler';
import { resetWriteSession } from './writeSession';

beforeEach(() => {
  resetWriteSession();
  document.body.innerHTML =
    '<select><option value="CAN">Canada</option><option value="THA">Thailand</option></select>';
});
afterEach(() => {
  resetWriteSession();
  document.body.innerHTML = '';
});

function deferredSelect() {
  const select = document.querySelector('select')!;
  let model = select.value;
  const blurred: string[] = [];
  select.addEventListener('change', () => {
    const next = select.value;
    select.value = model;
    setTimeout(() => {
      model = next;
      select.value = model;
    }, 30);
  });
  select.addEventListener('blur', () => blurred.push(select.value));
  return { select, model: () => model, blurred };
}

it('waits for a deferred select update before blur and reporting a successful fill', async () => {
  const { select, model, blurred } = deferredSelect();
  expect(await fillField(select, 'THA')).toBe(true);
  expect(model()).toBe('THA');
  expect(select.value).toBe('THA');
  expect(blurred).toEqual(['THA']);
});

it('waits for the same deferred update while restoring the original selection', async () => {
  const { select, model } = deferredSelect();
  const original = captureField(select);
  await fillField(select, 'THA');
  expect(await restore(select, original, () => true)).toBe(true);
  expect(model()).toBe('CAN');
  expect(select.value).toBe('CAN');
});

it('reports a rejected controlled selection without retrying the change event', async () => {
  const select = document.querySelector('select')!;
  let changes = 0;
  select.addEventListener('change', () => {
    changes++;
    select.value = 'CAN';
  });
  expect(await fillField(select, 'THA')).toBe(false);
  expect(select.value).toBe('CAN');
  expect(changes).toBe(1);
});

it('stops waiting when the fill is cancelled', async () => {
  const select = document.querySelector('select')!;
  let active = true;
  select.addEventListener('change', () => {
    select.value = 'CAN';
    active = false;
  });
  expect(await fillField(select, 'THA', () => active)).toBe(false);
  expect(select.value).toBe('CAN');
});
