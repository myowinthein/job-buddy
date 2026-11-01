import { test, expect } from './fixtures';

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
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await expect(options.getByText('DEV', { exact: true })).toHaveCount(0);
  await options.getByRole('button', { name: 'Work History', exact: true }).click();
  await expect(options.getByText('No experience added', { exact: true })).toBeVisible();
  await options.getByLabel('Available Now', { exact: true }).check();
  await options.getByRole('button', { name: 'Save Work History', exact: true }).click();
  await expect(options.getByText('Work history saved', { exact: true })).toBeVisible();
  await options.getByRole('button', { name: '+ Add Entry', exact: true }).click();
  await options.getByRole('button', { name: 'Save Work History', exact: true }).click();
  for (const message of [
    'Company name is required',
    'Job title is required',
    'Start date is required',
    'End date is required',
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
  await options.getByRole('button', { name: 'Save Work History', exact: true }).click();
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
  await options.goto(new URL('options.html', extension.worker.url()).href);
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
