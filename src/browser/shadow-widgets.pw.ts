import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

test('fills a delayed shadow City picker and transparent resume drop zone with validation and Undo', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.address = { city: 'Bangkok', country: 'TH' };
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><h1>Job application</h1><test-city></test-city><div><test-heading>Resume *</test-heading><test-dropzone></test-dropzone></div></form>';
    const heading = document.querySelector('test-heading')!.attachShadow({ mode: 'open' });
    heading.innerHTML = '<h3><slot></slot></h3>';
    const city = document.querySelector('test-city')!.attachShadow({ mode: 'open' });
    city.innerHTML =
      '<test-input label="City"></test-input><div id="city-menu" role="listbox" hidden></div>';
    const editor = city.querySelector('test-input')!.attachShadow({ mode: 'open' });
    editor.innerHTML =
      '<label>City<input role="combobox" aria-controls="city-menu" aria-expanded="false" required></label>';
    const input = editor.querySelector('input')!;
    input.setCustomValidity('Select a city');
    const menu = city.querySelector<HTMLElement>('#city-menu')!;
    let timer: ReturnType<typeof setTimeout>;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      input.dataset.inputs = String(Number(input.dataset.inputs ?? 0) + 1);
      input.setCustomValidity('Select a city');
      if (!input.value) {
        menu.hidden = true;
        return;
      }
      input.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
      timer = setTimeout(() => {
        menu.replaceChildren();
        for (const name of ['Bangkok Noi, Bangkok, Thailand', 'Bangkok, Thailand']) {
          const option = document.createElement('test-option');
          option.textContent = name;
          const optionRoot = option.attachShadow({ mode: 'open' });
          optionRoot.innerHTML = '<test-item><slot></slot></test-item>';
          const item = optionRoot.querySelector('test-item')!.attachShadow({ mode: 'open' });
          item.innerHTML = '<div role="option" aria-selected="false"><slot></slot></div>';
          option.addEventListener('click', () => {
            input.value = name;
            input.setCustomValidity('');
            input.dataset.chosen = name;
            input.setAttribute('aria-expanded', 'false');
            item.querySelector('div')!.setAttribute('aria-selected', 'true');
            menu.hidden = true;
          });
          menu.append(option);
        }
      }, 2100);
    });
    input.addEventListener('blur', () => {
      input.dataset.blurred = 'yes';
    });
    const dropzone = document.querySelector('test-dropzone')!.attachShadow({ mode: 'open' });
    dropzone.innerHTML =
      '<style>label { display:block; position:relative; width:400px; height:80px } input { position:absolute; inset:0; width:100%; height:100%; opacity:0 }</style><label>Choose a file or drop it here<input type="file" accept=".pdf" required></label>';
    const file = dropzone.querySelector('input')!;
    file.addEventListener('change', () => {
      file.dataset.changed = 'yes';
    });
  });
  await expect
    .poll(async () => {
      const scans = await extension.send('AUTOFILL_SCAN');
      return scans.some((scan) => Number(scan.totalMatched) >= 2);
    })
    .toBe(true);
  await extension.send('AUTOFILL_FILL', 'merge');
  const city = page.locator('test-city input');
  await expect(city).toHaveValue('Bangkok, Thailand');
  await expect(city).toHaveAttribute('data-chosen', 'Bangkok, Thailand');
  await expect(city).toHaveAttribute('data-blurred', 'yes');
  expect(Number(await city.getAttribute('data-inputs'))).toBeGreaterThan(0);
  const file = page.locator('test-dropzone input');
  await expect(file).toHaveAttribute('data-changed', 'yes');
  expect(
    await file.evaluate((el) => {
      const file = (el as HTMLInputElement).files?.[0];
      return { name: file?.name, size: file?.size, type: file?.type };
    }),
  ).toEqual({ name: 'synthetic.pdf', size: 13, type: 'application/pdf' });
  expect(await city.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(true);
  expect(await file.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(true);
  await extension.send('CLEAR');
  await expect(city).toHaveValue('');
  expect(await file.evaluate((el) => (el as HTMLInputElement).files?.length)).toBe(0);
  expect(await city.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(false);
  expect(await file.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(false);
});
