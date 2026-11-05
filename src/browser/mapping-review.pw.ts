import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import type { LearnedMappings } from '../types/storage';

const mappings: LearnedMappings = {
  'jobs.example.test': {
    salary: {
      path: 'salary.current.amount',
      count: 1,
      label: 'Expected salary',
      question: 'Expected salary',
    },
    salaryalias: {
      path: 'salary.current.amount',
      count: 2,
      label: 'Expected salary',
      question: 'Expected salary',
    },
    consent: {
      path: 'personal.firstName',
      count: 2,
      label: 'I agree to the privacy policy',
      question: 'I agree to the privacy policy',
    },
    unclear: {
      path: 'address.city',
      count: 1,
      label: 'Location preference',
      question: 'Location preference',
    },
    email: { path: 'personal.email', count: 1, label: 'Email', question: 'Email' },
    id88: { path: 'personal.lastName', count: 2 },
  },
  'other.example.test': {
    city: { path: 'address.city', count: 1, label: 'City', question: 'City' },
  },
};

async function open(options: Page) {
  await options.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
  await options.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  return options.getByRole('dialog', { name: 'Review Mappings' });
}

test('selects all sites by default and supports searchable multi-selection', async ({
  context,
  extension,
}, info) => {
  await extension.worker.evaluate(async (data) => {
    await chrome.storage.local.set({ learnedMappings: data, themePreference: 'dark' });
  }, mappings);
  const questions: string[][] = [];
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const prompt = route.request().postDataJSON().contents[0].parts[0].text as string;
    const payload = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
    questions.push(payload.mappings.map((item: { question: string }) => item.question));
    await route.fulfill({
      json: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify(
                    payload.mappings.map((item: { id: string }) => ({
                      id: item.id,
                      verdict: 'uncertain',
                      path: null,
                      reason: 'Review the saved field.',
                    })),
                  ),
                },
              ],
            },
          },
        ],
      },
    });
  });
  const options = await context.newPage();
  await options.setViewportSize({ width: 1200, height: 1000 });
  await options.goto(new URL('options.html', extension.worker.url()).href);
  const dialog = await open(options);
  const selector = dialog.getByLabel('Sites to review');
  const review = dialog.getByRole('button', { name: 'Review Mappings', exact: true });
  await expect(selector).toContainText('All sites (2)');
  await selector.click();
  const all = dialog.getByRole('checkbox', { name: 'All sites (2)' });
  const search = dialog.getByRole('searchbox', { name: 'Search sites' });
  const siteSelection = dialog.getByRole('group', { name: 'Site selection' });
  await expect(all).toBeChecked();
  await siteSelection.getByText('All sites (2)', { exact: true }).click();
  await expect(search).toBeVisible();
  await expect(all).not.toBeChecked();
  await expect(review).toBeDisabled();
  await search.fill('other');
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await siteSelection.getByText('other.example.test', { exact: true }).click();
  await expect(search).toHaveValue('other');
  await expect(
    dialog.getByRole('checkbox', { name: 'other.example.test', exact: true }),
  ).toBeChecked();
  await siteSelection.getByText('other.example.test', { exact: true }).click();
  await expect(
    dialog.getByRole('checkbox', { name: 'other.example.test', exact: true }),
  ).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: 'other.example.test', exact: true }).check();
  await expect(all).toBeChecked({ indeterminate: true });
  await search.fill('no-matching-site');
  await expect(dialog).toContainText('No sites found.');
  // Select all includes sites outside the search results.
  await all.check();
  await expect(selector).toContainText('All sites (2)');
  await search.fill('');
  await options.screenshot({ path: info.outputPath('site-selection-dark.png') });
  await options.setViewportSize({ width: 360, height: 740 });
  await options.screenshot({ path: info.outputPath('site-selection-narrow.png') });
  await search.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(selector).toBeFocused();
  await expect(dialog.getByRole('group', { name: 'Site selection' })).toHaveCount(0);
  await review.click();
  await expect(dialog).toContainText('Reviewed 6 of 6 mappings.');
  expect(questions[0]).toHaveLength(5);
  expect(questions[0]).toContain('City');
  const firstSite = dialog.getByRole('group', { name: 'Findings for jobs.example.test' });
  const secondSite = dialog.getByRole('group', { name: 'Findings for other.example.test' });
  await expect(
    firstSite.getByRole('heading', { name: 'jobs.example.test (5)', exact: true }),
  ).toBeVisible();
  await expect(firstSite.getByRole('region')).toHaveCount(5);
  await expect(
    secondSite.getByRole('heading', { name: 'other.example.test (1)', exact: true }),
  ).toBeVisible();
  const firstToggle = firstSite.getByRole('button', { name: 'jobs.example.test (5)' });
  const secondToggle = secondSite.getByRole('button', { name: 'other.example.test (1)' });
  await expect(firstToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(secondToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(secondSite.getByRole('region')).toHaveCount(0);
  await dialog.getByLabel('Action for Location preference').selectOption('inactive');
  await firstToggle.click();
  await expect(firstSite.getByRole('region')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Apply Changes (1)' })).toBeEnabled();
  await secondToggle.focus();
  await secondToggle.press('Space');
  await expect(secondSite.getByRole('region')).toHaveCount(1);
  await dialog.getByLabel('Action for City').selectOption('inactive');
  await expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
  await firstToggle.focus();
  await firstToggle.press('Enter');
  await expect(firstSite.getByLabel('Action for Location preference')).toHaveValue('inactive');
  await expect(secondToggle).toHaveAttribute('aria-expanded', 'true');
  await dialog.getByLabel('Action for City').selectOption('keep');
  await options.setViewportSize({ width: 1200, height: 1000 });
  await options.screenshot({ path: info.outputPath('mapping-sites-dark.png') });
  await options.setViewportSize({ width: 620, height: 800 });
  await options.screenshot({ path: info.outputPath('mapping-sites-narrow.png') });
  await dialog.getByLabel('Action for Location preference').selectOption('inactive');
  await expect(dialog.getByRole('button', { name: 'Apply Changes (1)' })).toBeEnabled();
  await selector.click();
  await all.uncheck();
  await dialog.getByRole('checkbox', { name: 'other.example.test', exact: true }).check();
  await search.press('Escape');
  await expect(dialog.getByRole('button', { name: 'Apply Changes', exact: true })).toBeDisabled();
  const onlyContext = dialog.getByRole('group', { name: 'Review status' });
  await expect(onlyContext.getByRole('button')).toHaveCount(1);
  await expect(onlyContext.getByRole('button', { name: 'Needs context (1)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.getByLabel('Action for City').selectOption('inactive');
  await dialog.getByRole('button', { name: 'Apply Changes (1)' }).click();
  await expect(dialog).toHaveCount(0);
  const saved = (await extension.worker.evaluate(
    async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
  )) as LearnedMappings;
  expect(saved['jobs.example.test']).toEqual(mappings['jobs.example.test']);
  expect(saved['other.example.test'].city).toMatchObject({ inactive: true });
});

test('requires Gemini setup and takes the user to the focused API key input', async ({
  context,
  extension,
}, info) => {
  await extension.worker.evaluate(async (data) => {
    await chrome.storage.local.set({ learnedMappings: data });
    await chrome.storage.local.remove(['geminiApiKey', 'geminiModel']);
  }, mappings);
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  const dialog = await open(options);
  await expect(dialog).toContainText('Add a Gemini API key to review learned mappings.');
  await expect(dialog.getByRole('button')).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Sites to review')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Apply Changes' })).toHaveCount(0);
  await options.screenshot({ path: info.outputPath('missing-key.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await options.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  await dialog.getByRole('button', { name: 'Go to Settings →' }).click();
  await expect(options.getByLabel('Gemini API Key', { exact: true })).toBeFocused();
});

test('preselects fresh and cached suggestions while preserving explicit choices', async ({
  context,
  extension,
}, info) => {
  await extension.worker.evaluate(async (data) => {
    await chrome.storage.local.set({ learnedMappings: data, themePreference: 'dark' });
  }, mappings);
  let requests = 0;
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    requests++;
    const prompt = route.request().postDataJSON().contents[0].parts[0].text as string;
    const payload = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
    expect(prompt).not.toContain('jane@example.test');
    expect(prompt).not.toContain('synthetic-browser-profile');
    expect(payload.fields).toContainEqual(
      expect.objectContaining({ path: 'personal.dateOfBirth' }),
    );
    expect(payload.mappings).toHaveLength(4);
    const results = payload.mappings.map((item: { id: string; question: string }) => ({
      id: item.id,
      verdict:
        item.question === 'Expected salary'
          ? 'change'
          : item.question.includes('privacy')
            ? 'inactive'
            : item.question === 'Email'
              ? 'correct'
              : 'uncertain',
      path: item.question === 'Expected salary' ? 'salary.expected.0.amount' : null,
      reason:
        item.question === 'Expected salary'
          ? 'This question asks for expected salary.'
          : 'Review this question against the saved field.',
    }));
    await route.fulfill({
      json: { candidates: [{ content: { parts: [{ text: JSON.stringify(results) }] } }] },
    });
  });
  const options = await context.newPage();
  await options.setViewportSize({ width: 1200, height: 1000 });
  await options.goto(new URL('options.html', extension.worker.url()).href);
  let dialog = await open(options);
  await dialog.getByLabel('Sites to review').click();
  await dialog.getByRole('checkbox', { name: 'All sites (2)' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'jobs.example.test', exact: true }).check();
  await dialog.getByRole('searchbox', { name: 'Search sites' }).press('Escape');
  await dialog.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  await expect(dialog).toContainText('Reviewed 5 of 5 mappings.');
  const statusFilters = dialog.getByRole('group', { name: 'Review status' });
  await expect(statusFilters.getByRole('button', { name: 'Better field (1)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(statusFilters.getByRole('button')).toHaveCount(3);
  await expect(statusFilters.getByRole('button', { name: /^All findings/ })).toHaveCount(0);
  await statusFilters.getByRole('button', { name: 'Better field (1)' }).click();
  await expect(dialog.getByRole('region')).toHaveCount(1);
  await expect(dialog.getByLabel('Action for Expected salary')).toBeVisible();
  await expect(dialog.getByRole('region').getByText('Better field', { exact: true })).toHaveCount(
    0,
  );
  await statusFilters.getByRole('button', { name: 'Needs context (2)' }).click();
  await expect(dialog.getByRole('region')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Use clear suggestions' })).toHaveCount(0);
  await expect(dialog.getByLabel('Action for Location preference')).toHaveValue('keep');
  await statusFilters.getByRole('button', { name: 'No suitable field (1)' }).click();
  await expect(dialog.getByRole('region')).toHaveCount(1);
  await expect(dialog.getByLabel('Action for I agree to the privacy policy')).toHaveValue(
    'inactive',
  );
  await statusFilters.getByRole('button', { name: 'Better field (1)' }).click();
  await expect(dialog.getByRole('region', { name: 'Review Email', exact: true })).toHaveCount(0);
  await expect(
    dialog.getByRole('region', { name: 'Review Expected salary', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Apply Changes (2)' })).toBeEnabled();
  expect(requests).toBe(1);
  const unchanged = await extension.worker.evaluate(
    async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
  );
  expect(unchanged).toEqual(mappings);
  await expect(dialog.getByLabel('Action for Expected salary')).toHaveValue('change');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await options.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  dialog = options.getByRole('dialog', { name: 'Review Mappings' });
  await expect(dialog).toContainText('Reviewed 5 of 6 mappings.');
  await expect(dialog.getByRole('button', { name: 'Apply Changes (2)' })).toBeEnabled();
  expect(requests).toBe(1);
  await dialog.getByLabel('Action for Expected salary').selectOption('keep');
  await expect(dialog.getByRole('button', { name: 'Apply Changes (1)' })).toBeEnabled();
  await statusFilters.getByRole('button', { name: 'No suitable field (1)' }).click();
  await dialog.getByLabel('Action for I agree to the privacy policy').selectOption('keep');
  await expect(dialog.getByRole('button', { name: 'Apply Changes', exact: true })).toBeDisabled();
  await statusFilters.getByRole('button', { name: 'Better field (1)' }).click();
  await expect(dialog.getByLabel('Action for Expected salary')).toHaveValue('keep');
  await dialog.getByLabel('Action for Expected salary').selectOption('change');
  await statusFilters.getByRole('button', { name: 'No suitable field (1)' }).click();
  await expect(dialog.getByLabel('Action for I agree to the privacy policy')).toHaveValue('keep');
  await dialog.getByLabel('Action for I agree to the privacy policy').selectOption('inactive');
  await expect(dialog.getByRole('button', { name: 'Apply Changes (2)' })).toBeEnabled();
  await statusFilters.getByRole('button', { name: 'Needs context (2)' }).click();
  await dialog.getByLabel('Action for Location preference').selectOption('change');
  await dialog.getByRole('button', { name: 'Profile field: Address → City' }).click();
  const chooser = options.getByRole('combobox', { name: 'Search profile fields' });
  await chooser.fill('Date of Birth');
  await expect(options.getByRole('option').filter({ hasText: 'Date of Birth' })).toContainText(
    'No saved value',
  );
  await chooser.press('Enter');
  await expect(
    dialog.getByRole('button', { name: /^Profile field: Personal.*Date of Birth/ }),
  ).toBeVisible();
  await dialog.getByLabel('Action for Location preference').selectOption('keep');
  await statusFilters.getByRole('button', { name: 'No suitable field (1)' }).click();
  await expect(dialog.getByLabel('Action for I agree to the privacy policy')).toHaveValue(
    'inactive',
  );
  await expect(dialog.getByRole('button', { name: 'Apply Changes (2)' })).toBeEnabled();
  await statusFilters.getByRole('button', { name: 'Better field (1)' }).click();
  await options.screenshot({ path: info.outputPath('mapping-review-dark.png') });
  await options.setViewportSize({ width: 620, height: 800 });
  await expect(dialog.getByLabel('Action for Expected salary')).toBeVisible();
  await options.screenshot({ path: info.outputPath('mapping-review-narrow.png') });
  await dialog.getByRole('button', { name: 'Apply Changes (2)' }).click();
  await expect(dialog).toHaveCount(0);
  const after = (await extension.worker.evaluate(
    async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
  )) as LearnedMappings;
  expect(after['jobs.example.test'].salary).toMatchObject({
    path: 'salary.expected.0.amount',
    count: 2,
    scope: 'entry',
  });
  expect(after['jobs.example.test'].salaryalias).toMatchObject({
    path: 'salary.expected.0.amount',
    count: 2,
  });
  expect(after['jobs.example.test'].consent).toMatchObject({ inactive: true, count: 2 });
  expect(after['jobs.example.test'].email).toMatchObject({ count: 1 });
  expect(after['other.example.test']).toEqual(mappings['other.example.test']);
  await options.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  dialog = options.getByRole('dialog', { name: 'Review Mappings' });
  await dialog.getByLabel('Sites to review').click();
  await dialog.getByRole('checkbox', { name: 'All sites (2)' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'jobs.example.test', exact: true }).check();
  await dialog.getByRole('searchbox', { name: 'Search sites' }).press('Escape');
  await expect(dialog).toContainText('Reviewed 3 of 5 mappings.');
  await expect(
    dialog.getByRole('region', { name: 'Review I agree to the privacy policy' }),
  ).toHaveCount(0);
  expect(requests).toBe(1);
  await extension.worker.evaluate(async () =>
    chrome.storage.local.remove(['geminiApiKey', 'geminiModel']),
  );
  await expect(dialog).toContainText('Add a Gemini API key to review learned mappings.');
  await expect(dialog.getByRole('button')).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Review results' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Go to Settings →' }).click();
  await expect(options.getByLabel('Gemini API Key', { exact: true })).toBeFocused();
});

test('retains completed batches when stopped and starts a fresh review on every click', async ({
  context,
  extension,
}) => {
  const many = Object.fromEntries(
    Array.from({ length: 25 }, (_, index) => [
      `q${index}`,
      {
        path: 'personal.email',
        count: 1,
        label: `Email address ${index}`,
        question: `Email address ${index}`,
      },
    ]),
  );
  await extension.worker.evaluate(
    async (data) => chrome.storage.local.set({ learnedMappings: { 'batch.test': data } }),
    many,
  );
  let calls = 0;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    calls++;
    const prompt = route.request().postDataJSON().contents[0].parts[0].text as string;
    const payload = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
    if (calls === 2) await held;
    const answers = payload.mappings.map((item: { id: string }) => ({
      id: item.id,
      verdict: 'correct',
      path: null,
      reason: 'The email field matches.',
    }));
    await route
      .fulfill({
        json: { candidates: [{ content: { parts: [{ text: JSON.stringify(answers) }] } }] },
      })
      .catch(() => {});
  });
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  const dialog = await open(options);
  await dialog.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await dialog.getByRole('button', { name: 'Stop review' }).click();
  await expect(dialog).toContainText('Reviewed 20 of 25 mappings.');
  release();
  await dialog.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  await expect(dialog).toContainText('Reviewed 25 of 25 mappings.');
  await expect(dialog).toContainText('No changes suggested for the reviewed mappings.');
  await expect(dialog.getByRole('region')).toHaveCount(0);
  expect(calls).toBe(4);
  await expect(dialog.getByRole('checkbox', { name: 'Review all again' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Review Mappings', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  await expect.poll(() => calls).toBe(6);
  await expect(dialog).toContainText('Reviewed 25 of 25 mappings.');
});

test('keeps site tabs independent while paginating and saving collapsed choices', async ({
  context,
  extension,
}) => {
  const many = Object.fromEntries(
    Array.from({ length: 21 }, (_, index) => [
      `q${index}`,
      {
        path: 'personal.email',
        count: 1,
        label: `Email address ${index}`,
        question: `Email address ${index}`,
      },
    ]),
  );
  await extension.worker.evaluate(async (data) => {
    await chrome.storage.local.set({
      learnedMappings: {
        'batch.test': {
          ...data,
          country: { path: 'address.city', count: 1, label: 'Country', question: 'Country' },
        },
        'other.test': {
          city: { path: 'address.city', count: 1, label: 'City', question: 'City' },
          consent: {
            path: 'personal.firstName',
            count: 2,
            label: 'I agree to the privacy policy',
            question: 'I agree to the privacy policy',
          },
        },
      },
    });
  }, many);
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const prompt = route.request().postDataJSON().contents[0].parts[0].text as string;
    const payload = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
    const answers = payload.mappings.map((item: { id: string; question: string }) => ({
      id: item.id,
      verdict:
        item.question === 'Country'
          ? 'change'
          : item.question.includes('privacy')
            ? 'inactive'
            : 'uncertain',
      path: item.question === 'Country' ? 'address.countryName' : null,
      reason: 'Review the saved field.',
    }));
    await route.fulfill({
      json: { candidates: [{ content: { parts: [{ text: JSON.stringify(answers) }] } }] },
    });
  });
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  const dialog = await open(options);
  await dialog.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  await expect(dialog).toContainText('Reviewed 24 of 24 mappings.');
  const firstSite = dialog.getByRole('group', { name: 'Findings for batch.test' });
  const secondSite = dialog.getByRole('group', { name: 'Findings for other.test' });
  await expect(firstSite.getByRole('button', { name: 'batch.test (22)' })).toBeVisible();
  const firstTabs = firstSite.getByRole('group', { name: 'Review status' });
  await expect(firstTabs.getByRole('button', { name: 'Better field (1)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(firstSite.getByLabel('Action for Country')).toHaveValue('change');
  await expect(dialog.getByRole('button', { name: 'Apply Changes (2)' })).toBeEnabled();
  await firstTabs.getByRole('button', { name: 'Needs context (21)' }).click();
  await expect(firstSite.getByRole('region')).toHaveCount(20);
  await expect(secondSite.getByRole('button', { name: 'other.test (2)' })).toBeVisible();
  await expect(secondSite.getByRole('region')).toHaveCount(0);
  await firstSite.getByRole('button', { name: 'Show 1 more' }).click();
  await expect(firstSite.getByRole('region')).toHaveCount(21);
  await firstSite.getByRole('region').first().getByRole('combobox').selectOption('inactive');
  await secondSite.getByRole('button', { name: 'other.test (2)' }).click();
  const secondTabs = secondSite.getByRole('group', { name: 'Review status' });
  await expect(secondTabs.getByRole('button', { name: 'Needs context (1)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(secondTabs.getByRole('button', { name: 'Better field (1)' })).toHaveCount(0);
  await secondTabs.getByRole('button', { name: 'No suitable field (1)' }).click();
  await expect(secondSite.getByLabel('Action for I agree to the privacy policy')).toHaveValue(
    'inactive',
  );
  await expect(firstTabs.getByRole('button', { name: 'Needs context (21)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(firstSite.getByRole('region')).toHaveCount(21);
  await firstSite.getByRole('button', { name: 'batch.test (22)' }).click();
  await secondSite.getByRole('button', { name: 'other.test (2)' }).click();
  await expect(dialog.getByRole('region')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Apply Changes (3)' }).click();
  await expect(dialog).toHaveCount(0);
  const saved = (await extension.worker.evaluate(
    async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
  )) as LearnedMappings;
  expect(
    Object.values(saved['batch.test']).filter((item) => typeof item !== 'string' && item.inactive),
  ).toHaveLength(1);
  expect(saved['batch.test'].country).toMatchObject({ path: 'address.countryName', count: 2 });
  expect(saved['other.test'].consent).toMatchObject({ inactive: true });
  expect(saved['other.test'].city).toMatchObject({ path: 'address.city', count: 1 });
});

test('blocks stale review decisions after profile or mapping edits', async ({
  context,
  extension,
}) => {
  await extension.worker.evaluate(
    async (data) => chrome.storage.local.set({ learnedMappings: data }),
    mappings,
  );
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  const dialog = await open(options);
  await expect(dialog.getByLabel('Sites to review')).toBeEnabled();
  await extension.worker.evaluate(async () => chrome.storage.local.set({ learnedMappings: {} }));
  await expect(dialog.getByRole('alert')).toContainText('Your profile or mappings changed.');
  await expect(dialog.getByRole('button', { name: 'Review Mappings', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Apply Changes', exact: true })).toBeDisabled();
});
