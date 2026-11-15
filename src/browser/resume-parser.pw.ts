import { buildFixtureScript } from './buildFixture';
import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

let script: string;
test.beforeAll(async () => {
  script = await buildFixtureScript({
    entry: 'src/browser/fixtures/resume-parser.tsx',
    name: 'ResumeParserFixture',
    missingChunkMessage: 'Missing resume parser fixture',
  });
});
test.beforeEach(async ({ context, extension, page }) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.personal.firstName = 'Jane Anne';
    profile.personal.nickname = 'Nickname';
    await chrome.storage.local.set({
      profile,
      quickFillPreferences: { enabled: true, disabledSites: [], fillMode: 'overwrite' },
    });
  });
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });
  await page.addScriptTag({ content: script });
  await expect(page.locator('#given')).toBeVisible();
});

test('floating fill waits for an adjacent resume parser and writes canonical names afterward', async ({
  page,
}) => {
  const widget = page.locator('[data-job-buddy-ui]');
  await widget.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await expect(page.locator('#filename')).toHaveText('synthetic.pdf');
  await expect(page.locator('#given')).toHaveValue('Jane Anne');
  await expect(page.locator('#family')).toHaveValue('Doe');
  await expect(page.locator('#preferred')).toHaveValue('Nickname');
  await expect(page.locator('#model')).toContainText('"parsed":true');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#model')).toContainText('"first":"Jane Anne","last":"Doe"');
  await expect(page.locator('#model')).toContainText('"next":true');
  await page.locator('#family').fill('Manual surname');
  await widget.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#family')).toHaveValue('Manual surname');
  await expect(page.locator('#filename')).toHaveText('');
});

test('a manual edit during import stops later writes and leaves the uploaded file undoable', async ({
  page,
  extension,
}) => {
  await page.evaluate(() => history.replaceState(null, '', '?delay=1200'));
  await extension.send('AUTOFILL_SCAN');
  const filling = extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.locator('#preferred').fill('Manual nickname');
  await filling;
  await expect(page.locator('input[name=email]')).toHaveValue('');
  await expect(page.locator('#preferred')).toHaveValue('Manual nickname');
  await extension.send('CLEAR');
  await expect(page.locator('#filename')).toHaveText('');
});
