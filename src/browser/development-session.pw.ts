import { test, expect, chromium, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Profile } from '../types/profile';

declare global {
  interface Window {
    __testStorage: typeof chrome.storage;
  }
}

test('development sessions share autofill and learning without changing saved data or Drive', async ({
  browserName: _browserName,
}, info) => {
  test.setTimeout(150_000);
  const http = createHttpServer();
  await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  const port = address.port;
  await new Promise<void>((done) => http.close(() => done()));
  const output = info.outputPath('extension');
  const server = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
    import {createServer} from 'wxt';
    const server = await createServer(${JSON.stringify({ root: process.cwd(), outDir: output, webExt: { disabled: true }, dev: { server: { host: '127.0.0.1', port, strictPort: true, origin: `http://127.0.0.1:${port}` } } })});
    await server.start();
    // Keep this fixture stable while other development servers watch the same repository.
    await server.watcher.close();
    console.log('JB_DEV_TEST_READY');
    setInterval(() => {}, 1000);
  `,
    ],
    { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await new Promise<void>((done, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Development test server did not start')),
      30_000,
    );
    server.once('error', reject);
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Development server exited: ${code}`));
    });
    server.stdout.on('data', (data: Buffer) => {
      if (data.toString().includes('JB_DEV_TEST_READY')) {
        clearTimeout(timeout);
        done();
      }
    });
  });
  const extensionPath = resolve(output, 'chrome-mv3-dev');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  context.setDefaultTimeout(10_000);
  try {
    server.stderr.resume();
    const externalWrites: string[] = [];
    await context.route(/https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
      if (!['GET', 'HEAD'].includes(route.request().method()))
        externalWrites.push(route.request().url());
      await route.abort();
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const url = (path: string) => new URL(path, worker.url()).href;
    const envelope = JSON.parse(
      await readFile(resolve('src/browser/fixtures/demo-profile.json'), 'utf8'),
    ) as { profile: Profile };
    envelope.profile.personal.firstName = 'Original';
    await worker.evaluate(async (profile) => {
      await chrome.storage.local.set({
        profile,
        learnedMappings: {},
        geminiApiKey: 'original-synthetic-key',
        geminiModel: 'gemini-3.8-flash',
        geminiDevDisabled: true,
        devProfileDisabled: true,
        themePreference: 'dark',
        quickFillPreferences: { enabled: true, fillMode: 'overwrite', disabledSites: [] },
      });
    }, envelope.profile);
    const options = await context.newPage();
    await options.addInitScript(() => {
      window.__testStorage = chrome.storage;
    });
    await options.goto(url('options.html'));
    await expect(options.locator('#field-firstName')).toHaveValue('Original');
    const native = (page: Page, area: 'local' | 'session') =>
      page.evaluate(async (area) => window.__testStorage[area].get(null), area);
    const original = await native(options, 'local');
    await options.getByRole('switch', { name: 'API key', exact: true }).click();
    await expect(options.getByRole('switch', { name: 'API key', exact: true })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await options.getByRole('switch', { name: 'API key', exact: true }).click();
    await expect(options.getByRole('switch', { name: 'API key', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await options.getByRole('button', { name: 'Complete', exact: true }).click();
    const frame = options.frameLocator('iframe[title="Job Buddy options"]');
    await expect(frame.locator('#field-firstName')).toHaveValue('Jane');
    await frame.locator('#field-firstName').fill('Temporary Applicant');
    await frame.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(frame.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await expect
      .poll(async () => JSON.stringify(await native(options, 'session')))
      .toContain('Temporary Applicant');
    const secondOptions = await context.newPage();
    await secondOptions.goto(url('options.html'));
    await expect(secondOptions.locator('#field-firstName')).toHaveValue('Temporary Applicant');
    await secondOptions.close();
    const formUrl = 'http://127.0.0.1:3987/application';
    await context.route(`${formUrl}*`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Job application</h1><form><label>First name<input name="firstName" autocomplete="given-name"></label><label>Last name<input name="lastName" autocomplete="family-name"></label><label>Email<input name="email" autocomplete="email"></label><label>Phone<input name="phone" autocomplete="tel"></label><label>Other reference<input id="novel-answer"></label><button type="button" id="outside">Continue</button></form>',
      }),
    );
    const form = await context.newPage();
    await form.goto(formUrl);
    const tabId = await worker.evaluate(
      async (formUrl) => (await chrome.tabs.query({ url: formUrl }))[0].id!,
      formUrl,
    );
    const popup = await context.newPage();
    await popup.addInitScript((id) => {
      chrome.tabs.query = async () => [{ id } as chrome.tabs.Tab];
    }, tabId);
    await popup.goto(url('popup.html'));
    await expect(popup.getByRole('heading', { name: 'Job Buddy', exact: true })).toBeVisible();
    await expect(popup.getByText('Temporary profile', { exact: true })).toHaveCount(0);
    await popup.getByRole('button', { name: 'Fill Form', exact: true }).click();
    await expect(form.locator('[name=firstName]')).toHaveValue('Temporary Applicant');
    // Manual learning starts watching only after the run completes.
    await expect(popup.getByRole('region', { name: 'Fill results' })).toBeVisible();
    await form.locator('#novel-answer').fill('jane.doe@example.com');
    await form.locator('#outside').focus();
    await expect
      .poll(async () => JSON.stringify(await native(options, 'session')))
      .toContain('novelanswer');
    await frame.getByRole('button', { name: 'Fill Details', exact: true }).click();
    await expect(frame.getByRole('heading', { name: 'Fill Details', exact: true })).toBeVisible();
    await expect(frame.getByText('First name', { exact: true })).toBeVisible();
    await frame.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(frame.getByRole('heading', { name: 'Cloud Backup', exact: true })).toBeVisible();
    await expect(
      frame.getByText('Temporary profile. Drive backup changes are disabled.'),
    ).toHaveCount(0);
    const downloadEvent = options.waitForEvent('download');
    await frame.getByRole('button', { name: 'Download File', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toContain('temporary-profile');
    const backup = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(backup.profile.personal.firstName).toBe('Temporary Applicant');
    expect(JSON.stringify(backup)).not.toContain('original-synthetic-key');
    await context.route('https://www.googleapis.com/drive/v3/files/read-only', (route) =>
      route.fulfill({ json: { read: true } }),
    );
    expect(
      await options
        .frames()[1]
        .evaluate(async () =>
          (await fetch('https://www.googleapis.com/drive/v3/files/read-only')).json(),
        ),
    ).toEqual({ read: true });
    // All write shapes, including Request objects, stay off the real network.
    await options.frames()[1].evaluate(async () => {
      await fetch(
        new Request('https://www.googleapis.com/drive/v3/files/synthetic', { method: 'DELETE' }),
      );
      await fetch('https://www.googleapis.com/upload/drive/v3/files', {
        method: 'POST',
        body: 'temporary',
      });
      await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: 'synthetic' });
    });
    expect(externalWrites.filter((url) => !url.includes('generativelanguage'))).toEqual([]);
    expect(await native(options, 'local')).toEqual(original);
    await frame.getByRole('button', { name: 'Reset Now', exact: true }).click();
    await frame.locator('#reset-confirmation').fill('DELETE');
    await frame.getByRole('button', { name: 'Reset All Data', exact: true }).click();
    await frame.getByRole('button', { name: 'Personal', exact: true }).click();
    await expect(frame.locator('#field-firstName')).toHaveValue('');
    expect(await native(options, 'local')).toEqual(original);
    await options.reload();
    await options.getByRole('button', { name: 'Personal', exact: true }).click();
    await expect(options.locator('#field-firstName')).toHaveValue('Jane');
    expect(JSON.stringify(await native(options, 'session'))).not.toContain('Temporary Applicant');
    await options.getByRole('button', { name: 'Original', exact: true }).click();
    await expect(
      options.frameLocator('iframe[title="Job Buddy options"]').locator('#field-firstName'),
    ).toHaveValue('Original');
    await expect(popup.getByText('Temporary profile', { exact: true })).toHaveCount(0);
    await expect(form.locator('[name=firstName]')).toHaveValue('Temporary Applicant');
    await popup.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(form.locator('[name=firstName]')).toHaveValue('');
    expect(await native(options, 'local')).toEqual(original);
    await form.locator('#novel-answer').fill('jane.doe@example.com');
    await form.locator('#outside').focus();
    // A correction from the retired temporary run cannot become an Original mapping.
    await expect.poll(async () => (await native(options, 'local')).learnedMappings).toEqual({});
    // With no saved key, On uses sample responses identified by the toggle tooltip.
    await options.evaluate(async () => window.__testStorage.local.remove('geminiApiKey'));
    await options.getByRole('switch', { name: 'API key', exact: true }).click();
    await options.getByRole('switch', { name: 'API key', exact: true }).click();
    await expect(options.getByRole('switch', { name: 'API key', exact: true })).toHaveAttribute(
      'title',
      'Uses sample AI when enabled.',
    );
    await expect(options.getByText('Sample AI', { exact: true })).toHaveCount(0);
    await options.getByRole('button', { name: 'Complete', exact: true }).click();
    await expect(popup.getByText('Temporary profile · Sample AI', { exact: true })).toHaveCount(0);
    await form.locator('#novel-answer').fill('');
    const requestsBeforeSample = externalWrites.length;
    await popup.getByRole('button', { name: 'Fill Form', exact: true }).click();
    await expect(form.locator('[name=firstName]')).toHaveValue('Jane');
    expect(externalWrites.length).toBe(requestsBeforeSample);
    expect((await native(options, 'local')).geminiApiKey).toBeUndefined();
  } finally {
    await context.close();
    if (server.exitCode === null && server.signalCode === null) {
      const stopped = new Promise<void>((done) => server.once('exit', () => done()));
      server.kill('SIGTERM');
      await stopped;
    }
  }
});
