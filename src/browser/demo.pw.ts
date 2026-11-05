import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import type { Profile } from '../types/profile';
import type { FrameFillLog } from '../autofill/fillLog';
import type { AIFieldPayload } from '../resume-ai/types';

const publicURL = 'http://demo.example.test/demo/';
const localURL = 'http://127.0.0.1/demo/';
const sample = JSON.parse(await readFile(resolve('docs/demo/sample-profile.json'), 'utf8')) as {
  profile: Profile;
};

async function serveDemo(context: BrowserContext) {
  const files: Map<string, { body: Buffer; contentType: string }> = new Map(
    await Promise.all(
      ['index.html', 'style.css', 'demo.js', 'sample-profile.json'].map(
        async (name) =>
          [
            `/demo/${name === 'index.html' ? '' : name}`,
            {
              body: await readFile(resolve('docs/demo', name)),
              contentType: name.endsWith('.html')
                ? 'text/html'
                : name.endsWith('.css')
                  ? 'text/css'
                  : name.endsWith('.js')
                    ? 'application/javascript'
                    : 'application/json',
            },
          ] as const,
      ),
    ),
  );
  await context.route(/http:\/\/(?:demo\.example\.test|127\.0\.0\.1)\/demo\//, (route) => {
    const file = files.get(new URL(route.request().url()).pathname);
    return route.fulfill(file ?? { status: 404, body: 'Not found' });
  });
  // Keep capture and integration tests reproducible without a real API key.
  // The production matching, writing, feedback, and Undo code still runs.
  await context.route('https://generativelanguage.googleapis.com/**', (route) => {
    const prompt = route.request().postDataJSON().contents[0].parts[0].text as string;
    const { fields } = JSON.parse(prompt.slice(prompt.lastIndexOf('\n\n{') + 2)) as {
      fields: AIFieldPayload[];
    };
    const answers = fields
      .filter((field) => field.type === 'radio' && /sponsorship/i.test(field.label))
      .map((field) => ({
        fieldId: field.fieldId,
        selectedOption: field.options?.find((option) => option.label === 'No')?.id,
        confidence: 'high',
      }));
    return route.fulfill({
      json: { candidates: [{ content: { parts: [{ text: JSON.stringify(answers) }] } }] },
    });
  });
}

async function ready(page: Page, send: (action: string, mode?: string) => Promise<unknown[]>) {
  await expect(page.getByRole('button', { name: /Finish demo/ })).toBeEnabled();
  await expect
    .poll(async () => {
      const logs = (await send('AUTOFILL_SCAN')) as { totalMatched?: number }[];
      return logs.some((log) => Number(log.totalMatched) > 0);
    })
    .toBe(true);
}

test('the original demo fills with the production extension and produces the public screenshot', async ({
  context,
  page,
  extension,
}, info) => {
  await serveDemo(context);
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({
      profile,
      themePreference: 'light',
      quickFillPreferences: { enabled: true, disabledSites: [], position: { x: 0.075, y: 0.82 } },
    });
  }, sample.profile);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(publicURL);
  await ready(page, extension.send);
  await expect(page.getByRole('heading', { name: 'Local testing' })).toHaveCount(0);
  await page.evaluate(() => {
    for (const input of document.querySelectorAll<HTMLInputElement>(
      '#first-name, #email, #country',
    )) {
      input.addEventListener('change', () => (input.dataset.observed = 'yes'));
    }
  });
  const host = page.locator('[data-job-buddy-ui]');
  await host.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(page.locator('#first-name')).toHaveValue('Alex');
  await expect(page.locator('#email')).toHaveValue('alex.morgan@example.com');
  await expect(page.locator('#country')).toHaveValue('US');
  await expect(page.locator('#authorized')).toHaveValue('yes');
  await expect(page.getByRole('radio', { name: 'No', exact: true })).toBeChecked();
  await expect(page.locator('#country')).toHaveAttribute('data-observed', 'yes');
  await expect
    .poll(() => page.locator('#resume').evaluate((el) => (el as HTMLInputElement).files?.length))
    .toBe(1);
  await expect(page.locator('#interest')).toHaveValue('');
  await expect(page.locator('[name="demoConsent"]')).not.toBeChecked();
  await expect(host.getByRole('button', { name: 'View details' })).toBeVisible();
  const logs = (await extension.send('GET_FILL_LOG')) as unknown as FrameFillLog[];
  expect(
    logs.flatMap((log) => log.fields).filter((field) => field.label === 'First name'),
  ).toHaveLength(1);
  expect(logs.flatMap((log) => log.fields).some((field) => field.outcome === 'excluded')).toBe(
    true,
  );
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath('demo-autofill.jpg'),
    type: 'jpeg',
    quality: 92,
    animations: 'disabled',
  });
  await host.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#first-name')).toHaveValue('');
  await expect
    .poll(() => page.locator('#resume').evaluate((el) => (el as HTMLInputElement).files?.length))
    .toBe(0);
});

