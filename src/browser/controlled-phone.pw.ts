import { buildFixtureScript } from './buildFixture';
import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

test('retains controlled phone values, closes the portal and tints the visible field surface', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  const script = await buildFixtureScript({
    entry: 'src/browser/fixtures/controlled-phone.tsx',
    name: 'PhoneFixture',
    missingChunkMessage: 'Missing phone fixture',
    minify: false,
  });
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.personal.phone = { countryCode: 'TH', callingCode: '+66', number: '812345678' };
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });
  await page.addScriptTag({ content: script });
  await expect(page.locator('#phone')).toBeVisible();
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#dial')).toHaveValue('+66');
  await expect(page.locator('#dial')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#selected-country')).toHaveText('TH');
  await expect(page.locator('#phone')).toHaveValue('812345678');
  await expect(page.locator('#submitted-phone')).toHaveText('+66812345678');
  expect(
    await page.locator('#phone').evaluate((e) => (e as HTMLInputElement).checkValidity()),
  ).toBe(true);
  await expect(page.locator('#phone-surface')).toHaveCSS(
    'background-color',
    'rgba(34, 197, 94, 0.12)',
  );
  await expect(page.locator('#phone')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.locator('#phone').focus();
  await expect(page.locator('#phone-surface')).toHaveCSS('outline-style', 'solid');
  await page.locator('#phone').blur();
  await extension.send('CLEAR');
  await expect(page.locator('#phone')).toHaveValue('');
  await expect(page.locator('#dial')).toHaveValue('');
  await expect(page.locator('#dial')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#phone-surface')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});
