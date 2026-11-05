import { test, expect } from './fixtures';
import { summarizeFillFields } from '../autofill/fillLog';
import type { FrameFillLog } from '../autofill/fillLog';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';
import type { AIFieldPayload } from '../resume-ai/types';

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
  const sourceLink = logPage.getByRole('link', { name: /127\.0\.0\.1.*application/ });
  await expect(sourceLink).toHaveAttribute('href', page.url());
  await expect(sourceLink).toHaveAttribute('title', page.url());
  await expect(sourceLink).toHaveAttribute('target', '_blank');
  await expect(sourceLink).not.toContainText('http://');
  await expect(logPage.getByText(/AI assistance was unavailable for part or all/)).toBeVisible();
  const detected = logPage.getByText('Detected', { exact: true }).locator('..');
  await expect(detected).toContainText(String(counts.detected));
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-overview-light.png'),
    animations: 'disabled',
    fullPage: false,
  });
  await logPage.emulateMedia({ colorScheme: 'dark' });
  await expect(logPage.locator('html')).toHaveClass(/dark/);
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-overview-dark.png'),
    animations: 'disabled',
    fullPage: false,
  });
  const outcomeHelp = logPage.getByRole('button', { name: 'How Fill Details works' });
  await outcomeHelp.hover();
  await expect(logPage.getByRole('tooltip')).toContainText(
    'Autofill tries learned mappings → rules → AI and stops after a high-confidence fill.',
  );
  await expect(logPage.getByRole('tooltip')).toContainText(
    'Consent questions and other excluded fields are left for you.',
  );
  await logPage.screenshot({ path: testInfo.outputPath('fill-log-filter-help-dark.png') });
  await logPage.keyboard.press('Escape');
  await expect(logPage.getByRole('tooltip')).toHaveCount(0);
  await outcomeHelp.focus();
  await expect(logPage.getByRole('tooltip')).toBeVisible();
  await outcomeHelp.click();
  await expect(logPage.getByRole('tooltip')).toBeVisible();
  await outcomeHelp.click();
  await expect(logPage.getByRole('tooltip')).toHaveCount(0);
  await expect(
    logPage.getByRole('button', { name: `Detected (${counts.detected})`, exact: true }),
  ).toBeVisible();
  await expect(
    logPage.getByRole('button', { name: `Kept current (${counts.kept})`, exact: true }),
  ).toBeVisible();
  const ruleChecks = fields.filter((field) => field.rule.ran === true).length;
  expect(ruleChecks).toBeGreaterThan(0);
  const checkedChip = logPage.getByRole('button', {
    name: `Checked by rules (${ruleChecks})`,
    exact: true,
  });
  await checkedChip.click();
  await expect(logPage.locator('summary')).toHaveCount(ruleChecks);
  await expect(checkedChip).toHaveAttribute('aria-pressed', 'true');
  await checkedChip.click();
  await expect(logPage.locator('summary')).toHaveCount(counts.detected);
  // Outcomes scope the refinements; counts at the top stay global.
  await logPage.getByRole('button', { name: `Filled (${counts.filled})`, exact: true }).click();
  await expect(logPage.getByRole('button', { name: 'Red (0)', exact: true })).toBeDisabled();
  await expect(logPage.getByRole('button', { name: 'Gray (0)', exact: true })).toBeDisabled();
  await expect(
    logPage.getByRole('button', { name: `Rules (${counts.finalRuleFilled})`, exact: true }),
  ).toBeEnabled();
  await logPage
    .getByRole('button', { name: `Rules (${counts.finalRuleFilled})`, exact: true })
    .click();
  await expect(logPage.locator('summary')).toHaveCount(counts.finalRuleFilled);
  await expect(
    logPage.getByRole('button', { name: `Filled (${counts.filled})`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    logPage.getByRole('button', { name: `Detected (${counts.detected})`, exact: true }),
  ).toBeVisible();
  await logPage
    .getByRole('button', { name: `Not filled (${counts.notFilled})`, exact: true })
    .click();
  await expect(logPage.getByRole('button', { name: 'Rules (0)', exact: true })).toBeDisabled();
  await expect(logPage.getByRole('button', { name: 'Rules (0)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(logPage.locator('summary')).toHaveCount(counts.notFilled);
  const sentUnfilled = fields.filter(
    (field) =>
      ['not_matched', 'missing_data', 'failed'].includes(field.outcome) &&
      field.ai.outcome !== 'not_sent',
  ).length;
  expect(sentUnfilled).toBeGreaterThan(0);
  await logPage.getByRole('button', { name: `Sent to AI (${sentUnfilled})`, exact: true }).click();
  await expect(logPage.locator('summary')).toHaveCount(sentUnfilled);
  await expect(
    logPage.getByRole('button', { name: `Not filled (${counts.notFilled})`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-filtered-dark.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await logPage.getByRole('button', { name: `Detected (${counts.detected})`, exact: true }).click();
  await expect(logPage.locator('summary')).toHaveCount(counts.detected);
  await expect(logPage.getByRole('button', { name: /^All \(/ })).toHaveCount(0);
  await logPage.locator('summary').first().click();
  const rulePanel = logPage
    .locator('details')
    .first()
    .getByRole('region', { name: 'Rules stage details' });
  const methodRow = rulePanel.getByText('Method', { exact: true }).locator('..');
  const scoreRow = rulePanel.getByText('Match score', { exact: true }).locator('..');
  const methodBox = await methodRow.boundingBox();
  const scoreBox = await scoreRow.boundingBox();
  const resultBox = await rulePanel
    .getByText('Result', { exact: true })
    .locator('..')
    .boundingBox();
  expect(Math.abs(resultBox!.y - scoreBox!.y)).toBeLessThanOrEqual(1);
  expect(scoreBox!.x).toBeGreaterThan(methodBox!.x + methodBox!.width);
  const pathBox = await rulePanel
    .getByText('Profile field', { exact: true })
    .locator('..')
    .boundingBox();
  expect(Math.abs(methodBox!.y - pathBox!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(pathBox!.width - methodBox!.width)).toBeLessThanOrEqual(1);
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-fields-dark.png'),
    animations: 'disabled',
    fullPage: false,
  });
  await logPage
    .locator('details')
    .first()
    .screenshot({
      path: testInfo.outputPath('fill-log-stage-details-dark.png'),
      animations: 'disabled',
    });
  await logPage.setViewportSize({ width: 375, height: 812 });
  const narrowMethod = await methodRow.boundingBox();
  const narrowScore = await scoreRow.boundingBox();
  expect(narrowScore!.y).toBeGreaterThan(narrowMethod!.y);
  await expect
    .poll(() => logPage.locator('aside').evaluate((el) => el.getBoundingClientRect().width))
    .toBe(64);
  expect(await logPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  expect(await logPage.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await logPage
    .getByRole('heading', { name: 'Fill Details', exact: true })
    .scrollIntoViewIfNeeded();
  await logPage.screenshot({
    path: testInfo.outputPath('fill-log-narrow.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await outcomeHelp.click();
  const helpBox = await logPage.getByRole('tooltip').boundingBox();
  expect(helpBox!.x).toBeGreaterThanOrEqual(64);
  expect(helpBox!.x + helpBox!.width).toBeLessThanOrEqual(375);
  await logPage.screenshot({ path: testInfo.outputPath('fill-log-filter-help-narrow.png') });
  await logPage.keyboard.press('Escape');

  await logPage
    .locator('details')
    .first()
    .screenshot({
      path: testInfo.outputPath('fill-log-stage-details-narrow.png'),
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
  const clearedRow = logPage
    .locator('details')
    .filter({ hasText: 'You cleared this answer.' })
    .first();
  await expect(clearedRow.locator('summary')).not.toContainText('You cleared this answer.');
  if ((await clearedRow.getAttribute('open')) === null) {
    await clearedRow.locator('summary').click();
  }
  await expect(
    logPage.getByText('You cleared this answer.', { exact: true }).first(),
  ).toBeVisible();
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
  await expect(logPage.getByText(/These fills were undone/)).toBeVisible();
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
  await expect(
    logPage.getByRole('button', { name: `Filled (${count})`, exact: true }),
  ).toBeVisible();
  await logPage.screenshot({ path: testInfo.outputPath('sandbox-fill-log.png'), fullPage: false });

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
  ).toBeVisible();
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
  await expect(options.locator('summary').filter({ hasText: 'First name' }).first()).toBeVisible();
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

test('an open empty report populates automatically and explicit actions select the form', async ({
  page,
  context,
  extension,
}, testInfo) => {
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await options.getByRole('button', { name: 'Fill Details', exact: true }).click();
  await expect(options.getByText('No fill details yet')).toBeVisible();
  await page.bringToFront();
  await extension.send('AUTOFILL_FILL', 'merge');
  await options.bringToFront();
  await expect(options.getByRole('button', { name: /^Detected \(/ })).toBeVisible();
  await expect(options.getByRole('tab')).toHaveCount(0);
  await expect(
    options.getByRole('link', { name: '127.0.0.1/application (opens in a new tab)', exact: true }),
  ).toBeVisible();
  const firstRow = options.locator('summary').filter({ hasText: 'First name' }).first();
  await expect(firstRow.locator('.sr-only')).toHaveText(' required');
  await firstRow.focus();
  await options.keyboard.press('Enter');
  await expect(firstRow.locator('..').getByRole('list', { name: 'Matching stages' })).toBeVisible();
  await expect(options.getByText('Control', { exact: true })).toHaveCount(0);

  const b = await context.newPage();
  await b.goto('http://127.0.0.1/application-b');
  await b.evaluate(() => {
    document.body.innerHTML =
      '<form><h1>Job application B</h1><label>First name<input name="firstName" autocomplete="given-name" required></label><label>LinkedIn<input name="linkedin"></label></form>';
  });
  await b.bringToFront();
  const bId = await extension.worker.evaluate(
    async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id!,
  );
  const sendB = (action: string) =>
    extension.worker.evaluate(
      async ({ tabId, action }) => chrome.tabs.sendMessage(tabId, { action, mode: 'overwrite' }),
      { tabId: bId, action },
    );
  await expect
    .poll(async () => {
      try {
        return Boolean(await sendB('AUTOFILL_SCAN'));
      } catch {
        return false;
      }
    })
    .toBe(true);
  await sendB('AUTOFILL_FILL');
  await options.bringToFront();
  await expect(
    options.getByRole('link', {
      name: '127.0.0.1/application-b (opens in a new tab)',
      exact: true,
    }),
  ).toBeVisible();
  await expect(options.getByRole('button', { name: 'Detected (2)', exact: true })).toBeVisible();
  await expect(options.getByRole('button', { name: 'Gray (1)', exact: true })).toBeVisible();

  // A manual edit in the older form does not replace the selected B report.
  await page.locator('[name="firstName"]').fill('Changed in A');
  await options.bringToFront();
  await expect(
    options.getByRole('link', {
      name: '127.0.0.1/application-b (opens in a new tab)',
      exact: true,
    }),
  ).toBeVisible();

  // View details is an explicit selection of A, with no rescan or fill.
  const popup = await context.newPage();
  await popup.addInitScript((id) => {
    chrome.tabs.query = async () => [{ id } as chrome.tabs.Tab];
  }, extension.sourceTabId);
  await popup.goto(new URL('popup.html', extension.worker.url()).href);
  await popup.getByRole('button', { name: 'View details', exact: true }).click();
  await expect(
    options.getByRole('link', { name: '127.0.0.1/application (opens in a new tab)', exact: true }),
  ).toBeVisible();
  await expect(options.getByText('Confirmed by you').first()).toBeVisible();
  await expect(options.getByText(/^Modified/)).toBeVisible();

  // A new autofill on B becomes the selected report again.
  await sendB('AUTOFILL_SCAN');
  await sendB('AUTOFILL_FILL');
  await options.bringToFront();
  await expect(
    options.getByRole('link', {
      name: '127.0.0.1/application-b (opens in a new tab)',
      exact: true,
    }),
  ).toBeVisible();
  await options.emulateMedia({ colorScheme: 'dark' });
  await expect(options.locator('html')).toHaveClass(/dark/);
  await options.screenshot({
    path: testInfo.outputPath('single-report-dark.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await options.getByRole('button', { name: 'Return to Form', exact: true }).click();
  await expect
    .poll(() =>
      extension.worker.evaluate(
        async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id,
      ),
    )
    .toBe(bId);
});

test('records real LM, rule and AI decisions and browses them without another fill', async ({
  page,
  context,
  extension,
}, testInfo) => {
  const profile = structuredClone(RULE_PROFILE);
  profile.personal.nickname = '';
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({
      profile,
      learnedMappings: {
        '127.0.0.1': {
          fullname: { path: 'derived.fullName', count: 2 },
          firstname: { path: 'personal.firstName', count: 1 },
          lastname: { path: 'personal.lastName', count: 2, inactive: true },
          screenname: { path: 'personal.nickname', count: 2 },
        },
      },
    });
  }, profile);
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><h1>Job application</h1><label>Full name<input name="fullName"></label><label>First name<input name="firstName"></label><label>First nme<input name="typo"></label><label>Last name<input name="lastName"></label><label>Screen name<input name="screenName"></label></form>';
  });
  let aiRequests = 0;
  await context.route('https://generativelanguage.googleapis.com/**', (route) => {
    aiRequests++;
    const prompt = route.request().postDataJSON().contents[0].parts[0].text as string;
    const { fields } = JSON.parse(prompt.slice(prompt.lastIndexOf('\n\n{') + 2)) as {
      fields: AIFieldPayload[];
    };
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify(
                    fields.map((field) => ({
                      fieldId: field.fieldId,
                      profilePath:
                        field.label === 'Screen name' ? 'personal.nickname' : 'personal.firstName',
                      confidence: 'high',
                    })),
                  ),
                },
              ],
            },
          },
        ],
      }),
    });
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('[name="fullName"]')).toHaveValue('Alex Sample');
  await expect(page.locator('[name="firstName"]')).toHaveValue('Alex');
  await expect(page.locator('[name="typo"]')).toHaveValue('Alex');
  await expect(page.locator('[name="screenName"]')).toHaveValue('');
  const logs = (await extension.send('GET_FILL_LOG')) as unknown as FrameFillLog[];
  const fields = logs.flatMap((log) => log.fields);
  expect(fields.find((field) => field.label === 'Full name')).toMatchObject({
    learned: { status: 'trusted', confirmations: 2 },
    rule: { ran: false, layer: 'learned', outcome: 'filled' },
    ai: { outcome: 'not_sent' },
  });
  expect(fields.find((field) => field.label === 'First name')).toMatchObject({
    learned: { status: 'unconfirmed', confirmations: 1 },
    rule: { ran: true, layer: 'dictionary_exact', matchConfidence: 0.85 },
  });
  expect(fields.find((field) => field.label === 'Last name')).toMatchObject({
    learned: { status: 'inactive' },
    rule: { ran: true },
  });
  const refined = fields.find((field) => field.label === 'First nme')!;
  expect(refined).toMatchObject({
    learned: { status: 'no_match' },
    rule: { ran: true, outcome: 'filled', layer: 'fuzzy', profilePath: 'personal.firstName' },
    ai: { outcome: 'refined', confidence: 'high', profilePath: 'personal.firstName' },
    source: 'ai',
  });
  expect(refined.rule.matchConfidence).toBeLessThan(0.85);
  expect(fields.find((field) => field.label === 'Screen name')).toMatchObject({
    learned: { status: 'trusted' },
    rule: { ran: false, outcome: 'missing_data' },
    ai: { outcome: 'missing_data' },
  });

  const details = await context.newPage();
  await details.goto(new URL('options.html', extension.worker.url()).href);
  await details.getByRole('button', { name: 'Fill Details', exact: true }).click();
  const row = details
    .locator('details')
    .filter({ has: details.locator('summary', { hasText: 'First nme' }) });
  await row.locator('summary').click();
  await expect(row.getByRole('region', { name: 'AI stage details' })).toBeVisible();
  await row.getByRole('button', { name: 'Rules: Matched and filled' }).click();
  await expect(row.getByText('Similar field label', { exact: true })).toBeVisible();
  await expect(
    row.getByText(`${Math.round(refined.rule.matchConfidence! * 100)}%`, { exact: true }),
  ).toBeVisible();
  const requestsBefore = aiRequests;
  await row.getByRole('button', { name: 'Learned mappings: No usable mapping' }).click();
  await expect(row.getByRole('region', { name: 'Learned mappings stage details' })).toBeVisible();
  await row.getByRole('button', { name: 'AI: Refined the earlier fill' }).click();
  await expect(page.locator('[name="typo"]')).toHaveValue('Alex');
  expect(aiRequests).toBe(requestsBefore);
  await details.emulateMedia({ colorScheme: 'dark' });
  await row.screenshot({
    path: testInfo.outputPath('stage-navigation-dark.png'),
    animations: 'disabled',
  });
  await details.setViewportSize({ width: 375, height: 812 });
  await expect
    .poll(() =>
      details.locator('aside').evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(64);
  expect(
    await details.locator('main').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await row.screenshot({
    path: testInfo.outputPath('stage-navigation-narrow.png'),
    animations: 'disabled',
  });
  // The stage snapshot survives closing the source form.
  await page.close();
  await details.reload();
  await expect(
    details.getByText('This form is closed. Showing its last fill details.'),
  ).toBeVisible();
  const retained = await extension.worker.evaluate(
    async () => (await chrome.storage.session.get('jb:last-fill-details'))['jb:last-fill-details'],
  );
  expect(JSON.stringify(retained)).toContain('unconfirmed');
  expect(JSON.stringify(retained)).not.toContain('alex@example.test');
});
