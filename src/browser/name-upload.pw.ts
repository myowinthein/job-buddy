import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

test('fills a translated surname pair and a hidden CV chooser with a generic upload label', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  await page.evaluate(() => {
    document.body.innerHTML = `<main><h1>Job application</h1><form>
      <fieldset><legend>Personal information</legend>
        <label for="last_name">Name *</label><input id="last_name" name="last_name" required>
        <label for="first_name">First name *</label><input id="first_name" name="first_name" required>
        <label for="email">Email *</label><input id="email" type="email" required>
      </fieldset>
      <div class="file-input-wrapper"><label for="upload_cv" style="display:flex;width:300px;height:60px">Import your documents</label>
        <input id="upload_cv" name="upload_cv" type="file" accept="application/pdf" style="display:none;opacity:0">
        <p>Maximum 2MB</p>
      </div><p>You can import your CV or cover letter.</p>
      <output id="upload-events"></output><button>Send</button>
    </form></main>`;
    document.querySelector('#upload_cv')!.addEventListener('change', (e) => {
      document.querySelector('output')!.textContent =
        (e.target as HTMLInputElement).files?.[0]?.name ?? '';
    });
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#last_name')).toHaveValue('Doe');
  await expect(page.locator('#first_name')).toHaveValue('Jane');
  await expect(page.locator('#upload-events')).toHaveText('synthetic.pdf');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  expect(
    await page.locator('#upload_cv').evaluate((e) => (e as HTMLInputElement).files?.[0]?.size),
  ).toBe(13);
  await extension.send('CLEAR');
  await expect(page.locator('#last_name')).toHaveValue('');
  await expect(page.locator('#first_name')).toHaveValue('');
  expect(
    await page.locator('#upload_cv').evaluate((e) => (e as HTMLInputElement).files?.length),
  ).toBe(0);
});

test('keeps a full name beside first name when surname semantics are absent', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.derived = {
      fullName: 'Jane Doe',
      currentTitle: '',
      currentCompany: '',
      totalExperience: { years: 0, months: 0, totalMonths: 0, label: '0 years' },
    };
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><h1>Job application</h1><label for="full_name">Name</label><input id="full_name"><label for="first_name">First name</label><input id="first_name"><label>Email<input type="email" name="email"></label></form>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#full_name')).toHaveValue('Jane Doe');
  await expect(page.locator('#first_name')).toHaveValue('Jane');
});
