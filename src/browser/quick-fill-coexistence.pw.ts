import { build } from 'vite';
import { resolve } from 'node:path';
import type { Locator, Page, Worker } from '@playwright/test';
import type { QuickFillWidget } from '../quick-fill/widget';
import type { QuickFillPreferences } from '../quick-fill/preferences';
import { test, expect, stubEmptyGemini } from './fixtures';

const liveSelector = '[data-job-buddy-ui]:not([data-dev])';
const devSelector = '[data-job-buddy-ui][data-dev]';
let widgetScript: string;

declare global {
  interface Window {
    JobBuddyQuickFillTest: { QuickFillWidget: typeof QuickFillWidget };
    __coexistingFill: { widget: QuickFillWidget; positions: { x: number; y: number }[] };
  }
}

test.beforeAll(async () => {
  // Exercise the dev widget beside the installed production extension using
  // source code compiled without environment files or integration credentials.
  const result = await build({
    configFile: false,
    envDir: false,
    envPrefix: [],
    publicDir: false,
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'true' },
    resolve: { alias: { '@': resolve('.') } },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('src/quick-fill/widget.ts'),
        name: 'JobBuddyQuickFillTest',
        formats: ['iife'],
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!output || !('output' in output)) throw new Error('Missing dev widget bundle');
  const chunk = output.output.find((item) => item.type === 'chunk');
  if (!chunk) throw new Error('Missing dev widget script');
  widgetScript = chunk.code;
});

async function addDevWidget(page: Page) {
  await page.addScriptTag({ content: widgetScript });
  await page.evaluate(() => {
    const positions: { x: number; y: number }[] = [];
    const widget = new window.JobBuddyQuickFillTest.QuickFillWidget({
      fill() {},
      undo() {},
      details() {},
      hide() {},
      disableSite() {},
      settings() {},
      position: (position) => positions.push(position),
    });
    window.__coexistingFill = { widget, positions };
    widget.preferences({ enabled: true, fillMode: 'overwrite', disabledSites: [] }, false);
  });
}

async function expectSeparated(page: Page) {
  await expect
    .poll(async () => {
      const bounds = async (selector: string) =>
        page.locator(selector).evaluate((host) => {
          const control = host.getBoundingClientRect();
          const menu = host.shadowRoot
            ?.querySelector<HTMLElement>('.menu:not([hidden])')
            ?.getBoundingClientRect();
          const x = Math.min(control.left, menu?.left ?? control.left);
          const y = Math.min(control.top, menu?.top ?? control.top);
          return {
            x,
            y,
            width: Math.max(control.right, menu?.right ?? control.right) - x,
            height: Math.max(control.bottom, menu?.bottom ?? control.bottom) - y,
          };
        });
      const live = await bounds(liveSelector);
      const dev = await bounds(devSelector);
      return (
        !!live &&
        !!dev &&
        (dev.y + dev.height <= live.y - 11.5 ||
          live.y + live.height <= dev.y - 11.5 ||
          dev.x + dev.width <= live.x - 11.5 ||
          live.x + live.width <= dev.x - 11.5)
      );
    })
    .toBe(true);
}

async function storedLivePosition(worker: Worker) {
  return worker.evaluate(async () => {
    const values = await chrome.storage.local.get('quickFillPreferences');
    return (values.quickFillPreferences as QuickFillPreferences | undefined)?.position;
  });
}

/** Starts a trusted pointer drag and leaves it held for overlap assertions. */
async function dragTo(page: Page, control: Locator, destination: { x: number; y: number }) {
  const box = (await control.boundingBox())!;
  const grip = (await control.getByRole('button', { name: 'Move Job Buddy' }).boundingBox())!;
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + destination.x - box.x, y + destination.y - box.y, { steps: 6 });
}

for (const devFirst of [false, true]) {
  test(`separates controls on arrival with dev first=${devFirst}`, async ({ page, extension }) => {
    const live = page.locator(liveSelector);
    await expect(live).toBeVisible();
    if (devFirst) {
      await extension.worker.evaluate(() =>
        chrome.storage.local.set({
          quickFillPreferences: { enabled: false, disabledSites: [] },
        }),
      );
      await expect(live).toHaveCount(0);
    }
    await addDevWidget(page);
    if (devFirst) {
      await extension.worker.evaluate(() =>
        chrome.storage.local.set({
          quickFillPreferences: { enabled: true, disabledSites: [] },
        }),
      );
    }
    await expectSeparated(page);
    const liveBox = (await live.boundingBox())!;
    const devBox = (await page.locator(devSelector).boundingBox())!;
    expect(Math.abs(liveBox.x - devBox.x)).toBeLessThan(1);
    expect(Math.abs(liveBox.y - devBox.y - devBox.height - 12)).toBeLessThan(1);
    expect(await page.evaluate(() => window.__coexistingFill.positions)).toEqual([]);
    expect(await storedLivePosition(extension.worker)).toBeUndefined();

    // A saved position in free space takes precedence over an earlier automatic offset.
    await page.evaluate(() =>
      window.__coexistingFill.widget.preferences(
        {
          enabled: true,
          fillMode: 'overwrite',
          disabledSites: [],
          position: { x: 0.2, y: 0.2 },
        },
        false,
      ),
    );
    const saved = (await page.locator(devSelector).boundingBox())!;
    expect(
      Math.abs(saved.x - (12 + (page.viewportSize()!.width - saved.width - 24) * 0.2)),
    ).toBeLessThan(1);
    expect(await page.evaluate(() => window.__coexistingFill.positions)).toEqual([]);
  });
}

