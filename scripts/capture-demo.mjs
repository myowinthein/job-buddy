// Run after `pnpm build`: node scripts/capture-demo.mjs
// Uses a disposable Chromium profile, fictional data, and intercepted network requests.
/* global chrome, document, console */
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL } from 'node:url';

const extensionPath = resolve('.output/chrome-mv3');
const output = resolve('docs/assets/images/autofill-demo.jpg');
const html = await readFile(new URL('./fixtures/demo-application.html', import.meta.url), 'utf8');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  await context.route('http://127.0.0.1/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await context.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
    }),
  );
  await context.route(/https?:\/\/(?!127\.0\.0\.1|generativelanguage\.googleapis\.com)/, (route) =>
    route.abort(),
  );

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      geminiApiKey: 'synthetic-demo-key',
      geminiModel: 'gemini-3.8-flash',
      themePreference: 'light',
      quickFillPreferences: {
        enabled: true,
        fillMode: 'merge',
        disabledSites: [],
        position: { x: 0.14, y: 0.77 },
      },
      profile: {
        id: 'readme-demo-profile',
        personal: {
          firstName: 'Alex',
          lastName: 'Morgan',
          email: 'alex.morgan@example.com',
          phone: { countryCode: 'US', callingCode: '+1', number: '2025550188' },
        },
        address: {
          street: '88 Sample Street',
          city: 'Seattle',
          state: 'Washington',
          postalCode: '98101',
          country: 'US',
        },
        professional: { noticePeriod: { immediate: true } },
        salary: { expected: [] },
        workAuthorization: [],
        workHistory: [],
        education: [],
        languages: [],
        links: {
          linkedin: 'https://www.linkedin.com/in/alex-morgan-demo',
          portfolio: 'https://alexmorgan.example.com',
        },
        documents: { cv: {} },
      },
    });
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1/application');
  const widget = page.locator('[data-job-buddy-ui]');
  await expect(widget).toBeVisible();
  await widget.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(page.getByLabel('First name', { exact: false })).toHaveValue('Alex');
  await expect(page.getByLabel('Last name', { exact: false })).toHaveValue('Morgan');
  await expect(page.getByLabel('Email address', { exact: false })).toHaveValue(
    'alex.morgan@example.com',
  );
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('Seattle');
  await expect(page.getByLabel('LinkedIn', { exact: true })).toHaveValue(
    'https://www.linkedin.com/in/alex-morgan-demo',
  );
  await expect(widget.getByRole('button', { name: 'View details' })).toBeVisible();
  await expect(widget.getByText('11 fields filled', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send application' })).toBeInViewport();
  const formBox = await page.locator('form').boundingBox();
  if (!formBox || formBox.y + formBox.height > 980) throw new Error('Demo form is cropped.');
  const invalid = await page
    .locator('input')
    .evaluateAll((fields) =>
      fields.filter((field) => !field.checkValidity()).map((field) => field.name),
    );
  if (invalid.length) throw new Error(`Invalid demo values: ${invalid.join(', ')}`);
  await page.getByRole('heading', { name: 'Your application' }).click();
  await page.mouse.move(20, 20);
  await page.evaluate(() => document.fonts.ready);
  await mkdir(resolve('docs/assets/images'), { recursive: true });
  await page.screenshot({ path: output, type: 'jpeg', quality: 92, animations: 'disabled' });
  console.log(`Captured ${output}`);
  console.log('Verified 11 filled fields, valid form values, and visible Quick Fill results.');
} finally {
  await context.close();
}
