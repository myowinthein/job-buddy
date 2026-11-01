import { test, expect } from './fixtures';
const hostSelector = '[data-job-buddy-ui]';

test('one click preserves existing answers across frames and keeps details and Undo accessible', async ({
  page,
  context,
  extension,
}, info) => {
  expect(
    await extension.worker.evaluate(() => chrome.runtime.getManifest().commands),
  ).toBeUndefined();
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

test('saved overwrite mode fills empty and existing fields, preserves unmatched answers, and can be undone', async ({
  page,
  context,
  extension,
}, info) => {
  const settings = await context.newPage();
  await settings.addInitScript(() => sessionStorage.setItem('jb:ui:section', 'settings'));
  await settings.goto(new URL('options.html', extension.worker.url()).href);
  const mode = settings.getByRole('combobox', { name: 'Fields to fill' });
  await expect(mode).toHaveValue('merge');
  await mode.selectOption('overwrite');
  await expect(mode).toBeEnabled();
  await settings.reload();
  await expect(mode).toHaveValue('overwrite');
  const section = settings.locator('section').filter({ has: mode });
  await section.screenshot({ path: info.outputPath('quick-fill-mode-settings.png') });
  await page.bringToFront();
  await page.reload();
  await page.evaluate(() => {
    const label = document.createElement('label');
    label.textContent = 'Zqx reference';
    const input = document.createElement('input');
    input.name = 'zqx';
    input.value = 'Keep this answer';
    label.append(input);
    document.querySelector('form')!.append(label);
  });
  await context.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
    }),
  );
  const host = page.locator(hostSelector);
  const fill = host.getByRole('button', { name: 'Fill Form', exact: true });
  await expect(fill).toHaveAttribute(
    'title',
    'Fill empty and existing fields with your Job Buddy profile.',
  );
  await fill.click();
  await expect(page.locator('[name="firstName"]')).toHaveValue('Jane');
  await expect(page.locator('[name="lastName"]')).toHaveValue('Doe');
  await expect(page.locator('[name="email"]')).toHaveValue('jane@example.test');
  await expect(page.locator('[name="zqx"]')).toHaveValue('Keep this answer');
  await expect(page.frameLocator('#application-frame').locator('input')).toHaveValue(
    'jane@example.test',
  );
  await expect(host.getByRole('button', { name: 'View details' })).toBeVisible();
  const outcomes = await page.evaluate(() => ({
    events: (window as unknown as { events: { name: string; type: string; inputEvent: boolean }[] })
      .events,
    valid: ['firstName', 'lastName', 'email'].every((name) =>
      document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.checkValidity(),
    ),
    submitted: (window as unknown as { submitted?: unknown }).submitted,
  }));
  expect(outcomes.valid).toBe(true);
  expect(outcomes.events).toContainEqual(
    expect.objectContaining({ name: 'lastName', type: 'input', inputEvent: true }),
  );
  expect(outcomes.submitted).toBeUndefined();
  await host.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[name="firstName"]')).toHaveValue('');
  // Existing Undo behavior clears owned answers, including overwritten ones.
  await expect(page.locator('[name="lastName"]')).toHaveValue('');
  await expect(page.locator('[name="zqx"]')).toHaveValue('Keep this answer');
  await expect(page.frameLocator('#application-frame').locator('input')).toHaveValue('');
  // The popup still asks how to handle existing answers, independently of Quick Fill.
  await page.locator('[name="lastName"]').fill('Existing answer');
  const popup = await context.newPage();
  await popup.goto(new URL('popup.html', extension.worker.url()).href);
  await popup.evaluate(async (tabId) => {
    const run = await chrome.runtime.sendMessage({ action: 'AUTOFILL_RUN_START', tabId });
    if (run?.stage !== 'confirming') throw new Error('Popup should still ask how to fill');
  }, extension.sourceTabId);
  await popup.close();
  await settings.bringToFront();
  await settings.getByRole('button', { name: 'Reset Now', exact: true }).click();
  const reset = settings.getByRole('dialog', { name: 'Reset All Data', exact: true });
  await reset.getByPlaceholder('DELETE', { exact: true }).fill('DELETE');
  await reset.getByRole('button', { name: 'Reset All Data', exact: true }).click();
  await expect(reset).toHaveCount(0);
  await settings.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(mode).toHaveValue('merge');
  expect(
    await extension.worker.evaluate(
      async () =>
        (
          (await chrome.storage.local.get('quickFillPreferences')).quickFillPreferences as {
            fillMode: string;
          }
        ).fillMode,
    ),
  ).toBe('merge');
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
  await expect(toggle.getByRole('button', { name: 'On', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await toggle.getByRole('button', { name: 'Off', exact: true }).click();
  await expect(host).toHaveCount(0);
  await toggle.getByRole('button', { name: 'On', exact: true }).click();
  await page.bringToFront();
  await expect(host).toBeVisible();
  await host.getByRole('button', { name: 'Quick fill options' }).click();
  await host.getByRole('button', { name: 'Disable on this site' }).click();
  await expect(host).toHaveCount(0);
  await settings.bringToFront();
  await settings.getByText('Hidden sites (1)', { exact: true }).click();
  await settings.getByRole('button', { name: 'Show button on 127.0.0.1', exact: true }).click();
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

test('hidden-site management stays compact with many sites and actions remain beside their labels', async ({
  context,
  extension,
}, info) => {
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({
      themePreference: 'dark',
      quickFillPreferences: {
        enabled: true,
        disabledSites: Array.from(
          { length: 13 },
          (_, i) => `site${String(i).padStart(2, '0')}.example`,
        ),
      },
    }),
  );
  const settings = await context.newPage();
  await settings.addInitScript(() => sessionStorage.setItem('jb:ui:section', 'settings'));
  await settings.goto(new URL('options.html', extension.worker.url()).href);
  const section = settings
    .locator('section')
    .filter({ has: settings.getByRole('heading', { name: 'Quick Fill', exact: true }) });
  await section.getByText('Hidden sites (13)', { exact: true }).click();
  await expect(section.getByRole('listitem')).toHaveCount(5);
  const label = await section.getByText('site00.example', { exact: true }).boundingBox();
  const action = await section
    .getByRole('button', { name: 'Show button on site00.example' })
    .boundingBox();
  expect(action!.x - (label!.x + label!.width)).toBeLessThanOrEqual(16);
  await section.screenshot({ path: info.outputPath('quick-fill-settings-dark.png') });
  const next = section.getByRole('button', { name: 'Next', exact: true });
  const previous = section.getByRole('button', { name: 'Previous', exact: true });
  const initialNext = await next.boundingBox();
  const initialPrevious = await previous.boundingBox();
  const firstSite = await section.getByRole('listitem').first().boundingBox();
  expect(initialNext!.y).toBeLessThan(firstSite!.y);
  await next.click();
  await expect(section.getByText('6–10 of 13 sites', { exact: true })).toBeVisible();
  await next.click();
  await expect(section.getByText('11–13 of 13 sites', { exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  const lastNext = await next.boundingBox();
  const lastPrevious = await previous.boundingBox();
  expect(lastNext!.x).toBeCloseTo(initialNext!.x, 1);
  expect(lastNext!.y).toBeCloseTo(initialNext!.y, 1);
  expect(lastPrevious!.x).toBeCloseTo(initialPrevious!.x, 1);
  expect(lastPrevious!.y).toBeCloseTo(initialPrevious!.y, 1);
  await previous.click();
  await expect(section.getByText('6–10 of 13 sites', { exact: true })).toBeVisible();
  await section.getByRole('searchbox', { name: 'Search hidden sites' }).fill('SITE12');
  await expect(section.getByRole('listitem')).toHaveCount(1);
  await section.getByRole('button', { name: 'Show button on site12.example' }).click();
  await expect(section.getByText('No sites match your search.', { exact: true })).toBeVisible();
  await section.getByRole('searchbox').fill('');
  await settings.setViewportSize({ width: 390, height: 844 });
  await expect(section.getByRole('listitem')).toHaveCount(5);
  await section.screenshot({ path: info.outputPath('quick-fill-settings-narrow.png') });
  expect(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});

test('completed feedback keeps filled counts neutral, accents attention, and exposes quiet actions', async ({
  page,
  context,
  extension,
}, info) => {
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form aria-label="Job application"><label>First name<input name="firstName" autocomplete="given-name"></label><label>Email<input name="email" type="email" autocomplete="email"></label><label>Zqx identifier<input name="unknown"></label></form>';
  });
  await context.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
    }),
  );
  const host = page.locator(hostSelector);
  await expect(host).toHaveCount(1);
  await host.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(host.getByRole('status')).toHaveText('2 filled, 1 needs attention');
  const messageColors = await host.getByRole('status').evaluate((element) => ({
    filled: getComputedStyle(element.firstElementChild!).color,
    attention: getComputedStyle(element.querySelector('.attention')!).color,
  }));
  expect(messageColors.filled).not.toBe(messageColors.attention);
  const undo = host.getByRole('button', { name: 'Undo', exact: true });
  const details = host.getByRole('button', { name: 'View details', exact: true });
  await page.mouse.move(20, 20);
  await expect(undo).toHaveCSS('text-decoration-line', 'none');
  await expect(details).toHaveCSS('text-decoration-line', 'none');
  await details.hover();
  await expect(details).toHaveCSS('text-decoration-line', 'underline');
  await page.mouse.move(20, 20);
  await extension.worker.evaluate(() => chrome.storage.local.set({ themePreference: 'dark' }));
  await expect(host).toHaveAttribute('data-dark', '');
  await host.screenshot({ path: info.outputPath('completed-compact-dark.png') });
  await undo.click();
  await expect(page.locator('input[name="firstName"]')).toHaveValue('');
  await expect(host.getByRole('status')).toBeHidden();
});
