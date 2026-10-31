import { test, expect } from './fixtures';

test('appearance follows the saved choice across open pages, native controls and reset', async ({
  context,
  extension,
}) => {
  const optionsUrl = new URL('options.html', extension.worker.url()).href;
  const first = await context.newPage();
  const second = await context.newPage();
  for (const page of [first, second]) {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto(optionsUrl);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  }

  await first.getByRole('button', { name: 'Light', exact: true }).click();
  for (const page of [first, second]) {
    await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    expect(await page.locator('html').evaluate((e) => getComputedStyle(e).colorScheme)).toBe(
      'light',
    );
  }

  const popup = await context.newPage();
  await popup.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await popup.goto(new URL('popup.html', extension.worker.url()).href);
  await expect(popup.getByRole('button', { name: 'Fill Form', exact: true })).toBeVisible();
  expect(await popup.locator('html').evaluate((e) => getComputedStyle(e).colorScheme)).toBe(
    'light',
  );

  await second.getByRole('button', { name: 'Dark', exact: true }).click();
  for (const page of [first, second, popup]) {
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.locator('html').evaluate((e) => getComputedStyle(e).colorScheme)).toBe(
      'dark',
    );
  }

  // Removing the preference (as Reset does) returns each open page to its OS setting.
  await first.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.remove('themePreference');
  });
  await expect(first.locator('html')).not.toHaveClass(/dark/);
  await expect(second.locator('html')).toHaveClass(/dark/);
  for (const page of [first, second]) {
    await expect(page.getByRole('button', { name: 'System', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }

  await first.getByRole('button', { name: 'Personal', exact: true }).click();
  await first.getByLabel('Email*', { exact: true }).click();
  await first.keyboard.press('Tab');
  const callingCode = first.getByRole('button', { name: 'Select country calling code' });
  await expect(callingCode).toBeFocused();
  expect(await callingCode.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid');
  expect(await callingCode.evaluate((e) => getComputedStyle(e).outlineWidth)).toBe('2px');

  await first.getByRole('button', { name: 'Save Personal', exact: true }).click();
  const notification = first.getByRole('alert').filter({ hasText: 'Personal information saved' });
  await expect(notification).toBeVisible();
  expect(await notification.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  await notification.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(notification).toHaveCount(0);
});
