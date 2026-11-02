import { test, expect } from './fixtures';
import { summarizeFillFields } from '../autofill/fillLog';
import type { FrameFillLog } from '../autofill/fillLog';

test('the production Fill Details combines frames, reports real outcomes, tracks edits and identifies Undo', async ({
  page,
  context,
  extension,
}, testInfo) => {
  const results = await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('[name="firstName"]')).toHaveValue('Jane');
  await expect(page.locator('[name="lastName"]')).toHaveValue('Existing answer');
  const logs = (await extension.send('GET_FILL_LOG')) as unknown as FrameFillLog[];
  const fields = logs.flatMap((log) => log.fields);
  const counts = summarizeFillFields(fields);
  expect(new Set(logs.map((log) => log.runId)).size).toBe(1);
  expect(counts.detected).toBe(counts.filled + counts.kept + counts.excluded + counts.notFilled);
  expect(counts.kept).toBeGreaterThan(0);
  expect(counts.excluded).toBeGreaterThan(0);
  expect(counts.sentToAI).toBeGreaterThan(0);
  expect(counts.aiFailed).toBe(counts.sentToAI);
  expect(results.reduce((sum, result) => sum + Number(result.noReview), 0)).toBe(
    counts.highConfidence + counts.manual,
  );
  expect(results.reduce((sum, result) => sum + Number(result.totalScanned), 0)).toBe(
    counts.detected,
  );
  expect(JSON.stringify(logs)).not.toContain('synthetic-key');
  expect(JSON.stringify(logs)).not.toContain('c3ludGhldGljIHBkZg==');

  const sourceId = extension.sourceTabId;
  const logPage = await context.newPage();
  await logPage.goto(`${new URL('fill-log.html', extension.worker.url()).href}?tabId=${sourceId}`);
  await expect(logPage.getByRole('heading', { name: 'Fill Details', exact: true })).toBeVisible();
  await expect(logPage.getByText(/AI assistance was unavailable for part or all/)).toBeVisible();
  const detected = logPage.getByText('Detected', { exact: true }).locator('..');
  await expect(detected).toContainText(String(counts.detected));
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-overview-light.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await logPage.emulateMedia({ colorScheme: 'dark' });
  await expect(logPage.locator('html')).toHaveClass(/dark/);
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-overview-dark.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await logPage.getByRole('tab', { name: 'Fields', exact: true }).click();
  await expect(
    logPage.getByRole('button', { name: `All (${counts.detected})`, exact: true }),
  ).toBeVisible();
  await expect(
    logPage.getByRole('button', { name: `Kept current (${counts.kept})`, exact: true }),
  ).toBeVisible();
  await logPage.locator('summary').first().click();
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-fields-dark.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await logPage.setViewportSize({ width: 375, height: 812 });
  await expect
    .poll(() => logPage.locator('aside').evaluate((el) => el.getBoundingClientRect().width))
    .toBe(64);
  expect(await logPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  expect(await logPage.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-narrow.png'),
    fullPage: true,
    animations: 'disabled',
  });

  const popup = await context.newPage();
  // A full-page popup test has its own active tab. Pin its query to the source
  // form, as Chrome does when the toolbar popup is opened over that form.
  await popup.addInitScript((id) => {
    chrome.tabs.query = async () => [{ id } as chrome.tabs.Tab];
  }, sourceId);
  await popup.setViewportSize({ width: 380, height: 600 });
  await popup.goto(new URL('popup.html', extension.worker.url()).href);
  await expect(popup.getByText(`${counts.filled} fields filled`, { exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Fill Form', exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  const details = popup.getByRole('region', { name: 'Fill results' }).getByRole('button', {
    name: 'View details',
    exact: true,
  });
  await expect(details).toBeVisible();
  const summaryBox = await popup
    .getByText(`${counts.filled} fields filled`, { exact: true })
    .boundingBox();
  const detailsBox = await details.boundingBox();
  expect(Math.abs(summaryBox!.y - detailsBox!.y)).toBeLessThanOrEqual(4);
  expect(summaryBox!.x + summaryBox!.width).toBeLessThan(detailsBox!.x);
  await expect(logPage).toHaveTitle('Job Buddy: Fill Details');
  expect(
    await popup.locator('#root').evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(600);
  await popup.locator('#root').screenshot({ path: testInfo.outputPath('popup-results-light.png') });
  await popup.emulateMedia({ colorScheme: 'dark' });
  await expect(popup.locator('html')).toHaveClass(/dark/);
  await popup.locator('#root').screenshot({ path: testInfo.outputPath('popup-results-dark.png') });
  const pageCount = context.pages().length;
  await popup.getByRole('button', { name: 'View details' }).click();
  await expect(logPage.getByRole('button', { name: 'Fill Details', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(logPage).toHaveURL(new URL('options.html', extension.worker.url()).href);
  await expect
    .poll(() =>
      extension.worker.evaluate(
        async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url,
      ),
    )
    .toBe(new URL('options.html', extension.worker.url()).href);
  expect(context.pages()).toHaveLength(pageCount);
  await expect(logPage.getByRole('heading', { name: 'Required details complete' })).toHaveCount(0);
  await popup.close();

  // A manual clear must stop counting as a filled value in both consumers.
  await page.locator('[name="firstName"]').fill('');
  await logPage.bringToFront();
  await expect(logPage.getByText('Cleared manually', { exact: true }).first()).toBeVisible();
  const edited = (await extension.send('GET_FILL_LOG')) as unknown as FrameFillLog[];
  expect(summarizeFillFields(edited.flatMap((log) => log.fields)).filled).toBe(counts.filled - 1);
  const status = await extension.send('GET_STATUS');
  expect(status.reduce((sum, result) => sum + Number(result.noReview), 0)).toBe(
    counts.highConfidence - 1,
  );

  await extension.send('CLEAR');
  await logPage.bringToFront();
  await expect(logPage.getByText(/These fills were undone/)).toBeVisible();
  await expect(page.locator('[name="lastName"]')).toHaveValue('Existing answer');
  await logPage.getByRole('button', { name: 'Return to Form', exact: true }).click();
  await expect
    .poll(async () =>
      extension.worker.evaluate(async () => {
        return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      }),
    )
    .toBe(sourceId);

  await page.reload();
  await logPage.bringToFront();
  await expect(logPage.getByText(/No fill details are available yet/)).toBeVisible();
});

test('an independently scanned empty iframe does not hide form fills, and a fresh empty run stays empty', async ({
  page,
  context,
  extension,
}, testInfo) => {
  await extension.send('AUTOFILL_FILL', 'merge');
  const logs = (await extension.send('GET_FILL_LOG')) as unknown as FrameFillLog[];
  const count = summarizeFillFields(logs.flatMap((log) => log.fields)).filled;
  const before = await extension.worker.evaluate(
    async (tabId) =>
      (await chrome.webNavigation.getAllFrames({ tabId }))!.map((frame) => frame.frameId),
    extension.sourceTabId,
  );
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.srcdoc = '<p>Empty embedded frame</p>';
    document.body.append(frame);
  });
  await expect
    .poll(async () =>
      extension.worker.evaluate(
        async ({ tabId, before }) => {
          const frames = await chrome.webNavigation.getAllFrames({ tabId });
          const frame = frames?.find((frame) => !before.includes(frame.frameId));
          if (!frame) return 'Frame not ready';
          try {
            await chrome.scripting
              .executeScript({
                target: { tabId, frameIds: [frame.frameId] },
                files: ['content-scripts/content.js'],
              })
              .catch(() => undefined);
            const result = await chrome.tabs.sendMessage(
              tabId,
              { action: 'AUTOFILL_SCAN', runId: 'independent-empty-run' },
              { frameId: frame.frameId },
            );
            if (result?.preFilledCount !== 0) return JSON.stringify(result);
            await chrome.tabs.sendMessage(
              tabId,
              { action: 'AUTOFILL_FILL', mode: 'overwrite' },
              { frameId: frame.frameId },
            );
            return 'Completed';
          } catch (error) {
            return String(error);
          }
        },
        { tabId: extension.sourceTabId, before },
      ),
    )
    .toBe('Completed');

  const popup = await context.newPage();
  await popup.addInitScript((id) => {
    chrome.tabs.query = async () => [{ id } as chrome.tabs.Tab];
  }, extension.sourceTabId);
  await popup.setViewportSize({ width: 380, height: 600 });
  await popup.goto(new URL('popup.html', extension.worker.url()).href);
  await expect(popup.getByText(`${count} fields filled`, { exact: true })).toBeVisible();
  await expect(page.locator('[name="firstName"]')).toHaveValue('Jane');
  const opened = context.waitForEvent('page');
  await popup.getByRole('button', { name: 'View details' }).click();
  const logPage = await opened;
  await expect(logPage.getByText('Detected', { exact: true }).locator('..')).toContainText('9');
  await expect(logPage.getByText('Filled', { exact: true }).locator('..')).toContainText(
    String(count),
  );
  await logPage.screenshot({ path: testInfo.outputPath('sandbox-fill-log.png'), fullPage: true });

  await page.evaluate(() => {
    document.body.innerHTML = '<p>No application form</p>';
  });
  await popup.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(popup.getByText('No fillable fields found.')).toBeVisible();
  await expect(popup.getByRole('link', { name: 'Report on GitHub ↗' })).toHaveCount(0);
  await expect(
    popup
      .getByRole('region', { name: 'Fill results' })
      .getByRole('button', { name: 'View details' }),
  ).toBeVisible();
  await expect(popup.getByText(`${count} fields filled`, { exact: true })).toHaveCount(0);
  await popup.locator('#root').screenshot({ path: testInfo.outputPath('empty-result.png') });
});

test('View details reuses options without discarding an unsaved profile until the user agrees', async ({
  page,
  context,
  extension,
}) => {
  await extension.send('AUTOFILL_FILL', 'merge');
  const options = await context.newPage();
  const optionsUrl = new URL('options.html', extension.worker.url()).href;
  await options.goto(optionsUrl);
  await options.getByLabel('First Name*', { exact: true }).fill('Unsaved draft');
  const popup = await context.newPage();
  await popup.addInitScript((id) => {
    chrome.tabs.query = async () => [{ id } as chrome.tabs.Tab];
  }, extension.sourceTabId);
  await popup.goto(new URL('popup.html', extension.worker.url()).href);
  const count = context.pages().length;
  const dismissed = new Promise<void>((resolve) =>
    options.once('dialog', async (dialog) => {
      await dialog.dismiss();
      resolve();
    }),
  );
  await popup.getByRole('button', { name: 'View details' }).click();
  await dismissed;
  await expect(options.getByLabel('First Name*', { exact: true })).toHaveValue('Unsaved draft');
  await expect(options.getByRole('heading', { name: 'Fill Details', exact: true })).toHaveCount(0);
  expect(context.pages()).toHaveLength(count);
  const accepted = new Promise<void>((resolve) =>
    options.once('dialog', async (dialog) => {
      await dialog.accept();
      resolve();
    }),
  );
  await popup.getByRole('button', { name: 'View details' }).click();
  await accepted;
  await expect(options.getByRole('heading', { name: 'Fill Details', exact: true })).toBeVisible();
  await expect(options.getByRole('button', { name: 'Return to Form', exact: true })).toBeVisible();
  await expect(
    options.getByRole('progressbar', { name: 'Saved required profile details' }),
  ).toHaveCount(0);
  expect(context.pages()).toHaveLength(count);
  await expect(page.locator('[name="firstName"]')).toHaveValue('Jane');
});

test('keeps one session report after the form closes and replaces it on a new fill', async ({
  page,
  context,
  extension,
}) => {
  // No details page needs to be open when the form completes or is edited.
  await extension.send('AUTOFILL_FILL', 'merge');
  await page.locator('[name="firstName"]').fill('Changed manually');
  await expect
    .poll(() =>
      extension.worker.evaluate(async () => {
        const cached = (await chrome.storage.session.get('jb:last-fill-details'))[
          'jb:last-fill-details'
        ] as { frames: { log: FrameFillLog }[] } | undefined;
        return cached?.frames.some((frame: { log: FrameFillLog }) =>
          frame.log.fields.some((field) => field.reason === 'manual_edit'),
        );
      }),
    )
    .toBe(true);
  await page.close();
  const options = await context.newPage();
  const optionsUrl = new URL('options.html', extension.worker.url()).href;
  await options.goto(optionsUrl);
  await options.getByRole('button', { name: 'Fill Details', exact: true }).click();
  await expect(
    options.getByText('This form is closed. Showing its last fill details.'),
  ).toBeVisible();
  await expect(options.getByRole('button', { name: 'Return to Form', exact: true })).toHaveCount(0);
  await options.getByRole('tab', { name: 'Fields', exact: true }).click();
  await expect(options.getByText('First name', { exact: true }).first()).toBeVisible();
  await options.reload();
  await expect(
    options.getByText('This form is closed. Showing its last fill details.'),
  ).toBeVisible();

  const nextForm = await context.newPage();
  await nextForm.goto('http://127.0.0.1/next-application');
  await nextForm.bringToFront();
  const nextId = await extension.worker.evaluate(
    async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id!,
  );
  const send = (action: string) =>
    extension.worker.evaluate(
      async ({ tabId, action }) => chrome.tabs.sendMessage(tabId, { action, mode: 'overwrite' }),
      { tabId: nextId, action },
    );
  await expect
    .poll(async () => {
      try {
        return Boolean(await send('AUTOFILL_SCAN'));
      } catch {
        return false;
      }
    })
    .toBe(true);
  await send('AUTOFILL_FILL');
  await options.bringToFront();
  await expect(
    options.getByText('This form is closed. Showing its last fill details.'),
  ).toHaveCount(0);
  await options.getByRole('button', { name: 'Return to Form', exact: true }).click();
  await expect
    .poll(() =>
      extension.worker.evaluate(
        async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id,
      ),
    )
    .toBe(nextId);
  const retained = await extension.worker.evaluate(
    async () => (await chrome.storage.session.get('jb:last-fill-details'))['jb:last-fill-details'],
  );
  expect((retained as { tabId: number }).tabId).toBe(nextId);
  expect((retained as { frames: unknown[] }).frames).toHaveLength(1);
});
