import { test, expect } from './fixtures';
const hostSelector = '[data-job-buddy-ui]';

test('one click preserves existing answers across frames and keeps details and Undo accessible', async ({
  page,
  context,
  extension,
}, info) => {
  const host = page.locator(hostSelector);
  await expect(host).toHaveCount(1);
  await host.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(page.locator('input[name="firstName"]')).toHaveValue('Jane');
  await expect(page.locator('input[name="lastName"]')).toHaveValue('Existing answer');
  await expect(page.locator('input[name="email"]')).toHaveValue('jane@example.test');
  await expect(page.frameLocator('#application-frame').locator('input')).toHaveValue(
    'jane@example.test',
  );
  await expect(host.getByRole('button', { name: 'View details' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  const saved = await extension.worker.evaluate(
    async (tabId) =>
      (await chrome.storage.session.get(`jb:autofill-run:${tabId}`))[`jb:autofill-run:${tabId}`],
    extension.sourceTabId,
  );
  expect(saved).toMatchObject({ stage: 'completed', mode: 'merge' });
  expect((saved as { frames: unknown[] }).frames.length).toBeGreaterThanOrEqual(2);
  // The widget's buttons are never counted as application fields or AI input.
  const logs = await extension.send('GET_FILL_LOG');
  expect(JSON.stringify(logs)).not.toContain('Move Job Buddy');
  const detailTab = context.waitForEvent('page');
  await host.getByRole('button', { name: 'View details' }).click();
  const details = await detailTab;
  await expect(details.getByRole('heading', { name: 'Fill Details', exact: true })).toBeVisible();
  await details.close();
  await page.screenshot({ path: info.outputPath('quick-fill-result.png') });
  await host.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('input[name="firstName"]')).toHaveValue('');
  await expect(page.locator('input[name="lastName"]')).toHaveValue('Existing answer');
  await expect(page.frameLocator('#application-frame').locator('input')).toHaveValue('');
});

test('stays fixed when scrolling, can be moved, and can be hidden per page, site or globally', async ({
  page,
  extension,
}, info) => {
  const host = page.locator(hostSelector);
  await expect(host).toBeVisible();
  await page.evaluate(() => {
    document.body.style.minHeight = '2200px';
  });
  const before = await host.boundingBox();
  await page.evaluate(() => scrollTo(0, 400));
  await expect.poll(async () => (await host.boundingBox())?.y).toBe(before!.y);
  const grip = host.getByRole('button', { name: 'Move Job Buddy' });
  await grip.focus();
  await grip.press('ArrowLeft');
  await grip.press('ArrowUp');
  await expect.poll(async () => (await host.boundingBox())!.x).toBeLessThan(before!.x);
  await expect
    .poll(() =>
      extension.worker.evaluate(
        async () => (await chrome.storage.local.get('quickFillPreferences')).quickFillPreferences,
      ),
    )
    .toMatchObject({ position: { x: expect.any(Number), y: expect.any(Number) } });
  await page.setViewportSize({ width: 390, height: 680 });
  await extension.worker.evaluate(() => chrome.storage.local.set({ themePreference: 'dark' }));
  await page.screenshot({ path: info.outputPath('quick-fill-narrow-dark.png') });
  const box = await host.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(10);
  expect(box!.x + box!.width).toBeLessThanOrEqual(380);
  await host.getByRole('button', { name: 'Quick fill options' }).click();
  await host.getByRole('button', { name: 'Hide until refresh' }).click();
  await expect(host).toHaveCount(0);
  await page.reload();
  await expect(host).toBeVisible();
  await host.getByRole('button', { name: 'Quick fill options' }).click();
  await host.getByRole('button', { name: 'Disable on this site' }).click();
  await expect(host).toHaveCount(0);
  await page.reload();
  await expect(host).toHaveCount(0);
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({ quickFillPreferences: { enabled: false, disabledSites: [] } }),
  );
  await page.reload();
  await expect(host).toHaveCount(0);
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({ quickFillPreferences: { enabled: true, disabledSites: [] } }),
  );
  await expect(host).toBeVisible();
});

