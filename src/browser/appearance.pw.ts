import { test, expect, extensionUrl } from './fixtures';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`profile navigation and shared animations follow ${reducedMotion}`, async ({ context, extension }) => {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => {
      const requests: ScrollIntoViewOptions[] = [];
      Reflect.set(window, 'motionScrolls', requests);
      const scroll = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (typeof options === 'object') requests.push(options);
        scroll.call(this, options);
      };
    });
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto(extensionUrl(extension, 'options.html'));
    page.on('dialog', (dialog) => dialog.accept());
    const behavior = reducedMotion === 'reduce' ? 'instant' : 'smooth';
    await page.getByRole('textbox', { name: /^First Name/ }).fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'motionScrolls').at(-1)))
      .toEqual({ block: 'center', behavior });
    await page.getByRole('button', { name: 'Languages', exact: true }).click();
    await page.getByRole('button', { name: '+ Add Language', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'motionScrolls').at(-1)))
      .toEqual({ block: 'nearest', behavior });
    await extension.worker.evaluate(() => chrome.storage.session.set({ 'jb:focusOnLoad': 'field-firstName' }));
    await expect(page.getByRole('textbox', { name: /^First Name/ })).toBeFocused();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'motionScrolls').at(-1)))
      .toEqual({ behavior, block: 'center' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const download = page.getByRole('button', { name: 'Download File', exact: true });
    await download.scrollIntoViewIfNeeded();
    await download.hover();
    await page.mouse.down();
    expect(await download.evaluate((button) => getComputedStyle(button).scale))
      .toBe(reducedMotion === 'reduce' ? 'none' : '0.95');
    await page.mouse.move(0, 0);
    await page.mouse.up();

    const popup = await context.newPage();
    await popup.emulateMedia({ reducedMotion });
    await popup.goto(extensionUrl(extension, 'popup.html'));
    for (const surface of [page, popup]) {
      const animation = await surface.evaluate(() => {
        const spinner = document.createElement('span');
        spinner.className = 'animate-spin';
        document.body.append(spinner);
        const name = getComputedStyle(spinner).animationName;
        spinner.remove();
        return name;
      });
      expect(animation).toBe(reducedMotion === 'reduce' ? 'none' : 'spin');
    }
  });
}

test('appearance follows the saved choice across open pages, native controls and reset', async ({
  context,
  extension,
}) => {
  const optionsUrl = extensionUrl(extension, 'options.html');
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
  await popup.goto(extensionUrl(extension, 'popup.html'));
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

  await first.getByRole('button', { name: 'Save', exact: true }).click();
  const notification = first.getByRole('alert').filter({ hasText: 'Profile saved.' });
  await expect(notification).toBeVisible();
  expect(await notification.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  await notification.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(notification).toHaveCount(0);
});
