import { test, expect, extensionUrl } from './fixtures';
import { controlContrast } from './contrast';
import { DEV_PROFILE } from '../utils/devProfile';

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

test('appearance choice stays distinct in dark and forced-colors modes', async ({ context, extension }, info) => {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto(extensionUrl(extension, 'options.html'));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const group = page.getByRole('group', { name: 'Appearance', exact: true });
  await group.getByRole('button', { name: 'Dark', exact: true }).click();
  const contrast = await group.locator('[aria-pressed="true"]').evaluate(controlContrast);
  expect(contrast.fill).toBeGreaterThanOrEqual(3);
  expect(contrast.text).toBeGreaterThanOrEqual(4.5);
  await page.addStyleTag({ content: `
    *:not(svg):not(svg *) {
      line-height: 1.5 !important;
      letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important;
    }
    p { margin-bottom: 2em !important; }
  ` });
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await group.screenshot({ path: info.outputPath('appearance-dark.png') });

  await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark', reducedMotion: 'reduce' });
  for (const name of ['System', 'Light', 'Dark']) {
    const selected = group.getByRole('button', { name, exact: true });
    await selected.click();
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(selected.locator('svg')).toBeVisible();
    for (const other of await group.locator('button[aria-pressed="false"] svg').all())
      await expect(other).toBeHidden();
  }
  await group.screenshot({ path: info.outputPath('appearance-forced-colors.png') });
});

test('form boundaries and Quick Fill selection remain distinct in both themes', async ({ context, extension }, info) => {
  await extension.worker.evaluate(profile => chrome.storage.local.set({ profile }), DEV_PROFILE);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['light', 'dark']) {
    await extension.worker.evaluate(theme => chrome.storage.local.set({ themePreference: theme }), theme);
    await page.goto(extensionUrl(extension, 'options.html'));
    for (const section of ['Personal', 'Address', 'Salary', 'Languages']) {
      await page.getByRole('button', { name: section, exact: true }).click();
      while (await page.locator('[data-entry-toggle][aria-expanded="false"]').count())
        await page.locator('[data-entry-toggle][aria-expanded="false"]').first().click();
      await page.locator('main details').evaluateAll(items => {
        items.forEach(item => { (item as HTMLDetailsElement).open = true; });
      });
      const controls = page.locator('main input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), main select, main textarea, main button[aria-haspopup="listbox"]');
      for (const control of await controls.all()) {
        if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
        const contrast = await control.evaluate(controlContrast);
        if (!contrast.borderWidth) continue; // The phone number shares its surrounding border.
        expect(contrast.borderInside, `${theme} ${section}`).toBeGreaterThanOrEqual(3);
        expect(contrast.borderOutside, `${theme} ${section}`).toBeGreaterThanOrEqual(3);
      }
      if (section === 'Personal') {
        const phone = await page.getByRole('textbox', { name: 'Phone number', exact: true })
          .locator('..').evaluate(controlContrast);
        expect(phone.borderInside).toBeGreaterThanOrEqual(3);
        expect(phone.borderOutside).toBeGreaterThanOrEqual(3);
        const trigger = page.getByRole('button', { name: 'Select country calling code' });
        await trigger.click();
        const search = await page.getByRole('combobox', { name: 'Search country or code…' }).evaluate(controlContrast);
        expect(search.borderInside).toBeGreaterThanOrEqual(3);
        expect(search.borderOutside).toBeGreaterThanOrEqual(3);
        await page.keyboard.press('Escape');
      }
    }
    await page.getByRole('button', { name: 'Personal', exact: true }).click();
    const email = page.getByRole('textbox', { name: /^Email/ });
    await email.fill('invalid');
    const invalid = await email.evaluate(controlContrast);
    expect(invalid.borderInside).toBeGreaterThanOrEqual(3);
    expect(invalid.borderOutside).toBeGreaterThanOrEqual(3);
    page.once('dialog', dialog => dialog.accept());
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const quickFill = page.getByRole('group', { name: 'Floating button', exact: true });
    const contrast = await quickFill.locator('[aria-pressed="true"]').evaluate(controlContrast);
    expect(contrast.fill).toBeGreaterThanOrEqual(3);
    expect(contrast.text).toBeGreaterThanOrEqual(4.5);
    await quickFill.screenshot({ path: info.outputPath(`quick-fill-${theme}.png`) });
  }
  await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark', reducedMotion: 'reduce' });
  const quickFill = page.getByRole('group', { name: 'Floating button', exact: true });
  for (const name of ['Off', 'On']) {
    const selected = quickFill.getByRole('button', { name, exact: true });
    await selected.click();
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(selected.locator('svg')).toBeVisible();
    await expect(quickFill.locator('[aria-pressed="false"] svg')).toBeHidden();
  }
  await quickFill.screenshot({ path: info.outputPath('quick-fill-forced-colors.png') });
});
