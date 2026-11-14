import { build } from 'vite';
import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

let script: string;
test.beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: 'src/browser/fixtures/menu-address.tsx',
        formats: ['iife'],
        name: 'AddressFixture',
      },
    },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  });
  const output = Array.isArray(bundle) ? bundle[0].output : 'output' in bundle ? bundle.output : [];
  const chunk = output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing address fixture');
  script = chunk.code;
});
test.beforeEach(async ({ context, page, extension }) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.address = { country: 'TH', city: 'Bangkok', state: 'Bangkok' };
    profile.professional.noticePeriod = { immediate: false, value: 2, unit: 'week' };
    profile.salary.expected = [
      { currency: 'THB', amount: 100000, period: 'monthly' },
      { currency: 'USD', amount: 120000, period: 'annual' },
    ];
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });
  await page.addScriptTag({ content: script });
  await expect(page.locator('#country-value')).toHaveText('US');
});
test('fills country before a replacement province, uploads the resume and computes a formatted date', async ({
  page,
  extension,
}) => {
  const available = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#country-value')).toHaveText('TH');
  await expect(page.locator('#province')).toHaveValue('Bangkok');
  await expect(page.locator('#region-value')).toHaveText('Bangkok');
  await expect(page.locator('#file-value')).toHaveText('synthetic.pdf');
  await expect(page.locator('#available')).toHaveValue(available);
  expect(
    await page.locator('#available').evaluate((e) => (e as HTMLInputElement).checkValidity()),
  ).toBe(true);
  await expect(page.locator('#pay')).toHaveValue('');
  await expect(page.locator('[role=menu]')).toHaveCount(0);
  await extension.send('CLEAR');
  await expect(page.locator('#country-value')).toHaveText('US');
  await expect(page.locator('#region-value')).toHaveText('NY');
  await expect(page.locator('#file-value')).toHaveText('');
});
test('Undo preserves a later manual province edit together with its country', async ({
  page,
  extension,
}) => {
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#province')).toHaveValue('Bangkok');
  await page.locator('#province').fill('Chiang Mai');
  await page.locator('#province').blur();
  await extension.send('CLEAR');
  await expect(page.locator('#country-value')).toHaveText('TH');
  await expect(page.locator('#province')).toHaveValue('Chiang Mai');
});
test('merge keeps an existing country and state', async ({ page, extension }) => {
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('#country-value')).toHaveText('US');
  await expect(page.locator('#region-value')).toHaveText('NY');
});
