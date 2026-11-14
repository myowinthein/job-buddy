import { test, expect, stubEmptyGemini } from './fixtures';

test('delayed background timers preserve controlled native selections and Undo', async ({
  context,
  extension,
  page,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({
      quickFillPreferences: { enabled: true, disabledSites: [], fillMode: 'overwrite' },
    });
  });
  await page.evaluate(() => {
    document.body.innerHTML = `<form><h1>Job application</h1><label>First name<input name="firstName"></label><label>Email<input type="email" name="email"></label><label>Country<select name="country" autocomplete="country" required><option value="CA">Canada</option><option value="US">United States</option></select></label><output id="committed">CA</output><output id="changes">0</output></form>`;
    const select = document.querySelector('select')!;
    let model = select.value;
    let changes = 0;
    select.addEventListener('change', () => {
      const next = select.value;
      document.querySelector('#changes')!.textContent = String(++changes);
      select.value = model;
      setTimeout(() => {
        model = next;
        select.value = model;
        document.querySelector('#committed')!.textContent = model;
      }, 30);
    });
  });
  // Observe the extension's existing isolated world without changing host permissions.
  const session = await context.newCDPSession(page);
  const extensionOrigin = `chrome-extension://${new URL(extension.worker.url()).host}`;
  let contentContext: number | undefined;
  session.on('Runtime.executionContextCreated', ({ context: execution }) => {
    if (execution.origin === extensionOrigin && !execution.auxData?.isDefault)
      contentContext = execution.id;
  });
  await session.send('Runtime.enable');
  expect(contentContext).toBeDefined();
  await session.send('Runtime.evaluate', {
    contextId: contentContext,
    expression: `(() => {
      const schedule = globalThis.setTimeout.bind(globalThis);
      globalThis.setTimeout = (callback, delay, ...args) =>
        schedule(callback, delay === 16 ? 700 : delay, ...args);
    })()`,
  });
  const widget = page.locator('[data-job-buddy-ui]');
  await widget.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await expect(page.locator('select')).toHaveValue('US');
  await expect(page.locator('#committed')).toHaveText('US');
  await expect(page.locator('#changes')).toHaveText('1');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  await widget.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('select')).toHaveValue('CA');
  await expect(page.locator('#committed')).toHaveText('CA');
  await expect(page.locator('#changes')).toHaveText('2');
});
