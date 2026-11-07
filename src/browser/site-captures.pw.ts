import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';
import { serveDemo, ready, sample, publicURL } from './demoSupport';
import type { Profile } from '../types/profile';
import { readFile } from 'node:fs/promises';

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

// Keep the real options-page gutters in component crops. These pixels come
// from the running app, rather than padding painted around the image later.
async function captureInPage(page: Page, info: TestInfo, name: string, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const content = await target.boundingBox();
  const main = page.locator('main').first();
  const bounds = await main.boundingBox();
  const gutter = await main.evaluate((element) =>
    parseFloat(getComputedStyle(element).paddingLeft),
  );
  if (!content || !bounds || !Number.isFinite(gutter) || gutter <= 0)
    throw new Error(`Missing native page gutters: ${name}`);
  const x = Math.max(bounds.x, Math.floor(content.x - gutter));
  const right = Math.min(bounds.x + bounds.width, Math.ceil(content.x + content.width + gutter));
  const spacing = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      paddingTop: parseFloat(style.paddingTop),
      borderTop: parseFloat(style.borderTopWidth),
      borderBottom: parseFloat(style.borderBottomWidth),
      previousBottom: element.previousElementSibling?.getBoundingClientRect().bottom,
    };
  });
  // Settings sections have a real gap above them; field rows already contain
  // their own vertical inset. Keep adjacent section separators out of the crop.
  const above =
    spacing.paddingTop === 0
      ? Math.min(24, Math.max(0, content.y - (spacing.previousBottom ?? bounds.y)))
      : 0;
  const y = Math.max(bounds.y, content.y - above + spacing.borderTop);
  const bottom = content.y + content.height - spacing.borderBottom;
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    clip: { x, y, width: right - x, height: bottom - y },
    animations: 'disabled',
  });
}

async function captureProfile(page: Page, info: TestInfo, name: string, saveLabel: string) {
  const save = page.getByRole('button', { name: saveLabel, exact: true });
  await expect(save).toBeVisible();
  const button = await save.boundingBox();
  const lastCategory = await page
    .getByRole('navigation', { name: 'Profile sections' })
    .getByRole('button', { name: 'Salary', exact: true })
    .boundingBox();
  const tools = await page.locator('aside').getByText('Tools', { exact: true }).boundingBox();
  if (!button || !lastCategory || !tools) throw new Error(`Missing profile crop targets: ${name}`);
  const bottom = Math.ceil(
    Math.max(button.y + button.height, lastCategory.y + lastCategory.height) + 24,
  );
  expect(bottom, 'The Save button and profile categories must fit above Tools').toBeLessThan(
    tools.y,
  );
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    clip: {
      x: 0,
      y: 0,
      width: page.viewportSize()!.width,
      height: bottom,
    },
    animations: 'disabled',
  });
}

async function captureRegion(
  page: Page,
  info: TestInfo,
  name: string,
  targets: Locator[],
  padding = 0,
) {
  const boxes = (await Promise.all(targets.map((target) => target.boundingBox()))).filter(
    (box) => box !== null,
  );
  if (boxes.length !== targets.length) throw new Error(`Missing capture target: ${name}`);
  const x = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.x))) - padding);
  const y = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.y))) - padding);
  const right = Math.ceil(Math.max(...boxes.map((box) => box.x + box.width))) + padding;
  const bottom = Math.ceil(Math.max(...boxes.map((box) => box.y + box.height))) + padding;
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    clip: { x, y, width: right - x, height: bottom - y },
    animations: 'disabled',
  });
}

