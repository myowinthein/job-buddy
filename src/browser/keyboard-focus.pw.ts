import { test, expect, extensionUrl, geminiResponse, mappingReviewRequest, openPinnedPopup, stubEmptyGemini } from './fixtures';
import { DEV_PROFILE } from '../utils/devProfile';
import type { Locator } from '@playwright/test';

async function focusInKeyboardMode(control: Locator) {
  await control.evaluate(() => new Promise(requestAnimationFrame));
  await control.page().keyboard.press('Tab');
  await control.focus();
  await expect(control).toBeFocused();
}

async function expectUnclippedOutline(control: Locator) {
  await expect(control).toHaveCSS('outline-style', 'solid');
  expect(await control.evaluate(element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const expansion = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      const clip = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(css.overflowX) &&
        (box.left - expansion < clip.left - 1 || box.right + expansion > clip.right + 1)) return false;
      if (/auto|scroll|hidden|clip/.test(css.overflowY) &&
        (box.top - expansion < clip.top - 1 || box.bottom + expansion > clip.bottom + 1)) return false;
    }
    return parseFloat(style.outlineWidth) >= 2;
  })).toBe(true);
}

test('keyboard outlines remain whole on sidebar rows and segmented settings', async ({ context, extension }) => {
  const page = await context.newPage();
  await page.goto(extensionUrl(extension, 'options.html'));
  for (const theme of ['light', 'dark']) {
    await extension.worker.evaluate(theme => chrome.storage.local.set({ themePreference: theme }), theme);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const button of await page.locator('#options-sidebar button:visible').all()) {
        await focusInKeyboardMode(button);
        await expectUnclippedOutline(button);
      }
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      for (const name of ['System', 'Light', 'Dark', 'On', 'Off']) {
        const button = page.getByRole('button', { name, exact: true });
        await focusInKeyboardMode(button);
        await expectUnclippedOutline(button);
      }
    }
  }
});

