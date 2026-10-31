import { test, expect } from './fixtures';
import { summarizeFillFields } from '../autofill/fillLog';
import type { FrameFillLog } from '../autofill/fillLog';

test('the production Fill Log combines frames, reports real outcomes, tracks edits and identifies Undo', async ({
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
  await expect(logPage.getByRole('heading', { name: 'Fill Log', exact: true })).toBeVisible();
  await expect(logPage.getByText(/AI assistance was unavailable for part or all/)).toBeVisible();
  const detected = logPage.getByText('Detected', { exact: true }).locator('..');
  await expect(detected).toContainText(String(counts.detected));
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-overview-light.png'),
    fullPage: true,
  });
  await logPage.emulateMedia({ colorScheme: 'dark' });
  await expect(logPage.locator('html')).toHaveClass(/dark/);
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-overview-dark.png'),
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
    fullPage: true,
  });
  await logPage.setViewportSize({ width: 375, height: 812 });
  expect(await logPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await logPage.screenshot({ path: testInfo.outputPath('fill-log-narrow.png'), fullPage: true });

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
  expect(
    await popup.locator('#root').evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(600);
  await popup.locator('#root').screenshot({ path: testInfo.outputPath('popup-results-light.png') });
  await popup.emulateMedia({ colorScheme: 'dark' });
  await expect(popup.locator('html')).toHaveClass(/dark/);
  await popup.locator('#root').screenshot({ path: testInfo.outputPath('popup-results-dark.png') });
  const opened = context.waitForEvent('page');
  await popup.getByRole('button', { name: 'View Fill Log →' }).click();
  const openedLog = await opened;
  await expect(openedLog).toHaveURL(
    `${new URL('fill-log.html', extension.worker.url()).href}?tabId=${sourceId}`,
  );
  await openedLog.close();
  await popup.close();

  // A manual clear must stop counting as a filled value in both consumers.
  await page.locator('[name="firstName"]').fill('');
  await logPage.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(logPage.getByText('Cleared manually', { exact: true }).first()).toBeVisible();
  const edited = (await extension.send('GET_FILL_LOG')) as unknown as FrameFillLog[];
  expect(summarizeFillFields(edited.flatMap((log) => log.fields)).filled).toBe(counts.filled - 1);
  const status = await extension.send('GET_STATUS');
  expect(status.reduce((sum, result) => sum + Number(result.noReview), 0)).toBe(
    counts.highConfidence - 1,
  );

  await extension.send('CLEAR');
  await logPage.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(logPage.getByText(/These fills were undone/)).toBeVisible();
  await expect(page.locator('[name="lastName"]')).toHaveValue('Existing answer');
  await logPage.getByRole('button', { name: 'Back to Form', exact: true }).click();
  await expect
    .poll(async () =>
      extension.worker.evaluate(async () => {
        return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      }),
    )
    .toBe(sourceId);

  await page.reload();
  await logPage.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(logPage.getByText(/No completed fill log is available/)).toBeVisible();
});
