import { buildFixtureScript } from './buildFixture';
import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile, WorkAuthorizationStatus } from '../types/profile';

let fixtureScript: string;
test.beforeAll(async () => {
  fixtureScript = await buildFixtureScript({
    entry: 'src/browser/fixtures/searchable-select.tsx',
    name: 'SelectFixture',
    missingChunkMessage: 'Missing fixture',
    minify: false,
  });
});
for (const [status, authorized, sponsor] of [
  ['requires_sponsorship', 'No', 'Yes'],
  ['citizen_or_pr', 'Yes', 'No'],
  ['work_visa', 'Yes', ''],
] as const) {
  test(`retains committed answers, delayed city and document uploads with US ${status}`, async ({
    context,
    page,
    extension,
  }) => {
    await stubEmptyGemini(context);
    await extension.worker.evaluate(async (status: WorkAuthorizationStatus) => {
      const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
      profile.personal.phone = { countryCode: 'TH', callingCode: '+66', number: '812345678' };
      profile.personal.gender = 'Male';
      profile.address = { city: 'Bangkok', country: 'TH' };
      profile.workAuthorization = [
        { country: 'CA', status: 'requires_sponsorship' },
        { country: 'US', status },
      ];
      profile.documents.coverLetter = {
        file: { ...profile.documents.cv.file!, name: 'dummy-cover.pdf' },
      };
      await chrome.storage.local.set({ profile });
    }, status);
    await page.evaluate(() => {
      document.body.innerHTML = '<div id="root"></div>';
    });
    await page.addScriptTag({ content: fixtureScript });
    await expect(page.locator('[id="4026376004"]')).toBeVisible();
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'overwrite');
    await expect(page.locator('#country-answer')).toHaveText('+66');
    await expect(page.locator('#country')).toHaveValue('');
    await expect(page.locator('#phone')).toHaveValue('812345678');
    expect(
      await page.locator('#phone').evaluate((e) => (e as HTMLInputElement).checkValidity()),
    ).toBe(true);
    await expect(page.locator('#city-answer')).toHaveText('Bangkok, Thailand');
    await expect(page.locator('#authorized-answer')).toHaveText(authorized);
    await expect(page.locator('#sponsor-answer')).toHaveText(sponsor);
    await expect(page.locator('#gender-answer')).toHaveText('Male');
    await expect(page.locator('[role=listbox]')).toHaveCount(0);
    const files = await page
      .locator('input[type=file]')
      .evaluateAll((inputs) =>
        inputs.map((e) => [...(e as HTMLInputElement).files!].map((f) => f.name)),
      );
    expect(files).toEqual([['synthetic.pdf'], ['dummy-cover.pdf'], []]);
    await expect(page.locator('[id="4026376004"]')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(page.locator('#gender-surface')).not.toHaveCSS(
      'background-color',
      'rgba(239, 68, 68, 0.12)',
    );
    await expect(page.locator('#gender-surface .select__single-value')).toHaveCSS(
      'color',
      'rgb(20, 20, 20)',
    );
    // A second merge reads committed selections even though query inputs are empty.
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'merge');
    await expect(page.locator('#city-answer')).toHaveText('Bangkok, Thailand');
    await expect(page.locator('#gender-answer')).toHaveText('Male');
  });
}
test('Undo clears empty originals and restores previous selections, preserving later edits', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.personal.gender = 'Male';
    profile.personal.phone = { countryCode: 'TH', callingCode: '+66', number: '812345678' };
    profile.address = { city: 'Bangkok', country: 'TH' };
    profile.workAuthorization = [{ country: 'US', status: 'requires_sponsorship' }];
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });
  await page.addScriptTag({ content: fixtureScript });
  await expect(page.locator('[id="4026376004"]')).toBeVisible();
  await page.locator('[id="4026376004"]').click();
  await page.getByRole('option', { name: 'Female', exact: true }).click();
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#gender-answer')).toHaveText('Male');
  await extension.send('CLEAR');
  await expect(page.locator('#gender-answer')).toHaveText('Female');
  await expect(page.locator('#city-answer')).toHaveText('');
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await page.locator('[id="4026376004"]').click({ force: true });
  await page.getByRole('option', { name: 'Female', exact: true }).click();
  await extension.send('CLEAR');
  await expect(page.locator('#gender-answer')).toHaveText('Female');
});