test('ignores contact forms, discovers late embedded job forms, and routes missing AI to its input', async ({
  page,
  context,
  extension,
}) => {
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><input name="name"><input name="email"><textarea name="message"></textarea></form>';
  });
  await expect(page.locator(hostSelector)).toHaveCount(0);
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'job-frame';
    frame.srcdoc =
      '<form><input name="firstName"><input name="email"><input name="resume" type="file"></form>';
    document.body.append(frame);
  });
  const host = page.locator(hostSelector);
  await expect(host).toHaveCount(1);
  expect(await page.frameLocator('#job-frame').locator(hostSelector).count()).toBe(0);
  await extension.worker.evaluate(() =>
    chrome.storage.local.remove(['geminiApiKey', 'geminiModel']),
  );
  const newPage = context.waitForEvent('page');
  await host.getByRole('button', { name: 'Fill Form', exact: true }).click();
  const settings = await newPage;
  await expect(settings.locator('#gemini-api-key')).toBeFocused();
  await expect(host.getByRole('button', { name: 'Set Up AI Autofill' })).toBeVisible();
  await expect(page.frameLocator('#job-frame').locator('[name="firstName"]')).toHaveValue('');
});

test('settings changes update open forms and a hidden site can be restored', async ({
  page,
  context,
  extension,
}) => {
  const host = page.locator(hostSelector);
  await expect(host).toBeVisible();
  const opening = context.waitForEvent('page');
  await host.getByRole('button', { name: 'Quick fill options' }).click();
  await host.getByRole('button', { name: 'Quick fill settings' }).click();
  const settings = await opening;
  const toggle = settings.locator('#quick-fill-enabled');
  await expect(toggle).toBeFocused();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(host).toHaveCount(0);
  await toggle.check();
  await page.bringToFront();
  await expect(host).toBeVisible();
  await host.getByRole('button', { name: 'Quick fill options' }).click();
  await host.getByRole('button', { name: 'Disable on this site' }).click();
  await expect(host).toHaveCount(0);
  await settings.bringToFront();
  await settings.getByRole('button', { name: 'Show Button', exact: true }).click();
  await page.bringToFront();
  await expect(host).toBeVisible();
  expect(
    await extension.worker.evaluate(
      async () => (await chrome.storage.local.get('quickFillPreferences')).quickFillPreferences,
    ),
  ).toMatchObject({ enabled: true, disabledSites: [] });
});

test('hiding the button during AI leaves the background fill running', async ({
  page,
  context,
  extension,
}) => {
  await page.evaluate(() => {
    const label = document.createElement('label');
    label.textContent = 'Zqx identifier';
    const input = document.createElement('input');
    input.id = 'ai-extra';
    label.append(input);
    document.querySelector('form')!.append(label);
  });
  let release!: () => void;
  let started!: () => void;
  let calls = 0;
  const sawAI = new Promise<void>((resolve) => {
    started = resolve;
  });
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    calls++;
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
    });
  });
  const host = page.locator(hostSelector);
  await expect(host).toBeVisible();
  await host.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await sawAI;
  await expect(host.getByRole('button', { name: 'Filling…', exact: true })).toBeDisabled();
  await host.getByRole('button', { name: 'Quick fill options' }).click();
  await host.getByRole('button', { name: 'Hide until refresh' }).click();
  await expect(host).toHaveCount(0);
  release();
  await expect
    .poll(() =>
      extension.worker.evaluate(async (tabId) => {
        const run = (await chrome.storage.session.get(`jb:autofill-run:${tabId}`))[
          `jb:autofill-run:${tabId}`
        ] as { stage?: string };
        return run?.stage;
      }, extension.sourceTabId),
    )
    .toBe('completed');
  await expect(page.locator('input[name="firstName"]')).toHaveValue('Jane');
  await expect(page.locator('input[name="lastName"]')).toHaveValue('Existing answer');
  expect(calls).toBe(1);
  expect(
    await page.evaluate(() => (window as unknown as { submitted?: unknown }).submitted),
  ).toBeUndefined();
});
