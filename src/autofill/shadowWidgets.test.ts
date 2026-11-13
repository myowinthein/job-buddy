// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fillField, resetDropdownBudget } from './filler';
import { getWriteConfidence, resetWriteSession } from './writeSession';
import { scanForm } from './scanner';
import { mapField } from './mapper';
import type { Profile } from '../types/profile';

beforeEach(() => {
  document.body.innerHTML = '';
  resetDropdownBudget();
  resetWriteSession();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function cityWidget(labels: string[], delay = 0) {
  const host = document.createElement('test-autocomplete');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<test-input></test-input><div id="cities" role="listbox"></div>';
  const inputRoot = root.querySelector('test-input')!.attachShadow({ mode: 'open' });
  inputRoot.innerHTML =
    '<label>City<input role="combobox" aria-controls="cities" aria-expanded="false"></label>';
  const input = inputRoot.querySelector('input')!;
  const list = root.querySelector<HTMLElement>('#cities')!;
  const chosen = vi.fn();
  input.addEventListener('input', () => {
    if (!input.value) return;
    const populate = () => {
      list.replaceChildren();
      for (const label of labels) {
        const optionHost = document.createElement('test-option');
        optionHost.textContent = label;
        const optionRoot = optionHost.attachShadow({ mode: 'open' });
        optionRoot.innerHTML = '<div role="option" aria-selected="false"><slot></slot></div>';
        optionRoot.querySelector('div')!.addEventListener('click', () => {
          chosen(label);
          input.value = label;
          input.setAttribute('aria-expanded', 'false');
          optionRoot.querySelector('div')!.setAttribute('aria-selected', 'true');
        });
        list.append(optionHost);
      }
    };
    input.setAttribute('aria-expanded', 'true');
    if (delay) setTimeout(populate, delay);
    else populate();
  });
  return { input, chosen };
}

it('selects delayed, slotted options in an enclosing shadow root', async () => {
  vi.useFakeTimers();
  const { input, chosen } = cityWidget(
    ['Bangkok Noi, Bangkok, Thailand', 'Bangkok, Thailand'],
    2100,
  );
  const pending = fillField(input, 'Bangkok', () => true, { cityCountry: 'Thailand' });
  await vi.advanceTimersByTimeAsync(2200);
  expect(await pending).toBe(true);
  expect(input.value).toBe('Bangkok, Thailand');
  expect(chosen).toHaveBeenCalledExactlyOnceWith('Bangkok, Thailand');
  expect(getWriteConfidence(input)).toBeLessThan(0.85);
});

it.each([
  ['Bangkok, United States'],
  ['Springfield, Illinois, United States', 'Springfield, Massachusetts, United States'],
])('leaves wrong-country or ambiguous city choices alone: %j', async (...labels) => {
  vi.useFakeTimers();
  const city = labels[0].split(',')[0];
  const { input, chosen } = cityWidget(labels);
  const pending = fillField(input, city, () => true, {
    cityCountry: city === 'Bangkok' ? 'Thailand' : 'United States',
  });
  await vi.advanceTimersByTimeAsync(4100);
  expect(await pending).toBe(false);
  expect(chosen).not.toHaveBeenCalled();
  expect(input.value).toBe('');
});

it('does not cross an explicit menu reference into an unrelated shadow widget', async () => {
  vi.useFakeTimers();
  const { input, chosen } = cityWidget(['Bangkok, Thailand']);
  input.setAttribute('aria-controls', 'missing-menu');
  const pending = fillField(input, 'Bangkok', () => true, { cityCountry: 'Thailand' });
  await vi.advanceTimersByTimeAsync(4100);
  expect(await pending).toBe(false);
  expect(chosen).not.toHaveBeenCalled();
});

it('discovers transparent drop-zone inputs and maps only their local document heading', () => {
  document.body.innerHTML =
    '<form><div id="resume"><h3>Resume *</h3><test-dropzone></test-dropzone></div><div><h3>Cover letter</h3><test-dropzone></test-dropzone></div></form>';
  for (const host of document.querySelectorAll('test-dropzone')) {
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<label>Choose a file or drop it here<input type="file" accept=".pdf" style="opacity:0"></label>';
  }
  const scan = scanForm({ allowFileInputs: true, scopeApplication: true });
  expect(scan.fields).toHaveLength(2);
  const signals = scan.signals(scan.fields[0]);
  expect(signals.label).toBe('Choose a file or drop it here');
  expect(signals.nearbyText).toBe('Resume *');
  const profile = {
    documents: {
      cv: { file: { name: 'test.pdf', size: 1, base64: 'data:application/pdf;base64,eA==' } },
    },
  } as Profile;
  expect(mapField(signals, profile, {}, 'example.test').fieldPath).toBe('documents.cv.file');
  expect(mapField(scan.signals(scan.fields[1]), profile, {}, 'example.test').fieldPath).not.toBe(
    'documents.cv.file',
  );
  document.querySelector<HTMLElement>('#resume')!.style.opacity = '0';
  expect(scanForm({ allowFileInputs: true }).fields).toHaveLength(1);
});