test('the resume drop zone has a visible focus outline and its dialog traps keyboard navigation', async ({ context, extension }) => {
  const page = await context.newPage();
  await page.goto(extensionUrl(extension, 'options.html'));
  await page.getByRole('button', { name: 'Import Resume', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import Resume', exact: true });
  const upload = dialog.getByRole('button', { name: /Drop your resume here/ });
  await focusInKeyboardMode(upload);
  await expectUnclippedOutline(upload);
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
  await cancel.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(cancel).toBeFocused();
});

test('popup result focus follows the notice card and short results remain scrollable', async ({ context, extension }) => {
  await stubEmptyGemini(context);
  await extension.send('AUTOFILL_FILL', 'merge');
  const popup = await openPinnedPopup(context, extension.worker.url(), extension.sourceTabId);
  const region = popup.getByRole('region', { name: 'Autofill details' });
  await expect(popup.getByRole('region', { name: 'Fill results' })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await extension.worker.evaluate(theme => chrome.storage.local.set({ themePreference: theme }), theme);
    for (const height of [240, 600]) {
      await popup.setViewportSize({ width: 380, height });
      await focusInKeyboardMode(region);
      await expectUnclippedOutline(region);
      const bounds = await region.evaluate(element => ({
        region: element.getBoundingClientRect().toJSON(),
        card: element.firstElementChild!.getBoundingClientRect().toJSON(),
        scrollable: element.scrollHeight > element.clientHeight,
      }));
      expect(bounds.region.x).toBe(bounds.card.x);
      expect(bounds.region.width).toBe(bounds.card.width);
      if (height === 240) {
        expect(bounds.scrollable).toBe(true);
        await popup.keyboard.press('End');
        await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      }
      await region.focus();
      await popup.keyboard.press('Tab');
      await expect(popup.getByRole('button', { name: 'View details', exact: true })).toBeFocused();
      expect(await popup.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    }
  }
});

test('each phone control has its own focus marker and entries have one header toggle', async ({ context, extension }) => {
  await extension.worker.evaluate(profile => chrome.storage.local.set({ profile }), DEV_PROFILE);
  const page = await context.newPage();
  await page.goto(extensionUrl(extension, 'options.html'));
  const prefix = page.getByRole('button', { name: 'Select country calling code' });
  await focusInKeyboardMode(prefix);
  await expectUnclippedOutline(prefix);
  const number = page.getByRole('textbox', { name: 'Phone number', exact: true });
  await focusInKeyboardMode(number);
  await expect(number).not.toHaveCSS('box-shadow', 'none');
  expect(await number.locator('..').evaluate(element => getComputedStyle(element).boxShadow)).toBe('none');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ['Work Authorization', 'Work History', 'Education', 'Salary']) {
      await page.getByRole('button', { name: section, exact: true }).click();
      const toggle = page.locator('[data-entry-toggle]').first();
      await focusInKeyboardMode(toggle);
      await expectUnclippedOutline(toggle.locator('..'));
      const header = toggle.locator('..');
      await expect(header.locator('button[aria-expanded]')).toHaveCount(1);
      const arrow = header.locator('[data-entry-expand]');
      const remove = header.getByRole('button', { name: 'Remove entry', exact: true });
      const arrowBox = (await arrow.boundingBox())!;
      const removeBox = (await remove.boundingBox())!;
      expect(Math.abs(arrowBox.y + arrowBox.height / 2 - removeBox.y - removeBox.height / 2)).toBeLessThan(1);
      await arrow.click();
      await expect(toggle).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(remove).toBeFocused();
    }
  }
});

test('focus spacing follows outlined, filled, icon and segmented control styles', async ({ context, extension }) => {
  const page = await context.newPage();
  await page.goto(extensionUrl(extension, 'options.html'));
  for (const theme of ['light', 'dark']) {
    await extension.worker.evaluate(theme => chrome.storage.local.set({ themePreference: theme }), theme);
    await page.getByRole('button', { name: 'Personal', exact: true }).click();
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await focusInKeyboardMode(save);
    await expect(save).toHaveCSS('outline-offset', '2px');
    await page.getByRole('button', { name: 'Languages', exact: true }).click();
    const info = page.getByRole('button', { name: 'Proficiency guide', exact: true });
    await focusInKeyboardMode(info);
    await expect(info).toHaveCSS('outline-offset', '2px');
    await expect(info.locator('svg')).toHaveCSS('width', '14px');
    await expect(info).toHaveCSS('width', '24px');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const appearance = page.getByRole('button', { name: 'System', exact: true });
    await focusInKeyboardMode(appearance);
    await expect(appearance).toHaveCSS('outline-offset', '-2px');
    await page.getByRole('button', { name: 'Import Resume', exact: true }).click();
    const cancel = page.getByRole('dialog', { name: 'Import Resume', exact: true })
      .getByRole('button', { name: 'Cancel', exact: true });
    await focusInKeyboardMode(cancel);
    await expect(cancel).toHaveCSS('outline-offset', '0px');
    await expectUnclippedOutline(cancel);
    await cancel.click();
  }
});

test('Fill Details outlines cover row headers and fit individual matching stages', async ({ context, extension }) => {
  await stubEmptyGemini(context);
  await extension.send('AUTOFILL_FILL', 'merge');
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(extensionUrl(extension, 'options.html'));
  await page.getByRole('button', { name: 'Fill Details', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await extension.worker.evaluate(theme => chrome.storage.local.set({ themePreference: theme }), theme);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const row = page.getByLabel('Field results').locator('details').first();
      const summary = row.locator('summary');
      await row.evaluate(element => { (element as HTMLDetailsElement).open = false; });
      await focusInKeyboardMode(summary);
      const rowBox = (await row.boundingBox())!;
      const summaryBox = (await summary.boundingBox())!;
      expect(Math.abs(rowBox.height - summaryBox.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(rowBox.width - summaryBox.width)).toBeLessThanOrEqual(1);
      await expect(summary).toHaveCSS('outline-offset', '0px');
      await expectUnclippedOutline(summary);
      await page.keyboard.press('Enter');
      const stages = row.getByRole('list', { name: 'Matching stages' });
      await expect(stages).toBeVisible();
      for (const stage of await stages.locator('button:enabled').all()) {
        await focusInKeyboardMode(stage);
        await expectUnclippedOutline(stage);
        await expect(stage).toHaveCSS('outline-offset', '2px');
        if (width === 1280) {
          const buttonBox = (await stage.boundingBox())!;
          const columnBox = (await stage.locator('..').boundingBox())!;
          expect(buttonBox.width).toBeLessThan(columnBox.width * 0.75);
        }
      }
    }
  }
});

test('mapping site outlines cover headers and Edit stays beside Delete through confirmation', async ({ context, extension }) => {
  await extension.worker.evaluate(() => chrome.storage.local.set({
    learnedMappings: { 'jobs.example.test': {
      email: { path: 'personal.email', count: 2, label: 'Email address', question: 'Email address' },
    } },
  }));
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(extensionUrl(extension, 'options.html'));
  await page.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await extension.worker.evaluate(theme => chrome.storage.local.set({ themePreference: theme }), theme);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const site = page.getByRole('region', { name: 'Mappings for jobs.example.test' });
      const toggle = site.locator('h3 button');
      const header = site.locator('h3').locator('..');
      await focusInKeyboardMode(toggle);
      await expectUnclippedOutline(header);
      await expect(header).toHaveCSS('outline-offset', '-2px');
      if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
      const row = site.getByRole('group', { name: 'Email address', exact: true });
      const edit = row.getByRole('button', { name: /^Edit / });
      const remove = row.getByRole('button', { name: /^Delete mapping / });
      const editBox = (await edit.boundingBox())!;
      const removeBox = (await remove.boundingBox())!;
      expect(removeBox.x - editBox.x - editBox.width).toBeLessThanOrEqual(8);
      expect(removeBox.x - editBox.x - editBox.width).toBeGreaterThanOrEqual(0);
      const rowBox = await row.boundingBox();
      await remove.click();
      await expect(edit).toBeHidden();
      expect(await row.boundingBox()).toEqual(rowBox);
      await row.getByRole('button', { name: 'Cancel', exact: true }).press('Escape');
      await expect(remove).toBeFocused();
      await expect(edit).toBeVisible();
    }
  }
});

