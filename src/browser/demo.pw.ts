import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import type { Profile } from '../types/profile';
import type { FrameFillLog } from '../autofill/fillLog';
import type { AIFieldPayload } from '../resume-ai/types';

const publicURL = 'http://demo.example.test/demo/';
const sample = JSON.parse(
  await readFile(resolve('src/browser/fixtures/demo-profile.json'), 'utf8'),
) as {
  profile: Profile;
};

async function serveDemo(context: BrowserContext) {
  const files: Map<string, { body: Buffer; contentType: string }> = new Map(
    await Promise.all(
      ['index.html', 'style.css', 'demo.js'].map(
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
  await expect(page.getByRole('button', { name: /Submit application/ })).toBeEnabled();
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
  await expect(page.getByRole('heading', { name: 'Frontend Engineer', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What you’ll do' })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('Job Buddy');
  await expect(page.locator('a[href="../"], #test-controls, #test-fields')).toHaveCount(0);
  const title = page.locator('#role-title');
  expect(
    await title.evaluate(
      (el) => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1,
    ),
  ).toBe(true);
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
  await expect(page.locator('[name="consent"]')).not.toBeChecked();
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
  await page.getByRole('button', { name: /Submit application/ }).click();
  await expect(page.locator('#first-name')).toBeFocused();
  await expect(page.locator('#completion')).toBeHidden();
  await extension.send('AUTOFILL_FILL', 'merge');
  await page.locator('[name="consent"]').check();
  await page.getByRole('button', { name: /Submit application/ }).click();
  await expect(page.getByRole('heading', { name: 'Application complete' })).toBeVisible();
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
  await expect(page.locator('#test-controls, #test-fields')).toHaveCount(0);
});
