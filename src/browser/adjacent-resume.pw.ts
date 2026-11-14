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
