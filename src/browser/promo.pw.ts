import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  test,
  expect,
  extensionUrl,
  openPinnedPopup,
  geminiResponse,
  mappingReviewRequest,
} from './fixtures';
import { sample, serveDemo, publicURL, ready } from './demoSupport';
import { PresentationInput, recordScene } from './promoSupport';
import type { Page } from '@playwright/test';

const chapterIds = [
  'intro',
  'setup',
  'resume',
  'autofill',
  'details',
  'mappings',
  'backups',
  'closing',
];
test.skip(!process.env.JB_PROMO_REQUEST, 'Opt-in promotional browser recording.');
test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

for (const chapterId of chapterIds) {
  test(`record promo ${chapterId}`, async ({ context, page, extension }, info) => {
    test.setTimeout(600_000);
    const path = resolve(process.env.JB_PROMO_REQUEST!);
    if (!path.startsWith(resolve('.output/promo/requests') + '/'))
      throw new Error('Unexpected promo request path.');
    const request = JSON.parse(await readFile(path, 'utf8')) as {
      id: string;
      scenes: { id: string; text: string; audioDuration: number; external?: string }[];
    };
    if (request.id !== chapterId)
      throw new Error('Promo chapter request does not match the selected browser test.');
    await serveDemo(context);
    const profile = structuredClone(sample.profile);
    const incoming = structuredClone(profile);
    incoming.address.city = 'Portland';
    incoming.professional.summary =
      'Frontend engineer building accessible interfaces and reusable design systems.';
    await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
      if (!route.request().url().includes(':generateContent'))
        return route.fulfill({
          json: {
            models: [
              { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
            ],
          },
        });
      const body = route.request().postDataJSON();
      if (body.generationConfig?.maxOutputTokens === 1)
        return route.fulfill({ json: geminiResponse('OK') });
      const prompt = body.contents?.[0]?.parts?.[0]?.text ?? '';
      if (prompt.includes('mappings')) {
        const payload = mappingReviewRequest(route) as {
          mappings?: { id: string; currentPath: string }[];
        };
        if (Array.isArray(payload.mappings)) {
          await new Promise((done) => setTimeout(done, 1800));
          return route.fulfill({
            json: geminiResponse(
              JSON.stringify(
                payload.mappings.map((item) => ({
                  id: item.id,
                  verdict: item.currentPath === 'salary.current.amount' ? 'change' : 'correct',
                  path:
                    item.currentPath === 'salary.current.amount'
                      ? 'salary.expected.0.amount'
                      : null,
                  reason: 'The question asks about expected pay.',
                })),
              ),
            ),
          });
        }
      }
      if (body.contents?.[0]?.parts?.some((part: { inlineData?: unknown }) => part.inlineData)) {
        await new Promise((done) => setTimeout(done, 1800));
        return route.fulfill({
          json: geminiResponse(JSON.stringify({ ...incoming, documentType: 'resume' })),
        });
      }
      return route.fallback();
    });
    await extension.worker.evaluate(
      async ({ profile, chapterId }) => {
        await chrome.storage.local.clear();
        await chrome.storage.local.set({
          profile,
          themePreference: 'dark',
          geminiApiKey: 'synthetic-key',
          geminiModel: 'gemini-3.8-flash',
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
              portfolio: {
                path: 'links.linkedin',
                count: 1,
                label: 'Portfolio or website',
                question: 'Portfolio or website',
              },
              expectedpay: {
                path: 'salary.current.amount',
                count: 1,
                label: 'Expected annual salary',
                question: 'Expected annual salary',
              },
            },
          },
          quickFillPreferences: {
            enabled: true,
            fillMode: chapterId === 'mappings' ? 'merge' : 'overwrite',
            disabledSites: ['careers.example.test'],
            position: { x: 0.75, y: 0.85 },
          },
        });
      },
      { profile, chapterId },
    );
    await context.addInitScript(() => localStorage.setItem('job-buddy-theme', 'dark'));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(publicURL);
    await ready(page, extension.send);
    const formInput = new PresentationInput(page);
    let options: Page | undefined;
    let popup: Page | undefined;
    let preview: Page | undefined;
    let exported: Buffer | undefined;
    const inputs = new Map<Page, PresentationInput>([[page, formInput]]);
    const human = (view: Page) => {
      if (!inputs.has(view)) inputs.set(view, new PresentationInput(view));
      return inputs.get(view)!;
    };
    const openOptions = async () => {
      if (!options) {
        options = await context.newPage();
        await options.setViewportSize({ width: 1280, height: 720 });
        await options.goto(extensionUrl(extension, 'options.html'));
        await expect(options.getByRole('heading', { name: 'Personal', exact: true })).toBeVisible();
      }
      return options;
    };
    const navigate = async (view: Page, name: string) => {
      await human(view).click(view.getByRole('button', { name, exact: true }));
      await expect(view.getByRole('heading', { name, exact: true })).toBeVisible();
    };
    const filled = async () => {
      await page.bringToFront();
      await page
        .locator(':focus')
        .evaluateAll((elements) => elements.forEach((element) => (element as HTMLElement).blur()));
      await page
        .locator('[data-job-buddy-ui]')
        .getByRole('button', { name: 'Fill Form', exact: true })
        .click();
      await expect(page.locator('#first-name')).toHaveValue('Alex');
      await expect(
        page
          .locator('[data-job-buddy-ui]')
          .getByRole('button', { name: 'View details', exact: true }),
      ).toBeVisible();
    };
    const report = async () => {
      await page
        .locator('[data-job-buddy-ui]')
        .getByRole('button', { name: 'View details', exact: true })
        .click();
      await expect
        .poll(() => context.pages().some((view) => view.url().includes('options.html')))
        .toBe(true);
      options = context.pages().find((view) => view.url().includes('options.html'))!;
      await options.setViewportSize({ width: 1280, height: 720 });
      await expect(
        options.getByRole('heading', { name: 'Fill Details', exact: true }),
      ).toBeVisible();
      return options;
    };
    if (chapterId === 'details') {
      await filled();
      await report();
    }
    if (chapterId === 'mappings') {
      await page.locator('#github').fill('https://github.com/old-example');
      await filled();
    }
    if (chapterId === 'setup' || chapterId === 'resume') {
      await extension.worker.evaluate(
        async ({ profile, chapterId }) => {
          await chrome.storage.local.set({
            profile: {
              id: profile.id,
              personal: { firstName: profile.personal.firstName, email: profile.personal.email },
            },
          });
          if (chapterId === 'setup')
            await chrome.storage.local.remove(['geminiApiKey', 'geminiModel']);
        },
        { profile, chapterId },
      );
    }
    const recordings = [];
    for (const scene of request.scenes.filter((item) => !item.external)) {
      let view = page;
      let action: () => Promise<void>;
      const host = page.locator('[data-job-buddy-ui]');
      if (scene.id === 'intro-form')
        action = async () => {
          await formInput.point(page.locator('#first-name'));
        };
      else if (scene.id === 'intro-typing')
        action = async () => {
          await formInput.type(page.locator('#first-name'), profile.personal.firstName);
          await formInput.type(page.locator('#email'), profile.personal.email);
        };
      else if (
        scene.id === 'intro-profile' ||
        scene.id === 'closing-profile' ||
        scene.id === 'closing-finish'
      ) {
        view = await openOptions();
        action = async () => {
          if (scene.id === 'closing-finish') {
            await navigate(view, 'Settings');
            await human(view).point(view.getByRole('link', { name: /Report an issue/ }));
          } else await human(view).point(view.getByLabel('First Name', { exact: false }).first());
        };
      } else if (scene.id.startsWith('setup-')) {
        view = await openOptions();
        action = async () => {
          if (scene.id === 'setup-profile')
            await human(view).point(view.getByRole('button', { name: /required remaining/ }));
          else if (scene.id === 'setup-missing') {
            await human(view).click(view.getByRole('button', { name: /required remaining/ }));
            await view.keyboard.press('Escape');
          } else {
            await navigate(view, 'Settings');
            await human(view).type(view.locator('#gemini-api-key'), 'synthetic-key');
            await human(view).click(view.getByRole('button', { name: 'Save Key', exact: true }));
            await expect(view.getByText('Ready', { exact: true }).first()).toBeVisible();
            await human(view).click(view.getByRole('button', { name: /Model options/ }));
          }
        };
      } else if (scene.id.startsWith('resume-')) {
        view = await openOptions();
        action = async () => {
          const input = human(view);
          if (scene.id === 'resume-upload') {
            await input.click(view.getByRole('button', { name: 'Import Resume', exact: true }));
            await input.point(view.getByText(/Drop your resume here/));
            await view.locator('input[type="file"]').setInputFiles({
              name: 'Alex-Morgan-Resume.pdf',
              mimeType: 'application/pdf',
              buffer: Buffer.from(profile.documents.cv.file!.base64.split(',')[1], 'base64'),
            });
          } else if (scene.id === 'resume-analyze') {
            await input.click(view.getByRole('button', { name: 'Analyze Resume', exact: true }));
            await expect(
              view.getByRole('button', { name: 'Review Changes', exact: true }),
            ).toBeVisible();
          } else if (scene.id === 'resume-summary') {
            await input.point(view.getByRole('button', { name: 'Keep Current', exact: true }));
            await input.point(view.getByRole('button', { name: 'Import All', exact: true }));
          } else if (scene.id === 'resume-review') {
            await input.click(view.getByRole('button', { name: 'Review Changes', exact: true }));
            await expect(
              view.getByRole('heading', { name: 'Review Resume', exact: true }),
            ).toBeVisible();
          } else {
            await input.click(view.getByRole('button', { name: /^Import Selected/ }));
            await expect(
              view.getByRole('heading', { name: 'Personal', exact: true }),
            ).toBeVisible();
          }
        };
      } else if (scene.id === 'autofill-popup' || scene.id === 'autofill-choice') {
        if (!popup) {
          await page.locator('#first-name').fill('Existing answer');
          await page.locator('#first-name').blur();
          popup = await openPinnedPopup(context, extension.worker.url(), extension.sourceTabId, {
            width: 460,
            height: 640,
          });
        }
        view = popup;
        action = async () => {
          if (scene.id === 'autofill-popup') {
            await human(view).click(view.getByRole('button', { name: 'Fill Form', exact: true }));
            await expect(view.getByRole('radio').first()).toBeVisible();
          } else {
            await human(view).click(view.getByRole('radio').last());
            await human(view).click(view.getByRole('button', { name: 'Fill Form', exact: true }));
            await expect(page.locator('#first-name')).toHaveValue('Alex');
          }
        };
      } else if (scene.id === 'autofill-undo')
        action = async () => {
          await formInput.click(host.getByRole('button', { name: 'Undo', exact: true }));
          await expect(page.locator('#email')).toHaveValue('');
        };
      else if (scene.id === 'autofill-quick')
        action = async () => {
          await formInput.click(host.getByRole('button', { name: 'Fill Form', exact: true }));
          await expect(page.locator('#first-name')).toHaveValue('Alex');
          await formInput.click(host.getByRole('button', { name: 'Quick fill options' }));
        };
      else if (scene.id === 'autofill-settings') {
        view = await openOptions();
        action = async () => {
          await navigate(view, 'Settings');
          await human(view).point(view.locator('#quick-fill-mode'));
          await view.locator('#quick-fill-mode').selectOption('merge');
          await human(view).click(view.getByText(/Hidden sites \(/));
        };
      } else if (scene.id.startsWith('details-')) {
        view = options!;
        action = async () => {
          const field = view
            .locator('[aria-label="Field results"] summary')
            .filter({ hasText: 'First name' })
            .first();
          if (scene.id === 'details-open')
            await human(view).point(
              view.getByRole('heading', { name: 'Fill Details', exact: true }),
            );
          else if (scene.id === 'details-stages') {
            await human(view).click(field);
            await human(view).click(
              field.locator('..').getByRole('button', { name: /^Learned mappings:/ }),
            );
          } else if (scene.id === 'details-filter') {
            const filters = view.getByRole('button', { name: /^(Filled|Not filled)/ });
            await human(view).click(filters.first());
            await human(view).click(view.getByRole('button', { name: /^Detected/ }));
          } else {
            const company = view
              .locator('[aria-label="Field results"] summary')
              .filter({ hasText: 'Current company' });
            await human(view).click(company);
            await human(view).click(company.locator('..').getByRole('button', { name: /^Rules:/ }));
          }
        };
      } else if (scene.id === 'mappings-correct')
        action = async () => {
          await formInput.type(page.locator('#github'), profile.links.github!);
          await formInput.click(page.locator('#city'));
          await expect
            .poll(async () =>
              extension.worker.evaluate(async () =>
                JSON.stringify((await chrome.storage.local.get('learnedMappings')).learnedMappings),
              ),
            )
            .toContain('github');
        };
      else if (scene.id.startsWith('mappings-')) {
        view = await openOptions();
        action = async () => {
          const input = human(view);
          if (scene.id === 'mappings-list') {
            await navigate(view, 'Learned Mappings');
            await input.click(view.getByRole('button', { name: /^myowinthein.github.io/ }));
          } else if (scene.id === 'mappings-edit') {
            await input.click(view.getByRole('button', { name: /^careers.morrow.example/ }));
            await input.click(
              view.getByRole('button', {
                name: 'Edit Portfolio or website on careers.morrow.example',
                exact: true,
              }),
            );
            await input.click(view.getByRole('button', { name: /^Profile field:/ }));
            await input.type(
              view.getByRole('combobox', { name: 'Search profile fields' }),
              'Portfolio',
            );
            const option = view.getByRole('option', { name: /^Document URL/ }).first();
            await input.click(option);
            await input.click(view.getByRole('button', { name: 'Save', exact: true }));
          } else if (scene.id === 'mappings-analyze') {
            await input.click(view.getByRole('button', { name: 'Review Mappings', exact: true }));
            await input.click(view.getByRole('button', { name: 'Analyze Mappings', exact: true }));
            await expect(view.getByText('Better match found', { exact: true })).toBeVisible();
          } else await input.point(view.getByText('Better match found', { exact: true }));
        };
      } else if (scene.id.startsWith('backups-')) {
        if (['backups-drive', 'backups-disconnect', 'backups-reset'].includes(scene.id)) {
          if (!preview) {
            await context.unroute('http://127.0.0.1/**');
            await context.route('http://127.0.0.1:4173/**', (route) => route.continue());
            preview = await context.newPage();
            await preview.setViewportSize({ width: 1280, height: 720 });
            await preview.addInitScript((profile) => {
              sessionStorage.setItem('jb:ui:section', 'settings');
              sessionStorage.setItem(
                'jb:dev:quick-preview:promo',
                JSON.stringify({ profile, themePreference: 'dark' }),
              );
            }, profile);
            await preview.goto(
              'http://127.0.0.1:4173/?devPreview=saved&devPreviewSeed=promo&devDrive=1',
            );
            await expect(
              preview.getByRole('button', { name: 'Disconnect', exact: true }),
            ).toBeVisible();
          }
          view = preview;
        } else view = await openOptions();
        action = async () => {
          const input = human(view);
          if (scene.id === 'backups-export') {
            await navigate(view, 'Settings');
            const download = view.waitForEvent('download');
            await input.click(view.getByRole('button', { name: 'Download File', exact: true }));
            exported = await readFile((await (await download).path())!);
          } else if (scene.id === 'backups-import') {
            const backup = JSON.parse(exported!.toString());
            backup.profile.address.city = 'Portland';
            await view.locator('input[accept=".json"]').setInputFiles({
              name: 'Alex-Morgan-Profile.json',
              mimeType: 'application/json',
              buffer: Buffer.from(JSON.stringify(backup)),
            });
            await expect(
              view.getByRole('button', { name: 'Review Changes', exact: true }),
            ).toBeVisible();
          } else if (scene.id === 'backups-drive') {
            await input.point(view.getByRole('button', { name: 'Back Up Now', exact: true }));
            await input.click(view.getByRole('button', { name: 'Back Up Now', exact: true }));
          } else if (scene.id === 'backups-disconnect') {
            await input.click(view.getByRole('button', { name: 'Disconnect', exact: true }));
            await input.click(view.getByRole('checkbox', { name: 'Also delete the Drive backup' }));
          } else {
            await input.click(view.getByRole('button', { name: 'Cancel', exact: true }));
            await input.click(view.getByRole('button', { name: 'Reset Now', exact: true }));
            await input.click(view.getByRole('checkbox', { name: 'Also delete the Drive backup' }));
          }
        };
      } else
        throw new Error(
          `No browser steps exist for ${scene.id}. Review the chapter before recording.`,
        );
      recordings.push(await recordScene(view, info, scene, action));
    }
    await writeFile(info.outputPath('recording.json'), JSON.stringify(recordings));
  });
}
