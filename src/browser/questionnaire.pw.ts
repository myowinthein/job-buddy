import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

const form = `<main><h1>Senior Software Engineer</h1><form><fieldset><legend>You are applying for -</legend>
<label>Are you NOW legally authorized to work in the country where the position is located?<select id="authorization"><option value="">Please Select</option><option>Yes</option><option>No</option></select></label>
<label>Do you now, or will you in the future, require sponsorship for an employment visa in the country where the position is located?<select id="sponsorship"><option value="">Please Select</option><option>Yes</option><option>No</option></select></label>
<label>Have you entered into a restrictive covenant or non-compete agreement?<select id="covenant"><option value="">Please Select</option><option>Yes</option><option>No</option></select></label>
<label>Gender<select id="gender"><option value="">Please Select</option><option>Female</option><option>Male</option></select></label>
<label>Have you ever worked for Example Company?<select id="prior-employment"><option value="">Please Select</option><option>Yes</option><option>No</option></select></label>
<label>What is your desired salary?<textarea id="salary"></textarea></label><button>Next</button>
</fieldset></form></main>`;

test('detects a fresh later application document, fills supported answers, and preserves ambiguous questions', async ({
  context,
  extension,
  page,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.personal.gender = 'female';
    profile.workAuthorization = [
      { country: 'US', status: 'requires_sponsorship' },
        { country: 'TH', status: 'citizen_or_pr' },
    ];
    await chrome.storage.local.set({
      profile,
      quickFillPreferences: { enabled: true, disabledSites: [], fillMode: 'overwrite' },
    });
  });
  await context.route('http://127.0.0.1/apply?step=3', (route) =>
    route.fulfill({ contentType: 'text/html', body: form }),
  );
  await page.goto('http://127.0.0.1/apply?step=3');
  const widget = page.locator('[data-job-buddy-ui]');
  const fill = widget.getByRole('button', { name: 'Fill Form', exact: true });
  await expect(fill).toBeVisible();
  await page.reload();
  await expect(fill).toBeVisible();
  await fill.click();
  await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await expect(page.locator('#gender')).toHaveValue('Female');
  for (const id of ['authorization', 'sponsorship', 'covenant', 'prior-employment'])
    await expect(page.locator(`#${id}`)).toHaveValue('');
  await expect(page.locator('select:focus')).toHaveCount(0);
  expect(
    await page.locator('#gender').evaluate((input) => (input as HTMLSelectElement).checkValidity()),
  ).toBe(true);
  await widget.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#gender')).toHaveValue('');
});