test('allows either control to overlap during dragging and moves dev after release', async ({
  page,
  extension,
}) => {
  await expect(page.locator(liveSelector)).toBeVisible();
  await addDevWidget(page);
  await expectSeparated(page);
  const live = page.locator(liveSelector);
  const dev = page.locator(devSelector);
  const liveBefore = (await live.boundingBox())!;
  await dragTo(page, dev, liveBefore);
  expect(Math.abs((await dev.boundingBox())!.y - liveBefore.y)).toBeLessThan(1);
  await page.mouse.up();
  await expectSeparated(page);
  expect(await live.boundingBox()).toEqual(liveBefore);
  expect(await page.evaluate(() => window.__coexistingFill.positions)).toHaveLength(1);

  const devBefore = (await dev.boundingBox())!;
  await dragTo(page, live, devBefore);
  expect(Math.abs((await live.boundingBox())!.y - devBefore.y)).toBeLessThan(1);
  expect(await dev.boundingBox()).toEqual(devBefore);
  await page.mouse.up();
  await expectSeparated(page);
  expect(await page.evaluate(() => window.__coexistingFill.positions)).toHaveLength(1);
  await expect
    .poll(() => storedLivePosition(extension.worker))
    .toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
});

test('keeps a downward-opening dev menu clear of the live control', async ({ page, extension }) => {
  await expect(page.locator(liveSelector)).toBeVisible();
  await addDevWidget(page);
  await page.evaluate(() =>
    window.__coexistingFill.widget.preferences(
      { enabled: true, fillMode: 'overwrite', disabledSites: [], position: { x: 1, y: 0 } },
      false,
    ),
  );
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({
      quickFillPreferences: {
        enabled: true,
        fillMode: 'overwrite',
        disabledSites: [],
        position: { x: 1, y: 0.15 },
      },
    }),
  );
  await expect
    .poll(async () => (await page.locator(liveSelector).boundingBox())!.y)
    .toBeLessThan(200);
  await expectSeparated(page);
  const dev = page.locator(devSelector);
  await dev.getByRole('button', { name: 'Quick fill options', exact: true }).click();
  await expect(dev.getByRole('button', { name: 'Hide until refresh', exact: true })).toBeVisible();
  await expectSeparated(page);
  const settled = await dev.boundingBox();
  for (let count = 0; count < 3; count++) {
    await page.evaluate(() => window.__coexistingFill.widget.render(null));
    await expectSeparated(page);
    expect(await dev.boundingBox()).toEqual(settled);
  }
  expect(await page.evaluate(() => window.__coexistingFill.positions)).toEqual([]);
});

test('avoids expanding results and stays inside a resized window without saving automatic positions', async ({
  page,
  context,
  extension,
}) => {
  await expect(page.locator(liveSelector)).toBeVisible();
  await addDevWidget(page);
  await expectSeparated(page);
  const live = page.locator(liveSelector);
  await stubEmptyGemini(context);
  await test.step('Expand the live result', async () => {
    await live.getByRole('button', { name: 'Fill Form', exact: true }).click();
    await expect(live.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await expectSeparated(page);
  });
  await test.step('Expand dev feedback', async () => {
    await page.evaluate(() =>
      window.__coexistingFill.widget.error(
        'Check the remaining answers in this form before continuing.',
      ),
    );
    await expectSeparated(page);
  });
  await test.step('Resize the viewport', async () => {
    await page.setViewportSize({ width: 390, height: 680 });
    await expectSeparated(page);
  });
  for (const selector of [liveSelector, devSelector]) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(11.5);
    expect(box.y).toBeGreaterThanOrEqual(11.5);
    expect(box.x + box.width).toBeLessThanOrEqual(378.5);
    expect(box.y + box.height).toBeLessThanOrEqual(668.5);
  }
  expect(await page.evaluate(() => window.__coexistingFill.positions)).toEqual([]);
  expect(await storedLivePosition(extension.worker)).toBeUndefined();
  await test.step('Use the live menu', async () => {
    // Existing installed releases can open their shadow menu without moving the host.
    await page.evaluate(() => {
      const live = document.querySelector('[data-job-buddy-ui]:not([data-dev])')!;
      live.shadowRoot!.querySelector<HTMLElement>('.menu')!.hidden = false;
    });
    await expectSeparated(page);
    await live.getByRole('button', { name: 'Quick fill options', exact: true }).click();
    await expect(
      live.getByRole('button', { name: 'Hide until refresh', exact: true }),
    ).toBeHidden();
    await live.getByRole('button', { name: 'Quick fill options', exact: true }).click();
    await expectSeparated(page);
    await live.getByRole('button', { name: 'Hide until refresh', exact: true }).click();
    await expect(live).toHaveCount(0);
  });
  await page.evaluate(() => window.__coexistingFill.widget.destroy());
  await expect(page.locator(devSelector)).toHaveCount(0);
});
