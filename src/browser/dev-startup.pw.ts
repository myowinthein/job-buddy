import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { createServer } from 'wxt';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const buildRoot = resolve('.output/chrome-mv3-dev-test');
const extensionPath = resolve(buildRoot, 'chrome-mv3-dev');

test.beforeAll(async () => {
  // Production-manifest tests cannot cover WXT's dynamic serve-mode scripts.
  const server = await createServer({
    outDir: buildRoot,
    webExt: { disabled: true },
    dev: { server: { port: 4175, strictPort: true } },
  });
  try {
    await server.start();
  } finally {
    await server.stop();
  }
});

test('dev quick fill starts without the hot-reload server or popup, including after browser restart', async ({
  browserName: _browserName,
}, info) => {
  const manifest = JSON.parse(await readFile(resolve(extensionPath, 'manifest.json'), 'utf8'));
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.commands).toBeUndefined();
  const profileDirectory = await mkdtemp(join(tmpdir(), 'jb-dev-startup-'));
  const html = await readFile(resolve('src/browser/fixtures/application.html'), 'utf8');
  let context: BrowserContext | undefined;
  const launch = async () => {
    context = await chromium.launchPersistentContext(profileDirectory, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await context.route('http://127.0.0.1/application*', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await context.route(/https?:\/\/(?!127\.0\.0\.1\/application)/, (route) => route.abort());
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await expect
      .poll(() => worker.evaluate(() => chrome.scripting.getRegisteredContentScripts()))
      .toEqual([
        expect.objectContaining({
          id: 'wxt:content-scripts/content.js',
          allFrames: true,
          matchOriginAsFallback: true,
          matches: ['*://*/*'],
          persistAcrossSessions: true,
        }),
      ]);
    return worker;
  };
  try {
    let worker = await launch();
    // No popup, scan, or executeScript calls are allowed to initialize the page.
    let page = await context!.newPage();
    await page.goto('http://127.0.0.1/application');
    await expect(page.locator('[data-job-buddy-ui]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Fill Form', exact: true })).toBeVisible();
    const frameReplies = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/application' });
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id! });
      return Promise.all(
        frames!.map(async ({ frameId }) => {
          try {
            await chrome.tabs.sendMessage(tab.id!, { action: 'GET_STATUS' }, { frameId });
            return true;
          } catch {
            return false;
          }
        }),
      );
    });
    expect(frameReplies.length).toBeGreaterThanOrEqual(2);
    expect(frameReplies.every(Boolean)).toBe(true);
    await page.screenshot({ path: info.outputPath('dev-automatic-quick-fill.png') });

    const grip = page.getByRole('button', { name: 'Move Job Buddy' });
    const handle = await grip.boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(300, 280, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() =>
        worker.evaluate(
          async () => (await chrome.storage.local.get('quickFillPreferences')).quickFillPreferences,
        ),
      )
      .toMatchObject({ position: { x: expect.any(Number), y: expect.any(Number) } });
    const savedPosition = await page.locator('[data-job-buddy-ui]').boundingBox();

    // Prove a new startup can recreate the registration without WXT's server.
    await worker.evaluate(() =>
      chrome.scripting.unregisterContentScripts({ ids: ['wxt:content-scripts/content.js'] }),
    );
    await context!.close();
    context = undefined;
    worker = await launch();
    page = await context!.newPage();
    await page.goto('http://127.0.0.1/application-after-restart');
    await expect(page.locator('[data-job-buddy-ui]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Fill Form', exact: true })).toBeVisible();
    const restoredPosition = await page.locator('[data-job-buddy-ui]').boundingBox();
    expect(Math.abs(restoredPosition!.x - savedPosition!.x)).toBeLessThan(1);
    expect(Math.abs(restoredPosition!.y - savedPosition!.y)).toBeLessThan(1);
  } finally {
    await context?.close();
    await rm(profileDirectory, { recursive: true, force: true });
  }
});
