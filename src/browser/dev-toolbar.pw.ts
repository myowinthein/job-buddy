import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { DEV_PROFILE } from '../utils/devProfile';
import { DEFAULT_GEMINI_MODEL } from '../resume-ai/types';

const buildRoot = resolve('.output/dev-toolbar-test');
let server: ChildProcess;
test.beforeAll(async () => {
  // Keep WXT's development-server lifecycle outside Playwright's worker.
  server = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
    import { createServer } from 'wxt';
    const server = await createServer({
      outDir: ${JSON.stringify(buildRoot)}, webExt: { disabled: true },
      dev: { server: { port: 4177, strictPort: true } },
    });
    await server.start();
    console.log('JB_DEV_TOOLBAR_READY');
    process.on('message', async (message) => {
      if (message === 'stop') { await server.stop(); process.exit(0); }
    });
  `,
    ],
    { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] },
  );
  await new Promise<void>((resolveReady, reject) => {
    let output = '';
    const timeout = setTimeout(
      () => reject(new Error('Development server startup timed out')),
      20_000,
    );
    server.stdout?.on('data', (chunk) => {
      output = (output + String(chunk)).slice(-4000);
      if (output.includes('JB_DEV_TOOLBAR_READY')) {
        clearTimeout(timeout);
        resolveReady();
      }
    });
    server.stderr?.on('data', (chunk) => {
      output = (output + String(chunk)).slice(-4000);
    });
    server.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Development server exited (${code}): ${output}`));
    });
  });
});
test.afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  await new Promise<void>((done) => {
    const timeout = setTimeout(() => server.kill('SIGTERM'), 5000);
    server.once('exit', () => {
      clearTimeout(timeout);
      done();
    });
    if (server.connected) server.send('stop');
    else server.kill('SIGTERM');
  });
});

test('the dev bar previews profiles and missing keys without changing saved extension data', async ({ playwright }, info) => {
  const extensionPath = resolve(buildRoot, 'chrome-mv3-dev');
  const context = await playwright.chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    await context.route(/https?:\/\/(?!127\.0\.0\.1:4177)/, (route) => route.abort());
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(
      async ({ profile, model }) => {
        await chrome.storage.local.set({
          profile: { ...profile, id: 'original-dev-profile' },
          devProfileDisabled: true,
          geminiDevDisabled: true,
          geminiApiKey: 'original-synthetic-key',
          geminiModel: model,
          geminiSettingsMeta: { revision: 'original', preference: 'auto', verifiedAt: Date.now() },
        });
      },
      { profile: DEV_PROFILE, model: DEFAULT_GEMINI_MODEL },
    );
    const page = await context.newPage();
    await page.goto(new URL('options.html', worker.url()).href);
    const bar = page.getByRole('complementary', { name: 'Development controls' });
    await expect(bar).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dev Tools', exact: true })).toBeVisible();
    await expect(page.getByLabel('First Name', { exact: false })).toBeVisible();
    const original = await worker.evaluate(() =>
      chrome.storage.local.get(['profile', 'geminiApiKey', 'geminiModel']),
    );
    await page.getByRole('button', { name: 'Education', exact: true }).click();
    await bar.getByRole('button', { name: 'Empty', exact: true }).click();
    await expect(page).toHaveURL(/devPreview=empty/);
    await expect(page.getByRole('heading', { name: 'Education', exact: true })).toBeVisible();
    const progress = page.getByRole('progressbar', { name: 'Saved required profile details' });
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
    await bar.getByRole('button', { name: 'Required only', exact: true }).click();
    await expect(page).toHaveURL(/devPreview=required/);
    await expect(progress).toHaveAttribute('aria-valuenow', '100');
    await bar.getByRole('button', { name: 'Complete', exact: true }).click();
    await expect(page).toHaveURL(/devPreview=complete/);
    await page.getByRole('button', { name: 'Personal', exact: true }).click();
    const name = page.getByLabel('First Name', { exact: false });
    await name.fill('Draft in preview');
    const toggle = bar.getByRole('switch', { name: 'Missing API key' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(name).toHaveValue('Draft in preview');
    const cancelled = page.waitForEvent('dialog');
    const presetClick = bar.getByRole('button', { name: 'Empty', exact: true }).click();
    const dialog = await cancelled;
    await dialog.dismiss();
    await presetClick;
    await expect(page).toHaveURL(/devPreview=complete/);
    await expect(name).toHaveValue('Draft in preview');
    await page.getByRole('button', { name: 'Save Personal', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Import Resume/ }).click();
    await expect(page.getByText('Add a Gemini API key to import your resume.')).toBeVisible();
    await toggle.click();
    await expect(page.getByText(/Drop your resume here/)).toBeVisible();
    await toggle.click();
    await expect(page.getByText('Add a Gemini API key to import your resume.')).toBeVisible();
    await page.getByLabel('Close', { exact: true }).click();
    await page.getByRole('button', { name: 'Personal', exact: true }).click();
    await expect(name).toHaveValue('Draft in preview');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: info.outputPath('dev-bar-dark.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await bar.screenshot({ path: info.outputPath('dev-bar-narrow.png'), animations: 'disabled' });
    const box = await bar.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await bar.getByRole('button', { name: 'Exit preview', exact: true }).click();
    await expect(page).not.toHaveURL(/devPreview/);
    await expect(name).toHaveValue(DEV_PROFILE.personal.firstName);
    expect(
      await worker.evaluate(() =>
        chrome.storage.local.get(['profile', 'geminiApiKey', 'geminiModel']),
      ),
    ).toEqual(original);
    await page.getByRole('button', { name: 'Dev Tools', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dev Tools', exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
