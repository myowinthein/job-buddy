import { test as base, expect, chromium, type Worker } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const test = base.extend<{
  extension: {
    worker: Worker;
    send: (action: string, mode?: string) => Promise<Record<string, number>[]>;
  };
}>({
  context: async ({ browserName: _browserName }, provide, info) => {
    const extensionPath = resolve('.output/chrome-mv3');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: info.project.use.headless !== false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    try {
      const html = await readFile(resolve('src/browser/fixtures/application.html'), 'utf8');
      await context.route('http://127.0.0.1/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: html }),
      );
      await context.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
      await provide(context);
    } finally {
      await context.close();
    }
  },
  extension: async ({ context, page }, provide) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        profile: {
          id: 'synthetic-browser-profile',
          personal: {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.test',
            phone: { countryCode: 'US', callingCode: '+1', number: '1234567890' },
          },
          address: { city: 'Test City', country: 'US' },
          professional: {},
          salary: { current: { amount: 0, currency: 'USD', period: 'monthly' }, expected: [] },
          workAuthorization: [],
          workHistory: [],
          education: [],
          languages: [],
          links: { linkedin: '' },
          documents: {
            cv: {
              file: {
                name: 'synthetic.pdf',
                size: 13,
                base64: 'data:application/pdf;base64,c3ludGhldGljIHBkZg==',
              },
            },
          },
        },
      });
    });
    await page.goto('http://127.0.0.1/application');
    const send = (action: string, mode?: string) =>
      worker.evaluate(
        async ({ action, mode }) => {
          const tabs = await chrome.tabs.query({});
          const tab =
            tabs.find((t) => t.url?.startsWith('http://127.0.0.1/application')) ?? tabs.at(-1)!;
          const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id! });
          return Promise.all(
            (frames ?? [{ frameId: 0 }]).map(async ({ frameId }) => {
              try {
                return await chrome.tabs.sendMessage(tab.id!, { action, mode }, { frameId });
              } catch {
                return { missingListener: 1 };
              }
            }),
          );
        },
        { action, mode },
      ) as Promise<Record<string, number>[]>;
    await expect
      .poll(async () => {
        const responses = await send('AUTOFILL_SCAN');
        return responses.length >= 2 && responses.every((result) => !result.missingListener);
      })
      .toBe(true);
    await provide({ worker, send });
  },
});
export { expect };
