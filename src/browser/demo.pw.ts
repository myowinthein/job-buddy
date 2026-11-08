import type { FrameFillLog } from '../autofill/fillLog';
import { test, expect } from './fixtures';
import { serveDemo, ready, sample, publicURL } from './demoSupport';
import { fitsViewportWidth } from './layout';

test.use({ deviceScaleFactor: 3 });

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
  await expect(page.locator('#job-buddy-setup')).toHaveAttribute('data-status', 'detected');
  await expect(page.locator('#job-buddy-setup')).toBeHidden();
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
  await expect(page.locator('#company')).toHaveValue('Example Studio');
  await expect(page.locator('#job-title')).toHaveValue('Senior Frontend Engineer');
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
    path: info.outputPath('demo-autofill.png'),
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
    expect(await fitsViewportWidth(page)).toBe(
      true,
    );
    if (width === 390)
      await page.screenshot({ path: info.outputPath('demo-mobile.png'), fullPage: true });
  }
  await page.goto(`${publicURL}?test=1`);
  await expect(page.locator('#test-controls, #test-fields')).toHaveCount(0);
});

test('presence works independently of Quick Fill visibility and Gemini setup', async ({
  context,
  page,
  extension,
}) => {
  await serveDemo(context);
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({ quickFillPreferences: { enabled: false, disabledSites: [] } });
    await chrome.storage.local.remove(['geminiApiKey', 'geminiModel']);
  });
  await page.goto(publicURL);
  await expect(page.locator('#job-buddy-setup')).toHaveAttribute('data-status', 'detected');
  await expect(page.locator('#job-buddy-setup')).toBeHidden();
  await expect(page.locator('[data-job-buddy-ui]')).toHaveCount(0);
});
