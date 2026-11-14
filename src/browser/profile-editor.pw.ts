import { test, expect, extensionUrl } from './fixtures';
import { DEV_PROFILE } from '../utils/devProfile';
import type { Profile } from '../types/profile';

test('inline profile confirmations stay clear of labels and controls at each grid width', async ({ context, extension }) => {
  test.setTimeout(60_000);
  await extension.worker.evaluate((profile) => chrome.storage.local.set({ profile }), DEV_PROFILE);
  const page = await context.newPage();
  await page.goto(extensionUrl(extension, 'options.html'));
  for (const width of [320, 390, 590, 690, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ['Languages', 'Links', 'Salary']) {
      await page.getByRole('button', { name: section, exact: true }).click();
      const cards = page.locator('.profile-entry-fields');
      await expect(cards.first()).toBeVisible();
      for (const card of await cards.all()) {
        const fieldsBefore = await card.locator('[data-field-error]').evaluateAll((fields) =>
          fields.map((field) => field.getBoundingClientRect().toJSON()),
        );
        await card.getByRole('button', { name: /^(Remove entry|Clear salary)$/ }).click();
        await expect(card.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
        const overlapping = await card.evaluate((card) => {
          const action = card.querySelector('span[aria-hidden="false"]:has(> button)')!
            .getBoundingClientRect();
          return [...card.querySelectorAll('label, input, select, textarea, [data-field-error] button')]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.left < action.right && rect.right > action.left &&
                rect.top < action.bottom && rect.bottom > action.top;
            })
            .map((element) => element.tagName);
        });
        expect(overlapping, `${section} at ${width}px`).toEqual([]);
        expect(await card.locator('[data-field-error]').evaluateAll((fields) =>
          fields.map((field) => field.getBoundingClientRect().toJSON()),
        )).toEqual(fieldsBefore);
        await card.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
    }
  }
  await page.close();
});

test('keeps the sidebar toggle stationary and centers the collapsed rail', async ({ context, extension }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(extensionUrl(extension, 'options.html'));
  const sidebar = page.locator('aside');
  const toggle = page.getByRole('button', { name: /^(Expand|Collapse) sidebar$/ });
  const personal = sidebar.getByRole('button', { name: 'Personal', exact: true });
  const indicators = sidebar.locator('nav button > span[title]');
  const original = await toggle.boundingBox();
  expect(original).not.toBeNull();
  await expect(indicators.first()).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(64);
  expect(await toggle.boundingBox()).toEqual(original);
  await expect(indicators).toHaveCount(0);
  const railIcon = await personal.locator('svg').boundingBox();
  expect(railIcon!.x + railIcon!.width / 2).toBeCloseTo(31.5);

  await page.mouse.click(original!.x + original!.width / 2, original!.y + original!.height / 2);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(224);
  expect(await toggle.boundingBox()).toEqual(original);
  await expect(indicators.first()).toBeVisible();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(64);
  await expect(toggle).toBeHidden();
  await expect(indicators.first()).toBeHidden();
  await personal.click();
  await expect(personal).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.close();
});

