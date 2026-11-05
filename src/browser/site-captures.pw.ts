import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';
import { serveDemo, ready, sample, publicURL } from './demoSupport';
import type { Profile } from '../types/profile';

// Keep CSS dimensions unchanged while recording enough pixels for Retina displays.
test.use({ deviceScaleFactor: 3 });

// Reproducible captures of production components. Only fictional values are used.
// No installed Chrome profile, real provider credential or OAuth account is read.
async function capture(page: Page, info: TestInfo, name: string, target?: Locator) {
  await page.mouse.move(0, 0);
  if (target) {
    await target.scrollIntoViewIfNeeded();
    await target.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
  } else await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
}

for (const theme of ['light', 'dark'] as const) {
  test(`website captures in ${theme} mode`, async ({ context, page, extension }, info) => {
    test.skip(
      process.env.JB_CAPTURE_SITE !== '1',
      'Opt-in captures need pnpm dev:preview at port 4173.',
    );
    test.setTimeout(90_000);
    await serveDemo(context);
    await context.addInitScript((theme) => {
      try {
        localStorage.setItem('theme', theme);
      } catch {
        /* Extension origins may restrict storage. */
      }
    }, theme);
    const profile = structuredClone(sample.profile);
    await extension.worker.evaluate(
      async ({ profile, theme }) => {
        await chrome.storage.local.set({
          profile,
          themePreference: theme,
          geminiApiKey: 'synthetic-key',
          geminiModel: 'gemini-3.5-flash-lite',
          learnedMappings: {
            'careers.morrow.example': {
              firstname: {
                path: 'personal.firstName',
                count: 2,
                label: 'First name',
                question: 'First name',
              },
              portfolio: {
                path: 'links.portfolio',
                count: 2,
                label: 'Portfolio or website',
                question: 'Portfolio or website',
              },
              expectedpay: {
                path: 'salary.expected.0.amount',
                count: 1,
                label: 'Expected annual salary',
                question: 'Expected annual salary',
              },
              previousschool: {
                path: 'education.9.institution',
                count: 2,
                label: 'Previous institution',
                question: 'Previous institution',
                inactive: true,
              },
            },
          },
          quickFillPreferences: {
            enabled: true,
            disabledSites: ['apply.sample.example', 'careers.example.test'],
            position: { x: 0.06, y: 0.9 },
          },
        });
      },
      { profile, theme },
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(publicURL);
    await ready(page, extension.send);
    await capture(page, info, `application-before-${theme}`);
    const host = page.locator('[data-job-buddy-ui]');
    await host.getByRole('button', { name: 'Fill Form', exact: true }).click();
    await expect(host.getByRole('button', { name: 'View details' })).toBeVisible();
    await expect(page.locator('#first-name')).toHaveValue('Alex');
    await capture(page, info, `application-after-${theme}`);

    // A real retained report, selected by the same action the user presses.
    await host.getByRole('button', { name: 'View details' }).click();
    await expect
      .poll(() => context.pages().some((item) => /options.html/.test(item.url())))
      .toBe(true);
    const options = context.pages().find((item) => /options.html/.test(item.url()))!;
    await options.setViewportSize({ width: 1280, height: 900 });
    await expect(options.getByRole('heading', { name: 'Fill Details', exact: true })).toBeVisible();
    const firstField = options
      .locator('[aria-label="Field results"] summary')
      .filter({ hasText: 'First name' });
    await expect(firstField).toBeVisible();
    await firstField.click();
    await capture(options, info, `fill-details-${theme}`);
    await options.getByRole('button', { name: 'Personal', exact: true }).click();
    await expect(options.getByLabel('First Name', { exact: false }).first()).toBeVisible();
    await capture(options, info, `profile-${theme}`);

    const partial = structuredClone(profile);
    delete (partial.personal as Partial<Profile['personal']>).phone;
    partial.languages = [];
    await extension.worker.evaluate((profile) => chrome.storage.local.set({ profile }), partial);
    await options.reload();
    await expect(options.getByRole('button', { name: /required remaining/ })).toBeVisible();
    await options.getByRole('button', { name: /required remaining/ }).click();
    await capture(options, info, `completion-${theme}`);
    await options.keyboard.press('Escape');
    await extension.worker.evaluate((profile) => chrome.storage.local.set({ profile }), profile);
    await options.reload();

    await options.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
    await expect(
      options.getByRole('heading', { name: 'Learned Mappings', exact: true }),
    ).toBeVisible();
    await options.getByRole('button', { name: /careers.morrow.example 4 mappings/ }).click();
    await capture(options, info, `mappings-${theme}`);
    await options.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(options.getByRole('heading', { name: 'AI Features', exact: true })).toBeVisible();
    await options
      .getByRole('heading', { name: 'AI Features', exact: true })
      .scrollIntoViewIfNeeded();
    await options.getByRole('button', { name: /Model options/ }).click();
    await capture(
      options,
      info,
      `ai-${theme}`,
      options.getByRole('heading', { name: 'AI Features', exact: true }).locator('..'),
    );
    await options
      .getByRole('heading', { name: 'Quick Fill', exact: true })
      .scrollIntoViewIfNeeded();
    await options.getByText('Hidden sites (2)', { exact: true }).click();
    await capture(
      options,
      info,
      `quick-fill-${theme}`,
      options.getByRole('heading', { name: 'Quick Fill', exact: true }).locator('..'),
    );
    await options
      .getByRole('heading', { name: 'Export Profile', exact: true })
      .scrollIntoViewIfNeeded();
    await capture(options, info, `backup-${theme}`);

    await options.getByRole('button', { name: 'Reset Now', exact: true }).click();
    await expect(options.getByRole('dialog')).toBeVisible();
    await capture(options, info, `reset-${theme}`, options.getByRole('dialog'));
    await options.getByRole('button', { name: 'Cancel', exact: true }).click();

    await options.getByRole('button', { name: 'Import Resume', exact: true }).click();
    await expect(
      options.getByRole('heading', { name: 'Import Resume', exact: true }),
    ).toBeVisible();
    await capture(options, info, `resume-${theme}`, options.locator('.fixed.inset-0 > div'));
    const incoming = structuredClone(profile);
    incoming.professional.summary =
      'Frontend engineer focused on accessible interfaces and reliable design systems.';
    incoming.address.city = 'Portland';
    await context.route('https://generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        json: {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ ...incoming, documentType: 'resume' }) }],
              },
            },
          ],
        },
      }),
    );
    await options.locator('input[type="file"]').setInputFiles({
      name: 'Alex-Morgan-Sample-Resume.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(profile.documents.cv.file!.base64.split(',')[1], 'base64'),
    });
    await options.getByRole('button', { name: 'Analyze Resume', exact: true }).click();
    await expect(
      options.getByRole('button', { name: 'Review Changes', exact: true }),
    ).toBeVisible();
    await options.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await expect(
      options.getByRole('heading', { name: 'Review Resume', exact: true }),
    ).toBeVisible();
    await capture(options, info, `review-${theme}`, options.getByRole('dialog'));

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 400, height: 600 });
    const sourceTab = await extension.worker.evaluate(
      (id) => chrome.tabs.get(id),
      extension.sourceTabId,
    );
    // A toolbar popup normally queries the active form, not its own test tab.
    await popup.addInitScript((tab) => {
      Object.defineProperty(chrome.tabs, 'query', { value: () => Promise.resolve([tab]) });
    }, sourceTab);
    await popup.goto(new URL('popup.html', extension.worker.url()).href);
    await expect(popup.getByRole('button', { name: 'View details', exact: true })).toBeVisible();
    await capture(popup, info, `popup-${theme}`, popup.locator('#root'));

    // The dev toolbar and Drive-connected state use the explicitly isolated preview.
    await context.unroute('http://127.0.0.1/**');
    await context.route('http://127.0.0.1:4173/**', (route) => route.continue());
    const preview = await context.newPage();
    await preview.setViewportSize({ width: 1280, height: 900 });
    await preview.addInitScript((theme) => {
      sessionStorage.setItem('jb:ui:section', 'settings');
      sessionStorage.setItem(
        'jb:dev:quick-preview:site-capture',
        JSON.stringify({ themePreference: theme }),
      );
    }, theme);
    await preview.goto(
      'http://127.0.0.1:4173/?devPreview=complete&devPreviewSeed=site-capture&devDrive=1',
    );
    await expect(preview.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await capture(preview, info, `dev-bar-${theme}`);
    await preview
      .getByRole('heading', { name: 'Cloud Backup', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(preview.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible();
    await capture(
      preview,
      info,
      `drive-${theme}`,
      preview.getByRole('heading', { name: 'Cloud Backup', exact: true }).locator('..'),
    );
  });
}
