import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

test('detects a resume importer outside the form and fills the current address layout', async ({
  page,
  context,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.address = {
      country: 'TH',
      city: 'Bangkok',
      state: 'Bangkok',
      street: '123 Example Road',
      postalCode: '10310',
    };
    await chrome.storage.local.set({
      profile,
      quickFillPreferences: { enabled: true, disabledSites: [], fillMode: 'merge' },
    });
  });
  await page.evaluate(() => {
    document.title = 'Apply Today';
    document.body.innerHTML = `<div role="main"><h1>Senior Software Engineer</h1>
      <section aria-label="Upload options"><div>
        <input type="file" autocomplete="off" tabindex="-1" style="display:none">
        <button type="button">Upload Resume</button>
      </div></section>
      <form><label>Given Name - Western Script<input name="firstName" required></label>
        <label>Family Name - Western Script<input name="lastName" required></label>
        <label>Email address<input type="email" name="email" required></label>
        <label>Street Name<input name="street"></label>
        <label>District (Amphoe or Khet)<input name="district"></label>
        <label>Province<select name="province"><option value="">Please Select</option><option value="TH-10">Bangkok</option></select></label>
        <label>Postal Code<input name="postalCode"></label>
        <label>Phone Device Type<select name="deviceType"><option value="">Please Select</option><option>Mobile</option><option>Telephone</option></select></label>
        <button type="submit">Next</button>
      </form><output id="upload-events"></output><output id="province-events"></output><output id="advances">0</output>
    </div>`;
    document.querySelector('input[type=file]')!.addEventListener('change', (event) => {
      document.querySelector('#upload-events')!.textContent =
        (event.target as HTMLInputElement).files?.[0]?.name ?? '';
    });
    document.querySelector('select[name=province]')!.addEventListener('change', (event) => {
      document.querySelector('#province-events')!.textContent = (
        event.target as HTMLSelectElement
      ).value;
    });
    document.querySelector('form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      document.querySelector('#advances')!.textContent = '1';
    });
  });
  const widget = page.locator('[data-job-buddy-ui]');
  await expect(widget.getByRole('button', { name: 'Fill Form', exact: true })).toBeVisible();
  await widget.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(page.locator('#upload-events')).toHaveText('synthetic.pdf');
  await expect(page.locator('input[name=firstName]')).toHaveValue('Jane');
  await expect(page.locator('input[name=street]')).toHaveValue('123 Example Road');
  await expect(page.locator('select[name=province]')).toHaveValue('TH-10');
  await expect(page.locator('#province-events')).toHaveText('TH-10');
  await expect(page.locator('input[name=postalCode]')).toHaveValue('10310');
  await expect(page.locator('input[name=district]')).toHaveValue('');
  await expect(page.locator('select[name=deviceType]')).toHaveValue('');
  await expect(page.locator('#advances')).toHaveText('0');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await widget.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('input[name=firstName]')).toHaveValue('');
  await expect(page.locator('select[name=province]')).toHaveValue('');
  await expect(page.locator('#upload-events')).toHaveText('');
  expect(
    await page
      .locator('input[type=file]')
      .evaluate((input) => (input as HTMLInputElement).files?.length),
  ).toBe(0);
});

test('waits for a country-dependent region with only a stable id and a changing label', async ({
  page,
  context,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.address = { country: 'TH', city: 'Bangkok', state: 'Bangkok' };
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML = `<main><form><h1>Job application</h1>
      <label>Country<select id="country"><option value="CA">Canada</option><option value="TH">Thailand</option></select></label>
      <div id="region"><label>Province or Territory<select id="address.region"><option value="">Please Select</option><option value="ON">Ontario</option></select></label></div>
      <label>First name<input name="firstName" required></label><label>Email<input name="email" type="email" required></label>
      <output id="region-change"></output></form></main>`;
    document.querySelector('#country')!.addEventListener('change', (event) => {
      const thailand = (event.target as HTMLSelectElement).value === 'TH';
      setTimeout(() => {
        document.querySelector('#region')!.innerHTML = thailand
          ? '<label>Province<select id="address.region"><option value="">Please Select</option></select></label>'
          : '<label>Province or Territory<select id="address.region"><option value="">Please Select</option><option value="ON">Ontario</option></select></label>';
        document.getElementById('address.region')!.addEventListener('change', (event) => {
          document.querySelector('#region-change')!.textContent = (
            event.target as HTMLSelectElement
          ).value;
        });
        if (thailand)
          setTimeout(() => {
            document
              .getElementById('address.region')!
              .insertAdjacentHTML('beforeend', '<option value="TH-10">Bangkok</option>');
          }, 300);
      }, 300);
    });
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#country')).toHaveValue('TH');
  await expect(page.locator('[id="address.region"]')).toHaveValue('TH-10');
  await expect(page.locator('#region-change')).toHaveText('TH-10');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  await extension.send('CLEAR');
  await expect(page.locator('#country')).toHaveValue('CA');
  await expect(page.getByLabel('Province or Territory')).toHaveValue('');
});
