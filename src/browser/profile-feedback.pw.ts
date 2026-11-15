import { test, expect, extensionUrl } from './fixtures';
import { feedback } from '../ui/feedback';
import type { Profile } from '../types/profile';

for (const theme of ['light', 'dark']) {
  test(`profile load failure preserves data and supports keyboard retry in ${theme} mode`, async ({
    context,
    extension,
  }) => {
    await extension.worker.evaluate(async (theme) => {
      await chrome.storage.local.set({ themePreference: theme });
    }, theme);
    const before = await extension.worker.evaluate(() => chrome.storage.local.get(null));
    const options = await context.newPage();
    await options.addInitScript(() => {
      const original = chrome.storage.local.get.bind(chrome.storage.local);
      (window as Window & { failProfileRead?: boolean }).failProfileRead = true;
      chrome.storage.local.get = ((keys: unknown, ...args: unknown[]) => {
        if (
          keys === 'profile' &&
          (window as Window & { failProfileRead?: boolean }).failProfileRead
        )
          throw new Error('Simulated profile read failure');
        return (original as (keys: unknown, ...args: unknown[]) => unknown)(keys, ...args);
      }) as typeof chrome.storage.local.get;
    });
    await options.goto(extensionUrl(extension, 'options.html'));
    const retry = options.getByRole('button', { name: 'Retry', exact: true });
    for (const width of [320, 768, 1280]) {
      await options.setViewportSize({ width, height: 760 });
      await expect(options.getByRole('alert')).toContainText(feedback.profileLoadFailed);
      await expect(retry).toBeInViewport({ ratio: 1 });
      await expect(options.getByRole('textbox', { name: /First Name/ })).toHaveCount(0);
      expect(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await retry.click();
    await expect(retry).toBeEnabled();
    await expect(options.getByRole('alert')).toContainText(feedback.profileLoadFailed);
    expect(await extension.worker.evaluate(() => chrome.storage.local.get(null))).toEqual(before);

    await options.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await expect(retry).toBeInViewport({ ratio: 1 });
    expect(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await options.evaluate(() => {
      document.documentElement.style.zoom = '';
      (window as Window & { failProfileRead?: boolean }).failProfileRead = false;
    });
    await retry.focus();
    await retry.press('Enter');
    await expect(options.getByRole('textbox', { name: /First Name/ })).toHaveValue('Jane');
    await expect(options.getByRole('alert')).toHaveCount(0);
    const after = await extension.worker.evaluate(() => chrome.storage.local.get(null));
    expect((after.profile as Profile).personal).toEqual((before.profile as Profile).personal);
    expect((after.profile as Profile).documents).toEqual((before.profile as Profile).documents);
    expect(after.learnedMappings).toEqual(before.learnedMappings);
  });
}

test('experience validation is visible, and an empty profile cannot download an empty backup', async ({
  context,
  extension,
}, info) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({
      profile: { id: 'empty-feedback' },
      learnedMappings: {},
      themePreference: 'dark',
    });
  });
  const options = await context.newPage();
  await options.goto(extensionUrl(extension, 'options.html'));
  await expect(options.getByText('DEV', { exact: true })).toHaveCount(0);
  await options.getByRole('button', { name: 'Work History', exact: true }).click();
  await expect(options.getByLabel('Company*', { exact: true })).toHaveValue('');
  await options.getByLabel('Available Now', { exact: true }).check();
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(options.getByText('Profile saved.', { exact: true })).toBeVisible();
  await options.getByLabel('Company*', { exact: true }).fill(' ');
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  for (const message of [
    'Enter a company name',
    'Enter a job title',
    'Enter a start date',
    'Enter an end date',
  ]) {
    await expect(options.getByText(message, { exact: true })).toBeVisible();
  }
  await expect(options.getByLabel('Company*', { exact: true })).toBeFocused();
  await expect(options.getByLabel('Company*', { exact: true })).toBeInViewport({ ratio: 1 });
  await options.screenshot({ path: info.outputPath('experience-validation-dark.png') });
  await options.getByLabel('Company*', { exact: true }).fill('Sample Company');
  await options.getByLabel('Job Title*', { exact: true }).fill('Engineer');
  await options.locator('#field-workHistory-0-startDate').selectOption('01');
  await options.getByLabel('Year', { exact: true }).first().fill('2020');
  await options.getByLabel('I currently work here', { exact: true }).check();
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(() =>
      extension.worker.evaluate(async () => {
        const profile = (await chrome.storage.local.get('profile')).profile as {
          workHistory?: unknown[];
        };
        return profile.workHistory?.length;
      }),
    )
    .toBe(1);

  // Return to genuinely empty data, rather than treating availability as empty.
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({ profile: { id: 'empty-feedback' } });
  });
  await options.reload();
  await options.getByRole('button', { name: 'Settings', exact: true }).click();
  let downloads = 0;
  options.on('download', () => {
    downloads++;
  });
  await options.getByRole('button', { name: 'Download File', exact: true }).click();
  await expect(options.getByText('No saved data to export.', { exact: true })).toBeVisible();
  expect(downloads).toBe(0);
  await options.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('not json'),
  });
  await expect(
    options.getByText('Select a valid Job Buddy export file.', { exact: true }),
  ).toBeVisible();
});

test('missing details communicate overflow and reveal every section on desktop and narrow layouts', async ({
  context,
  extension,
}, info) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({ profile: { id: 'empty-feedback' }, themePreference: 'dark' });
  });
  const options = await context.newPage();
  await options.setViewportSize({ width: 1100, height: 760 });
  await options.goto(extensionUrl(extension, 'options.html'));
  for (const [name, width] of [
    ['desktop', 1100],
    ['narrow', 390],
  ] as const) {
    await options.setViewportSize({ width, height: 760 });
    await options.getByRole('button', { name: /required remaining/ }).click();
    const region = options.getByRole('region', { name: 'Missing details' });
    const list = region.getByRole('list', { name: 'Profile details by section' });
    await expect(region.locator('[data-scroll-cue]')).toBeVisible();
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await region.screenshot({ path: info.outputPath(`missing-details-${name}-dark.png`) });
    const bounds = await region.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect(region.locator('[data-scroll-cue]')).toHaveCount(0);
    const last = list.getByRole('button').last();
    await expect(last).toBeVisible();
    await last.click();
    await expect(region).toHaveCount(0);
  }
});
