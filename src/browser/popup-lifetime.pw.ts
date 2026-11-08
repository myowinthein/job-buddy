import { test, expect, geminiResponse, openPinnedPopup } from './fixtures';

test('closing during startup and AI preserves the run across popup and worker destruction', async ({
  page,
  context,
  extension,
}) => {
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><label>First name<input id="first" autocomplete="given-name"></label><label>Email<input id="email" type="email" autocomplete="email"></label><label>Zqx identifier<input id="ai"></label></form>';
  });
  const workerUrl = extension.worker.url();
  let releaseAI!: () => void;
  let sawAI!: () => void;
  const aiStarted = new Promise<void>((resolve) => {
    sawAI = resolve;
  });
  let requests = 0;
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    requests++;
    sawAI();
    await new Promise<void>((resolve) => {
      releaseAI = resolve;
    });
    await route.fulfill({
      json: geminiResponse(JSON.stringify([
        { fieldId: 'field_001', profilePath: 'personal.lastName', confidence: 'high' },
      ])),
    });
  });
  await extension.worker.evaluate(() => {
    const root = globalThis as typeof globalThis & { scanHeld?: boolean; releaseScan?: () => void };
    const send = chrome.tabs.sendMessage.bind(chrome.tabs);
    chrome.tabs.sendMessage = (async (...args: Parameters<typeof chrome.tabs.sendMessage>) => {
      const response = await send(...args);
      if ((args[1] as { action: string }).action === 'AUTOFILL_SCAN') {
        root.scanHeld = true;
        await new Promise<void>((resolve) => {
          root.releaseScan = resolve;
        });
      }
      return response;
    }) as typeof chrome.tabs.sendMessage;
  });
  let popup = await openPinnedPopup(context, workerUrl, extension.sourceTabId);
  await popup.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect
    .poll(() => extension.worker.evaluate(() => (globalThis as { scanHeld?: boolean }).scanHeld))
    .toBe(true);
  await popup.close();
  await extension.worker.evaluate(() =>
    (globalThis as { releaseScan?: () => void }).releaseScan?.(),
  );
  await aiStarted;
  await expect(page.locator('#first')).toHaveValue('Jane');
  await expect(page.locator('#ai')).toHaveValue('');
  popup = await openPinnedPopup(context, workerUrl, extension.sourceTabId);
  await expect(popup.getByText('Filling…', { exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Fill Form', exact: true })).toBeDisabled();
  await popup.close();

  const cdp = await context.newCDPSession(page);
  const targets = await cdp.send('Target.getTargets');
  const target = targets.targetInfos.find(
    (item) => item.type === 'service_worker' && item.url === workerUrl,
  );
  expect(target).toBeTruthy();
  await cdp.send('Target.closeTarget', { targetId: target!.targetId });
  releaseAI();
  await expect(page.locator('#ai')).toHaveValue('Doe');
  popup = await openPinnedPopup(context, workerUrl, extension.sourceTabId);
  await expect(popup.getByText('3 fields filled', { exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'View details', exact: true })).toBeVisible();
  expect(requests).toBe(1);
  await cdp.detach();
});

test('existing-answer choices survive closing, and a confirmed fill continues without rescanning', async ({
  page,
  context,
  extension,
}) => {
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><label>First name<input id="first" autocomplete="given-name"></label><label>Email<input id="email" type="email" autocomplete="email" value="existing@example.test"></label></form>';
  });
  await extension.worker.evaluate(() => {
    const root = globalThis as typeof globalThis & {
      scans?: number;
      fillHeld?: boolean;
      releaseFill?: () => void;
    };
    root.scans = 0;
    const send = chrome.tabs.sendMessage.bind(chrome.tabs);
    chrome.tabs.sendMessage = (async (...args: Parameters<typeof chrome.tabs.sendMessage>) => {
      const action = (args[1] as { action: string }).action;
      if (action === 'AUTOFILL_SCAN') root.scans!++;
      if (action === 'AUTOFILL_FILL') {
        root.fillHeld = true;
        await new Promise<void>((resolve) => {
          root.releaseFill = resolve;
        });
      }
      return send(...args);
    }) as typeof chrome.tabs.sendMessage;
  });
  let popup = await openPinnedPopup(context, extension.worker.url(), extension.sourceTabId);
  await popup.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(popup.getByRole('radio', { name: /^Fill empty fields/ })).toBeChecked();
  await popup.close();
  await expect(page.locator('#first')).toHaveValue('');
  await expect(page.locator('#email')).toHaveValue('existing@example.test');
  popup = await openPinnedPopup(context, extension.worker.url(), extension.sourceTabId);
  await expect(popup.getByRole('radio', { name: /^Fill empty fields/ })).toBeChecked();
  await popup.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect
    .poll(() => extension.worker.evaluate(() => (globalThis as { fillHeld?: boolean }).fillHeld))
    .toBe(true);
  await popup.close();
  await extension.worker.evaluate(() =>
    (globalThis as { releaseFill?: () => void }).releaseFill?.(),
  );
  await expect(page.locator('#first')).toHaveValue('Jane');
  await expect(page.locator('#email')).toHaveValue('existing@example.test');
  expect(await extension.worker.evaluate(() => (globalThis as { scans?: number }).scans)).toBe(1);
  popup = await openPinnedPopup(context, extension.worker.url(), extension.sourceTabId);
  await popup.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#first')).toHaveValue('');
  await expect(page.locator('#email')).toHaveValue('existing@example.test');
});

test('navigation stops a pending fill and cannot fill the replacement document', async ({
  page,
  context,
  extension,
}) => {
  await page.evaluate(() => {
    document.body.innerHTML =
      '<label>First name<input id="first" autocomplete="given-name"></label>';
  });
  await extension.worker.evaluate(() => {
    const root = globalThis as typeof globalThis & { fillHeld?: boolean; releaseFill?: () => void };
    const send = chrome.tabs.sendMessage.bind(chrome.tabs);
    chrome.tabs.sendMessage = (async (...args: Parameters<typeof chrome.tabs.sendMessage>) => {
      if ((args[1] as { action: string }).action === 'AUTOFILL_FILL') {
        root.fillHeld = true;
        await new Promise<void>((resolve) => {
          root.releaseFill = resolve;
        });
      }
      return send(...args);
    }) as typeof chrome.tabs.sendMessage;
  });
  const popup = await openPinnedPopup(context, extension.worker.url(), extension.sourceTabId);
  await popup.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect
    .poll(() => extension.worker.evaluate(() => (globalThis as { fillHeld?: boolean }).fillHeld))
    .toBe(true);
  await popup.close();
  await page.goto('http://127.0.0.1/another-application');
  await expect
    .poll(() =>
      extension.worker.evaluate(
        async (tabId) =>
          (await chrome.storage.session.get(`jb:autofill-run:${tabId}`))[
            `jb:autofill-run:${tabId}`
          ] ?? null,
        extension.sourceTabId,
      ),
    )
    .toBeNull();
  await extension.worker.evaluate(() =>
    (globalThis as { releaseFill?: () => void }).releaseFill?.(),
  );
  await expect(page.locator('[name="firstName"]')).toHaveValue('');
  const reopened = await openPinnedPopup(context, extension.worker.url(), extension.sourceTabId);
  await expect(reopened.getByRole('button', { name: 'Fill Form', exact: true })).toBeEnabled();
  await expect(reopened.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
});