async function captureQuickFill(page: Page, info: TestInfo, theme: string) {
  const host = page.locator('[data-job-buddy-ui]');
  const contact = page.locator('[aria-labelledby="contact-title"]');
  const fields = await contact.boundingBox();
  const heading = await page.locator('.form-heading').boundingBox();
  const widget = await host.boundingBox();
  const grip = await host.getByRole('button', { name: 'Move Job Buddy' }).boundingBox();
  if (!fields || !heading || !widget || !grip)
    throw new Error('Missing Quick Fill capture targets');
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(
    from.x + fields.x + fields.width - widget.width - 8 - widget.x,
    from.y + heading.y + 8 - widget.y,
    { steps: 8 },
  );
  await page.mouse.up();
  await captureRegion(
    page,
    info,
    `quick-fill-widget-${theme}`,
    [page.locator('.form-heading'), contact, host],
    20,
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`Quick Fill on a job form in ${theme} mode`, async ({ context, page, extension }, info) => {
    test.skip(process.env.JB_CAPTURE_QUICK_FILL !== '1', 'Opt-in Quick Fill capture.');
    await serveDemo(context);
    await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
    await extension.worker.evaluate(
      async ({ profile, theme }) => {
        await chrome.storage.local.set({
          profile,
          themePreference: theme,
          quickFillPreferences: { enabled: true, disabledSites: [], position: { x: 0.06, y: 0.9 } },
        });
      },
      { profile: sample.profile, theme },
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(publicURL);
    await ready(page, extension.send);
    const host = page.locator('[data-job-buddy-ui]');
    await host.getByRole('button', { name: 'Fill Form', exact: true }).click();
    await expect(host.getByRole('button', { name: 'View details' })).toBeVisible();
    await expect(page.locator('#first-name')).toHaveValue('Alex');
    await captureQuickFill(page, info, theme);
  });

  test(`AI setup without a key in ${theme} mode`, async ({ context, extension }, info) => {
    test.skip(process.env.JB_CAPTURE_SITE !== '1', 'Opt-in website capture.');
    await extension.worker.evaluate(async (theme) => {
      await chrome.storage.local.remove(['geminiApiKey', 'geminiModel']);
      await chrome.storage.local.set({ themePreference: theme });
    }, theme);
    const options = await context.newPage();
    await options.setViewportSize({ width: 800, height: 900 });
    await options.goto(new URL('options.html', extension.worker.url()).href);
    await options.getByRole('button', { name: 'Settings', exact: true }).click();
    const section = options
      .getByRole('heading', { name: 'AI Features', exact: true })
      .locator('..');
    await expect(section.locator('input#gemini-api-key')).toBeVisible();
    await expect(section.locator('input#gemini-api-key')).toHaveValue('');
    await captureInPage(options, info, `ai-empty-${theme}`, section);
  });

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
            'myowinthein.github.io': {
              firstname: {
                path: 'personal.firstName',
                count: 2,
                label: 'First name',
                question: 'First name',
              },
            },
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
                path: 'salary.current.amount',
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
    const readyPopup = await context.newPage();
    await readyPopup.setViewportSize({ width: 400, height: 850 });
    const capturedSource = await extension.worker.evaluate(
      (id) => chrome.tabs.get(id),
      extension.sourceTabId,
    );
    await readyPopup.addInitScript((tab) => {
      Object.defineProperty(chrome.tabs, 'query', { value: () => Promise.resolve([tab]) });
    }, capturedSource);
    await readyPopup.goto(new URL('popup.html', extension.worker.url()).href);
    await expect(readyPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeEnabled();
    await capture(readyPopup, info, `popup-ready-${theme}`, readyPopup.locator('#root'));
    await page.locator('#first-name').fill('Alex');
    await readyPopup.getByRole('button', { name: 'Fill Form', exact: true }).click();
    await expect(readyPopup.getByRole('radio').first()).toBeVisible();
    await capture(readyPopup, info, `popup-choice-${theme}`, readyPopup.locator('#root'));
    await readyPopup.getByRole('button', { name: 'Cancel', exact: true }).click();
    await readyPopup.close();
    await page.locator('#first-name').fill('');
    await page.bringToFront();
    const host = page.locator('[data-job-buddy-ui]');
    await host.getByRole('button', { name: 'Fill Form', exact: true }).click();
    await expect(host.getByRole('button', { name: 'View details' })).toBeVisible();
    await expect(page.locator('#first-name')).toHaveValue('Alex');
    await capture(page, info, `application-after-${theme}`);
    await captureQuickFill(page, info, theme);

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
    for (const [name, label, stage] of [
      ['stage-learned', 'First name', 'Learned mappings'],
      ['stage-rules', 'Current company', 'Rules'],
      ['stage-ai', 'Will you need visa sponsorship?', 'AI'],
    ]) {
      const summary = options
        .locator('[aria-label="Field results"] summary')
        .filter({ hasText: label });
      const row = summary.locator('..');
      if (!(await row.getAttribute('open'))) {
        // An open boolean attribute has an empty string value.
        if (!(await row.evaluate((el) => (el as HTMLDetailsElement).open))) await summary.click();
      }
      await row.getByRole('button', { name: new RegExp(`^${stage}:`) }).click();
      await captureInPage(options, info, `${name}-${theme}`, row);
    }
    await options.setViewportSize({ width: 1280, height: 1300 });
    await options.getByRole('button', { name: 'Personal', exact: true }).click();
    await expect(options.getByLabel('First Name', { exact: false }).first()).toBeVisible();
    await captureProfile(options, info, `profile-${theme}`, 'Save Personal');
    for (const [name, section] of [
      ['profile-work', 'Work History'],
      ['profile-documents', 'Documents'],
    ]) {
      await options.getByRole('button', { name: section, exact: true }).click();
      await expect(options.getByRole('heading', { name: section, exact: true })).toBeVisible();
      await captureProfile(options, info, `${name}-${theme}`, `Save ${section}`);
    }

    const partial = structuredClone(profile);
    delete (partial.personal as Partial<Profile['personal']>).phone;
    partial.languages = [];
    await extension.worker.evaluate((profile) => chrome.storage.local.set({ profile }), partial);
    await options.reload();
    await expect(options.getByRole('button', { name: /required remaining/ })).toBeVisible();
    await options.getByRole('button', { name: /required remaining/ }).click();
    await captureProfile(options, info, `completion-${theme}`, 'Save Documents');
    await options.keyboard.press('Escape');
    await extension.worker.evaluate((profile) => chrome.storage.local.set({ profile }), profile);
    await options.reload();

    await options.setViewportSize({ width: 1280, height: 900 });
    await options.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
    await expect(
      options.getByRole('heading', { name: 'Learned Mappings', exact: true }),
    ).toBeVisible();
    await options.getByRole('button', { name: /careers.morrow.example 4 mappings/ }).click();
    await capture(options, info, `mappings-${theme}`);
    await options
      .getByRole('button', {
        name: 'Edit Portfolio or website on careers.morrow.example',
        exact: true,
      })
      .click();
    await options.getByRole('button', { name: /^Profile field:/ }).click();
    await expect(options.getByRole('combobox', { name: 'Search profile fields' })).toBeVisible();
    await capture(options, info, `mapping-edit-${theme}`);
    await options.keyboard.press('Escape');
    await options.getByRole('button', { name: 'Cancel', exact: true }).click();
    await context.route('https://generativelanguage.googleapis.com/**', (route) => {
      const text = route.request().postDataJSON().contents[0].parts[0].text as string;
      const payload = JSON.parse(text.slice(text.indexOf('{"fields":'))) as {
        mappings: { id: string; currentPath: string }[];
      };
      const results = payload.mappings.map((item) => ({
        id: item.id,
        verdict:
          item.currentPath === 'salary.current.amount'
            ? 'change'
            : item.currentPath.includes('.9.')
              ? 'uncertain'
              : 'correct',
        path: item.currentPath === 'salary.current.amount' ? 'salary.expected.0.amount' : null,
        reason:
          item.currentPath === 'salary.current.amount'
            ? 'The question asks about expected pay.'
            : 'Review the saved question in context.',
      }));
      return route.fulfill({
        json: { candidates: [{ content: { parts: [{ text: JSON.stringify(results) }] } }] },
      });
    });
    await options.getByRole('button', { name: 'Review Mappings', exact: true }).click();
    const mappingReview = options.getByRole('dialog');
    await mappingReview.getByRole('button', { name: 'Review Mappings', exact: true }).click();
    await expect(mappingReview.getByText('Better match found', { exact: true })).toBeVisible();
    await capture(options, info, `mapping-review-${theme}`, mappingReview);
    await mappingReview.getByRole('button', { name: 'Close review' }).click();
    await options.setViewportSize({ width: 800, height: 900 });
    await options.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(options.getByRole('heading', { name: 'AI Features', exact: true })).toBeVisible();
    await options
      .getByRole('heading', { name: 'AI Features', exact: true })
      .scrollIntoViewIfNeeded();
    await options.getByRole('button', { name: /Model options/ }).click();
    await captureInPage(
      options,
      info,
      `ai-${theme}`,
      options.getByRole('heading', { name: 'AI Features', exact: true }).locator('..'),
    );
    await options
      .getByRole('heading', { name: 'Quick Fill', exact: true })
      .scrollIntoViewIfNeeded();
    await options.getByText('Hidden sites (2)', { exact: true }).click();
    await captureInPage(
      options,
      info,
      `quick-fill-${theme}`,
      options.getByRole('heading', { name: 'Quick Fill', exact: true }).locator('..'),
    );
    await options
      .getByRole('heading', { name: 'Export Profile', exact: true })
      .scrollIntoViewIfNeeded();
    await capture(options, info, `backup-${theme}`);
    await captureInPage(
      options,
      info,
      `export-profile-${theme}`,
      options.getByRole('heading', { name: 'Export Profile', exact: true }).locator('..'),
    );
    await captureInPage(
      options,
      info,
      `import-profile-${theme}`,
      options.getByRole('heading', { name: 'Import Profile', exact: true }).locator('..'),
    );
    const [download] = await Promise.all([
      options.waitForEvent('download'),
      options.getByRole('button', { name: 'Download File', exact: true }).click(),
    ]);
    const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
    exported.profile.address.city = 'Portland';
    await options.locator('input[accept=".json"]').setInputFiles({
      name: 'job-buddy-sample-profile.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await expect(
      options.getByRole('button', { name: 'Review Changes', exact: true }),
    ).toBeVisible();
    await capture(options, info, `json-decision-${theme}`, options.getByRole('dialog'));
    await options.getByRole('button', { name: 'Keep Current', exact: true }).click();

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
    await capture(options, info, `resume-decision-${theme}`, options.getByRole('dialog'));
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
    await preview.setViewportSize({ width: 1100, height: 720 });
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
    await capture(
      preview,
      info,
      `dev-bar-${theme}`,
      preview.locator('.preview-app'),
    );
    await preview.setViewportSize({ width: 800, height: 900 });
    await preview
      .getByRole('heading', { name: 'Cloud Backup', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(preview.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible();
    await captureInPage(
      preview,
      info,
      `drive-${theme}`,
      preview.getByRole('heading', { name: 'Cloud Backup', exact: true }).locator('..'),
    );
    await preview.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(
      preview.getByRole('heading', { name: 'Disconnect Google Drive', exact: true }),
    ).toBeVisible();
    await capture(preview, info, `drive-disconnect-${theme}`, preview.getByRole('dialog'));
    await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
    await preview.getByRole('button', { name: 'Reset Now', exact: true }).click();
    const resetDialog = preview.getByRole('dialog');
    const deleteBackup = resetDialog.getByRole('checkbox', {
      name: 'Also delete the Drive backup',
    });
    await expect(deleteBackup).not.toBeChecked();
    await capture(preview, info, `reset-keep-drive-${theme}`, resetDialog);
    await deleteBackup.check();
    await expect(
      resetDialog.getByText('Your Drive backup will also be permanently deleted.'),
    ).toBeVisible();
    await capture(preview, info, `reset-delete-drive-${theme}`, resetDialog);
    await resetDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
}