for (const width of [390, 1280]) {
  test(`reuses empty profile entries and focuses them at ${width}px`, async ({ context, extension }) => {
    await extension.worker.evaluate(() =>
      chrome.storage.local.set({ profile: { id: 'entry-reuse' }, learnedMappings: {} }),
    );
    const page = await context.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    await page.setViewportSize({ width, height: 900 });
    await page.goto(extensionUrl(extension, 'options.html'));
    const form = page.getByRole('main');
    const sections = [
      { name: 'Work Authorization', field: /^Authorization Status/, focus: /^Country/, value: 'citizen_or_pr', select: true, collapsible: true },
      { name: 'Work History', field: /^Company/, focus: /^Company/, value: 'Example', collapsible: true },
      { name: 'Education', field: /^Institution/, focus: /^Institution/, value: 'Example', collapsible: true },
      { name: 'Languages', field: /^Proficiency/, focus: /^Language/, value: 'native_bilingual', select: true },
      { name: 'Links', field: /^Label/, focus: /^Label/, value: 'Example' },
      { name: 'Salary', field: /^Amount/, focus: /^Amount/, value: '0', collapsible: true },
    ];
    for (const section of sections) {
      await page.getByRole('button', { name: section.name, exact: true }).click();
      const add = page.getByRole('button', { name: /^\+ Add/ });
      if (section.collapsible)
        await page.locator('[data-entry-toggle][aria-expanded="true"]').click();
      await add.click();
      await add.dblclick();
      await expect(page.getByRole('button', { name: 'Remove entry', exact: true })).toHaveCount(1);
      await expect(form.getByLabel(section.focus).first()).toBeFocused();
      await expect(form.getByLabel(section.focus).first()).toBeInViewport();

      const fields = form.getByLabel(section.field).and(form.locator(section.select ? 'select' : 'input, textarea'));
      const first = fields.first();
      if (section.select) await first.selectOption(section.value);
      else await first.fill(section.value);
      await add.click();
      await expect(page.getByRole('button', { name: 'Remove entry', exact: true })).toHaveCount(2);
      await expect(form.getByLabel(section.focus).nth(1)).toBeFocused();
      await expect(form.getByLabel(section.focus).nth(1)).toBeInViewport();

      const second = fields.nth(1);
      if (section.select) {
        await second.selectOption(section.value);
        await first.selectOption('');
      } else {
        await second.fill(section.value);
        await first.fill('');
      }
      await add.click();
      await expect(page.getByRole('button', { name: 'Remove entry', exact: true })).toHaveCount(2);
      await expect(form.getByLabel(section.focus).first()).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.close();
  });
}

for (const width of [390, 1280]) {
  test(`profile removal, document actions and unsaved recovery at ${width}px`, async ({
    context,
    extension,
  }) => {
    test.setTimeout(60_000);
    await extension.worker.evaluate(async (profile) => {
      await chrome.storage.local.set({
        profile: {
          ...profile,
          documents: {
            cv: {
              url: 'https://example.test/resume.pdf',
              file: { name: 'sample.pdf', size: 6, base64: 'c2FtcGxl' },
            },
          },
          workAuthorization: profile.workAuthorization.slice(0, 1),
          education: profile.education.slice(0, 1),
          languages: profile.languages.slice(0, 1),
          workHistory: profile.workHistory.slice(0, 1),
          salary: { ...profile.salary, expected: profile.salary.expected.slice(0, 1) },
        },
      });
    }, DEV_PROFILE);
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await page.goto(extensionUrl(extension, 'options.html'));
    for (const section of [
      'Work Authorization',
      'Work History',
      'Education',
      'Languages',
      'Links',
      'Salary',
    ]) {
      await page.getByRole('button', { name: section, exact: true }).click();
      if (section === 'Education') {
        await page.locator('[data-entry-toggle][aria-expanded="false"]').click();
        await page.getByRole('checkbox', { name: /currently studying/i }).check();
        await page.locator('[data-entry-toggle][aria-expanded="true"]').click();
        await expect(page.getByText('Current', { exact: true })).toBeVisible();
      }
      const remove = page.getByRole('button', { name: 'Remove entry', exact: true });
      const control = await remove.first().locator('..').locator('..').elementHandle();
      const before = await control!.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      }));
      await remove.first().click();
      expect(
        await control!.evaluate((element) => ({
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        })),
      ).toEqual(before);
      const confirm = page.getByRole('button', { name: 'Clear', exact: true });
      await expect(confirm).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await remove.first().click();
      await confirm.click();
      await expect(remove).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      // These local edits are intentionally left unsaved between sections.
      page.once('dialog', (dialog) => dialog.accept());
    }
    const clearSalary = page.getByRole('button', { name: 'Clear salary', exact: true });
    await clearSalary.click();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(clearSalary).toBeVisible();
    await clearSalary.click();
    await expect(clearSalary).toBeVisible();
    await page.getByRole('button', { name: 'Documents', exact: true }).click();
    const cv = page.getByRole('region', { name: 'CV / Résumé', exact: true });
    await expect(cv.getByText(/PDF or Word · max/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove URL', exact: true })).toHaveCount(0);
    await cv.getByRole('button', { name: 'Remove file', exact: true }).click();
    await cv.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(cv.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
    await cv.getByRole('button', { name: 'Remove file', exact: true }).click();
    await cv.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        extension.worker.evaluate(async () => {
          const { profile } = (await chrome.storage.local.get('profile')) as { profile: Profile };
          return profile.documents.cv.file;
        }),
      )
      .toBeUndefined();
    await cv.getByRole('textbox', { name: 'Document URL', exact: true }).fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(() =>
        extension.worker.evaluate(async () => {
          const { profile } = (await chrome.storage.local.get('profile')) as { profile: Profile };
          return profile.documents.cv.url;
        }),
      )
      .toBeUndefined();
    await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Personal', exact: true }).click();
    const firstName = page.getByRole('textbox', { name: /^First Name/ });
    await firstName.fill('Recovered edit');
    await extension.worker.evaluate(async () => {
      const { profile } = (await chrome.storage.local.get('profile')) as { profile: Profile };
      await chrome.storage.local.set({
        profile: {
          ...profile,
          id: 'replacement',
          personal: { ...profile.personal, firstName: 'Jordan', email: 'jordan@example.test' },
        },
      });
    });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const review = page.getByRole('dialog');
    await expect(review.getByRole('heading', { name: 'Review Unsaved Changes' })).toBeVisible();
    await expect(
      review.getByRole('button', { name: 'Use Saved Profile', exact: true }),
    ).toBeEnabled();
    await review.getByRole('button', { name: 'Keep Editing', exact: true }).click();
    await expect(firstName).toHaveValue('Recovered edit');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await review.getByRole('button', { name: 'Select All', exact: true }).click();
    await review.getByRole('button', { name: 'Save Selected (1)', exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect
      .poll(() =>
        extension.worker.evaluate(async () => {
          const { profile } = (await chrome.storage.local.get('profile')) as { profile: Profile };
          return {
            id: profile.id,
            name: profile.personal.firstName,
            email: profile.personal.email,
          };
        }),
      )
      .toEqual({ id: 'replacement', name: 'Recovered edit', email: 'jordan@example.test' });
  });
}
