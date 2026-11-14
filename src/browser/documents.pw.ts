import { readFile } from 'node:fs/promises';
import { test, expect, stubEmptyGemini } from './fixtures';
import { sampleResumeText } from '../testing/sampleResume';
import type { Profile } from '../types/profile';

test('uploads a file-only portfolio when the CV has no attachment and keeps URLs empty', async ({
  page,
  context,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const stored = await chrome.storage.local.get('profile');
    const profile = stored.profile as Profile;
    await chrome.storage.local.set({
      profile: {
        ...profile,
        documents: {
          cv: {},
          portfolio: { file: { name: 'portfolio.pdf', size: 3, base64: 'data:application/pdf;base64,YWJj' } },
        },
      },
    });
  });
  await page.evaluate(() => {
    document.body.innerHTML =
      '<h1>Job application</h1><form><label>Portfolio URL<input id="url" type="url"></label><label>Portfolio<input id="portfolio" type="file" accept=".pdf"></label><label>Resume<input id="resume" type="file" accept=".pdf"></label></form>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#url')).toHaveValue('');
  expect(
    await page
      .locator('#portfolio')
      .evaluate((input) => (input as HTMLInputElement).files?.[0]?.name),
  ).toBe('portfolio.pdf');
  expect(
    await page.locator('#resume').evaluate((input) => (input as HTMLInputElement).files?.length),
  ).toBe(0);
});

test('migrates a portfolio and keeps its URL and PDF through export, import and reset', async ({
  context,
  extension,
}) => {
  await extension.worker.evaluate(async () => {
    const stored = await chrome.storage.local.get('profile');
    const profile = stored.profile as Profile;
    await chrome.storage.local.set({
      profile: {
        ...profile,
        links: { ...profile.links, portfolio: 'https://example.test/portfolio' },
      },
      learnedMappings: { 'jobs.example': { portfolio: { path: 'links.portfolio', count: 2 } } },
    });
  });
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await options.getByRole('button', { name: 'Links', exact: true }).click();
  await expect(options.locator('#field-portfolio')).toHaveCount(0);
  await options.getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(options.locator('#field-portfolio')).toHaveValue('https://example.test/portfolio');
  const pdf = Buffer.from(sampleResumeText(['Jane Doe - Portfolio', 'Selected project work']));
  await options.getByLabel('Upload Portfolio', { exact: true }).setInputFiles({
    name: 'portfolio.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await expect(options.getByText('portfolio.pdf', { exact: true })).toBeVisible();
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => {
      const data = await extension.worker.evaluate(() => chrome.storage.local.get('profile'));
      return (data.profile as Profile).documents.portfolio?.file?.name;
    })
    .toBe('portfolio.pdf');
  await options.getByRole('button', { name: 'Settings', exact: true }).click();
  const download = options.waitForEvent('download');
  await options.getByRole('button', { name: 'Download File', exact: true }).click();
  const exportedFile = await (await download).path();
  if (!exportedFile) throw new Error('Missing profile export');
  const exported = JSON.parse(await readFile(exportedFile, 'utf8'));
  expect(exported.profile.documents.portfolio).toEqual({
    url: 'https://example.test/portfolio',
    file: {
      name: 'portfolio.pdf',
      size: pdf.length,
      base64: `data:application/pdf;base64,${pdf.toString('base64')}`,
    },
  });
  expect(exported.profile.links).not.toHaveProperty('portfolio');
  expect(exported.learnedMappings['jobs.example'].portfolio.path).toBe('documents.portfolio.url');
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({ profile: { id: 'empty-import' }, learnedMappings: {} }),
  );
  await options.reload();
  await options.locator('input[accept=".json"]').setInputFiles(exportedFile);
  await expect
    .poll(async () => {
      const stored = await extension.worker.evaluate(() => chrome.storage.local.get('profile'));
      return (stored.profile as Profile | undefined)?.documents?.portfolio;
    })
    .toEqual(exported.profile.documents.portfolio);
  await options.getByRole('button', { name: 'Reset Now', exact: true }).click();
  const reset = options.getByRole('dialog', { name: 'Reset All Data', exact: true });
  await reset.getByPlaceholder('DELETE', { exact: true }).fill('DELETE');
  await reset.getByRole('button', { name: 'Reset All Data', exact: true }).click();
  await expect
    .poll(() => extension.worker.evaluate(() => chrome.storage.local.get('profile')))
    .not.toHaveProperty('profile');
});

test('fills portfolio links and the correct document files, preserves existing files and supports Undo', async ({
  page,
  context,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const stored = await chrome.storage.local.get('profile');
    const profile = stored.profile as Profile;
    const file = (name: string) => ({ name, size: 3, base64: 'data:application/pdf;base64,YWJj' });
    await chrome.storage.local.set({
      profile: {
        ...profile,
        documents: {
          cv: { file: file('resume.pdf') },
          portfolio: { url: 'https://example.test/portfolio', file: file('portfolio.pdf') },
          coverLetter: { file: file('cover-letter.pdf') },
        },
      },
    });
  });
  await page.evaluate(() => {
    document.body.innerHTML =
      '<h1>Job application</h1><form><label>Portfolio URL<input id="url" type="url"></label><label>Portfolio<input id="portfolio" type="file" accept=".pdf"></label><label>Resume<input id="resume" type="file" accept=".pdf"></label><label>Cover letter<input id="letter" type="file" accept=".pdf"></label></form>';
  });
  await page.locator('#resume').setInputFiles({
    name: 'existing.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('old'),
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('#url')).toHaveValue('https://example.test/portfolio');
  const filenames = () =>
    page
      .locator('input[type=file]')
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).files?.[0]?.name ?? ''),
      );
  await expect.poll(filenames).toEqual(['portfolio.pdf', 'existing.pdf', 'cover-letter.pdf']);
  await extension.send('CLEAR');
  await expect.poll(filenames).toEqual(['', 'existing.pdf', '']);
  await expect(page.locator('#url')).toHaveValue('');
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect.poll(filenames).toEqual(['portfolio.pdf', 'resume.pdf', 'cover-letter.pdf']);
  await extension.send('CLEAR');
  await expect.poll(filenames).toEqual(['', 'existing.pdf', '']);
});
