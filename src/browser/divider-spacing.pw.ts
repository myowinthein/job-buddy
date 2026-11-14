import { test, expect, extensionUrl } from './fixtures';
import { DEV_PROFILE } from '../utils/devProfile';
import { visibleDividerGaps } from './dividerGeometry';

const sections = [
  'Personal',
  'Address',
  'Work Authorization',
  'Work History',
  'Education',
  'Languages',
  'Links',
  'Documents',
  'Salary',
];

for (const width of [320, 768, 1280]) {
  test(`profile save dividers have equal gaps at ${width}px`, async ({ context, extension }) => {
    test.setTimeout(60_000);
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    for (const profile of [{ id: 'empty-spacing-profile' }, DEV_PROFILE]) {
      await extension.worker.evaluate(async (profile) => {
        await chrome.storage.local.set({ profile });
      }, profile);
      await page.goto(extensionUrl(extension, 'options.html'));
      for (const section of sections) {
        await page.getByRole('button', { name: section, exact: true }).click();
        for (const expanded of [false, true]) {
          if (expanded) {
            await page.locator('main details').evaluateAll((elements) => {
              for (const element of elements) (element as HTMLDetailsElement).open = true;
            });
            while (await page.locator('[data-entry-toggle][aria-expanded="false"]').count())
              await page.locator('[data-entry-toggle][aria-expanded="false"]').first().click();
          }
          const save = page.getByRole('button', {
            name: 'Save',
            exact: true,
          });
          await save.scrollIntoViewIfNeeded();
          const gaps = await save.locator('..').evaluate(visibleDividerGaps);
          expect(gaps, `${section}, ${expanded ? 'expanded' : 'collapsed'}`).toEqual({
            above: 24,
            below: 24,
          });
          if (section === 'Address') {
            const stackedGap = await save.evaluate((button) => {
              const fields = [...button.parentElement!.previousElementSibling!.children].map(
                (field) => field.getBoundingClientRect(),
              );
              return fields[1].top > fields[0].bottom ? fields[1].top - fields[0].bottom : null;
            });
            if (stackedGap !== null) expect(stackedGap).toBe(32);
          }
        }
      }
    }
  });
}

test('settings dividers have equal content gaps through Reset All Data', async ({
  context,
  extension,
}) => {
  const page = await context.newPage();
  await page.goto(extensionUrl(extension, 'options.html'));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const name of [
    'Appearance',
    'Quick Fill',
    'AI Features',
    'Export Profile',
    'Import Profile',
    'Cloud Backup',
  ]) {
    const section = page.getByRole('heading', { name, exact: true }).locator('..');
    await section.scrollIntoViewIfNeeded();
    expect(await section.evaluate(visibleDividerGaps), name).toEqual({ above: 32, below: 32 });
  }
});

test('missing-key dialogs keep their visible content within the standard divider gaps', async ({
  context,
  extension,
}) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.remove(['geminiApiKey', 'geminiModel', 'geminiSettingsMeta']);
    await chrome.storage.local.set({
      devProfileDisabled: true,
      geminiDevDisabled: true,
      learnedMappings: {
        'careers.example.test': {
          email: { path: 'personal.email', question: 'Email', label: 'Email', count: 2 },
        },
      },
    });
  });
  const page = await context.newPage();
  await page.goto(extensionUrl(extension, 'options.html'));
  for (const feature of ['Import Resume', 'Review Mappings']) {
    if (feature === 'Review Mappings')
      await page.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
    await page.getByRole('button', { name: feature, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Go to Settings →', exact: true })).toBeVisible();
    const dialog =
      feature === 'Import Resume'
        ? page.locator('.fixed.inset-0 > div').first()
        : page.getByRole('dialog');
    const header = dialog.locator(':scope > *').first();
    const footer = dialog.locator(':scope > *').last();
    expect(await header.evaluate(visibleDividerGaps), `${feature} header`).toEqual({
      above: 16,
      below: 16,
    });
    expect(await footer.evaluate(visibleDividerGaps), `${feature} footer`).toEqual({
      above: 16,
      below: 16,
    });
    await footer
      .getByRole('button', { name: feature === 'Import Resume' ? 'Close' : 'Cancel', exact: true })
      .click();
  }
});