test('local test fields cover repeated rows, dynamic entries, and merge versus overwrite', async ({
  context,
  page,
  extension,
}) => {
  await serveDemo(context);
  await extension.worker.evaluate(
    (profile) => chrome.storage.local.set({ profile }),
    sample.profile,
  );
  await page.goto(`${localURL}?test=1`);
  await ready(page, extension.send);
  await expect(page.getByRole('group', { name: /^Experience \d/ })).toHaveCount(2);
  await expect(page.getByRole('group', { name: /^Education \d/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Load existing answers' }).click();
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('#first-name')).toHaveValue('Existing name');
  await expect(page.locator('#city')).toHaveValue('Existing city');
  await expect(page.locator('#work-0-company')).toHaveValue('Example Studio');
  await expect(page.locator('#work-1-company')).toHaveValue('Sample Labs');
  await expect(page.locator('#education-0-institution')).toHaveValue('Example University');
  await expect(page.locator('#education-1-institution')).toHaveValue('Sample Institute');
  await page.getByRole('button', { name: 'Add experience', exact: true }).click();
  await expect(page.locator('#work-2-company')).toBeFocused();
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#first-name')).toHaveValue('Alex');
  await expect(page.locator('#city')).toHaveValue('Seattle');
  await expect(page.locator('#work-2-company')).toHaveValue('');
  await page.getByRole('button', { name: 'Remove experience 3', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add experience', exact: true })).toBeFocused();
});

test('demo submission stays on the page, validates required answers, and resets cleanly', async ({
  context,
  page,
  extension,
}, info) => {
  await serveDemo(context);
  await extension.worker.evaluate(
    (profile) => chrome.storage.local.set({ profile }),
    sample.profile,
  );
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  await page.goto(publicURL);
  await ready(page, extension.send);
  await page.getByRole('button', { name: /Finish demo/ }).click();
  await expect(page.locator('#first-name')).toBeFocused();
  await expect(page.locator('#completion')).toBeHidden();
  await extension.send('AUTOFILL_FILL', 'merge');
  await page.locator('[name="demoConsent"]').check();
  await page.getByRole('button', { name: /Finish demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeVisible();
  await expect(page).toHaveURL(publicURL);
  expect(writes.filter((url) => url.startsWith(publicURL))).toEqual([]);
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Reset form', exact: true }).click(),
  ]);
  await expect(page.locator('#first-name')).toHaveValue('');
  await expect(page.locator('#first-name')).not.toHaveAttribute('data-jb-highlighted');
  await expect(page.locator('#completion')).toBeHidden();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390)
      await page.screenshot({ path: info.outputPath('demo-mobile.png'), fullPage: true });
  }
  await page.goto(`${publicURL}?test=1`);
  await expect(page.getByRole('heading', { name: 'Local testing' })).toHaveCount(0);
  await expect(page.locator('#test-fields')).toBeHidden();
});

test('the downloadable sample imports into an empty Job Buddy profile', async ({
  context,
  page,
  extension,
}) => {
  await serveDemo(context);
  await page.goto(publicURL);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download sample profile/ }).click();
  expect((await download).suggestedFilename()).toBe('job-buddy-demo-profile.json');
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({ profile: { id: 'empty-demo-test' }, learnedMappings: {} }),
  );
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await options.getByRole('button', { name: 'Settings', exact: true }).click();
  await options
    .locator('input[type="file"][accept=".json"]')
    .setInputFiles(resolve('docs/demo/sample-profile.json'));
  await expect
    .poll(() =>
      extension.worker.evaluate(async () => {
        const { profile } = await chrome.storage.local.get('profile');
        return (profile as Profile).personal?.email;
      }),
    )
    .toBe('alex.morgan@example.com');
  await expect(
    options.getByRole('progressbar', { name: 'Saved required profile details' }),
  ).toHaveAttribute('aria-valuenow', '100');
});