test('document upload buttons do not add invisible file-input keyboard stops', async ({ context, extension }) => {
  const page = await context.newPage();
  await page.goto(extensionUrl(extension, 'options.html'));
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.locator('main details').evaluateAll(details => { for (const item of details) if (item instanceof HTMLDetailsElement) item.open = true; });
  const uploads = page.getByRole('button', { name: /^(Upload file|Replace file)$/ });
  for (const button of await uploads.all()) {
    await focusInKeyboardMode(button);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.matches('input[type="file"]'))).toBe(false);
  }
});

test('Tab leaves a portalled profile chooser inside the mapping review dialog', async ({ context, extension }) => {
  await extension.worker.evaluate(() => chrome.storage.local.set({
    learnedMappings: {
      'jobs.example.test': {
        salary: { path: 'salary.current.amount', count: 2, label: 'Expected salary', question: 'Expected annual salary' },
      },
    },
  }));
  await context.route('https://generativelanguage.googleapis.com/**', route => {
    const request = mappingReviewRequest(route);
    return route.fulfill({ json: geminiResponse(JSON.stringify(request.mappings.map((item: { id: string }) => ({
      id: item.id, verdict: 'uncertain', path: null, reason: 'Check the profile field.',
    })))) });
  });
  const page = await context.newPage();
  await page.goto(extensionUrl(extension, 'options.html'));
  await page.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
  await page.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze Mappings', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Action for Expected salary', { exact: true }).selectOption('change');
  const trigger = dialog.getByRole('button', { name: /^Profile field:/ });
  await trigger.click();
  const picker = page.getByRole('listbox', { name: 'Profile fields' });
  await picker.getByRole('button').last().focus();
  await page.keyboard.press('Tab');
  await expect(picker).toBeHidden();
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await trigger.click();
  await page.getByRole('combobox', { name: 'Search profile fields' }).press('Shift+Tab');
  await expect(picker).toBeHidden();
  await expect(dialog.getByLabel('Action for Expected salary', { exact: true })).toBeFocused();
});
